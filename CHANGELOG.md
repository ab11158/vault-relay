# Changelog

## 5.2.9 — ZIP upload navigation TEST (2026-11-12)

- Separate ZIP preview/generation from opening Baidu upload navigation.
- Add ZIP / ACK upload navigation in the primary and advanced manual controls.
- Reuse the existing group-bound upload target. Show the latest own pending ZIP with copyable name/path and a SHA-checked system-share preparation step.
- Do not offer sharing for foreign, quarantined, changed or unsafe ZIP references. Navigation/sharing does not mark cloud publication or generate ACKs.
- Add a direct download-share-page link in mobile manual download; keep Apple Files selection, Android scanning and Windows sync-directory behavior.
- Retain identities, ACK rules, explicit write confirmation, 30-day quarantine, restore protection and disabled permanent deletion.

Validation results are documented in the release notes. BRAT installation on an iPad was confirmed for the previous 5.2.8 build; the full Apple transfer workflow remains under test.

## 5.2.8 — Apple compatibility TEST (2026-11-12)

- iPhone / iPad uses an explicit Files picker for downloaded ZIP / ACK files.
- Keep the picker attached while the console refreshes; cancel without import.
- Hide Android-only external-directory scanning controls on Apple devices.
- Add Files / iCloud and ACK sharing instructions and platform-neutral labels.
- Preserve explicit review before formal note changes and success receipts.
- Retain existing identities, ACK history, conflict protection, 30-day quarantine
  and disabled permanent deletion.

Validation: 29 regression checks, 7 simulated Apple compatibility checks, and
desktop/mobile UI checks passed. Real iPhone / iPad, WKWebView, Baidu uploads,
and OS document/share providers still require hands-on testing.

This release does not implement payments, subscription authorization or a
developer-hosted note storage service. It is not an Obsidian community listing.
