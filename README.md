# Vault Relay Mix

Sync notes and attachments between Obsidian vaults on Windows, Android, iPhone, and iPad using incremental ZIP packages. Review incoming changes before writing to the receiving vault. Share access to restricted notes with selected devices.

Vault Relay is free to use. You can transfer ZIPs through the Baidu Netdisk website or app, or move them yourself. There is no Vault Relay account, relay server, Baidu API key, or paid Baidu membership requirement.

## Installation

Once Vault Relay is listed in Obsidian Community Plugins, you can install it there. For manual installation, extract `main.js`, `manifest.json`, and `styles.css` from the [8.7.1 release](https://github.com/ab11158/vault-relay/releases/tag/8.7.1) into the vault's plugins folder under `vault-relay-mix`. Requires Obsidian 1.5.0 or later. If you are upgrading from the original `vault-relay-v4` ID, [migrate your existing settings before enabling Vault Relay Mix](USER-GUIDE.md#从旧插件-id-迁移).

## Network and file access

- The upload and download controls open Baidu Netdisk (`pan.baidu.com`) in your browser. When you use Baidu for transfer, use your own Baidu account in its website or app. Vault Relay prepares ZIPs locally and leaves the cloud upload and download to you. You can also share the ZIP directly between devices.
- To find and collect ZIPs, Vault Relay reads download folders the platform makes accessible, such as the system Downloads directory, Baidu Netdisk download folders, or a folder you select. These can be outside your vault. The file picker can read ZIPs you explicitly select. It can also read and write a configured Windows transfer folder for exchanging packages. After you confirm processing, Vault Relay can move or remove the processed ZIP according to your choice and the source's permissions.
- Ordinary notes are readable within the ZIP. Restricted notes use per-note encryption and device-based access rules. See [privacy and authorization](PRIVACY.md) before sharing a package.

## 中文使用说明

Vault Relay 使用增量 ZIP 在多端传输笔记和附件。同步前先审核，可核对同一路径的冲突内容，也可以把受限笔记定向开放给指定设备。可以通过百度网盘网页或 App 传包，也可以用其他方式传包。使用百度网盘无需申请 API、开通网盘会员或自建同步服务器。

- [插件特点、详细使用说明和问答](USER-GUIDE.md)
- [旧版迁移](USER-GUIDE.md#从旧插件-id-迁移)
- [隐私与授权](PRIVACY.md)
- [版本历史](CHANGELOG.md)

## 自愿赞助

[自愿赞助 Vault Relay（爱发电）](https://afdian.com/a/ab11158)

赞助自愿，插件功能、安装和更新均可免费使用。

## License

The [Vault Relay license](LICENSE) permits free installation and use in Obsidian. Permission from the copyright holder is required to reuse original Vault Relay code in other apps or plugins, subject to applicable law. Bundled components retain their [third-party licenses](THIRD_PARTY_LICENSES.md).
