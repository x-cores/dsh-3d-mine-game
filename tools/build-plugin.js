#!/usr/bin/env node
// 拼接 engine + view 生成 packages/mine3d-float/client.js
// 引擎与视图的唯一真源是 engine/mine3d-engine.js 与 game/mine3d-view.js
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const engine = read('engine/mine3d-engine.js');
const view = read('game/mine3d-view.js');

const wrapperHead = `window.__ModuleLoader__.load({
  id: 'dsh-mine3d-float',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // ============================================================
    // 3D 排雷引擎（由 tools/build-plugin.js 从 engine/mine3d-engine.js 生成，勿手改）
    // ===ENGINE-START===
`;
const wrapperMid = `
    // ===ENGINE-END===
    // ============================================================
    // 3D 排雷视图（由 tools/build-plugin.js 从 game/mine3d-view.js 生成，勿手改）
    // ===VIEW-START===
`;
const wrapperTail = `
    // ===VIEW-END===
`;

// React 悬浮窗 + 工具栏按钮（仿 dsh-mine-float 框架）
const ui = `
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
      }, '🧊');
    }

    const CSS = \`
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
.m3fw-stage { width: 296px; height: 268px; position: relative; z-index: 0; }
\`;

    function fmtTime(sec) {
      const m = Math.floor(sec / 60), s = sec % 60;
      return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    function Mine3DFloatWindow() {
      const [open, set] = useOpen();
      const [snap, setSnap] = React.useState(() => window.Mine3D.newGame('beginner'));
      const [elapsed, setElapsed] = React.useState(0);
      const [ghost, setGhost] = React.useState(false);
      const [pos, setPos] = React.useState(() => ({
        x: Math.max(12, Math.round(window.innerWidth - 400 - 48)),
        y: Math.max(12, Math.round(window.innerHeight * 0.16)),
      }));
      const dragRef = React.useRef(null);
      const ctrlRef = React.useRef(null);
      const stageRef = React.useRef(null);

      React.useEffect(() => {
        if (!open || !stageRef.current) return;
        ctrlRef.current = window.Mine3DMount(stageRef.current, {
          size: 225,
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

      return h('div', { className: 'm3fw-root', style: { left: pos.x + 'px', top: pos.y + 'px', width: '322px' } },
        h('style', null, CSS),
        h('div', { className: 'm3fw-titlebar', onPointerDown, onPointerMove, onPointerUp },
          h('span', { className: 't' }, '🧊 3D 排雷（Cube Minesweeper）'),
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
`;

const out = wrapperHead + engine + wrapperMid + view + wrapperTail + ui;
const dest = path.join(root, 'packages/mine3d-float/client.js');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log('written', dest, out.length, 'bytes');
