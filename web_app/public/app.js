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
    const response = await fetch("/api/convert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: selectedFile.name,
        base64,
      }),
    });

    setProgress("生成 HTML...", 75);
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || "转换失败");
    }

    setProgress("准备下载...", 95);
    downloadHtml(result.filename, result.html);
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
