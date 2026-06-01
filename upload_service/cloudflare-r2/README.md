# upload-html service on Cloudflare Workers + R2

This service accepts generated HTML from Coze and returns a stable download URL.

## API

`POST /upload-html`

Headers:

- `Authorization: Bearer <UPLOAD_TOKEN>`
- `Content-Type: application/json`

Body:

```json
{
  "filename": "document.html",
  "html": "<!doctype html>..."
}
```

Response:

```json
{
  "success": true,
  "filename": "document.html",
  "size": 12345,
  "download_url": "https://your-worker.workers.dev/files/...",
  "url": "https://your-worker.workers.dev/files/..."
}
```

`GET /files/<key>` downloads the stored HTML file.

## Deploy

1. Copy `wrangler.toml.example` to `wrangler.toml`.

2. Create the R2 bucket:

```bash
npx wrangler r2 bucket create word-to-html
```

3. Set the upload token as a Worker secret:

```bash
npx wrangler secret put UPLOAD_TOKEN
```

4. Deploy:

```bash
npx wrangler deploy
```

5. Test:

```bash
curl -X POST "https://your-worker.workers.dev/upload-html" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  --data "{\"filename\":\"test.html\",\"html\":\"<!doctype html><h1>Hello</h1>\"}"
```

## Notes

- Set an R2 lifecycle rule if you want files to expire automatically.
- For production, bind a custom domain and set `PUBLIC_BASE_URL`.
- Keep `UPLOAD_TOKEN` private. Coze should send it only from the final upload node.
