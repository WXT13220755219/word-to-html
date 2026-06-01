function getEnv(name, fallback = "") {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || fallback;
}

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
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
  const token = getEnv("COZE_API_TOKEN");
  const workflowId = getEnv("COZE_WORKFLOW_ID");
  const apiBase = getEnv("COZE_API_BASE", "https://api.coze.cn").replace(/\/+$/, "");

  if (!token) {
    throw new Error("服务端缺少 COZE_API_TOKEN，请先在 Netlify 配置环境变量");
  }
  if (!workflowId) {
    throw new Error("服务端缺少 COZE_WORKFLOW_ID，请先在 Netlify 配置环境变量");
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

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse(405, { success: false, error: "method not allowed" });
  }

  try {
    const maxDocxBytes = Number(getEnv("MAX_DOCX_BYTES", String(4 * 1024 * 1024)));
    const body = await request.json();
    const filename = String(body.filename || "document.docx");
    const base64 = String(body.base64 || "").replace(/^data:[^,]+,/, "").replace(/\s+/g, "");

    if (!filename.toLowerCase().endsWith(".docx")) {
      throw new Error("请上传 .docx 文件");
    }
    if (!base64) {
      throw new Error("没有收到 Word 文件内容");
    }

    const approxBytes = Math.floor((base64.length * 3) / 4);
    if (approxBytes > maxDocxBytes) {
      return jsonResponse(413, {
        success: false,
        error: `文件过大，Netlify 部署默认最大支持 ${Math.floor(maxDocxBytes / 1024 / 1024)}MB`,
      });
    }

    const result = await callCozeWorkflow({ filename, base64 });
    return jsonResponse(200, { success: true, ...result });
  } catch (error) {
    return jsonResponse(400, { success: false, error: error.message || String(error) });
  }
};

export const config = {
  path: "/api/convert",
  method: ["POST"],
};
