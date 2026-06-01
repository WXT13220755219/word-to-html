const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin") || "";
  const allowed = (env.ALLOW_ORIGINS || "*").split(",").map((item) => item.trim());
  const allowOrigin = allowed.includes("*") || allowed.includes(origin) ? origin || "*" : allowed[0] || "*";
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-upload-token",
  };
}

function parseMaxBytes(env) {
  const value = Number(env.MAX_BYTES || "");
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_BYTES;
}

function isAuthorized(request, env) {
  const configured = env.UPLOAD_TOKEN || "";
  if (!configured) {
    return false;
  }
  const auth = request.headers.get("authorization") || "";
  const token = request.headers.get("x-upload-token") || "";
  return auth === `Bearer ${configured}` || token === configured;
}

function safeFilename(value) {
  let name = String(value || "document.html").trim();
  name = name.replace(/[\\/:*?"<>|]+/g, "_");
  name = name.replace(/\s+/g, "_");
  if (!name.toLowerCase().endsWith(".html")) {
    name += ".html";
  }
  if (name.length > 120) {
    name = name.slice(0, 115) + ".html";
  }
  return name || "document.html";
}

function asciiFilename(value) {
  const fallback = safeFilename(value).replace(/[^\x20-\x7e]+/g, "_");
  return fallback || "document.html";
}

function objectKey(filename) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const id = crypto.randomUUID();
  return `html/${day}/${id}-${filename}`;
}

function publicBaseUrl(request, env) {
  const configured = String(env.PUBLIC_BASE_URL || "").trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function decodeBase64(value) {
  const clean = String(value || "").replace(/^data:[^,]+,/, "").replace(/\s+/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function parseUploadBody(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("content-type must be application/json");
  }

  const body = await request.json();
  const filename = safeFilename(body.filename);

  if (typeof body.html === "string" && body.html.trim()) {
    return {
      filename,
      bytes: new TextEncoder().encode(body.html),
    };
  }

  if (typeof body.html_base64 === "string" && body.html_base64.trim()) {
    return {
      filename,
      bytes: decodeBase64(body.html_base64),
    };
  }

  throw new Error("html or html_base64 is required");
}

async function handleUpload(request, env) {
  if (!isAuthorized(request, env)) {
    return jsonResponse({ success: false, error: "unauthorized" }, 401);
  }

  let payload;
  try {
    payload = await parseUploadBody(request);
  } catch (error) {
    return jsonResponse({ success: false, error: error.message }, 400);
  }

  const maxBytes = parseMaxBytes(env);
  if (payload.bytes.byteLength > maxBytes) {
    return jsonResponse({
      success: false,
      error: `file is too large: ${payload.bytes.byteLength} bytes, max ${maxBytes}`,
    }, 413);
  }

  const key = objectKey(payload.filename);
  await env.HTML_BUCKET.put(key, payload.bytes, {
    httpMetadata: {
      contentType: "text/html; charset=utf-8",
      contentDisposition: `attachment; filename="${asciiFilename(payload.filename)}"; filename*=UTF-8''${encodeURIComponent(payload.filename)}`,
    },
    customMetadata: {
      filename: payload.filename,
      created_at: new Date().toISOString(),
    },
  });

  const downloadUrl = `${publicBaseUrl(request, env)}/files/${encodeURIComponent(key)}`;
  return jsonResponse({
    success: true,
    filename: payload.filename,
    size: payload.bytes.byteLength,
    key,
    download_url: downloadUrl,
    url: downloadUrl,
  });
}

async function handleDownload(request, env) {
  const url = new URL(request.url);
  const encoded = url.pathname.slice("/files/".length);
  if (!encoded) {
    return jsonResponse({ success: false, error: "missing file key" }, 400);
  }

  const key = decodeURIComponent(encoded);
  const object = await env.HTML_BUCKET.get(key);
  if (!object) {
    return jsonResponse({ success: false, error: "file not found" }, 404);
  }

  const filename = object.customMetadata?.filename || key.split("/").pop() || "document.html";
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=0, no-store");
  headers.set("content-type", headers.get("content-type") || "text/html; charset=utf-8");
  headers.set(
    "content-disposition",
    `attachment; filename="${asciiFilename(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );

  return new Response(object.body, { headers });
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({ ok: true }, 200, headers);
    }

    if (request.method === "POST" && url.pathname === "/upload-html") {
      const response = await handleUpload(request, env);
      Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      return response;
    }

    if (request.method === "GET" && url.pathname.startsWith("/files/")) {
      return handleDownload(request, env);
    }

    return jsonResponse({ success: false, error: "not found" }, 404, headers);
  },
};
