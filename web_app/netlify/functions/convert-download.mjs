import { getStore } from "@netlify/blobs";

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function safeDownloadName(filename) {
  return String(filename || "document.html")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 180);
}

export default async (request) => {
  if (request.method !== "GET") {
    return jsonResponse(405, { success: false, error: "method not allowed" });
  }

  const url = new URL(request.url);
  const jobId = url.searchParams.get("id") || "";
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(jobId)) {
    return jsonResponse(400, { success: false, error: "无效的任务 ID" });
  }

  const store = getStore({ name: "word-to-html-jobs", consistency: "strong" });
  const job = await store.get(`jobs/${jobId}.json`, { type: "json" });
  if (!job || job.status !== "done") {
    return jsonResponse(404, { success: false, error: "转换结果不存在或尚未完成" });
  }

  const html = await store.get(`results/${jobId}.html`);
  if (!html) {
    return jsonResponse(404, { success: false, error: "转换结果文件不存在或已过期" });
  }

  const filename = safeDownloadName(job.filename);
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
    },
  });
};
