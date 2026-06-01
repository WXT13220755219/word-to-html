import html
import json
import re


def _params(args):
    if hasattr(args, "params"):
        return args.params or {}
    if isinstance(args, dict):
        return args.get("params", args) or {}
    return {}


def _strip_code_fence(text):
    text = (text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _sanitize_fragment(fragment):
    fragment = _strip_code_fence(fragment)
    fragment = re.sub(r"(?is)<\s*(script|iframe|object|embed|link|meta|style)\b[^>]*>.*?<\s*/\s*\1\s*>", "", fragment)
    fragment = re.sub(r"(?is)<\s*(script|iframe|object|embed|link|meta|style)\b[^>]*?/?>", "", fragment)
    fragment = re.sub(r"(?is)\s+on[a-z]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", "", fragment)
    fragment = re.sub(r"(?i)javascript\s*:", "", fragment)
    return fragment.strip()


def _load_json(value, fallback):
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value or "")
    except Exception:
        return fallback


def _escape_text(value):
    return html.escape(str(value or ""), quote=True)


def _render_table(rows):
    if not rows:
        return ""

    def cells(row, tag):
        return "".join("<{tag}>{text}</{tag}>".format(tag=tag, text=_escape_text(cell)) for cell in row)

    first_row = rows[0]
    has_header = len(rows) > 1 and all(cell.strip() for cell in first_row)
    body_rows = rows
    head = ""
    if has_header:
        head = "<thead><tr>" + cells(first_row, "th") + "</tr></thead>"
        body_rows = rows[1:]

    body = "".join("<tr>" + cells(row, "td") + "</tr>" for row in body_rows)
    return '<div class="table-wrap"><table>' + head + "<tbody>" + body + "</tbody></table></div>"


def _fallback_fragment(blocks, title):
    output = [
        '<header class="doc-hero">',
        '<p class="eyebrow">整理版文档</p>',
        "<h1>" + _escape_text(title or "精排文档") + "</h1>",
        "</header>",
        '<section class="content-section">',
    ]
    opened_list = False

    def close_list():
        nonlocal opened_list
        if opened_list:
            output.append("</ul>")
            opened_list = False

    for block in blocks:
        block_type = block.get("type")
        if block_type == "paragraph":
            text = block.get("text", "").strip()
            if not text:
                continue
            if block.get("list_level"):
                if not opened_list:
                    output.append("<ul>")
                    opened_list = True
                output.append("<li>" + _escape_text(text) + "</li>")
                continue
            close_list()
            style = (block.get("style") or "").lower()
            rendered = "<p>" + _escape_text(text) + "</p>"
            if "heading" in style:
                rendered = "<h3>" + _escape_text(text) + "</h3>"
            if "heading1" in style:
                rendered = "<h2>" + _escape_text(text) + "</h2>"
            output.append(rendered)
            continue

        if block_type == "image":
            close_list()
            output.append('<figure class="media-block">[IMAGE:' + _escape_text(block.get("id")) + "]</figure>")
            continue

        if block_type == "table":
            close_list()
            output.append(_render_table(block.get("rows", [])))
            continue

    close_list()
    output.append("</section>")
    return "\n".join(output)


def _image_tag(image_id, image_info):
    src = image_info.get("data_uri", "")
    alt = image_info.get("source") or image_id
    if not src.startswith("data:image/"):
        return ""
    return '<img src="{src}" alt="{alt}" loading="lazy">'.format(
        src=html.escape(src, quote=True),
        alt=_escape_text(alt),
    )


def _embed_images(fragment, images):
    used = set()

    def replace_square(match):
        image_id = match.group(1)
        image_info = images.get(image_id) or {}
        tag = _image_tag(image_id, image_info)
        if tag:
            used.add(image_id)
            return tag
        return ""

    def replace_braces(match):
        image_id = match.group(1)
        image_info = images.get(image_id) or {}
        tag = _image_tag(image_id, image_info)
        if tag:
            used.add(image_id)
            return tag
        return ""

    fragment = re.sub(r"\[IMAGE:(image_\d+)\]", replace_square, fragment)
    fragment = re.sub(r"\{\{(image_\d+)\}\}", replace_braces, fragment)

    leftovers = []
    for image_id, image_info in images.items():
        if image_id not in used:
            tag = _image_tag(image_id, image_info)
            if tag:
                leftovers.append('<figure class="media-block">' + tag + "</figure>")

    if leftovers:
        fragment += "\n<section class=\"content-section media-gallery\"><h2>附图</h2>" + "\n".join(leftovers) + "</section>"
    return fragment


def _css():
    return """
    :root {
      --page: #f7f8fb;
      --paper: #ffffff;
      --ink: #17202a;
      --muted: #667085;
      --line: #d9e1e7;
      --accent: #0e7c86;
      --accent-2: #c24e34;
      --soft: #eef7f8;
      --mark: #fff2cc;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background:
        linear-gradient(180deg, #eef3f7 0, var(--page) 280px),
        var(--page);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
      line-height: 1.78;
    }
    .page {
      width: min(980px, calc(100% - 32px));
      margin: 32px auto;
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 22px 55px rgba(23, 32, 42, 0.10);
      overflow: hidden;
    }
    .document {
      padding: clamp(24px, 5vw, 64px);
    }
    .doc-hero {
      padding: 0 0 28px;
      border-bottom: 3px solid var(--ink);
      margin-bottom: 34px;
      position: relative;
    }
    .doc-hero::after {
      content: "";
      display: block;
      width: 112px;
      height: 6px;
      background: linear-gradient(90deg, var(--accent), var(--accent-2));
      position: absolute;
      left: 0;
      bottom: -4px;
    }
    .eyebrow {
      color: var(--accent);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0;
      margin: 0 0 10px;
    }
    h1, h2, h3 {
      letter-spacing: 0;
      line-height: 1.24;
      margin: 0;
    }
    h1 {
      font-size: clamp(30px, 4.5vw, 54px);
      font-weight: 820;
    }
    h2 {
      font-size: clamp(24px, 3vw, 34px);
      margin: 42px 0 14px;
      padding-left: 14px;
      border-left: 5px solid var(--accent);
    }
    h3 {
      font-size: 20px;
      margin: 30px 0 10px;
      color: #263442;
    }
    p {
      margin: 12px 0;
      font-size: 16px;
    }
    .lead {
      font-size: 19px;
      color: #344054;
      margin-top: 18px;
    }
    .content-section + .content-section {
      margin-top: 34px;
    }
    ul, ol {
      padding-left: 1.35em;
      margin: 14px 0 18px;
    }
    li { margin: 7px 0; }
    blockquote, .callout {
      margin: 24px 0;
      padding: 18px 20px;
      background: var(--soft);
      border-left: 5px solid var(--accent);
      border-radius: 8px;
      color: #244047;
    }
    .media-block {
      margin: 28px 0;
      text-align: center;
    }
    .media-block img,
    .document img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      border: 1px solid var(--line);
      box-shadow: 0 12px 30px rgba(23, 32, 42, 0.12);
    }
    figcaption {
      margin-top: 8px;
      color: var(--muted);
      font-size: 13px;
    }
    .table-wrap {
      width: 100%;
      overflow-x: auto;
      margin: 24px 0;
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 560px;
      background: #fff;
    }
    th, td {
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
      font-size: 15px;
    }
    th {
      background: #f0f6f7;
      color: #17383d;
      font-weight: 750;
    }
    tr:last-child td { border-bottom: 0; }
    mark {
      background: var(--mark);
      padding: 0 0.2em;
      border-radius: 4px;
    }
    code {
      background: #f2f4f7;
      border: 1px solid #e4e7ec;
      border-radius: 5px;
      padding: 0.12em 0.35em;
      font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      font-size: 0.92em;
    }
    @media (max-width: 640px) {
      .page {
        width: 100%;
        margin: 0;
        border-radius: 0;
        border-left: 0;
        border-right: 0;
      }
      .document { padding: 22px 18px 34px; }
      h1 { font-size: 30px; }
      p { font-size: 15px; }
    }
    @media print {
      body { background: #fff; }
      .page {
        width: 100%;
        margin: 0;
        border: 0;
        box-shadow: none;
      }
      .document { padding: 0; }
    }
    """


def _full_html(title, fragment):
    safe_title = _escape_text(title or "精排文档")
    return """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <style>{css}</style>
</head>
<body>
  <article class="page">
    <main class="document">
{fragment}
    </main>
  </article>
</body>
</html>""".format(title=safe_title, css=_css(), fragment=fragment)


async def main(args: Args) -> Output:
    params = _params(args)
    title = params.get("title") or "精排文档"
    images = _load_json(params.get("images_json"), {})
    blocks = _load_json(params.get("blocks_json"), [])
    fragment = _sanitize_fragment(params.get("body_html") or params.get("html_fragment") or "")

    if not fragment:
        fragment = _fallback_fragment(blocks, title)

    fragment = _embed_images(fragment, images)
    final_html = _full_html(title, fragment)
    filename = re.sub(r"[\\/:*?\"<>|]+", "_", str(title or "document")).strip()[:80] or "document"

    return {
        "html": final_html,
        "filename": filename + ".html",
        "preview": final_html[:2000],
        "error": "",
    }
