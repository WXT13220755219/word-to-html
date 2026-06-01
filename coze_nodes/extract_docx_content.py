import base64
import json
import posixpath
import re
import zipfile
from io import BytesIO
from urllib.parse import unquote, urlparse
import xml.etree.ElementTree as ET

try:
    import requests_async as requests
except Exception:  # Local syntax checks may not have Coze's async requests module.
    requests = None


NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "v": "urn:schemas-microsoft-com:vml",
}

MIME_BY_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".emf": "image/emf",
    ".wmf": "image/wmf",
}


def _params(args):
    if hasattr(args, "params"):
        return args.params or {}
    if isinstance(args, dict):
        return args.get("params", args) or {}
    return {}


def _local_name(tag):
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _attr(el, namespace_key, name):
    return el.attrib.get("{" + NS[namespace_key] + "}" + name)


def _first_file(value):
    if isinstance(value, list):
        return _first_file(value[0]) if value else None
    if isinstance(value, dict):
        for key in ("file", "docx_file", "attachment"):
            if key in value:
                nested = _first_file(value[key])
                if nested is not None:
                    return nested
    return value


def _extract_url(value):
    value = _first_file(value)
    if isinstance(value, str) and value.startswith(("http://", "https://")):
        return value
    if isinstance(value, dict):
        for key in ("url", "file_url", "download_url", "content_url", "uri"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.startswith(("http://", "https://")):
                return candidate
    return ""


def _extract_base64(value):
    value = _first_file(value)
    if isinstance(value, dict):
        for key in ("base64", "docx_base64", "content_base64"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate:
                return candidate
    if isinstance(value, str) and value.startswith("data:"):
        return value.split(",", 1)[-1] if "," in value else ""
    if isinstance(value, str) and not value.startswith(("http://", "https://")):
        cleaned = re.sub(r"\s+", "", value)
        if re.fullmatch(r"[A-Za-z0-9+/=]+", cleaned or "") and len(cleaned) > 100:
            return cleaned
    return ""


def _extract_name(value, fallback="document.docx"):
    value = _first_file(value)
    if isinstance(value, dict):
        for key in ("name", "filename", "file_name"):
            if value.get(key):
                return str(value[key])
        url = _extract_url(value)
        if url:
            return _name_from_url(url, fallback)
    if isinstance(value, str) and value.startswith(("http://", "https://")):
        return _name_from_url(value, fallback)
    return fallback


def _name_from_url(url, fallback="document.docx"):
    try:
        path = urlparse(url).path
        name = unquote(path.rsplit("/", 1)[-1])
        return name or fallback
    except Exception:
        return fallback


async def _download(url):
    if requests is None:
        raise RuntimeError("requests_async is unavailable in this code node.")
    response = await requests.get(url, timeout=45)
    return response.content


async def _load_docx_bytes(file_value):
    b64 = _extract_base64(file_value)
    name = _extract_name(file_value)
    if b64:
        return base64.b64decode(re.sub(r"\s+", "", b64)), name

    url = _extract_url(file_value)
    if url:
        return await _download(url), _extract_name(file_value, _name_from_url(url))

    raise ValueError("没有拿到 Word 文件 URL。请把开始节点的文件变量映射到 docx_file。")


def _safe_doc_title(filename):
    name = re.sub(r"\.docx?$", "", filename or "document", flags=re.I)
    name = re.sub(r"[_\-]+", " ", name).strip()
    return name or "精排文档"


def _parse_relationships(zip_file):
    rel_path = "word/_rels/document.xml.rels"
    if rel_path not in zip_file.namelist():
        return {}

    root = ET.fromstring(zip_file.read(rel_path))
    rels = {}
    for rel in root:
        rel_id = rel.attrib.get("Id")
        target = rel.attrib.get("Target")
        mode = rel.attrib.get("TargetMode", "")
        if rel_id and target and mode.lower() != "external":
            target_path = posixpath.normpath(posixpath.join("word", target))
            rels[rel_id] = target_path
    return rels


def _image_data_uri(zip_file, target_path):
    if not target_path or target_path not in zip_file.namelist():
        return ""

    ext = "." + target_path.rsplit(".", 1)[-1].lower() if "." in target_path else ""
    mime = MIME_BY_EXT.get(ext, "application/octet-stream")
    data = base64.b64encode(zip_file.read(target_path)).decode("ascii")
    return "data:" + mime + ";base64," + data


def _ensure_image_id(rel_id, rels, zip_file, images, rel_to_image_id):
    if not rel_id:
        return ""
    if rel_id in rel_to_image_id:
        return rel_to_image_id[rel_id]

    target = rels.get(rel_id)
    data_uri = _image_data_uri(zip_file, target)
    if not data_uri:
        return ""

    image_id = "image_" + str(len(images) + 1)
    images[image_id] = {
        "id": image_id,
        "data_uri": data_uri,
        "source": target.rsplit("/", 1)[-1] if target else image_id,
    }
    rel_to_image_id[rel_id] = image_id
    return image_id


def _paragraph_meta(p):
    style = ""
    style_el = p.find("./w:pPr/w:pStyle", NS)
    if style_el is not None:
        style = _attr(style_el, "w", "val") or ""

    num_pr = p.find("./w:pPr/w:numPr", NS)
    list_level = ""
    if num_pr is not None:
        ilvl = num_pr.find("./w:ilvl", NS)
        list_level = _attr(ilvl, "w", "val") if ilvl is not None else "0"

    return {
        "style": style,
        "list_level": list_level,
    }


def _paragraph_pieces(p, zip_file, rels, images, rel_to_image_id):
    pieces = []
    text_buffer = []

    def flush_text():
        text = "".join(text_buffer)
        text_buffer.clear()
        text = re.sub(r"[ \t]+\n", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
        if text:
            pieces.append({"kind": "text", "text": text})

    for el in p.iter():
        name = _local_name(el.tag)
        if name == "t":
            text_buffer.append(el.text or "")
        elif name == "tab":
            text_buffer.append("    ")
        elif name in ("br", "cr"):
            text_buffer.append("\n")
        elif name == "blip":
            image_id = _ensure_image_id(_attr(el, "r", "embed"), rels, zip_file, images, rel_to_image_id)
            if image_id:
                flush_text()
                pieces.append({"kind": "image", "id": image_id, "placeholder": "[IMAGE:" + image_id + "]"})
        elif name == "imagedata":
            image_id = _ensure_image_id(_attr(el, "r", "id"), rels, zip_file, images, rel_to_image_id)
            if image_id:
                flush_text()
                pieces.append({"kind": "image", "id": image_id, "placeholder": "[IMAGE:" + image_id + "]"})

    flush_text()
    return pieces


def _paragraph_to_blocks(p, zip_file, rels, images, rel_to_image_id):
    meta = _paragraph_meta(p)
    blocks = []
    for piece in _paragraph_pieces(p, zip_file, rels, images, rel_to_image_id):
        if piece["kind"] == "text":
            block = {
                "type": "paragraph",
                "text": piece["text"],
            }
            if meta["style"]:
                block["style"] = meta["style"]
            if meta["list_level"]:
                block["list_level"] = meta["list_level"]
            blocks.append(block)
        elif piece["kind"] == "image":
            blocks.append({
                "type": "image",
                "id": piece["id"],
                "placeholder": piece["placeholder"],
            })
    return blocks


def _cell_text(tc, zip_file, rels, images, rel_to_image_id):
    parts = []
    for child in list(tc):
        if _local_name(child.tag) == "p":
            for piece in _paragraph_pieces(child, zip_file, rels, images, rel_to_image_id):
                if piece["kind"] == "text":
                    parts.append(piece["text"])
                elif piece["kind"] == "image":
                    parts.append(piece["placeholder"])
    return "\n".join([part for part in parts if part]).strip()


def _table_to_block(tbl, zip_file, rels, images, rel_to_image_id):
    rows = []
    for tr in tbl.findall("./w:tr", NS):
        row = []
        for tc in tr.findall("./w:tc", NS):
            row.append(_cell_text(tc, zip_file, rels, images, rel_to_image_id))
        if any(cell.strip() for cell in row):
            rows.append(row)
    if not rows:
        return None
    return {"type": "table", "rows": rows}


def _plain_text_from_blocks(blocks, limit=12000):
    lines = []
    for block in blocks:
        block_type = block.get("type")
        if block_type == "paragraph":
            lines.append(block.get("text", ""))
        elif block_type == "image":
            lines.append(block.get("placeholder", ""))
        elif block_type == "table":
            for row in block.get("rows", []):
                lines.append(" | ".join(row))
    text = "\n".join([line for line in lines if line]).strip()
    return text[:limit]


def _guess_title(blocks, filename):
    for block in blocks:
        if block.get("type") == "paragraph":
            text = re.sub(r"\s+", " ", block.get("text", "")).strip()
            if 4 <= len(text) <= 80:
                return text
    return _safe_doc_title(filename)


def convert_docx(docx_bytes, filename):
    with zipfile.ZipFile(BytesIO(docx_bytes)) as zip_file:
        if "word/document.xml" not in zip_file.namelist():
            raise ValueError("文件不是有效的 .docx。请上传 Word 2007 及以上格式。")

        rels = _parse_relationships(zip_file)
        root = ET.fromstring(zip_file.read("word/document.xml"))
        body = root.find("./w:body", NS)
        if body is None:
            raise ValueError("没有在 Word 文件中找到正文。")

        blocks = []
        images = {}
        rel_to_image_id = {}

        for child in list(body):
            name = _local_name(child.tag)
            if name == "p":
                blocks.extend(_paragraph_to_blocks(child, zip_file, rels, images, rel_to_image_id))
            elif name == "tbl":
                table = _table_to_block(child, zip_file, rels, images, rel_to_image_id)
                if table:
                    blocks.append(table)

    title = _guess_title(blocks, filename)
    plain_text = _plain_text_from_blocks(blocks)

    return {
        "title": title,
        "plain_text": plain_text,
        "blocks_json": json.dumps(blocks, ensure_ascii=False),
        "images_json": json.dumps(images, ensure_ascii=False),
        "block_count": len(blocks),
        "image_count": len(images),
        "error": "",
    }


async def main(args: Args) -> Output:
    params = _params(args)
    file_value = (
        params.get("docx_file")
        or params.get("input")
        or params.get("docx_base64")
        or params.get("file")
        or params.get("attachment")
    )

    try:
        docx_bytes, filename = await _load_docx_bytes(file_value)
        filename = params.get("filename") or filename
        if len(docx_bytes) > 25 * 1024 * 1024:
            raise ValueError("文件超过 25MB，建议先压缩图片或拆分文档。")
        return convert_docx(docx_bytes, filename)
    except Exception as exc:
        return {
            "title": "转换失败",
            "plain_text": "",
            "blocks_json": "[]",
            "images_json": "{}",
            "block_count": 0,
            "image_count": 0,
            "error": str(exc),
        }
