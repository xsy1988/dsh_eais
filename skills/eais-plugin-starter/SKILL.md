---
name: eais-plugin-starter
description: 在企业模式的插件创作会话中，引导员工使用受校验的脚手架一次完成合格插件。
---

# 员工插件创作主流程

仅在 `/插件创作` 已开启时工作。不要让员工理解 preset、profile、bundle、slot、delivery 或 content_hash。

开始设计前必须读取并遵守 `eais-plugin-data` 和 `eais-plugin-ui`；签名安装前读取 `eais-plugin-check`，交付前读取 `eais-plugin-review`。

1. 先确认业务目标。每次给 3–5 个具体选项：形状（列表/趋势/工作台）、数据来源（只列员工有权的动作中文名）、位置（默认主区并带左侧入口）。三组都允许跳过；没有特殊理由使用主区。
2. 固定按 `scope → capabilities → sample` 确认动作、参数、字段、行数与内联限制。`sample` 必须检查 `delivery` 和实际行结构，不猜字段，不把 digest 当空结果。
3. 先确认当前会话的实际工作区绝对路径，目标目录必须位于其中。默认使用 `templates/scaffold.mjs` 生成，禁止从空白目录逐层拼 package/cordis/client。趋势用 `trend`，多条记录用 `list`，单条详情用 `workbench`。参考已有插件时仍须通过同一校验器。
4. 在一次文件生成中完成完整功能。根据 `sample` 调整动作参数、字段映射、文案和展示，不要先安装静态版再反复加层。写大文件时分段，但最终必须完整；每轮修改后运行 `node --check` 和 `templates/verify.mjs`。
5. 数据访问硬规则：只用 `ctx.eaisData.call`；禁止 `ctx.get('eaisData')`、浏览器直连 edge、读取员工卡或凭据、`pluginCtx.name`、`fiber.name`、自定义身份请求头。
6. 界面硬规则：根节点拥有 `height:100%; min-height:0; overflow:auto`；使用 DSH 原生 token；有 loading、empty、error 和渲染错误边界；刷新忽略旧响应；`delivery=digest` 明确提示，不能渲染成空白。
7. 严格按 `eais-plugin-check` 执行 `verify → plugin_check 预检 → 假数据预览与命名确认 → finalize 改写正式名 → verify → plugin_submit → 写返回 manifest → verify → install_bundle → 停止`。预检不占号，未经员工确认不得提交；安装只在完整功能通过后执行一次。
8. 安装成功后停止修改，请员工按 `eais-plugin-review` 验收。若员工要求修改，升级版本并完整重签；不得在已签名目录里悄悄改文件。交付时给 3–5 个具体修改选项，不问“还要改什么”。

任何校验失败都先修复源码，不得通过关闭校验、绕过 guard 或直接改运行库来交付。
