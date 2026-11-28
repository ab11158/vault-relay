# 8.7

- 修正 Android 等窄屏上的审核列表。每个相对路径只显示一次文件名，详情和同路径其他待审核版本在下方缩进折叠，保留各版本原有的处理选项。

# 8.6

- 停用独立 ACK 文件及含旧 ACK 的增量 ZIP。扫描和外部导入入口接收增量 ZIP，Windows 补发会跳过旧 ACK 包。
- 设备、群组、百度网盘目录和接收状态统一通过 ZIP 内的 `sync-inventory.json` 传输。接收状态随下一次生成的增量 ZIP 回传，受限包的接收状态保持加密。

# 8.5

- 新生成的增量 ZIP 携带发送端已保存的圈②上传目录。接收端核验后只补填当前群组空白的上传设置。
- 随包补填的圈②上传目录与圈③下载目录分别使用。旧版 ZIP 可以照常接收。

# 8.4

- 修复未入组时手动选择首包仍提示先设置群组的问题。选择经过验证的普通增量 ZIP 后，可以直接确认加入并继续审核。
- 首包带入发送设备资料和包内的圈③目录，接收端保留自己的设备 ID。

# 8.3

- 扫描、审核接收包、下载文件、已导入文件和增量包管理列表增加或统一勾选、全选、反选、排序、Shift 连选及单文件详情折叠。
- 审核页选包后由用户点「刷新」更新内容，并阻止按旧选择确认导入。

# 8.2

- 点击审核页或手动查找页的「全盘扫描」时，先显示独立的进度窗口。扫描结束后关闭该窗口，并在原页显示结果。

# 8.1

- 圈④、圈⑤、控制台「刷新」和「手动查找／选择 ZIP」统一使用轻量与全盘扫描。群组只在接收阶段校验。
- Android 轻量扫描在两种群组状态下都检查 `Download/DLManager` 与本机记住的目录。主动全盘扫描继续查找深层的百度下载目录，排除 `VaultRelay-Transfer/outgoing`。
- 取消主动扫描按目录深度、条目数或总时长提前停止的限制。Android「查看下载的文件」也取消这类查找上限。
- 补充 iPhone／iPad 的 Safari 下载位置、百度网盘短路径，以及通过微信传首包的使用说明。

# 8.0

- 恢复 7.15 的同步基线，全部功能免费。提供自愿赞助入口。
- 未加入群组时可以扫描和查看下载 ZIP，加入对应群组后可以审核导入。
- Android 下载列表会进入百度网盘的 `VaultRelay-Transfer` 群组目录，继续排除 `outgoing`。
- 设备管理增加解绑和删除。隐藏控制台中重复的手动传输，保留本机草稿与扫描状态入口。
- 更新插件内说明和使用手册。

# 7.15

- ④与控制台右上「刷新」共用轻量扫描和审核流程。手动查找 ZIP 才打开扫描结果页。
- 扫描结果页可按上次范围刷新。审核页和扫描结果页均可从系统添加外部 ZIP 或回执。
- 「备份导入」在笔记同目录保留原稿副本。该副本仅保存在本机，后续增量包会排除它。

# 7.14

- Android 全盘扫描可以从下载根目录查找 `VaultRelay-Transfer` 下的实际群组下载目录。有效下载目录可供后续轻量扫描使用。
- 排除所有知识库的 `VaultRelay-Transfer/outgoing`，手动选中其中的 ZIP 也不会登记该来源目录。归档和隔离包可见，保留原处。

# 7.13

- 普通下载改为从控制台主动扫描；轻量扫描与可访问范围的全盘扫描均显示进度。
- 校验收包后更新公共设备资料、群组资料和圈③下载目录。首次配置使用普通增量包。
- 增加冲突的左右对照、导入、备份导入和取消导入。备份只留本机。
- 插件小黑提示在移动端支持双向滑动、桌面提供关闭按钮。重写使用说明和问答。

# 7.12

重新启用插件时，核对本机仍存在的隐私笔记；已删除笔记的旧规则会自动清理。普通增量审核不再把缺失正文的旧版本当作当前正文。保留历史、操作日志、附件保护及已确认的处理记录。详见 [7.12 安装与验证](RELEASE-7.12.md)。

# 7.11

扩大窄屏上传预览列表，保留弹窗内容滚动。Windows 显式入口显示正式审核页和可导入数，避免与后台审核并行时吞掉手动请求。含 Android 手动查找、审核进度与 inbox 列表修复。删除隐私笔记时清理本机规则，保留历史与尚存私密附件的保护；未处理的原 ZIP 可按当前本机规则重新审核。详见 [7.11 测试说明](RELEASE-7.11.md)。

# 7.10

Android 下载后静默归集，控制台「刷新」直接打开审核，手动查找停在扫描结果。下载列表的外部入口只接收 ZIP 和回执。详见 [7.10 安装与验证](RELEASE-7.10.md)。

# 7.9

修复移动端下载返回后的审核误判及定时扫描接续。详见 [7.9 更新说明](RELEASE-7.9.md)。

# 7.8 — 2026-11-24

修复上传勾选框缩成细线，统一所有弹窗直接拖动调整宽高并在本机记忆，顶部不增加尺寸控件。详见 [7.8 更新说明](RELEASE-7.8.md)。

# 7.7 — 2026-11-24

调整导入后的文件索引更新和手机上传预览布局。索引异常时保留接收包。详见 [7.7 更新说明](RELEASE-7.7.md)。

# 7.6

旧增量包可参与自动接收，单个包和百度批量 ZIP 一起审核，同一包的多份副本只列一次。批量外层 ZIP 在安全归集后按权限清理，归集异常会在审核窗口显示。自动获取的设备简称会随已核验的新包更新，手填简称优先。详见 [7.6 安装与验证](RELEASE-7.6.md)。

# 7.5

手机和平板的系统文件选择器可直接接收百度网盘批量 ZIP。Android 扫描有权读取的下载目录时也能发现批量包。刚建立或加入群组后即可接收增量包，群组不匹配与协议版本问题分别提示。详见 [7.5 安装与验证](RELEASE-7.5.md)。

# 7.4.1

Windows 从下载目录自动查找百度网盘批量 ZIP，手动选取也可直接提交整个批量 ZIP。插件提取并校验内层增量包，将同批待审核原件在同一个窗口预选。外部下载目录的外层 ZIP 保留。详见 [7.4.1 验证步骤](RELEASE-7.4.1.md)。

# 7.4

Dbox 支持百度网盘批量下载 ZIP。插件先判断文件格式，验证内层原始增量包，确认写入 Dbox 后再清理外层，并在同一窗口审核本批增量包。百度网盘上传及下载设置增加短路径填写示例。详见 [7.4 真机测试](RELEASE-7.4.md)。

# 7.3

设备 ID 包含公钥，增量 ZIP 签名校验后自动发现设备，首次由用户确认信任。隐私规则按设备简称勾选，支持排序和 Shift 连选。一般设置提供笔记双指放缩，控制台按钮与布局更紧凑。详见 [7.3 真机测试](RELEASE-7.3.md)。

# 7.2 — 2026-11-23

三类笔记可一起打包，受限笔记按篇分开加密。上传预览显示分类勾选数量和缺少名片的原因。调整公共设置、群组操作和下载设置布局。详见 [7.2 更新说明](RELEASE-7.2.md)。

# 7.1 — 2026-11-23

设备管理、隐私自动保存、统一受限传输、多包审核、历史归档与当前授权恢复、群组解绑和布局改进。详见 [7.1 更新说明](RELEASE-7.1.md) 与 [测试状态](TEST-STATUS.md)。以下为原有版本记录，保留其当时的术语。

# Vault Relay 5.2.19

修复移动端已确认导入的增量包因清理标记没有设置而残留的问题。升级后会重新核验持久确认、正式笔记字节、版本 ACK 与包内反馈；不重新导入笔记、不制造成功 ACK，校验不全就保留原件。

收到的普通内容 ACK 经登记并可靠生成 ACK-R 后清理原件；ACK-R 登记后只用于配对，不生成下一层回执。outgoing 中的 ACK-R 在所属内容 ZIP 写入并逐字节核验通过后自动清理独立文件。聚合内容 ACK 保存在插件账本中，随下一次内容 ZIP 一并传输，不另生成独立 outgoing 文件。incoming 内容按正式确认和逐项完成状态清理，未完成、冲突或失败的内容继续保留。

“增量包及ack管理”分成三个独立滚动区域，显示本机发送增量包与收到的 ACK、本机 ACK 与 ACK-R、未配对与终止项。

---

# Vault Relay 5.2.19

修复移动端已确认导入的增量包因清理标记没有设置而残留的问题。升级后会重新核验持久确认、正式笔记字节、版本 ACK 与包内反馈；不重新导入笔记、不制造成功 ACK，校验不全就保留原件。

收到的普通内容 ACK 经登记并可靠生成 ACK-R 后清理原件；ACK-R 登记后只用于配对，不生成下一层回执。outgoing 中的 ACK-R 在所属内容 ZIP 写入并逐字节核验通过后自动清理独立文件。聚合内容 ACK 保存在插件账本中，随下一次内容 ZIP 一并传输，不另生成独立 outgoing 文件。incoming 内容按正式确认和逐项完成状态清理，未完成、冲突或失败的内容继续保留。

“增量包及ack管理”分成三个独立滚动区域，显示本机发送增量包与收到的 ACK、本机 ACK 与 ACK-R、未配对与终止项。

---

# Vault Relay 5.2.19

修复移动端已确认导入的增量包因清理标记没有设置而残留的问题。升级后会重新核验持久确认、正式笔记字节、版本 ACK 与包内反馈；不重新导入笔记、不制造成功 ACK，校验不全就保留原件。

收到的普通内容 ACK 经登记并可靠生成 ACK-R 后清理原件；ACK-R 登记后只用于配对，不生成下一层回执。outgoing 中的 ACK-R 在所属内容 ZIP 写入并逐字节核验通过后自动清理独立文件。聚合内容 ACK 保存在插件账本中，随下一次内容 ZIP 一并传输，不另生成独立 outgoing 文件。incoming 内容按正式确认和逐项完成状态清理，未完成、冲突或失败的内容继续保留。

“增量包及ack管理”分成三个独立滚动区域，显示本机发送增量包与收到的 ACK、本机 ACK 与 ACK-R、未配对与终止项。

---

# Vault Relay 5.2.18 TEST

每次一个内容增量 ZIP，自动合入待回传 ACK 与 ACK-R；无新内容时暂存反馈，不再单独传输 ACK。按下载 ZIP 汇总内容反馈；包内普通 ACK 另生成一次 R 回执，R 不再产生回执。参与终端需升级到本版才能完成新反馈闭环。

知识库管理新增“增量包管理”和“知识库多端同步记录”。发送包任意一条有效成功内容反馈即可配对，但不代表整包已导入；无配对发送包不能清理。同步记录支持多终端只读比对。Windows 支持核验后回收、恢复与明确确认永久删除，发送包保留30天；移动端管理暂为只读。本机生成 ACK 的独立原文件清理暂未启用，待回传反馈保留。

重复下载依据完整 SHA 归并并记录来源；下载入口显示本机上次成功下载时间，供对照网盘实际上传时间。Android 完整共享存储扫描、智能排序、停止后继续检查已找到文件、勾选审核和固定结果窗口；Windows 优先目录支持及时重查。incoming 内容只有完整确认导入、目标核验和反馈持久保存后才清理，未完成包保留。

系统分享与打开目录已更新宿主调用及路径备用方式，尚待真机验收。本版完成的自动回归见 TEST-STATUS.md；三端真实授权、网盘闭环及平台行为不以模拟结果替代。保留本机配置与身份，00Obsdian 实际目录迁移留待正式版。5.2.17及更旧发布保持不变。

---

# Vault Relay 5.2.17 TEST

本机生成的 ZIP／待回传 ACK 统一放到 `VaultRelay-Transfer/outgoing/`；下载的 ZIP／MD／收到的 ACK 归集到 `incoming/`。下载原件先复制校验并保存记录，再尝试删除原下载源；权限不足或移除失败会保留并提示，下载列表可打开文件目录或复制路径人工处理。

沿用现有审核确认：正文和附件全部完成写入、SHA及版本核对、结果和所需 ACK 持久保存后，才清理 incoming 中对应的完整正文包／MD。未完成或无法证明整包完成时保留原件；收到的 ACK 继续保留。正式笔记、附件、百度同步目录和云端不删除，本机发送包仍走原有30天隔离资格流程。

③直接打开下载页，取消重复提示；暂时隐藏手机高级下载目录设置；安卓后台扫描按有限预算续查未完成目录，避免反复只查同一批目录。升级迁移已记录的旧 temporary 原件与相关路径引用，保留群组、设备身份和账本；未归属的旧文件保留。

自动验证范围见 TEST-STATUS.md。系统文件授权与打开目录依赖平台能力；本版三端真机及云端闭环待发布后验证，模拟宿主结果不作为真机通过。含未完成冲突、删除版本或独立 info 的包会保守保留。

---

# Vault Relay 5.2.16 TEST

安卓、iOS / iPadOS 与 Windows 的手动传输统一为三步：①生成②上传、③打开百度网盘同步空间、④审核与确认导入。备用手动选文件去掉③编号并改为灰色可点击按钮，iOS 说明首次系统文件授权仍可能必需。

手机备用接收设置移入“找不到下载文件？”折叠入口；移除旧分享链接流程说明。上传继续使用 /disk/main，下载使用 /disk/synchronization，浏览器显示模式由浏览器控制。

安卓手动搜索使用进度弹窗，显示已查、不可读、待查、候选与已复制数量，并可停止本次扫描；关闭弹窗不会停止。后台搜索不自动弹窗，iOS 不显示共享存储全范围扫描。停止后保留已安全复制原件，当前读写可能完成后才停；本次不继续接收或自动打开审核，既有接收和导入结果不回滚。

升级只替换 main.js、manifest.json、styles.css，保留 data.json、GroupID、独立 DeviceID、历史、ACK 与原目录开关。旧版本保留。验证范围见 TEST-STATUS.md；隔离宿主与模拟目录测试不等于真机授权、云端收发或新版三端验收。

---

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
