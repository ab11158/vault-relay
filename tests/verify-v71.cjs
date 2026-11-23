'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {Windows,Mobile,IOS,A,B,group,host,publish,receive}=require('./test-flow.cjs');
const C='vr-cccccccccccccccc',IN='VaultRelay-Transfer/inbox/';
const file=p=>({name:p.rec.name,size:p.bytes.length,arrayBuffer:async()=>p.bytes});
function policy(h,notes,devices){h.p.data.v70PrivateNotes={[JSON.stringify([h.p.data.groupId,h.p.engine.state.deviceId])]:{notes,devices,attachments:[]}};}
async function pair(x,y){const api=Windows.__testing.v70.sealed;const [a,b]=await Promise.all([api.ownKeys(x.p),api.ownKeys(y.p)]);await api.trust(x.p,b.card,await api.fingerprint(b.card));await api.trust(y.p,a.card,await api.fingerprint(a.card));}
async function packet(h,paths){const q=await h.p.engine.previewUpload(),opts={selectedPaths:paths,expectedFingerprint:q.fingerprint,allowInitial:true};const native=h.p.engine.safeUpload?await h.p.engine.safeUpload(opts):await h.p.engine.safeExport(q,opts);const out=await h.p.finalizeConfirmedUpload(native),rec=h.p.data.bundleRecords.at(-1);assert.equal(rec.stored.path,out.packageResult.path);return {rec,bytes:await h.adapter.readBinary(rec.stored.path)};}
async function normal(h){const q=await h.p.engine.latestPlan();const fn=h.p.engine.applyPlan||h.p.engine.safeApply;return fn.call(h.p.engine,q,{selectedReviewPaths:q.items.filter(i=>['create','safe-update'].includes(i.status)).map(i=>i.path)});}
const find=(modal,tag,text)=>modal.contentEl.querySelectorAll(tag).find(x=>x.textContent===text);
async function unified(){
 const a=await host(Windows,A,'Mixed sender'),b=await host(IOS,B,'Mixed iPad'),c=await host(Mobile,C,'Denied Android');await pair(a,b);
 await a.write('Private.md','private payload');await a.write('Public.md','public payload');await a.write('Never.md','never shared');
 policy(a,['Private.md','Never.md'],{'Private.md':{out:[B],in:[]},'Never.md':{out:[],in:[]}});
 const q=await a.p.engine.previewUpload();assert.deepEqual(q.ready.map(x=>x.path),['Public.md']);assert.equal(q.restricted.length,2);
 const one=await packet(a,['Public.md','Private.md']);const parts=Windows.__testing.tools.zipDecode(one.bytes),m=JSON.parse(new TextDecoder().decode(parts.get('manifest.json')));
 assert(m.privateNotes);assert([...parts.keys()].some(x=>/^private\/[a-f0-9]{32}\.zip$/.test(x)));assert(parts.keys().some(x=>x.startsWith('content/')));assert(!new TextDecoder().decode(parts.get('sync-inventory.json')).match(/Private|Never/));
 assert.equal(a.p.data.bundleRecords.length,1);assert(!(await a.p.engine.previewUpload()).restricted.some(x=>x.path==='Private.md'));
 await receive(b,one,false);assert(!await b.adapter.exists('Public.md'));assert(!await b.adapter.exists('Private.md'));
 let rows=await b.p.v604PrepareInbox(),row=rows.find(x=>x.sha256===one.rec.sha256);assert(row);const info=IOS.__testing.v71.review.restrictedRows(b.p,await b.p.engine.latestPlan());assert(info.some(x=>x.path==='Private.md'&&/不被接受/.test(x.label)));
 await assert.rejects(b.p.v70ConfirmSealed(row,0,'processed'),/允许/);await normal(b);assert.equal(await b.adapter.read('Public.md'),'public payload');assert(!await b.adapter.exists('Private.md'));assert(await b.adapter.exists(IN+one.rec.name),'ordinary completion must retain encrypted pending carrier');
 policy(b,['Private.md'],{'Private.md':{out:[],in:[A]}});await b.p.v70ConfirmSealed(row,0,'processed');assert.equal(await b.adapter.read('Private.md'),'private payload');assert(!await b.adapter.exists(IN+one.rec.name));
 await receive(c,one,false);await normal(c);assert.equal(await c.adapter.read('Public.md'),'public payload');assert(!await c.adapter.exists('Private.md'));assert(!await c.adapter.exists('Never.md'));
 await a.write('Private.md','private payload second');const two=await packet(a,['Private.md']);assert.equal(a.p.data.bundleRecords.length,2);assert(![...Windows.__testing.tools.zipDecode(two.bytes).keys()].some(x=>x.startsWith('content/')));
 await receive(b,two,false);row=(await b.p.v604PrepareInbox()).find(x=>x.sha256===two.rec.sha256);await b.p.v70ConfirmSealed(row,0,'processed');assert.equal(await b.adapter.read('Private.md'),'private payload second');
 console.log('PASS unified mixed and private-only carrier; denied third device; cancel preservation; separate confirmations; current policy');
}
async function autosave(){
 const h=await host(IOS,B,'Settings');await h.write('Keep.md','body');const modal=IOS.__testing.v71.settings.open(h.p);
 assert(!find(modal,'button','保存隐私笔记设置'));assert(!find(modal,'button','保存并生成定向增量包'));
 const check=modal.contentEl.querySelectorAll('input').find(x=>x.type==='checkbox');check.checked=true;await check.handlers.change();await modal._v71SaveTask;
 assert(h.saved().v70PrivateNotes[JSON.stringify([group,B])].notes.includes('Keep.md'));
 const input=modal.contentEl.querySelectorAll('input').find(x=>x.attrs['aria-label']==='接受谁更新 Keep.md');input.value=A;await input.handlers.input();await input.handlers.blur();await modal._v71SaveTask;
 assert.deepEqual(h.saved().v70PrivateNotes[JSON.stringify([group,B])].devices['Keep.md'].in,[A]);
 check.checked=false;await check.handlers.change();await modal._v71SaveTask;assert(!h.saved().v70PrivateNotes[JSON.stringify([group,B])].notes.length);
 const devices=modal.contentEl.querySelectorAll('details').find(x=>x.querySelector('summary')?.textContent==='设备管理');assert(!devices.open);await find(modal,'button','添加设备').handlers.click();assert.equal(h.saved().v71Devices[JSON.stringify([group,B])].length,1);
 console.log('PASS automatic privacy checkbox and blur save; device default collapse and add');
}
async function archiveAndSelection(){
 const a=await host(Windows,A,'Inbox sender'),b=await host(IOS,B,'Inbox target');await a.write('First.md','first');const one=await publish(a);await receive(b,one,false);await a.write('Second.md','second');const two=await publish(a);await receive(b,two,false);
 await b.p.v604PrepareInbox();const modal=new IOS.__testing.NativeUi.download(b.p.app,b.p);await modal.refresh();
 assert.deepEqual([...modal._v71Selected],[two.rec.sha256]);assert(!(await b.p.engine.latestPlan()).items.some(x=>x.recordName===one.rec.name));
 await find(modal,'button','全选').handlers.click();assert.equal(modal._v71Selected.size,2);assert((await b.p.engine.latestPlan()).items.some(x=>x.path==='First.md'));
 modal.close();const row=(await b.p.v604PrepareInbox()).find(r=>r.sha256===one.rec.sha256);await b.p.v71ManageInbox(row,true);assert(!await b.adapter.exists(IN+one.rec.name));assert(!await b.adapter.exists('First.md'));
 const archived=b.p.data.v71History[JSON.stringify([group,B])][one.rec.sha256];assert(await b.adapter.exists(archived.path));assert(b.p.v611IsHistorySource(one.rec.sha256,A));
 const source=await IOS.__testing.v611.readHistory(b.p,archived.path);assert.equal(new TextDecoder().decode(await IOS.__testing.v611.historicalBytes(b.p,source.items[0])),'first');
 const next=(await b.p.v604PrepareInbox()).find(r=>r.sha256===two.rec.sha256);await b.p.v71ManageInbox(next,false);assert(!await b.adapter.exists(IN+two.rec.name));assert(!await b.adapter.exists('Second.md'));assert(!(await b.p.engine.latestPlan()).v605Review);
 console.log('PASS newest default, select-all aggregate, archive without import, delete without receipt or note writes');
}
async function groups(){
 const h=await host(IOS,B,'Group swap');await h.write('Note.md','body');const old=group,id=h.p.data.deviceId;await h.write(IN+'old.txt','old inbox');await h.p.v71UnbindGroup();assert.equal(h.p.data.deviceId,id);assert(!h.p.data.groupId);assert(!h.p.engine);assert(!await h.adapter.exists(IN+'old.txt'));
 await h.p.joinGroup('vg-'+'d'.repeat(24));assert.equal(h.p.data.deviceId,id);assert.notEqual(h.p.data.groupId,old);assert(!await h.adapter.exists(IN+'old.txt'));await h.p.v71UnbindGroup();await h.p.joinGroup(old);assert.equal(h.p.data.deviceId,id);assert.equal(await h.adapter.read(IN+'old.txt'),'old inbox');assert.equal(await h.adapter.read('Note.md'),'body');
 console.log('PASS unbind, new group, return old group with same identity and isolated inbox');
}
(async()=>{await unified();await autosave();await archiveAndSelection();await groups();})().catch(e=>{console.error(e);process.exitCode=1;});
