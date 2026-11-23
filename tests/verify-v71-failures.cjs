const assert=require('node:assert/strict'),fs=require('fs');
const {host,publish,receive,Windows,Mobile,IOS,A,B,group}=require('./test-flow.cjs');
const IN='VaultRelay-Transfer/inbox/';
const find=(m,t,text)=>m.contentEl.querySelectorAll(t).find(x=>x.textContent===text);
(async()=>{
 for(const Type of [Windows,Mobile,IOS]){
  const h=await host(Type,B,'Saving');await h.write('Rule.md','body');const m=Type.__testing.v71.settings.open(h.p),check=m.contentEl.querySelectorAll('input').find(x=>x.type==='checkbox');
  const persist=h.p.persistTransport;h.p.persistTransport=async()=>{throw Error('磁盘写入故障');};check.checked=true;await check.handlers.change();await assert.rejects(m._v71SaveTask,/磁盘写入故障/);await Promise.resolve();
  assert(m.contentEl.textContent.includes('保存失败'));assert(!h.saved().v70PrivateNotes?.[JSON.stringify([group,B])]?.notes?.length);assert(check.checked);
  h.p.persistTransport=persist;await find(m,'button','重试保存').click();assert(h.saved().v70PrivateNotes[JSON.stringify([group,B])].notes.includes('Rule.md'));
  const before=h.p.engine.state.deviceId;await h.write(IN+'old.txt','old');await h.p.v71UnbindGroup();h.p=await h.restart();await h.p.joinGroup('vg-'+'d'.repeat(24));assert.equal(h.p.engine.state.deviceId,before);assert(!await h.adapter.exists(IN+'old.txt'));
  await h.p.v71UnbindGroup();h.p=await h.restart();await h.p.joinGroup(group);assert.equal(h.p.engine.state.deviceId,before);assert.equal(await h.adapter.read(IN+'old.txt'),'old');assert(h.p.data.v70PrivateNotes[JSON.stringify([group,B])].notes.includes('Rule.md'));
 }
 const a=await host(Windows,A,'ArchiveSender'),b=await host(IOS,B,'ArchiveFailure');await a.write('Archive.md','body');const packet=await publish(a);await receive(b,packet,false);
 const row=(await b.p.v604PrepareInbox()).find(x=>x.sha256===packet.rec.sha256),persist=b.p.persistTransport;b.p.persistTransport=async()=>{throw Error('归档保存故障');};await assert.rejects(b.p.v71ManageInbox(row,true),/归档保存故障/);b.p.persistTransport=persist;
 assert(await b.adapter.exists(IN+packet.rec.name));assert(!row.transfer.v618InboxDismissedAt);assert((await b.p.engine.latestPlan()).v605Review);assert(!await b.adapter.exists('Archive.md'));
 // Changing a privacy rule must invalidate an already open ordinary review.
 const preview=await b.p.engine.latestPlan();b.p.data.v70PrivateNotes={[JSON.stringify([group,B])]:{notes:['Archive.md'],devices:{'Archive.md':{out:[],in:[]}},attachments:[]}};
 await assert.rejects(b.p.engine.safeApply(preview,{selectedReviewPaths:['Archive.md']}),/变化|不属于/);assert(!await b.adapter.exists('Archive.md'));
 const exported=await b.p.v5218ExportSyncRecords(),raw=new TextDecoder().decode(exported.content);assert(!/ACK|Acks|ackId|"ack"/.test(raw));const parsed=await IOS.__testing.v5218SyncRecords.checked(raw,group,IOS.__testing.tools.sha256);assert.equal(parsed.deviceId,B);
 const snapshot=await b.p.v5218SyncSnapshot();assert.equal(IOS.__testing.v5218SyncRecords.parse(JSON.stringify(snapshot),group).deviceId,B);
 b.p.data.history.push({time:'old',kind:'ACK 核对',message:'ACK-R 保留'});const log=await b.p.exportOperationLog(b.p.data.history);assert(!/ACK/.test(new TextDecoder().decode(log.content)));assert(b.p.data.history.some(x=>/ACK/.test(x.kind)));
 // A download-only receipt cannot qualify the native outgoing quarantine action.
 const r=a.p.data.bundleRecords.at(-1);r.v70Receipts={[B]:{state:'verified',updatedAt:new Date().toISOString()}};
 await assert.rejects(a.p.v5218Recycle?.(r.id,'send-zip')||a.p.v5218RecycleFile(r.id,'send-zip'),/配对|凭据|回执/);
 console.log('PASS save failure/retry, three-platform persisted group switching, archive rollback, stale review rejection, receipt snapshot compatibility, display-only log migration and cleanup guard');
})().catch(e=>{console.error(e);process.exitCode=1;});
