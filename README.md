# Vault Relay 5.2.18 TEST

Obsidian 的 Windows、Android、iOS / iPadOS 增量同步插件，正式笔记须人工审核确认。

一次传输一个 ZIP，包含内容与待回传 ACK／ACK-R；无新内容时反馈暂存。重复下载按完整 SHA 识别，下载时间提示配合网盘实际上传时间选择文件。知识库管理提供增量包配对及多终端同步记录比对；Android 扫描支持勾选审核、停止继续搜索并完成已找到文件的检查。

通过 BRAT 添加 `ab11158/vault-relay`，或安装 Release 的 PluginOnly ZIP。插件 ID 为 `vault-relay-v4`；升级只替换三个插件文件，保留本机 data.json、群组、独立设备身份及账本。所有参与终端需升级到5.2.18，旧版不能处理新版内容 ACK 与 R。

使用说明见 USER-GUIDE.md，自动验证与限制见 TEST-STATUS.md。Windows 启用安全回收与恢复，移动端增量包管理暂为只读，本机生成 ACK 原文件清理暂未启用。系统分享、打开目录和三端网盘闭环待真机验收。未完整导入的内容包保留，网盘与百度同步目录原件保护。实际目录拼写迁移留待正式版。
