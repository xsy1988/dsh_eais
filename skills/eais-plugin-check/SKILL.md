---
name: eais-plugin-check
description: 用固定顺序校验、登记、签名和安装员工自建插件，避免哈希漂移与重复安装。
---

# 检查与安装

顺序不可调整：

1. **verify**：运行 `node templates/verify.mjs <插件绝对目录>`。失败则修复源码并重新 verify，禁止进入签名。
2. **plugin_check**：把 verify 输出的 `manifest` 作为参数原样传入，包括 `package_name`、`version`、`content_hash`、`dependency_tree_digest`、`eais_actions`。新建时 `plugin_no` 留空；已有插件登记新版本时传原 `plugin_no`。
3. **写 manifest**：把 `plugin_check` 返回的 `manifest` 原样写入包根目录 `.eais-plugin.json`。它包含签名及完整签名字段，不手工构造，不省略 `declaredActions`、`expandedActions` 或依赖摘要。该文件不参与内容哈希。
4. **再 verify**：确认包名、版本、动作声明和内容哈希仍与签名一致。失败说明签名后发生了漂移，不得安装。
5. **install_bundle**：只调用一次 `plugin_manager install_bundle`，target 是当前工作区内的绝对目录。不得使用 registry 包名、URL、相对路径或绕过审批。
6. **停止**：安装后不再修改任何文件。`applied` 才表示已装好；`restart-required` 必须请员工确认重启；pending/failed 不宣称成功，也不自动退出创作态。

## 修改与诊断

- 签名后禁止改代码、locale、icon、package、cordis 或版本。任何变化都先升级 `package.json version`，再从第 1 步完整执行。
- “插件内容已变化”表示哈希漂移，不是让员工重试安装；执行“verify → 升版本 → plugin_check → 写 manifest → verify”。
- 新版本签名与二次 verify 完成后，如果 DSH 返回 `already-installed`，这是换版而不是新装：先用 `plugin_manager remove_bundle` 移除该包的旧安装记录，再对新版绝对目录只调用一次 `install_bundle`。不得删除源码；不得在未重签时 remove/install 原目录。
- 安装失败用 `plugin_log` 和返回的 `checklist` 给出一句人话及下一步，保留源码。peer 版本不匹配显示“和当前 DSH 版本对不上，我帮你改一下”。
- 回滚只选择之前已签名且仍有效的版本，调用同一安装器恢复，不删除源码。
