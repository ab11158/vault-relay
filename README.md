# Vault Relay 7.7

Vault Relay 通过共享群组和百度网盘同步 Obsidian 知识库。Windows、Android、iOS 和 iPadOS 使用同一插件，导入笔记前需要审核确认。

7.7 是真机测试版。本版调整导入后的文件索引更新，并把手机上传预览的文件列表前移。Android 实机仍需按说明复测。Windows 和 Android 可扫描系统允许读取的下载目录。各设备也可手动选择百度网盘批量 ZIP，或把它放进 Dbox，集中审核校验通过的原始增量包。自动接收没有下载时间限制，同一增量包的多份副本只进入一次审核。每台设备第一次启用时生成自己的设备 ID。增量包会带上设备 ID 和简称，在「设备管理」中确认信任后，即可按简称选择隐私笔记的开放对象。

从 [GitHub 7.7 发布页](https://github.com/ab11158/vault-relay/releases/tag/7.7) 获取安装文件。建议在各设备分别新建空白测试库，再安装 7.7。使用 BRAT 安装时可指定版本 7.7。

- [安装与真机测试](RELEASE-7.7.md)
- [本次修复与复测](TEST-7.7.md)
- [操作指南](USER-GUIDE.md)
- [隐私与授权](PRIVACY.md)
- [注意事项](PRECAUTIONS.md)
- [测试状态](TEST-STATUS.md)

最低 Obsidian 版本为 1.5.0。请在参与测试的设备上统一使用 7.7。
