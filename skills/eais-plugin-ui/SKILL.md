---
name: eais-plugin-ui
description: 为员工插件实现与 DSH 原生界面一致、可滚动、可响应且具备完整状态的 UI。
---

# DSH 插件 UI 契约

优先从 `templates/trend`、`list`、`workbench` 生成，不复制第三方仪表盘风格，不添加 UI 依赖。

## 设计 token 与层级

- 字体使用 `var(--dsw-font-family, sans-serif)`；颜色、背景、边框使用 `--dsw-alias-label-*`、`--dsw-alias-bg-*`、`--dsw-alias-border-*`、`--dsw-alias-state-*`；圆角使用 `--dsw-radius-*`。
- token 后的 hex 仅是兜底，不是新配色。浅色/深色都跟随 DSH；不要大面积写死白底、黑字或品牌蓝底。
- 页面标题 16px/24px、字重 500；正文和卡片标题 13px/20px；辅助、图例、表格 11–12px；指标值最多 15–16px。不要默认 20px 以上标题。
- 主内容最大宽度约 960–1120px，居中；区块间距 16px，卡片内边距 14–16px，页面内边距 24px，底部预留 36px。
- 卡片使用 0.5px 浅色边框、8–12px 圆角和层级背景；不使用厚重阴影、渐变和过粗分割线。
- 输入框与按钮高 28px、字号 12px；提供 hover、disabled、focus-visible。分段筛选使用同组按钮和 `aria-pressed`。

## 滚动与响应式

- 最外层插件节点必须同时拥有 `height:100%`、`min-height:0`、`overflow:auto`，并设置 `box-sizing:border-box`。内部卡片不要抢占整页滚动。
- 内容网格子项设置 `min-width:0`；长文本使用 `overflow-wrap:anywhere`，表格单元格可省略号并提供 `title`。
- 表格外层 `overflow-x:auto`；图表可设合理 `min-width` 并由外层横向滚动，不能压缩到不可读或撑破主区。
- 页头允许 `flex-wrap`；窄窗口中标题、筛选和刷新仍可见且可操作。

## 图表与表格

- 图表默认使用 DSH 品牌主色；柱与线不需要两种高饱和颜色。柱可用 0.55 透明度，线宽不超过 2px。
- 必须有坐标单位、图例、可访问名称和 `title` 明细；双轴各自计算比例，不能混用数值轴。
- 标签字号约 10.5–11px；月份按时间排序，过多时跳格显示。没有数据时不画一张看似正常的空图。
- 表格表头使用辅助色与 500 字重；数值右对齐、等宽数字；行分隔使用细边框，hover 跟随层级背景。

## 状态与生命周期

- 加载、空、错误、正常、截断都要有明确界面；错误容器使用 `role=alert`，保留可用旧数据时也要显示刷新失败。
- 用 React 错误边界包住面板，渲染失败不能导致整个 DSH 白屏；普通员工看人话，技术细节只写控制台。
- 样式通过带插件标识的 `<style>` 注入并返回清理函数；slot 注册和样式都随 apply 的 disposer 释放。
- 主区插件默认同时注册 `sidebar.panellist` 与 `main`；使用 `ctx.get('slots')` 取 slot 服务可以，但企业数据只能属性访问 `ctx.eaisData`。
