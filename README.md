# Vault Relay 7.2

通过共享群组和百度网盘同步 Obsidian 知识库。Windows、Android、iOS / iPadOS 使用同一插件；正式笔记的写入与删除须在审核页确认。

7.2 为真机测试版。普通、部分受限和完全受限笔记可以一起生成一个增量 ZIP。每篇受限笔记及附件使用独立的内部 ZIP 和随机密钥。

## 安装或升级

从 [GitHub 的 7.2 发布页](https://github.com/ab11158/vault-relay/releases/tag/7.2) 下载 VaultRelay-7.2-PluginOnly.zip 并解压。退出 Obsidian 后，将包中 vault-relay-v4 文件夹的三个文件放入知识库的 .obsidian/plugins/vault-relay-v4/，重新启用插件。升级时保留原 data.json，勿删除整个插件目录。

- [操作指南](USER-GUIDE.md)
- [隐私与授权](PRIVACY.md)
- [注意事项](PRECAUTIONS.md)
- [Apple 设备安装](APPLE-INSTALL.md)
- [7.2 更新说明](RELEASE-7.2.md)
- [测试状态](TEST-STATUS.md)

最低 Obsidian 版本为 1.5.0。7.2 可以读取 7.0 和 7.1 的旧受限包。各端升到 7.2 后再交换新格式的包。
