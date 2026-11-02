# 3D 排雷 Cube Minesweeper

经典扫雷搬到**立方体表面**：6 个 N×N 面组成封闭棋盘，跨棱、跨角的格子彼此相邻。
拖动旋转立方体进行游戏。参考 [Mine](../Mine)（2D 版）的引擎/视图分离与测试模式开发，
零依赖、完全离线。

## 玩法

- 拖动旋转立方体（带惯性）· 点击翻开 · 右键标旗 · 双击数字快速展开（chord）
- **无猜生成**：布雷后跑确定性求解器（单格约束 + 全局雷数约束），逻辑推演必可通关，
  不存在"周围都是雷只能瞎猜"的死局；首翻保证为 0（首翻格及邻域无雷）
- **透视模式**（👻）：全部格子半透明，可透过立方体看到背面的数字（背面文字做了防镜像处理）
- 难度：初级 4×4×6 面 96 格 12 雷 · 中级 150 格 26 雷 · 高级 216 格 42 雷

### 立方体几何（有意思的点）

- 邻居由**测地线步进**求得：从格心沿 45°×8 方向在立方体表面行走（穿棱时把相邻面
  折平），落点即邻居格——跨棱跨角连接自动正确。
- 立方体 8 个顶点各旁的 24 个角格只有 **7 个邻居**：顶点处三面展开为 270° 扇形，
  顶点对角槽位是空缺。`test-3dmine.js` 覆盖此结论。

## 网页版

浏览器打开 `index.html` 即玩（file:// 直开，无需服务器）。

```bash
node test-3dmine.js   # 引擎校验（邻居结构 / 无猜可解采样 / 泛洪 / 标旗 / chord / 胜负）
```

## DSH 插件 dsh-mine3d-float（packages/mine3d-float/）

在 DeepSeek Harness Web 界面里玩：输入框工具栏 **🧊 按钮** → 弹出可拖动悬浮窗。

```bash
# 从源码构建（engine/ + game/ 拼接生成 client.js，勿手改 client.js）
node tools/build-plugin.js

# 安装（唯一正确方式，见 DSH 插件开发铁律）
dsh plugin --profile web add link:/home/phoenix/Projects/3DMine/packages/mine3d-float
```

离线安装包（GitHub Release）：<https://github.com/x-cores/dsh-3d-mine-game/releases/latest>

安装后刷新 Web 页面即可看到 🧊 按钮。

## 目录结构

```
engine/mine3d-engine.js   引擎（纯逻辑，流形邻居 + 无猜生成 + 泛洪/chord）
game/mine3d-view.js       CSS 3D 渲染 + 交互（零依赖，file:// 可用）
index.html                网页版
test-3dmine.js            引擎测试
tools/build-plugin.js     插件 client.js 生成器（engine+view 拼接，哈希防漂移）
packages/mine3d-float/    DSH 插件（悬浮窗）
docs/specs/               设计文档（含硬伤判断结论）
```
