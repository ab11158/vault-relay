# Vault Relay

Transfer notes and acknowledgements using user-managed ZIP files and Baidu Netdisk, with explicit review before formal note changes.

## 5.2.10 — Shared console and adaptive lists TEST

Common settings and operations use the same names, grouping and responsibilities on Windows, Android and iPad/iOS. Platform settings remain separate: **Windows 专用设置** contains the local Baidu sync folder and automatic transport controls; **移动端专用设置** describes Android scanning or Apple's Files picker.

Baidu share link, extraction code and the optional **百度网盘上传文件夹** belong to **设置与连接检查 → ① 公共设置**. The upload folder is a cloud navigation path, not a local ZIP destination. An unset field explicitly says 尚未设置 and upload navigation opens your own netdisk homepage. Baidu login or app redirects may require manually locating the folder.

Every upload navigation button opens Baidu directly, without an intermediate plugin dialog. Download navigation opens the group share page. Generated ZIP results appear inline beside the ZIP controls; independent ACK files and sharing actions appear only in ACK 高级管理. Empty lists are hidden, small lists fit their content, and large lists scroll within a height limit. Truncated labels remain expandable by tap or keyboard.

## Install and use

Install BRAT from Obsidian's community plugins, then add **ab11158/vault-relay**. Enable Vault Relay and check for **5.2.10**. For an existing BRAT installation, check for updates or change a pinned version to 5.2.10. See the [Apple guide](APPLE-INSTALL.md).

Use a test vault. Keep existing data.json, identities, pairing, ACK history and transfer folders when upgrading. A newly added device must have its own Device ID and join the existing GroupID; do not copy another device's data.json.

Download ZIP/ACK files from your own sharing folder, save them to Files on Apple devices, then select them in Vault Relay. Receiving a ZIP only stages version data. Review and explicit confirmation are required before formal notes are written. Generate and upload ACK files afterward and verify their receipt on the sending computer.

This is a regular GitHub release for BRAT latest-version lookup, explicitly labeled TEST. It is not an App Store release or an Obsidian community listing.

## Validation and limitations

29 regression checks, 7 simulated Apple compatibility checks and Android/iOS-mode browser UI checks pass. Browser checks cover direct navigation, common settings, ZIP/ACK validation, empty/single/overflowing lists, readable diagnostics, expandable labels, and Apple picker/share behavior using mocks. They do not prove actual Safari, OS sharing or Baidu navigation/upload behavior.

For the prior 5.2.9 version, an iPad installation, restart identity retention, small ZIP formal import, repeated selection with no new items, and independent ACK generation were verified on hardware. The iPad ACK cloud return to Windows is still pending. 5.2.10 requires device validation after upgrading.

## Safety and service disclosures

- No payment, trial enforcement or subscription activation is implemented in this build.
- Uses your own Baidu Netdisk account/client or browser. No developer-hosted note storage is provided.
- Apple access outside the vault is limited to files explicitly selected by the user; Android can probe readable download locations; Windows uses a configured local sync folder. Source files are preserved.
- Opening a page or share sheet does not prove cloud delivery, mark cloud publication or create a successful import ACK.
- Quarantine lasts at least 30 days. Permanent deletion is disabled, including after expiry. Cloud/sync-folder deletion is prohibited. Restore refuses to overwrite an existing destination.
- See [privacy disclosures](PRIVACY.md) and [version comparison](VERSION-COMPARISON.md).

## License

Original Vault Relay code is available for free evaluation under [LICENSE](LICENSE), not a permissive open-source license. Bundled JSZip and dependencies retain their own licenses in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
