const form = document.querySelector("#convertForm");
const fileInput = document.querySelector("#fileInput");
const fileMeta = document.querySelector("#fileMeta");
const dropzone = document.querySelector("#dropzone");
const button = document.querySelector("#convertButton");
const clearButton = document.querySelector("#clearButton");
const progress = document.querySelector("#progress");
const barFill = document.querySelector("#barFill");
const statusText = document.querySelector("#statusText");
const progressPercent = document.querySelector("#progressPercent");
const message = document.querySelector("#message");
const fileCard = document.querySelector("#fileCard");
const fileName = document.querySelector("#fileName");
const fileSize = document.querySelector("#fileSize");
const fileType = document.querySelector("#fileType");
const fileLimit = document.querySelector("#fileLimit");
const styleSelect = document.querySelector("#styleSelect");
const styleName = document.querySelector("#styleName");
const steps = Array.from(document.querySelectorAll("[data-step]"));
const tabButtons = Array.from(document.querySelectorAll("[data-tab]"));
const wordPanel = document.querySelector("#wordPanel");
const paperPanel = document.querySelector("#paperPanel");
const textPanel = document.querySelector("#textPanel");
const paperForm = document.querySelector("#paperForm");
const paperFileInput = document.querySelector("#paperFileInput");
const paperFileMeta = document.querySelector("#paperFileMeta");
const paperDropzone = document.querySelector("#paperDropzone");
const paperButton = document.querySelector("#paperConvertButton");
const paperClearButton = document.querySelector("#paperClearButton");
const paperProgress = document.querySelector("#paperProgress");
const paperBarFill = document.querySelector("#paperBarFill");
const paperStatusText = document.querySelector("#paperStatusText");
const paperProgressPercent = document.querySelector("#paperProgressPercent");
const paperFileCard = document.querySelector("#paperFileCard");
const paperFileName = document.querySelector("#paperFileName");
const paperFileSize = document.querySelector("#paperFileSize");
const paperFileType = document.querySelector("#paperFileType");
const paperFileLimit = document.querySelector("#paperFileLimit");
const paperSteps = Array.from(document.querySelectorAll("[data-paper-step]"));
const textForm = document.querySelector("#textForm");
const textFileInput = document.querySelector("#textFileInput");
const textFileMeta = document.querySelector("#textFileMeta");
const textDropzone = document.querySelector("#textDropzone");
const textButton = document.querySelector("#textConvertButton");
const textClearButton = document.querySelector("#textClearButton");
const textProgress = document.querySelector("#textProgress");
const textBarFill = document.querySelector("#textBarFill");
const textStatusText = document.querySelector("#textStatusText");
const textProgressPercent = document.querySelector("#textProgressPercent");
const textFileCard = document.querySelector("#textFileCard");
const textFileName = document.querySelector("#textFileName");
const textFileSize = document.querySelector("#textFileSize");
const textFileType = document.querySelector("#textFileType");
const textFileLimit = document.querySelector("#textFileLimit");
const textStyleSelect = document.querySelector("#textStyleSelect");
const textStyleName = document.querySelector("#textStyleName");
const textSteps = Array.from(document.querySelectorAll("[data-text-step]"));

let selectedFile = null;
let selectedPaperFile = null;
let selectedTextFile = null;
const DIRECT_DOCX_BYTES = 4 * 1024 * 1024;
const MAX_BACKEND_BYTES = 50 * 1024 * 1024;
const MAX_PDF_BYTES = 30 * 1024 * 1024;
const MAX_TXT_BYTES = 10 * 1024 * 1024;
const MAX_TXT_CHARS = 1000000;
const STEP_ORDER = ["upload", "submit", "render", "download"];
const PAPER_STEP_ORDER = ["upload", "extract", "analyze", "download"];
const TEXT_STEP_ORDER = ["upload", "parse", "render", "download"];
const STYLE_LABELS = {
  report: "正式报告风",
  business: "商业方案风",
  magazine: "杂志长文风",
  tech: "科技文档风",
  card: "卡片展示风",
  simple: "简洁阅读风",
};

function setMessage(text, state = "") {
  const kind = state === true ? "error" : state || "";
  message.textContent = text || "";
  message.classList.toggle("error", kind === "error");
  message.classList.toggle("success", kind === "success");
}

function setStep(activeStep, complete = false) {
  const activeIndex = STEP_ORDER.indexOf(activeStep);
  steps.forEach((step) => {
    const index = STEP_ORDER.indexOf(step.dataset.step);
    step.classList.toggle("active", !complete && index === activeIndex);
    step.classList.toggle("loading", !complete && index === activeIndex);
    step.classList.toggle("done", activeIndex >= 0 && (complete ? index <= activeIndex : index < activeIndex));
  });
}

function setProgress(text, width, step = "") {
  const normalizedWidth = Math.max(0, Math.min(100, Number(width) || 0));
  progress.hidden = false;
  statusText.textContent = text;
  barFill.style.width = `${normalizedWidth}%`;
  if (progressPercent) {
    progressPercent.textContent = `${Math.round(normalizedWidth)}%`;
  }
  setStep(step, normalizedWidth >= 100);
}

function resetProgress() {
  progress.hidden = true;
  barFill.style.width = "15%";
  statusText.textContent = "";
  if (progressPercent) {
    progressPercent.textContent = "15%";
  }
  setStep("");
}

function setPaperStep(activeStep, complete = false) {
  const activeIndex = PAPER_STEP_ORDER.indexOf(activeStep);
  paperSteps.forEach((step) => {
    const index = PAPER_STEP_ORDER.indexOf(step.dataset.paperStep);
    step.classList.toggle("active", !complete && index === activeIndex);
    step.classList.toggle("loading", !complete && index === activeIndex);
    step.classList.toggle("done", activeIndex >= 0 && (complete ? index <= activeIndex : index < activeIndex));
  });
}

function setPaperProgress(text, width, step = "") {
  const normalizedWidth = Math.max(0, Math.min(100, Number(width) || 0));
  paperProgress.hidden = false;
  paperStatusText.textContent = text;
  paperBarFill.style.width = `${normalizedWidth}%`;
  if (paperProgressPercent) {
    paperProgressPercent.textContent = `${Math.round(normalizedWidth)}%`;
  }
  setPaperStep(step, normalizedWidth >= 100);
}

function resetPaperProgress() {
  paperProgress.hidden = true;
  paperBarFill.style.width = "15%";
  paperStatusText.textContent = "";
  if (paperProgressPercent) {
    paperProgressPercent.textContent = "15%";
  }
  setPaperStep("");
}

function setTextStep(activeStep, complete = false) {
  const activeIndex = TEXT_STEP_ORDER.indexOf(activeStep);
  textSteps.forEach((step) => {
    const index = TEXT_STEP_ORDER.indexOf(step.dataset.textStep);
    step.classList.toggle("active", !complete && index === activeIndex);
    step.classList.toggle("loading", !complete && index === activeIndex);
    step.classList.toggle("done", activeIndex >= 0 && (complete ? index <= activeIndex : index < activeIndex));
  });
}

function setTextProgress(text, width, step = "") {
  const normalizedWidth = Math.max(0, Math.min(100, Number(width) || 0));
  textProgress.hidden = false;
  textStatusText.textContent = text;
  textBarFill.style.width = `${normalizedWidth}%`;
  if (textProgressPercent) {
    textProgressPercent.textContent = `${Math.round(normalizedWidth)}%`;
  }
  setTextStep(step, normalizedWidth >= 100);
}

function resetTextProgress() {
  textProgress.hidden = true;
  textBarFill.style.width = "15%";
  textStatusText.textContent = "";
  if (textProgressPercent) {
    textProgressPercent.textContent = "15%";
  }
  setTextStep("");
}

function switchTab(tabName) {
  const isPaper = tabName === "paper";
  const isText = tabName === "text";
  wordPanel.hidden = isPaper || isText;
  paperPanel.hidden = !isPaper;
  textPanel.hidden = !isText;
  tabButtons.forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
  setMessage("");
}

function selectedTemplateStyle() {
  const value = String(styleSelect?.value || "business");
  return Object.prototype.hasOwnProperty.call(STYLE_LABELS, value) ? value : "business";
}

function syncStyleName() {
  if (styleName) {
    styleName.textContent = STYLE_LABELS[selectedTemplateStyle()];
  }
}

function selectedTextTemplateStyle() {
  const value = String(textStyleSelect?.value || "business");
  return Object.prototype.hasOwnProperty.call(STYLE_LABELS, value) ? value : "business";
}

function syncTextStyleName() {
  if (textStyleName) {
    textStyleName.textContent = STYLE_LABELS[selectedTextTemplateStyle()];
  }
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
  fileCard.hidden = false;
  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);
  fileType.textContent = ".docx";
  fileLimit.textContent = formatBytes(MAX_BACKEND_BYTES);
  dropzone.classList.add("has-file");
  setMessage("");
}

function selectPaperFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    setMessage("请上传 .pdf 文件。", true);
    return;
  }
  if (file.size > MAX_PDF_BYTES) {
    setMessage(`PDF 文件过大，最大支持 ${formatBytes(MAX_PDF_BYTES)}。`, true);
    return;
  }
  selectedPaperFile = file;
  paperFileMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
  paperFileCard.hidden = false;
  paperFileName.textContent = file.name;
  paperFileSize.textContent = formatBytes(file.size);
  paperFileType.textContent = ".pdf";
  paperFileLimit.textContent = `${formatBytes(MAX_PDF_BYTES)} / 80页`;
  paperDropzone.classList.add("has-file");
  setMessage("");
}

function selectTextFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".txt")) {
    setMessage("请上传 .txt 文件。", true);
    return;
  }
  if (file.size > MAX_TXT_BYTES) {
    setMessage(`TXT 文件过大，最大支持 ${formatBytes(MAX_TXT_BYTES)}。`, true);
    return;
  }
  selectedTextFile = file;
  textFileMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
  textFileCard.hidden = false;
  textFileName.textContent = file.name;
  textFileSize.textContent = formatBytes(file.size);
  textFileType.textContent = ".txt";
  textFileLimit.textContent = `${formatBytes(MAX_TXT_BYTES)} / ${MAX_TXT_CHARS.toLocaleString("zh-CN")}字符`;
  textDropzone.classList.add("has-file");
  resetTextProgress();
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
      maxBytes: MAX_BACKEND_BYTES,
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

async function convertWithBackend(file, config, templateStyle) {
  if (file.size > Number(config.maxBytes || 50 * 1024 * 1024)) {
    throw new Error(`文件过大：宝塔转换服务最大支持 ${formatBytes(Number(config.maxBytes))}，当前文件 ${formatBytes(file.size)}。`);
  }

  const url = new URL(config.endpoint);
  url.searchParams.set("filename", file.name);
  url.searchParams.set("template_style", templateStyle);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    body: file,
  });
  const result = await readJsonResponse(response);

  if (!response.ok || !result.success) {
    throw new Error(result.error || `宝塔转换服务失败：HTTP ${response.status}`);
  }

  return result;
}

async function convertPaperWithBackend(file) {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error(`文件过大：PDF 最大支持 ${formatBytes(MAX_PDF_BYTES)}，当前文件 ${formatBytes(file.size)}。`);
  }

  const url = new URL(`${location.origin}/api/convert-paper-file`);
  url.searchParams.set("filename", file.name);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/pdf",
    },
    body: file,
  });
  const result = await readJsonResponse(response);

  if (!response.ok || !result.success) {
    throw new Error(result.error || `PDF 转换失败：HTTP ${response.status}`);
  }

  return result;
}

async function convertTextWithBackend(file, templateStyle) {
  if (file.size > MAX_TXT_BYTES) {
    throw new Error(`文件过大：TXT 最大支持 ${formatBytes(MAX_TXT_BYTES)}，当前文件 ${formatBytes(file.size)}。`);
  }

  const url = new URL(`${location.origin}/api/convert-text-file`);
  url.searchParams.set("filename", file.name);
  url.searchParams.set("template_style", templateStyle);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "x-filename": file.name,
    },
    body: file,
  });

  const result = await readJsonResponse(response);
  if (!response.ok || !result.success || !result.html) {
    throw new Error(result.error || `TXT 转换失败：HTTP ${response.status}`);
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

async function revealProgress() {
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await wait(120);
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
      setProgress(`后台任务排队中，已等待 ${elapsedSeconds} 秒...`, Math.min(62, 45 + elapsedSeconds / 10), "submit");
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
    setProgress(`正在分析并生成 HTML，已等待 ${elapsedSeconds} 秒...`, Math.min(90, 64 + elapsedSeconds / 6), "render");
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
    const templateStyle = selectedTemplateStyle();
    const backendConfig = await getBackendConfig();
    if (backendConfig.success && backendConfig.endpoint) {
      setProgress("上传 Word 文件...", 25, "upload");
      await revealProgress();
      setProgress("抽取文档内容...", 45, "submit");
      await revealProgress();
      setProgress("分析结构并生成 HTML...", 68, "render");
      const result = await convertWithBackend(selectedFile, backendConfig, templateStyle);
      setProgress("生成 HTML...", 70, "render");
      setProgress("准备下载...", 95, "download");
      downloadHtml(result.filename, result.html);
      setProgress("下载已开始", 100, "download");
      setMessage(`已生成 ${result.filename}`, "success");
      return;
    }

    let payload;
    if (selectedFile.size > DIRECT_DOCX_BYTES) {
      setProgress("上传 Word 文件...", 25, "upload");
      await revealProgress();
      const uploaded = await uploadDocxToStorage(selectedFile);
      payload = {
        filename: uploaded.filename,
        docx_url: uploaded.docxUrl,
        template_style: templateStyle,
      };
    } else {
      setProgress("读取 Word 文件...", 25, "upload");
      await revealProgress();
      const base64 = await fileToBase64(selectedFile);
      payload = {
        filename: selectedFile.name,
        base64,
        template_style: templateStyle,
      };
    }

    setProgress("抽取文档内容...", 45, "submit");
    await revealProgress();
    const { response, result: startResult } = await fetchJson("/.netlify/functions/convert-start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok || !startResult.success) {
      throw new Error(startResult.error || `后台任务启动失败：HTTP ${response.status}`);
    }

    setProgress("分析结构并生成 HTML...", 64, "render");
    const result = await waitForJob(startResult.jobId);

    setProgress("准备下载...", 95, "download");
    if (result.downloadUrl) {
      downloadFromUrl(result.downloadUrl, result.filename);
    } else {
      downloadHtml(result.filename, result.html);
    }
    setProgress("下载已开始", 100, "download");
    setMessage(`已生成 ${result.filename}`, "success");
  } catch (error) {
    setMessage(error.message || String(error), "error");
    resetProgress();
  } finally {
    button.disabled = false;
    clearButton.disabled = false;
  }
}

async function convertPaper() {
  if (!selectedPaperFile) {
    setMessage("请先选择一个 PDF 文件。", true);
    return;
  }

  paperButton.disabled = true;
  paperClearButton.disabled = true;
  setMessage("");

  try {
    setPaperProgress("上传 PDF 文件...", 25, "upload");
    await revealProgress();
    setPaperProgress("抽取 PDF 文本...", 45, "extract");
    await revealProgress();
    setPaperProgress("分析结构并生成网页...", 65, "analyze");
    const result = await convertPaperWithBackend(selectedPaperFile);
    setPaperProgress("准备下载...", 95, "download");
    downloadHtml(result.filename, result.html);
    setPaperProgress("下载已开始", 100, "download");
    setMessage(`已生成 ${result.filename}`, "success");
  } catch (error) {
    setMessage(error.message || String(error), "error");
    resetPaperProgress();
  } finally {
    paperButton.disabled = false;
    paperClearButton.disabled = false;
  }
}

async function convertText() {
  if (!selectedTextFile) {
    setMessage("请先选择一个 TXT 文件。", true);
    return;
  }

  textButton.disabled = true;
  textClearButton.disabled = true;
  setMessage("");

  try {
    const templateStyle = selectedTextTemplateStyle();
    setTextProgress("上传 TXT 文件...", 25, "upload");
    await revealProgress();
    setTextProgress("解码文本并提交...", 45, "parse");
    await revealProgress();
    const result = await convertTextWithBackend(selectedTextFile, templateStyle);
    setTextProgress("生成 HTML...", 80, "render");
    setTextProgress("准备下载...", 95, "download");
    downloadHtml(result.filename, result.html);
    setTextProgress("下载已开始", 100, "download");
    setMessage(`已生成 ${result.filename}`, "success");
  } catch (error) {
    setMessage(error.message || String(error), "error");
    resetTextProgress();
  } finally {
    textButton.disabled = false;
    textClearButton.disabled = false;
  }
}

fileInput.addEventListener("change", () => {
  selectFile(fileInput.files?.[0]);
});

paperFileInput?.addEventListener("change", () => {
  selectPaperFile(paperFileInput.files?.[0]);
});

textFileInput?.addEventListener("change", () => {
  selectTextFile(textFileInput.files?.[0]);
});

tabButtons.forEach((tab) => {
  tab.addEventListener("click", () => {
    switchTab(tab.dataset.tab);
  });
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

paperDropzone?.addEventListener("dragover", (event) => {
  event.preventDefault();
  paperDropzone.classList.add("dragging");
});

paperDropzone?.addEventListener("dragleave", () => {
  paperDropzone.classList.remove("dragging");
});

paperDropzone?.addEventListener("drop", (event) => {
  event.preventDefault();
  paperDropzone.classList.remove("dragging");
  const file = event.dataTransfer.files?.[0];
  if (file) {
    paperFileInput.files = event.dataTransfer.files;
    selectPaperFile(file);
  }
});

textDropzone?.addEventListener("dragover", (event) => {
  event.preventDefault();
  textDropzone.classList.add("dragging");
});

textDropzone?.addEventListener("dragleave", () => {
  textDropzone.classList.remove("dragging");
});

textDropzone?.addEventListener("drop", (event) => {
  event.preventDefault();
  textDropzone.classList.remove("dragging");
  const file = event.dataTransfer.files?.[0];
  if (file) {
    textFileInput.files = event.dataTransfer.files;
    selectTextFile(file);
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  convert();
});

paperForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  convertPaper();
});

textForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  convertText();
});

styleSelect?.addEventListener("change", syncStyleName);
syncStyleName();
textStyleSelect?.addEventListener("change", syncTextStyleName);
syncTextStyleName();

clearButton.addEventListener("click", () => {
  selectedFile = null;
  fileInput.value = "";
  fileMeta.textContent = "未选择文件";
  fileCard.hidden = true;
  fileName.textContent = "-";
  fileSize.textContent = "-";
  fileType.textContent = ".docx";
  fileLimit.textContent = formatBytes(MAX_BACKEND_BYTES);
  dropzone.classList.remove("has-file");
  resetProgress();
  setMessage("");
});

paperClearButton?.addEventListener("click", () => {
  selectedPaperFile = null;
  paperFileInput.value = "";
  paperFileMeta.textContent = "未选择文件";
  paperFileCard.hidden = true;
  paperFileName.textContent = "-";
  paperFileSize.textContent = "-";
  paperFileType.textContent = ".pdf";
  paperFileLimit.textContent = `${formatBytes(MAX_PDF_BYTES)} / 80页`;
  paperDropzone.classList.remove("has-file");
  resetPaperProgress();
  setMessage("");
});

textClearButton?.addEventListener("click", () => {
  selectedTextFile = null;
  textFileInput.value = "";
  textFileMeta.textContent = "未选择文件";
  textFileCard.hidden = true;
  textFileName.textContent = "-";
  textFileSize.textContent = "-";
  textFileType.textContent = ".txt";
  textFileLimit.textContent = `${formatBytes(MAX_TXT_BYTES)} / ${MAX_TXT_CHARS.toLocaleString("zh-CN")}字符`;
  textDropzone.classList.remove("has-file");
  resetTextProgress();
  setMessage("");
});
