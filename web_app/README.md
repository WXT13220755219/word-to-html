# Word to HTML web app

This app lets a user upload a `.docx`, calls the Coze workflow, receives `{ html, filename }`, and triggers a browser download with `Blob`.

## Required Coze workflow inputs

Add these start-node inputs to the workflow:

- `docx_base64`: String
- `docx_file`: String
- `input`: String
- `docx_url`: String
- `file_url`: String
- `filename`: String

Map the `ExtractDocx` code node inputs like this:

- `docx_file` = start node `docx_file`
- `input` = start node `input`
- `docx_base64` = start node `docx_base64`
- `filename` = start node `filename`

The workflow end node should return variables:

- `html` = `ComposeFinalHtml.html`
- `filename` = `ComposeFinalHtml.filename`

If Coze returns `Missing required parameters`, check that the published workflow start node no longer has an unfilled required file input. The backend sends small files as base64 and large files through a temporary URL for compatibility:

- `docx_base64`
- `input`
- `docx_file`
- `docx_url`
- `file_url`

## Configure

Set environment variables:

```powershell
$env:COZE_API_TOKEN="pat_your_token_here"
$env:COZE_WORKFLOW_ID="7645613836111740974"
$env:COZE_API_BASE="https://api.coze.cn"
$env:PORT="8787"
$env:PUBLIC_BASE_URL="http://8.133.17.237:8787"
```

## Run

```powershell
node server.mjs
```

Open:

```text
http://localhost:8787
```

## Production notes

- Do not expose `COZE_API_TOKEN` in frontend JavaScript.
- Put this Node service behind HTTPS before letting external users upload files.
- Large `.docx` files should be passed to Coze as a temporary URL, not as base64 JSON, otherwise Coze/TLB can return `413 Request Entity Too Large`.

## Deploy to Netlify

The repository includes a Netlify Function at `web_app/netlify/functions/convert.mjs`.
Deploy from the repository root so Netlify can read `netlify.toml`:

```powershell
cd "D:\桌面\word转html"
npx netlify deploy --prod
```

Set these environment variables in Netlify before testing conversion:

- `COZE_API_TOKEN`
- `COZE_WORKFLOW_ID`
- `COZE_API_BASE`
- `MAX_DOCX_BYTES` optional; keep this around `4194304` on Netlify because function request bodies are limited.
- `DOCX_UPLOAD_ENDPOINT` optional but required for large files; use your Cloudflare Worker `/upload-docx` URL.
- `DOCX_UPLOAD_TOKEN` optional; must match the Worker `UPLOAD_TOKEN` when `/upload-docx` is protected.
- `DOCX_UPLOAD_MAX_BYTES` optional; default `26214400`.

Netlify serves `web_app/public` as the static site and routes `POST /api/convert` to the function.

Files larger than 4MB are uploaded to object storage first, then the resulting `docx_url` is passed to Coze.

## Baota / VPS temporary-file backend

For large files without keeping user uploads in object storage, deploy `web_app/server.mjs`
on a Node-capable Baota site:

```powershell
cd web_app
node server.mjs
```

Set server environment variables:

- `COZE_API_TOKEN`
- `COZE_WORKFLOW_ID`
- `COZE_API_BASE=https://api.coze.cn`
- `MAX_DOCX_BYTES=52428800`
- `PORT=8787`
- `PUBLIC_BASE_URL=http://8.133.17.237:8787` while testing by IP, or `https://your-api.example.com` after binding HTTPS.

Configure Nginx on Baota:

```nginx
client_max_body_size 50m;
proxy_read_timeout 900s;
proxy_send_timeout 900s;
```

The endpoint `POST /api/convert-file` accepts the raw `.docx` request body,
stores it only in `web_app/.tmp_uploads`, passes Coze a one-time temporary URL,
and deletes the temp file in a `finally` block after the workflow call returns.

If the frontend stays on Netlify, set:

- `BAOTA_API_BASE=https://your-api.example.com`
- `BAOTA_MAX_DOCX_BYTES=52428800`
