import { createServer } from "node:http";
import { createWriteStream, readFileSync } from "node:fs";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");
const TEMP_DIR = join(ROOT, ".tmp_uploads");

function loadDotEnv() {
  try {
    const text = readFileSync(join(ROOT, ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional. Production deployments usually set real env vars.
  }
}

loadDotEnv();

const PORT = Number(process.env.PORT || 8787);
const MAX_DOCX_BYTES = Number(process.env.MAX_DOCX_BYTES || 25 * 1024 * 1024);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, data) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-filename",
  });
  response.end(JSON.stringify(data));
}

function sendText(response, status, text) {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-filename",
  });
  response.end(text);
}

function safeUploadName(value) {
  let name = String(value || "document.docx").trim();
  name = name.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_");
  if (!name.toLowerCase().endsWith(".docx")) {
    name += ".docx";
  }
  return name.slice(0, 160) || "document.docx";
}

async function saveRequestToTempFile(request, filename) {
  await mkdir(TEMP_DIR, { recursive: true });
  const filePath = join(TEMP_DIR, `${Date.now()}-${randomUUID()}-${safeUploadName(filename)}`);
  const output = createWriteStream(filePath, { flags: "wx" });
  let size = 0;

  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_DOCX_BYTES) {
        throw new Error(`文件过大，最大支持 ${Math.floor(MAX_DOCX_BYTES / 1024 / 1024)}MB`);
      }
      if (!output.write(chunk)) {
        await once(output, "drain");
      }
    }
    output.end();
    await once(output, "finish");
    return { filePath, size };
  } catch (error) {
    output.destroy();
    try {
      await unlink(filePath);
    } catch {
      // The temp file may not have been created yet.
    }
    throw error;
  }
}

async function removeTempFile(filePath) {
  if (!filePath) {
    return;
  }
  try {
    await unlink(filePath);
  } catch {
    // Temp cleanup is best effort.
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  const maxJsonBytes = Math.ceil(MAX_DOCX_BYTES * 1.5) + 1024 * 1024;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxJsonBytes) {
      throw new Error(`请求过大，最大支持约 ${Math.floor(MAX_DOCX_BYTES / 1024 / 1024)}MB 的 .docx 文件`);
    }
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text || "{}");
}

function normalizeWorkflowResult(payload) {
  if (typeof payload === "string") {
    try {
      return normalizeWorkflowResult(JSON.parse(payload));
    } catch {
      return { html: payload, filename: "document.html" };
    }
  }

  if (!payload || typeof payload !== "object") {
    return {};
  }

  if (payload.code && payload.code !== 0) {
    throw new Error(payload.msg || payload.message || `Coze API error: ${payload.code}`);
  }

  if (payload.data) {
    const data = normalizeWorkflowResult(payload.data);
    if (data.html || data.filename || data.download_url) {
      return data;
    }
  }

  if (payload.output) {
    const output = normalizeWorkflowResult(payload.output);
    if (output.html || output.filename || output.download_url) {
      return output;
    }
  }

  return payload;
}

async function callCozeWorkflow({ filename, base64 }) {
  const token = process.env.COZE_API_TOKEN;
  const workflowId = process.env.COZE_WORKFLOW_ID;
  const apiBase = (process.env.COZE_API_BASE || "https://api.coze.cn").replace(/\/+$/, "");

  if (!token) {
    throw new Error("服务端缺少 COZE_API_TOKEN，请先配置环境变量");
  }
  if (!workflowId) {
    throw new Error("服务端缺少 COZE_WORKFLOW_ID，请先配置环境变量");
  }

  const response = await fetch(`${apiBase}/v1/workflow/run`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      workflow_id: workflowId,
      parameters: {
        docx_base64: base64,
        input: base64,
        docx_file: base64,
        filename,
      },
    }),
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Coze API 返回非 JSON：${text.slice(0, 500)}`);
  }

  if (!response.ok) {
    const message = payload.msg || payload.message || `Coze API HTTP ${response.status}`;
    throw new Error(`${message}（HTTP ${response.status}，请检查工作流开始节点必填参数是否包含 docx_base64/input/docx_file 之一，并确认已发布）`);
  }

  const result = normalizeWorkflowResult(payload);
  if (!result.html) {
    throw new Error(`工作流没有返回 html 字段：${JSON.stringify(payload).slice(0, 800)}`);
  }

  return {
    html: String(result.html),
    filename: String(result.filename || filename.replace(/\.docx?$/i, ".html") || "document.html"),
  };
}

async function handleConvert(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { success: false, error: "method not allowed" });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const filename = String(body.filename || "document.docx");
    const base64 = String(body.base64 || "").replace(/^data:[^,]+,/, "").replace(/\s+/g, "");

    if (!filename.toLowerCase().endsWith(".docx")) {
      throw new Error("请上传 .docx 文件");
    }
    if (!base64) {
      throw new Error("没有收到 Word 文件内容");
    }

    const approxBytes = Math.floor((base64.length * 3) / 4);
    if (approxBytes > MAX_DOCX_BYTES) {
      throw new Error(`文件过大，最大支持 ${Math.floor(MAX_DOCX_BYTES / 1024 / 1024)}MB`);
    }

    const result = await callCozeWorkflow({ filename, base64 });
    sendJson(response, 200, { success: true, ...result });
  } catch (error) {
    sendJson(response, 400, { success: false, error: error.message || String(error) });
  }
}

async function handleConvertFile(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { success: false, error: "method not allowed" });
    return;
  }

  let tempFile = "";
  try {
    const url = new URL(request.url, "http://localhost");
    const filename = safeUploadName(url.searchParams.get("filename") || request.headers.get("x-filename"));

    if (!filename.toLowerCase().endsWith(".docx")) {
      throw new Error("请上传 .docx 文件");
    }

    const saved = await saveRequestToTempFile(request, filename);
    tempFile = saved.filePath;
    if (saved.size <= 0) {
      throw new Error("没有收到 Word 文件内容");
    }

    const base64 = (await readFile(tempFile)).toString("base64");
    const result = await callCozeWorkflow({ filename, base64 });
    sendJson(response, 200, { success: true, ...result });
  } catch (error) {
    sendJson(response, 400, { success: false, error: error.message || String(error) });
  } finally {
    await removeTempFile(tempFile);
  }
}

async function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "content-type": MIME[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(content);
  } catch {
    sendText(response, 404, "Not found");
  }
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    sendText(response, 204, "");
    return;
  }

  if (request.url?.startsWith("/api/convert-file")) {
    await handleConvertFile(request, response);
    return;
  }

  if (request.url?.startsWith("/api/convert")) {
    await handleConvert(request, response);
    return;
  }

  if (request.url === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  await serveStatic(request, response);
});

server.listen(PORT, () => {
  console.log(`word-to-html web app listening on http://localhost:${PORT}`);
});
