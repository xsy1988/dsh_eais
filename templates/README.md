# 员工插件模板与创作工具

这三个目录不是直接安装的插件。必须用 `scaffold.mjs` 生成目标目录，再按真实 `sample` 结果调整字段、参数和展示逻辑。

## 生成

在本仓库根目录运行：

```bash
node templates/scaffold.mjs \
  --template trend \
  --target /absolute/workspace/sales-trend \
  --package @local/sales-trend \
  --action erp.analytics.sales_trend \
  --label 销售趋势 \
  --description 用柱状图和折线查看每月销售额与销量
```

- `--template`：`trend`（柱线趋势与明细）、`list`（可筛选表格）、`workbench`（单记录详情）。
- `--action`：只能使用 `capabilities` 返回且已通过 `sample` 验证的动作码。
- 目标目录必须不存在或为空；工具不会覆盖已有源码。
- 包名、动作、标题、说明和面板 ID 会替换到 package、cordis、locale 与客户端中。

## 校验、签名和安装

每次修改源码后、签名前运行：

```bash
node templates/verify.mjs /absolute/workspace/sales-trend
```

成功输出中的 `manifest` 可直接作为 `plugin_check` 参数；新建插件不传 `plugin_no`，已有插件传原插件号。`plugin_check` 返回的 `manifest` 原样写入插件根目录 `.eais-plugin.json`，不要手工删字段或重新拼签名。

写入签名后再次运行 `verify`。只有第二次也通过，才能调用一次：

```text
plugin_manager install_bundle(target=/absolute/workspace/sales-trend)
```

安装是新创作流程的最后一个动作。签名后不能再改文件；任何改动都必须升级 `package.json` 的 `version`，重新执行 `verify → plugin_check → 写 manifest → verify → install_bundle`。若同包旧版已经安装，必须在新版重签并通过二次 verify 后，先 `remove_bundle` 移除旧安装记录，再对新版执行一次 `install_bundle`；不要删除源码或直接覆盖同版本。

`verify` 覆盖：包结构和导出、动作声明、JavaScript 语法、虚拟数据服务、禁止直连和读取凭据、digest 处理、加载/空/错误状态、过期响应保护、根节点滚动、签名哈希和版本一致性。它不能代替真实页面的业务与视觉验收。

## 客户端契约

- 只通过 `ctx.eaisData.call({ code, params, detail: 'auto' })` 取数。禁止 `ctx.get('eaisData')`、直连 edge、读取员工卡、传自定义身份头。
- `delivery: 'inline'` 才读取 `rows`；`delivery: 'digest'` 是降级结果，不是空数据，必须提示缩小范围或调整动作内联策略。
- 进入视图读取一次，手动操作才刷新；用序号或取消机制忽略旧响应。
- 根节点必须拥有 `height:100%; min-height:0; overflow:auto`。
- 使用 DSH `--dsw-alias-*`、`--dsw-font-*`、`--dsw-radius-*` token，不引入另一套配色和控件体系。
- 必须有加载、空、错误和渲染错误边界；样式注入与 slot 注册都要随插件释放。

## 部署前置条件

- edge/core 开启 `EAIS_PLUGIN_FORGE_ENABLED=true`，DSH EAIS 插件开启 `pluginForge`。
- Host 的 `/eais/data/query` 数据代理可用；浏览器不直接访问 edge。
- 动作允许当前员工执行，`package.json` 的 `eaisActions` 与服务端签名声明一致。
- 需要图表或表格展示明细时，动作的 `inline_policy_json` 必须显式开启，并设置合适的 `max_rows`、`max_bytes`、`max_fields`；`kind=process` 且 `op=read` 的动作同样可以内联。
- 内联策略必须写入可重复部署的 L1 配置源。只修改运行 SQLite 会在下次导入模型时被覆盖。
- 默认输出上限必须足够完成客户端文件生成；`defaultMaxTokens` 不应再使用 4096。
