window.__ModuleLoader__.load({
  id: 'dsh-mine3d-float',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // ============================================================
    // 3D 排雷引擎（由 tools/build-plugin.js 从 engine/mine3d-engine.js 生成，勿手改）
    // ===ENGINE-START===
// ============================================================
// 3D 排雷引擎（立方体表面流形扫雷）— 纯逻辑，零 DOM
// 坐标系与 CSS 3D 一致：x 右、y 下、z 向观察者
// ============================================================
(function (global) {
'use strict';

const LEVELS = {
  beginner: { label: '初级 4×4×6 · 96格 12雷', n: 4, mines: 12 },
  intermediate: { label: '中级 5×5×6 · 150格 26雷', n: 5, mines: 26 },
  expert: { label: '高级 6×6×6 · 216格 42雷', n: 6, mines: 42 },
};

// 6 面：法向 n、面内 u(→i 增)/v(→j 增) 方向。与 CSS 面变换一一对应：
// front: identity / back: rotateX(180) / right: rotateY(90) / left: rotateY(-90)
// top: rotateX(90) / bottom: rotateX(-90)，各再 translateZ(C/2)
const FACES = [
  { key: 'front', n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { key: 'back', n: [0, 0, -1], u: [1, 0, 0], v: [0, -1, 0] },
  { key: 'right', n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { key: 'left', n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { key: 'top', n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { key: 'bottom', n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
];

const cellId = (f, i, j, n) => (f * n + j) * n + i;
function idParts(id, n) { return { f: Math.floor(id / (n * n)), j: Math.floor(id / n) % n, i: id % n }; }

// ---------- 向量小工具 ----------
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vscale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function rodrigues(v, k, theta) { // 绕单位轴 k 旋转
  const c = Math.cos(theta), s = Math.sin(theta);
  const kxv = vcross(k, v), kd = vdot(k, v);
  return [
    v[0] * c + kxv[0] * s + k[0] * kd * (1 - c),
    v[1] * c + kxv[1] * s + k[1] * kd * (1 - c),
    v[2] * c + kxv[2] * s + k[2] * kd * (1 - c),
  ];
}

// ---------- 测地线步进求邻居 ----------
// 从 (f,i,j) 格心沿方向 θ=k·45° 在立方体表面行走：
//   k 偶数步长 s（正交邻居），k 奇数步长 s√2（对角邻居）。
// 穿棱：绕“面法向轴与出射坐标轴之外的第三轴”旋转 90°（把相邻面折平）。
// 恰好穿角（出射参数 t≈0）：按出射再折一次。落点投影回 (面, i, j)。
function axisOf(vec) { return Math.abs(vec[0]) > 0.5 ? 0 : Math.abs(vec[1]) > 0.5 ? 1 : 2; }

function cellCenter(f, i, j, n) {
  const s = 2 / n, F = FACES[f];
  const x = (i + 0.5) * s - 1, y = (j + 0.5) * s - 1;
  return vadd(vscale(F.n, 1), vadd(vscale(F.u, x), vscale(F.v, y)));
}

function walkNeighbor(n, f, i, j, k) {
  const s = 2 / n, F = FACES[f];
  let q = cellCenter(f, i, j, n);
  const ang = k * Math.PI / 4;
  let d = vadd(vscale(F.u, Math.cos(ang)), vscale(F.v, Math.sin(ang)));
  let remaining = (k % 2 === 0) ? s : s * Math.SQRT2;
  let axis = axisOf(F.n);
  const EPS = 1e-9;
  for (let iter = 0; iter < 10; iter++) {
    // 求当前面平面上的出射点（沿 d 前进时哪个非法向坐标先到达 ±1）
    let tExit = Infinity, hitAxis = -1;
    for (let b = 0; b < 3; b++) {
      if (b === axis) continue;
      if (Math.abs(d[b]) > 1e-12) {
        const bound = d[b] > 0 ? 1 : -1;
        const t = (bound - q[b]) / d[b];
        if (t >= -EPS && t < tExit) { tExit = Math.max(t, 0); hitAxis = b; }
      }
    }
    if (hitAxis === -1 || tExit >= remaining - EPS) {
      q = vadd(q, vscale(d, remaining)); // 落定，投影回格子
      const sigma = q[axis] >= 0 ? 1 : -1;
      const lf = FACES.findIndex(Fc =>
        axisOf(Fc.n) === axis && (Fc.n[axis] > 0 ? 1 : -1) === sigma);
      if (lf < 0) return -1;
      const L = FACES[lf];
      const di = Math.floor((vdot(q, L.u) + 1) / s + EPS);
      const dj = Math.floor((vdot(q, L.v) + 1) / s + EPS);
      if (di < 0 || di >= n || dj < 0 || dj >= n) return -1;
      return cellId(lf, di, dj, n);
    }
    // 穿过立方体顶点（出射点另一非法向坐标也在 ±1）：展开图上该对角槽位是
    // 顶点处 270° 扇形的空缺（gap），无邻居 —— 立方体角格因此天然只有 7 个邻居
    {
      const qx = vadd(q, vscale(d, tExit));
      const cornerish = [0, 1, 2].every(b =>
        b === axis || Math.abs(Math.abs(qx[b]) - 1) < 1e-7);
      if (cornerish) return -1;
    }
    // 折面：绕第三轴 c 把出射方向折入相邻面
    q = vadd(q, vscale(d, tExit));
    remaining -= tExit;
    const c = 3 - axis - hitAxis;
    const kAxis = [0, 0, 0]; kAxis[c] = 1;
    const nOld = [0, 0, 0]; nOld[axis] = q[axis] >= 0 ? 1 : -1;
    const nNew = [0, 0, 0]; nNew[hitAxis] = q[hitAxis] >= 0 ? 1 : -1;
    const cand1 = rodrigues(d, kAxis, Math.PI / 2);
    const cand2 = rodrigues(d, kAxis, -Math.PI / 2);
    const ok1 = Math.abs(rodrigues(nOld, kAxis, Math.PI / 2)[hitAxis] - nNew[hitAxis]) < 1e-6
      && Math.abs(rodrigues(nOld, kAxis, Math.PI / 2)[axis]) < 1e-6;
    d = ok1 ? cand1 : cand2;
    axis = hitAxis;
  }
  return -1;
}

const neighborCache = {};
function buildNeighbors(n) {
  if (neighborCache[n]) return neighborCache[n];
  const total = 6 * n * n;
  const table = new Array(total);
  for (let f = 0; f < 6; f++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const id = cellId(f, i, j, n);
    const set = new Set();
    for (let k = 0; k < 8; k++) {
      const nb = walkNeighbor(n, f, i, j, k);
      if (nb >= 0 && nb !== id) set.add(nb);
    }
    table[id] = [...set];
  }
  neighborCache[n] = table;
  return table;
}

// ---------- 游戏状态 ----------
function newGame(levelKey) {
  const L = LEVELS[levelKey] || LEVELS.beginner;
  const n = L.n;
  return {
    level: LEVELS[levelKey] ? levelKey : 'beginner',
    n, mines: L.mines, total: 6 * n * n,
    neighbors: buildNeighbors(n),
    minesPlaced: false, genAttempts: 0,
    grid: Array.from({ length: 6 * n * n }, () => ({
      mine: false, revealed: false, flag: false, n: 0, exploded: false,
    })),
    status: 'playing', revealedCount: 0, flagCount: 0,
  };
}
function cloneState(s) {
  return { ...s, grid: s.grid.map(c => ({ ...c })), neighbors: s.neighbors };
}
function neighborsOf(s, id) { return s.neighbors[id]; }

// ---------- 确定性求解器（无猜生成的判据） ----------
// 单格约束 + 全局雷数约束。全部非雷格可推出 ⇒ solvable。
function solveFrom(state, firstId) {
  let s = reveal(cloneState(state), firstId);
  if (s.status === 'lost') return false;
  let progress = true;
  while (progress && s.status === 'playing') {
    progress = false;
    for (let id = 0; id < s.total; id++) {
      const c = s.grid[id];
      if (c.flag || !c.revealed || c.n === 0) continue;
      const unknown = s.neighbors[id].filter(nb => !s.grid[nb].revealed && !s.grid[nb].flag);
      if (unknown.length === 0) continue;
      const minesLeft = c.n - s.neighbors[id].filter(nb => s.grid[nb].flag).length;
      if (minesLeft === unknown.length) {
        for (const nb of unknown) { s.grid[nb].flag = true; s.flagCount++; }
        progress = true;
      } else if (minesLeft === 0) {
        for (const nb of unknown) s = reveal(s, nb);
        progress = true;
        if (s.status !== 'playing') break;
      }
    }
    // 全局约束：剩余雷数与未翻格数的关系
    if (!progress && s.status === 'playing') {
      const unknownAll = [];
      let flagged = 0;
      for (let id = 0; id < s.total; id++) {
        if (s.grid[id].flag) flagged++;
        else if (!s.grid[id].revealed) unknownAll.push(id);
      }
      const minesLeft = s.mines - flagged;
      if (minesLeft === 0 && unknownAll.length > 0) {
        for (const id of unknownAll) s = reveal(s, id);
        progress = true;
      } else if (minesLeft > 0 && minesLeft === unknownAll.length) {
        for (const id of unknownAll) { s.grid[id].flag = true; s.flagCount++; }
        progress = true;
      }
    }
  }
  return s.status === 'won' || s.revealedCount === s.total - s.mines;
}

// ---------- 布雷（首翻安全 + 无猜重试） ----------
function placeMines(state, firstId) {
  const s = cloneState(state);
  const forbidden = new Set([firstId, ...s.neighbors[firstId]]);
  const pool = [];
  for (let id = 0; id < s.total; id++) if (!forbidden.has(id)) pool.push(id);
  if (pool.length < s.mines) { forbidden.clear(); forbidden.add(firstId); pool.length = 0;
    for (let id = 0; id < s.total; id++) if (!forbidden.has(id)) pool.push(id); }

  const shuffle = () => {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  };
  const apply = (offsetMines) => {
    for (let id = 0; id < s.total; id++) {
      s.grid[id].mine = false; s.grid[id].revealed = false; s.grid[id].flag = false;
      s.grid[id].exploded = false; s.grid[id].n = 0;
    }
    s.revealedCount = 0; s.flagCount = 0; s.status = 'playing';
    for (let m = 0; m < offsetMines.length; m++) s.grid[offsetMines[m]].mine = true;
    for (let id = 0; id < s.total; id++)
      s.grid[id].n = s.neighbors[id].filter(nb => s.grid[nb].mine).length;
    s.minesPlaced = true;
  };

  const MAX = 300;
  let best = null, bestRevealed = -1;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    shuffle();
    const pick = pool.slice(0, s.mines);
    apply(pick);
    if (solveFrom(s, firstId)) { s.genAttempts = attempt; return s; }
    if (s.revealedCount > bestRevealed) { bestRevealed = s.revealedCount; best = pick.slice(); }
  }
  apply(best); s.genAttempts = MAX; // 极端兜底：取展开最多的一局
  return s;
}

// ---------- 翻开 / 标旗 / chord ----------
function reveal(prev, id) {
  if (prev.status !== 'playing') return prev;
  if (id < 0 || id >= prev.total) return prev;
  const cell = prev.grid[id];
  if (cell.revealed || cell.flag) return prev;
  let s = prev;
  if (!s.minesPlaced) s = placeMines(s, id);
  if (s.grid[id].mine) {
    const out = cloneState(s);
    out.grid[id].exploded = true; out.grid[id].revealed = true;
    for (let k = 0; k < out.total; k++) if (out.grid[k].mine) out.grid[k].revealed = true;
    out.status = 'lost';
    return out;
  }
  const out = cloneState(s);
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    const c = out.grid[cur];
    if (c.revealed || c.flag || c.mine) continue;
    c.revealed = true; out.revealedCount++;
    if (c.n === 0) for (const nb of out.neighbors[cur]) if (!out.grid[nb].revealed) stack.push(nb);
  }
  if (out.revealedCount === out.total - out.mines) out.status = 'won';
  return out;
}

function toggleFlag(prev, id) {
  if (prev.status !== 'playing') return prev;
  if (id < 0 || id >= prev.total) return prev;
  const cell = prev.grid[id];
  if (cell.revealed) return prev;
  const s = cloneState(prev);
  s.grid[id].flag = !s.grid[id].flag;
  s.flagCount += s.grid[id].flag ? 1 : -1;
  return s;
}

function chord(prev, id) {
  if (prev.status !== 'playing') return prev;
  const cell = prev.grid[id];
  if (!cell || !cell.revealed || cell.n === 0) return prev;
  const flags = prev.neighbors[id].filter(nb => prev.grid[nb].flag).length;
  if (flags !== cell.n) return prev;
  let s = prev;
  for (const nb of prev.neighbors[id]) {
    if (!s.grid[nb].revealed && !s.grid[nb].flag) {
      s = reveal(s, nb);
      if (s.status !== 'playing') break;
    }
  }
  return s;
}

const api = { LEVELS, FACES, newGame, cloneState, neighborsOf, buildNeighbors, walkNeighbor,
  cellCenter, cellId, idParts, placeMines, solveFrom, reveal, toggleFlag, chord };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else global.Mine3D = api;
})(typeof window !== 'undefined' ? window : globalThis);

    // ===ENGINE-END===
    // ============================================================
    // 3D 排雷视图（由 tools/build-plugin.js 从 game/mine3d-view.js 生成，勿手改）
    // ===VIEW-START===
// ============================================================
// 3D 排雷视图 — 零依赖 CSS 3D 渲染 + 交互
// mountMine3D(container, opts) → controller
//   opts.onChange(state)  状态变化回调（HUD 用）
//   opts.size            立方体边长 px（默认 340）
// controller: start(levelKey) / restart() / setGhost(bool) / getState()
// ============================================================
(function (global) {
'use strict';

// ---------- 四元数 ----------
const qMul = (a, b) => ([
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]);
const qAxis = (axis, ang) => {
  const h = ang / 2;
  return [axis[0] * Math.sin(h), axis[1] * Math.sin(h), axis[2] * Math.sin(h), Math.cos(h)];
};
function qToMatrix3d(q) {
  const [x, y, z, w] = q;
  const m = [
    1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y), 0,
    2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x), 0,
    2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1,
  ];
  return 'matrix3d(' + m.map(v => v.toFixed(6)).join(',') + ')';
}

const CSS_TEXT = `
.m3d-scene { position: relative; width: 100%; height: 100%; display: flex;
  align-items: center; justify-content: center; perspective: 1100px; cursor: grab;
  touch-action: none; user-select: none; -webkit-user-select: none;
  --cov: #5b8def; --cov-b: #4470c8; --cov-h: #7aa7f5;
  --open: light-dark(#dfe5ec, #232732); --open-b: light-dark(#c6cfda, #1b1f28); }
.m3d-scene.m3d-dragging { cursor: grabbing; }
.m3d-rotor { position: relative; transform-style: preserve-3d; }
.m3d-face { position: absolute; left: 50%; top: 50%; transform-style: preserve-3d; }
.m3d-cell { position: absolute; box-sizing: border-box; display: flex;
  align-items: center; justify-content: center; font-weight: 700;
  line-height: 1; border-radius: 14%; transform-style: preserve-3d; }
.m3d-cell .f0, .m3d-cell .f1 { position: absolute; inset: 0; display: flex;
  align-items: center; justify-content: center; border-radius: inherit;
  backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.m3d-cell .f1 { transform: rotateY(180deg); }
.m3d-cell.m3d-covered .f0, .m3d-cell.m3d-covered .f1 {
  background: var(--cov); border: 1px solid var(--cov-b); }
.m3d-cell.m3d-covered:hover .f0, .m3d-cell.m3d-covered:hover .f1 {
  background: var(--cov-h); }
.m3d-cell.m3d-open .f0, .m3d-cell.m3d-open .f1 {
  background: var(--open); border: 1px solid var(--open-b); }
.m3d-cell.m3d-zero .f0, .m3d-cell.m3d-zero .f1 {
  background: var(--open); border-color: var(--open-b); }
.m3d-cell.m3d-boom .f0, .m3d-cell.m3d-boom .f1 { background: #d43a2f; }
.m3d-cell .n1 { color: #4a90d9; } .m3d-cell .n2 { color: #3f9d4e; }
.m3d-cell .n3 { color: #d1342f; } .m3d-cell .n4 { color: #8248c7; }
.m3d-cell .n5 { color: #b05a1e; } .m3d-cell .n6 { color: #17a39c; }
.m3d-cell .n7 { color: #888; } .m3d-cell .n8 { color: #aaa; }
.m3d-scene.m3d-ghost .m3d-cell { opacity: .45; }
`;

// 配色主题（未翻开格 --cov/--cov-b/--cov-h；翻开格沿用明暗自适应）
const THEMES = {
  ocean:  { label: 'Ocean 海洋蓝', vars: { '--cov': '#5b8def', '--cov-b': '#4470c8', '--cov-h': '#7aa7f5' } },
  emerald:{ label: 'Emerald 翡翠绿', vars: { '--cov': '#34a872', '--cov-b': '#28875c', '--cov-h': '#4cbd8a' } },
  sunset: { label: 'Sunset 落日橙', vars: { '--cov': '#ef8a5b', '--cov-b': '#d06f42', '--cov-h': '#f7a27d' } },
  violet: { label: 'Violet 罗兰紫', vars: { '--cov': '#9b7bef', '--cov-b': '#7f62cc', '--cov-h': '#af97f4' } },
  cherry: { label: 'Cherry 樱花粉', vars: { '--cov': '#ef6f95', '--cov-b': '#cc527a', '--cov-h': '#f78eae' } },
  slate:  { label: 'Slate 石板灰（原版）', vars: { '--cov': '#9db3c8', '--cov-b': '#7f97b1', '--cov-h': '#b8cae0' } },
};

const FACE_TRANSFORMS = [
  'translateZ(HALF)',                 // front
  'rotateX(180deg) translateZ(HALF)', // back
  'rotateY(90deg) translateZ(HALF)',  // right
  'rotateY(-90deg) translateZ(HALF)', // left
  'rotateX(90deg) translateZ(HALF)',  // top
  'rotateX(-90deg) translateZ(HALF)', // bottom
];

function mountMine3D(container, opts) {
  const E = global.Mine3D;
  opts = opts || {};
  const size = opts.size || 340;
  const style = document.createElement('style');
  style.textContent = CSS_TEXT;
  if (!document.getElementById('m3d-style')) {
    style.id = 'm3d-style';
    document.head.appendChild(style);
  }

  const scene = document.createElement('div');
  scene.className = 'm3d-scene';
  const rotor = document.createElement('div');
  rotor.className = 'm3d-rotor';
  rotor.style.width = rotor.style.height = size + 'px';
  scene.appendChild(rotor);
  container.appendChild(scene);

  // ---------- 游戏状态 ----------
  let game = E.newGame('beginner');
  let cellEls = [];           // id → cell DOM
  let q = qMul(qAxis([1, 0, 0], -0.35), qAxis([0, 1, 0], 0.6)); // 初始视角
  let vel = null;             // 惯性 [wx, wy]
  let rafId = null;

  function applyRotation() {
    rotor.style.transform = qToMatrix3d(q);
  }

  function buildCube() {
    rotor.innerHTML = '';
    cellEls = [];
    const n = game.n, half = size / 2, cell = size / n;
    for (let f = 0; f < 6; f++) {
      const face = document.createElement('div');
      face.className = 'm3d-face';
      face.style.width = face.style.height = size + 'px';
      face.style.marginLeft = face.style.marginTop = -half + 'px';
      face.style.transform = FACE_TRANSFORMS[f].replace('HALF', half + 'px');
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const id = (f * n + j) * n + i;
        const el = document.createElement('div');
        el.className = 'm3d-cell';
        el.style.width = el.style.height = cell + 'px';
        el.style.left = i * cell + 'px';
        el.style.top = j * cell + 'px';
        el.style.fontSize = Math.round(cell * 0.52) + 'px';
        const f0 = document.createElement('div'); f0.className = 'f0';
        const f1 = document.createElement('div'); f1.className = 'f1';
        el.appendChild(f0); el.appendChild(f1);
        el.dataset.id = id;
        face.appendChild(el);
        cellEls[id] = el;
      }
      rotor.appendChild(face);
    }
    paint();
  }

  function paint() {
    for (let id = 0; id < game.total; id++) {
      const c = game.grid[id], el = cellEls[id];
      if (!el) continue;
      const content = el.firstChild;
      let cls = 'm3d-cell ', text = '';
      if (c.revealed) {
        cls += c.mine ? 'm3d-open m3d-boom' : c.n === 0 ? 'm3d-open m3d-zero' : 'm3d-open';
        if (c.mine) text = '💣';
        else if (c.n > 0) text = String(c.n);
        content.className = 'f0' + (!c.mine && c.n > 0 ? ' n' + c.n : '');
      } else if (c.flag) {
        cls += 'm3d-covered';
        text = game.status === 'lost' && !c.mine ? '❌' : '🚩';
        content.className = 'f0';
      } else {
        cls += 'm3d-covered';
        content.className = 'f0';
      }
      content.textContent = text;
      // 双面内容一致（f1 供背面观察者看到不镜像的文字）
      el.lastChild.className = content.className.replace('f0', 'f1');
      el.lastChild.textContent = content.textContent;
      el.className = cls;
    }
    if (opts.onChange) opts.onChange(game);
  }

  function after() { paint(); }

  // ---------- 输入：拖拽旋转 + 点击 ----------
  let dragging = false, moved = false, lastX = 0, lastY = 0, downId = -1, downX = 0, downY = 0;
  const DRAG_THRESHOLD = 5;

  scene.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    dragging = true; moved = false;
    lastX = downX = e.clientX; lastY = downY = e.clientY;
    const cell = e.target.closest && e.target.closest('.m3d-cell');
    downId = cell ? +cell.dataset.id : -1;
    vel = null;
    scene.classList.add('m3d-dragging');
    try { scene.setPointerCapture(e.pointerId); } catch (_) {}
  });
  scene.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > DRAG_THRESHOLD) moved = true;
    if (moved) {
      const k = 0.008;
      // 垂直方向取负：向下拖 → 立方体顶边向观察者翻（与直觉一致），水平保持自然方向
      q = qMul(qMul(qAxis([0, 1, 0], dx * k), qAxis([1, 0, 0], -dy * k)), q);
      applyRotation();
      vel = [dx, dy];
    }
  });
  scene.addEventListener('pointerup', () => {
    scene.classList.remove('m3d-dragging');
    if (dragging && !moved && downId >= 0) onCellClick(downId);
    dragging = false; downId = -1;
    if (vel && Math.abs(vel[0]) + Math.abs(vel[1]) > 3) inertia();
  });
  scene.addEventListener('pointercancel', () => {
    dragging = false; scene.classList.remove('m3d-dragging');
  });

  function inertia() {
    if (rafId) cancelAnimationFrame(rafId);
    const step = () => {
      if (!vel) return;
      const k = 0.008;
      q = qMul(qMul(qAxis([0, 1, 0], vel[0] * k), qAxis([1, 0, 0], -vel[1] * k)), q);
      applyRotation();
      vel[0] *= 0.92; vel[1] *= 0.92;
      if (Math.abs(vel[0]) + Math.abs(vel[1]) > 0.15) rafId = requestAnimationFrame(step);
      else vel = null;
    };
    rafId = requestAnimationFrame(step);
  }

  function onCellClick(id) {
    if (game.status !== 'playing') return;
    const now = Date.now();
    if (controller._lastClick === id && now - (controller._lastClickAt || 0) < 350) return; // 双击交给 dblclick
    controller._lastClick = id; controller._lastClickAt = now;
    game = E.reveal(game, id);
    after();
  }

  scene.addEventListener('contextmenu', e => {
    const cell = e.target.closest && e.target.closest('.m3d-cell');
    e.preventDefault();
    if (!cell || game.status !== 'playing') return;
    game = E.toggleFlag(game, +cell.dataset.id);
    after();
  });

  scene.addEventListener('dblclick', e => {
    const cell = e.target.closest && e.target.closest('.m3d-cell');
    if (!cell || game.status !== 'playing') return;
    const id = +cell.dataset.id;
    if (game.grid[id].revealed && game.grid[id].n > 0) {
      game = E.chord(game, id);
      after();
    }
  });

  // ---------- controller ----------
  const controller = {
    _lastClick: -1, _lastClickAt: 0,
    start(levelKey) { game = E.newGame(levelKey || game.level); buildCube(); },
    restart() { game = E.newGame(game.level); buildCube(); },
    setGhost(on) { scene.classList.toggle('m3d-ghost', !!on); },
    setTheme(key) {
      const t = THEMES[key] || THEMES.ocean;
      for (const [k, v] of Object.entries(t.vars)) scene.style.setProperty(k, v);
    },
    themes: THEMES,
    getState() { return game; },
    rotate(dx, dy) { // 程序化旋转（HUD 按钮等）
      q = qMul(qMul(qAxis([0, 1, 0], dx), qAxis([1, 0, 0], dy)), q);
      applyRotation();
    },
  };

  applyRotation();
  buildCube();
  return controller;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { mountMine3D };
else { global.Mine3DMount = mountMine3D; global.Mine3DThemes = THEMES; }
})(typeof window !== 'undefined' ? window : globalThis);

    // ===VIEW-END===

    // ============================================================
    // 工具栏按钮（conversation.input.right）
    // ============================================================
    const openState = { listeners: new Set() };
    function useOpen() {
      const [open, setOpen] = React.useState(false);
      React.useEffect(() => {
        openState.listeners.add(setOpen);
        return () => openState.listeners.delete(setOpen);
      }, []);
      const setAll = v => openState.listeners.forEach(fn => fn(v));
      return [open, setAll];
    }

    function Mine3DButton() {
      const [open, set] = useOpen();
      return h('button', {
        type: 'button',
        title: open ? '关闭 3D 排雷悬浮窗' : '打开 3D 排雷悬浮窗',
        onClick: () => set(!open),
        style: {
          border: 'none', background: 'transparent',
          color: 'var(--dsw-alias-label-secondary)',
          cursor: 'pointer', fontSize: '17px', lineHeight: 1,
          padding: '4px 6px', borderRadius: '6px',
        },
        onMouseEnter: e => { e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)'; },
        onMouseLeave: e => { e.currentTarget.style.background = 'transparent'; },
      }, '▦');
    }

    const CSS = `
.m3fw-root { position: fixed; z-index: 60; max-width: calc(100vw - 24px);
  background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0,0,0,.35); overflow: hidden;
  font-family: inherit; color-scheme: light dark; }
.m3fw-titlebar { display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  background: var(--dsw-alias-bg-layer-1); border-bottom: 1px solid var(--dsw-alias-border-l1);
  cursor: move; user-select: none; touch-action: none; }
.m3fw-titlebar .t { flex: 1; font-size: 13px; font-weight: 600; }
.m3fw-close { border: none; background: transparent; color: var(--dsw-alias-label-secondary);
  cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 6px; border-radius: 6px; }
.m3fw-close:hover { background: var(--dsw-alias-interactive-bg-hover); }
.m3fw-body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 8px; }
.m3fw-hud { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  position: relative; z-index: 5; }
.m3fw-counter { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums;
  background: var(--dsw-alias-bg-layer-2); border-radius: 8px; padding: 4px 10px; min-width: 60px; text-align: center; }
.m3fw-face { font-size: 16px; cursor: pointer; border: none; background: var(--dsw-alias-bg-layer-2);
  border-radius: 8px; padding: 4px 10px; }
.m3fw-face:hover { background: var(--dsw-alias-interactive-bg-hover); }
.m3fw-sel { font-size: 12px; padding: 3px 6px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary); }
.m3fw-ghost { font-size: 12px; cursor: pointer; border: none; background: var(--dsw-alias-bg-layer-2);
  border-radius: 8px; padding: 4px 8px; color: var(--dsw-alias-label-primary); }
.m3fw-ghost.on { outline: 2px solid #4a90d9; }
.m3fw-note { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.m3fw-stage { width: 372px; height: 348px; position: relative; z-index: 0; }
`;

    function fmtTime(sec) {
      const m = Math.floor(sec / 60), s = sec % 60;
      return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    function Mine3DFloatWindow() {
      const [open, set] = useOpen();
      const [snap, setSnap] = React.useState(() => window.Mine3D.newGame('beginner'));
      const [elapsed, setElapsed] = React.useState(0);
      const [ghost, setGhost] = React.useState(false);
      const [theme, setTheme] = React.useState('ocean');
      const [pos, setPos] = React.useState(() => ({
        x: Math.max(12, Math.round(window.innerWidth - 430 - 48)),
        y: Math.max(12, Math.round(window.innerHeight * 0.16)),
      }));
      const dragRef = React.useRef(null);
      const ctrlRef = React.useRef(null);
      const stageRef = React.useRef(null);

      React.useEffect(() => {
        if (!open || !stageRef.current) return;
        ctrlRef.current = window.Mine3DMount(stageRef.current, {
          size: 250,
          onChange: s => setSnap({ ...s, grid: null, _sig: Date.now(), status: s.status, mines: s.mines,
            flagCount: s.flagCount, minesPlaced: s.minesPlaced, level: s.level, n: s.n, total: s.total,
            revealedCount: s.revealedCount }),
        });
        return () => { stageRef.current && (stageRef.current.innerHTML = ''); ctrlRef.current = null; };
      }, [open]);

      React.useEffect(() => {
        if (!open || snap.status !== 'playing' || !snap.minesPlaced) return;
        const t = setInterval(() => setElapsed(e => e + 1), 1000);
        return () => clearInterval(t);
      }, [open, snap.status, snap.minesPlaced]);

      const restart = level => {
        if (ctrlRef.current) ctrlRef.current.start(level || snap.level);
        setElapsed(0);
      };

      const onPointerDown = e => {
        if (e.target.closest('.m3fw-close')) return;
        dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        e.currentTarget.setPointerCapture(e.pointerId);
      };
      const onPointerMove = e => {
        const d = dragRef.current;
        if (!d) return;
        setPos({
          x: Math.min(Math.max(0, e.clientX - d.dx), Math.max(0, window.innerWidth - 80)),
          y: Math.min(Math.max(0, e.clientY - d.dy), Math.max(0, window.innerHeight - 48)),
        });
      };
      const onPointerUp = () => { dragRef.current = null; };

      if (!open) return null;
      const face = snap.status === 'won' ? '😎' : snap.status === 'lost' ? '💥' : '🙂';
      const statusLine = snap.status === 'won' ? '🎉 胜利！用时 ' + fmtTime(elapsed)
        : snap.status === 'lost' ? '💥 踩雷了 — 点 🙂 重开'
        : snap.minesPlaced ? '拖动旋转 · 点击翻开 · 右键标旗 · 双击数字 chord'
        : '点击任意格子开始（首翻安全 · 本局无猜可解）';

      return h('div', { className: 'm3fw-root', style: { left: pos.x + 'px', top: pos.y + 'px', width: '398px' } },
        h('style', null, CSS),
        h('div', { className: 'm3fw-titlebar', onPointerDown, onPointerMove, onPointerUp },
          h('span', { className: 't' }, '▦ 3D 排雷（Cube Minesweeper）'),
          h('button', { type: 'button', className: 'm3fw-close', title: '关闭', onClick: () => set(false) }, '✕'),
        ),
        h('div', { className: 'm3fw-body' },
          h('div', { className: 'm3fw-hud' },
            h('select', { className: 'm3fw-sel', value: snap.level, onChange: e => restart(e.target.value) },
              Object.entries(window.Mine3D.LEVELS).map(([k, L]) => h('option', { key: k, value: k }, L.label))),
            h('div', { className: 'm3fw-counter', title: '剩余雷数' }, '💣 ' + (snap.mines - snap.flagCount)),
            h('button', { type: 'button', className: 'm3fw-face', title: '重新开始', onClick: () => restart() }, face),
            h('div', { className: 'm3fw-counter', title: '用时' }, '⏱ ' + fmtTime(elapsed)),
            h('button', {
              type: 'button', className: 'm3fw-ghost' + (ghost ? ' on' : ''), title: '透视模式',
              onClick: () => { const g = !ghost; setGhost(g); ctrlRef.current && ctrlRef.current.setGhost(g); },
            }, '👻 透视'),
            h('select', {
              className: 'm3fw-sel', title: '配色', value: theme,
              onChange: e => { setTheme(e.target.value); ctrlRef.current && ctrlRef.current.setTheme(e.target.value); },
            }, Object.entries(window.Mine3DThemes || {}).map(([k, T]) =>
              h('option', { key: k, value: k }, T.label))),
          ),
          h('div', { className: 'm3fw-note' }, statusLine),
          h('div', { className: 'm3fw-stage', ref: stageRef }),
        ),
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const disposers = [];
        disposers.push(ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
          name: 'conversation.input.right', id: 'mine3d-float-button', order: 92,
        }, Mine3DButton)));
        disposers.push(ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay', id: 'mine3d-float-window', order: 92,
        }, Mine3DFloatWindow)));
        return () => disposers.forEach(d => { try { d(); } catch (_) {} });
      },
    };
  },
});
