'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {Windows,Mobile,A,B,host,publish,receive,group}=require('./test-flow.cjs');
const identity=JSON.stringify([group,A]);
const rule={in:[],out:[]};
const item=(plan,path)=>plan.items.find(row=>row.path===path);

async function offlineDeletion(){
 const s=await host(Mobile,B,'Sender'),h=await host(Windows,A,'Receiver');
 const path='Welcome.md',asset='Assets/Photo.png',pending='First encrypted.md';
 await s.write(path,'first version');await receive(h,await publish(s));
 await s.write(path,'unreceived predecessor');await publish(s);
 await s.write(path,'full current body');const packet=await publish(s);
 await h.write(asset,'retained private attachment');
 // A 7.11 installation does not have observedNotes yet. The old accepted
 // upsert is sufficient evidence that the missing private note once existed.
 h.p.data.v70PrivateNotes={[identity]:{notes:[path,pending],attachments:[asset],links:{[path]:[asset]},devices:{[path]:rule,[pending]:{in:[B],out:[]}}}};
 h.p.data.history.push({kind:'test',message:'keep the operation log'});
 await h.p.persistTransport();await receive(h,packet,false);
 const oldKnown={...h.p.engine.state.known[path]};
 await h.adapter.remove(path);
 h.p=await h.restart();
 const startup=h.layouts.at(-1),prepare=h.p.v604PrepareInbox.bind(h.p);
 let prepared=false;
 h.p.v604PrepareInbox=async(...args)=>{
  prepared=true;
  const policy=Windows.__testing.v70.privacy.policy(h.p);
  assert.deepEqual(policy.notes,[pending]);assert.deepEqual(policy.devices[pending].in,[B]);
  assert.deepEqual(policy.retainedAttachments,[asset]);
  return prepare(...args);
 };
 h.p.showReviewAfterReceive=async()=>{};
 await startup();assert(prepared,'reconciled startup must prepare inbox');
 assert.deepEqual(h.p.engine.state.known[path],oldKnown);
 assert(h.p.data.history.some(row=>row.message==='keep the operation log'));
 const upload=await h.p.engine.previewUpload();assert(!upload.deletions.some(row=>row.path===path));assert(!upload.ready.some(row=>row.path===asset));
 const review=await h.p.engine.latestPlan(),row=item(review,path);
 assert.equal(row?.status,'create');assert.equal(row.missingParents.length,1);
 assert(!await h.adapter.exists(path));
 assert.deepEqual((await h.p.engine.applyPlan(review,{selectedReviewPaths:[path]})).errors,[]);
 assert.equal(await h.adapter.read(path),'full current body');
 assert.equal((await h.p.engine.latestPlan()).catalog.byPath[path].length,2);
 const duplicate=await receive(h,packet,false);assert(duplicate.v611AlreadyProcessed);
}

async function ordinaryDeletion(){
 const s=await host(Mobile,B,'Sender'),h=await host(Windows,A,'Receiver');
 const path='Ordinary.md';
 await s.write(path,'before');await receive(h,await publish(s));
 await s.write(path,'middle');await publish(s);
 await s.write(path,'after');const packet=await publish(s);
 await h.adapter.remove(path);
 const upload=await h.p.engine.previewUpload();assert(upload.deletions.some(row=>row.path===path));
 await h.write(path,'local unshared edit');await receive(h,packet,false);
 assert.equal(item(await h.p.engine.latestPlan(),path)?.status,'conflict');
 await h.adapter.remove(path);
 const review=await h.p.engine.latestPlan();assert.equal(item(review,path)?.status,'create');
 assert.deepEqual((await h.p.engine.applyPlan(review,{selectedReviewPaths:[path]})).errors,[]);
 assert.equal(await h.adapter.read(path),'after');
}

async function partial(){
 const s=await host(Mobile,B,'Sender'),h=await host(Windows,A,'Receiver');
 const path='Applied.md',remaining='Deferred.md';
 await s.write(path,'applied earlier');await s.write(remaining,'still pending');
 await receive(h,await publish(s),false);
 const review=await h.p.engine.latestPlan();
 assert.deepEqual((await h.p.engine.applyPlan(review,{selectedReviewPaths:[path]})).errors,[]);
 await h.adapter.remove(path);
 const next=await h.p.engine.latestPlan();
 assert.equal(item(next,path)?.status,'history-only');assert.equal(item(next,remaining)?.status,'create');
 assert.deepEqual((await h.p.engine.applyPlan(next,{selectedReviewPaths:[remaining]})).errors,[]);
 assert(!await h.adapter.exists(path));assert.equal(await h.adapter.read(remaining),'still pending');
}

async function observedDeletion(){
 const h=await host(Windows,A,'Offline deletion of a never-synced private note');
 const path='Local private.md';await h.write(path,'private');
 h.p.data.v70PrivateNotes={[identity]:{notes:[path],attachments:[],links:{},devices:{[path]:rule}}};
 await h.layouts.at(-1)();
 assert.deepEqual(h.saved().v70PrivateNotes[identity].observedNotes,[path]);
 await h.adapter.remove(path);h.p=await h.restart();await h.layouts.at(-1)();
 assert.deepEqual(h.saved().v70PrivateNotes[identity].notes,[]);
}

(async()=>{
 await offlineDeletion();await ordinaryDeletion();await partial();await observedDeletion();
 console.log('PASS startup reconciliation, missing-parent Markdown import, ordinary deletion sync, partial ZIPs, duplicate protection, first-import authorization and history');
})().catch(error=>{console.error(error);process.exitCode=1;});
