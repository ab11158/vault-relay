'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { Windows, Mobile, IOS, A, B, host, publish, receive } = require('./test-flow.cjs');

const config = 'LocalSettings';
const protectedPath = `${config}/plugins/fixture/config-data.json`;
const original = 'local settings';
const ordinaryNote = 'Documents/Regular.md';
const similarNote = `${config}-notes/Regular.md`;
const configError = /Obsidian 配置目录受保护/;

async function ordinaryImport(receiver, Type, entries) {
  const { importer, zip } = Type.__testing;
  const archive = new zip();
  for (const [name, contents] of Object.entries(entries)) archive.file(name, contents);
  const raw = await archive.generateAsync({ type: 'arraybuffer' });
  const file = { name: 'notes.zip', size: raw.byteLength, arrayBuffer: async () => raw };
  const context = { plugin: receiver.p, app: receiver.p.app, desktop: Type === Windows };
  return { report: await importer.inspect(file, context), apply: report => importer.apply(report, context) };
}

async function verifyPlatform(Type, label) {
  const receiver = await host(Type, B, label);
  const vault = receiver.p.app.vault;
  const writer = Type.__testing.v761.vault;
  const bytes = new Uint8Array([1, 2, 3]);
  vault.configDir = config;
  await receiver.write(protectedPath, original);
  await receiver.write('.obsidian/plugins/fixture/config-data.json', original);

  for (const path of [protectedPath, '.obsidian/plugins/fixture/config-data.json']) {
    await assert.rejects(writer.modify(vault, vault.getAbstractFileByPath(path), bytes), configError);
    assert.equal(await receiver.adapter.read(path), original);
  }
  for (const dir of [config.toUpperCase(), `${config}. `, '.obsidian']) {
    await assert.rejects(writer.create(vault, `${dir}/plugins/fixture/New.md`, bytes), configError);
  }
  const archive = await ordinaryImport(receiver, Type, {
    [`Wrapper/${config}/plugins/fixture/New.md`]: 'excluded',
    [`Wrapper/${similarNote}`]: 'allowed'
  });
  assert.equal(archive.report.newItems.length, 1);
  assert.equal(archive.report.newItems[0].path, similarNote);
  assert.equal((await archive.apply(archive.report)).added, 1);
  assert.equal(await receiver.adapter.read(similarNote), 'allowed');
  assert.equal(await receiver.adapter.exists(`${config}/plugins/fixture/New.md`), false);

  vault.configDir = 'OtherSettings';
  const stale = await ordinaryImport(receiver, Type, { [`${config}/New.md`]: 'stale', [ordinaryNote]: 'normal' });
  assert(stale.report.newItems.some(item => item.path === `${config}/New.md`));
  vault.configDir = config;
  await assert.rejects(stale.apply(stale.report), configError);
  assert.equal(await receiver.adapter.exists(`${config}/New.md`), false);

  const sender = await host(Windows, A, `${label} sender`);
  const protectedNote = `${config}/Local.md`;
  await sender.write(protectedNote, 'a regular file on the sender');
  assert((await sender.p.engine.previewUpload()).ready.some(item => item.path === protectedNote));
  await sender.write(ordinaryNote, 'normal note');
  const incoming = await publish(sender);
  await assert.rejects(receiver.p.storeDownloadedZip({
    name: incoming.rec.name, size: incoming.bytes.length, arrayBuffer: async () => incoming.bytes
  }), configError);
  assert.equal(await receiver.adapter.read(protectedPath), original);
  assert.equal(await receiver.adapter.exists(protectedNote), false);
  assert.equal(await receiver.adapter.exists(ordinaryNote), false);

  vault.configDir = 'OtherSettings';
  await receive(receiver, incoming, false);
  const inbox = 'VaultRelay-Transfer/inbox/' + incoming.rec.name;
  const plan = await receiver.p.engine.latestPlan();
  vault.configDir = config;
  const apply = Type === Windows ? 'applyPlan' : 'safeApply';
  await assert.rejects(receiver.p.engine[apply](plan), configError);
  assert.equal(await receiver.adapter.exists(inbox), true);
  assert.equal(await receiver.adapter.exists(protectedNote), false);
  assert.equal(await receiver.adapter.exists(ordinaryNote), false);
  vault.configDir = 'OtherSettings';
  const rows = await receiver.p.v604PrepareInbox();
  const row = rows.find(item => item.sha256 === incoming.rec.sha256);
  assert(row);
  const archived = await receiver.p.v71ManageInbox(row, true);
  const historical = await Type.__testing.v611.readHistory(receiver.p, archived.path);
  const version = historical.items.find(item => item.path === protectedNote);
  assert(version);
  vault.configDir = config;
  await assert.rejects(Type.__testing.v611.restore(receiver.p, historical, [version.versionId]), configError);
  assert.equal(await receiver.adapter.exists(archived.path), true);
  assert.equal(await receiver.adapter.exists(protectedNote), false);
  const outgoingNote = 'Documents/Outgoing.md';
  await receiver.write(outgoingNote, 'one outgoing note');
  const upload = await receiver.p.engine.previewUpload();
  assert(upload.ready.some(item => item.path === outgoingNote));
  assert(!upload.ready.some(item => item.path.startsWith(`${config}/`)));
  const cleanSender = await host(Windows, A, `${label} clean sender`);
  const cleanNote = 'Documents/Incoming.md';
  await cleanSender.write(cleanNote, 'confirmed normal import');
  await receive(receiver, await publish(cleanSender));
  assert.equal(await receiver.adapter.read(cleanNote), 'confirmed normal import');
  console.log(`PASS ${label} configuration destinations, stale preview, upload exclusion and normal imports`);
}

async function verifyCopyPackage(Type, label) {
  const receiver = await host(Type, B, label);
  const vault = receiver.p.app.vault;
  const { currentTarget, copyPlan, applyCopy, encodeCopy, decodeCopy } = Type.__testing.v5215;
  const { sha256 } = Type.__testing.tools;
  const target = currentTarget(receiver.p);
  const bytes = new TextEncoder().encode('copied note');
  const entry = { path: 'Copy.md', bytes, sha256: await sha256(bytes) };
  const items = await decodeCopy(await encodeCopy([entry]));
  vault.configDir = config;

  await assert.rejects(copyPlan(items, target, config), configError);
  await assert.rejects(copyPlan(items, target, '.obsidian'), /系统目录/);
  assert.equal(await receiver.adapter.exists(config), false);
  vault.configDir = 'OtherSettings';
  const stale = await copyPlan(items, target, config);
  vault.configDir = config;
  await assert.rejects(applyCopy(stale, target), configError);
  assert.equal(await receiver.adapter.exists(`${config}/Copy.md`), false);

  if (Type === Windows) {
    await receiver.adapter.mkdir(config);
    await fs.symlink(receiver.abs(config), receiver.abs('CopyAlias'), 'junction');
    await assert.rejects(copyPlan(items, target, 'CopyAlias'), /链接或重定向/);
    assert.equal(await receiver.adapter.exists(`${config}/Copy.md`), false);
  }

  const folder = 'Documents/Imported copies';
  const path = `${folder}/Copy.md`;
  const plan = await copyPlan(items, target, folder);
  assert.equal(await receiver.adapter.exists(path), false);
  assert.deepEqual((await applyCopy(plan, target)).written, [path]);
  assert.equal(await receiver.adapter.read(path), 'copied note');
  assert.deepEqual((await applyCopy(await copyPlan(items, target, folder), target)).skipped, [path]);
  await receiver.write(path, 'local note');
  await assert.rejects(applyCopy(await copyPlan(items, target, folder), target), /同名不同内容/);
  assert.equal(await receiver.adapter.read(path), 'local note');
  console.log(`PASS ${label} copy package preview, protected destinations, stale confirmation and conflict handling`);
}

async function verifyWindowsCopyEntry() {
  const sender = await host(Windows, A, 'Copy source');
  const receiver = await host(Windows, B, 'Copy destination');
  const SourcePanel = Windows.__testing.panel;
  const panel = new SourcePanel(sender.p.app, sender.p);
  const Element = panel.modalEl.constructor;
  const findButton = (modal, text) => modal.contentEl.querySelectorAll('button').find(el => el.textContent === text);
  const waitFor = async (ready, message) => {
    const end = Date.now() + 3000;
    while (Date.now() < end) {
      const result = await ready();
      if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail(message);
  };
  global.document = { createElement: tag => Object.assign(new Element(tag), {
    dataset: {}, value: '', replaceChildren() { this.empty(); }
  }) };
  try {
    const path = 'Source note.txt';
    const text = 'copy from Windows';
    await sender.write(path, text);
    await panel.v5215CopyTo([{ source: 'vault', path, name: path }]);
    const source = sender.p.app.openedModals.at(-1);
    assert.match(source.contentEl.textContent, /在 Obsidian 打开目标知识库/);
    assert.equal(source.contentEl.querySelectorAll('input').length, 0);
    findButton(source, '生成跨知识库复制包').click();
    const [zip] = await waitFor(async () => {
      const files = (await sender.adapter.list('VaultRelay-Transfer/exports')).files;
      return files.length ? files : null;
    }, 'Copy package was not generated');
    assert.equal(await receiver.adapter.exists(path), false);
    const raw = await sender.adapter.readBinary(zip);
    const destination = new SourcePanel(receiver.p.app, receiver.p).v5215ReceiveCopy();
    const input = destination.modalEl.querySelector('input');
    input.files = [{ name: zip.split('/').pop(), size: raw.byteLength, arrayBuffer: async () => raw }];
    input.handlers.change();
    const review = await waitFor(() => destination.closed && receiver.p.app.openedModals.at(-1), 'Copy preview did not open');
    assert.match(review.contentEl.textContent, /Copy destination/);
    const confirm = findButton(review, '确认复制');
    findButton(review, '预览目标文件').click();
    await waitFor(() => !confirm.disabled, 'Copy did not become ready for confirmation');
    assert.equal(await receiver.adapter.exists(path), false);
    confirm.click();
    await waitFor(() => receiver.p.data.v5215ImportHistory?.some(record => record.items.some(item => item.path === path)), 'Copy was not recorded');
    assert.equal(await receiver.adapter.read(path), text);
    assert.equal(await sender.adapter.read(path), text);
    assert.equal(await sender.adapter.exists(zip), true);
    console.log('PASS Windows copies through an exported package and an explicit confirmation in the opened destination vault');
  } finally {
    delete global.document;
  }
}

async function verifyDesktopAlias() {
  const receiver = await host(Windows, B, 'Windows folder alias');
  await receiver.adapter.mkdir(config);
  receiver.p.app.vault.configDir = config;
  await fs.symlink(receiver.abs(config), receiver.abs('Alias'), 'junction');
  const direct = await ordinaryImport(receiver, Windows, {
    'Alias/New.md': 'excluded after resolving the parent',
    'Documents/Also.md': 'would otherwise be added'
  });
  await assert.rejects(direct.apply(direct.report), configError);
  assert.equal(await receiver.adapter.exists(`${config}/New.md`), false);
  assert.equal(await receiver.adapter.exists('Documents/Also.md'), false);
}

(async () => {
  await verifyPlatform(Windows, 'Windows');
  await verifyPlatform(Mobile, 'Android');
  await verifyPlatform(IOS, 'iPad');
  await verifyCopyPackage(Windows, 'Windows');
  await verifyCopyPackage(Mobile, 'Android');
  await verifyCopyPackage(IOS, 'iPad');
  await verifyWindowsCopyEntry();
  await verifyDesktopAlias();
  console.log('PASS ordinary ZIP through a Windows directory alias to the configuration folder');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
