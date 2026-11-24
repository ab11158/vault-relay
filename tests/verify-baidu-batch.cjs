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
  windows.p.v613WindowsReturned();
  const received=await windows.p._vrDboxScan;
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

  const partialTarget=await host(Windows,B,'Win2');
  const partial=await pack([[key(first),first.bytes],[key(second),new Uint8Array(44)]]);
  await partialTarget.adapter.writeBinary(DBOX+archiveName,partial);
  const collected=await partialTarget.p.vrCollectDbox();
  assert.equal(collected.errors,1);
  assert.deepEqual(collected.acceptedZips.map(row=>row.sha),[sha(first.bytes)]);
  assert(await partialTarget.adapter.exists(DBOX+archiveName));
  const acceptedPath=collected.acceptedZips[0].path;
  const acceptedRow=(await partialTarget.p.v604PrepareInbox()).find(row=>row.path===acceptedPath);
  assert(acceptedRow);
  await Windows.__testing.v71.review.manage(partialTarget.p,acceptedRow,false);
  assert(!await partialTarget.adapter.exists(acceptedPath));
  assert.equal((await partialTarget.p.vrCollectDbox()).acceptedZips.length,0,'Retained wrapper must not restore a dismissed ZIP');

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
  retryTarget.p.v614ReceiveZip=async file=>{
    if(file.name===first.rec.name)throw Error('simulated inbox write failure');
    return read(file);
  };
  const interrupted=await retryTarget.p.vrCollectDbox();
  assert.equal(interrupted.errors,1);
  assert(!(await retryTarget.adapter.exists(DBOX+archiveName)));
  assert.equal(sha(await retryTarget.adapter.readBinary(DBOX+first.rec.name)),sha(first.bytes));
  retryTarget.p.v614ReceiveZip=read;
  const retried=await retryTarget.p.vrCollectDbox();
  assert.equal(retried.errors,0);
  assert.equal(retried.acceptedZips[0].sha,sha(first.bytes));

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
  console.log('PASS Dbox ZIP recognition, wrapper deletion before inbox, review, and retries');
}
test().catch(error=>{console.error(error);process.exitCode=1;});
