import { getEnv } from "./_shared/coze.mjs";

export default async () => {
  const endpoint = getEnv("DOCX_UPLOAD_ENDPOINT");
  const token = getEnv("DOCX_UPLOAD_TOKEN");

  return new Response(JSON.stringify({
    success: Boolean(endpoint),
    endpoint,
    token,
    maxBytes: Number(getEnv("DOCX_UPLOAD_MAX_BYTES", String(25 * 1024 * 1024))),
  }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
};
