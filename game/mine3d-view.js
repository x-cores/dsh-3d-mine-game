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
