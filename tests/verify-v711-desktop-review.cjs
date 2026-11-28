const assert=require('node:assert/strict'),fs=require('node:fs');
const {host,publish,Windows,Mobile,A,B,group}=require('./test-flow.cjs');
const NOTE='欢迎.md', DBOX='VaultRelay-Transfer/Dbox/';
const button=(panel,text)=>panel.contentEl.querySelectorAll('button').find(el=>el.textContent===text);
const chooserFile=(name,raw)=>({name,size:raw.length,arrayBuffer:async()=>raw});

(async()=>{
  const phone=await host(Mobile,B,'Red1');
  const scopePhone=JSON.stringify([group,B]);
  phone.p.data.v70PrivateNotes={[scopePhone]:{notes:[NOTE],attachments:[],devices:{}}};
  await phone.write(NOTE,'New version from Android');
  phone.p.data.v70PrivateNotes[scopePhone]={notes:[],attachments:[],devices:{}};
  const packet=await publish(phone);
  assert(packet.rec.versions.some(row=>row.path===NOTE),'Android publishes the note as ordinary');
  assert(!packet.rec.v70PrivateVersions?.length);

  const pc=await host(Windows,A,'Win1'),panel=new Windows.__testing.panel(pc.p.app,pc.p);
  pc.p._vrControlPanel=panel;
  global.document={visibilityState:'visible',createElement:tag=>Object.assign(new panel.modalEl.constructor(tag),{dataset:{}})};
  let discovery=0,fullDiscovery=0,failDiscovery=false;
  pc.p.v5213Discover=async()=>{discovery++;if(failDiscovery)throw Error('Downloads inaccessible');return {};};
  pc.p.v615CollectDesktopDownloads=async({light}={})=>{if(light)discovery++;else fullDiscovery++;if(failDiscovery)throw Error('Downloads inaccessible');};
  const openOnce=async(action,inspect,{progress=true}={})=>{
    const before=pc.p.app.openedModals.length;
    await action();
    const review=pc.p._vrReviewModal;
    assert(review,'Expected a review window');
    assert.equal(pc.p.app.openedModals.length,before+(progress?2:1),'Only one review opens, plus scan progress when scanning');
    if(progress)assert(pc.p.app.openedModals[before].closed&&pc.p.app.openedModals[before].contentEl.querySelector('progress'));
    assert(review.contentEl.querySelectorAll('p').some(el=>el.textContent==='可导入 0'),review.contentEl.textContent);
    inspect?.(review);
    review.close();
  };
  panel.render();
  await openOnce(()=>button(panel,'刷新').click());
  assert.equal(discovery,1);assert.equal(fullDiscovery,0,'Refresh keeps its previous scan scope');
  const auditButtons=panel.contentEl.querySelectorAll('button').filter(el=>el.textContent==='⑤ 审核与确认导入');
  assert.equal(auditButtons.length,2);
  for(let i=0;i<auditButtons.length;i++){
    const audit=panel.contentEl.querySelectorAll('button').filter(el=>el.textContent==='⑤ 审核与确认导入')[i];
    await openOnce(()=>audit.click());
  }
  const scanButtons=()=>panel.contentEl.querySelectorAll('button').filter(el=>el.textContent==='④ 扫描下载的增量包');
  assert.equal(scanButtons().length,2);
  for(let i=0;i<2;i++){
    await openOnce(()=>scanButtons()[i].click());
    assert(!pc.p._v5216ScanModal,'Button ④ does not open manual results');
  }
  assert.equal(discovery,5);assert.equal(fullDiscovery,0,'Refresh, ④ and ⑤ start with the same light scan');
  failDiscovery=true;
  await openOnce(()=>button(panel,'⑤ 审核与确认导入').click());
  failDiscovery=false;
  const manualBefore=discovery;
  await openOnce(()=>panel.receiveTransferFiles([chooserFile('invalid.zip',Buffer.alloc(32))]),null,{progress:false});
  assert.equal(discovery,manualBefore,'Manual file selection does not scan other download directories');
  const beforeCancel=pc.p.app.openedModals.length;
  await panel.receiveTransferFiles([]);
  assert.equal(pc.p.app.openedModals.length,beforeCancel,'Cancelling the picker opens no review');

  pc.p.v603BeginDownload();pc.p.v603DownloadLeft();
  const session=pc.p._v603Download;
  session.returned=true;session.reviewId='test-auto-review';
  pc.p.data.v525PendingAutoReview={id:session.reviewId};
  pc.p.app.workspace.getLeavesOfType=()=>[];
  const actualPrepare=pc.p.v604PrepareInbox.bind(pc.p);
  let releaseAuto,autoStarted;
  const gate=new Promise(resolve=>{releaseAuto=resolve;});
  const started=new Promise(resolve=>{autoStarted=resolve;});
  pc.p.v604PrepareInbox=async (...args)=>{pc.p.v604PrepareInbox=actualPrepare;autoStarted();await gate;return actualPrepare(...args);};
  const auto=pc.p.showReviewAfterReceive({reason:'automatic'});
  await started;
  const actualShow=pc.p.showReviewAfterReceive.bind(pc.p);
  pc.p.showReviewAfterReceive=(...args)=>{const task=actualShow(...args);releaseAuto();return task;};
  try{await openOnce(()=>button(panel,'刷新').click());}
  finally{releaseAuto();await auto;pc.p.showReviewAfterReceive=actualShow;pc.p.v603FinishDownload();}

  await pc.write(NOTE,'Existing Windows version');
  const scopePc=JSON.stringify([group,A]);
  pc.p.data.v70PrivateNotes={[scopePc]:{notes:[NOTE],attachments:[],devices:{[NOTE]:{in:[],out:[]}}}};
  const inspectBlocked=review=>{
    const text=review.contentEl.textContent;
    assert(text.includes('更新内容因设置不被接受')&&text.includes('本机隐私规则未允许此设备更新'));
    assert(text.includes(packet.rec.name));assert(!text.includes('New version from Android'));
  };
  await pc.adapter.writeBinary(DBOX+packet.rec.name,packet.bytes);
  const past=new Date(Date.now()-8000);fs.utimesSync(pc.abs(DBOX+packet.rec.name),past,past);
  await openOnce(()=>button(panel,'⑤ 审核与确认导入').click(),inspectBlocked);
  assert(!await pc.adapter.exists(DBOX+packet.rec.name));
  await openOnce(()=>button(panel,'刷新').click(),inspectBlocked);
  await openOnce(()=>panel.receiveTransferFiles([chooserFile(packet.rec.name,packet.bytes)]),inspectBlocked,{progress:false});
  await panel.refreshDownloadReview();
  const review=pc.p._vrReviewModal,opened=pc.p.app.openedModals.length,scans=discovery;
  button(review,'添加外部 ZIP').click();
  const input=review.modalEl.querySelector('input');
  input.files=[chooserFile(packet.rec.name,packet.bytes)];await input.handlers.change();
  assert.equal(pc.p._vrReviewModal,review);assert.equal(pc.p.app.openedModals.length,opened);
  assert.equal(discovery,scans);inspectBlocked(review);review.close();
  assert.equal(await pc.adapter.read(NOTE),'Existing Windows version');
  assert(pc.p.data.v70PrivateNotes[scopePc].notes.includes(NOTE));
  delete global.document;
  console.log('PASS Windows refresh, both audit buttons, and selected ZIP show 0 and respect the local privacy rule');
})().catch(error=>{console.error(error);process.exitCode=1;});
