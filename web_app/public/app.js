const form = document.querySelector("#convertForm");
const fileInput = document.querySelector("#fileInput");
const fileMeta = document.querySelector("#fileMeta");
const dropzone = document.querySelector("#dropzone");
const button = document.querySelector("#convertButton");
const clearButton = document.querySelector("#clearButton");
const progress = document.querySelector("#progress");
const barFill = document.querySelector("#barFill");
const statusText = document.querySelector("#statusText");
const message = document.querySelector("#message");

let selectedFile = null;
const DIRECT_DOCX_BYTES = 4 * 1024 * 1024;

function setMessage(text, isError = false) {
  message.textContent = text || "";
  message.classList.toggle("error", isError);
}

function setProgress(text, width) {
  progress.hidden = false;
  statusText.textContent = text;
  barFill.style.width = `${width}%`;
}

function resetProgress() {
  progress.hidden = true;
  barFill.style.width = "15%";
  statusText.textContent = "";
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function selectFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".docx")) {
    setMessage("请上传 .docx 文件。", true);
    return;
  }
  selectedFile = file;
  fileMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
  setMessage("");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",", 2)[1] : result);
    };
    reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

function downloadHtml(filename, html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "document.html";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadFromUrl(url, filename) {
  const anchor = document.createElement("a");
  anchor.href = url;
  if (filename) {
    anchor.download = filename;
  }
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(`转换接口返回 HTTP ${response.status}，不是 JSON：${text.slice(0, 120)}`);
  }

  return response.json();
}

async function fetchJson(url, options = {}, retries = 0) {
  try {
    const response = await fetch(url, { cache: "no-store", ...options });
    return { response, result: await readJsonResponse(response) };
  } catch (error) {
    if (retries > 0) {
      await wait(1500);
      return fetchJson(url, options, retries - 1);
    }
    throw new Error(`请求 ${url} 失败：${error.message || String(error)}`);
  }
}

async function getUploadConfig() {
  const { response, result } = await fetchJson("/.netlify/functions/upload-config", {
    headers: { accept: "application/json" },
  }, 1);
  if (!response.ok || !result.success || !result.endpoint) {
    throw new Error("大文件上传服务未配置，请在 Netlify 配置 DOCX_UPLOAD_ENDPOINT");
  }
  return result;
}

async function getBackendConfig() {
  if (!location.hostname.includes("netlify.app")) {
    return {
      success: true,
      endpoint: `${location.origin}/api/convert-file`,
      maxBytes: 50 * 1024 * 1024,
    };
  }

  try {
    const { response, result } = await fetchJson("/.netlify/functions/backend-config", {
      headers: { accept: "application/json" },
    }, 1);
    if (response.ok && result.success && result.endpoint) {
      return result;
    }
  } catch {
    // Fall back to the Netlify/R2 path when no external backend is configured.
  }

  return { success: false, endpoint: "", maxBytes: 0 };
}

async function convertWithBackend(file, config) {
  if (file.size > Number(config.maxBytes || 50 * 1024 * 1024)) {
    throw new Error(`文件过大：宝塔转换服务最大支持 ${formatBytes(Number(config.maxBytes))}，当前文件 ${formatBytes(file.size)}。`);
  }

  const url = new URL(config.endpoint);
  url.searchParams.set("filename", file.name);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "x-filename": file.name,
    },
    body: file,
  });
  const result = await readJsonResponse(response);

  if (!response.ok || !result.success) {
    throw new Error(result.error || `宝塔转换服务失败：HTTP ${response.status}`);
  }

  return result;
}

async function uploadDocxToStorage(file) {
  const config = await getUploadConfig();
  if (file.size > Number(config.maxBytes || 25 * 1024 * 1024)) {
    throw new Error(`文件过大：上传服务最大支持 ${formatBytes(Number(config.maxBytes))}，当前文件 ${formatBytes(file.size)}。`);
  }

  const form = new FormData();
  form.append("file", file, file.name);

  const headers = {};
  if (config.token) {
    headers["x-upload-token"] = config.token;
  }

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers,
    body: form,
  });
  const result = await readJsonResponse(response);

  if (!response.ok || !result.success) {
    throw new Error(result.error || `上传 Word 文件失败：HTTP ${response.status}`);
  }
  if (!result.docx_url && !result.file_url && !result.url) {
    throw new Error("上传服务没有返回 docx_url");
  }

  return {
    filename: result.filename || file.name,
    docxUrl: result.docx_url || result.file_url || result.url,
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJob(jobId) {
  const startedAt = Date.now();
  const timeoutMs = 14 * 60 * 1000;

  while (Date.now() - startedAt < timeoutMs) {
    await wait(3000);
    const { response, result } = await fetchJson(`/.netlify/functions/convert-status?id=${encodeURIComponent(jobId)}&t=${Date.now()}`, {
      headers: { accept: "application/json" },
    }, 2);

    if (response.status === 404) {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      setProgress(`后台任务排队中，已等待 ${elapsedSeconds} 秒...`, Math.min(70, 45 + elapsedSeconds / 8));
      continue;
    }
    if (!response.ok || !result.success) {
      throw new Error(result.error || "查询转换状态失败");
    }
    if (result.status === "done") {
      return result;
    }
    if (result.status === "error") {
      throw new Error(result.error || "转换失败");
    }

    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    setProgress(`正在转换，已等待 ${elapsedSeconds} 秒...`, Math.min(90, 50 + elapsedSeconds / 6));
  }

  throw new Error("转换等待超时，请稍后重试或缩短文档内容");
}

async function convert() {
  if (!selectedFile) {
    setMessage("请先选择一个 Word 文件。", true);
    return;
  }

  button.disabled = true;
  clearButton.disabled = true;
  setMessage("");

  try {
    const backendConfig = await getBackendConfig();
    if (backendConfig.success && backendConfig.endpoint) {
      setProgress("上传到临时转换服务...", 25);
      const result = await convertWithBackend(selectedFile, backendConfig);
      setProgress("准备下载...", 95);
      downloadHtml(result.filename, result.html);
      setProgress("下载已开始", 100);
      setMessage(`已生成 ${result.filename}`);
      return;
    }

    let payload;
    if (selectedFile.size > DIRECT_DOCX_BYTES) {
      setProgress("上传 Word 文件...", 25);
      const uploaded = await uploadDocxToStorage(selectedFile);
      payload = {
        filename: uploaded.filename,
        docx_url: uploaded.docxUrl,
      };
    } else {
      setProgress("读取 Word 文件...", 25);
      const base64 = await fileToBase64(selectedFile);
      payload = {
        filename: selectedFile.name,
        base64,
      };
    }

    setProgress("提交到转换服务...", 45);
    const { response, result: startResult } = await fetchJson("/.netlify/functions/convert-start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok || !startResult.success) {
      throw new Error(startResult.error || `后台任务启动失败：HTTP ${response.status}`);
    }

    setProgress("生成 HTML...", 55);
    const result = await waitForJob(startResult.jobId);

    setProgress("准备下载...", 95);
    if (result.downloadUrl) {
      downloadFromUrl(result.downloadUrl, result.filename);
    } else {
      downloadHtml(result.filename, result.html);
    }
    setProgress("下载已开始", 100);
    setMessage(`已生成 ${result.filename}`);
  } catch (error) {
    setMessage(error.message || String(error), true);
    resetProgress();
  } finally {
    button.disabled = false;
    clearButton.disabled = false;
  }
}

fileInput.addEventListener("change", () => {
  selectFile(fileInput.files?.[0]);
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("dragging");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragging");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragging");
  const file = event.dataTransfer.files?.[0];
  if (file) {
    fileInput.files = event.dataTransfer.files;
    selectFile(file);
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  convert();
});

clearButton.addEventListener("click", () => {
  selectedFile = null;
  fileInput.value = "";
  fileMeta.textContent = "支持 .docx，建议小于 25MB";
  resetProgress();
  setMessage("");
});
