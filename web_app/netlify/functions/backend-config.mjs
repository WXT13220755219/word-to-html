import { getEnv } from "./_shared/coze.mjs";

export default async () => {
  const base = getEnv("BAOTA_API_BASE").replace(/\/+$/, "");
  const endpoint = getEnv("BAOTA_CONVERT_ENDPOINT") || (base ? `${base}/api/convert-file` : "");

  return new Response(JSON.stringify({
    success: Boolean(endpoint),
    endpoint,
    maxBytes: Number(getEnv("BAOTA_MAX_DOCX_BYTES", String(50 * 1024 * 1024))),
  }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
};
