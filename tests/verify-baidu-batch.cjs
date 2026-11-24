const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {host,publish,Windows,Mobile,IOS,A,B,sha}=require('./test-flow.cjs');
const {zip,importer}=Windows.__testing;
const IN='VaultRelay-Transfer/inbox/';
const DBOX='VaultRelay-Transfer/Dbox/';
const notes=['Batch first.md','Batch second.md'];
const folder='_pcs_.workspace/00Obsidian/VaultRelay-Transfer/Test/';
const input=(name,bytes)=>({name,size:bytes.length,arrayBuffer:async()=>bytes});
const button=(modal,label)=>modal.contentEl.querySelectorAll('button').find(e=>e.textContent===label);
async function pack(entries){
  const archive=new zip();
  for(const [name,bytes] of entries)archive.file(name,bytes);
  return archive.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
function reviewUI(h,runtime){
  const panel=new runtime.__testing.panel(h.p.app,h.p);
  global.document={visibilityState:'visible',createElement:tag=>Object.assign(new panel.modalEl.constructor(tag),{dataset:{}})};
  h.p.app.workspace.getLeavesOfType=()=>[];
  return panel;
}
async function test(){
  const sender=await host(Windows,A,'Win1');
  await sender.write(notes[0],'first release');
  const first=await publish(sender);
  await sender.write(notes[1],'second release');
  const second=await publish(sender);
  const key=packet=>folder+packet.rec.name;
  const archiveName='【批量下载】'+first.rec.name+'等.zip';
  const wrapped=await pack([[key(first),first.bytes],[key(second),second.bytes]]);
  const expected=new Set([sha(first.bytes),sha(second.bytes)]);

  const windows=await host(Windows,B,'Win2');
  reviewUI(windows,Windows);
  const receive=windows.p.v614ReceiveZip.bind(windows.p);
  windows.p.v614ReceiveZip=async(file,...args)=>{
    assert.equal(file._vr5217Source.path,DBOX+file.name);
    assert(await windows.adapter.exists(DBOX+file.name),'The inner incremental must pass through Dbox');
    assert(!await windows.adapter.exists(DBOX+archiveName),'The wrapper must be removed before inbox reception');
    return receive(file,...args);
  };
  const remove=windows.adapter.remove;
  let removed=false;
  windows.adapter.remove=async source=>{
    if(source===DBOX+archiveName){
      for(const packet of [first,second]){
        assert.equal(sha(await windows.adapter.readBinary(DBOX+packet.rec.name)),sha(packet.bytes));
        assert(!await windows.adapter.exists(IN+packet.rec.name));
      }
      for(const note of notes)assert(!await windows.adapter.exists(note));
      removed=true;
    }
    return remove(source);
  };
  windows.p.v603BeginDownload();windows.p.v603DownloadLeft();
  await windows.adapter.writeBinary(DBOX+archiveName,wrapped);
  windows.p.scheduleReadOnlyReview=()=>assert.deepEqual(new Set(windows.p._v603Download.files.values()),expected);
  const collectDbox=windows.p.vrCollectDbox.bind(windows.p);
  let received;
  windows.p.vrCollectDbox=async()=>received=await collectDbox();
  windows.p.v615CollectDesktopDownloads=async()=>{};
  await windows.p.v613WindowsReturned();
  assert.equal(received.errors,0);
  assert.equal(received.acceptedZips.length,2);
  assert(removed);
  assert(!await windows.adapter.exists(DBOX+archiveName));
  assert(!await windows.adapter.exists(DBOX+first.rec.name));
  assert(!await windows.adapter.exists(DBOX+second.rec.name));
  await windows.p.showReviewAfterReceive({reason:'automatic'});
  const review=windows.p._vrReviewModal;
  assert(review,'Returning from download should open the review');
  assert.deepEqual(review._v71Selected,expected);
  assert.equal(windows.p.app.openedModals.length,1);
  const preview=button(review,'预览确认处理（2）');
  assert(preview,'Both notes must be offered for confirmation');
  await preview.click();
  await button(windows.p.app.openedModals.at(-1),'确认处理').click();
  assert.equal(await windows.adapter.read(notes[0]),'first release');
  assert.equal(await windows.adapter.read(notes[1]),'second release');
  assert.equal((await windows.p.vrCollectDbox()).acceptedZips.length,0);

  for(const [runtime,device] of [[Mobile,'Red1'],[IOS,'Ios1']]){
    const target=await host(runtime,B,device);
    const panel=reviewUI(target,runtime);
    target.p._vrControlPanel=panel;
    await target.adapter.writeBinary(DBOX+'renamed.zip',wrapped);
    await target.p.v603ConsoleOpened(panel);
    assert.deepEqual(target.p._vrReviewModal?._v71Selected,expected);
    assert(!await target.adapter.exists(DBOX+'renamed.zip'));
    for(const note of notes)assert(!await target.adapter.exists(note));
  }

  for(const [runtime,device] of [[Mobile,'Red1'],[IOS,'Ios1']]){
    const target=await host(runtime,B,device);
    reviewUI(target,runtime);
    await target.adapter.mkdir('browser-downloads');
    const source='browser-downloads/'+archiveName;
    await target.adapter.writeBinary(source,wrapped);
    const result=await target.p.importMobileChosenFiles([{
      name:archiveName,size:wrapped.length,arrayBuffer:()=>target.adapter.readBinary(source)
    }]);
    assert.equal(result.errors,0,'The system file picker must recognize a valid batch ZIP');
    assert.equal(result.paths.length,2);
    await target.p.v614OpenSelectedReview(result.paths);
    assert.deepEqual(target.p._vrReviewModal?._v71Selected,expected);
    assert(button(target.p._vrReviewModal,'预览确认处理（2）'));
    assert.equal(sha(await target.adapter.readBinary(source)),sha(wrapped));
    for(const note of notes)assert(!await target.adapter.exists(note));
  }

  const android=await host(Mobile,B,'Red1');
  reviewUI(android,Mobile);
  await android.adapter.mkdir('browser-downloads');
  const androidSource='browser-downloads/'+archiveName;
  await android.adapter.writeBinary(androidSource,wrapped);
  const downloaded={name:archiveName,isFile:true};
  const mtime=Date.now()-6000;
  android.p.mobileCapacitorFilesystem=()=>({});
  android.p.getMobileDownloadEntries=async directory=>
    directory.endsWith('/Download/BaiduNetdisk/')&&await android.adapter.exists(androidSource)?[downloaded]:[];
  const androidRead=android.p.v5217SourceRead.bind(android.p);
  const androidDelete=android.p.v5217SourceDelete.bind(android.p);
  const androidExists=android.p.v5217SourceExists.bind(android.p);
  android.p.v5217SourceRead=async source=>source.kind==='android'?android.adapter.readBinary(androidSource):androidRead(source);
  android.p.v5217SourceDelete=async source=>{
    if(source.kind!=='android')return androidDelete(source);
    for(const packet of [first,second])assert.equal(sha(await android.adapter.readBinary(IN+packet.rec.name)),sha(packet.bytes));
    await android.adapter.remove(androidSource);
  };
  android.p.v5217SourceExists=async source=>source.kind==='android'?android.adapter.exists(androidSource):androidExists(source);
  android.p.readMobileDownloadEntry=async()=>({
    mtime,size:wrapped.length,file:{name:archiveName,size:wrapped.length,arrayBuffer:()=>android.adapter.readBinary(androidSource)}
  });
  const androidScan=await android.p.scanMobileReception({reason:'console',notify:false});
  assert.equal(androidScan.source.errors,0);
  assert.deepEqual(new Set(androidScan.local.acceptedZips.filter(item=>item.batch).map(item=>item.sha)),expected);
  await android.p.reviewMobileScanResult(androidScan);
  assert.deepEqual(android.p._vrReviewModal?._v71Selected,expected);
  for(const note of notes)assert(!await android.adapter.exists(note));
  assert.equal((await android.p.scanMobileReception({reason:'console',notify:false})).source.acceptedZips.length,0);
  assert(!await android.adapter.exists(androidSource),'Android should remove the wrapper after the inbox copies are verified');

  const picked=await host(Windows,B,'Win2');
  const picker=reviewUI(picked,Windows);
  picker.render=()=>{};
  await picked.adapter.mkdir('browser-downloads');
  const source='browser-downloads/'+archiveName;
  await picked.adapter.writeBinary(source,wrapped);
  await picker.receiveTransferFiles([{
    name:archiveName,size:wrapped.length,arrayBuffer:()=>picked.adapter.readBinary(source)
  }]);
  assert.deepEqual(picked.p._vrReviewModal?._v71Selected,expected);
  assert(button(picked.p._vrReviewModal,'预览确认处理（2）'));
  assert.equal(sha(await picked.adapter.readBinary(source)),sha(wrapped));
  for(const note of notes)assert(!await picked.adapter.exists(note));

  const found=await host(Windows,B,'Win2');
  reviewUI(found,Windows);
  // Discovery excludes AppData, where the other temporary vaults live on Windows.
  const downloadRoot=await fs.promises.mkdtemp(path.join(__dirname,'.batch-download-'));
  const downloadedFile=path.join(downloadRoot,archiveName);
  const {Discovery,isBaiduBatch}=Windows.__testing.v5213;
  const service=new Discovery({fs:fs.promises,path,roots:[downloadRoot],
    looksLike:isBaiduBatch,now:()=>Date.now()+5000});
  try{
    found.p.v603BeginDownload();
    found.p.v603DownloadLeft();
    found.p._v603Download.returned=true;
    await fs.promises.writeFile(downloadedFile,wrapped);
    found.p.data.windowsDownloadDir=downloadRoot;
    found.p.v5213GetDiscovery=async()=>service;
    found.p.scheduleReadOnlyReview=()=>assert.deepEqual(new Set(found.p._v603Download.files.values()),expected);
    const discovered=await found.p.v5213Discover({receive:true});
    assert.equal(discovered.candidates,1);
    assert.deepEqual(new Set(found.p._v603Download.files.values()),expected);
    await found.p.showReviewAfterReceive({reason:'automatic'});
    assert.deepEqual(found.p._vrReviewModal?._v71Selected,expected);
    await assert.rejects(fs.promises.stat(downloadedFile),{code:'ENOENT'});
    for(const packet of [first,second])assert.equal(sha(await found.adapter.readBinary(IN+packet.rec.name)),sha(packet.bytes));
    for(const note of notes)assert(!await found.adapter.exists(note));
  }finally{
    await service.stop();
    await fs.promises.rm(downloadedFile,{force:true});
    await fs.promises.rmdir(downloadRoot);
  }

  const wholeDisk=await host(Windows,B,'Win2');
  reviewUI(wholeDisk,Windows);
  const diskRoot=await fs.promises.mkdtemp(path.join(__dirname,'.review-drive-'));
  const outsideDownloads=path.join(diskRoot,'Archive',second.rec.name);
  const otherTransfer=path.join(diskRoot,'test1','VaultRelay-Transfer');
  const ignoredDirs=['Dbox','inbox','outgoing'].map(name=>path.join(otherTransfer,name));
  try{
    await fs.promises.mkdir(path.dirname(outsideDownloads));
    await fs.promises.writeFile(outsideDownloads,second.bytes);
    const old=new Date('2020-01-01T00:00:00Z');
    await fs.promises.utimes(outsideDownloads,old,old);
    for(const dir of ignoredDirs){
      await fs.promises.mkdir(dir,{recursive:true});
      const ignored=path.join(dir,first.rec.name);
      await fs.promises.writeFile(ignored,first.bytes);
      await fs.promises.utimes(ignored,old,old);
    }
    wholeDisk.p.v5213GetDiscovery=async()=>({roots:[diskRoot]});
    await wholeDisk.p.showReviewAfterReceive({reason:'manual-review',forceOpen:true});
    assert.deepEqual(wholeDisk.p._vrReviewModal?._v71Selected,new Set([sha(second.bytes)]));
    assert(button(wholeDisk.p._vrReviewModal,'预览确认处理（1）'));
    assert.equal(sha(await fs.promises.readFile(outsideDownloads)),sha(second.bytes));
    assert(!await wholeDisk.adapter.exists(notes[1]));
    for(const dir of ignoredDirs)assert.equal(sha(await fs.promises.readFile(path.join(dir,first.rec.name))),sha(first.bytes));
  }finally{
    for(const dir of ignoredDirs){
      await fs.promises.rm(path.join(dir,first.rec.name),{force:true});
      await fs.promises.rmdir(dir);
    }
    await fs.promises.rmdir(otherTransfer);
    await fs.promises.rmdir(path.dirname(otherTransfer));
    await fs.promises.rm(outsideDownloads,{force:true});
    await fs.promises.rmdir(path.dirname(outsideDownloads));
    await fs.promises.rmdir(diskRoot);
  }

  const returning=await host(Mobile,B,'Red1');
  reviewUI(returning,Mobile);
  returning.p.v603BeginDownload();
  returning.p.v603DownloadLeft();
  returning.p._v603Download.at-=24*3600*1000;
  const alias=first.rec.name.replace(/\.zip$/, ' (1).zip');
  returning.p.mobileCapacitorFilesystem=()=>({});
  returning.p.data.mobileExtraSources=['/storage/emulated/0/Other/VaultRelay-Transfer/inbox/','/storage/emulated/0/Other/VaultRelay-Transfer/outgoing/'];
  const visited=[];
  returning.p.getMobileDownloadEntries=async directory=>{
    visited.push(directory);
    const tree=new Map([['/storage/emulated/0/','Archive'],['/storage/emulated/0/Archive/','Year'],
      ['/storage/emulated/0/Archive/Year/','Backup']]);
    const localDir=directory.replace('file://','');
    if(tree.has(localDir))return [{name:tree.get(localDir),isDirectory:true}];
    return localDir.endsWith('/Archive/Year/Backup/')?[{name:alias,isFile:true}]:[];
  };
  returning.p.readMobileDownloadEntry=async()=>({mtime,size:first.bytes.length,file:input(alias,first.bytes)});
  await returning.p.scanMobileReception({reason:'return',notify:false});
  assert(!visited.some(dir=>dir.includes('/Other/VaultRelay-Transfer/')));
  const automatic=returning.p._vrReviewModal;
  const automaticPlan=automatic?.plan.items.map(item=>[item.path,item.status]);
  const manuallyChosen=await returning.p.importMobileChosenFiles([input(alias,first.bytes)]);
  await returning.p.v614OpenSelectedReview(manuallyChosen.paths);
  const manualPlan=returning.p._vrReviewModal?.plan.items.map(item=>[item.path,item.status]);
  assert(manualPlan?.some(([note,status])=>note===notes[0]&&status==='create'));
  assert.deepEqual(automaticPlan,manualPlan,'Returning and picking the same downloaded copy should show the same plan');
  assert(!await returning.adapter.exists(notes[0]));

  const iosArchive=await host(IOS,B,'Ios1');
  reviewUI(iosArchive,IOS);
  const localCopy='Archive/Old/'+first.rec.name;
  await iosArchive.adapter.mkdir('Archive/Old');
  await iosArchive.adapter.writeBinary(localCopy,first.bytes);
  const foreign='Archive/Other/VaultRelay-Transfer/outgoing';
  await iosArchive.adapter.mkdir(foreign);
  await iosArchive.adapter.writeBinary(foreign+'/'+second.rec.name,second.bytes);
  fs.utimesSync(iosArchive.abs(localCopy),new Date('2020-01-01'),new Date('2020-01-01'));
  await iosArchive.p.showReviewAfterReceive({reason:'manual-review',forceOpen:true});
  assert.deepEqual(iosArchive.p._vrReviewModal?._v71Selected,new Set([sha(first.bytes)]));
  assert.equal(sha(await iosArchive.adapter.readBinary(localCopy)),sha(first.bytes));
  assert(!await iosArchive.adapter.exists(notes[0]));

  const mixedDownloads=await host(Mobile,B,'Red1');
  const mixedPanel=reviewUI(mixedDownloads,Mobile);
  mixedDownloads.p._vrControlPanel=mixedPanel;
  const firstOnly=await pack([[key(first),first.bytes]]);
  const downloadedFiles=new Map([[archiveName,firstOnly],[second.rec.name,second.bytes]]);
  mixedDownloads.p.mobileCapacitorFilesystem=()=>({});
  mixedDownloads.p.getMobileDownloadEntries=async directory=>directory.endsWith('/Download/BaiduNetdisk/')?
    [...downloadedFiles.keys()].map(name=>({name,isFile:true})):[];
  mixedDownloads.p.readMobileDownloadEntry=async entry=>{
    const bytes=downloadedFiles.get(entry.name);
    return {mtime,size:bytes.length,file:input(entry.name,bytes)};
  };
  await mixedDownloads.p.v603ConsoleOpened(mixedPanel);
  assert.deepEqual(mixedDownloads.p._vrReviewModal?._v71Selected,expected,'Automatic console review must include both batch and standalone ZIPs');
  assert(button(mixedDownloads.p._vrReviewModal,'预览确认处理（2）'));
  for(const note of notes)assert(!await mixedDownloads.adapter.exists(note));

  const sourceChanged=await host(Mobile,B,'Red1');
  const readSource=sourceChanged.p.v5217SourceRead.bind(sourceChanged.p);
  const deleteSource=sourceChanged.p.v5217SourceDelete.bind(sourceChanged.p);
  sourceChanged.p.v5217SourceRead=async source=>source.kind==='android'?first.bytes:readSource(source);
  let triedToDelete=false;
  sourceChanged.p.v5217SourceDelete=async source=>{
    if(source.kind!=='android')return deleteSource(source);
    triedToDelete=true;
  };
  const changed=await sourceChanged.p.vrReceiveExternalBatch({name:archiveName,
    _vr5217Source:{kind:'android',path:'file:///storage/emulated/0/Download/'+encodeURIComponent(archiveName)}},wrapped);
  assert.equal(changed.removed,false);
  assert.equal(triedToDelete,false,'A changed wrapper must be preserved');
  assert.equal(changed.errors,0);
  assert.deepEqual(new Set(changed.receipts.map(receipt=>receipt.sha)),expected);

  const wrongGroup=await host(IOS,B,'Ios1');
  await wrongGroup.p.v71UnbindGroup();
  await wrongGroup.p.joinGroup('vg-'+'d'.repeat(24));
  const rejectedBatch=await wrongGroup.p.importMobileChosenFiles([input(archiveName,wrapped)]);
  assert.equal(rejectedBatch.errors,2,'Valid members from a different group must still be rejected');
  assert.deepEqual(rejectedBatch.paths,[]);
  assert.deepEqual((await wrongGroup.adapter.list(IN.slice(0,-1))).files,[]);
  const newGroupSender=await host(Windows,A,'Win1');
  await newGroupSender.p.v71UnbindGroup();
  await newGroupSender.p.joinGroup(wrongGroup.p.data.groupId);
  newGroupSender.p.data.groupShortName='Tes2';
  await newGroupSender.write('New group note.md','ready for review');
  const newGroupZip=await publish(newGroupSender);
  const newGroupWrapper=await pack([[key(newGroupZip),newGroupZip.bytes]]);
  const acceptedBatch=await wrongGroup.p.importMobileChosenFiles([input(archiveName,newGroupWrapper)]);
  assert.equal(acceptedBatch.errors,0,'A newly joined group can receive without restarting');
  assert.equal(acceptedBatch.paths.length,1);
  assert.equal(sha(await wrongGroup.adapter.readBinary(acceptedBatch.paths[0])),sha(newGroupZip.bytes));
  assert(!await wrongGroup.adapter.exists('New group note.md'));

  const partialTarget=await host(Windows,B,'Win2');
  const partial=await pack([[key(first),first.bytes],[key(second),new Uint8Array(44)]]);
  await partialTarget.adapter.writeBinary(DBOX+archiveName,partial);
  const collected=await partialTarget.p.vrCollectDbox();
  assert.equal(collected.errors,1);
  assert.deepEqual(collected.acceptedZips.map(row=>row.sha),[sha(first.bytes)]);
  assert(!await partialTarget.adapter.exists(DBOX+archiveName));
  const [outerIssue]=partialTarget.p.vrDownloadIssues().values();
  assert(outerIssue.reason.includes(second.rec.name));
  assert.equal(sha(await partialTarget.adapter.readBinary(outerIssue.path)),sha(partial));
  const acceptedPath=collected.acceptedZips[0].path;
  const acceptedRow=(await partialTarget.p.v604PrepareInbox()).find(row=>row.path===acceptedPath);
  assert(acceptedRow);
  await Windows.__testing.v71.review.manage(partialTarget.p,acceptedRow,false);
  assert(!await partialTarget.adapter.exists(acceptedPath));
  assert.equal((await partialTarget.p.vrCollectDbox()).acceptedZips.length,0,'Isolated wrappers do not reenter review');

  const verifyOriginal=await host(Windows,B,'Win2');
  await verifyOriginal.adapter.writeBinary(DBOX+first.rec.name,first.bytes);
  const direct=(await verifyOriginal.p.vrCollectDbox()).acceptedZips;
  assert.equal(direct.length,1);
  assert.equal(direct[0].batch,undefined);
  assert.equal(sha(await verifyOriginal.adapter.readBinary(direct[0].path)),sha(first.bytes));
  assert.equal((await importer.probeDboxZip(input(first.rec.name,first.bytes))).kind,'native');
  const sameNameWrapper=await pack([[key(first),first.bytes]]);
  const sameNameTarget=await host(Windows,B,'Win2');
  await sameNameTarget.adapter.writeBinary(DBOX+first.rec.name,sameNameWrapper);
  const aliased=(await sameNameTarget.p.vrCollectDbox()).acceptedZips;
  assert.equal(aliased.length,1);
  assert.equal(aliased[0].batch,true);
  assert.equal(sha(await sameNameTarget.adapter.readBinary(aliased[0].path)),sha(first.bytes));
  assert(!await sameNameTarget.adapter.exists(DBOX+first.rec.name));
  const mixedTarget=await host(Windows,B,'Win2');
  const mixed=await pack([[key(first),first.bytes],['readme.txt','keep this file']]);
  await mixedTarget.adapter.writeBinary(DBOX+'mixed.zip',mixed);
  assert.equal((await mixedTarget.p.vrCollectDbox()).acceptedZips.length,1);
  assert.equal(sha(await mixedTarget.adapter.readBinary(DBOX+'mixed.zip')),sha(mixed));

  const retryTarget=await host(Windows,B,'Win2');
  await retryTarget.adapter.writeBinary(DBOX+archiveName,wrapped);
  const read=retryTarget.p.v614ReceiveZip.bind(retryTarget.p);
  let writes=0;
  retryTarget.p.v614ReceiveZip=async (file,...args)=>{
    if(file.name===first.rec.name&&++writes===1)throw Error('simulated first inbox write failure');
    return read(file,...args);
  };
  const retried=await retryTarget.p.vrCollectDbox();
  assert.equal(writes,2);
  assert.equal(retried.errors,0);
  assert.deepEqual(new Set(retried.acceptedZips.map(row=>row.sha)),expected);
  assert.equal(retryTarget.p.vrDownloadIssues().size,0);

  const failed=await host(IOS,B,'Ios1');
  reviewUI(failed,IOS);
  await failed.adapter.writeBinary(DBOX+first.rec.name,first.bytes);
  let attempts=0;
  failed.p.v614ReceiveZip=async()=>{attempts++;throw Error('simulated persistent inbox write failure');};
  failed.p.v603BeginDownload();
  failed.p.v603DownloadLeft();
  await failed.p.scanMobileReception({reason:'return',notify:false});
  assert.equal(attempts,2);
  assert(!await failed.adapter.exists(DBOX+first.rec.name));
  const [issue]=failed.p.vrDownloadIssues().values();
  assert.equal(sha(await failed.adapter.readBinary(issue.path)),sha(first.bytes));
  const reviewText=failed.p._vrReviewModal?.contentEl.textContent;
  assert(reviewText?.includes('增量包处理异常（1）'));
  assert(reviewText.includes(first.rec.name)&&reviewText.includes('simulated persistent inbox write failure'));
  assert(!await failed.adapter.exists(notes[0]));

  const privateSource=await host(Windows,A,'Win1');
  const privateTarget=await host(IOS,B,'Ios1');
  const privatePath='Protected note.md';
  const privateBody='only visible to a selected device';
  const sealed=Windows.__testing.v70.sealed;
  const [from,to]=await Promise.all([sealed.ownKeys(privateSource.p),sealed.ownKeys(privateTarget.p)]);
  await sealed.trust(privateSource.p,to.card,await sealed.fingerprint(to.card));
  await sealed.trust(privateTarget.p,from.card,await sealed.fingerprint(from.card));
  for(const [side,device,rules] of [[privateSource,A,{out:[B],in:[]}],[privateTarget,B,{out:[],in:[A]}]]){
    side.p.data.v70PrivateNotes={[JSON.stringify([side.p.data.groupId,device])]:{
      notes:[privatePath],devices:{[privatePath]:rules},attachments:[]
    }};
  }
  await privateSource.write(privatePath,privateBody);
  const plan=await privateSource.p.engine.previewUpload();
  const upload=await privateSource.p.engine.safeUpload({selectedPaths:[privatePath],expectedFingerprint:plan.fingerprint});
  await privateSource.p.finalizeConfirmedUpload(upload);
  const privateRecord=privateSource.p.data.bundleRecords.at(-1);
  const privateZip=await privateSource.adapter.readBinary(privateRecord.stored.path);
  assert([...Windows.__testing.tools.zipDecode(privateZip).keys()].some(name=>/^private\/[0-9a-f]+\.zip$/.test(name)));
  const privateWrapper=await pack([[folder+privateRecord.name,privateZip]]);
  await privateTarget.adapter.writeBinary(DBOX+archiveName,privateWrapper);
  const privateReceipt=(await privateTarget.p.vrCollectDbox()).acceptedZips[0];
  assert.equal(sha(await privateTarget.adapter.readBinary(privateReceipt.path)),sha(privateZip));
  assert(!await privateTarget.adapter.exists(privatePath));
  const privateRow=(await privateTarget.p.v604PrepareInbox()).find(row=>row.sha256===privateReceipt.sha);
  assert(privateRow);
  await privateTarget.p.v70ConfirmSealed(privateRow,0,'processed');
  assert.equal(await privateTarget.adapter.read(privatePath),privateBody);

  const collision=await pack([[key(first),first.bytes],['other/'+first.rec.name,first.bytes]]);
  await assert.rejects(importer.probeDboxZip(input(archiveName,collision)),/同名增量包/);
  const unsafe=await pack([['../'+first.rec.name,first.bytes]]);
  await assert.rejects(importer.probeDboxZip(input(archiveName,unsafe)),/不安全的路径/);
  if(process.argv[2]){
    const raw=await fs.promises.readFile(process.argv[2]);
    const parsed=await importer.probeDboxZip(input(path.basename(process.argv[2]),raw));
    const files=[...parsed.members];
    assert.equal(files.length,2);
    for(const member of files)assert((await member.read()).length>22);
    console.log('PASS real Baidu ZIP wrapper');
  }
  delete global.document;
  console.log('PASS Windows and mobile ZIP intake, group checks, Dbox batch review, source preservation, and retries');
}
test().catch(error=>{console.error(error);process.exitCode=1;});
