# Privacy and data access — 5.2.8 TEST

This build does not add a developer account, payment integration, subscription server or analytics service. Notes are not sent to a developer-operated storage service.

The plugin reads local vault content and writes transfer metadata, device/group identities, version and ACK ledgers, backups and operation logs in the vault. Formal note changes require user review and confirmation. When sharing an exported file, a temporary cache copy may be created by an available native host bridge.

Baidu Netdisk transfer is handled through the user's configured local sync folder, browser, app or OS share sheet. Baidu and any OS document provider handle data according to their own terms. Cloud delivery is not inferred from opening a page or sharing a file.

On iOS/iPadOS the user selects external ZIP/ACK files in the system Files picker. The plugin copies verified files to its vault transfer area and preserves external originals. On Android the host may expose user-readable download folders; on desktop a configured sync directory is accessed outside the vault.

If installed using BRAT, BRAT contacts GitHub to retrieve plugin updates. This build does not introduce its own plugin updater. Adding payment or authorization later requires updated disclosures.

This preparation does not publish any real vault data, device configuration, payment credentials or test artifacts.
