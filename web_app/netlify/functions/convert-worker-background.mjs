import { getStore } from "@netlify/blobs";
import { callCozeWorkflow } from "./_shared/coze.mjs";

function isValidJobId(jobId) {
  return typeof jobId === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(jobId);
}

export default async (request) => {
  const store = getStore({ name: "word-to-html-jobs", consistency: "strong" });
  let jobId = "";

  try {
    const body = await request.json();
    jobId = String(body.jobId || "");

    if (!isValidJobId(jobId)) {
      throw new Error("无效的任务 ID");
    }

    const input = await store.get(`inputs/${jobId}.json`, { type: "json" });
    if (!input) {
      throw new Error("任务输入不存在或已过期");
    }

    const filename = String(input.filename || "document.docx");
    const base64 = String(input.base64 || "");
    if (!base64) {
      throw new Error("任务输入缺少 Word 文件内容");
    }

    await store.setJSON(`jobs/${jobId}.json`, {
      status: "processing",
      filename,
      startedAt: new Date().toISOString(),
    });

    const result = await callCozeWorkflow({ filename, base64 });
    await store.set(`results/${jobId}.html`, result.html, {
      metadata: {
        filename: result.filename,
        contentType: "text/html; charset=utf-8",
        completedAt: new Date().toISOString(),
      },
    });
    await store.setJSON(`jobs/${jobId}.json`, {
      status: "done",
      filename: result.filename,
      downloadUrl: `/.netlify/functions/convert-download?id=${encodeURIComponent(jobId)}`,
      completedAt: new Date().toISOString(),
    });
    await store.delete(`inputs/${jobId}.json`);
  } catch (error) {
    if (isValidJobId(jobId)) {
      await store.setJSON(`jobs/${jobId}.json`, {
        status: "error",
        error: error.message || String(error),
        completedAt: new Date().toISOString(),
      });
    }
  }
};
