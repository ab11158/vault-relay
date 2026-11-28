# Vault Relay 8.0

8.0 以 7.15 为基础，全部功能免费。通过百度网盘网页或 App 传输增量 ZIP，无需自建同步服务器、申请百度网盘 API 或开通网盘会员。爱发电赞助完全自愿。

- 未加入群组也可以通过「刷新」、④、⑤、「手动查找／选择 ZIP」或「查看下载的文件」查找本机 ZIP。找到的原件保留在原处，加入对应群组后可以审核导入。
- Android「查看下载的文件」可进入百度下载路径里的 `VaultRelay-Transfer` 群组目录，继续排除 `VaultRelay-Transfer/outgoing`。
- 设备管理增加「解绑」和「删除」，并将设备状态、简称、ID 和操作分区显示。隐藏高级操作中重复的手动传输，移动端仍可从对应区域查找本机草稿和扫描状态。

## 安装

使用 BRAT 时，在 `ab11158/vault-relay` 选择 `8.0`。手动安装可用 `VaultRelay-8.0-PluginOnly.zip`，用里面的 `main.js`、`manifest.json` 和 `styles.css` 替换测试库 `.obsidian/plugins/vault-relay-v4/` 下的同名文件。保留 `data.json` 和 `VaultRelay-Transfer`，再重新启用插件。

## 真机互测

1. Windows 在测试库 A 生成含一篇新笔记的 ZIP 并上传。Android 用百度网盘 App 下载到带 `VaultRelay-Transfer/test3` 的目录。
2. Android 打开未加入群组的测试库。点④，再点「全盘扫描」，确认能找到 ZIP。打开「查看下载的文件」，检查也能列出这个包，且未列出 `outgoing` 中的包。核对原 ZIP 仍在原位置，测试笔记未写入。
3. Android 加入 A 的群组，重新点⑤并确认导入。反向回传一次普通增量。测试隐私笔记定向开放时，核对设备信任及逐篇授权。
4. 在设备管理里对一台已信任设备点「解绑」，核对名片保留。再点「删除」，核对设备记录移除，已导入笔记和操作日志保留。
5. iPad 把包保存到当前知识库的 Dbox，测试轻量扫描和「添加外部 ZIP / 回执」。

详细流程见 [使用说明](USER-GUIDE.md)。
