'use strict';
const assert=require('node:assert/strict');
const {Windows,Mobile,IOS,A,B,group,host,publish,receive}=require('./test-flow.cjs');
const scope=id=>JSON.stringify([group,id]);
const notes=(h,id,value)=>{h.p.data.v70PrivateNotes={[scope(id)]:value};};
const rule={in:[],out:[]};
async function installDeleteEvent(h){
 const event=[];
 h.p.app.vault.on=(name,fn)=>{if(name==='delete')event.push(fn);return {};};
 h.p=await h.restart();
 assert(event.length);
 return async path=>{
  const file=h.p.app.vault.getAbstractFileByPath(path);
  await h.p.app.vault.delete(file);for(const fn of event)fn(file);
  await h.p._vrPrivacyDeletion;
 };
}
async function actualDelete(Target,id,Sender,sender){
 const h=await host(Target,id,'Privacy deletion'),s=await host(Sender,sender,'Privacy deletion partner');
 const privacy=Target.__testing.v70.privacy,path='Welcome.md',kept='Assets/Unowned.png',shared='Assets/Shared.png',removed='Assets/Removed.png',other='Other.md';
 const original='public predecessor',replacement='later edit from another device';
 await s.write(path,original);await receive(h,await publish(s));
 await s.write(path,replacement);const packet=await publish(s);
 for(const [name,body] of [[kept,'retained private asset'],[shared,'shared private asset'],[removed,'attachment deleted with note'],[other,'still private']])await h.write(name,body);
 notes(h,id,{notes:[path,other],attachments:[kept,shared,removed],links:{[path]:[kept,shared,removed],[other]:[shared]},
   devices:{[path]:rule,[other]:rule},inherited:{[path]:[sender]}});
 h.p.data.history.push({kind:'privacy history',message:'retain existing operation'});await h.p.persistTransport();
 const remove=await installDeleteEvent(h),originalRecords=JSON.stringify(h.p.data.history);
 await h.adapter.remove(removed);await remove(path);
 const saved=h.saved().v70PrivateNotes[scope(id)];
 assert.deepEqual(saved.notes,[other]);assert(!Object.hasOwn(saved.devices,path));assert(!Object.hasOwn(saved.inherited,path));assert(!Object.hasOwn(saved.links,path));
 assert.deepEqual(saved.retainedAttachments,[kept]);assert.deepEqual(saved.attachments,[shared]);
 assert.equal(JSON.stringify(h.p.data.history),originalRecords);
 assert.equal(privacy.blocks(h.p,path),false);assert(privacy.blocks(h.p,kept));assert(privacy.blocks(h.p,shared));assert(!privacy.blocks(h.p,removed));
 h.p.app.metadataCache={resolvedLinks:{[other]:{[kept]:1,[shared]:1}}};
 assert.deepEqual(privacy.attachments(h.p,other),[shared]);
 const upload=await h.p.engine.previewUpload();assert(!upload.ready.some(row=>row.path===kept));assert(!upload.deletions.some(row=>row.path===path));
 await receive(h,packet,false);const review=await h.p.engine.latestPlan();
 assert.equal(review.items.find(row=>row.path===path)?.status,'create');assert(!await h.adapter.exists(path));
 const apply=h.p.engine.applyPlan||h.p.engine.safeApply;
 assert.deepEqual((await apply.call(h.p.engine,review,{selectedReviewPaths:[path]})).errors,[]);
 assert.equal(await h.adapter.read(path),replacement);
 await remove(kept);assert(!privacy.policy(h.p).retainedAttachments.includes(kept));
 console.log('PASS '+(Target===Windows?'Windows':Target===IOS?'iOS':'Android')+' deletion event, log retention, attachment protection and explicit import of a newer version');
}
async function legacyAndExistingZip(){
 const s=await host(Mobile,B,'Old ordinary ZIP sender'),h=await host(Windows,A,'Old rule receiver');
 const privacy=Windows.__testing.v70.privacy,path='Welcome.md',pending='Pending encrypted.md';
 await s.write(path,'received before removing the rule');const packet=await publish(s);
 notes(h,A,{notes:[path,pending],attachments:[],links:{},devices:{[path]:rule,[pending]:{in:[B],out:[]}}});
 await h.p.persistTransport();h.p=await h.restart();
 assert(privacy.blocks(h.p,pending),'startup must not clear a rule without deletion evidence');
 await receive(h,packet,false);
 const modal=new Windows.__testing.NativeUi.download(h.p.app,h.p);await modal.refresh();
 assert(modal.plan.v605Parts.some(part=>part.privateItems.some(item=>item.path===path&&item.missingNote)));
 const find=()=>modal.contentEl.querySelectorAll('button').find(el=>el.textContent==='确认笔记已删除并清理规则');
 assert(find());global.window={confirm:()=>false};
 try{
  await find().click();assert(privacy.blocks(h.p,path));
  global.window.confirm=()=>true;await find().click();
  assert(!privacy.blocks(h.p,path));assert(privacy.blocks(h.p,pending));
  assert(!await h.adapter.exists(path));assert.equal(modal.plan.items.find(row=>row.path===path)?.status,'create');
  const result=await h.p.engine.applyPlan(modal.plan,{selectedReviewPaths:[path]});assert.deepEqual(result.errors,[]);
  assert.equal(await h.adapter.read(path),'received before removing the rule');
 }finally{delete global.window;modal.close();}
 console.log('PASS already downloaded ZIP can be re-reviewed after explicitly clearing a stale rule; no auto-import or broad rule removal');
}
async function changedReceiverSettings(){
 const s=await host(Mobile,B,'ZIP already in cloud'),h=await host(Windows,A,'Receiver changes settings');
 const path='Welcome.md',old='before the edit',next='already downloaded edit';
 await s.write(path,old);await receive(h,await publish(s));
 await s.write(path,next);const packet=await publish(s);
 notes(h,A,{notes:[path],attachments:[],links:{},devices:{[path]:rule}});
 await receive(h,packet,false);const restricted=await h.p.engine.latestPlan();
 assert(restricted.v605Parts.some(part=>part.privateItems.some(item=>item.path===path)));
 const modal=Windows.__testing.v71.settings.open(h.p);
 const box=modal.contentEl.querySelectorAll('input').find(el=>el.type==='checkbox');
 assert(box.checked);box.checked=false;await box.handlers.change();await modal._v71SaveTask;
 const fresh=await h.p.engine.latestPlan();assert.equal(fresh.items.find(i=>i.path===path)?.status,'safe-update');
 await assert.rejects(h.p.engine.applyPlan(restricted),/重新审核/);
 assert.equal(await h.adapter.read(path),old);
 const result=await h.p.engine.applyPlan(fresh,{selectedReviewPaths:[path]});assert.deepEqual(result.errors,[]);
 assert.equal(await h.adapter.read(path),next);modal.close();
 console.log('PASS removing the receiving restriction through settings reuses an already downloaded ZIP and rejects a stale review');
}
(async()=>{await actualDelete(Windows,A,Mobile,B);await actualDelete(Mobile,B,Windows,A);await actualDelete(IOS,B,Windows,A);await legacyAndExistingZip();await changedReceiverSettings();})().catch(e=>{console.error(e);process.exitCode=1;});
