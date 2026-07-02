const els = {
  patternName: document.querySelector("#patternName"),
  progressText: document.querySelector("#progressText"),
  progressBar: document.querySelector("#progressBar"),
  patternEntryBack: document.querySelector("#patternEntryBack"),
  patternEntryLink: document.querySelector("#patternEntryLink"),
  saveProgressButton: document.querySelector("#saveProgressButton"),
  finishButton: document.querySelector("#finishButton"),
  boardCanvas: document.querySelector("#boardCanvas"),
  boardViewport: document.querySelector("#boardViewport"),
  boardTooltip: document.querySelector("#boardTooltip"),
  showShadowCodes: document.querySelector("#showShadowCodes"),
  shadowOpacity: document.querySelector("#shadowOpacity"),
  boardZoom: document.querySelector("#boardZoom"),
  boardZoomValue: document.querySelector("#boardZoomValue"),
  trayCanvas: document.querySelector("#trayCanvas"),
  trayWrap: document.querySelector("#trayWrap"),
  trayHint: document.querySelector("#trayHint"),
  trayCount: document.querySelector("#trayCount"),
  clearTrayButton: document.querySelector("#clearTrayButton"),
  jarRack: document.querySelector("#jarRack"),
  rackTitle: document.querySelector("#rackTitle"),
  paletteToggle: document.querySelector("#paletteToggle"),
  colorSearch: document.querySelector("#colorSearch"),
  needle: document.querySelector("#needle"),
  needleLoad: document.querySelector("#needleLoad"),
  needleBadge: document.querySelector("#needleBadge"),
  needleHome: document.querySelector(".needle-home"),
  recallNeedle: document.querySelector("#recallNeedle"),
  tweezer: document.querySelector("#tweezer"),
  tweezerHeld: document.querySelector("#tweezerHeld"),
  tweezerHome: document.querySelector(".tweezer-home"),
  recallTweezer: document.querySelector("#recallTweezer"),
  jarGhost: document.querySelector("#jarGhost"),
  helpDialog: document.querySelector("#helpDialog"),
  helpButton: document.querySelector("#helpButton"),
  closeHelp: document.querySelector("#closeHelp"),
  startPlaying: document.querySelector("#startPlaying"),
  undoButton: document.querySelector("#undoButton"),
  resetButton: document.querySelector("#resetButton"),
  toast: document.querySelector("#toast"),
  workbench: document.querySelector("#workbench"),
  finishingStage: document.querySelector("#finishingStage"),
  finishTitle: document.querySelector("#finishTitle"),
  finishStep: document.querySelector("#finishStep"),
  ironProgressText: document.querySelector("#ironProgressText"),
  closeFinishButton: document.querySelector("#closeFinishButton"),
  finishRoom: document.querySelector("#finishRoom"),
  finishCanvas: document.querySelector("#finishCanvas"),
  finishedPiece: document.querySelector("#finishedPiece"),
  peelHint: document.querySelector("#peelHint"),
  powerSocket: document.querySelector("#powerSocket"),
  cordPath: document.querySelector("#cordPath"),
  electricIron: document.querySelector("#electricIron"),
  ironKnob: document.querySelector("#ironKnob"),
  powerPlug: document.querySelector("#powerPlug"),
  finishInstruction: document.querySelector("#finishInstruction"),
  ironProgressBar: document.querySelector("#ironProgressBar"),
  finishStatus: document.querySelector("#finishStatus"),
  saveWorkButton: document.querySelector("#saveWorkButton"),
};

const boardCtx = els.boardCanvas.getContext("2d");
const trayCtx = els.trayCanvas.getContext("2d");
const finishCtx = els.finishCanvas.getContext("2d");
const TRAY_ROWS = 10;
const TRAY_COLS = 14;
const NEEDLE_CAPACITY = 14;

const state = {
  pattern: loadPattern(),
  placed: [],
  palette: [],
  usedCounts: new Map(),
  showAllColors: false,
  trayBeads: [],
  undoStack: [],
  currentTransaction: [],
  jarDrag: null,
  trayShake: null,
  needle: {
    dragging: false,
    clamped: false,
    x: 0,
    y: 0,
    offsetX: 27,
    offsetY: 42,
    load: [],
    releaseStarted: 0,
    lastCell: -1,
    lastCellAt: 0,
    overflowed: false,
    hasMoved: false,
    pickupNoticeAt: 0,
  },
  tweezer: {
    dragging: false,
    x: 0,
    y: 0,
    offsetX: 23,
    offsetY: 48,
    targetIndex: -1,
    hasMoved: false,
    heldTimer: null,
  },
  feedTimer: null,
  toastTimer: null,
  finish: {
    visible: false,
    plugged: false,
    ironOn: false,
    complete: false,
    peeled: false,
    coverage: new Set(),
    plugDrag: null,
    ironDrag: null,
    peelDrag: null,
    plugX: 0,
    plugY: 0,
    ironX: 0,
    ironY: 0,
  },
};

init();

function init() {
  if (!state.pattern) return;
  state.placed = loadSavedProgress();
  if (isLocalFinishTest()) {
    state.placed = state.pattern.cells.map((cell) => cell ? { code: cell.code, hex: cell.hex } : null);
  }
  state.palette = paletteForPattern();
  state.usedCounts = countPatternColors();
  els.patternName.textContent = `${state.pattern.paletteName || "MARD 色卡"} · ${state.pattern.width} × ${state.pattern.height}`;
  bindEvents();
  resizeBoard();
  renderRack();
  drawTray();
  renderNeedleLoad();
  updateProgress();
  scheduleNeedleHome();
  scheduleTweezerHome();
  if (state.pattern.isDemo) els.helpDialog.classList.remove("hidden");
}

function isLocalFinishTest() {
  const localHost = ["127.0.0.1", "localhost"].includes(window.location.hostname);
  return localHost && new URLSearchParams(window.location.search).get("testFinish") === "1";
}

function bindEvents() {
  const entryUrl = patternEntryUrl();
  els.patternEntryBack.href = entryUrl;
  els.patternEntryLink.href = entryUrl;
  window.addEventListener("resize", () => {
    resizeBoard();
    if (!state.needle.dragging && !state.needle.hasMoved) positionNeedleHome();
    else if (!state.needle.dragging) setNeedlePosition(state.needle.x, state.needle.y);
    if (!state.tweezer.dragging && !state.tweezer.hasMoved) positionTweezerHome();
    else if (!state.tweezer.dragging) setTweezerPosition(state.tweezer.x, state.tweezer.y);
  });
  window.addEventListener("load", () => {
    scheduleNeedleHome();
    scheduleTweezerHome();
  });
  els.recallNeedle.addEventListener("click", recallNeedle);
  els.recallTweezer.addEventListener("click", recallTweezer);
  els.shadowOpacity.addEventListener("input", drawBoard);
  els.showShadowCodes.addEventListener("change", drawBoard);
  els.boardZoom.addEventListener("input", () => {
    els.boardZoomValue.value = `${els.boardZoom.value}%`;
    resizeBoard();
  });
  els.boardCanvas.addEventListener("mousemove", showBoardTooltip);
  els.boardCanvas.addEventListener("mouseleave", hideBoardTooltip);
  els.paletteToggle.addEventListener("click", () => {
    state.showAllColors = !state.showAllColors;
    els.paletteToggle.textContent = state.showAllColors ? "图" : "全";
    els.rackTitle.textContent = state.showAllColors ? `完整色卡 · ${state.palette.length}` : "本图用色";
    renderRack();
  });
  els.colorSearch.addEventListener("input", renderRack);
  els.jarRack.addEventListener("mousedown", startJarDrag);
  els.trayCanvas.addEventListener("mousedown", startTrayShake);
  els.clearTrayButton.addEventListener("click", clearTray);
  els.needle.addEventListener("mousedown", startNeedleDrag);
  els.tweezer.addEventListener("mousedown", startTweezerDrag);
  window.addEventListener("mousedown", handleExtraMouseDown, true);
  window.addEventListener("mousemove", handleGlobalMove);
  window.addEventListener("mouseup", handleGlobalUp);
  els.workbench.addEventListener("contextmenu", (event) => event.preventDefault());
  els.helpButton.addEventListener("click", () => els.helpDialog.classList.remove("hidden"));
  els.saveProgressButton.addEventListener("click", () => saveProgress(true));
  els.finishButton.addEventListener("click", openFinishingStage);
  els.closeFinishButton.addEventListener("click", closeFinishingStage);
  els.ironKnob.addEventListener("mousedown", (event) => event.stopPropagation());
  els.ironKnob.addEventListener("click", toggleIronPower);
  els.powerPlug.addEventListener("mousedown", startPlugDrag);
  els.electricIron.addEventListener("mousedown", startIronDrag);
  els.finishedPiece.addEventListener("mousedown", startPeelDrag);
  els.saveWorkButton.addEventListener("click", saveFinishedWork);
  els.closeHelp.addEventListener("click", closeHelp);
  els.startPlaying.addEventListener("click", closeHelp);
  els.helpDialog.addEventListener("mousedown", (event) => {
    if (event.target === els.helpDialog) closeHelp();
  });
  els.undoButton.addEventListener("click", undoLast);
  els.resetButton.addEventListener("click", resetBoard);
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoLast();
    }
  });
}

function loadPattern() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("practice") === "1") return createDemoPattern();
  try {
    const saved = JSON.parse(localStorage.getItem("digitalBeadPattern") || "null");
    const readyToken = sessionStorage.getItem("epindouPatternReady");
    if (saved?.width && saved?.height && Array.isArray(saved.cells) && readyToken === saved.createdAt) {
      return saved;
    }
  } catch (error) {
    console.warn("图纸读取失败，返回图纸生成器", error);
  }
  window.location.replace(patternEntryUrl());
  return null;
}

function patternEntryUrl() {
  if (window.location.hostname === "ymengyao8-ctrl.github.io") {
    return "/PinDou/";
  }
  return "../";
}

function progressStorageKey() {
  return `epindouProgress:${state.pattern.createdAt || `${state.pattern.width}x${state.pattern.height}`}`;
}

function loadSavedProgress() {
  const empty = Array(state.pattern.width * state.pattern.height).fill(null);
  try {
    const saved = JSON.parse(localStorage.getItem(progressStorageKey()) || "null");
    if (!Array.isArray(saved?.placed) || saved.placed.length !== empty.length) return empty;
    return saved.placed.map((bead) => bead?.code && bead?.hex ? { code: bead.code, hex: bead.hex } : null);
  } catch (error) {
    console.warn("拼豆进度读取失败", error);
    return empty;
  }
}

function saveProgress(notify = false) {
  localStorage.setItem(progressStorageKey(), JSON.stringify({
    placed: state.placed,
    savedAt: new Date().toISOString(),
  }));
  if (notify) showToast("当前拼豆进度已保存");
}

function createDemoPattern() {
  const width = 24;
  const height = 24;
  const cells = Array(width * height).fill(null);
  const colors = {
    red: { code: "A14", hex: "#FD543D" },
    pink: { code: "E7", hex: "#F29FA7" },
    cream: { code: "A1", hex: "#FAF4C8" },
    green: { code: "C5", hex: "#58A45C" },
  };
  for (let y = 2; y < 19; y += 1) {
    for (let x = 2; x < 22; x += 1) {
      const nx = (x - 11.5) / 8.2;
      const ny = (y - 10) / 7.6;
      const heart = (nx * nx + ny * ny - 1) ** 3 - nx * nx * ny ** 3;
      if (heart <= 0) cells[y * width + x] = y < 7 ? colors.pink : colors.red;
    }
  }
  for (let y = 17; y < 23; y += 1) cells[y * width + 11] = colors.green;
  for (let i = 0; i < 4; i += 1) cells[(19 + i) * width + (8 + i)] = colors.green;
  cells[7 * width + 9] = colors.cream;
  cells[7 * width + 10] = colors.cream;
  return { version: 1, width, height, unit: 24, paletteKey: "mard291", paletteName: "练习图纸", cells, isDemo: true };
}

function paletteForPattern() {
  const raw = window.BEAD_PALETTES?.[state.pattern.paletteKey]?.colors || window.BEAD_PALETTES?.mard291?.colors || [];
  const byCode = new Map(raw.map((color) => [color.code, color]));
  for (const cell of state.pattern.cells) {
    if (cell?.code && !byCode.has(cell.code)) byCode.set(cell.code, cell);
  }
  return [...byCode.values()];
}

function countPatternColors() {
  const counts = new Map();
  for (const cell of state.pattern.cells) {
    if (cell?.code) counts.set(cell.code, (counts.get(cell.code) || 0) + 1);
  }
  return counts;
}

function resizeBoard() {
  const { width, height } = state.pattern;
  const viewport = els.boardViewport.getBoundingClientRect();
  const maxWidth = Math.max(390, viewport.width - 34);
  const maxHeight = Math.max(390, viewport.height - 34);
  const fit = Math.floor(Math.min(maxWidth / width, maxHeight / height));
  const baseCell = clamp(fit, width > 70 || height > 70 ? 8 : 10, 20);
  const zoom = Number(els.boardZoom.value) / 100;
  const cell = Math.max(8, Math.round(baseCell * zoom));
  state.boardCell = cell;
  els.boardCanvas.width = width * cell + 2;
  els.boardCanvas.height = height * cell + 2;
  drawBoard();
}

function drawBoard() {
  const { width, height, cells } = state.pattern;
  const size = state.boardCell;
  const opacity = Number(els.shadowOpacity.value) / 100;
  boardCtx.clearRect(0, 0, els.boardCanvas.width, els.boardCanvas.height);
  boardCtx.fillStyle = "rgba(239,246,241,.74)";
  boardCtx.fillRect(0, 0, els.boardCanvas.width, els.boardCanvas.height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const target = cells[index];
      const placed = state.placed[index];
      const cx = 1 + x * size + size / 2;
      const cy = 1 + y * size + size / 2;

      if (target) {
        boardCtx.globalAlpha = opacity;
        boardCtx.fillStyle = target.hex;
        boardCtx.fillRect(1 + x * size + 1, 1 + y * size + 1, size - 2, size - 2);
        boardCtx.globalAlpha = 1;
      }

      boardCtx.fillStyle = "rgba(63,80,71,.19)";
      boardCtx.beginPath();
      boardCtx.arc(cx, cy, Math.max(1.25, size * .11), 0, Math.PI * 2);
      boardCtx.fill();

      if (target && els.showShadowCodes.checked && size >= 10) {
        drawShadowCode(target.code, cx, cy, size);
      }

      if (placed) drawBoardBead(cx, cy, size, placed, target?.code === placed.code);
      if (placed && state.tweezer.targetIndex === index) drawTweezerTarget(cx, cy, size);
    }
  }

  boardCtx.strokeStyle = "rgba(55,75,65,.22)";
  boardCtx.lineWidth = 1;
  boardCtx.strokeRect(.5, .5, width * size + 1, height * size + 1);
}

function drawShadowCode(code, cx, cy, size) {
  const fontSize = clamp(size * (String(code).length > 3 ? .27 : .33), 4.5, 9);
  boardCtx.save();
  boardCtx.globalAlpha = .82;
  boardCtx.fillStyle = "#19392f";
  boardCtx.strokeStyle = "rgba(255,255,255,.92)";
  boardCtx.lineWidth = Math.max(1.4, fontSize * .32);
  boardCtx.font = `900 ${fontSize}px Arial, sans-serif`;
  boardCtx.textAlign = "center";
  boardCtx.textBaseline = "middle";
  boardCtx.strokeText(code, cx, cy + .3);
  boardCtx.fillText(code, cx, cy + .3);
  boardCtx.restore();
}

function showBoardTooltip(event) {
  const cell = boardCellFromPoint(event.clientX, event.clientY);
  const target = cell ? state.pattern.cells[cell.index] : null;
  if (!cell || !target) {
    hideBoardTooltip();
    return;
  }
  els.boardTooltip.innerHTML = `<i style="--tooltip-color:${target.hex}"></i><strong>${escapeHtml(target.code)}</strong><span>第 ${cell.row + 1} 行 · 第 ${cell.col + 1} 列</span>`;
  els.boardTooltip.style.left = `${event.clientX > window.innerWidth - 180 ? event.clientX - 155 : event.clientX + 14}px`;
  els.boardTooltip.style.top = `${Math.max(8, event.clientY - 18)}px`;
  els.boardTooltip.classList.add("visible");
  els.boardTooltip.setAttribute("aria-hidden", "false");
}

function hideBoardTooltip() {
  els.boardTooltip.classList.remove("visible");
  els.boardTooltip.setAttribute("aria-hidden", "true");
}

function boardCellFromPoint(clientX, clientY) {
  const rect = els.boardCanvas.getBoundingClientRect();
  if (!pointInRect(clientX, clientY, rect)) return null;
  const x = (clientX - rect.left) * (els.boardCanvas.width / rect.width) - 1;
  const y = (clientY - rect.top) * (els.boardCanvas.height / rect.height) - 1;
  const col = Math.floor(x / state.boardCell);
  const row = Math.floor(y / state.boardCell);
  if (col < 0 || row < 0 || col >= state.pattern.width || row >= state.pattern.height) return null;
  return { col, row, index: row * state.pattern.width + col };
}

function drawBoardBead(cx, cy, size, bead, correct) {
  const radius = Math.max(3.6, size * .41);
  const gradient = boardCtx.createRadialGradient(cx - radius * .32, cy - radius * .36, 1, cx, cy, radius);
  gradient.addColorStop(0, lighten(bead.hex, 36));
  gradient.addColorStop(.55, bead.hex);
  gradient.addColorStop(1, darken(bead.hex, 22));
  boardCtx.fillStyle = gradient;
  boardCtx.strokeStyle = correct ? "rgba(29,61,48,.34)" : "#b94d3e";
  boardCtx.lineWidth = correct ? .8 : 1.6;
  boardCtx.beginPath();
  boardCtx.arc(cx, cy, radius, 0, Math.PI * 2);
  boardCtx.fill();
  boardCtx.stroke();
  boardCtx.fillStyle = "rgba(236,241,237,.72)";
  boardCtx.beginPath();
  boardCtx.arc(cx, cy, Math.max(1.25, radius * .27), 0, Math.PI * 2);
  boardCtx.fill();
}

function drawTweezerTarget(cx, cy, size) {
  boardCtx.save();
  boardCtx.strokeStyle = "rgba(25,112,79,.92)";
  boardCtx.lineWidth = Math.max(1.8, size * .12);
  boardCtx.beginPath();
  boardCtx.arc(cx, cy, Math.max(4.8, size * .48), 0, Math.PI * 2);
  boardCtx.stroke();
  boardCtx.restore();
}

function renderRack() {
  const query = els.colorSearch.value.trim().toUpperCase();
  const colors = (state.showAllColors ? state.palette : state.palette.filter((color) => state.usedCounts.has(color.code)))
    .filter((color) => !query || color.code.toUpperCase().includes(query) || color.name?.toUpperCase().includes(query));
  els.jarRack.innerHTML = colors.map((color) => {
    const needed = remainingForColor(color.code);
    return `<button class="jar" type="button" data-code="${escapeHtml(color.code)}" data-hex="${color.hex}" style="--bean-color:${color.hex}" title="${escapeHtml(color.code)} · 还需 ${needed} 颗">
      ${needed > 0 ? `<span class="jar-needed">${needed}</span>` : ""}
      <span class="jar-cap"></span><span class="jar-body"></span><span class="jar-label">${escapeHtml(color.code)}</span>
    </button>`;
  }).join("") || '<p class="board-tip">没有匹配的色号</p>';
}

function remainingForColor(code) {
  let placedCorrect = 0;
  state.placed.forEach((bead, index) => {
    if (bead?.code === code && state.pattern.cells[index]?.code === code) placedCorrect += 1;
  });
  return Math.max(0, (state.usedCounts.get(code) || 0) - placedCorrect);
}

function startJarDrag(event) {
  if (event.button !== 0) return;
  const jar = event.target.closest(".jar");
  if (!jar) return;
  event.preventDefault();
  state.jarDrag = {
    code: jar.dataset.code,
    hex: jar.dataset.hex,
    lastX: event.clientX,
    direction: 0,
    distance: 0,
    spilled: 0,
    lastSpillAt: 0,
  };
  els.jarRack.querySelectorAll(".jar.active").forEach((item) => item.classList.remove("active"));
  jar.classList.add("active");
  els.jarGhost.style.setProperty("--bean-color", jar.dataset.hex);
  els.jarGhost.querySelector("span").textContent = jar.dataset.code;
  els.jarGhost.classList.add("visible");
  moveJarGhost(event.clientX, event.clientY);
}

function handleJarMove(event) {
  const drag = state.jarDrag;
  moveJarGhost(event.clientX, event.clientY);
  const dx = event.clientX - drag.lastX;
  drag.distance += Math.abs(dx);
  const direction = Math.sign(dx);
  const overTray = pointInRect(event.clientX, event.clientY, els.trayCanvas.getBoundingClientRect());
  const reversed = direction && drag.direction && direction !== drag.direction && drag.distance > 22;
  if (overTray && reversed && performance.now() - drag.lastSpillAt > 90) {
    const amount = randomInt(3, 7);
    spillIntoTray(drag.code, drag.hex, amount, event.clientX, event.clientY);
    drag.spilled += amount;
    drag.distance = 0;
    drag.lastSpillAt = performance.now();
  }
  if (direction) drag.direction = direction;
  drag.lastX = event.clientX;
}

function finishJarDrag() {
  const spilled = state.jarDrag?.spilled || 0;
  state.jarDrag = null;
  els.jarGhost.classList.remove("visible");
  if (!spilled) showToast("要在豆铲上左右晃动豆罐，换向时才会洒豆");
}

function moveJarGhost(x, y) {
  els.jarGhost.style.left = `${x}px`;
  els.jarGhost.style.top = `${y}px`;
}

function spillIntoTray(code, hex, amount, clientX, clientY) {
  const rect = els.trayCanvas.getBoundingClientRect();
  const scaleX = els.trayCanvas.width / rect.width;
  const scaleY = els.trayCanvas.height / rect.height;
  const originX = (clientX - rect.left) * scaleX;
  const originY = (clientY - rect.top) * scaleY;
  for (let i = 0; i < amount; i += 1) {
    state.trayBeads.push({
      code,
      hex,
      aligned: false,
      x: clamp(originX + randomInt(-75, 75), 76, 646),
      y: clamp(originY + randomInt(-52, 58), 45, 215),
      angle: Math.random() * Math.PI,
    });
  }
  updateTrayCount();
  drawTray();
}

function startTrayShake(event) {
  if (event.button !== 0 || state.jarDrag || state.needle.dragging) return;
  state.trayShake = { lastX: event.clientX, direction: 0, distance: 0, reversals: 0 };
  event.preventDefault();
}

function handleTrayMove(event) {
  const shake = state.trayShake;
  const dx = event.clientX - shake.lastX;
  shake.distance += Math.abs(dx);
  const direction = Math.sign(dx);
  if (direction && shake.direction && direction !== shake.direction && shake.distance > 18) {
    shake.reversals += 1;
    shake.distance = 0;
    alignLooseBeads(randomInt(7, 13));
  }
  if (direction) shake.direction = direction;
  shake.lastX = event.clientX;
}

function finishTrayShake() {
  const reversals = state.trayShake?.reversals || 0;
  state.trayShake = null;
  if (!reversals && state.trayBeads.some((bead) => !bead.aligned)) showToast("左右多摇几次，散豆才会滚进凹槽");
}

function alignLooseBeads(maxAmount) {
  const loose = state.trayBeads.filter((bead) => !bead.aligned);
  let moved = 0;
  for (const bead of loose) {
    if (moved >= maxAmount) break;
    const slot = firstFreeTraySlot();
    if (!slot) break;
    bead.aligned = true;
    bead.row = slot.row;
    bead.col = slot.col;
    bead.x = traySlotX(slot.col);
    bead.y = traySlotY(slot.row);
    bead.angle = 0;
    moved += 1;
  }
  nudgeLooseBeads();
  drawTray();
}

function firstFreeTraySlot() {
  const occupied = new Set(state.trayBeads.filter((bead) => bead.aligned).map((bead) => `${bead.row}:${bead.col}`));
  for (let row = 0; row < TRAY_ROWS; row += 1) {
    for (let col = 0; col < TRAY_COLS; col += 1) {
      if (!occupied.has(`${row}:${col}`)) return { row, col };
    }
  }
  return null;
}

function nudgeLooseBeads() {
  for (const bead of state.trayBeads) {
    if (bead.aligned) continue;
    bead.x = clamp(bead.x + randomInt(-18, 18), 78, 645);
    bead.y = clamp(bead.y + randomInt(-11, 11), 45, 215);
    bead.angle += (Math.random() - .5) * .7;
  }
}

function drawTray() {
  const ctx = trayCtx;
  const canvas = els.trayCanvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const shell = ctx.createLinearGradient(0, 0, 0, 250);
  shell.addColorStop(0, "#e7eee8");
  shell.addColorStop(.52, "#cbd9cf");
  shell.addColorStop(1, "#aebfb3");
  roundRect(ctx, 10, 10, 700, 230, 32);
  ctx.fillStyle = shell;
  ctx.fill();
  ctx.strokeStyle = "rgba(42,74,59,.35)";
  ctx.lineWidth = 2;
  ctx.stroke();

  roundRect(ctx, 55, 28, 610, 194, 22);
  ctx.fillStyle = "rgba(246,250,247,.55)";
  ctx.fill();
  ctx.strokeStyle = "rgba(48,80,65,.18)";
  ctx.stroke();

  for (let row = 0; row < TRAY_ROWS; row += 1) {
    const y = traySlotY(row);
    ctx.strokeStyle = row % 2 ? "rgba(55,83,68,.22)" : "rgba(255,255,255,.62)";
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(88, y);
    ctx.lineTo(632, y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(55,83,68,.11)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const beads = [...state.trayBeads].sort((a, b) => Number(a.aligned) - Number(b.aligned));
  for (const bead of beads) drawTrayBead(bead);

  ctx.fillStyle = "rgba(40,71,56,.42)";
  ctx.font = "800 10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("SHAKE  ↔  ALIGN", 360, 235);
}

function drawTrayBead(bead) {
  const ctx = trayCtx;
  ctx.save();
  ctx.translate(bead.x, bead.y);
  ctx.rotate(bead.angle || 0);
  const radius = bead.aligned ? 7 : 8;
  const gradient = ctx.createRadialGradient(-2, -2, 1, 0, 0, radius);
  gradient.addColorStop(0, lighten(bead.hex, 34));
  gradient.addColorStop(.6, bead.hex);
  gradient.addColorStop(1, darken(bead.hex, 18));
  ctx.fillStyle = gradient;
  ctx.strokeStyle = "rgba(44,49,46,.35)";
  ctx.lineWidth = .8;
  if (bead.aligned) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(236,242,238,.75)";
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    roundRect(ctx, -8, -5, 16, 10, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(236,242,238,.58)";
    ctx.fillRect(-4, -2, 8, 4);
  }
  ctx.restore();
}

function traySlotX(col) { return 104 + col * 38.5; }
function traySlotY(row) { return 49 + row * 17.2; }

function updateTrayCount() {
  els.trayCount.textContent = state.trayBeads.length;
  els.trayWrap.classList.toggle("has-beads", state.trayBeads.length > 0);
  els.clearTrayButton.disabled = state.trayBeads.length === 0;
}

function clearTray() {
  if (!state.trayBeads.length) return;
  const count = state.trayBeads.length;
  state.trayBeads = [];
  state.trayShake = null;
  updateTrayCount();
  drawTray();
  showToast(`豆铲已清空，共移除 ${count} 颗豆子`);
}

function startNeedleDrag(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  const rect = els.needle.getBoundingClientRect();
  state.needle.dragging = true;
  state.needle.hasMoved = true;
  els.needle.classList.add("dragging");
  state.needle.offsetX = event.clientX - rect.left;
  state.needle.offsetY = event.clientY - rect.top;
  setNeedlePosition(rect.left, rect.top);
}

function handleExtraMouseDown(event) {
  if (event.button !== 2 || !state.needle.dragging) return;
  event.preventDefault();
  clampNeedle();
}

function clampNeedle() {
  if (state.needle.clamped) return;
  state.needle.clamped = true;
  state.needle.releaseStarted = 0;
  state.needle.lastCell = -1;
  state.needle.overflowed = false;
  els.needle.classList.add("clamped");
  stopFeedTimer();
  if (!state.needle.load.length) pickUpTrayBeads();
  finalizeTransaction();
}

function releaseNeedleClamp() {
  if (!state.needle.clamped) return;
  state.needle.clamped = false;
  state.needle.releaseStarted = performance.now();
  state.needle.lastCell = -1;
  state.needle.lastCellAt = performance.now();
  state.needle.overflowed = false;
  els.needle.classList.remove("clamped");
  if (state.needle.load.length) startFeedTimer();
}

function handleNeedleMove(event) {
  setNeedlePosition(event.clientX - state.needle.offsetX, event.clientY - state.needle.offsetY);
  const clampHeld = Boolean(event.buttons & 2) || event.altKey;
  if (clampHeld && !state.needle.clamped) clampNeedle();
  if (!clampHeld && state.needle.clamped) releaseNeedleClamp();
  if (state.needle.clamped && !state.needle.load.length) pickUpTrayBeads();
  if (!state.needle.clamped && state.needle.load.length) attemptNeedleFeed();
}

function setNeedlePosition(left, top) {
  const safeLeft = clamp(left, 8, Math.max(8, window.innerWidth - 62));
  const safeTop = clamp(top, 8, Math.max(8, window.innerHeight - 196));
  state.needle.x = safeLeft;
  state.needle.y = safeTop;
  els.needle.style.left = `${safeLeft}px`;
  els.needle.style.top = `${safeTop}px`;
  els.needle.style.right = "auto";
  els.needle.style.bottom = "auto";
}

function positionNeedleHome() {
  const home = els.needleHome.getBoundingClientRect();
  if (!home.width || !home.height) return false;
  setNeedlePosition(home.left + home.width / 2 - 27, home.top + home.height / 2 - 112);
  return true;
}

function scheduleNeedleHome() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!state.needle.dragging && !state.needle.hasMoved && !positionNeedleHome()) {
      window.setTimeout(scheduleNeedleHome, 80);
    }
  }));
}

function recallNeedle() {
  state.needle.hasMoved = false;
  state.needle.dragging = false;
  state.needle.clamped = false;
  els.needle.classList.remove("dragging", "clamped");
  stopFeedTimer();
  positionNeedleHome();
  showToast("豆针已召回");
}

function startTweezerDrag(event) {
  if (event.button !== 0 || state.jarDrag || state.trayShake || state.needle.dragging) return;
  event.preventDefault();
  const rect = els.tweezer.getBoundingClientRect();
  state.tweezer.dragging = true;
  state.tweezer.hasMoved = true;
  state.tweezer.targetIndex = -1;
  state.tweezer.offsetX = event.clientX - rect.left;
  state.tweezer.offsetY = event.clientY - rect.top;
  els.tweezer.classList.add("dragging");
  els.tweezer.classList.remove("holding");
  setTweezerPosition(rect.left, rect.top);
}

function handleTweezerMove(event) {
  setTweezerPosition(event.clientX - state.tweezer.offsetX, event.clientY - state.tweezer.offsetY);
  const cell = boardCellAtTweezerTip();
  const targetIndex = cell && state.placed[cell.index] ? cell.index : -1;
  if (targetIndex !== state.tweezer.targetIndex) {
    state.tweezer.targetIndex = targetIndex;
    els.tweezer.classList.toggle("ready", targetIndex >= 0);
    drawBoard();
  }
}

function finishTweezerDrag() {
  const targetIndex = state.tweezer.targetIndex;
  const releasedCell = boardCellAtTweezerTip();
  state.tweezer.dragging = false;
  state.tweezer.targetIndex = -1;
  els.tweezer.classList.remove("dragging", "ready");

  if (targetIndex < 0 || !state.placed[targetIndex]) {
    drawBoard();
    if (releasedCell) showToast("这个位置没有已放好的豆子");
    return;
  }

  finalizeTransaction();
  const bead = state.placed[targetIndex];
  state.placed[targetIndex] = null;
  state.undoStack.push([{ index: targetIndex, previous: bead, bead: null }]);
  els.undoButton.disabled = false;
  els.tweezerHeld.style.setProperty("--held-color", bead.hex);
  els.tweezer.classList.add("holding");
  window.clearTimeout(state.tweezer.heldTimer);
  state.tweezer.heldTimer = window.setTimeout(() => els.tweezer.classList.remove("holding"), 900);
  drawBoard();
  updateProgress();
  renderRack();
  const row = Math.floor(targetIndex / state.pattern.width) + 1;
  const col = targetIndex % state.pattern.width + 1;
  showToast(`已用镊子取出 ${bead.code}（第 ${row} 行 · 第 ${col} 列）`);
}

function setTweezerPosition(left, top) {
  const safeLeft = clamp(left, 8, Math.max(8, window.innerWidth - 54));
  const safeTop = clamp(top, 8, Math.max(8, window.innerHeight - 184));
  state.tweezer.x = safeLeft;
  state.tweezer.y = safeTop;
  els.tweezer.style.left = `${safeLeft}px`;
  els.tweezer.style.top = `${safeTop}px`;
  els.tweezer.style.right = "auto";
  els.tweezer.style.bottom = "auto";
}

function positionTweezerHome() {
  const home = els.tweezerHome.getBoundingClientRect();
  if (!home.width || !home.height) return false;
  setTweezerPosition(home.left + home.width / 2 - 23, home.top + home.height / 2 - 92);
  return true;
}

function scheduleTweezerHome() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!state.tweezer.dragging && !state.tweezer.hasMoved && !positionTweezerHome()) {
      window.setTimeout(scheduleTweezerHome, 80);
    }
  }));
}

function recallTweezer() {
  state.tweezer.dragging = false;
  state.tweezer.hasMoved = false;
  state.tweezer.targetIndex = -1;
  els.tweezer.classList.remove("dragging", "ready", "holding");
  positionTweezerHome();
  drawBoard();
  showToast("镊子已召回");
}

function tweezerTip() {
  return { x: state.tweezer.x + 23, y: state.tweezer.y + 169 };
}

function boardCellAtTweezerTip() {
  const tip = tweezerTip();
  return boardCellFromPoint(tip.x, tip.y);
}

function needleTip() {
  return { x: state.needle.x + 27, y: state.needle.y + 187 };
}

function pickUpTrayBeads() {
  const tip = needleTip();
  const rect = els.trayCanvas.getBoundingClientRect();
  if (!pointInRect(tip.x, tip.y, expandedRect(rect, 18))) return;
  const scaleY = els.trayCanvas.height / rect.height;
  const trayY = (tip.y - rect.top) * scaleY;
  const rowPosition = (trayY - traySlotY(0)) / 17.2;
  const row = Math.round(rowPosition);
  if (row < 0 || row >= TRAY_ROWS || Math.abs(rowPosition - row) > 0.48) {
    showPickupNotice("针尖要对准某一条凹槽的中心");
    return;
  }
  const rowBeads = state.trayBeads.filter((bead) => bead.aligned && bead.row === row).sort((a, b) => a.col - b.col);
  if (!rowBeads.length) {
    showPickupNotice(`第 ${row + 1} 道已经空了，请重新摇铲让散豆入槽`);
    return;
  }
  const picked = rowBeads.slice(0, NEEDLE_CAPACITY);
  const pickedSet = new Set(picked);
  state.trayBeads = state.trayBeads.filter((bead) => !pickedSet.has(bead));
  state.needle.load = picked.map((bead) => ({ code: bead.code, hex: bead.hex }));
  updateTrayCount();
  drawTray();
  renderNeedleLoad();
  const codes = [...new Set(picked.map((bead) => bead.code))].join(" / ");
  showToast(`第 ${row + 1} 道有 ${picked.length} 颗，已全部夹起（${codes}）`);
}

function showPickupNotice(message) {
  const now = performance.now();
  if (now - state.needle.pickupNoticeAt < 700) return;
  state.needle.pickupNoticeAt = now;
  showToast(message);
}

function renderNeedleLoad() {
  els.needleLoad.innerHTML = state.needle.load.map((bead) => `<i style="--bean-color:${bead.hex}"></i>`).join("");
  els.needleBadge.textContent = state.needle.load.length;
}

function startFeedTimer() {
  stopFeedTimer();
  state.feedTimer = window.setInterval(attemptNeedleFeed, 105);
}

function stopFeedTimer() {
  if (state.feedTimer) window.clearInterval(state.feedTimer);
  state.feedTimer = null;
}

function attemptNeedleFeed() {
  if (!state.needle.dragging || state.needle.clamped || !state.needle.load.length) return;
  const cell = boardCellAtTip();
  if (!cell) {
    if (state.needle.releaseStarted && performance.now() - state.needle.releaseStarted > 650) slipOneOffNeedle();
    return;
  }
  const now = performance.now();
  if (cell.index !== state.needle.lastCell) {
    state.needle.lastCell = cell.index;
    state.needle.lastCellAt = now;
    state.needle.overflowed = false;
    depositOne(cell.index);
    return;
  }
  if (!state.needle.overflowed && now - state.needle.lastCellAt > 430 && state.needle.load.length) {
    state.needle.overflowed = true;
    spillNeedleNear(cell.col, cell.row, Math.min(state.needle.load.length, randomInt(2, 5)));
    showToast("右键松得太久，豆子滑多了！可以撤回本次操作", true);
  }
}

function boardCellAtTip() {
  const tip = needleTip();
  const rect = els.boardCanvas.getBoundingClientRect();
  if (!pointInRect(tip.x, tip.y, rect)) return null;
  const x = (tip.x - rect.left) * (els.boardCanvas.width / rect.width) - 1;
  const y = (tip.y - rect.top) * (els.boardCanvas.height / rect.height) - 1;
  const col = Math.floor(x / state.boardCell);
  const row = Math.floor(y / state.boardCell);
  if (col < 0 || row < 0 || col >= state.pattern.width || row >= state.pattern.height) return null;
  return { col, row, index: row * state.pattern.width + col };
}

function depositOne(index) {
  if (!state.needle.load.length || state.placed[index]) return false;
  const bead = state.needle.load.shift();
  state.currentTransaction.push({ index, previous: null, bead });
  state.placed[index] = bead;
  renderNeedleLoad();
  drawBoard();
  updateProgress();
  return true;
}

function spillNeedleNear(col, row, amount) {
  const candidates = [];
  for (let radius = 1; radius <= 3; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = col + dx;
        const y = row + dy;
        if (x < 0 || y < 0 || x >= state.pattern.width || y >= state.pattern.height) continue;
        const index = y * state.pattern.width + x;
        if (!state.placed[index] && !candidates.includes(index)) candidates.push(index);
      }
    }
  }
  shuffle(candidates);
  for (let i = 0; i < amount && candidates.length && state.needle.load.length; i += 1) depositOne(candidates.shift());
}

function slipOneOffNeedle() {
  if (!state.needle.load.length) return;
  const tip = needleTip();
  const rect = els.trayCanvas.getBoundingClientRect();
  const bead = state.needle.load.shift();
  if (pointInRect(tip.x, tip.y, expandedRect(rect, 30))) {
    const scaleX = els.trayCanvas.width / rect.width;
    const scaleY = els.trayCanvas.height / rect.height;
    state.trayBeads.push({
      ...bead,
      aligned: false,
      x: clamp((tip.x - rect.left) * scaleX, 76, 646),
      y: clamp((tip.y - rect.top) * scaleY, 45, 215),
      angle: Math.random() * Math.PI,
    });
    updateTrayCount();
    drawTray();
  }
  renderNeedleLoad();
  state.needle.releaseStarted = performance.now();
}

function finishNeedleDrag() {
  state.needle.dragging = false;
  els.needle.classList.remove("dragging");
  stopFeedTimer();
  if (!state.needle.clamped && state.needle.load.length) {
    const tip = needleTip();
    const trayRect = els.trayCanvas.getBoundingClientRect();
    if (pointInRect(tip.x, tip.y, expandedRect(trayRect, 40))) returnLoadToTray();
  }
  state.needle.clamped = false;
  els.needle.classList.remove("clamped");
  finalizeTransaction();
  renderRack();
}

function returnLoadToTray() {
  for (const bead of state.needle.load) {
    state.trayBeads.push({ ...bead, aligned: false, x: randomInt(140, 590), y: randomInt(70, 195), angle: Math.random() * Math.PI });
  }
  state.needle.load = [];
  updateTrayCount();
  drawTray();
  renderNeedleLoad();
}

function finalizeTransaction() {
  if (!state.currentTransaction.length) return;
  state.undoStack.push(state.currentTransaction);
  state.currentTransaction = [];
  els.undoButton.disabled = false;
}

function undoLast() {
  finalizeTransaction();
  const transaction = state.undoStack.pop();
  if (!transaction) return;
  for (const action of [...transaction].reverse()) state.placed[action.index] = action.previous;
  els.undoButton.disabled = !state.undoStack.length;
  drawBoard();
  updateProgress();
  renderRack();
  showToast(`已撤回 ${transaction.length} 颗豆子`);
}

function resetBoard() {
  if (!state.placed.some(Boolean)) return;
  if (!window.confirm("确定清空豆板上已经放好的所有豆子吗？")) return;
  state.placed.fill(null);
  state.undoStack = [];
  state.currentTransaction = [];
  localStorage.removeItem(progressStorageKey());
  els.undoButton.disabled = true;
  drawBoard();
  updateProgress();
  renderRack();
}

function updateProgress() {
  let correct = 0;
  const total = [...state.usedCounts.values()].reduce((sum, count) => sum + count, 0);
  state.placed.forEach((bead, index) => {
    if (bead && bead.code === state.pattern.cells[index]?.code) correct += 1;
  });
  els.progressText.textContent = `${correct} / ${total}`;
  els.progressBar.style.width = `${total ? correct / total * 100 : 0}%`;
  const remaining = Math.max(0, total - correct);
  els.finishButton.disabled = remaining > 0;
  els.finishButton.textContent = remaining ? `还差 ${remaining} 颗` : "确认拼完";
  if (correct === total && total > 0) showToast("图纸完成！每一颗都放对了 ✦");
}

function boardCompletion() {
  let correct = 0;
  let total = 0;
  state.pattern.cells.forEach((target, index) => {
    if (!target) return;
    total += 1;
    if (state.placed[index]?.code === target.code) correct += 1;
  });
  return { correct, total, complete: total > 0 && correct === total };
}

function openFinishingStage() {
  const completion = boardCompletion();
  if (!completion.complete) {
    showToast(`还差 ${completion.total - completion.correct} 颗正确豆子，拼完才能熨烫`);
    return;
  }
  saveProgress(false);
  resetFinishingState();
  state.finish.visible = true;
  els.finishingStage.classList.remove("hidden");
  drawFinishPiece();
  requestAnimationFrame(positionFinishTools);
}

function closeFinishingStage() {
  state.finish.visible = false;
  state.finish.plugDrag = null;
  state.finish.ironDrag = null;
  state.finish.peelDrag = null;
  els.finishingStage.classList.add("hidden");
}

function resetFinishingState() {
  Object.assign(state.finish, {
    plugged: false,
    ironOn: false,
    complete: false,
    peeled: false,
    plugDrag: null,
    ironDrag: null,
    peelDrag: null,
  });
  state.finish.coverage = new Set();
  els.powerPlug.classList.remove("connected");
  els.powerSocket.classList.remove("connected");
  els.electricIron.classList.remove("on");
  els.finishedPiece.classList.remove("peel-ready", "detached");
  els.finishedPiece.style.transform = "";
  els.saveWorkButton.classList.add("hidden");
  els.saveWorkButton.textContent = "保存为作品 PNG";
  els.finishTitle.textContent = "给拼豆通电熨烫";
  els.finishStep.textContent = "01 · 插上电源";
  els.ironProgressText.textContent = "0%";
  els.ironProgressBar.style.width = "0%";
  els.finishStatus.textContent = "电熨斗尚未通电";
  els.finishInstruction.innerHTML = "<strong>先把插头拖进右上角插座</strong><span>插好以后，点击熨斗旋钮通电。</span>";
}

function positionFinishTools() {
  if (!state.finish.visible) return;
  const room = els.finishRoom.getBoundingClientRect();
  state.finish.ironX = clamp(room.width - 335, 20, room.width - 196);
  state.finish.ironY = clamp(room.height - 225, 90, room.height - 148);
  state.finish.plugX = clamp(room.width - 205, 20, room.width - 90);
  state.finish.plugY = clamp(room.height - 115, 80, room.height - 65);
  setIronPosition(state.finish.ironX, state.finish.ironY);
  setPlugPosition(state.finish.plugX, state.finish.plugY);
  updateCord();
}

function drawFinishPiece() {
  const { width, height } = state.pattern;
  const cell = clamp(Math.floor(560 / Math.max(width, height)), 6, 16);
  state.finish.cell = cell;
  els.finishCanvas.width = width * cell;
  els.finishCanvas.height = height * cell;
  finishCtx.clearRect(0, 0, els.finishCanvas.width, els.finishCanvas.height);

  state.placed.forEach((bead, index) => {
    if (!bead) return;
    const x = (index % width) * cell;
    const y = Math.floor(index / width) * cell;
    const fused = state.finish.coverage.has(index);
    finishCtx.fillStyle = bead.hex;
    finishCtx.strokeStyle = darken(bead.hex, 24);
    finishCtx.lineWidth = Math.max(.6, cell * .055);
    if (fused) {
      roundRect(finishCtx, x + cell * .01, y + cell * .01, cell * .98, cell * .98, cell * .32);
      finishCtx.fill();
      finishCtx.stroke();
      finishCtx.fillStyle = "rgba(255,255,255,.3)";
      finishCtx.beginPath();
      finishCtx.arc(x + cell / 2, y + cell / 2, cell * .09, 0, Math.PI * 2);
      finishCtx.fill();
    } else {
      const cx = x + cell / 2;
      const cy = y + cell / 2;
      finishCtx.beginPath();
      finishCtx.arc(cx, cy, cell * .42, 0, Math.PI * 2);
      finishCtx.fill();
      finishCtx.stroke();
      finishCtx.fillStyle = "rgba(246,248,245,.8)";
      finishCtx.beginPath();
      finishCtx.arc(cx, cy, cell * .14, 0, Math.PI * 2);
      finishCtx.fill();
    }
  });
}

function startPlugDrag(event) {
  if (event.button !== 0 || state.finish.plugged) return;
  event.preventDefault();
  const rect = els.powerPlug.getBoundingClientRect();
  state.finish.plugDrag = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
}

function movePlug(event) {
  const room = els.finishRoom.getBoundingClientRect();
  const drag = state.finish.plugDrag;
  setPlugPosition(event.clientX - room.left - drag.offsetX, event.clientY - room.top - drag.offsetY);
  updateCord();
}

function setPlugPosition(x, y) {
  const room = els.finishRoom.getBoundingClientRect();
  state.finish.plugX = clamp(x, 6, Math.max(6, room.width - 90));
  state.finish.plugY = clamp(y, 6, Math.max(6, room.height - 56));
  els.powerPlug.style.left = `${state.finish.plugX}px`;
  els.powerPlug.style.top = `${state.finish.plugY}px`;
}

function finishPlugDrag() {
  if (!state.finish.plugDrag) return;
  state.finish.plugDrag = null;
  const plug = els.powerPlug.getBoundingClientRect();
  const socket = expandedRect(els.powerSocket.getBoundingClientRect(), 34);
  const plugTipX = plug.right + 12;
  const plugTipY = plug.top + plug.height / 2;
  if (!pointInRect(plugTipX, plugTipY, socket)) {
    els.finishStatus.textContent = "插头没有插准，再拖到插座孔位试试";
    return;
  }
  state.finish.plugged = true;
  els.powerPlug.classList.add("connected");
  els.powerSocket.classList.add("connected");
  els.finishStep.textContent = "02 · 旋转开关";
  els.finishStatus.textContent = "电源已接通，点击熨斗上的圆形旋钮";
  els.finishInstruction.innerHTML = "<strong>插头已接好</strong><span>点击熨斗圆形旋钮，把开关转到开启位置。</span>";
  updateCord();
}

function updateCord() {
  if (!state.finish.visible) return;
  const room = els.finishRoom.getBoundingClientRect();
  const startX = state.finish.ironX + 155;
  const startY = state.finish.ironY + 104;
  let endX = state.finish.plugX + 10;
  let endY = state.finish.plugY + 24;
  if (state.finish.plugged) {
    const socket = els.powerSocket.getBoundingClientRect();
    endX = socket.left - room.left + socket.width / 2;
    endY = socket.top - room.top + socket.height / 2;
  }
  const middleX = (startX + endX) / 2;
  const sag = Math.min(room.height - 18, Math.max(startY, endY) + 100);
  els.cordPath.setAttribute("d", `M ${startX} ${startY} C ${middleX} ${sag}, ${middleX} ${sag}, ${endX} ${endY}`);
}

function toggleIronPower() {
  if (!state.finish.plugged) {
    els.finishStatus.textContent = "先把插头拖进插座，旋钮现在没有电";
    return;
  }
  if (state.finish.complete) return;
  state.finish.ironOn = !state.finish.ironOn;
  els.electricIron.classList.toggle("on", state.finish.ironOn);
  if (state.finish.ironOn) {
    els.finishStep.textContent = "03 · 拖动熨烫";
    els.finishStatus.textContent = "熨斗已加热，按住熨斗在作品上来回移动";
    els.finishInstruction.innerHTML = "<strong>开始熨烫</strong><span>拖动熨斗覆盖整张作品，进度达到 100% 即完成。</span>";
  } else {
    els.finishStatus.textContent = "熨斗已关闭，再点旋钮可继续熨烫";
  }
}

function startIronDrag(event) {
  if (event.button !== 0 || event.target.closest("#ironKnob")) return;
  event.preventDefault();
  const rect = els.electricIron.getBoundingClientRect();
  state.finish.ironDrag = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
}

function moveIron(event) {
  const room = els.finishRoom.getBoundingClientRect();
  const drag = state.finish.ironDrag;
  setIronPosition(event.clientX - room.left - drag.offsetX, event.clientY - room.top - drag.offsetY);
  updateCord();
  if (state.finish.ironOn && !state.finish.complete) applyIronCoverage();
}

function setIronPosition(x, y) {
  const room = els.finishRoom.getBoundingClientRect();
  state.finish.ironX = clamp(x, 0, Math.max(0, room.width - 176));
  state.finish.ironY = clamp(y, 0, Math.max(0, room.height - 128));
  els.electricIron.style.left = `${state.finish.ironX}px`;
  els.electricIron.style.top = `${state.finish.ironY}px`;
}

function applyIronCoverage() {
  const canvas = els.finishCanvas.getBoundingClientRect();
  const iron = els.electricIron.getBoundingClientRect();
  const plate = { left: iron.left + 8, right: iron.right - 6, top: iron.top + 52, bottom: iron.bottom };
  const overlap = {
    left: Math.max(canvas.left, plate.left),
    right: Math.min(canvas.right, plate.right),
    top: Math.max(canvas.top, plate.top),
    bottom: Math.min(canvas.bottom, plate.bottom),
  };
  if (overlap.left >= overlap.right || overlap.top >= overlap.bottom) return;
  const { width, height } = state.pattern;
  const startCol = clamp(Math.floor((overlap.left - canvas.left) / canvas.width * width), 0, width - 1);
  const endCol = clamp(Math.ceil((overlap.right - canvas.left) / canvas.width * width), 0, width - 1);
  const startRow = clamp(Math.floor((overlap.top - canvas.top) / canvas.height * height), 0, height - 1);
  const endRow = clamp(Math.ceil((overlap.bottom - canvas.top) / canvas.height * height), 0, height - 1);
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const index = row * width + col;
      if (state.pattern.cells[index]) state.finish.coverage.add(index);
    }
  }
  drawFinishPiece();
  updateIronProgress();
}

function updateIronProgress() {
  const total = [...state.usedCounts.values()].reduce((sum, count) => sum + count, 0);
  const percent = total ? Math.min(100, Math.round(state.finish.coverage.size / total * 100)) : 0;
  els.ironProgressText.textContent = `${percent}%`;
  els.ironProgressBar.style.width = `${percent}%`;
  els.finishStatus.textContent = `正在熨烫 · 已覆盖 ${percent}%`;
  if (percent >= 100) completeIroning();
}

function completeIroning() {
  state.finish.complete = true;
  state.finish.ironOn = false;
  els.electricIron.classList.remove("on");
  els.finishedPiece.classList.add("peel-ready");
  els.finishTitle.textContent = "熨烫完成";
  els.finishStep.textContent = "04 · 撕下作品";
  els.finishStatus.textContent = "熨烫完成！按住作品向外拖动，把它从板上撕下来";
  els.finishInstruction.innerHTML = "<strong>熨烫完成</strong><span>按住作品本身向上或向旁边拖动，距离足够就会从板上揭下。</span>";
}

function startPeelDrag(event) {
  if (event.button !== 0 || !state.finish.complete || state.finish.peeled) return;
  event.preventDefault();
  state.finish.peelDrag = { startX: event.clientX, startY: event.clientY, dx: 0, dy: 0 };
}

function movePeel(event) {
  const drag = state.finish.peelDrag;
  drag.dx = event.clientX - drag.startX;
  drag.dy = event.clientY - drag.startY;
  const lift = Math.hypot(drag.dx, drag.dy);
  els.finishedPiece.style.transform = `translate(${drag.dx}px, ${drag.dy}px) rotate(${clamp(drag.dx / 22, -9, 9)}deg) scale(${1 + Math.min(.06, lift / 1800)})`;
  els.finishStatus.textContent = lift > 110 ? "松开鼠标，作品就会从豆板上揭下" : "继续向外拖，把作品完整揭下";
}

function finishPeelDrag() {
  const drag = state.finish.peelDrag;
  if (!drag) return;
  state.finish.peelDrag = null;
  if (Math.hypot(drag.dx, drag.dy) < 110) {
    els.finishedPiece.style.transform = "";
    els.finishStatus.textContent = "拖动距离还不够，再试一次";
    return;
  }
  state.finish.peeled = true;
  els.finishedPiece.classList.remove("peel-ready");
  els.finishedPiece.classList.add("detached");
  els.finishedPiece.style.transform = `translate(${clamp(drag.dx, -90, 90)}px, ${clamp(drag.dy, -70, 35)}px) rotate(${clamp(drag.dx / 24, -6, 6)}deg)`;
  els.finishStep.textContent = "05 · 保存作品";
  els.finishStatus.textContent = "作品已经完整撕下，可以保存为透明背景 PNG";
  els.finishInstruction.innerHTML = "<strong>作品完成</strong><span>点击下方“保存为作品 PNG”，同时会收进本机作品记录。</span>";
  els.saveWorkButton.classList.remove("hidden");
}

function createFinishedWorkCanvas() {
  const { width, height } = state.pattern;
  const occupied = state.placed.map((bead, index) => bead ? index : -1).filter((index) => index >= 0);
  const cols = occupied.map((index) => index % width);
  const rows = occupied.map((index) => Math.floor(index / width));
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const cell = 22;
  const padding = 28;
  const canvas = document.createElement("canvas");
  canvas.width = (maxCol - minCol + 1) * cell + padding * 2;
  canvas.height = (maxRow - minRow + 1) * cell + padding * 2;
  const context = canvas.getContext("2d");
  state.placed.forEach((bead, index) => {
    if (!bead) return;
    const col = index % width;
    const row = Math.floor(index / width);
    const x = padding + (col - minCol) * cell;
    const y = padding + (row - minRow) * cell;
    context.fillStyle = bead.hex;
    context.strokeStyle = darken(bead.hex, 22);
    context.lineWidth = 1.2;
    roundRect(context, x, y, cell, cell, 7);
    context.fill();
    context.stroke();
    context.fillStyle = "rgba(255,255,255,.3)";
    context.beginPath();
    context.arc(x + cell / 2, y + cell / 2, 2.2, 0, Math.PI * 2);
    context.fill();
  });
  return canvas;
}

function saveFinishedWork() {
  if (!state.finish.peeled) return;
  const canvas = createFinishedWorkCanvas();
  const dataUrl = canvas.toDataURL("image/png");
  const work = {
    id: Date.now(),
    name: `EPinDou-${state.pattern.width}x${state.pattern.height}`,
    image: dataUrl,
    createdAt: new Date().toISOString(),
  };
  try {
    const works = JSON.parse(localStorage.getItem("epindouWorks") || "[]");
    localStorage.setItem("epindouWorks", JSON.stringify([work, ...works].slice(0, 6)));
  } catch (error) {
    console.warn("本机作品记录保存失败", error);
  }
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `${work.name}-${String(work.id).slice(-6)}.png`;
  link.click();
  els.saveWorkButton.textContent = "作品已保存 ✓";
  els.finishStatus.textContent = "作品已保存到下载目录，也已收进本机作品记录";
}

function handleGlobalMove(event) {
  if (state.finish.visible) {
    if (state.finish.plugDrag) return movePlug(event);
    if (state.finish.ironDrag) return moveIron(event);
    if (state.finish.peelDrag) return movePeel(event);
  }
  if (state.jarDrag) return handleJarMove(event);
  if (state.trayShake) return handleTrayMove(event);
  if (state.tweezer.dragging) return handleTweezerMove(event);
  if (state.needle.dragging) handleNeedleMove(event);
}

function handleGlobalUp(event) {
  if (state.finish.visible && event.button === 0) {
    if (state.finish.plugDrag) return finishPlugDrag();
    if (state.finish.ironDrag) {
      state.finish.ironDrag = null;
      return;
    }
    if (state.finish.peelDrag) return finishPeelDrag();
  }
  if (event.button === 2 && state.needle.dragging) {
    event.preventDefault();
    releaseNeedleClamp();
    return;
  }
  if (event.button !== 0) return;
  if (state.jarDrag) return finishJarDrag();
  if (state.trayShake) return finishTrayShake();
  if (state.tweezer.dragging) return finishTweezerDrag();
  if (state.needle.dragging) finishNeedleDrag();
}

function showToast(message, error = false) {
  window.clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.classList.toggle("error", error);
  els.toast.classList.add("show");
  state.toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function closeHelp() { els.helpDialog.classList.add("hidden"); }

function pointInRect(x, y, rect) { return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom; }
function expandedRect(rect, amount) { return { left: rect.left - amount, right: rect.right + amount, top: rect.top - amount, bottom: rect.bottom + amount }; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function hexToRgb(hex) {
  const value = String(hex || "#888888").replace("#", "");
  const full = value.length === 3 ? value.split("").map((item) => item + item).join("") : value.padEnd(6, "8").slice(0, 6);
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function colorShift(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${clamp(r + amount, 0, 255)}, ${clamp(g + amount, 0, 255)}, ${clamp(b + amount, 0, 255)})`;
}

function lighten(hex, amount) { return colorShift(hex, amount); }
function darken(hex, amount) { return colorShift(hex, -amount); }

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
