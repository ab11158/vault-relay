# Changelog

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
