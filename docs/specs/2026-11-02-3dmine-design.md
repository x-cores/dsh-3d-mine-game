# 3D 排雷（立方体扫雷）设计文档

日期：2026-11-02 · 参考项目：`/home/phoenix/Projects/Mine`

## 1. 硬伤判断结论

**没有硬伤。** 立方体表面是封闭二维流形：6 个 N×N 面展开后，非顶点格有 8 个邻居
（面内 / 跨棱 / 跨角）；**立方体顶点旁的 24 个角格天然只有 7 个邻居**——顶点处三个面
展开成 270° 扇形，顶点对角槽位是空缺（gap），没有格子（测试发现，修正了最初"每格恰
8 邻"的假设；这与 2D 扫雷边角格邻居更少同构，不构成硬伤）。数字、泛洪、chord、胜负
判定与 2D 扫雷完全同构。三个风险点及对策：

| 风险 | 对策 |
|---|---|
| 被迫盲猜（"周围都是雷"猜不出） | **无猜生成**：布雷后跑确定性求解器模拟，不可解则重布雷（≤300 次） |
| 背面格看不到 | 拖拽旋转（核心操作）+ **透视模式**（全部格子半透明，背面文字防镜像双面渲染） |
| file:// 直开不能跑 ES Module | 放弃 three.js，采用**零依赖 CSS 3D**（transform-style: preserve-3d） |

## 2. 玩法与参数

- 规则与经典扫雷一致，棋盘为立方体表面 6×N² 格；邻居 = 展开图 3×3 邻域（跨棱跨角相连）。
- 左键翻开、右键标旗、双击数字 chord；首翻保证为 0（首翻格及其 8 邻域无雷）。
- 难度：初级 N=4（96 格 12 雷）· 中级 N=5（150 格 26 雷）· 高级 N=6（216 格 42 雷）。
- 拖拽旋转（带惯性）；透视开关；HUD：剩余雷数 / 计时 / 重开 / 状态行。

## 3. 架构

```
engine/mine3d-engine.js   纯逻辑，零 DOM，Node 可测（UMD 式导出）
game/mine3d-view.js       CSS 3D 渲染 + 交互：mountMine3D(container, hooks) → controller
index.html                网页版 HUD + 挂载（<script> 直载，file:// 可玩）
test-3dmine.js            引擎测试（node 直跑）
tools/build-plugin.js     拼接 engine+view 生成 packages/mine3d-float/client.js（防手抄漂移）
packages/mine3d-float/    DSH 插件（悬浮窗，仿 dsh-mine-float 框架）
```

### 3.1 流形邻居算法（geodesic walk）

每个格子的 8 个邻居由"表面测地线步进"求得：从格心沿方向 θ=k·45°（k 偶数步长 s、
奇数步长 s√2，s=2/N）在立方体表面行走；离开当前面时绕"被穿越棱的第三轴"旋转 90°
（把相邻面折平的等距映射），恰好落在棱点上（穿角）时以 t=0 出射再折一次。
落点投影回 (面, i, j)。对每个 N 缓存一次全量邻居表。

坐标系与 CSS 一致（x 右、y 下、z 向观察者），6 面基向量（n/u/v）与 CSS 面变换
（front/back: rotateX(180)/right: rotateY(90)/left: rotateY(-90)/top: rotateX(90)/bottom: rotateX(-90)，
各 translateZ(C/2)）一一对应，保证引擎几何 = 画面几何。

### 3.2 无猜生成

`placeMines(state, firstId)`：排除首翻 3×3 后随机布雷 → 计算数字 → 跑确定性求解器
（单格约束：未知数 = n−旗数 ⇒ 全雷 / 为 0 ⇒ 全开；加全局剩余雷数约束），从首翻开始。
全部非雷格可推出 ⇒ 采纳；否则重试（≤300 次），极端情况回退为尝试中展开最多的一局。
首翻因此恒为 0。

### 3.3 渲染与交互

- `.scene`（perspective）> `.rotor`（preserve-3d，四元数 matrix3d）> 6 `.face` > N² `.cell`。
- 每格含 `.f0` 与 `.f1`（rotateY(180deg)）双面内容，均 backface-visibility:hidden：
  正面看 f0、背面看 f1（文字不镜像）；非透视时近面不透明自然遮挡远面，透视时格子
  opacity 调低即可看穿（opacity 只加在叶子 cell 上，避免 preserve-3d 被拍扁）。
- 拖拽：pointer 移动阈值 5px 区分旋转 vs 点击；松手惯性衰减 0.92。
- 点击命中即 DOM 事件（天然只命中朝向观察者的格子），无需拾取算法。

## 4. 测试

`node test-3dmine.js`：邻居结构（每格恰 8 邻、对称性、角格跨 3 面、内部格同面）、
首翻安全、无猜可解性（每难度采样多局）、泛洪完备、标旗/chord/胜负判定、插件 client.js
与 engine 源一致性（哈希比对）。
