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

  if (!job) {
    return jsonResponse(404, { success: false, error: "任务不存在或已过期" });
  }

  return jsonResponse(200, { success: true, ...job });
};
