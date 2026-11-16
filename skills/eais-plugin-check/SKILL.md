---
name: eais-plugin-check
description: 用预检、预览、提交、签名和安装的固定顺序交付员工自建插件，避免提前发号与哈希漂移。
---

# 检查、预览与安装

顺序不可调整：

1. **verify 与预检**：运行 `node templates/verify.mjs <插件绝对目录>`。把 manifest、`display_name`、`slug` 和当前工作区 `preview.html` 的绝对路径 `preview_path` 传给 `plugin_check`。预检只返回候选正式名和数据摘要，不发号、不签名。
2. **预览与确认**：让员工打开可点击预览，确认“数据是假的，样子是真的”，并核对显示名、候选正式名、读取字段和不会修改数据。选择“再改改”时保留工作区并回到修改；只有明确选择“就这样装”才继续。
3. **正式名改写**：运行 `node templates/finalize.mjs --target <目录> --package <候选正式名> --panel <panelId> --label <显示名>`，然后重新 verify。已有插件改版使用原 `plugin_no`，不得改名。
4. **plugin_submit**：传入正式名改写后的 verify manifest、显示名、slug、原 `plugin_no`（改版）、稳定 `submission_id` 和当前 `preview_path`。重试同一提交必须复用该编号。提交成功后 Host 会同步签名制品，上线时不再依赖本机源码。
5. **写 manifest**：把 `plugin_submit` 返回的 manifest 原样写入包根目录 `.eais-plugin.json`。它包含签名及完整签名字段，不手工构造，不省略 `declaredActions`、`expandedActions` 或依赖摘要。该文件不参与内容哈希。
6. **再 verify**：确认包名、版本、动作声明和内容哈希仍与签名一致。失败说明签名后发生漂移，不得安装。
7. **install_bundle**：只调用一次 `plugin_manager install_bundle`，target 是当前工作区内的绝对目录。不得使用 registry 包名、URL、相对路径或绕过审批。
8. **停止**：安装后不再修改任何文件。`applied` 才表示已装好；`restart-required` 必须请员工确认重启；pending/failed 不宣称成功，也不自动退出创作态。

## 修改与诊断

- 签名后禁止改代码、locale、icon、package、cordis 或版本。任何变化都先升级 `package.json version`，再从第 1 步完整执行。
- “插件内容已变化”表示哈希漂移，不是让员工重试安装；执行“verify → 升版本 → plugin_submit → 写 manifest → verify”。
- 新版本签名与二次 verify 完成后，如果 DSH 返回 `already-installed`，这是换版而不是新装：先用 `plugin_manager remove_bundle` 移除该包的旧安装记录，再对新版绝对目录只调用一次 `install_bundle`。不得删除源码；不得在未重签时 remove/install 原目录。
- 安装失败用 `plugin_log` 和返回的 `checklist` 给出一句人话及“帮我看看”，保留源码。peer 版本不匹配显示“和当前 DSH 版本对不上，我帮你改一下”。
- 回滚只选择之前已签名且仍有效的版本，调用同一安装器恢复，不删除源码。
