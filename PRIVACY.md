# Privacy and data access — 5.2.12 TEST

This build does not add a developer account, payment integration, subscription server or analytics service. Notes are not sent to a developer-operated storage service.

The plugin reads local vault content and writes transfer metadata, device/group identities, version and ACK ledgers, backups and operation logs in the vault. Formal note changes require user review and confirmation. When sharing an exported file, a temporary cache copy may be created by an available native host bridge.

Baidu Netdisk transfer is handled through the user's configured local sync folder, browser, app or OS share sheet. Baidu and any OS document provider handle data according to their own terms. Cloud delivery is not inferred from opening a page or sharing a file.

On iOS/iPadOS the user selects external ZIP/ACK files in the system Files picker. The plugin copies verified files to its vault transfer area and preserves external originals. On Android the host may expose user-readable download folders; on desktop a configured sync directory is accessed outside the vault.

If installed using BRAT, BRAT contacts GitHub to retrieve plugin updates. This build does not introduce its own plugin updater. Adding payment or authorization later requires updated disclosures.

This preparation does not publish any real vault data, device configuration, payment credentials or test artifacts.

The optional synchronization-space destination is stored locally per group. Opening it uses the system HTTPS browser interface; no Baidu credentials, API tokens or cloud directory migration are added.

5.2.12 stores an explicitly chosen cloud directory locally per group. Legacy directory fields remain unchanged. URL parsing and workspace-prefix handling run locally; opening a directory uses the system HTTPS browser. No cloud API credentials, automatic migration or device configuration sharing is added.
