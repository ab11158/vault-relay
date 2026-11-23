'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {Windows,Mobile,IOS,A,B,group,host,publish,receive}=require('./test-flow.cjs');
const C='vr-cccccccccccccccc';
const inbox='VaultRelay-Transfer/inbox/';
const filesFor=packet=>({name:packet.rec.name,size:packet.bytes.length,arrayBuffer:async()=>packet.bytes});
const truth=(h,path)=>h.adapter.read(path);
async function pair(Sender,source,Receiver,target){
 const s=Sender.__testing.v70.sealed,r=Receiver.__testing.v70.sealed;
 const [a,b]=await Promise.all([s.ownKeys(source.p),r.ownKeys(target.p)]);
 await Promise.all([s.trust(source.p,b.card,await r.fingerprint(b.card)),r.trust(target.p,a.card,await s.fingerprint(a.card))]);
}
function policy(h,id,notes,devices={},links={}){
 h.p.data.v70PrivateNotes={[JSON.stringify([group,id])]:{notes,devices,links,attachments:Object.values(links).flat()}};
}
function setAge(h,path){const past=new Date(Date.now()-7000);fs.utimesSync(h.abs(path),past,past);}
async function privateFlow(){
 const source=await host(Windows,A,'Sealed Source'),target=await host(IOS,B,'Sealed iPad'),third=await host(Mobile,C,'Sealed Android');
 const api=Windows.__testing.v70.sealed;
 await pair(Windows,source,IOS,target);
 const path='Notes/Private title.md',asset='Assets/private photo.png',body='Secret test payload';
 await source.write(path,body);await source.write(asset,Buffer.from([0x91,0x2f,0x03]));await source.write('Notes/Shared.md','public');
 policy(source,A,[path],{[path]:{out:[B],in:[]}},{[path]:[asset]});
 const open=await publish(source),plain=Windows.__testing.tools.zipDecode(open.bytes);
 assert(!new TextDecoder().decode(plain.get('sync-inventory.json')).includes('Private title'));
 assert(!JSON.stringify(open.rec).includes('private photo'));
 const result=await api.make(source.p,[path]);
 const rec=source.p.data.bundleRecords.at(-1),bytes=await source.adapter.readBinary(result.path),wire=Buffer.from(bytes).toString('utf8');
 assert(!wire.includes(path)&&!wire.includes(asset)&&!wire.includes(body));
 const packet={rec,bytes},report=await third.p.v601ValidateReceivedPackage(rec.name,bytes);
 assert.equal(report.report.sealed.relevant,false);
 assert.deepEqual(report.report.sealed.items,[]);
 const incoming=await target.p.storeDownloadedZip(filesFor(packet));await target.p.applyDownloaded(incoming);
 assert.equal(incoming.report.sealed.items[0].files[0].path,path);
 assert(!await target.adapter.exists(path));
 setAge(target,inbox+rec.name);
 const row=(await target.p.v604PrepareInbox()).find(row=>row.sha256===rec.sha256);
 assert.equal(row.state,'pending',JSON.stringify(row));
 await assert.rejects(target.p.v70ConfirmSealed(row,0,'processed'),/允许/);
 policy(target,B,[path],{[path]:{out:[],in:[A]}});
 await target.p.v70ConfirmSealed(row,0,'processed');
 assert.equal(await truth(target,path),body);
 assert.deepEqual(await target.adapter.readBinary(asset),new Uint8Array([0x91,0x2f,0x03]));
 assert(!await target.adapter.exists(row.path));
 await target.write('Public reply.md','reply on iPad');
 const feedback=await publish(target);
 const receiptWire=new TextDecoder().decode(Windows.__testing.tools.zipDecode(feedback.bytes).get('sync-inventory.json'));
 assert(!receiptWire.includes(rec.name)&&!receiptWire.includes(path)&&!receiptWire.includes(asset));
 await receive(source,feedback,false);
 assert.equal(rec.v70Receipts[B].state,'processed');
 assert.equal(Object.keys(target.p.v5218ContentAckState().generated).length,0);
 const members=Windows.__testing.tools.zipDecode(bytes);
 const header=JSON.parse(new TextDecoder().decode(members.get('manifest.json')));
 header.routes[0].push(C);
 const damaged=Windows.__testing.tools.zipEncode([{name:'manifest.json',data:new TextEncoder().encode(JSON.stringify(header))},{name:'sealed.bin',data:members.get('sealed.bin')},{name:'sync-inventory.json',data:members.get('sync-inventory.json')}]);
 await assert.rejects(target.p.v601ValidateReceivedPackage(rec.name,damaged),/签名/);
 const rejected=await third.p.storeDownloadedZip(filesFor(packet));await third.p.applyDownloaded(rejected);assert(!await third.adapter.exists(path));
 await source.write(path,'Secret second revision');
 const second=await api.make(source.p,[path]);
 const incoming2=await target.p.storeDownloadedZip(filesFor({rec:source.p.data.bundleRecords.at(-1),bytes:await source.adapter.readBinary(second.path)}));await target.p.applyDownloaded(incoming2);
 setAge(target,incoming2.temporary);
 const row2=(await target.p.v604PrepareInbox()).find(row=>row.sha256===incoming2.report.hash);
 await target.p.v70ConfirmSealed(row2,0,'processed');assert.equal(await truth(target,path),'Secret second revision');
 console.log('PASS encrypted note and attachment Win1 to iPad, denied Android, no plaintext, no legacy ACK, tamper rejection and second revision');
}
async function supplementalFlow(){
 const source=await host(Windows,A,'Supplement Source'),target=await host(IOS,B,'Supplement Target');
 const held='Held.md',other='Normal.md';
 await source.write(held,'remote version');await source.write(other,'normal content');
 policy(target,B,[held]);
 const one=await publish(source);await receive(target,one,false);
 const plan=await target.p.engine.latestPlan();
 const ignored=plan.v605Parts.flatMap(part=>part.privateItems).find(entry=>entry.path===held);
 const part=plan.v605Parts.find(part=>part.privateItems.includes(ignored));
 assert(ignored);
 await target.p.v70IgnorePrivateEntry(plan,part.v605RecordId,ignored.versionId);
 const confirm=await target.p.engine.latestPlan();await target.p.engine.safeApply(confirm,{selectedReviewPaths:[other]});
 assert(!await target.adapter.exists(held));assert.equal(await truth(target,other),'normal content');
 await target.write(other,'local unsynced new edit');policy(target,B,[]);
 await receive(target,one,false);setAge(target,inbox+one.rec.name);
 const row=(await target.p.v604PrepareInbox()).find(row=>row.sha256===one.rec.sha256);
 assert.equal(row.state,'duplicate');
 assert.equal(target.p.v70SupplementOptions(row).length,1);
 await target.p.v70StartSupplement(row,ignored.versionId);
 const supplement=await target.p.engine.latestPlan();
 assert.deepEqual(supplement.items.map(item=>item.path),[held]);
 await target.p.engine.safeApply(supplement,{selectedReviewPaths:[held]});
 assert.equal(await truth(target,held),'remote version');assert.equal(await truth(target,other),'local unsynced new edit');
 console.log('PASS ignored private note, exact original ZIP, one-note supplement preserves other local changes');
}
async function receiptFlow(){
 const src=await host(Windows,A,'Receipt Source'),target=await host(IOS,B,'Receipt iPad');
 await src.write('Receipt.md','first version');const one=await publish(src);await receive(target,one,false);
 await target.write('Reply.md','new content');const two=await publish(target);await receive(src,two,false);
 const first=src.p.data.bundleRecords.find(record=>record.id===one.rec.id);
 assert.equal(first.v70Receipts[B].state,'verified');
 assert.equal((await src.p.v5218PackageRows()).packages.find(row=>row.record.id===one.rec.id).inventoryReceipts.length,1);
 assert(await src.adapter.exists(first.stored.path));
 await receive(target,one);
 await target.write('Reply.md','next content');const three=await publish(target);await receive(src,three,false);
 assert.equal(first.v70Receipts[B].state,'processed');
 const contents=Windows.__testing.tools.zipDecode(one.bytes),inventory=JSON.parse(new TextDecoder().decode(contents.get('sync-inventory.json')));
 assert.equal(inventory.files.find(file=>file.path==='Receipt.md').sourceBundle.name,one.rec.name);
 console.log('PASS regular incremental package receipt moves from verified to processed and carries source ZIP name');
}
(async()=>{await privateFlow();await supplementalFlow();await receiptFlow();})().catch(error=>{console.error(error);process.exitCode=1;});