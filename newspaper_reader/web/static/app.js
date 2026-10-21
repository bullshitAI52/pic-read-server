const $ = (id) => document.getElementById(id);
let offlineDesktop = false;

const READ_W = (window.devicePixelRatio || 1) > 1.5 ? 2000 : 1600;

const state = {
  jobId: null,
  pages: [],
  results: [],
  docs: [],
  docIdx: 0,
  page: 1,
  fit: "w",
  step: 1,
  timer: null,
  processing: false,
  lib: [],
};

/* ---------- helpers ---------- */
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtSize(b) {
  if (!b) return "";
  if (b > 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + " MB";
  return Math.round(b / 1024) + " KB";
}

function safeFile(name, ext = ".pdf") {
  const s = String(name || "文档").replace(/[\\/:*?"<>|\r\n]+/g, "-").replace(/\s+/g, " ").trim();
  return (s || "文档") + ext;
}

function fmtDate(ts) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const posKey = (id) => "readpos:" + id;
function savePos(id, n) {
  if (!id) return;
  try { localStorage.setItem(posKey(id), String(n)); } catch (e) {}
}
function loadPos(id) {
  if (!id) return 1;
  try { return parseInt(localStorage.getItem(posKey(id)) || "1", 10) || 1; } catch (e) { return 1; }
}

/* ---------- health ---------- */
async function checkHealth() {
  const b = $("healthBadge");
  try {
    const r = await fetch("/api/health");
    const j = await r.json();
    offlineDesktop = !!j.offline;
    if (offlineDesktop) {
      document.body.classList.add('offline-desktop');
      document.querySelector('h1').textContent = '高清图片裁剪 · 离线版';
      document.querySelector('.tagline').textContent = '本地上传、四角裁剪、高清 PNG 保存，无需网络';
      document.querySelector('.steps-label').textContent = '上传图片 → 四角裁剪 → 保存高清 PNG';
      document.querySelector('.opt-hint').textContent = '照片在本机处理。裁剪后点击保存，选择文件夹；请将重要图片另存到自己的目录。';
      document.querySelector('footer p').textContent = '离线版只在本机处理图片，不提供公网分享链接。工作缓存保留 7 天，请及时另存高清图片。';
    }
    if (j.ok) {
      b.textContent = "图片服务就绪";
      b.className = "badge ok";
    } else {
      b.textContent = "图片服务异常";
      b.className = "badge bad";
      b.title = "请稍后刷新重试";
    }
  } catch (e) {
    b.textContent = "服务异常";
    b.className = "badge bad";
  }
}

/* ---------- steps ---------- */
function canGo(n) {
  if (n === 1) return true;
  if (n === 2) return !!state.jobId && !state.processing;
  return state.docs.length > 0 && !state.processing;
}

function refreshSteps() {
  document.querySelectorAll(".step").forEach((b) => {
    const s = Number(b.dataset.step);
    b.disabled = !canGo(s);
    b.classList.toggle("active", s === state.step);
    b.classList.toggle("done", s < state.step);
  });
  $("backHint").classList.toggle("hidden", !state.jobId);
}

function setStep(n) {
  if (!canGo(n)) return;
  state.step = n;
  $("dropPanel").classList.toggle("hidden", n !== 1);
  $("pagesPanel").classList.toggle("hidden", n !== 2);
  $("resultPanel").classList.toggle("hidden", n !== 3);
  refreshSteps();
  if (n === 1) window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".step").forEach((b) =>
  b.addEventListener("click", () => setStep(Number(b.dataset.step)))
);

/* ---------- upload ---------- */
const drop = $("drop");
const fileInput = $("fileInput");

$("pickBtn").addEventListener("click", () => fileInput.click());
drop.addEventListener("click", (e) => {
  if (e.target === drop || e.target.classList.contains("drop-inner") || e.target.classList.contains("drop-icon")) {
    fileInput.click();
  }
});
["dragenter", "dragover"].forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add("over");
  })
);
["dragleave", "drop"].forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.remove("over");
  })
);
drop.addEventListener("drop", (e) => {
  const files = [...(e.dataTransfer.files || [])].filter((f) => f.type.startsWith("image/"));
  if (files.length) uploadFiles(files);
});
fileInput.addEventListener("change", () => {
  const files = [...fileInput.files];
  if (files.length) uploadFiles(files);
  fileInput.value = "";
});

async function uploadFiles(files) {
  const msg = $("upMsg");
  msg.textContent = `上传中…（${files.length} 张）`;
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f, f.name));
  try {
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok) throw new Error(j.detail || "上传失败");
    if (state.jobId && state.jobId !== j.job_id) {
      try { await fetch("/api/job/" + state.jobId, { method: "DELETE" }); } catch (e) {}
    }
    state.jobId = j.job_id;
    state.pages = j.pages || [];
    state.results = [];
    state.docs = [];
    msg.textContent = (j.errors && j.errors.length) ? `上传完成，${j.errors.length} 个文件被跳过` : "";
    renderPages();
    resetProgress();
    refreshSteps();
    setStep(2);
  } catch (e) {
    msg.textContent = "上传失败：" + e.message;
  }
}

function renderPages() {
  const grid = $("grid");
  grid.innerHTML = "";
  $("pageCount").textContent = state.pages.length;
  state.pages.forEach((p, i) => {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.id = p.id || "";
    const cover = p.is_cover ? " cover" : "";
    card.innerHTML = `
      <div class="thumb">
        ${p.thumb ? `<img src="${p.thumb}" alt="">` : ""}
        <span class="tag${cover}">P${i + 1}</span>
        <button class="grip" type="button" title="按住拖动可调整顺序" aria-label="拖动调整顺序">⠿</button>
      </div>
      <div class="meta">
        <div class="nm">${escapeHtml(p.orig || p.name)}</div>
        <div class="st">${p.issue_no ? "期号 " + escapeHtml(p.issue_no) : (p.blocks != null ? "文字块 " + p.blocks + " · 插图 " + (p.photos || 0) : "待转换")}</div>
      </div>`;
    grid.appendChild(card);
  });
  if (viewId) loadView();
}

/* ---------- image preview / rotate ---------- */
const viewModal = $("viewModal");
let viewId = null;
let viewBusy = false;
let cropPoints = [];
let cropDragging = -1;
let cropPointerId = null;
let cropVersion = 0;
let detectRequest = 0;

function stopCropDrag() {
  cropDragging = -1;
  cropPointerId = null;
  $("cropMagnifier").classList.add("hidden");
}

function renderMagnifier() {
  const canvas = $("cropMagnifier"), img = $("viewImg");
  if (cropDragging < 0 || !$("cropMagnifyEnabled").checked) {
    canvas.classList.add("hidden");
    return;
  }
  const [x, y] = cropPoints[cropDragging];
  const ctx = canvas.getContext("2d"), size = canvas.width;
  // Three times the displayed image scale; stay opposite the active corner.
  const sample = 120 * img.naturalWidth / Math.max(1, img.getBoundingClientRect().width) / 3;
  ctx.fillStyle = "#263244";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, x - sample / 2, y - sample / 2, sample, sample, 0, 0, size, size);
  ctx.strokeStyle = "#ffcf33"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(size/2, 0); ctx.lineTo(size/2, size);
  ctx.moveTo(0, size/2); ctx.lineTo(size, size/2); ctx.stroke();
  canvas.style.left = x > img.naturalWidth / 2 ? "10px" : "auto";
  canvas.style.right = x > img.naturalWidth / 2 ? "auto" : "10px";
  canvas.classList.remove("hidden");
}

async function detectCrop() {
  const img = $("viewImg"), pageId = viewId, version = cropVersion, src = img.src;
  if (!pageId || viewBusy || img.classList.contains("loading") || cropPoints.length !== 4) return;
  const request = ++detectRequest;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const current = () => request === detectRequest && pageId === viewId && version === cropVersion && src === img.src && isViewOpen();
  $("cropDetectStatus").textContent = "正在识别；也可直接拖动四角…";
  try {
    const r = await fetch(`/api/job/${state.jobId}/page/${pageId}/detect-corners`, {method: "POST", signal: controller.signal});
    const j = await r.json();
    if (!r.ok) throw new Error(j.detail || "识别失败");
    if (!current()) return;
    if (!j.detected) {
      $("cropDetectStatus").textContent = "未找到可靠边框，已保留当前角点，请手动调整";
      return;
    }
    if (!Array.isArray(j.points) || j.points.length !== 4 || j.points.some(p => !Array.isArray(p) || p.length !== 2 || p.some(v => !Number.isFinite(v) || v < 0 || v > 1))) throw new Error("角点数据无效");
    cropPoints = j.points.map(([x,y]) => [x * img.naturalWidth, y * img.naturalHeight]);
    renderCrop();
    $("cropDetectStatus").textContent = "已建议四角，可手动微调；点击“确认裁剪”才会保存";
  } catch (e) {
    if (current()) $("cropDetectStatus").textContent = "自动识别失败或超时，仍可手动框选";
  } finally { clearTimeout(timer); }
}

const isViewOpen = () => !!viewModal && !viewModal.classList.contains("hidden");
const pageIndexOf = (id) => state.pages.findIndex((p) => p.id === id);

function openView(id) {
  if (!viewModal || pageIndexOf(id) < 0) return;
  viewId = id;
  viewModal.classList.remove("hidden");
  loadView();
}

function closeView() {
  if (viewBusy) return;
  if (!viewModal) return;
  viewModal.classList.add("hidden");
  stopCropDrag();
  cropVersion++;
  viewId = null;
}

function loadView() {
  stopCropDrag();
  cropVersion++;
  cropPoints = [];
  $("cropDetectStatus").textContent = "";
  const i = pageIndexOf(viewId);
  if (i < 0) return closeView();
  const p = state.pages[i];
  const n = state.pages.length;
  showImageShare(p);
  const angle = ((Number(p.rotate) || 0) % 360 + 360) % 360;
  $("viewTitle").textContent = p.orig || p.name || "图片预览";
  $("viewSub").textContent = `第 ${i + 1} / ${n} 张` + (angle ? ` · 已旋转 ${angle}°` : "");
  $("viewPos").textContent = `${i + 1} / ${n}`;
  $("viewPrev").disabled = i <= 0 || viewBusy;
  $("viewNext").disabled = i >= n - 1 || viewBusy;
  const img = $("viewImg");
  img.classList.add("loading");
  img.onload = () => { img.classList.remove("loading"); initCrop(); };
  img.onerror = () => {
    img.classList.remove("loading");
    $("viewSub").textContent = "图片载入失败，请关闭后重试";
  };
  $("cropLayer").classList.add("hidden");
  img.src = `/api/job/${state.jobId}/pageimg/${p.id}?w=1600&v=${Date.now()}`;
}

function initCrop() {
  const img = $("viewImg"), layer = $("cropLayer");
  if (!img.naturalWidth) return;
  const w = img.naturalWidth, h = img.naturalHeight, m = 0;
  cropPoints = [[w*m,h*m],[w*(1-m),h*m],[w*(1-m),h*(1-m)],[w*m,h*(1-m)]];
  layer.classList.remove("hidden");
  renderCrop();
  const page = state.pages[pageIndexOf(viewId)];
  if ($("cropAutoEnabled").checked && page && !page.shared_image) detectCrop();
}

function renderCrop() {
  const img = $("viewImg"), layer = $("cropLayer"), box = $("cropBox");
  const ir = img.getBoundingClientRect(), sr = $("viewStage").getBoundingClientRect();
  layer.style.left = `${ir.left - sr.left}px`; layer.style.top = `${ir.top - sr.top}px`;
  layer.style.width = `${ir.width}px`; layer.style.height = `${ir.height}px`;
  const pts = cropPoints.map(([x,y]) => [x/img.naturalWidth*100, y/img.naturalHeight*100]);
  box.style.clipPath = `polygon(${pts.map(p => p.join("% ")).join("%,")}%)`;
  ["tl","tr","br","bl"].forEach((c,i) => { const el=layer.querySelector(`.${c}`); el.style.left=`${pts[i][0]}%`; el.style.top=`${pts[i][1]}%`; });
}

function cropPointer(e) {
  if (cropDragging < 0 || e.pointerId !== cropPointerId) return;
  const img = $("viewImg"), r = img.getBoundingClientRect();
  cropPoints[cropDragging] = [Math.max(0, Math.min(img.naturalWidth, (e.clientX-r.left)/r.width*img.naturalWidth)), Math.max(0, Math.min(img.naturalHeight, (e.clientY-r.top)/r.height*img.naturalHeight))];
  renderCrop();
  renderMagnifier();
}

async function saveCrop(reset = false) {
  const i = pageIndexOf(viewId); if (i < 0 || viewBusy) return;
  if (!reset && ($("viewImg").classList.contains("loading") || cropPoints.length !== 4)) return;
  cropVersion++;
  stopCropDrag();
  viewBusy = true;
  try {
    const img = $("viewImg");
    const points = cropPoints.map(([x,y]) => [x/img.naturalWidth,y/img.naturalHeight]);
    const r=await fetch(`/api/job/${state.jobId}/page/${viewId}/${reset ? "reset" : "crop"}`,{method:"POST",headers:{"Content-Type":"application/json"},body:reset ? undefined : JSON.stringify({points})});
    const j=await r.json(); if(!r.ok) throw new Error(j.detail||"裁剪失败");
    state.pages[i].shared_image = j.shared_image || null;
    state.pages[i].rotate=0; state.pages[i].thumb=j.thumb||state.pages[i].thumb; updateCardThumb(state.pages[i]); invalidateResults(); viewBusy=false; loadView();
  } catch(e) { $("viewSub").textContent=e.message; } finally { viewBusy=false; }
}

document.querySelectorAll(".crop-handle").forEach(el=>{
  el.addEventListener("pointerdown",e=>{
    if (viewBusy || cropDragging >= 0 || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault(); cropVersion++; cropDragging=Number(el.dataset.corner); cropPointerId=e.pointerId;
    $("cropDetectStatus").textContent = "手动调整中，点击“确认裁剪”保存";
    el.setPointerCapture(e.pointerId); renderMagnifier();
  });
  el.addEventListener("lostpointercapture", e => { if (e.pointerId === cropPointerId) stopCropDrag(); });
});
$("cropLayer").addEventListener("pointermove", cropPointer);
$("cropLayer").addEventListener("pointerup", e => { if (e.pointerId === cropPointerId) stopCropDrag(); });
$("cropLayer").addEventListener("pointercancel", e => { if (e.pointerId === cropPointerId) stopCropDrag(); });
$("cropMagnifyEnabled").addEventListener("change", renderMagnifier);
$("cropDetect").addEventListener("click", detectCrop);
$("cropAutoEnabled").addEventListener("change", () => {
  cropVersion++;
  $("cropDetectStatus").textContent = "";
  if ($("cropAutoEnabled").checked) detectCrop();
});
$("cropSave").addEventListener("click", () => saveCrop(false));
$("cropReset").addEventListener("click", () => saveCrop(true));
window.addEventListener("resize", () => { if (isViewOpen() && cropPoints.length) renderCrop(); });

function showImageShare(page) {
  const share = page.shared_image;
  $("imageShare").classList.toggle("hidden", !share);
  $("imageCopyStatus").textContent = "";
  if (!share) return;
  $("imageShareUrl").value = new URL(share.url, location.origin).href;
  $("imageDownload").href = share.url + "?download=true";
  $("imageDownload").textContent = offlineDesktop ? '保存高清图片到电脑' : '下载高清图片';
  $("imageShareInfo").textContent = `已保存高清 PNG · ${share.width} × ${share.height} 像素 · ${(share.bytes / 1048576).toFixed(2)} MB`;
}

$("imageDownload").addEventListener('click', async (event) => {
  if (!offlineDesktop) return;
  event.preventDefault();
  try {
    const share = state.pages[pageIndexOf(viewId)].shared_image;
    const result = await window.pywebview.api.save_image(share.url.split('/').pop());
    $("imageCopyStatus").textContent = result.saved ? '已保存到选择的位置' : result.error || '已取消保存';
  } catch (_) { $("imageCopyStatus").textContent = '保存失败，请重试'; }
});

$("imageCopy").addEventListener("click", async () => {
  const field = $("imageShareUrl");
  let copied = false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(field.value);
      copied = true;
    }
  } catch (_) {}
  if (!copied) {
    field.focus(); field.select(); field.setSelectionRange(0, field.value.length);
    try { copied = document.execCommand("copy"); } catch (_) {}
  }
  $("imageCopyStatus").textContent = copied ? "链接已复制" : "请长按上方链接，选择复制";
});

function stepView(delta) {
  if (viewBusy) return;
  const i = pageIndexOf(viewId) + delta;
  if (i < 0 || i >= state.pages.length) return;
  viewId = state.pages[i].id;
  loadView();
}

async function rotateView(delta) {
  const i = pageIndexOf(viewId);
  if (i < 0 || viewBusy) return;
  cropVersion++;
  stopCropDrag();
  const p = state.pages[i];
  const angle = (((Number(p.rotate) || 0) + delta) % 360 + 360) % 360;
  viewBusy = true;
  $("rotCw").disabled = true;
  $("rotCcw").disabled = true;
  try {
    const r = await fetch(`/api/job/${state.jobId}/page/${p.id}/rotate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ angle }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.detail || "旋转失败");
    p.rotate = j.rotate;
    if (j.thumb) p.thumb = j.thumb;
    updateCardThumb(p);
    invalidateResults();
  } catch (e) {
    $("viewSub").textContent = e.message;
  }
  viewBusy = false;
  $("rotCw").disabled = false;
  $("rotCcw").disabled = false;
  loadView();
}

function updateCardThumb(p) {
  const card = $("grid").querySelector(`.card[data-id="${p.id}"]`);
  const img = card && card.querySelector("img");
  if (img && p.thumb) img.src = p.thumb;
}

/* ---------- drag to reorder ---------- */
let drag = null;
const gridEl = $("grid");

function syncTags() {
  [...gridEl.querySelectorAll(".card")].forEach((c, i) => {
    const t = c.querySelector(".tag");
    if (t) t.textContent = "P" + (i + 1);
  });
}

function invalidateResults() {
  state.results = [];
  state.docs = [];
  $("zipBtn").classList.add("hidden");
  refreshSteps();
}

function onGridPointerDown(e) {
  if (isViewOpen() || state.step !== 2) return;
  if (!state.jobId || state.processing) return;
  if (e.pointerType !== "touch" && e.button !== 0) return;
  const card = e.target.closest(".card");
  if (!card || !gridEl.contains(card)) return;
  const fromGrip = !!e.target.closest(".grip");
  drag = {
    card,
    id: card.dataset.id,
    x: e.clientX,
    y: e.clientY,
    fromGrip,
    active: false,
    cancelled: false,
    pointerType: e.pointerType || "mouse",
  };
  document.addEventListener("pointermove", onDragMove);
  document.addEventListener("pointerup", onDragEnd);
  document.addEventListener("pointercancel", onDragEnd);
  if (fromGrip) e.preventDefault();
}

function onDragMove(e) {
  if (!drag) return;
  const dist = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
  if (!drag.active) {
    if (!drag.fromGrip) {
      // plain click / tap on the picture: never reorders, just opens the preview
      if (dist > 12) drag.cancelled = true;
      return;
    }
    if (drag.pointerType === "touch" || dist >= 4) {
      drag.active = true;
      drag.card.classList.add("dragging");
    } else {
      return;
    }
  }
  e.preventDefault();
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const over = el && el.closest ? el.closest(".card") : null;
  if (over && over !== drag.card && gridEl.contains(over)) {
    const cards = [...gridEl.children];
    const from = cards.indexOf(drag.card);
    const to = cards.indexOf(over);
    if (from >= 0 && to >= 0) gridEl.insertBefore(drag.card, from < to ? over.nextSibling : over);
  }
}

function onDragEnd() {
  document.removeEventListener("pointermove", onDragMove);
  document.removeEventListener("pointerup", onDragEnd);
  document.removeEventListener("pointercancel", onDragEnd);
  if (!drag) return;
  const d = drag;
  drag = null;
  d.card.classList.remove("dragging");
  if (d.active) persistOrder();
  else if (!d.cancelled) openView(d.id);
}

async function persistOrder() {
  const ids = [...gridEl.querySelectorAll(".card")].map((c) => c.dataset.id);
  const byId = {};
  state.pages.forEach((p) => { byId[p.id] = p; });
  const next = ids.map((i) => byId[i]).filter(Boolean);
  if (next.length === state.pages.length) state.pages = next;
  syncTags();
  try {
    await fetch(`/api/job/${state.jobId}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: state.pages.map((p) => p.id) }),
    });
  } catch (e) {}
  invalidateResults();
  if (viewId) loadView();
}

function on(id, ev, fn) {
  const el = $(id);
  if (el) el.addEventListener(ev, fn);
}

on("viewCloseBtn", "click", closeView);
on("rotCcw", "click", () => rotateView(-90));
on("rotCw", "click", () => rotateView(90));
on("viewPrev", "click", () => stepView(-1));
on("viewNext", "click", () => stepView(1));
if (gridEl) gridEl.addEventListener("pointerdown", onGridPointerDown);
if (viewModal) viewModal.addEventListener("click", (e) => { if (e.target === viewModal) closeView(); });

/* ---------- convert ---------- */
async function resetToUpload() {
  if (state.jobId) {
    try { await fetch("/api/job/" + state.jobId, { method: "DELETE" }); } catch (e) {}
  }
  clearInterval(state.timer);
  state.jobId = null;
  state.pages = [];
  state.results = [];
  state.docs = [];
  state.docIdx = 0;
  state.processing = false;
  $("grid").innerHTML = "";
  $("pageCount").textContent = "0";
  $("log").textContent = "";
  $("logBox").classList.add("hidden");
  resetProgress();
  $("convertBtn").disabled = false;
  $("upMsg").textContent = "";
  refreshSteps();
  setStep(1);
}

function resetProgress() {
  $("progressWrap").classList.add("hidden");
  $("progressFill").style.width = "0%";
}

$("clearBtn").addEventListener("click", resetToUpload);
$("newBatchBtn").addEventListener("click", resetToUpload);

$("convertBtn").addEventListener("click", async () => {
  if (state.processing) return;
  if (!state.jobId || !state.pages.length) {
    $("upMsg").textContent = "请先上传图片，再开始转换";
    $("convertBtn").disabled = false;
    refreshSteps();
    setStep(1);
    return;
  }
  $("convertBtn").disabled = true;
  state.processing = true;
  refreshSteps();
  $("progressWrap").classList.remove("hidden");
  $("logBox").classList.remove("hidden");
  $("progressFill").style.width = "4%";
  $("progressText").textContent = "开始转换…";
  try {
    // the output settings are fixed (scan / color / high) - config.py is the single source of truth
    const r = await fetch("/api/convert/" + state.jobId, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
      if (r.status === 404) return abortJob("任务已失效（服务可能重启过），请重新上传图片");
      throw new Error(j.detail || "转换失败");
    }
    poll();
  } catch (e) {
    $("progressText").textContent = e.message || "转换失败，请重试";
    $("convertBtn").disabled = false;
    state.processing = false;
    refreshSteps();
  }
});

// never leave the UI stuck in "processing": stop the loop, unlock the buttons
function abortJob(msg) {
  clearInterval(state.timer);
  state.processing = false;
  state.jobId = null;
  state.pages = [];
  state.results = [];
  state.docs = [];
  state.docIdx = 0;
  $("grid").innerHTML = "";
  $("pageCount").textContent = "0";
  $("convertBtn").disabled = false;
  $("progressWrap").classList.add("hidden");
  $("log").textContent = "";
  $("logBox").classList.add("hidden");
  $("upMsg").textContent = msg || "";
  refreshSteps();
  setStep(1);
}

function poll() {
  clearInterval(state.timer);
  let fails = 0;
  state.timer = setInterval(async () => {
    if (!state.jobId) return clearInterval(state.timer);
    let j = null;
    let code = 0;
    try {
      const r = await fetch("/api/job/" + state.jobId);
      code = r.status;
      j = await r.json();
    } catch (e) {
      fails += 1;
      if (fails >= 5) abortJob("无法连接服务，请确认服务在运行后重新上传图片");
      return;
    }
    if (!j || j.detail || (!code || code >= 400)) {
      return abortJob(
        code === 404 ? "任务已失效（服务可能重启过），请重新上传图片" : (j && j.detail) || "查询转换状态失败，请重试"
      );
    }
    fails = 0;
    $("progressFill").style.width = (j.progress || 0) + "%";
    $("progressText").textContent = j.stage || "";
    $("log").textContent = (j.log || []).join("\n");
    const box = $("logBox");
    box.scrollTop = box.scrollHeight;
    if (j.pages) {
      state.pages = j.pages;
      renderPages();
    }
    if (j.status === "done" || j.status === "error") {
      clearInterval(state.timer);
      $("convertBtn").disabled = false;
      state.processing = false;
      if (j.status === "done") {
        state.results = j.results || [];
        state.docs = docsFromResults(state.results);
        refreshSteps();
        const zip = $("zipBtn");
        if (state.results.length > 1) {
          zip.href = "/api/zip/" + state.jobId;
          zip.classList.remove("hidden");
        } else {
          zip.classList.add("hidden");
        }
        if (state.docs.length) {
          setStep(3);
          openDoc(0);
        } else {
          $("progressText").textContent = "转换完成，但没有生成文档";
        }
      } else {
        $("progressText").textContent = "转换失败，请查看下方日志";
      }
      refreshSteps();
    }
  }, 700);
}

/* ---------- reader ---------- */
function docsFromResults(results) {
  return (results || []).map((r) => ({
    id: r.doc_id || "",
    title: r.title || "文档",
    sub: resultMeta(r),
    pages: r.doc_pages || r.pages || 0,
    pdf: r.pdf,
    size: r.size,
    mode: r.mode,
  }));
}

function resultMeta(r) {
  const bits = [];
  if (r.date) bits.push(r.date);
  bits.push(`${r.pages || 0} 页`);
  if (r.size) bits.push(fmtSize(r.size));
  bits.push(r.mode === "scan" ? "扫描件" : "智能重排");
  return bits.join(" · ");
}

function pageUrl(doc, n) {
  return `/api/library/${doc.id}/page/${n}?w=${READ_W}`;
}

function openDoc(idx) {
  if (!state.docs.length) return;
  state.docIdx = Math.min(Math.max(0, idx), state.docs.length - 1);
  const doc = state.docs[state.docIdx];
  $("readTitle").textContent = doc.title || "文档";
  $("readMeta").textContent = doc.sub || "";

  const sel = $("docSelect");
  if (state.docs.length > 1) {
    sel.classList.remove("hidden");
    sel.innerHTML = state.docs
      .map((d, i) => `<option value="${i}" ${i === state.docIdx ? "selected" : ""}>${escapeHtml(d.title || "文档")}</option>`)
      .join("");
  } else {
    sel.classList.add("hidden");
    sel.innerHTML = "";
  }

  $("dlPdf").href = doc.pdf || "#";
  $("dlPdf").download = safeFile(doc.title);
  $("dlPdf").classList.toggle("hidden", !doc.pdf);
  $("readPos").textContent = state.docs.length > 1 ? `文档 ${state.docIdx + 1} / ${state.docs.length}` : "";

  const total = Math.max(1, doc.pages || 1);
  $("pageTotal").textContent = "/ " + total;
  showPage(Math.min(Math.max(1, loadPos(doc.id)), total));
}

function showPage(n) {
  const doc = state.docs[state.docIdx];
  if (!doc) return;
  const total = Math.max(1, doc.pages || 1);
  n = Math.min(Math.max(1, Number(n) || 1), total);
  state.page = n;
  savePos(doc.id, n);
  $("pageInput").value = String(n);
  $("readProgressFill").style.width = (n / total) * 100 + "%";
  $("prevBtn").disabled = n <= 1;
  $("nextBtn").disabled = n >= total;

  const img = $("readerImg");
  const hint = $("readerHint");
  if (!doc.id) {
    img.removeAttribute("src");
    hint.textContent = "该文档的页图不可用，请直接打开或下载 PDF";
    hint.classList.remove("hidden");
    return;
  }
  hint.textContent = `载入第 ${n} 页…`;
  hint.classList.remove("hidden");
  img.classList.add("loading");
  img.onload = () => {
    hint.classList.add("hidden");
    img.classList.remove("loading");
  };
  img.onerror = () => {
    hint.textContent = `第 ${n} 页载入失败（文档可能已从阅读历史中删除）`;
    hint.classList.remove("hidden");
    img.classList.remove("loading");
  };
  img.src = pageUrl(doc, n);

  if (n < total) {
    const pre = new Image();
    pre.src = pageUrl(doc, n + 1);
  }
}

function setFit(f) {
  state.fit = f === "p" ? "p" : "w";
  $("readerStage").dataset.fit = state.fit;
  $("fitWBtn").classList.toggle("active", state.fit === "w");
  $("fitPBtn").classList.toggle("active", state.fit === "p");
  try { localStorage.setItem("readfit", state.fit); } catch (e) {}
}

$("prevBtn").addEventListener("click", () => showPage(state.page - 1));
$("nextBtn").addEventListener("click", () => showPage(state.page + 1));
$("fitWBtn").addEventListener("click", () => setFit("w"));
$("fitPBtn").addEventListener("click", () => setFit("p"));
$("pageInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    showPage(parseInt($("pageInput").value, 10));
    $("pageInput").blur();
  }
});
$("pageInput").addEventListener("change", () => showPage(parseInt($("pageInput").value, 10)));
$("docSelect").addEventListener("change", (e) => openDoc(Number(e.target.value)));

document.addEventListener("keydown", (e) => {
  if (!$("libModal").classList.contains("hidden")) {
    if (e.key === "Escape") closeLib();
    return;
  }
  if (isViewOpen()) {
    if (e.key === "Escape") return closeView();
    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") { stepView(1); e.preventDefault(); }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { stepView(-1); e.preventDefault(); }
    return;
  }
  if (state.step !== 3) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
  switch (e.key) {
    case "ArrowRight":
    case "PageDown":
    case " ":
      showPage(state.page + 1);
      e.preventDefault();
      break;
    case "ArrowLeft":
    case "PageUp":
      showPage(state.page - 1);
      e.preventDefault();
      break;
    case "Home":
      showPage(1);
      e.preventDefault();
      break;
    case "End":
      showPage(Math.max(1, (state.docs[state.docIdx] || {}).pages || 1));
      e.preventDefault();
      break;
  }
});

let touchX = null;
$("readerStage").addEventListener("touchstart", (e) => {
  touchX = e.changedTouches[0].clientX;
}, { passive: true });
$("readerStage").addEventListener("touchend", (e) => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) < 45) return;
  showPage(state.page + (dx < 0 ? 1 : -1));
}, { passive: true });

/* ---------- reading history ---------- */
const libModal = $("libModal");

function openLib() {
  libModal.classList.remove("hidden");
  refreshLib();
}
function closeLib() {
  libModal.classList.add("hidden");
}

$("libBtn").addEventListener("click", openLib);
$("libCloseBtn").addEventListener("click", closeLib);
libModal.addEventListener("click", (e) => {
  if (e.target === libModal) closeLib();
});

async function refreshLib() {
  const box = $("libList");
  try {
    const r = await fetch("/api/library");
    const j = await r.json();
    state.lib = j.docs || [];
  } catch (e) {
    state.lib = [];
    box.innerHTML = "<p class='lib-empty'>加载失败，请确认服务在运行</p>";
    return;
  }
  renderLib();
}

function renderLib() {
  const box = $("libList");
  const docs = state.lib;
  $("libSub").textContent = docs.length ? `本机共 ${docs.length} 份文档 · 仅保留满意的版本` : "本机保存的转换结果";
  $("libClearBtn").disabled = !docs.length;
  if (!docs.length) {
    box.innerHTML = `
      <div class="lib-empty">
        <p>还没有阅读记录</p>
        <p class="sub">每次转换完成的文档会自动保存在这里，可随时继续阅读，或删除不满意的版本。</p>
      </div>`;
    return;
  }
  box.innerHTML = "";
  docs.forEach((d, i) => {
    const el = document.createElement("div");
    el.className = "lib-item";
    const meta = [fmtDate(d.created), `${d.pages || 0} 页`, fmtSize(d.size), d.mode === "scan" ? "扫描件" : "智能重排"]
      .filter(Boolean)
      .join(" · ");
    el.innerHTML = `
      <div class="lib-thumb">${d.thumb ? `<img src="${d.thumb}" alt="">` : ""}</div>
      <div class="lib-info">
        <h4>${escapeHtml(d.title || "文档")}</h4>
        <p>${escapeHtml(meta)}</p>
      </div>
      <div class="lib-btns">
        <button class="btn primary small" data-read="${i}" type="button">阅读</button>
        <a class="btn ghost small" href="${d.pdf}" download="${escapeHtml(safeFile(d.title))}">下载</a>
        <button class="btn ghost small" data-del="${i}" type="button">删除</button>
      </div>`;
    box.appendChild(el);
  });
  box.querySelectorAll("[data-read]").forEach((b) =>
    b.addEventListener("click", () => readFromLibrary(Number(b.dataset.read)))
  );
  box.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      const i = Number(b.dataset.del);
      const d = state.lib[i];
      if (!d) return;
      try { await fetch("/api/library/" + d.id, { method: "DELETE" }); } catch (e) {}
      await refreshLib();
    })
  );
}

function readFromLibrary(i) {
  const d = state.lib[i];
  if (!d) return;
  closeLib();
  state.docs = [{
    id: d.id,
    title: d.title || "文档",
    sub: [fmtDate(d.created), `${d.pages || 0} 页`, fmtSize(d.size), d.mode === "scan" ? "扫描件" : "智能重排"].filter(Boolean).join(" · "),
    pages: d.pages || 0,
    pdf: d.pdf,
    size: d.size,
    mode: d.mode,
  }];
  state.docIdx = 0;
  refreshSteps();
  setStep(3);
  openDoc(0);
}

$("libClearBtn").addEventListener("click", async () => {
  if (!state.lib.length) return;
  if (!confirm("确定清空全部阅读历史？删除后无法恢复。")) return;
  try { await fetch("/api/library", { method: "DELETE" }); } catch (e) {}
  await refreshLib();
});

/* ---------- init ---------- */
try {
  const saved = localStorage.getItem("readfit");
  if (saved) state.fit = saved;
} catch (e) {}
setFit(state.fit);
refreshSteps();
checkHealth();
