#!/usr/bin/env node
// 3D 排雷引擎测试：node test-3dmine.js
'use strict';
const E = require('./engine/mine3d-engine.js');
const crypto = require('crypto');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error('  ✗ FAIL:', msg); }
}
function section(name) { console.log('▶', name); }

// ---------- 1. 邻居结构 ----------
section('邻居结构（流形完备性）');
for (const key of Object.keys(E.LEVELS)) {
  const { n } = E.LEVELS[key];
  const nb = E.buildNeighbors(n);
  const total = 6 * n * n;
  // 非顶点格恰 8 个邻居；立方体顶点旁的 24 个角格天然 7 个（顶点对角槽位是展开 gap）
  let countsOk = true;
  for (let id = 0; id < total; id++) {
    const { f, i, j } = E.idParts(id, n);
    const atCorner = [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1]].some(([ci, cj]) => i === ci && j === cj);
    const want = atCorner ? 7 : 8;
    if (nb[id].length !== want || new Set(nb[id]).size !== nb[id].length || nb[id].includes(id)) countsOk = false;
  }
  ok(countsOk, `${key}: 邻居数正确（角格 7、其余 8）`);
  // 对称性
  let sym = true;
  for (let id = 0; id < total; id++) for (const x of nb[id])
    if (!nb[x].includes(id)) sym = false;
  ok(sym, `${key}: 邻居关系对称`);
  // 邻居总数（有向计）= 8·total − 24（角格各少 1）
  ok(nb.reduce((a, l) => a + l.length, 0) === 8 * total - 24, `${key}: 邻居总数 = 8·6N²−24`);
  // 面内部格（不贴面边）的 8 邻居全部同面
  let innerOk = true;
  for (let f = 0; f < 6; f++) for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
    const id = E.cellId(f, i, j, n);
    for (const x of nb[id]) if (Math.floor(x / (n * n)) !== f) innerOk = false;
  }
  ok(innerOk, `${key}: 面内部格邻居全部同面`);
  // 立方体角对角格（面内 (0,0)/(n-1,n-1) 等）的邻居跨 3 个面
  let cornerOk = true, sawThree = false;
  for (let f = 0; f < 6; f++) {
    for (const [i, j] of [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1]]) {
      const id = E.cellId(f, i, j, n);
      const faces = new Set(nb[id].map(x => Math.floor(x / (n * n))));
      if (faces.size !== 3) cornerOk = false; else sawThree = true;
    }
  }
  ok(cornerOk && sawThree, `${key}: 立方体角对角格邻居跨 3 面`);
}

// 手工验证：front(0,0)（左上角格）与 left/top 面的衔接
{
  const n = 4, nb = E.buildNeighbors(n);
  const front00 = E.cellId(0, 0, 0, n);
  // front 左边中点格 (0, j=1)：其左侧邻居在 left 面上，且行号一致（沿 -x 方向）
  const id = E.cellId(0, 0, 1, n);
  const leftFace = 3;
  const leftNbs = nb[id].filter(x => Math.floor(x / (n * n)) === leftFace);
  ok(leftNbs.length === 3, 'front 左缘格在 left 面有 3 个跨棱/跨角邻居');
  // front(0,0)（立方体顶点角格）7 个邻居、不含自己
  ok(nb[front00].length === 7 && !nb[front00].includes(front00), 'front(0,0) 邻居结构正常（7 邻）');
  // 测地线步进确定性：重复调用结果一致
  ok(E.walkNeighbor(n, 0, 0, 0, 3) === E.walkNeighbor(n, 0, 0, 0, 3), 'walkNeighbor 确定性');
}

// ---------- 2. 首翻安全 + 无猜可解 ----------
section('无猜生成（每难度 30 局采样）');
for (const key of ['beginner', 'intermediate', 'expert']) {
  const L = E.LEVELS[key];
  let solvable = 0, fallback = 0, attempts = [];
  const t0 = Date.now();
  for (let g = 0; g < 30; g++) {
    const s = E.newGame(key);
    const first = Math.floor(Math.random() * s.total);
    const after = E.reveal(s, first);
    const mines = after.grid.filter(c => c.mine).length;
    if (mines !== L.mines) { ok(false, `${key}: 雷数 ${mines} ≠ ${L.mines}`); break; }
    // 首翻为 0 且 3×3 无雷
    ok(after.grid[first].n === 0 && after.grid[first].revealed, `${key} 局${g}: 首翻为 0`);
    const safe = [first, ...after.neighbors[first]].every(x => !after.grid[x].mine);
    ok(safe, `${key} 局${g}: 首翻 3×3 无雷`);
    // 无猜：确定性求解器可推完全局
    const solved = E.solveFrom(E.cloneState({ ...after, grid: after.grid.map(c => ({ ...c })) }), first);
    // solveFrom 会再次 reveal（已 revealed 则跳过），结果应为可解
    if (solved) solvable++; else fallback++;
    attempts.push(after.genAttempts);
    if (after.genAttempts >= 300) fallback++;
  }
  const dt = Date.now() - t0;
  const avg = (attempts.reduce((a, b) => a + b, 0) / attempts.length).toFixed(1);
  const max = Math.max(...attempts);
  ok(solvable === 30, `${key}: 30/30 局可无猜求解 (实得 ${solvable})`);
  console.log(`  ${key}: 平均尝试 ${avg} 次，最大 ${max}，30 局 ${dt}ms`);
}

// ---------- 3. 泛洪完备性 ----------
section('泛洪展开');
{
  const s = E.newGame('beginner');
  const after = E.reveal(s, 0);
  ok(after.revealedCount >= 9, `首翻泛洪至少展开 9 格（实得 ${after.revealedCount}）`);
  // 无雷局：手工清空雷区验证全量泛洪
  const s2 = E.newGame('beginner');
  s2.grid.forEach(c => { c.mine = false; c.n = 0; });
  s2.mines = 0; s2.minesPlaced = true;
  const after2 = E.reveal(s2, Math.floor(s2.total / 2));
  ok(after2.revealedCount === s2.total && after2.status === 'won',
    `无雷局单点翻开全泛洪至胜利（${after2.revealedCount}/${s2.total}）`);
}

// ---------- 3.5 实心模式（26 邻域） ----------
section('实心模式（26 邻域体素）');
for (const key of ['solid4', 'solid5', 'solid6']) {
  const L = E.LEVELS[key], n = L.n;
  const s = E.newGame(key);
  ok(s.solid && s.total === n ** 3, `${key}: total = ${n}³（实得 ${s.total}）`);
  const nb = s.neighbors;
  let shapeOk = true, sym = true;
  const cornerId = 0;
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) {
    const id = (x * n + y) * n + z;
    const inner = [x, y, z].filter(v => v > 0 && v < n - 1).length;
    const want = inner === 3 ? 26 : inner === 2 ? 17 : inner === 1 ? 11 : 7;
    if (nb[id].length !== want) shapeOk = false;
    for (const t of nb[id]) if (!nb[t].includes(id)) sym = false;
  }
  ok(shapeOk, `${key}: 邻居数形状正确（内26/面17/棱11/角7）`);
  ok(sym, `${key}: 邻居关系对称`);
  ok(nb[cornerId].length === 7, `${key}: 角格 7 邻`);
  let solv = 0, att = [];
  const t0 = Date.now();
  for (let g = 0; g < 15; g++) {
    const g0 = E.newGame(key);
    const first = Math.floor(Math.random() * g0.total);
    const after = E.reveal(g0, first);
    if (after.grid.filter(c => c.mine).length !== L.mines) { ok(false, `${key}: 雷数不符`); break; }
    if (E.solveFrom(after, first)) solv++;
    att.push(after.genAttempts);
  }
  ok(solv === 15, `${key}: 15/15 局无猜可解（实得 ${solv}）`);
  console.log(`  ${key}: 平均尝试 ${(att.reduce((a, b) => a + b, 0) / att.length).toFixed(1)} 次，15 局 ${Date.now() - t0}ms`);
}
{
  const s = E.newGame('beginner');
  ok(!s.solid && s.total === 96, '表面模式回归：beginner 仍为 96 格非实心');
}

// ---------- 4. 标旗 / chord / 胜负 ----------
section('标旗 · chord · 胜负判定');
{
  const s = E.newGame('beginner');
  const after = E.reveal(s, 0);
  // 找一个已翻开数字格做 chord 测试：先全标旗凑数
  let numCell = -1;
  for (let id = 0; id < after.total; id++)
    if (after.grid[id].revealed && after.grid[id].n > 0 && !after.grid[id].mine) { numCell = id; break; }
  ok(numCell >= 0, '存在已翻开数字格');
  let coverCell = after.neighbors[numCell].find(nb => !after.grid[nb].revealed && !after.grid[nb].mine);
  if (coverCell === undefined)
    coverCell = after.grid.findIndex((c, id) => id !== numCell && !c.revealed && !c.mine);
  ok(coverCell >= 0, '存在未翻开格');
  const f1 = E.toggleFlag(after, coverCell);
  ok(f1.grid[coverCell].flag && f1.flagCount === 1, '标旗生效并计数');
  const f2 = E.toggleFlag(f1, coverCell);
  ok(!f2.grid[coverCell].flag && f2.flagCount === 0, '再点取消旗');
  // chord：把 numCell 周围的真雷全部标旗后双击 → 其余邻格全部翻开
  {
    let s = after;
    const mineNbs = s.neighbors[numCell].filter(nb => s.grid[nb].mine);
    for (const nb of mineNbs) s = E.toggleFlag(s, nb);
    const coveredBefore = s.neighbors[numCell].filter(nb => !s.grid[nb].revealed && !s.grid[nb].flag).length;
    const ch = E.chord(s, numCell);
    const coveredAfter = ch.neighbors[numCell].filter(nb => !ch.grid[nb].revealed && !ch.grid[nb].flag).length;
    ok(coveredAfter === 0 && coveredBefore >= 0, `chord 翻开剩余邻格（前 ${coveredBefore} → 后 ${coveredAfter}）`);
  }
  // 已翻开格不可标旗
  ok(E.toggleFlag(after, numCell) === after, '已翻开格不可标旗');
  // 踩雷失败：手工布雷
  const s3 = E.newGame('beginner');
  s3.grid.forEach(c => { c.mine = false; c.n = 0; });
  s3.grid[7].mine = true; s3.mines = 1; s3.minesPlaced = true; s3.grid[7].n = 0;
  for (let id = 0; id < s3.total; id++)
    s3.grid[id].n = s3.neighbors[id].filter(nb => s3.grid[nb].mine).length;
  const boom = E.reveal(s3, 7);
  ok(boom.status === 'lost' && boom.grid[7].exploded && boom.grid[7].revealed, '踩雷失败并标记爆点');
  // 胜利：翻开所有非雷格
  const s4 = E.newGame('beginner');
  s4.grid.forEach(c => { c.mine = false; c.n = 0; });
  s4.grid[0].mine = true; s4.mines = 1; s4.minesPlaced = true;
  const win = E.reveal(s4, 1);
  ok(win.status === 'won' && win.revealedCount === win.total - 1, '翻完所有非雷格判胜');
}

// ---------- 5. 插件 client.js 与引擎源一致性 ----------
section('插件引擎一致性');
try {
  const fs = require('fs');
  const client = fs.readFileSync(`${__dirname}/packages/mine3d-float/client.js`, 'utf8');
  const engine = fs.readFileSync(`${__dirname}/engine/mine3d-engine.js`, 'utf8');
  const m = client.match(/\/\/ ===ENGINE-START===\n([\s\S]*?)\/\/ ===ENGINE-END===/);
  ok(!!m, 'client.js 含 ENGINE 标记块');
  if (m) {
    const norm = t => crypto.createHash('sha256').update(t.replace(/\s+$/, '')).digest('hex');
    ok(norm(m[1]) === norm(engine), '插件内嵌引擎 = 引擎源（哈希一致）');
  }
} catch (e) { console.log('  （插件尚未构建，跳过）'); }

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
