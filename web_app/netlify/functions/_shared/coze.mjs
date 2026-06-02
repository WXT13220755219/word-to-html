export function getEnv(name, fallback = "") {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || fallback;
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

export async function callCozeWorkflow({ filename, base64 = "", docxUrl = "" }) {
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
        input: docxUrl || base64,
        docx_file: docxUrl || base64,
        docx_url: docxUrl,
        file_url: docxUrl,
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
    throw new Error(`${message}（HTTP ${response.status}，请检查工作流开始节点参数并确认工作流已发布）`);
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
