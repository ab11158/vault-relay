'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { Windows, Mobile, IOS, A, B, group, host, publish } = require('./test-flow.cjs');
const manifest = require('../manifest.json');
const versions = require('../versions.json');

const previousId = 'vault-relay-v4';
const privatePath = 'Restricted.md';
const oldSettings = `.obsidian/plugins/${previousId}/data.json`;
const newSettings = `.obsidian/plugins/${manifest.id}/data.json`;
const privateBody = 'Private text sent before the plugin ID changed';

async function verifyMigration(Platform, label) {
  const receiver = await host(Platform, B, label);
  const sender = await host(Windows, A, 'Windows sender');
  receiver.p.manifest.id = previousId;
  sender.p.manifest.id = previousId;
  const receiverApi = Platform.__testing.v70.sealed;
  const senderApi = Windows.__testing.v70.sealed;
  const [senderKeys, receiverKeys] = await Promise.all([
    senderApi.ownKeys(sender.p), receiverApi.ownKeys(receiver.p),
  ]);
  await senderApi.trust(sender.p, receiverKeys.card, await receiverApi.fingerprint(receiverKeys.card));
  await receiverApi.trust(receiver.p, senderKeys.card, await senderApi.fingerprint(senderKeys.card));
  await receiver.p.saveCloudDirectoryTarget('/Upload', 'main');
  await receiver.p.saveDownloadDirectoryTarget('/Download');
  await receiver.write('Ordinary.md', 'Published before migration');
  const previousPackage = await publish(receiver);
  await receiver.write(privatePath, 'Local restricted note');
  await sender.write(privatePath, privateBody);
  receiver.p.data.v70PrivateNotes = {
    [JSON.stringify([group, B])]: { notes: [privatePath], devices: { [privatePath]: { in: [A], out: [] } } },
  };
  sender.p.data.v70PrivateNotes = {
    [JSON.stringify([group, A])]: { notes: [privatePath], devices: { [privatePath]: { in: [], out: [B] } } },
  };
  await receiver.p.persistTransport();
  const sealed = await senderApi.make(sender.p, [privatePath]);
  const outbound = sender.p.data.bundleRecords.at(-1);
  const bytes = await sender.adapter.readBinary(sealed.path);

  const before = receiver.saved();
  await receiver.write(oldSettings, JSON.stringify(before));
  await receiver.adapter.mkdir(`.obsidian/plugins/${manifest.id}`);
  await fs.copyFile(receiver.abs(oldSettings), receiver.abs(newSettings));
  const restarted = await receiver.restart(plugin => {
    assert.equal(plugin.manifest.id, 'vault-relay-mix');
    const settingsPath = receiver.abs(`.obsidian/plugins/${plugin.manifest.id}/data.json`);
    plugin.loadData = async () => JSON.parse(await fs.readFile(settingsPath, 'utf8'));
    plugin.saveData = data => fs.writeFile(settingsPath, JSON.stringify(data));
  });

  for (const field of ['groupId', 'deviceId', 'cloudDirectoryTarget', 'downloadDirectoryTarget']) {
    assert.deepEqual(restarted.data[field], before[field], `${label} ${field}`);
  }
  const scope = JSON.stringify([group, B]);
  assert.deepEqual(restarted.data.v70PrivateNotes[scope].devices[privatePath].in, [A]);
  const preservedKeys = await receiverApi.ownKeys(restarted);
  assert.deepEqual(preservedKeys.card, receiverKeys.card);
  assert.equal(preservedKeys.wrapPrivate, receiverKeys.wrapPrivate);
  assert.equal(preservedKeys.signPrivate, receiverKeys.signPrivate);
  assert(restarted.data.bundleRecords.some(record => record.id === previousPackage.rec.id));
  assert(await receiver.adapter.exists(previousPackage.rec.stored.path));
  assert.equal(await receiver.adapter.read(privatePath), 'Local restricted note');
  const verified = await restarted.v601ValidateReceivedPackage(outbound.name, bytes);
  assert.equal(verified.report.sealed.relevant, true);
  assert.equal(verified.report.sealed.items[0].files[0].path, privatePath);
  assert.equal(await fs.readFile(receiver.abs(oldSettings), 'utf8'), JSON.stringify(before));
  console.log(`PASS ${label}: migrated settings, keys, history and pre-migration encrypted ZIP`);
}

async function main() {
  assert.equal(manifest.id, 'vault-relay-mix');
  assert.match(manifest.id, /^[a-z]+(?:-[a-z]+)*$/);
  assert(!manifest.id.includes('obsidian'));
  assert(!manifest.id.endsWith('plugin'));
  assert.equal(manifest.name, 'Vault Relay Mix');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(versions[manifest.version], manifest.minAppVersion);
  assert.equal(Object.values(manifest.fundingUrl).includes('https://afdian.com/a/ab11158'), true);
  await verifyMigration(Windows, 'Windows');
  await verifyMigration(Mobile, 'Android');
  await verifyMigration(IOS, 'iPad');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
