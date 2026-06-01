import json
import random
import re
import string
import urllib.error
import urllib.parse
import urllib.request

try:
    import requests_async as requests
except Exception:
    requests = None


def _params(args):
    if hasattr(args, "params"):
        return args.params or {}
    if isinstance(args, dict):
        return args.get("params", args) or {}
    return {}


def _safe_filename(value):
    name = str(value or "document.html").strip()
    name = re.sub(r"[\\/:*?\"<>|]+", "_", name)
    if not name.lower().endswith(".html"):
        name = name + ".html"
    return name[:100] or "document.html"


def _loads_maybe_json(value):
    if isinstance(value, dict):
        return value
    if not isinstance(value, str):
        return {}
    text = value.strip()
    if not text:
        return {}
    try:
        data = json.loads(text)
    except Exception:
        return {}
    if isinstance(data, dict):
        return data
    return {}


def _extract_payload(params):
    html_value = params.get("html") or ""
    filename_value = params.get("filename") or ""

    nested = _loads_maybe_json(params.get("input"))
    if not html_value and nested.get("html"):
        html_value = nested.get("html")
    if not filename_value and nested.get("filename"):
        filename_value = nested.get("filename")

    nested = _loads_maybe_json(html_value)
    if isinstance(nested, dict) and nested.get("html"):
        html_value = nested.get("html")
        if not filename_value:
            filename_value = nested.get("filename") or ""

    return str(html_value or ""), _safe_filename(filename_value)


def _boundary():
    alphabet = string.ascii_letters + string.digits
    return "----CozeHtmlUpload" + "".join(random.choice(alphabet) for _ in range(24))


def _multipart(fields, files):
    boundary = _boundary()
    body = bytearray()

    for name, value in fields:
        body.extend(("--" + boundary + "\r\n").encode("utf-8"))
        body.extend(('Content-Disposition: form-data; name="' + name + '"\r\n\r\n').encode("utf-8"))
        body.extend(str(value).encode("utf-8"))
        body.extend(b"\r\n")

    for field_name, filename, content_type, content in files:
        body.extend(("--" + boundary + "\r\n").encode("utf-8"))
        disposition = 'Content-Disposition: form-data; name="' + field_name + '"; filename="' + filename + '"\r\n'
        body.extend(disposition.encode("utf-8"))
        body.extend(("Content-Type: " + content_type + "\r\n\r\n").encode("utf-8"))
        body.extend(content)
        body.extend(b"\r\n")

    body.extend(("--" + boundary + "--\r\n").encode("utf-8"))
    return bytes(body), boundary


def _post_multipart(url, fields, files, timeout=60):
    body, boundary = _multipart(fields, files)
    request = urllib.request.Request(url, data=body, method="POST")
    request.add_header("Content-Type", "multipart/form-data; boundary=" + boundary)
    request.add_header("Content-Length", str(len(body)))
    request.add_header("User-Agent", "coze-word-to-html/1.0")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", "replace").strip()


async def _post_multipart_async(url, fields, files, timeout=60):
    if requests is None:
        return _post_multipart(url, fields, files, timeout)

    data = {}
    for name, value in fields:
        data[name] = value

    file_data = {}
    for field_name, filename, content_type, content in files:
        file_data[field_name] = (filename, content, content_type)

    response = await requests.post(url, data=data, files=file_data, timeout=timeout)
    text = getattr(response, "text", "")
    if callable(text):
        text = text()
    if not isinstance(text, str):
        text = str(text)
    return text.strip()


async def _upload_to_0x0(html_bytes, filename):
    text = await _post_multipart_async(
        "https://0x0.st",
        [("secret", ""), ("expires", "168")],
        [("file", filename, "text/html; charset=utf-8", html_bytes)],
    )
    if text.startswith("http://") or text.startswith("https://"):
        return text
    raise RuntimeError("0x0.st upload failed: " + text[:300])


async def _upload_to_litterbox(html_bytes, filename):
    text = await _post_multipart_async(
        "https://litterbox.catbox.moe/resources/internals/api.php",
        [("reqtype", "fileupload"), ("time", "72h")],
        [("fileToUpload", filename, "text/html; charset=utf-8", html_bytes)],
    )
    if text.startswith("http://") or text.startswith("https://"):
        return text
    raise RuntimeError("litterbox upload failed: " + text[:300])


async def _upload_to_catbox(html_bytes, filename):
    text = await _post_multipart_async(
        "https://catbox.moe/user/api.php",
        [("reqtype", "fileupload")],
        [("fileToUpload", filename, "text/html; charset=utf-8", html_bytes)],
    )
    if text.startswith("http://") or text.startswith("https://"):
        return text
    raise RuntimeError("catbox upload failed: " + text[:300])


async def _upload_to_gofile(html_bytes, filename):
    text = await _post_multipart_async(
        "https://upload.gofile.io/uploadfile",
        [],
        [("file", filename, "text/html; charset=utf-8", html_bytes)],
    )
    data = json.loads(text)
    if data.get("status") != "ok":
        raise RuntimeError("gofile upload failed: " + text[:300])
    payload = data.get("data", {})
    url = payload.get("downloadPage") or payload.get("directLink") or payload.get("link") or ""
    if url:
        return url
    raise RuntimeError("gofile upload returned no url: " + text[:300])


async def _upload_to_tmpfiles(html_bytes, filename):
    text = await _post_multipart_async(
        "https://tmpfiles.org/api/v1/upload",
        [],
        [("file", filename, "text/html; charset=utf-8", html_bytes)],
    )
    data = json.loads(text)
    url = data.get("data", {}).get("url", "")
    if not url:
        raise RuntimeError("tmpfiles upload failed: " + text[:300])
    if "tmpfiles.org/" in url and "tmpfiles.org/dl/" not in url:
        url = url.replace("tmpfiles.org/", "tmpfiles.org/dl/", 1)
    return url


async def main(args: Args) -> Output:
    params = _params(args)
    html, filename = _extract_payload(params)

    if not html.strip():
        return {
            "success": False,
            "url": "",
            "download_url": "",
            "service": "",
            "error": "html is empty",
        }

    html_bytes = html.encode("utf-8")
    if len(html_bytes) > 20 * 1024 * 1024:
        return {
            "success": False,
            "url": "",
            "download_url": "",
            "service": "",
            "error": "html file is larger than 20MB",
        }

    errors = []
    uploaders = [
        ("litterbox", _upload_to_litterbox),
        ("catbox", _upload_to_catbox),
        ("gofile", _upload_to_gofile),
        ("tmpfiles.org", _upload_to_tmpfiles),
        ("0x0.st", _upload_to_0x0),
    ]

    for service, uploader in uploaders:
        try:
            url = await uploader(html_bytes, filename)
            return {
                "success": True,
                "url": url,
                "download_url": url,
                "service": service,
                "error": "",
            }
        except Exception as exc:
            errors.append(service + ": " + str(exc))

    return {
        "success": False,
        "url": "",
        "download_url": "",
        "service": "",
        "error": " | ".join(errors),
    }
