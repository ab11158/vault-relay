# Vault Relay 5.2.17 TEST

Obsidian 的 Windows、Android、iOS / iPadOS 增量 ZIP／ACK 传输插件，正式笔记须人工审核确认。

本版统一 outgoing／incoming，下载原件安全移动归集、导入全部完成后清理正文暂存包，并在下载列表提供原目录定位。③直接打开同步空间，手机备用目录设置暂时隐藏，Android 后台搜索支持续扫。失败和权限不足时保留可靠原件并显示状态。

百度上传使用 `/disk/main`、下载使用 `/disk/synchronization`，短路径内部补齐一次 `/_pcs_.workspace`。浏览器电脑版仍须用户设置；没有云端清单与自动下载。

通过 BRAT 添加 `ab11158/vault-relay`，或从本版 Release 下载 PluginOnly ZIP。插件 ID 为 `vault-relay-v4`。升级只替换三个插件文件，保留本机 data.json、GroupID、独立 DeviceID、配对、历史、ACK及自动运输开关。

使用说明见 USER-GUIDE.md；验证范围见 TEST-STATUS.md。本版尚待三端真机闭环验证。未知或未完成文件不强制清空，收到的 ACK 留在 incoming；发送包仍按有效 ACK 与原30天隔离保护处理。
