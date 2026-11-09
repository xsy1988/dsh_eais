---
name: eais-plugin-data
description: 为员工插件选择业务动作、验证 inline/digest 结果并使用 ctx.eaisData 取数。
---

# 插件数据能力

## 选择与验证

- 顺序固定为 `scope → capabilities → sample`。动作码只来自实际返回，参数只使用声明字段；不猜系统、表名、动作或返回字段。
- `capabilities` 必须看 `op`、`kind`、`limits.max_rows`、字段分类和内联限制。`kind=process` 不代表只能返回摘要，读动作是否能返回明细由 `op=read` 与内联策略共同决定。
- `sample` 最多三行，仍受字段、行数和脱敏限制。每次必须读取响应的 `delivery`：
  - `inline`：`rows` 和 `columns` 可用于界面；按真实样例确认键名、日期格式、数字值和空值。
  - `digest`：只有摘要/引用，没有可渲染明细；绝不是“没有数据”。图表、表格和详情插件不得继续假定 `rows` 可用。
- 遇到 digest 时，优先缩小参数范围并重新 sample；仍不够时停止编码并说明需要管理员为该读动作开启合适的 inline policy。不得把 digest 当空数组、伪造示例数据或直接改运行库。
- 显式 `full` 超限会得到 `E_LIMIT_EXCEEDED`；默认使用 `detail:'auto'`。结果可能 `truncated`，界面必须标明仅显示部分结果。

## 客户端调用

- `package.json` 写 `eaisActions:[...]`，只声明界面实际调用的读动作。动作、参数或声明变化后必须升级版本并重新签名。
- 只写 `ctx.eaisData.call({ code, params, detail })`。禁止 `ctx.get('eaisData')`，禁止 fetch/XHR 直连 edge，禁止传插件号、表名、员工卡、凭据或自定义身份头。
- 从 `sample` 复制真实字段映射，不根据英文字段名臆测业务含义。数字解析要容忍字符串，空值不显示为伪造业务数据。
- 进入视图取一次，筛选或手动刷新才重取。每次请求递增序号，只有最新请求能更新 state，避免连续刷新重复或旧响应覆盖新响应。
- `ctx.eaisData` 不可用时显示“企业数据服务不可用，请重新打开插件”，不要触发未定义属性异常。
- 错误映射至少包括：`E_SCOPE_DENIED` → “你没有查这类数据的权限”；员工卡/插件身份失效 → 重新登录；网络错误 → “连不上，请稍后重试”；digest → 缩小范围或联系管理员开启明细。
