# Vault Relay 5.2.15 TEST

Obsidian 的 Windows、Android、iOS / iPadOS 增量 ZIP／ACK 传输插件。正式笔记须人工审核确认。

本版将百度入口统一为同步空间短路径：上传打开 `/disk/main`，下载打开 `/disk/synchronization`，内部补齐一次 `/_pcs_.workspace`。上传使用浏览器电脑版；外部浏览器的显示模式仍需用户自行设置。本流程不用群组分享链接，旧配置字段保留。

三步控制台包含下载候选列表、正式导入文件列表、笔记与附件分组、全选／Shift 和“复制到…”。Windows 可指定目标知识库；手机通过复制包导出，再在目标知识库接收、预览和确认。

安装：BRAT 添加 `ab11158/vault-relay`，或从 [5.2.15 Release](https://github.com/ab11158/vault-relay/releases/tag/5.2.15) 下载插件 ZIP。手动安装只替换 `main.js`、`manifest.json`、`styles.css`，保留原 `data.json` 和身份／账本。旧版发布保留。

- [使用说明](USER-GUIDE.md)：设置、三步传输、iOS 授权、复制到新知识库与 FAQ。
- [注意事项](PRECAUTIONS.md)：电脑版模式、下载目录、扫描限制、复制冲突与失败处理。
- [验证范围](TEST-STATUS.md)：隔离逻辑与三端模拟宿主测试，未冒充新版真机验收。
- [版本变化](CHANGELOG.md)

百度云端清单和自动下载尚未接入；网页打开不等于上传／下载完成。下载后仅在有效原件校验后准备审核，正式写入始终另需确认。
