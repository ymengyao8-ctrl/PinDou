const els = {
  patternName: document.querySelector("#patternName"),
  progressText: document.querySelector("#progressText"),
  progressBar: document.querySelector("#progressBar"),
  boardCanvas: document.querySelector("#boardCanvas"),
  boardViewport: document.querySelector("#boardViewport"),
  shadowOpacity: document.querySelector("#shadowOpacity"),
  trayCanvas: document.querySelector("#trayCanvas"),
  trayWrap: document.querySelector("#trayWrap"),
  trayHint: document.querySelector("#trayHint"),
  trayCount: document.querySelector("#trayCount"),
  jarRack: document.querySelector("#jarRack"),
  rackTitle: document.querySelector("#rackTitle"),
  paletteToggle: document.querySelector("#paletteToggle"),
  colorSearch: document.querySelector("#colorSearch"),
  needle: document.querySelector("#needle"),
  needleLoad: document.querySelector("#needleLoad"),
  needleBadge: document.querySelector("#needleBadge"),
  needleHome: document.querySelector(".needle-home"),
  recallNeedle: document.querySelector("#recallNeedle"),
  jarGhost: document.querySelector("#jarGhost"),
  helpDialog: document.querySelector("#helpDialog"),
  helpButton: document.querySelector("#helpButton"),
  closeHelp: document.querySelector("#closeHelp"),
  startPlaying: document.querySelector("#startPlaying"),
  undoButton: document.querySelector("#undoButton"),
  resetButton: document.querySelector("#resetButton"),
  toast: document.querySelector("#toast"),
  workbench: document.querySelector("#workbench"),
};

const boardCtx = els.boardCanvas.getContext("2d");
const trayCtx = els.trayCanvas.getContext("2d");
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
  },
  feedTimer: null,
  toastTimer: null,
};

init();

function init() {
  state.placed = Array(state.pattern.width * state.pattern.height).fill(null);
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
  if (state.pattern.isDemo) els.helpDialog.classList.remove("hidden");
}

function bindEvents() {
  window.addEventListener("resize", () => {
    resizeBoard();
    if (!state.needle.dragging && !state.needle.hasMoved) positionNeedleHome();
    else if (!state.needle.dragging) setNeedlePosition(state.needle.x, state.needle.y);
  });
  window.addEventListener("load", scheduleNeedleHome);
  els.recallNeedle.addEventListener("click", recallNeedle);
  els.shadowOpacity.addEventListener("input", drawBoard);
  els.paletteToggle.addEventListener("click", () => {
    state.showAllColors = !state.showAllColors;
    els.paletteToggle.textContent = state.showAllColors ? "图" : "全";
    els.rackTitle.textContent = state.showAllColors ? `完整色卡 · ${state.palette.length}` : "本图用色";
    renderRack();
  });
  els.colorSearch.addEventListener("input", renderRack);
  els.jarRack.addEventListener("mousedown", startJarDrag);
  els.trayCanvas.addEventListener("mousedown", startTrayShake);
  els.needle.addEventListener("mousedown", startNeedleDrag);
  window.addEventListener("mousedown", handleExtraMouseDown, true);
  window.addEventListener("mousemove", handleGlobalMove);
  window.addEventListener("mouseup", handleGlobalUp);
  els.workbench.addEventListener("contextmenu", (event) => event.preventDefault());
  els.helpButton.addEventListener("click", () => els.helpDialog.classList.remove("hidden"));
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
  try {
    const saved = JSON.parse(localStorage.getItem("digitalBeadPattern") || "null");
    if (saved?.width && saved?.height && Array.isArray(saved.cells)) return saved;
  } catch (error) {
    console.warn("图纸读取失败，改用练习图纸", error);
  }
  return createDemoPattern();
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
  const cell = clamp(fit, width > 70 || height > 70 ? 8 : 10, 20);
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

      if (placed) drawBoardBead(cx, cy, size, placed, target?.code === placed.code);
    }
  }

  boardCtx.strokeStyle = "rgba(55,75,65,.22)";
  boardCtx.lineWidth = 1;
  boardCtx.strokeRect(.5, .5, width * size + 1, height * size + 1);
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

function needleTip() {
  return { x: state.needle.x + 27, y: state.needle.y + 187 };
}

function pickUpTrayBeads() {
  const tip = needleTip();
  const rect = els.trayCanvas.getBoundingClientRect();
  if (!pointInRect(tip.x, tip.y, expandedRect(rect, 26))) return;
  const scaleY = els.trayCanvas.height / rect.height;
  const trayY = (tip.y - rect.top) * scaleY;
  const preferredRow = clamp(Math.round((trayY - 49) / 17.2), 0, TRAY_ROWS - 1);
  const rowOrder = [...Array(TRAY_ROWS).keys()].sort((a, b) => Math.abs(a - preferredRow) - Math.abs(b - preferredRow));
  const row = rowOrder.find((candidate) => state.trayBeads.some((bead) => bead.aligned && bead.row === candidate));
  if (row === undefined) {
    showToast("先把散豆左右摇进凹槽，再用双针取豆");
    return;
  }
  const rowBeads = state.trayBeads.filter((bead) => bead.aligned && bead.row === row).sort((a, b) => a.col - b.col);
  const code = rowBeads[0].code;
  const picked = rowBeads.filter((bead) => bead.code === code).slice(0, NEEDLE_CAPACITY);
  const pickedSet = new Set(picked);
  state.trayBeads = state.trayBeads.filter((bead) => !pickedSet.has(bead));
  state.needle.load = picked.map((bead) => ({ code: bead.code, hex: bead.hex }));
  compactTraySlots();
  updateTrayCount();
  drawTray();
  renderNeedleLoad();
  showToast(`夹起 ${picked.length} 颗 ${code}，按住右键可防止滑落`);
}

function compactTraySlots() {
  const aligned = state.trayBeads.filter((bead) => bead.aligned);
  aligned.sort((a, b) => a.row - b.row || a.col - b.col);
  aligned.forEach((bead, index) => {
    bead.row = Math.floor(index / TRAY_COLS);
    bead.col = index % TRAY_COLS;
    bead.x = traySlotX(bead.col);
    bead.y = traySlotY(bead.row);
  });
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
  if (correct === total && total > 0) showToast("图纸完成！每一颗都放对了 ✦");
}

function handleGlobalMove(event) {
  if (state.jarDrag) return handleJarMove(event);
  if (state.trayShake) return handleTrayMove(event);
  if (state.needle.dragging) handleNeedleMove(event);
}

function handleGlobalUp(event) {
  if (event.button === 2 && state.needle.dragging) {
    event.preventDefault();
    releaseNeedleClamp();
    return;
  }
  if (event.button !== 0) return;
  if (state.jarDrag) return finishJarDrag();
  if (state.trayShake) return finishTrayShake();
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
