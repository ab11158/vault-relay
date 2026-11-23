const assert=require('node:assert/strict');
const {host,receive,Windows,Mobile,IOS,A,B,group}=require('./test-flow.cjs');
const IN='VaultRelay-Transfer/inbox/';
function policy(h,out,accept=true){h.p.data.v70PrivateNotes={[JSON.stringify([group,h.p.engine.state.deviceId])]:{notes:['Private.md'],devices:{'Private.md':{out:[out],in:accept?[out]:[]}},attachments:[]}};}
async function pair(a,b){const api=Windows.__testing.v70.sealed;const ka=await api.ownKeys(a.p),kb=await api.ownKeys(b.p);await api.trust(a.p,kb.card,await api.fingerprint(kb.card));await api.trust(b.p,ka.card,await api.fingerprint(ka.card));}
async function packet(h){const q=await h.p.engine.previewUpload(),selectedPaths=[...q.ready,...q.restricted.filter(x=>x.publishable)].map(x=>x.path);const n=h.p.engine.safeUpload?await h.p.engine.safeUpload({selectedPaths,expectedFingerprint:q.fingerprint}):await h.p.engine.safeExport(q,{selectedPaths,allowInitial:true});await h.p.finalizeConfirmedUpload(n);const rec=h.p.data.bundleRecords.at(-1);return {rec,bytes:await h.adapter.readBinary(rec.stored.path)};}
(async()=>{
for(const Type of [Windows,Mobile,IOS]){
 const a=await host(Windows,A,'History sender'),b=await host(Type,B,'History receiver');await pair(a,b);policy(a,B);policy(b,A);
 await a.write('Private.md','secret old');await a.write('Normal.md','normal old');const old=await packet(a);await receive(b,old,false);
 const row=(await b.p.v604PrepareInbox()).find(x=>x.sha256===old.rec.sha256);await b.p.v71ManageInbox(row,true);
 const archive=b.p.data.v71History[JSON.stringify([group,B])][old.rec.sha256];
 assert.equal(Type.__testing.v611.historyRecords(b.p).find(x=>x.sha256===old.rec.sha256).versions.length,2);
 const source=await Type.__testing.v611.readHistory(b.p,archive.path);
 await b.write('Private.md','secret local');await b.write('Normal.md','normal local');
 policy(b,A,false);await assert.rejects(Type.__testing.v611.restore(b.p,source,source.items.map(x=>x.versionId)),/不被接受/);assert.equal(await b.adapter.read('Normal.md'),'normal local');
 policy(b,A);const result=await Type.__testing.v611.restore(b.p,source,source.items.map(x=>x.versionId));
 assert.equal(await b.adapter.read('Private.md'),'secret old');assert.equal(await b.adapter.read('Normal.md'),'normal old');
 const rec=b.p.data.bundleRecords.find(x=>x.name===result.name);assert(rec);assert.equal(rec.versions.length,1);assert.equal(rec.v70PrivateVersions.length,1);
 const bytes=await b.adapter.readBinary(rec.stored.path),parts=Type.__testing.tools.zipDecode(bytes);const privateMember=[...parts.keys()].find(x=>x.startsWith('private/'));assert(privateMember);assert([...parts.keys()].some(x=>x.startsWith('content/')));
 assert(!Windows.__testing.tools.zipDecode(old.bytes).has(privateMember));
 assert(await b.adapter.exists(archive.path));assert(b.p.data.undoOperations.some(x=>x.kind==='历史版本恢复'));
 console.log('PASS mixed archived history restore with current policy and fresh encryption: '+(Type===Windows?'Windows':Type===IOS?'iOS':'Android'));
}
})().catch(e=>{console.error(e);process.exitCode=1;});
