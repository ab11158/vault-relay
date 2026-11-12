# Vault Relay

Transfer notes and acknowledgements using user-managed ZIP files and Baidu Netdisk, with explicit review before formal note changes.

## 5.2.8 Apple compatibility TEST

Supports Windows, Android, iOS and iPadOS through separate platform branches. The Apple build uses the system Files picker rather than scanning other apps' download folders. This release has automated compatibility coverage but has **not** passed a real iPhone/iPad test yet. No continuous background sync is promised on Apple devices.

## Install and use

Install BRAT from Obsidian's community plugins, then use **Add beta plugin** and enter **ab11158/vault-relay**. Enable Vault Relay after installation and check that the console shows version 5.2.8. See the [Apple installation and test guide](APPLE-INSTALL.md).

This repository uses a regular GitHub release so BRAT's default latest-release lookup can install it. The release title, changelog and documentation explicitly mark it as a TEST build, not production validation.

Use an isolated test vault. Existing installations should preserve data.json, identity, pairing, ACK history and all transfer folders. New Apple devices must receive a new identity; join using the existing GroupID rather than copying another device's data.json.

Download ZIP/ACK files from your own Baidu sharing folder, save them to Files and select them in Vault Relay. Receiving a ZIP only stages version data; explicit review and confirmation are required before formal notes are written. Generate and upload ACK files afterward and verify their receipt on the sending computer.

## Safety and service disclosures

- No payment, account service, trial enforcement or subscription activation is implemented in this build.
- Uses your own Baidu Netdisk account/client or browser for transfer. No developer-hosted note storage is provided.
- Apple access outside the vault is limited to files explicitly selected by the user; Android can probe user-readable download locations; desktop uses user-configured local Baidu sync folders. Sources are preserved.
- System sharing depends on Obsidian and OS support. Opening an upload page or share sheet does not prove cloud delivery.
- Quarantine lasts at least 30 days; permanent deletion is disabled in this test build. Cloud/sync-folder deletion is prohibited. Existing destinations are never overwritten during restore.
- See [privacy disclosures](PRIVACY.md).

## License and distribution

The original Vault Relay code retains its copyright and is available for free evaluation under the [test build license](LICENSE). It is not offered under a permissive open-source license. Bundled JSZip and its dependencies retain their own licenses; see [third-party licenses](THIRD_PARTY_LICENSES.md). This GitHub test release does not imply acceptance into the Obsidian community directory.
