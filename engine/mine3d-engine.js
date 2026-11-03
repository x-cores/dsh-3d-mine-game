// ============================================================
// 3D 排雷引擎（立方体表面流形扫雷）— 纯逻辑，零 DOM
// 坐标系与 CSS 3D 一致：x 右、y 下、z 向观察者
// ============================================================
(function (global) {
'use strict';

const LEVELS = {
  beginner: { label: '表面 初级 4×4×6 · 96格 12雷', n: 4, mines: 12 },
  intermediate: { label: '表面 中级 5×5×6 · 150格 26雷', n: 5, mines: 26 },
  expert: { label: '表面 高级 6×6×6 · 216格 42雷', n: 6, mines: 42 },
  solid4: { label: '实心 4³ · 64格 10雷', n: 4, mines: 10, solid: true },
  solid5: { label: '实心 5³ · 125格 20雷', n: 5, mines: 20, solid: true },
  solid6: { label: '实心 6³ · 216格 45雷', n: 6, mines: 45, solid: true },
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

// ---------- 实心模式：26 邻域（3×3×3 减自身，边界裁剪） ----------
// 体素 (x,y,z) → id = (x*n + y)*n + z；x 为层号
function buildNeighborsSolid(n) {
  const key = 'solid' + n;
  if (neighborCache[key]) return neighborCache[key];
  const total = n * n * n;
  const sid = (x, y, z) => (x * n + y) * n + z;
  const table = new Array(total);
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) {
    const list = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dy && !dz) continue;
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (nx >= 0 && nx < n && ny >= 0 && ny < n && nz >= 0 && nz < n) list.push(sid(nx, ny, nz));
    }
    table[sid(x, y, z)] = list;
  }
  neighborCache[key] = table;
  return table;
}

// ---------- 游戏状态 ----------
function newGame(levelKey) {
  const L = LEVELS[levelKey] || LEVELS.beginner;
  const n = L.n;
  const solid = !!L.solid;
  const total = solid ? n * n * n : 6 * n * n;
  return {
    level: LEVELS[levelKey] ? levelKey : 'beginner',
    n, solid, mines: L.mines, total,
    neighbors: solid ? buildNeighborsSolid(n) : buildNeighbors(n),
    minesPlaced: false, genAttempts: 0,
    grid: Array.from({ length: total }, () => ({
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
    // 子集规则：前沿约束对 (A,B)，unknowns(A) ⊆ unknowns(B) ⇒ 差集可判
    // （实心模式 26 邻域信息稀释，单格规则不够，必须加这条）
    if (!progress && s.status === 'playing') {
      const cons = [];
      for (let id = 0; id < s.total; id++) {
        const c = s.grid[id];
        if (c.flag || !c.revealed || c.n === 0) continue;
        const unknown = s.neighbors[id].filter(nb => !s.grid[nb].revealed && !s.grid[nb].flag);
        if (unknown.length === 0) continue;
        const minesLeft = c.n - s.neighbors[id].filter(nb => s.grid[nb].flag).length;
        cons.push({ set: new Set(unknown), list: unknown, m: minesLeft });
      }
      outer:
      for (let a = 0; a < cons.length; a++) for (let b = 0; b < cons.length; b++) {
        if (a === b || cons[a].set.size >= cons[b].set.size) continue;
        const A = cons[a], B = cons[b];
        let subset = true;
        for (const u of A.list) if (!B.set.has(u)) { subset = false; break; }
        if (!subset) continue;
        const diff = B.list.filter(u => !A.set.has(u));
        if (diff.length === 0) continue;
        const dm = B.m - A.m;
        if (dm === 0) {
          for (const u of diff) s = reveal(s, u);
          progress = true;
          if (s.status !== 'playing') break outer;
        } else if (dm === diff.length) {
          for (const u of diff) { s.grid[u].flag = true; s.flagCount++; }
          progress = true;
        }
        if (progress) break outer;
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

const api = { LEVELS, FACES, newGame, cloneState, neighborsOf, buildNeighbors, buildNeighborsSolid, walkNeighbor,
  cellCenter, cellId, idParts, placeMines, solveFrom, reveal, toggleFlag, chord };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else global.Mine3D = api;
})(typeof window !== 'undefined' ? window : globalThis);
