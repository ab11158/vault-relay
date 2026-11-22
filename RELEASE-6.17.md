# Vault Relay 6.17 真机测试版

Windows、Android 和 iOS／iPadOS 共用此版本。安装后，同步控制台标题显示「Vault Relay V6.17」。

- 在「公共设置」和向导第一步可以「创建群组」或「加入已有群组」。同组仅由一台设备创建，其余设备粘贴完整 GroupID 加入。老设备升级后可打开「群组设置」查看和复制原 GroupID。
- 「公共设置」与三步设置向导共用系统身份、百度网盘和本机下载配置。Win 和安卓可以选填其他本机下载目录。
- `VaultRelay-Transfer/Dbox` 是浏览器下载位置。打开控制台后，校验通过的增量 ZIP 归集到 `inbox`，随后进入审核。普通下载及未通过校验的 ZIP 留在 `Dbox`。

## 安装

- **iPad、iPhone 和安卓**：在 Obsidian 的 BRAT 中找到 `ab11158/vault-relay`，选择版本 `6.17`（预发行），然后启用 Vault Relay。首次用 BRAT 时，先用「添加 Beta 插件」添加该仓库。
- **Windows 手动安装**：停用 Vault Relay，解压 `VaultRelay-6.17-PluginOnly.zip`，将其中的 `main.js`、`manifest.json` 和 `styles.css` 替换到测试知识库的 `.obsidian/plugins/vault-relay-v4/`，保留原有 `data.json`，再启用插件。

## Win1 → iPad 验收

| 步骤 | 操作 | 观察现象 |
| --- | --- | --- |
| 1. 检查群组 | 两端打开「群组设置」，分别看「已绑定的 GroupID」。未绑定的端填入对端的完整 GroupID，点「加入已有群组」。 | 两端 GroupID 完全一样，Device ID 各自独立。已绑定端可以复制完整 GroupID。 |
| 2. 设置 Safari 下载位置 | 在 iPad 的「设置向导 → 下载设置」点「创建并复制 Dbox 路径」。进入 iPad「设置 → App → Safari 浏览器 → 下载 → 其他…」，选择当前知识库的 `VaultRelay-Transfer/Dbox`。 | 在系统「文件」中能看到 `Dbox`。`Dbox` 和 `inbox` 都位于 `VaultRelay-Transfer` 下。 |
| 3. 做普通文件对照 | 在 iPad 用 Safari 下载一个普通文件，例如 PDF，再打开同步控制台。 | 文件留在 `Dbox`。它不会出现在审核页或进入 `inbox`。 |
| 4. 下载新包 | Win1 保持自动收发关闭。新建 `V617-iPad-Dbox测试.md`，写入「6.17 Dbox 测试，确认后写入」。生成增量 ZIP，记录完整包名并上传。iPad 用 Safari 下载此 ZIP，打开控制台。 | ZIP 从 `Dbox` 归集到 `inbox`，自动打开「审核与确认导入」。确认前 iPad 没有这篇笔记。点「取消审核」后 ZIP 保留，正文仍未写入。 |
| 5. 确认导入 | 再打开控制台，查看审核页里的笔记名与正文，确认导入。 | iPad 出现笔记，正文与 Win1 一致。完成核验后，本次接收 ZIP 从 `inbox` 清理。 |
| 6. 重复下载 | 在 iPad 再下载步骤 4 的同一个 ZIP，即使 Safari 给名称加上 ` 2` 或 ` (2)` 也照常打开控制台。 | 显示「对端重复包」。点「确认清理」只清理本次副本，笔记正文和 ACK 数量保持原状。 |

异常时请记录完整 ZIP 名、`Dbox` 与 `inbox` 当前状态、审核页信息，再导出对应的操作日志。
