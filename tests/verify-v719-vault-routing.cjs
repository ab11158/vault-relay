const assert = require('node:assert/strict');
const {Windows, Mobile, host, publish} = require('./test-flow.cjs');
const {sealed, privacy} = Windows.__testing.v70;

// Each mocked Obsidian window gets its own plugin instance and vault filesystem.
// Both windows address the same device-local database, just as the URI handoff expects.
function deviceDatabase() {
  const stores = new Map();
  const database = {
    createObjectStore(name) { stores.set(name, new Map()); },
    transaction() {
      const tx = {objectStore(name) {
        const data = stores.get(name);
        const request = run => {
          const result = {};
          queueMicrotask(() => { result.result = structuredClone(run()); tx.oncomplete(); });
          return result;
        };
        return {get: key => request(() => data.get(key)),
          getAll: () => request(() => [...data.values()]),
          put: (value, key) => request(() => data.set(key, structuredClone(value)) && key),
          delete: key => request(() => data.delete(key))};
      }};
      return tx;
    }
  };
  return {open() {
    const request = {result: database};
    queueMicrotask(() => {
      if (!stores.size) request.onupgradeneeded();
      request.onsuccess();
    });
    return request;
  }};
}
async function trust(receiver, sender) {
  const {card} = await sealed.readIdentity(sender.p.data.v73Identity.publicId, receiver.p.data.groupId);
  await sealed.trust(receiver.p, card, await sealed.fingerprint(card));
}
async function makePacket(sender, path, body) {
  await sender.write(path, body);
  return publish(sender);
}
const file = packet => ({name: packet.rec.name});
const delay = () => new Promise(resolve => setTimeout(resolve, 500));

(async () => {
  const routes = Windows.__testing.v719;
  const senderA = await host(Windows, null, 'Send A', {});
  const senderB = await host(Windows, null, 'Send B', {});
  const groupA = await senderA.p.createGroup(), groupB = await senderB.p.createGroup();
  await senderA.p.updateSetting('groupName', 'test3');
  await senderB.p.updateSetting('groupName', 'test4');
  global.indexedDB = deviceDatabase();
  const receiverA = await host(Windows, null, 'Receive A', {});
  const receiverB = await host(Mobile, null, 'Receive B', {});
  const fresh = await host(Mobile, null, 'Fresh', {});
  await receiverA.p.joinGroup(groupA);
  await receiverB.p.joinGroup(groupB);
  await trust(receiverA, senderA);
  await trust(receiverB, senderB);
  await senderA.p.updateSetting('groupShortName','Tes3');
  await senderB.p.updateSetting('groupShortName','Tes4');
  const a1 = await makePacket(senderA, 'test3-A.md', 'A1');
  const b1 = await makePacket(senderB, 'test4-A.md', 'B1');
  const a2 = await makePacket(senderA, 'test3-B.md', 'A2');
  await receiverA.write('Local private.md','do not move');
  receiverA.p.data.v70PrivateNotes = {[privacy.key(receiverA.p)]:{notes:['Local private.md'],attachments:[],devices:{},observedNotes:['Local private.md']}};
  const before = JSON.stringify(receiverA.p.data.v70PrivateNotes);
  const batch = Windows.__testing.tools.zipEncode([a1,b1,a2].map(p => ({name:p.rec.name,data:p.bytes})));
  const archive = {name:'BaiduBatch-test.zip'};
  assert.equal(await routes.members(receiverA.p,file(a1),a1.bytes),null);
  assert.equal(await routes.hasForeign(receiverA.p,archive.name,batch,{kind:'native'}),false);
  const corrupt = b1.bytes.slice();corrupt[corrupt.length-30]^=255;
  await assert.rejects(() => routes.members(receiverA.p,file(b1),corrupt));
  const {job} = await routes.collect(receiverA.p,() => routes.capture(receiverA.p,archive,batch));
  assert.deepEqual(job.groups.map(x => [x.id,x.files.length]),[[groupA,2],[groupB,1]]);
  assert.match(job.id,/^[a-f0-9]{32}$/);
  assert.equal(await routes.dispatch(receiverA.p,job.id),true);
  assert(receiverA.p._vrReviewModal);
  assert.equal(receiverA.p._vr719Review.selected.size,2);
  assert(!await receiverA.adapter.exists('test3-A.md'));
  assert(!await receiverA.adapter.exists('test4-A.md'));
  receiverA.p._vrReviewModal.close();
  await delay();
  assert.equal((await routes.next(receiverA.p)).position,0);
  await routes.dispatch(receiverA.p,job.id);
  const engine = receiverA.p.engine;
  const plan = await engine.latestPlan();
  const result = await engine.applyPlan(plan,{allowDeletes:true});
  assert.deepEqual(result.errors,[]);
  await receiverA.p.registerUndoFromNative(result,plan,'Test review confirmed');
  await receiverA.p.v5217CleanupIncoming();
  // The destination receives the same opaque task ID via the Obsidian URI.
  let uri;
  global.window={open:url=>{uri = new URL(url);}};
  receiverA.p._vrReviewModal.close();
  await delay();
  assert(uri);
  assert.equal(uri.searchParams.get('vault'),'Receive B');
  assert.equal(uri.searchParams.size,2);
  assert.equal(uri.searchParams.get('task'),job.id);
  assert.equal((await routes.next(receiverA.p)).position,1);
  const androidRoutes = Mobile.__testing.v719;
  assert.equal(await androidRoutes.dispatch(receiverB.p,job.id,{fromUri:true}),true);
  assert.equal(receiverB.p._vr719Review.selected.size,1);
  assert(!await receiverB.adapter.exists('test4-A.md'));
  assert(!await receiverB.adapter.exists('test3-A.md'));
  assert.equal(await receiverA.adapter.read('test3-A.md'),'A1');
  assert.equal(await receiverA.adapter.read('test3-B.md'),'A2');
  assert.equal(receiverA.p.data.groupId,groupA);
  assert.equal(JSON.stringify(receiverA.p.data.v70PrivateNotes),before);
  assert.equal(await receiverA.adapter.read('Local private.md'),'do not move');
  delete global.window;
  const groupC = await fresh.p.createGroup();
  await fresh.p.v71UnbindGroup();
  // A signed first package can be reviewed with no engine. It cannot grant trust.
  const firstSender = await host(Windows,null,'First sender',{});
  const firstGroup = await firstSender.p.createGroup();
  await firstSender.p.updateSetting('groupName','First group');
  await firstSender.p.updateSetting('groupShortName','Fir1');
  const first = await makePacket(firstSender,'First.md','first');
  // Remove the registered sender window from this case by using an explicitly chosen destination.
  const firstJob = (await androidRoutes.collect(fresh.p,()=>androidRoutes.capture(fresh.p,file(first),first.bytes))).job;
  await androidRoutes.dispatch(fresh.p,firstJob.id,{fromUri:true});
  assert(!fresh.p.data.groupId);
  const choose = fresh.p.app.openedModals.at(-1);
  const join = choose.contentEl.querySelectorAll('button').find(x=>x.textContent==='在当前知识库加入此群组');
  assert(join);
  await join.onclick();
  assert.equal(fresh.p.data.groupId,firstGroup);
  assert.notEqual(fresh.p.data.groupId,groupC);
  assert.equal(fresh.p.data.groupName,'First group');
  assert(!await fresh.adapter.exists('First.md'));
  assert.equal(fresh.p._vr719Review.resolved.size,1);
  assert((await fresh.adapter.list('VaultRelay-Transfer/inbox')).files.every(x=>!x.endsWith('.zip')));
  console.log('PASS signed mixed batch, durable order, early close, destination isolation, first-join settings and trust rejection');
})().catch(error => { console.error(error); process.exitCode=1; });
