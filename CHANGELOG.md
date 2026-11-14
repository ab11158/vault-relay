# 5.2.11 TEST — 可选同步空间入口

此前普通网盘上传入口固定使用 `/disk/main`，无法准确表达同步空间的 `/disk/synchronization` 路由及 workspace 路径。本版新增独立的同步空间目录配置与直接浏览按钮，保留原上传／分享下载入口，避免替换 Android 已正常使用的流程。

同步空间目录按群组保存，接受严格校验的官方目录网址或 workspace 完整路径；不猜目录、不迁移文件、不改旧配置。系统分享改用如实的导出名称。修复 Windows 保存群组分享链接时的移动端限制，并更新公共设置及 Windows 本地目录字段名称。

验证：29 项安全回归、7 项苹果兼容模拟通过；Android／iOS 界面检查及三平台导航保存／重载检查通过。原 Android 分享、文件选择、扫描接收代码与 5.2.10 一致。

限制：GitHub TEST 测试版，尚未真机验收；未证明百度网页上传、原 ZIP 下载、App 唤起或 ACK 自动回传已通。不把目录入口修正视为百度下载服务错误的解决方案。


---

# Changelog

## 5.2.10 — Shared console and adaptive lists TEST (2026-11-13)

- Move group share link, extraction code and optional cloud upload folder to common settings on every platform. Clearly show an unset optional path.
- Label Windows settings and mobile settings explicitly; retain platform-specific functions.
- Open Baidu upload navigation directly from every upload button, without an intermediate plugin modal. Keep download share-page navigation separate.
- Place latest own pending ZIP results inline; keep independent ACK results and sharing only in ACK advanced management.
- Hide empty result/list containers, fit small lists to content and scroll only when overflowing their height limit. Retain expandable labels and readable ACK diagnostics.
- Preserve device/group identities, ACK history, explicit formal import, conflict protection, 30-day quarantine and refusal to overwrite restored files. Permanent deletion stays off; cloud/sync folders remain protected.

Automated checks pass; 5.2.10 real-device validation and the pending iPad ACK return to Windows remain to be completed.

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
