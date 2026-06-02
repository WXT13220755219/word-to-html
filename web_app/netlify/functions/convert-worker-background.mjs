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
    const filename = String(body.filename || "document.docx");
    const base64 = String(body.base64 || "");

    if (!isValidJobId(jobId)) {
      throw new Error("无效的任务 ID");
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
