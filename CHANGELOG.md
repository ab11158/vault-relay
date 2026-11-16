# Vault Relay 5.2.15 TEST

百度目录入口统一为上传 /disk/main、下载 /disk/synchronization；设置使用短路径，内部补齐同步空间前缀一次。上传区重复打开按钮合并，下载区改为同步空间目录，旧分享字段保留。

第二步增加“查看下载的文件”，三端先显示可勾选文件列表；iOS 外部文件授权后回到列表。第三步增加“手动选择审核与确认文件”，原下载列表入口改为“查看导入的文件”，显示正式写入后的笔记与附件分组。

文件列表支持全选、Shift 连选和“复制到…”；下载列表可明确启动接收与审核。Windows 可指定目标知识库；手机导出带 SHA 清单的复制包，在目标知识库接收、预览和确认。保留源文件，冲突不覆盖。复制包不能当作同步增量上传。

使用说明、内置帮助和 FAQ Q81–Q93 同步更新。扫描权限、iOS 授权、浏览器电脑版开关和手机跨库复制步骤均列明。旧版本保留；升级只替换三个插件文件，保留本机 data.json、身份与账本。

验证范围见 TEST-STATUS.md：隔离逻辑与三端模拟 Obsidian 宿主界面，不冒充新版本真机验收。百度云端清单和自动下载未接入；网页显示模式由浏览器决定。复制失败报告成功部分，不能宣称整批原子回滚。

---

# Vault Relay 5.2.14 TEST

设置区“打开百度网盘共享目录页入口（浏览器）”此前进入同步空间浏览页，可能没有本地上传按钮。现与②上传、手动上传及“查看上传的文件”统一打开同一目录的电脑版上传网页。

- 手机上传采用电脑版网页流程；补齐浏览器切换、重新打开、核对目标目录及选择原 ZIP／ACK 的操作说明。
- 常见问题新增 Q81–Q83：页面过窄／无上传按钮、电脑版模式由浏览器保存、网页到 App 与下载安装页的区别。
- 保留短路径设置及内部同步空间前缀处理。

**注意：**插件不能替外部浏览器强制启用“访问电脑版”；换浏览器、清除网站设置或显示模式恢复时，需在浏览器中重新选择。网页到 App 跳转不作为依赖。

验证：三端导航及实际界面回归、内置说明排版检查、语法与包哈希检查通过。Android 原版现场已确认重新打开后可见 test1 和上传按钮，未执行实际上传；新版尚未安装真机，不扩大为 iPad 或所有浏览器已通过。

BRAT：`ab11158/vault-relay`。升级仅替换 main.js、manifest.json、styles.css，保留 data.json、设备身份、群组与历史。旧版本及发布附件保留。

---

# Vault Relay 5.2.13 TEST

手动下载原件落在同步目录之外时，旧Windows目录检查可能发现不了。本版增加独立的后台本地下载文件发现，并统一三端控制台的设置与操作层级。

- 三步传输：生成与上传、下载、审核与确认导入。①②③④同级高亮；已生成zip/ack与ACK明细使用次级字号、缩进。
- 百度设置分上传目录、分享下载入口和Windows专用自动收发。同步空间统一显示短路径；内部保留完整前缀。旧路径有歧义时明确确认，普通网盘兼容保留。
- Windows在可枚举本地固定／可移动磁盘分批发现原ZIP／ACK，排除系统目录等范围；关闭自动发送仍可发现下载文件。校验、去重和审核复用原核心，正式笔记人工确认。
- 手动上传／下载、ACK管理、知识库比对统一高亮与编号，原业务逻辑保留。
- 诊断及传输原件增加打开、复制。Windows复制原文件；移动端不支持时明确提示并提供原件准备／系统分享入口。
- 记录支持复选框、全选、Shift连续选取及复制所选记录。新版说明已内置。

③的百度云端清单与自动下载没有接入，本版提供明确提示及已保存分享页入口。浏览器打开与下载成功分开判断。苹果仍使用系统“文件”选外部原件，不承诺全盘扫描。

本版作为 GitHub TEST 版本发布；没有更改真实设备设置或安装设备。升级仅替换三个插件文件，保留data.json、GroupID、Device ID、版本／ACK／隔离账本。自动与隔离检查通过，不代表新版三端真实百度运输已验收。


---

# 5.2.12 TEST — 统一百度目录设置

- 公共设置统一为「百度网盘同步空间共享目录」，一个目录编辑区，支持同步空间／普通网盘选择与官方目录 URL 识别。
- 同步空间填写网页可见路径即可；内部补齐 workspace 前缀且不重复。浏览走 synchronization 页面，原 ZIP／ACK 上传走 main 页面并保留完整 workspace 路径。普通网盘继续使用原路径。
- 显示旧配置来源；同时存在两份旧配置时提示差异。明确保存前旧浏览／上传分别沿用原值；保存后统一导航，旧字段保留。群组隔离、危险 URL／越界校验与保存失败回滚受测试保护。
- 保留安卓扫描／分享／接收、苹果文件选择、ZIP／ACK 原件复核导出、群组分享下载和 Windows 专用本地绑定及自动运输设置。移除 ACK 区含混的重复“浏览／上传”目录按钮。

验证：29/29 安全回归、7/7 苹果分支模拟、三平台实际保存／重载／回滚／导航、Android 与 iOS 模式 Edge 界面及截图检查通过；ZIP 严格只有三个插件文件，逐项 SHA 核验。

5.2.12 尚未安装到真机。完整 workspace 路径上传并到达 Windows 的证据来自 5.2.11；不扩大为本版真机全流程通过，也不宣称修复百度 App 分享下载错误、Safari 新下载副本 SHA 或未登记 ACK 自动接收。此前已通过的 ZIP 导入、取消、去重、重开结论沿用。

BRAT：`ab11158/vault-relay`；更新后核对 5.2.12。手动更新只替换 main.js／manifest.json／styles.css，保留 data.json、设备身份和群组。页面打开不等于上传、下载或核心接收完成。


---

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
