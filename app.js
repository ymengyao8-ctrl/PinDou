const els = {
  input: document.querySelector("#imageInput"),
  download: document.querySelector("#downloadButton"),
  usePattern: document.querySelector("#usePatternButton"),
  canvas: document.querySelector("#patternCanvas"),
  empty: document.querySelector("#emptyState"),
  paletteSelect: document.querySelector("#paletteSelect"),
  boardPreset: document.querySelector("#boardPreset"),
  fitMode: document.querySelector("#fitMode"),
  detailLevel: document.querySelector("#detailLevel"),
  fillTransparentGaps: document.querySelector("#fillTransparentGaps"),
  transparentGapHint: document.querySelector("#transparentGapHint"),
  regenerate: document.querySelector("#regenerateButton"),
  enableCutout: document.querySelector("#enableCutout"),
  cutoutCanvas: document.querySelector("#cutoutCanvas"),
  resetCutout: document.querySelector("#resetCutout"),
  fullCutout: document.querySelector("#fullCutout"),
  autoRemoveBg: document.querySelector("#autoRemoveBg"),
  cutoutThreshold: document.querySelector("#cutoutThreshold"),
  cutoutThresholdValue: document.querySelector("#cutoutThresholdValue"),
  cutoutHint: document.querySelector("#cutoutHint"),
  showCodes: document.querySelector("#showCodes"),
  showCoords: document.querySelector("#showCoords"),
  showGrid: document.querySelector("#showGrid"),
  renderScale: document.querySelector("#renderScale"),
  focusColor: document.querySelector("#focusColor"),
  replaceFrom: document.querySelector("#replaceFrom"),
  replaceTo: document.querySelector("#replaceTo"),
  replaceSuggestions: document.querySelector("#replaceSuggestions"),
  applyReplace: document.querySelector("#applyReplace"),
  resetColors: document.querySelector("#resetColors"),
  sortMode: document.querySelector("#sortMode"),
  summary: document.querySelector("#summary"),
  beadList: document.querySelector("#beadList"),
};

const ctx = els.canvas.getContext("2d");
const sampleCanvas = document.createElement("canvas");
const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
const cutoutCtx = els.cutoutCanvas.getContext("2d");

const state = {
  image: null,
  cells: [],
  counts: new Map(),
  replacements: new Map(),
  board: { width: 50, height: 50, unit: 50 },
  paletteKey: "mard291",
  transparentGapCount: 0,
  preferredReplaceFrom: "",
  cutout: {
    rect: null,
    dragging: false,
    dragStart: null,
  },
};

const paletteCache = new Map();
const tileCache = new Map();
const TRANSPARENT_BEAD = {
  code: "透明",
  name: "透明豆",
  hex: "#DCE8F4",
  rgb: [220, 232, 244],
  lab: rgbToLab([220, 232, 244]),
  transparent: true,
};

init();

function init() {
  populatePaletteSelect();
  updateLabels();
  bindEvents();
  renderCutoutPreview();
  renderLists();
  loadDemoImageIfNeeded();
}

function bindEvents() {
  els.input.addEventListener("change", handleImageUpload);
  els.download.addEventListener("click", downloadPattern);
  els.usePattern.addEventListener("click", usePatternInDigitalStudio);
  els.paletteSelect.addEventListener("change", () => {
    state.paletteKey = els.paletteSelect.value;
    state.replacements.clear();
    buildAndRender();
  });
  els.boardPreset.addEventListener("change", buildAndRender);
  els.fitMode.addEventListener("change", buildAndRender);
  els.detailLevel.addEventListener("change", buildAndRender);
  els.fillTransparentGaps.addEventListener("change", buildAndRender);
  els.regenerate.addEventListener("click", buildAndRender);
  els.enableCutout.addEventListener("change", () => {
    if (els.enableCutout.checked && !state.cutout.rect) setDefaultCutoutRect();
    renderCutoutPreview();
    buildAndRender();
  });
  els.autoRemoveBg.addEventListener("change", buildAndRender);
  els.cutoutThreshold.addEventListener("input", () => {
    updateLabels();
    buildAndRender();
  });
  els.resetCutout.addEventListener("click", () => {
    els.enableCutout.checked = true;
    setDefaultCutoutRect();
    renderCutoutPreview();
    buildAndRender();
  });
  els.fullCutout.addEventListener("click", () => {
    els.enableCutout.checked = true;
    state.cutout.rect = { x: 0, y: 0, w: 1, h: 1 };
    renderCutoutPreview();
    buildAndRender();
  });
  els.cutoutCanvas.addEventListener("pointerdown", startCutoutDrag);
  els.cutoutCanvas.addEventListener("pointermove", moveCutoutDrag);
  els.cutoutCanvas.addEventListener("pointerup", endCutoutDrag);
  els.cutoutCanvas.addEventListener("pointerleave", endCutoutDrag);
  els.showCodes.addEventListener("change", renderPattern);
  els.showCoords.addEventListener("change", renderPattern);
  els.showGrid.addEventListener("change", renderPattern);
  els.renderScale.addEventListener("change", renderPattern);
  els.focusColor.addEventListener("change", renderPattern);
  els.replaceFrom.addEventListener("change", () => {
    state.preferredReplaceFrom = els.replaceFrom.value;
    updateReplaceTargets("");
    renderReplaceSuggestions();
  });
  els.replaceTo.addEventListener("change", renderReplaceSuggestions);
  els.sortMode.addEventListener("change", () => {
    renderLists();
    renderPattern();
  });
  els.applyReplace.addEventListener("click", applyReplacement);
  els.resetColors.addEventListener("click", resetReplacements);
  els.replaceSuggestions.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-code]");
    if (!button) return;
    els.replaceTo.value = button.dataset.code;
    renderReplaceSuggestions();
  });
}

function populatePaletteSelect() {
  const palettes = window.BEAD_PALETTES || {};
  els.paletteSelect.innerHTML = Object.entries(palettes)
    .map(([key, palette]) => {
      const count = palette.colors.length;
      return `<option value="${key}">${palette.name}（${count} 色）</option>`;
    })
    .join("");
  if (palettes.mard291) els.paletteSelect.value = "mard291";
  state.paletteKey = els.paletteSelect.value;
}

function handleImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      state.image = image;
      state.replacements.clear();
      setDefaultCutoutRect();
      els.empty.style.display = "none";
      els.canvas.style.display = "block";
      renderCutoutPreview();
      buildAndRender();
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function loadDemoImageIfNeeded() {
  const params = new URLSearchParams(window.location.search);
  const demo = params.get("demo");
  if (!demo) return;

  const image = new Image();
  image.onload = () => {
    state.image = image;
    state.replacements.clear();
    setDefaultCutoutRect();
    els.empty.style.display = "none";
    els.canvas.style.display = "block";
    renderCutoutPreview();
    buildAndRender();
  };
  image.src = demo === "1" ? "./test-upload.png" : demo;
}

function buildAndRender() {
  updateLabels();
  parseBoardPreset();
  if (!state.image) {
    renderLists();
    return;
  }
  buildPattern();
  renderPattern();
  els.usePattern.disabled = false;
}

function usePatternInDigitalStudio() {
  if (!state.cells.length) return;
  const pattern = {
    version: 1,
    width: state.board.width,
    height: state.board.height,
    unit: state.board.unit,
    paletteKey: state.paletteKey,
    paletteName: window.BEAD_PALETTES[state.paletteKey]?.name || state.paletteKey,
    cells: state.cells.map((cell) => {
      const bead = finalBeadForCell(cell);
      return bead ? { code: bead.code, hex: bead.hex } : null;
    }),
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem("digitalBeadPattern", JSON.stringify(pattern));
  window.location.href = "./digital-beads/";
}

function updateLabels() {
  const hasGaps = state.transparentGapCount > 0;
  els.fillTransparentGaps.disabled = !hasGaps;
  if (!hasGaps) els.fillTransparentGaps.checked = false;
  els.transparentGapHint.textContent = hasGaps
    ? `检测到 ${state.transparentGapCount} 个图片内部透明空隙，可选择是否放透明豆`
    : "没有检测到图片内部透明空隙";
  els.cutoutThresholdValue.value = els.cutoutThreshold.value;
  els.cutoutHint.textContent = state.image
    ? "在预览里拖框框住主体；框外全部无豆"
    : "上传图片后，在预览里拖框框住主体";
}

function parseBoardPreset() {
  const [size, unitText] = els.boardPreset.value.split(":");
  const [width, height] = size.split("x").map(Number);
  state.board = { width, height, unit: Number(unitText) };
}

function currentPalette() {
  if (paletteCache.has(state.paletteKey)) return paletteCache.get(state.paletteKey);
  const raw = window.BEAD_PALETTES[state.paletteKey].colors.map((color) => {
    const rgb = hexToRgb(color.hex);
    return { ...color, rgb, lab: rgbToLab(rgb) };
  });
  paletteCache.set(state.paletteKey, raw);
  return raw;
}

function buildPattern() {
  const { width, height } = state.board;
  sampleCanvas.width = width;
  sampleCanvas.height = height;
  sampleCtx.clearRect(0, 0, width, height);

  const draw = getImageDrawRect(width, height, state.image.width, state.image.height, els.fitMode.value);
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.imageSmoothingQuality = "high";
  sampleCtx.drawImage(state.image, draw.x, draw.y, draw.width, draw.height);

  const imageData = sampleCtx.getImageData(0, 0, width, height);
  const palette = currentPalette();
  const cutoutMask = buildCutoutMask(imageData, width, height, draw);

  state.transparentGapCount = countTransparentGaps(imageData, width, height, draw);
  updateLabels();
  state.cells = simplifyCells(mapDirect(imageData, width, height, palette, draw, cutoutMask), width, height);

  computeCounts();
  renderLists();
}

function getImageDrawRect(boardW, boardH, imageW, imageH, mode) {
  const boardRatio = boardW / boardH;
  const imageRatio = imageW / imageH;
  const cover = mode === "cover";
  const useWidth = cover ? imageRatio < boardRatio : imageRatio > boardRatio;
  const width = useWidth ? boardW : boardH * imageRatio;
  const height = useWidth ? boardW / imageRatio : boardH;
  return {
    x: Math.round((boardW - width) / 2),
    y: Math.round((boardH - height) / 2),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function mapDirect(imageData, width, height, palette, draw, cutoutMask) {
  const cells = [];
  const data = imageData.data;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const point = y * width + x;
      if (cutoutMask && !cutoutMask[point]) {
        cells.push(null);
        continue;
      }
      const alpha = data[index + 3];
      const rgb = compositeOnWhite([data[index], data[index + 1], data[index + 2]], alpha);
      cells.push(sampleToBead(x, y, rgb, alpha, palette, draw));
    }
  }
  return cells;
}

function setDefaultCutoutRect() {
  if (!state.image) return;
  state.cutout.rect = { x: 0.18, y: 0.08, w: 0.64, h: 0.84 };
}

function activeCutoutRect() {
  return state.cutout.rect || { x: 0, y: 0, w: 1, h: 1 };
}

function renderCutoutPreview() {
  const canvas = els.cutoutCanvas;
  const context = cutoutCtx;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f8f9fb";
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (!state.image) {
    context.fillStyle = "#7a8491";
    context.font = "700 13px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("上传后在这里框选主体", canvas.width / 2, canvas.height / 2);
    return;
  }

  const fit = fitImageInBox(canvas.width, canvas.height, state.image.width, state.image.height);
  context.drawImage(state.image, fit.x, fit.y, fit.width, fit.height);

  const rect = activeCutoutRect();
  const rx = fit.x + rect.x * fit.width;
  const ry = fit.y + rect.y * fit.height;
  const rw = rect.w * fit.width;
  const rh = rect.h * fit.height;

  context.fillStyle = "rgba(17, 24, 39, 0.42)";
  context.fillRect(fit.x, fit.y, fit.width, fit.height);
  context.save();
  context.beginPath();
  context.rect(rx, ry, rw, rh);
  context.clip();
  context.drawImage(state.image, fit.x, fit.y, fit.width, fit.height);
  context.restore();

  context.strokeStyle = els.enableCutout.checked ? "#235f9e" : "#8b95a3";
  context.lineWidth = 3;
  context.strokeRect(rx, ry, rw, rh);
  context.fillStyle = els.enableCutout.checked ? "#235f9e" : "#8b95a3";
  context.font = "800 12px system-ui, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillText("主体", rx + 8, ry + 17);
}

function fitImageInBox(boxW, boxH, imageW, imageH) {
  const scale = Math.min(boxW / imageW, boxH / imageH);
  const width = imageW * scale;
  const height = imageH * scale;
  return {
    x: (boxW - width) / 2,
    y: (boxH - height) / 2,
    width,
    height,
  };
}

function previewPointToNorm(event) {
  const canvas = els.cutoutCanvas;
  const bounds = canvas.getBoundingClientRect();
  const px = ((event.clientX - bounds.left) / bounds.width) * canvas.width;
  const py = ((event.clientY - bounds.top) / bounds.height) * canvas.height;
  const fit = fitImageInBox(canvas.width, canvas.height, state.image.width, state.image.height);
  return {
    x: clamp((px - fit.x) / fit.width, 0, 1),
    y: clamp((py - fit.y) / fit.height, 0, 1),
  };
}

function startCutoutDrag(event) {
  if (!state.image) return;
  els.enableCutout.checked = true;
  const point = previewPointToNorm(event);
  state.cutout.dragging = true;
  state.cutout.dragStart = point;
  state.cutout.rect = { x: point.x, y: point.y, w: 0.01, h: 0.01 };
  els.cutoutCanvas.setPointerCapture?.(event.pointerId);
  renderCutoutPreview();
}

function moveCutoutDrag(event) {
  if (!state.cutout.dragging || !state.image) return;
  const start = state.cutout.dragStart;
  const point = previewPointToNorm(event);
  state.cutout.rect = normalizeRect(start, point);
  renderCutoutPreview();
}

function endCutoutDrag(event) {
  if (!state.cutout.dragging) return;
  state.cutout.dragging = false;
  els.cutoutCanvas.releasePointerCapture?.(event.pointerId);
  const rect = state.cutout.rect;
  if (rect.w < 0.03 || rect.h < 0.03) setDefaultCutoutRect();
  renderCutoutPreview();
  buildAndRender();
}

function normalizeRect(a, b) {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x, b.x);
  const y2 = Math.max(a.y, b.y);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function buildCutoutMask(imageData, width, height, draw) {
  if (!els.enableCutout.checked || !state.cutout.rect) return null;
  const allowed = new Array(width * height).fill(false);
  const rect = activeCutoutRect();
  const data = imageData.data;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const point = y * width + x;
      if (!isInsideDrawRect(x, y, draw)) continue;
      const norm = boardPointToImageNorm(x, y, draw);
      allowed[point] =
        norm.x >= rect.x && norm.x <= rect.x + rect.w && norm.y >= rect.y && norm.y <= rect.y + rect.h;
    }
  }

  if (!els.autoRemoveBg.checked) return allowed;
  removeConnectedBackground(allowed, data, width, height);
  return allowed;
}

function boardPointToImageNorm(x, y, draw) {
  return {
    x: (x + 0.5 - draw.x) / draw.width,
    y: (y + 0.5 - draw.y) / draw.height,
  };
}

function removeConnectedBackground(allowed, data, width, height) {
  const seeds = [];
  const visited = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const point = y * width + x;
      if (!allowed[point] || !touchesOutsideAllowed(allowed, width, height, x, y)) continue;
      seeds.push(point);
    }
  }
  const seedColors = dominantEdgeColors(seeds, data);

  const threshold = Number(els.cutoutThreshold.value);
  const thresholdSq = threshold * threshold;
  const queue = seeds.slice();
  for (const point of seeds) visited[point] = 1;

  while (queue.length) {
    const point = queue.shift();
    if (minColorDistanceSq(pixelRgb(data, point), seedColors) > thresholdSq) continue;
    allowed[point] = false;

    const x = point % width;
    const y = Math.floor(point / width);
    for (const next of neighborPoints(width, height, x, y)) {
      if (!allowed[next] || visited[next]) continue;
      visited[next] = 1;
      queue.push(next);
    }
  }
}

function dominantEdgeColors(points, data) {
  const buckets = new Map();
  for (const point of points) {
    const rgb = pixelRgb(data, point);
    const key = rgb.map((value) => Math.round(value / 28)).join("-");
    const bucket = buckets.get(key) || { count: 0, sum: [0, 0, 0] };
    bucket.count += 1;
    bucket.sum[0] += rgb[0];
    bucket.sum[1] += rgb[1];
    bucket.sum[2] += rgb[2];
    buckets.set(key, bucket);
  }

  const ranked = [...buckets.values()].sort((a, b) => b.count - a.count);
  const strongest = ranked[0]?.count || 0;
  return ranked
    .filter((bucket) => bucket.count >= Math.max(3, strongest * 0.18))
    .slice(0, 8)
    .map((bucket) => bucket.sum.map((value) => Math.round(value / bucket.count)));
}

function touchesOutsideAllowed(allowed, width, height, x, y) {
  for (const point of neighborPoints(width, height, x, y)) {
    if (!allowed[point]) return true;
  }
  return x === 0 || y === 0 || x === width - 1 || y === height - 1;
}

function neighborPoints(width, height, x, y) {
  const points = [];
  if (x > 0) points.push(y * width + x - 1);
  if (x < width - 1) points.push(y * width + x + 1);
  if (y > 0) points.push((y - 1) * width + x);
  if (y < height - 1) points.push((y + 1) * width + x);
  return points;
}

function pixelRgb(data, point) {
  const index = point * 4;
  return compositeOnWhite([data[index], data[index + 1], data[index + 2]], data[index + 3]);
}

function minColorDistanceSq(rgb, colors) {
  let best = Number.POSITIVE_INFINITY;
  for (const color of colors) {
    const distance =
      (rgb[0] - color[0]) ** 2 + (rgb[1] - color[1]) ** 2 + (rgb[2] - color[2]) ** 2;
    if (distance < best) best = distance;
  }
  return best;
}

function countTransparentGaps(imageData, width, height, draw) {
  let count = 0;
  const data = imageData.data;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isInsideDrawRect(x, y, draw)) continue;
      const index = (y * width + x) * 4;
      if (data[index + 3] < 30) count += 1;
    }
  }
  return count;
}

function compositeOnWhite(rgb, alpha) {
  const opacity = alpha / 255;
  return rgb.map((value) => Math.round(value * opacity + 255 * (1 - opacity)));
}

function sampleToBead(x, y, rgb, alpha, palette, draw) {
  if (!isInsideDrawRect(x, y, draw)) return null;
  if (alpha < 30) return els.fillTransparentGaps.checked ? TRANSPARENT_BEAD : null;
  return nearestPaletteColor(rgb, palette);
}

function isInsideDrawRect(x, y, draw) {
  return x >= draw.x && x < draw.x + draw.width && y >= draw.y && y < draw.y + draw.height;
}

function nearestPaletteColor(rgb, palette) {
  const lab = rgbToLab(rgb);
  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const color of palette) {
    const distance = labDistance(lab, color.lab);
    if (distance < bestDistance) {
      best = color;
      bestDistance = distance;
    }
  }
  return best;
}

function simplifyCells(cells, width, height) {
  const settings = detailSettings();
  let result = cells;
  if (settings.smoothingPasses) {
    for (let i = 0; i < settings.smoothingPasses; i += 1) {
      result = smoothCells(result, width, height);
    }
  }
  if (settings.maxColors) {
    result = limitColors(result, settings.maxColors);
  }
  return result;
}

function detailSettings() {
  const level = els.detailLevel.value;
  if (level === "photo") return { smoothingPasses: 0, maxColors: 0 };
  if (level === "balanced") return { smoothingPasses: 1, maxColors: 55 };
  if (level === "simple") return { smoothingPasses: 3, maxColors: 20 };
  return { smoothingPasses: 2, maxColors: 36 };
}

function smoothCells(cells, width, height) {
  const next = cells.slice();
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const current = cells[index];
      if (!current?.code || current.transparent) continue;

      const counts = new Map();
      for (let yy = y - 1; yy <= y + 1; yy += 1) {
        for (let xx = x - 1; xx <= x + 1; xx += 1) {
          const neighbor = cells[yy * width + xx];
          if (!neighbor?.code || neighbor.transparent) continue;
          counts.set(neighbor.code, (counts.get(neighbor.code) || 0) + 1);
        }
      }

      let bestCode = current.code;
      let bestCount = counts.get(current.code) || 0;
      for (const [code, count] of counts.entries()) {
        if (count > bestCount) {
          bestCode = code;
          bestCount = count;
        }
      }
      if (bestCode !== current.code && bestCount >= 5) {
        next[index] = colorLookup().get(bestCode) || current;
      }
    }
  }
  return next;
}

function limitColors(cells, maxColors) {
  const counts = new Map();
  for (const cell of cells) {
    if (!cell?.code || cell.transparent) continue;
    counts.set(cell.code, (counts.get(cell.code) || 0) + 1);
  }
  if (counts.size <= maxColors) return cells;

  const lookup = colorLookup();
  const keptCodes = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || compareCodes(a[0], b[0]))
    .slice(0, maxColors)
    .map(([code]) => code);
  const kept = keptCodes.map((code) => lookup.get(code)).filter(Boolean);
  const remap = new Map();

  return cells.map((cell) => {
    if (!cell?.code || cell.transparent || keptCodes.includes(cell.code)) return cell;
    if (!remap.has(cell.code)) {
      remap.set(cell.code, nearestPaletteColor(cell.rgb, kept));
    }
    return remap.get(cell.code);
  });
}

function computeCounts() {
  state.counts = new Map();
  for (const cell of state.cells) {
    if (!cell) continue;
    const finalCode = resolveReplacement(cell.code);
    state.counts.set(finalCode, (state.counts.get(finalCode) || 0) + 1);
  }
}

function renderPattern() {
  if (!state.image || !state.cells.length) return;

  const { width, height, unit } = state.board;
  const cell = chooseCellSize(width, height);
  const margin = els.showCoords.checked ? 34 : 18;
  const rows = sortedCountRows();
  const titleHeight = 64;
  const legendGap = 20;
  const gridW = width * cell;
  const gridH = height * cell;
  const legend = legendLayout(rows.length, gridH);
  const canvasWidth = margin * 2 + gridW + legendGap + legend.width;
  const canvasHeight = Math.max(titleHeight + margin * 2 + gridH, titleHeight + margin * 2 + legend.height, 620);
  const gridX = margin;
  const gridY = titleHeight + margin;
  const focus = els.focusColor.value;
  tileCache.clear();

  els.canvas.width = canvasWidth;
  els.canvas.height = canvasHeight;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  drawTitle(width, height);
  drawCells(gridX, gridY, cell, focus);
  if (els.showGrid.checked) drawGrid(gridX, gridY, cell, width, height, unit);
  if (els.showCoords.checked) drawCoords(gridX, gridY, cell, width, height);
  drawLegend(gridX + gridW + legendGap, titleHeight + margin, legend, rows);
}

function chooseCellSize(width, height) {
  const requested = Number(els.renderScale.value);
  return clamp(requested, 16, 30);
}

function drawTitle(width, height) {
  const paletteName = window.BEAD_PALETTES[state.paletteKey].name;
  const total = totalBeads();
  ctx.fillStyle = "#151922";
  ctx.font = "700 30px system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(`拼豆图纸 [${width}x${height}/${state.counts.size}色/共${total}颗]`, 18, 14);
  ctx.fillStyle = "#66707e";
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.fillText(`${paletteName} · 空白格不放豆 · 每格文字为购买色号`, 20, 48);
}

function drawCells(gridX, gridY, cell, focus) {
  const { width, height } = state.board;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const bead = finalBeadForCell(state.cells[y * width + x]);
      const left = gridX + x * cell;
      const top = gridY + y * cell;
      const hidden = focus && bead?.code !== focus;
      if (!bead) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(left, top, cell, cell);
        continue;
      }
      ctx.drawImage(cellTile(bead, cell, hidden), left, top);
    }
  }
}

function cellTile(bead, cell, hidden) {
  const key = `${bead.code}|${bead.hex}|${cell}|${hidden}|${els.showCodes.checked}`;
  if (tileCache.has(key)) return tileCache.get(key);

  const tile = document.createElement("canvas");
  tile.width = cell;
  tile.height = cell;
  const tileCtx = tile.getContext("2d");
  tileCtx.fillStyle = hidden ? "#f4f6f8" : bead.hex;
  tileCtx.fillRect(0, 0, cell, cell);

  if (hidden) {
    tileCtx.strokeStyle = "rgba(104,112,125,0.3)";
    tileCtx.lineWidth = 1;
    tileCtx.beginPath();
    tileCtx.moveTo(cell * 0.25, cell * 0.75);
    tileCtx.lineTo(cell * 0.75, cell * 0.25);
    tileCtx.stroke();
  } else if (els.showCodes.checked && cell >= 12) {
    tileCtx.fillStyle = contrastColor(bead.hex);
    tileCtx.font = `700 ${Math.max(6, Math.floor(cell * 0.34))}px Arial, sans-serif`;
    tileCtx.textAlign = "center";
    tileCtx.textBaseline = "middle";
    tileCtx.fillText(bead.code, cell / 2, cell / 2 + 0.5);
  }

  tileCache.set(key, tile);
  return tile;
}

function drawGrid(gridX, gridY, cell, width, height, unit) {
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 1) {
    const major = x % 10 === 0 || x % unit === 0 || x === width;
    ctx.strokeStyle = x % unit === 0 ? "rgba(202,93,49,0.82)" : major ? "#30343b" : "#b7bdc5";
    ctx.lineWidth = major ? 1.4 : 0.6;
    line(gridX + x * cell, gridY, gridX + x * cell, gridY + height * cell);
  }
  for (let y = 0; y <= height; y += 1) {
    const major = y % 10 === 0 || y % unit === 0 || y === height;
    ctx.strokeStyle = y % unit === 0 ? "rgba(202,93,49,0.82)" : major ? "#30343b" : "#b7bdc5";
    ctx.lineWidth = major ? 1.4 : 0.6;
    line(gridX, gridY + y * cell, gridX + width * cell, gridY + y * cell);
  }
}

function drawCoords(gridX, gridY, cell, width, height) {
  ctx.fillStyle = "#69727f";
  ctx.font = "700 8px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let x = 1; x <= width; x += 1) {
    if (x === 1 || x === width || x % 5 === 0) {
      const px = gridX + (x - 0.5) * cell;
      ctx.fillText(String(x), px, gridY - 10);
      ctx.fillText(String(x), px, gridY + height * cell + 10);
    }
  }
  for (let y = 1; y <= height; y += 1) {
    if (y === 1 || y === height || y % 5 === 0) {
      const py = gridY + (y - 0.5) * cell;
      ctx.fillText(String(y), gridX - 12, py);
      ctx.fillText(String(y), gridX + width * cell + 12, py);
    }
  }
}

function legendLayout(rowCount, gridHeight) {
  const rowHeight = 28;
  const headerHeight = 44;
  const footerPadding = 10;
  const minRowsPerColumn = 18;
  const rowsPerColumn = Math.max(minRowsPerColumn, Math.floor((Math.max(gridHeight, 560) - headerHeight - footerPadding) / rowHeight));
  const columns = Math.max(1, Math.ceil(rowCount / rowsPerColumn));
  const rowsInTallestColumn = Math.min(rowCount || 1, rowsPerColumn);
  const columnWidth = 220;
  return {
    columnWidth,
    columns,
    rowsPerColumn,
    rowHeight,
    width: columns * columnWidth + 18,
    height: headerHeight + rowsInTallestColumn * rowHeight + footerPadding,
  };
}

function drawLegend(x, y, legend, rows) {
  ctx.fillStyle = "#f7f8fa";
  ctx.strokeStyle = "#30343b";
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, legend.width, legend.height);
  ctx.strokeRect(x, y, legend.width, legend.height);

  ctx.fillStyle = "#151922";
  ctx.font = "800 16px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("色号用量", x + 14, y + 12);

  rows.forEach((row, index) => {
    const column = Math.floor(index / legend.rowsPerColumn);
    const rowInColumn = index % legend.rowsPerColumn;
    const left = x + 14 + column * legend.columnWidth;
    const top = y + 44 + rowInColumn * legend.rowHeight;
    ctx.fillStyle = row.hex;
    ctx.fillRect(left, top, 18, 18);
    ctx.strokeStyle = "#5f6875";
    ctx.strokeRect(left, top, 18, 18);
    ctx.fillStyle = "#151922";
    ctx.font = "700 12px Arial, sans-serif";
    ctx.fillText(row.code, left + 28, top + 1);
    ctx.fillStyle = "#596271";
    ctx.font = "600 12px Arial, sans-serif";
    ctx.fillText(`${row.count} 颗`, left + legend.columnWidth - 78, top + 1);
  });
}

function renderLists() {
  const selectedFocus = els.focusColor.value;
  const selectedFrom = els.replaceFrom.value;
  const selectedTo = els.replaceTo.value;
  const rows = sortedCountRows();
  const rowCodes = new Set(rows.map((row) => row.code));

  els.focusColor.innerHTML = '<option value="">全部色号</option>' + rows.map(optionMarkup).join("");
  els.replaceFrom.innerHTML = rows.map(optionMarkup).join("");

  if (selectedFocus && rowCodes.has(selectedFocus)) els.focusColor.value = selectedFocus;
  const nextFrom = chooseReplaceFrom(rowCodes, selectedFrom, selectedFocus);
  if (nextFrom) els.replaceFrom.value = nextFrom;
  updateReplaceTargets(selectedTo);

  els.summary.innerHTML = `
    <dt>板面尺寸</dt><dd>${state.board.width} x ${state.board.height}</dd>
    <dt>颜色数量</dt><dd>${rows.length}</dd>
    <dt>豆子总数</dt><dd>${totalBeads()}</dd>
  `;

  els.beadList.innerHTML = rows
    .map((row) => {
      const replaced = state.replacements.has(row.originalCode)
        ? `<span class="muted">${row.originalCode} -> </span>`
        : "";
      return `
        <div class="swatch-row">
          <span class="swatch" style="--swatch:${row.hex}"></span>
          <span class="swatch-code">${replaced}${row.code}</span>
          <span class="count">${row.count}</span>
        </div>
      `;
    })
    .join("") || '<p class="muted">上传图片后显示用量</p>';

  renderReplaceSuggestions();
}

function chooseReplaceFrom(rowCodes, selectedFrom, selectedFocus) {
  const candidates = [
    state.preferredReplaceFrom,
    selectedFocus,
    resolveReplacement(selectedFrom),
    selectedFrom,
  ];
  return candidates.find((code) => code && rowCodes.has(code)) || "";
}

function optionMarkup(row) {
  const count = Number.isFinite(row.count) ? ` · ${row.count}颗` : "";
  const hex = row.hex ? ` · ${row.hex}` : "";
  return `<option value="${row.code}">${row.code}${count}${hex}</option>`;
}

function sortedCountRows() {
  const lookup = colorLookup();
  const rows = [...state.counts.entries()]
    .map(([code, count]) => {
      const color = lookup.get(code);
      return {
        code,
        originalCode: code,
        count,
        hex: color?.hex || "#ffffff",
      };
    });
  return sortRows(rows, els.sortMode.value);
}

function sortRows(rows, mode) {
  return [...rows].sort((a, b) => {
    if (mode === "count") return b.count - a.count || compareCodes(a.code, b.code);
    return compareCodes(a.code, b.code);
  });
}

function compareCodes(a, b) {
  const left = parseCode(a);
  const right = parseCode(b);
  return (
    left.prefix.localeCompare(right.prefix) ||
    left.number - right.number ||
    left.suffix.localeCompare(right.suffix) ||
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
}

function parseCode(code) {
  const match = String(code).match(/^([A-Za-z]+)(\d+)?(.*)$/);
  if (!match) return { prefix: code, number: Number.POSITIVE_INFINITY, suffix: "" };
  return {
    prefix: match[1].toUpperCase(),
    number: match[2] ? Number(match[2]) : Number.POSITIVE_INFINITY,
    suffix: match[3] || "",
  };
}

function updateReplaceTargets(preferredCode = els.replaceTo.value) {
  const ordered = replacementCandidates(els.replaceFrom.value);
  els.replaceTo.innerHTML = ordered.map((color) => optionMarkup(color)).join("");
  if (preferredCode && ordered.some((color) => color.code === preferredCode)) {
    els.replaceTo.value = preferredCode;
  }
}

function replacementCandidates(fromCode) {
  const lookup = colorLookup();
  const from = lookup.get(fromCode);
  const fromParsed = parseCode(fromCode || "");
  return currentPalette()
    .filter((color) => color.code !== fromCode)
    .map((color) => ({
      ...color,
      distance: from ? labDistance(from.lab, color.lab) : 0,
      samePrefix: parseCode(color.code).prefix === fromParsed.prefix,
    }))
    .sort((a, b) => {
      if (a.samePrefix !== b.samePrefix) return a.samePrefix ? -1 : 1;
      if (a.samePrefix && b.samePrefix) return compareCodes(a.code, b.code);
      return a.distance - b.distance || compareCodes(a.code, b.code);
    });
}

function renderReplaceSuggestions() {
  const selected = els.replaceTo.value;
  const candidates = replacementCandidates(els.replaceFrom.value).slice(0, 12);
  els.replaceSuggestions.innerHTML = candidates
    .map(
      (color) => `
        <button class="candidate ${color.code === selected ? "active" : ""}" type="button" data-code="${color.code}" title="${color.code} ${color.hex}">
          <span class="swatch" style="--swatch:${color.hex}"></span>
          <span class="candidate-code">${color.code}</span>
        </button>
      `,
    )
    .join("");
}

function finalBeadForCell(cell) {
  if (!cell) return null;
  const code = resolveReplacement(cell.code);
  if (code === cell.code) return cell;
  return colorLookup().get(code) || cell;
}

function resolveReplacement(code) {
  const seen = new Set();
  let current = code;
  while (state.replacements.has(current) && !seen.has(current)) {
    seen.add(current);
    current = state.replacements.get(current);
  }
  return current;
}

function colorLookup() {
  const palette = currentPalette();
  return new Map([...palette, TRANSPARENT_BEAD].map((color) => [color.code, color]));
}

function applyReplacement() {
  const from = els.replaceFrom.value;
  const to = els.replaceTo.value;
  if (!from || !to || from === to) return;
  const shouldMoveFocus = els.focusColor.value === from;
  const originals = new Set(state.cells.filter(Boolean).map((cell) => cell.code));
  for (const original of originals) {
    if (resolveReplacement(original) === from || original === from) {
      state.replacements.set(original, to);
    }
  }
  state.replacements.set(from, to);
  state.preferredReplaceFrom = to;
  computeCounts();
  renderLists();
  if (shouldMoveFocus) els.focusColor.value = to;
  if ([...state.counts.keys()].includes(to)) els.replaceFrom.value = to;
  updateReplaceTargets("");
  renderReplaceSuggestions();
  renderPattern();
}

function resetReplacements() {
  state.replacements.clear();
  state.preferredReplaceFrom = els.focusColor.value || els.replaceFrom.value;
  computeCounts();
  renderLists();
  renderPattern();
}

function totalBeads() {
  return [...state.counts.values()].reduce((sum, count) => sum + count, 0);
}

async function downloadPattern() {
  if (!state.image) return;

  await downloadCanvas(els.canvas, `bead-pattern-${state.board.width}x${state.board.height}.png`);
  await downloadCanvas(createLegendCanvas(), `bead-legend-${state.board.width}x${state.board.height}.png`);
}

function createLegendCanvas() {
  const rows = sortedCountRows();
  const rowHeight = 32;
  const columnWidth = 230;
  const maxRowsPerColumn = 36;
  const columns = Math.max(1, Math.ceil(rows.length / maxRowsPerColumn));
  const rowsPerColumn = Math.ceil(rows.length / columns);
  const margin = 28;
  const titleHeight = 72;
  const width = margin * 2 + columns * columnWidth;
  const height = margin * 2 + titleHeight + rowsPerColumn * rowHeight + 16;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = width;
  canvas.height = height;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#151922";
  context.font = "800 30px system-ui, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillText("拼豆色号用量", margin, margin);
  context.fillStyle = "#66707e";
  context.font = "700 14px system-ui, sans-serif";
  context.fillText(`${state.board.width}x${state.board.height} · ${rows.length} 色 · 共 ${totalBeads()} 颗`, margin, margin + 42);

  rows.forEach((row, index) => {
    const column = Math.floor(index / rowsPerColumn);
    const rowInColumn = index % rowsPerColumn;
    const left = margin + column * columnWidth;
    const top = margin + titleHeight + rowInColumn * rowHeight;

    context.fillStyle = row.hex;
    context.fillRect(left, top + 3, 22, 22);
    context.strokeStyle = "#68717f";
    context.lineWidth = 1;
    context.strokeRect(left, top + 3, 22, 22);
    context.fillStyle = "#151922";
    context.font = "800 15px Arial, sans-serif";
    context.fillText(row.code, left + 32, top + 4);
    context.fillStyle = "#596271";
    context.font = "700 14px Arial, sans-serif";
    context.textAlign = "right";
    context.fillText(`${row.count} 颗`, left + columnWidth - 20, top + 5);
    context.textAlign = "left";
  });

  context.strokeStyle = "#aeb5bf";
  context.lineWidth = 1;
  context.strokeRect(10, 10, width - 20, height - 20);
  return canvas;
}

function downloadCanvas(canvas, filename) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve();
        return;
      }
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.download = filename;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        resolve();
      }, 120);
    }, "image/png");
  });
}

function line(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1 + 0.5, y1 + 0.5);
  ctx.lineTo(x2 + 0.5, y2 + 0.5);
  ctx.stroke();
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function rgbToLab(rgb) {
  let [r, g, b] = rgb.map((value) => value / 255);
  [r, g, b] = [r, g, b].map((value) =>
    value > 0.04045 ? ((value + 0.055) / 1.055) ** 2.4 : value / 12.92,
  );

  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.0;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;

  const [fx, fy, fz] = [x, y, z].map((value) =>
    value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116,
  );

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labDistance(a, b) {
  const dl = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return dl * dl * 0.75 + da * da + db * db;
}

function contrastColor(hex) {
  const [r, g, b] = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? "#20242c" : "#ffffff";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
