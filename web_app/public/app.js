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

function createJobId() {
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    setProgress("读取 Word 文件...", 25);
    const base64 = await fileToBase64(selectedFile);

    setProgress("提交到转换服务...", 45);
    const jobId = createJobId();
    const response = await fetch("/.netlify/functions/convert-worker-background", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobId,
        filename: selectedFile.name,
        base64,
      }),
    });

    if (!response.ok && response.status !== 202) {
      throw new Error(`后台任务启动失败：HTTP ${response.status}`);
    }

    setProgress("生成 HTML...", 55);
    const result = await waitForJob(jobId);

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
