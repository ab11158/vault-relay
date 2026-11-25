const assert = require('node:assert/strict');
const fs = require('node:fs');
const {host, publish, Windows, Mobile, IOS, A, B} = require('./test-flow.cjs');

const inbox = 'VaultRelay-Transfer/inbox/';
const note = 'Return review.md';
const reason = {reason:'return', notify:false};
const periodic = {reason:'periodic', notify:false};

async function receiver(runtime) {
  delete global.document;
  const h = await host(runtime, B, 'Return review');
  await new Promise(resolve => setImmediate(resolve));
  await h.p._mobileSourcePromise;
  await h.p._mobileScanPromise;
  const panel = new runtime.__testing.panel(h.p.app, h.p);
  global.document = {visibilityState:'visible', createElement:tag=>Object.assign(new panel.modalEl.constructor(tag),{dataset:{}})};
  h.p.app.workspace.getLeavesOfType = () => [];
  h.p.mobileCapacitorFilesystem = () => ({});
  h.p.getMobileDownloadEntries = async () => [];
  return h;
}

function start(h) {
  h.p.v603BeginDownload();
  h.p.v603DownloadLeft();
}

function setAge(h, name, age) {
  const date = new Date(Date.now() - age);
  fs.utimesSync(h.abs(inbox + name), date, date);
}

async function place(h, packet, age) {
  await h.adapter.writeBinary(inbox + packet.rec.name, packet.bytes);
  setAge(h, packet.rec.name, age);
}

async function assertReview(h) {
  assert(h.p._vrReviewModal?.plan.items.some(item => item.path === note && item.status === 'create'));
  assert(!await h.adapter.exists(note), 'The formal note requires confirmation');
  assert.equal(h.p._v603Download, null);
}

async function seenOnlyByReview(packet) {
  const h = await receiver(Mobile);
  start(h);
  const prepare = h.p.v604PrepareInbox.bind(h.p);
  let first = true;
  h.p.v604PrepareInbox = async () => {
    if (first) {
      first = false;
      await place(h, packet, 0);
      const rows = await prepare();
      assert(rows.some(row => row.state === 'waiting'), 'The package first appears in the review snapshot');
      return rows;
    }
    return prepare();
  };
  const returned = await h.p.scanMobileReception(reason);
  assert.equal(returned.local.errors, 0);
  await assertReview(h);
}

async function periodicContinuation(runtime, packet) {
  const h = await receiver(runtime);
  start(h);
  await place(h, packet, -30_000);
  const bad = 'VR-OtherWin1-202611252200-0123456789abcd.zip';
  await h.adapter.writeBinary(inbox + bad, Buffer.from('An unrelated ZIP with invalid contents'));
  setAge(h, bad, 6000);
  const returned = await h.p.scanMobileReception(reason);
  assert(returned.local.errors > 0 && returned.local.pending > 0);
  assert(h.p._v603Download?.returned, 'An unrelated failure must not terminate a known waiting file');
  assert(!h.p._vrReviewModal);
  setAge(h, packet.rec.name, 6000);
  const tick = await h.p.scanMobileReception(periodic);
  assert.equal(tick.local.zip, 1);
  await assertReview(h);
  const review = h.p._vrReviewModal;
  review.close();
  await h.p.scanMobileReception(periodic);
  await h.p.scanMobileReception(reason);
  assert.equal(h.p._vrReviewModal, null, 'A completed request must not reopen on the next scan');
  assert(await h.adapter.exists(inbox + bad));
}

async function initiallyEmpty(packet) {
  const h = await receiver(Mobile);
  start(h);
  const prepare = h.p.v604PrepareInbox.bind(h.p);
  let first = true;
  h.p.v604PrepareInbox = async () => {
    const rows = await prepare();
    if (first) {
      first = false;
      assert.deepEqual(rows, []);
      await place(h, packet, 6000);
    }
    return rows;
  };
  await h.p.scanMobileReception(reason);
  await assertReview(h);
}

async function ordinaryPollingIsQuiet(packet) {
  const h = await receiver(Mobile);
  await place(h, packet, 6000);
  const tick = await h.p.scanMobileReception(periodic);
  assert.equal(tick.local.zip, 1);
  assert(!h.p._vrReviewModal && !h.p._v603Download);
  const raw = await h.adapter.readBinary(inbox + packet.rec.name);
  const selected = await h.p.importMobileChosenFiles([{name:packet.rec.name, size:raw.byteLength, arrayBuffer:async()=>raw}]);
  await h.p.v614OpenSelectedReview(selected.paths);
  await assertReview(h);
}

async function stoppedOrExpiredIsQuiet(packet) {
  for (const stopped of [true, false]) {
    const h = await receiver(Mobile);
    start(h);
    if (stopped) {
      const prepare = h.p.v604PrepareInbox.bind(h.p);
      h.p.v604PrepareInbox = async () => {
        const progress = h.p.app.openedModals.at(-1);
        const stop = progress.contentEl.querySelectorAll('button').find(button => button.textContent === '停止本次等待');
        assert(stop);
        stop.click();
        return prepare();
      };
      await h.p.scanMobileReception(reason);
      h.p.v604PrepareInbox = prepare;
      assert.equal(h.p._v603Download, null);
    } else {
      h.p._v603Download.returned = true;
      h.p._v603Download.reviewRetryUntil = Date.now()-1;
    }
    await place(h, packet, 6000);
    const tick = await h.p.scanMobileReception(periodic);
    assert.equal(tick.local.zip, 1);
    assert(!h.p._vrReviewModal, 'Cancelled and expired attempts may still receive ZIPs silently');
  }
}

async function emptyAndFailureFinish() {
  for (const failure of [false, true]) {
    const h = await receiver(Mobile);
    start(h);
    if (failure) {
      const bad = 'VR-OtherWin1-202611252200-0123456789abcd.zip';
      await h.adapter.writeBinary(inbox + bad, Buffer.from('An unrelated ZIP with invalid contents'));
      setAge(h, bad, 6000);
    }
    const result = await h.p.scanMobileReception(reason);
    assert.equal(result.local.errors, Number(failure));
    assert.equal(h.p._v603Download, null);
    assert(!h.p._vrReviewModal);
  }
}

(async () => {
  const sender = await host(Windows, A, 'Win1');
  await sender.write(note, 'First version from A');
  const packet = await publish(sender);
  await seenOnlyByReview(packet);
  await initiallyEmpty(packet);
  for (const runtime of [Mobile, IOS]) await periodicContinuation(runtime, packet);
  await ordinaryPollingIsQuiet(packet);
  await stoppedOrExpiredIsQuiet(packet);
  await emptyAndFailureFinish();
  delete global.document;
  console.log('PASS mobile return: waiting snapshot, first empty scan, Android/iOS continuation with old failure, quiet polling, stop/expiry, manual review and terminal results');
})().catch(error => { console.error(error); process.exitCode = 1; });
