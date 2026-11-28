# Vault Relay 8.1 真机测试版

Vault Relay 8.1 统一了增量 ZIP 的查找规则。圈④、圈⑤、控制台「刷新」和「手动查找／选择 ZIP」都先轻量扫描。点「全盘扫描」才逐层查找系统允许读取的目录。加入群组前后使用同一范围，群组校验在接收阶段进行。全部功能免费。

- Android 轻量扫描直接检查 `Download/DLManager`、`Download/BaiduNetdisk`、`Download` 和 `Documents`，并检查本机配置和记住的来源目录。各端检查当前库的 `Dbox` 和 `inbox`。
- 全盘扫描取消目录深度、条目数量和总耗时上限。遇到个别目录无法读取时继续扫描其他目录。所有知识库的 `VaultRelay-Transfer/outgoing` 及其子目录均排除。
- Android「查看下载的文件」也取消查找上限。使用说明补充了 iPhone／iPad 的 Safari 下载设置、圈③短路径和通过微信传首包的流程。

## 安装

BRAT 仓库填 `ab11158/vault-relay`，版本选择 `8.1`。手动安装可下载 `VaultRelay-8.1-PluginOnly.zip`，把 `main.js`、`manifest.json` 和 `styles.css` 替换到测试库的 `.obsidian/plugins/vault-relay-v4/`，保留 `data.json` 和 `VaultRelay-Transfer`，然后重新启用插件。

## 真机复测

1. Windows 在测试库 A 生成一份带新笔记的增量 ZIP 并上传。Red 手机用百度网盘 App 下载到 `BaiduNetdisk/_pcs_.workspace/00Obsidian/VaultRelay-Transfer/test3/` 或本机对应的实际路径。
2. 在未入组的手机测试库点圈④，观察轻量扫描。若 `test3` 尚未被记住，点审核页的「全盘扫描」，核对是否找到 ZIP。也可以分别从圈⑤和「手动查找／选择 ZIP」重复检查。核对未入组时原件仍在下载目录，测试笔记未写入。
3. 手机加入测试库 A 的群组，按同样路径重新扫描。找到后在审核页检查来源，确认导入，再核对测试笔记正文。
4. 如果有 `Download/DLManager` 下的测试包，检查轻量扫描是否能找到。全盘扫描应继续排除 `VaultRelay-Transfer/outgoing` 及其子目录里的包。
5. iPhone／iPad 把同组测试 ZIP 保存到当前库 `VaultRelay-Transfer/Dbox`，点圈④检查轻量扫描和审核。库外文件可用「添加外部 ZIP / 回执」手动选取。

详细流程见 [使用说明](USER-GUIDE.md)。
