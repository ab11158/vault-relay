const assert=require('node:assert/strict');
const fs=require('node:fs');
const {host,publish,receive,Windows,Mobile,IOS,A,B}=require('./test-flow.cjs');
function indexedHost(h){
  const vault=h.p.app.vault,index=new Map(),events=[];
  const remember=(path,folder=false)=>{
    const stat=fs.statSync(h.abs(path));
    const file={path,name:path.split('/').pop(),...(folder?{children:[]}:{extension:path.split('.').pop(),stat:{size:stat.size,mtime:stat.mtimeMs,ctime:stat.birthtimeMs}})};
    const parent=path.split('/').slice(0,-1).join('/');
    if(parent&&index.has(parent))index.get(parent).children.push(file);
    index.set(path,file);return file;
  };
  vault.getAbstractFileByPath=path=>index.get(path)||null;
  vault.getFiles=()=>[...index.values()].filter(file=>!file.children);
  vault.createFolder=async path=>{await h.adapter.mkdir(path);return remember(path,true);};
  vault.create=async(path,text)=>{
    const parent=path.split('/').slice(0,-1).join('/');
    assert(!parent||index.get(parent)?.children,'Missing indexed parent '+parent);
    await h.adapter.write(path,text);const file=remember(path);events.push(['create',path]);return file;
  };
  vault.createBinary=async(path,bytes)=>{await h.adapter.writeBinary(path,bytes);const file=remember(path);events.push(['create-binary',path]);return file;};
  vault.modify=async(file,text)=>{assert.equal(index.get(file.path),file);await h.adapter.write(file.path,text);events.push(['modify',file.path]);};
  vault.modifyBinary=async(file,bytes)=>{assert.equal(index.get(file.path),file);await h.adapter.writeBinary(file.path,bytes);events.push(['modify-binary',file.path]);};
  vault.delete=async file=>{await h.adapter.remove(file.path);index.delete(file.path);const parent=index.get(file.path.split('/').slice(0,-1).join('/'));if(parent)parent.children=parent.children.filter(x=>x!==file);events.push(['delete',file.path]);};
  return {vault,index,events};
}
(async()=>{
 for(const Type of [Windows,Mobile,IOS]){
   const a=await host(Windows,A,'source'),b=await host(Type,B,'indexed receiver');
   const view=indexedHost(b),note='测试/新目录/普通.md';
   await a.write(note,'\uFEFF第一版，由A创建\r\n');
   const first=await publish(a);await receive(b,first,false);
   assert.equal(view.vault.getAbstractFileByPath(note),null,'Cancel must not create formal notes');
   await receive(b,first);
   assert(view.vault.getFiles().some(x=>x.path===note),'Imported note must be visible without restarting');
   assert(view.index.get('测试/新目录').children.some(x=>x.path===note),'New note must enter the live folder tree');
   assert.deepEqual(Buffer.from(await b.adapter.readBinary(note)),Buffer.from('\uFEFF第一版，由A创建\r\n'),'Preserve original UTF-8 BOM and CRLF');
   assert(view.events.some(x=>x[0]==='create'&&x[1]===note),'Markdown import must use the live text creation API');
   await a.write(note,'第二版，由A修改\n');await receive(b,await publish(a));
   assert(view.events.some(x=>x[0]==='modify'&&x[1]===note),'Existing editor must receive a modification event');
   assert.equal(await b.adapter.read(note),'第二版，由A修改\n');
   await a.adapter.remove(note);
   const q=await a.p.engine.previewUpload();
   const output=await a.p.engine.safeUpload({onlyDeletions:true,allowDeletes:true,selectedPaths:[note],expectedFingerprint:q.fingerprint});
   await a.p.finalizeConfirmedUpload(output);const rec=a.p.data.bundleRecords.at(-1);
   await receive(b,{rec,bytes:await a.adapter.readBinary(rec.stored.path)});
   assert.equal(view.vault.getAbstractFileByPath(note),null,'Deletion must leave the live index immediately');
   assert(view.events.some(x=>x[0]==='delete'&&x[1]===note));
   const binary=Uint8Array.from([255,0,128,42]);
   await Type.__testing.v761.vault.create(view.vault,'测试/附件.bin',binary);
   assert.deepEqual(new Uint8Array(await b.adapter.readBinary('测试/附件.bin')),binary);
   await assert.rejects(Type.__testing.v761.vault.create(view.vault,note.replace('普通','附件'),binary).then(async()=>Type.__testing.v761.vault.create(view.vault,note.replace('普通','附件'),binary)),/目标刚刚出现/);
 }
 const sender=await host(Windows,A,'failure source'),receiver=await host(Mobile,B,'failure receiver');
 const view=indexedHost(receiver);await sender.write('测试/列表异常.md','retain packet');const packet=await publish(sender);
 view.vault.create=async(path,text)=>receiver.adapter.write(path,text);
 await receive(receiver,packet,false);
 const plan=await receiver.p.engine.latestPlan(),result=await receiver.p.engine.safeApply(plan);
 assert(result.errors.some(x=>x.error.includes('文件列表尚未更新')));
 assert(await receiver.adapter.exists('VaultRelay-Transfer/inbox/'+packet.rec.name),'Keep source packet if the live index failed to update');
 assert(!Object.values(receiver.p.data.v5221Transfers).some(x=>x.name===packet.rec.name&&x.confirmed));
 console.log('PASS Windows / Android / iOS live indexed imports: cancel, nested creation, exact bytes, modification, deletion, binary, concurrent creation; failed index retains packet and reports error');
})().catch(error=>{console.error(error);process.exitCode=1;});
