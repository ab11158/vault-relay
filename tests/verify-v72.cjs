const assert=require('node:assert/strict');
const {host,receive,Windows,Mobile,IOS,A,B,group}=require('./test-flow.cjs');
const {tools,v70:{sealed,privacy}}=Windows.__testing;
const C='vr-'+'c'.repeat(24), D='vr-'+'d'.repeat(24);
const files={closed:'LocalSecret.md',partial:'OneDevice.md',other:'OtherDevice.md',missing:'MissingCard.md',ordinary:'Ordinary.md',attachment:'LocalPicture.png'};
const inbox='VaultRelay-Transfer/inbox/';
const decode=data=>JSON.parse(Buffer.from(data).toString('utf8'));
const encode=data=>Buffer.from(JSON.stringify(data));
const input=(part)=>({name:part.rec.name,size:part.bytes.length,arrayBuffer:async()=>part.bytes});
function policy(h,rules,links={}){
  h.p.data.v70PrivateNotes={[JSON.stringify([group,h.p.engine.state.deviceId])]:{notes:Object.keys(rules),devices:rules,attachments:Object.values(links).flat(),links}};
}
async function pair(a,b){
  const [x,y]=await Promise.all([sealed.ownKeys(a.p),sealed.ownKeys(b.p)]);
  await sealed.trust(a.p,y.card,await sealed.fingerprint(y.card));
  await sealed.trust(b.p,x.card,await sealed.fingerprint(x.card));
}
async function generate(h,selectedPaths){
  const preview=await h.p.engine.previewUpload(), options={selectedPaths,expectedFingerprint:preview.fingerprint,allowInitial:true};
  const native=h.p.engine.safeUpload?await h.p.engine.safeUpload(options):await h.p.engine.safeExport(preview,options);
  await h.p.finalizeConfirmedUpload(native);
  const rec=h.p.data.bundleRecords.at(-1);
  return {rec,bytes:await h.adapter.readBinary(rec.stored.path)};
}
async function ordinaryReview(h){
  const plan=await h.p.engine.latestPlan(), apply=h.p.engine.applyPlan||h.p.engine.safeApply;
  await apply.call(h.p.engine,plan,{selectedReviewPaths:[files.ordinary]});
  assert.equal(await h.adapter.read(files.ordinary),'public text');
}
async function pack(outer,manifest,privateEntries){
  manifest.files=manifest.files.filter(x=>!x.path.startsWith('private/'));
  for(const [path,bytes] of privateEntries)manifest.files.push({path,bytes:bytes.length,sha256:await tools.sha256(bytes)});
  return tools.zipEncode([...outer].filter(([name])=>name!=='manifest.json'&&!name.startsWith('private/')).concat(
    privateEntries,[['manifest.json',encode(manifest)]]).map(([name,data])=>({name,data})));
}
async function checkPreview(runtime,id){
  const sender=await host(runtime,id,'Preview');
  for(const path of [files.ordinary,files.closed,files.partial,files.missing])await sender.write(path,'sample');
  const allowed=await host(Windows,B,'Allowed');await pair(sender,allowed);
  policy(sender,{[files.closed]:{out:[],in:[]},[files.partial]:{out:[B],in:[]},[files.missing]:{out:[D],in:[]}});
  sender.p.openCoreUi('upload');
  const modal=sender.p.app.openedModals.at(-1);
  for(let i=0;i<250&&!modal.contentEl.textContent.includes('设备名片');i++)await new Promise(resolve=>setTimeout(resolve,10));
  const text=modal.contentEl.textContent;
  assert.match(text,/已勾选 3 项 · 普通 1 · 部分受限 1 · 完全受限 1/);
  assert(text.includes(files.missing));
  assert(text.includes('请先核对并保存设备名片：'+D));
}
async function checkPackages(){
  const a=await host(Windows,A,'Sender'), b=await host(IOS,B,'First authorized');
  const c=await host(Mobile,C,'Second authorized'), d=await host(Mobile,D,'No card or access');
  await pair(a,b);await pair(a,c);
  const rules={
    [files.closed]:{out:[],in:[]},[files.partial]:{out:[B],in:[]},
    [files.other]:{out:[C],in:[]},[files.missing]:{out:[D],in:[]}
  };
  policy(a,rules,{[files.closed]:[files.attachment]});
  for(const path of [files.closed,files.partial,files.other,files.missing,files.attachment])await a.write(path,'protected '+path);
  await a.write(files.ordinary,'public text');
  const preview=await a.p.engine.previewUpload();
  assert.deepEqual(preview.ready.map(x=>x.path),[files.ordinary]);
  assert.equal(preview.restricted.find(x=>x.path===files.missing).publishable,false);
  const packet=await generate(a,[files.ordinary,files.closed,files.partial,files.other]);
  const outer=tools.zipDecode(packet.bytes), m=decode(outer.get('manifest.json'));
  const parts=[...outer].filter(([name])=>name.startsWith('private/'));
  assert.equal(parts.length,3);
  assert([...outer.keys()].some(name=>name.startsWith('content/')));
  for(const [name,data] of outer){
    if(name.startsWith('content/')){
      const publicPack=await Windows.__testing.zip.loadAsync(data);
      assert.deepEqual(JSON.parse(await publicPack.file('manifest.json').async('text')).entries.map(x=>x.path),[files.ordinary]);
    }
    for(const path of Object.values(files).filter(path=>path!==files.ordinary)){
      assert(!name.includes(path));assert(!Buffer.from(data).includes(path));
    }
  }
  const {wrapPrivate}=await sealed.ownKeys(a.p);
  const ownKey=await crypto.subtle.importKey('pkcs8',Buffer.from(wrapPrivate,'base64'),{name:'RSA-OAEP',hash:'SHA-256'},false,['decrypt']);
  const expectedRoutes=[[A],[A,B],[A,C]],rawKeys=[];
  for(const [i,[name,bytes]] of parts.entries()){
    assert.match(name,/^private\/[0-9a-f]{32}\.zip$/);
    const inner=tools.zipDecode(bytes), header=decode(inner.get('manifest.json')), [body]=decode(inner.get('sealed.bin'));
    assert.equal(header.member,name);assert.equal(header.memberCount,3);assert.equal(header.memberIndex,i);
    assert.deepEqual(body.slots.map(slot=>slot.deviceId).sort(),expectedRoutes[i].slice().sort());
    const slot=body.slots.find(slot=>slot.deviceId===A);
    rawKeys.push(Buffer.from(await crypto.subtle.decrypt({name:'RSA-OAEP'},ownKey,Buffer.from(slot.key,'base64'))).toString('hex'));
  }
  assert.equal(new Set(rawKeys).size,3);
  const self=await a.p.v601ValidateReceivedPackage(packet.rec.name,packet.bytes);
  const local=self.report.sealed.items.find(item=>item.index===0);
  assert.deepEqual(local.files.map(x=>x.path),[files.closed,files.attachment]);
  assert.equal(new TextDecoder().decode(await sealed.decodeEntry(local.files[1])),'protected '+files.attachment);
  const renamed='private/'+'0'.repeat(32)+'.zip';
  const tampered=await pack(outer,structuredClone(m),[[renamed,parts[0][1]],...parts.slice(1)]);
  await assert.rejects(b.p.storeDownloadedZip(input({...packet,bytes:tampered})),/路径、编号或总数/);
  const removed=await pack(outer,structuredClone(m),parts.slice(1));
  await assert.rejects(b.p.storeDownloadedZip(input({...packet,bytes:removed})),/路径、编号或总数/);
  const duplicate=await pack(outer,structuredClone(m),[...parts.slice(1),[renamed,parts[1][1]]]);
  await assert.rejects(b.p.storeDownloadedZip(input({...packet,bytes:duplicate})),/路径、编号或总数/);
  const reordered=await pack(outer,structuredClone(m),parts.slice().reverse());
  assert.deepEqual((await b.p.v601ValidateReceivedPackage(packet.rec.name,reordered)).report.sealed.items.map(x=>x.index),[1]);
  await privacy.checkOutgoing(a.p,packet.bytes,packet.rec);
  rules[files.other].out=[];
  await assert.rejects(privacy.checkOutgoing(a.p,packet.bytes,packet.rec),/开放范围已变化/);
  rules[files.other].out=[C];
  for(const [target,index,path,unauthorized] of [[b,1,files.partial,files.other],[c,2,files.other,files.partial]]){
    const report=await receive(target,packet,false);
    assert.deepEqual(report.report.sealed.items.map(x=>x.index),[index]);
    assert.equal(report.report.sealed.total,3);
    for(const file of [files.ordinary,path,files.closed,files.attachment,unauthorized])assert(!await target.adapter.exists(file));
    const row=(await target.p.v604PrepareInbox()).find(x=>x.sha256===packet.rec.sha256);
    await assert.rejects(target.p.v70ConfirmSealed(row,index,'processed'),/允许/);
    policy(target,{[path]:{out:[],in:[A]}});
    await ordinaryReview(target);
    assert(await target.adapter.exists(inbox+packet.rec.name));
    await target.p.v70ConfirmSealed(row,index,'processed');
    assert.equal(await target.adapter.read(path),'protected '+path);
    for(const file of [files.closed,files.attachment,unauthorized,inbox+packet.rec.name])assert(!await target.adapter.exists(file));
  }
  const stranger=await receive(d,packet,false);
  assert.equal(stranger.report.sealed.relevant,false);
  assert.deepEqual(stranger.report.sealed.items,[]);
  await ordinaryReview(d);
  assert(!await d.adapter.exists(files.closed));
  assert(!await d.adapter.exists(files.attachment));
  assert(!await d.adapter.exists(files.partial));
  assert(!await d.adapter.exists(files.other));
  assert.deepEqual((await a.p.engine.previewUpload()).restricted.map(x=>x.path),[files.missing]);
  await a.write(files.closed,'closed updated');
  const closedOnly=await generate(a,[files.closed]);
  assert.deepEqual(closedOnly.rec.versions,[]);
  assert.deepEqual(closedOnly.rec.v70Recipients,[]);
  await receive(d,closedOnly,false);
  assert(!await d.adapter.exists(inbox+closedOnly.rec.name));
  assert(!d.p.v605HasPending());
  const legacy=await sealed.make(a.p,[files.partial],{buildOnly:true,name:packet.rec.name,bundleId:m.bundleId});
  const legacyBytes=await pack(outer,structuredClone(m),[['private/sealed.zip',legacy.bytes]]);
  const legacyReport=await b.p.v601ValidateReceivedPackage(packet.rec.name,legacyBytes);
  assert.deepEqual(legacyReport.report.sealed.items.map(x=>[x.index,x.files[0].path]),[[0,files.partial]]);
}
(async()=>{
  await checkPreview(Windows,A);await checkPreview(Mobile,C);await checkPreview(IOS,C);
  console.log('PASS 7.2 upload preview: three scopes, default selection and visible missing-card reason');
  await checkPackages();
  console.log('PASS 7.2 separate keys and routes, two recipients, hidden filenames and attachment, bound members, closed-only cleanup and 7.1 compatibility');
})().catch(error=>{console.error(error);process.exitCode=1;});
