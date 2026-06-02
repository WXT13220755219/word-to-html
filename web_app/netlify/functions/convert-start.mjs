import { getStore } from "@netlify/blobs";
import { getEnv } from "./_shared/coze.mjs";

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function createJobId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    const docxUrl = String(body.docx_url || body.docxUrl || body.file_url || "").trim();

    if (!filename.toLowerCase().endsWith(".docx")) {
      throw new Error("请上传 .docx 文件");
    }
    if (!base64 && !docxUrl) {
      throw new Error("没有收到 Word 文件内容或文件 URL");
    }

    const approxBytes = Math.floor((base64.length * 3) / 4);
    if (base64 && approxBytes > maxDocxBytes) {
      return jsonResponse(413, {
        success: false,
        error: `文件过大，Netlify 部署默认最大支持 ${Math.floor(maxDocxBytes / 1024 / 1024)}MB`,
      });
    }

    const jobId = createJobId();
    const store = getStore({ name: "word-to-html-jobs", consistency: "strong" });
    await store.setJSON(`inputs/${jobId}.json`, {
      filename,
      base64,
      docxUrl,
      createdAt: new Date().toISOString(),
    });
    await store.setJSON(`jobs/${jobId}.json`, {
      status: "queued",
      filename,
      createdAt: new Date().toISOString(),
    });

    const workerUrl = new URL("/.netlify/functions/convert-worker-background", request.url);
    const workerResponse = await fetch(workerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId }),
    });

    if (!workerResponse.ok && workerResponse.status !== 202) {
      await store.setJSON(`jobs/${jobId}.json`, {
        status: "error",
        filename,
        error: `后台任务启动失败：HTTP ${workerResponse.status}`,
        completedAt: new Date().toISOString(),
      });
      throw new Error(`后台任务启动失败：HTTP ${workerResponse.status}`);
    }

    return jsonResponse(202, { success: true, jobId });
  } catch (error) {
    return jsonResponse(400, { success: false, error: error.message || String(error) });
  }
};
