# DSH EAIS 插件

EAIS 的 DSH 客户端插件，独立于 EAIS 管理端和服务端仓库。

插件装进 DSH 后提供：

- 员工登录与员工卡管理；
- EAIS 企业模型（provider `eais`）；
- EAIS MCP 工具挂载；
- 企业模式图片、PDF、Word、PPT、Excel 登记与服务端文本化引用；
- 会话卡片、右侧栏、设置页；
- 内置守卫：工位清单上报、租约续期、工具掩码、收回指令执行。

插件本身不做业务判定；身份、授权、模型额度、数据范围、审计都在 EAIS 服务端。

## 环境要求

- Node.js 24
- pnpm 11

## 构建与测试

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

`pnpm build` 产出 `lib/index.js`、`lib/client.js` 和 `lib/types/`。DSH 从 `lib/` 加载插件。

## 安装到 DSH

```bash
pnpm build
'/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh' \
  plugin --profile eais add /Users/xiangsiyu/dsh_eais
```

安装后重启 DSH。配置项 `serverUrl` 默认是 `http://127.0.0.1:18080`，企业环境应改为实际 EAIS edge 地址，并保持只读。

验证：

```bash
dsh --profile eais --dump-config | grep -A2 "id: eais"
```

只应看到一条 `eais` 插件记录。守卫已内置，不需要再安装 `@corp/dsh-eais-guard`。

## 目录

```text
src/index.ts          host 面入口：登录、模型、MCP、守卫启动
src/client/           会话卡片、右侧栏、设置页
src/adapter/          EAIS LLM adapter
src/attachments.ts    原件登记、解析状态与 DSH 占位引用映射
src/guard/            工位清单、租约、工具掩码、收回与安装策略
skills/               插件创作、数据、UI、签名与验收技能
templates/            脚手架、静态校验器及趋势/列表/工作台模板
test/                 单元测试
integration/          真实 DSH 客户端加载组合测试
cordis.patch.yml      向 DSH profile 插入 eais 插件行
```

## 配置

```yaml
- insert:
    - id: eais
      name: '@corp/dsh-eais'
      config:
        serverUrl: http://127.0.0.1:18080
        serverUrlReadOnly: true
```

可选配置：

| 字段 | 默认 | 说明 |
|---|---|---|
| `serverUrl` | `http://127.0.0.1:18080` | EAIS edge 地址 |
| `serverUrlReadOnly` | `true` | 员工不能修改地址 |
| `softwareGuard` | `true` | 是否启动内置守卫 |
| `enforceModelMode` | `true` | 限制非企业模型路由 |

## 员工插件创作

创作会话默认从 `templates/scaffold.mjs` 生成插件和可点击的假数据 `preview.html`，再用 `templates/verify.mjs` 完成包结构、数据访问、UI 状态、滚动和签名哈希检查。`plugin_check` 只读预检；员工确认预览与名称后，`finalize.mjs` 写入平台正式名，`plugin_submit` 才定名、发号并签名。模板、固定提交顺序及部署前置条件见 `templates/README.md`；原生视觉规范见 `skills/eais-plugin-ui/SKILL.md`。

「我的插件」位于主界面左侧入口，支持真实打开、改版、回滚和分享。提交成功后 Host 即同步签名制品，之后换机器或清理工作区也不影响上线申请；审批后同事在授权范围内下载、复核并安装，不会向普通会话开放创作工具。升级前可设置 `EAIS_PLUGIN_BUNDLE_ROOT` 并运行 `pnpm test:upgrade`，在隔离 profile 中回归全部签名制品。

## 与管理端的关系

EAIS 管理端、console BFF 和 Go 服务仍在独立仓库中维护，本仓库不包含任何管理端页面或管理 API。插件只调用 edge 的 `/auth/*`、`/me`、`/llm/*`、`/attachments*`、`/mcp`、`/software/*`、`/view/*`，员工插件的数据由同源 Host `/eais/data/query` 代理。

## 版本

当前版本 `0.6.0`。升级插件版本后需要重新构建；DSH 侧替换已安装包后需重启以加载新的 JavaScript 模块。
