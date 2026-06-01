import { getStore } from "@netlify/blobs";
import { callCozeWorkflow, getEnv } from "./_shared/coze.mjs";

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

async function processJob(store, { jobId, filename, base64 }) {
  try {
    await store.setJSON(`jobs/${jobId}.json`, {
      status: "processing",
      filename,
      startedAt: new Date().toISOString(),
    });

    const result = await callCozeWorkflow({ filename, base64 });
    await store.setJSON(`jobs/${jobId}.json`, {
      status: "done",
      filename: result.filename,
      html: result.html,
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    await store.setJSON(`jobs/${jobId}.json`, {
      status: "error",
      error: error.message || String(error),
      completedAt: new Date().toISOString(),
    });
  }
}

async function runJob(store, { jobId, filename, base64 }) {
  try {
    await store.setJSON(`jobs/${jobId}.json`, {
      status: "queued",
      filename,
      createdAt: new Date().toISOString(),
    });
    await processJob(store, { jobId, filename, base64 });
  } catch (error) {
    try {
      await store.setJSON(`jobs/${jobId}.json`, {
        status: "error",
        error: error.message || String(error),
        completedAt: new Date().toISOString(),
      });
    } catch {
      // If Blobs itself is unavailable, the function log is the only useful signal.
    }
  }
}

export default async (request, context) => {
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

    const jobId = createJobId();
    const store = getStore({ name: "word-to-html-jobs", consistency: "strong" });
    const work = runJob(store, { jobId, filename, base64 });

    if (context?.waitUntil) {
      context.waitUntil(work);
    } else {
      work.catch(() => {});
    }

    return jsonResponse(202, { success: true, jobId });
  } catch (error) {
    return jsonResponse(400, { success: false, error: error.message || String(error) });
  }
};
