import json

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


def _clean_endpoint(value):
    endpoint = str(value or "").strip()
    if endpoint.endswith("/"):
        endpoint = endpoint[:-1]
    if not endpoint.endswith("/upload-html"):
        endpoint += "/upload-html"
    return endpoint


async def main(args: Args) -> Output:
    params = _params(args)
    endpoint = _clean_endpoint(params.get("endpoint"))
    token = str(params.get("token") or "").strip()
    html = str(params.get("html") or "")
    filename = str(params.get("filename") or "document.html")

    if requests is None:
        return {
            "success": False,
            "download_url": "",
            "url": "",
            "filename": filename,
            "size": 0,
            "error": "requests_async is unavailable",
        }

    if not endpoint.startswith("https://"):
        return {
            "success": False,
            "download_url": "",
            "url": "",
            "filename": filename,
            "size": 0,
            "error": "endpoint must start with https://",
        }

    if not token:
        return {
            "success": False,
            "download_url": "",
            "url": "",
            "filename": filename,
            "size": 0,
            "error": "token is required",
        }

    if not html.strip():
        return {
            "success": False,
            "download_url": "",
            "url": "",
            "filename": filename,
            "size": 0,
            "error": "html is empty",
        }

    payload = {
        "filename": filename,
        "html": html,
    }

    try:
        response = await requests.post(
            endpoint,
            headers={
                "authorization": "Bearer " + token,
                "content-type": "application/json",
            },
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            timeout=60,
        )
        status_code = getattr(response, "status_code", 0)
        text = getattr(response, "text", "")
        if callable(text):
            text = text()
        data = json.loads(text)
        download_url = data.get("download_url") or data.get("url") or ""
        return {
            "success": bool(data.get("success")) and bool(download_url),
            "download_url": download_url,
            "url": download_url,
            "filename": data.get("filename") or filename,
            "size": data.get("size") or 0,
            "error": data.get("error") or "",
            "status_code": status_code,
        }
    except Exception as exc:
        return {
            "success": False,
            "download_url": "",
            "url": "",
            "filename": filename,
            "size": 0,
            "error": str(exc),
            "status_code": 0,
        }
