const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=__dirname,source=process.env.VAULT_RELAY_TEST_SOURCE||path.join(root,'../main.js'),results=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'vault-relay-71-tests-'));fs.mkdirSync(results,{recursive:true});
const checks=[];let serial=0;
function load(desktop,ios=false){
 const Platform={isDesktopApp:desktop,isAndroidApp:!desktop&&!ios,isMobileApp:!desktop,isIosApp:ios};
 class Plugin{constructor(app){this.app=app;this.manifest=JSON.parse(fs.readFileSync(path.join(root,'../manifest.json'),'utf8'));}addCommand(){}addRibbonIcon(){}registerEvent(){}registerDomEvent(){}registerInterval(t){clearInterval(t);}}
 class Element {
   constructor(tag,text=''){this.tag=tag;this.text=text??'';this.children=[];this.handlers={};this.attrs={};this.classes=new Set();this.classList={contains:cls=>this.classes.has(cls),add:cls=>this.classes.add(cls)};}
   get textContent(){return this.text+this.children.map(x=>x.textContent).join('');}
   set textContent(text){this.text=text;this.children=[];}
   get isConnected(){return this.parentNode?.isConnected??['content','modal'].includes(this.tag);}
   addClass(cls){this.classes.add(cls);}
   createEl(tag,opts={}){const part=new Element(tag,opts.text);if(opts.cls)for(const cls of opts.cls.split(' '))part.addClass(cls);this.append(part);return part;}
   createDiv(opts={}){return this.createEl('div',opts);}
   addEventListener(event,callback){this.handlers[event]=callback;}
   setAttribute(key,value){this.attrs[key]=value;}
   getAttribute(key){return this.attrs[key];}
   removeAttribute(key){delete this.attrs[key];}
   click(){return this.handlers.click?.({});}
   empty(){for(const child of this.children)child.parentNode=null;this.children=[];this.text='';}
   appendChild(part){this.append(part);return part;}
   append(part){part.parentNode=this;this.children.push(part);}
   prepend(part){part.parentNode=this;this.children.unshift(part);}
   insertBefore(part,ref){if(part.parentNode===this)this.children=this.children.filter(x=>x!==part);part.parentNode=this;const i=this.children.indexOf(ref);if(i<0)this.children.push(part);else this.children.splice(i,0,part);}
   after(part){this.parentNode.insertBefore(part,this.parentNode.children[this.parentNode.children.indexOf(this)+1]);}
   querySelectorAll(selector){const keys=selector.split(',');return this.children.flatMap(el=>[...(keys.some(key=>key.startsWith('.')?el.classes.has(key.slice(1)):el.tag===key)?[el]:[]),...el.querySelectorAll(selector)]);}
   querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 }
 class Modal {
   constructor(app){this.app=app;this.modalEl=new Element('modal');this.contentEl=new Element('content');}
   open(){this.app.openedModals.push(this);this.opened=Promise.resolve(this.onOpen?.());}
   close(){this.closed=true;this.onClose?.();}
 }
 class Setting {
   constructor(el){this.settingEl=el.createDiv({cls:'setting-item'});}
   setName(){return this;} setDesc(){return this;}
   addButton(fn){
     const b=this.settingEl.createEl('button'),button={
       setButtonText(t){b.textContent=t;return this;},setCta(){return this;},setWarning(){return this;},
       setDisabled(v){b.disabled=v;return this;},onClick(f){b.addEventListener('click',f);return this;}};
     fn(button);return this;
   }
   addToggle(fn){
     const input=this.settingEl.createEl('input');input.type='checkbox';
     fn({setValue(v){input.checked=v;return this;},onChange(f){input.addEventListener('change',()=>f(input.checked));return this;}});
     return this;
   }
 }
 const old=Module._load;let P;
 try{Module._load=function(n,...a){if(n==='obsidian')return {Platform,Plugin,Modal,Setting,Notice:class{}};return old.call(this,n,...a);};const m=new Module(source,module);m.filename=source;m.paths=Module._nodeModulePaths(root);m._compile(fs.readFileSync(source,'utf8'),source);P=m.exports;}finally{Module._load=old;}
 return P;
}
const Windows=load(true),Mobile=load(false),IOS=load(false,true),group='vg-'+'a'.repeat(24),A='vr-'+'a'.repeat(32),B='vr-'+'b'.repeat(32);
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
async function host(P,id,name,initial){
 const base=fs.mkdtempSync(path.join(results,`host-${++serial}-`)),abs=p=>path.join(base,...p.split('/'));
 const adapter={getBasePath:()=>base,basePath:base,exists:async p=>fs.existsSync(abs(p)),mkdir:async p=>fs.promises.mkdir(abs(p),{recursive:true}),
 stat:async p=>{try{const s=await fs.promises.stat(abs(p));return {type:s.isDirectory()?'folder':'file',size:s.size,mtime:s.mtimeMs,ctime:s.birthtimeMs};}catch(e){if(e.code==='ENOENT')return null;throw e;}},
 list:async p=>{try{const entries=await fs.promises.readdir(abs(p),{withFileTypes:true});return {files:entries.filter(x=>x.isFile()).map(x=>p+'/'+x.name),folders:entries.filter(x=>x.isDirectory()).map(x=>p+'/'+x.name)};}catch(e){if(e.code==='ENOENT')return {files:[],folders:[]};throw e;}},
 readBinary:async p=>new Uint8Array(await fs.promises.readFile(abs(p))),writeBinary:async(p,b)=>fs.promises.writeFile(abs(p),new Uint8Array(b)),
 read:async p=>fs.promises.readFile(abs(p),'utf8'),write:async(p,s)=>fs.promises.writeFile(abs(p),s),
 remove:async p=>fs.promises.unlink(abs(p)),rmdir:async p=>fs.promises.rmdir(abs(p)),rename:async(a,b)=>fs.promises.rename(abs(a),abs(b))};
 function file(p){if(!fs.existsSync(abs(p)))return null;const s=fs.statSync(abs(p));return s.isDirectory()?{path:p,children:[]}:{path:p,name:path.basename(p),extension:path.extname(p).slice(1),stat:{size:s.size,mtime:s.mtimeMs,ctime:s.birthtimeMs}};}
 function files(dir=''){const found=[];for(const e of fs.readdirSync(abs(dir),{withFileTypes:true})){const p=(dir?dir+'/':'')+e.name;if(e.isDirectory())found.push(...files(p));else found.push(file(p));}return found;}
 const vault={adapter,getName:()=>name,on:()=>({}),getFiles:()=>files(),getAbstractFileByPath:file,
 readBinary:f=>adapter.readBinary(f.path),cachedRead:f=>adapter.read(f.path),read:f=>adapter.read(f.path),
 createFolder:async p=>{await adapter.mkdir(p);return file(p);},createBinary:async(p,b)=>{await fs.promises.mkdir(path.dirname(abs(p)),{recursive:true});await adapter.writeBinary(p,b);return file(p);},
 modifyBinary:async(f,b)=>adapter.writeBinary(f.path,b),delete:async f=>adapter.remove(f.path)};
 let saved=initial||{groupId:group,groupName:'QA',groupShortName:'Tes1',deviceShortName:id===A?'Win1':'Red1',deviceId:id,history:[],desktopTransportEnabled:false,
 v2:{schema:2,groupId:group,deviceId:id,known:{},processed:{},seenInfo:{},seenAck:{},acks:{},publishedAckIds:{},receivedAcks:{},devices:{},drafts:{},seq:0,messageSeq:0,shareRoot:'',syncEnabled:false,setupComplete:true,mobileActivated:true}};
 const workspaceEvents=new Map(),layouts=[];
 const app={vault,openedModals:[],workspace:{on:(event,fn)=>{workspaceEvents.set(event,fn);return {};},onLayoutReady:fn=>layouts.push(fn)},plugins:{plugins:{}}};
 const p=new P(app);p.loadData=async()=>JSON.parse(JSON.stringify(saved));p.saveData=async d=>{saved=JSON.parse(JSON.stringify(d));};
 const start=async plugin=>{
   plugin.v5213InitDiscovery=()=>{}; // Test disk discovery explicitly against isolated fixtures.
   await plugin.onload();if(plugin._mobileScanTimer)clearTimeout(plugin._mobileScanTimer);
   return plugin;
 };
 await start(p);
 return {p,base,abs,adapter,files,workspaceEvents,layouts,saved:()=>saved,restart:async()=>{const next=new P(app);next.loadData=p.loadData;next.saveData=p.saveData;return start(next);},write:async(p,s)=>{await fs.promises.mkdir(path.dirname(abs(p)),{recursive:true});await fs.promises.writeFile(abs(p),s);}};
}
async function publish(h){
 const q=await h.p.engine.previewUpload();assert.equal(q.errors.length,0);assert.equal(q.catalogWarnings.length,0);
 const native=h.p===undefined?null:h.p.engine.safeUpload?await h.p.engine.safeUpload({selectedPaths:q.ready.map(x=>x.path),expectedFingerprint:q.fingerprint}):await h.p.engine.safeExport(q,{allowInitial:true});
 const result=await h.p.finalizeConfirmedUpload(native),rec=h.p.data.bundleRecords.at(-1);assert(rec.stored.path.startsWith('VaultRelay-Transfer/outgoing/'));assert(await h.adapter.exists(rec.stored.path));
 const work=(await h.adapter.list('VaultRelay-Transfer/outbox')).files;assert.equal(work.filter(x=>/\.zip$/.test(x)).length,0);
 return {rec,bytes:await h.adapter.readBinary(rec.stored.path),result};
}
async function receive(h,packet,confirm=true){
 const f={name:packet.rec.name,size:packet.bytes.length,arrayBuffer:async()=>packet.bytes};
 const reviewed=await h.p.storeDownloadedZip(f);await h.p.applyDownloaded(reviewed);
 if(!confirm)return reviewed;
 if(reviewed.v611AlreadyProcessed){
   const inboxPath='VaultRelay-Transfer/inbox/'+packet.rec.name;
   assert(await h.adapter.exists(inboxPath),'Duplicate must remain before explicit confirmation');
   const settled=new Date(Date.now()-6000);fs.utimesSync(h.abs(inboxPath),settled,settled);
   const row=(await h.p.v604PrepareInbox()).find(x=>x.path===inboxPath);
   assert.equal(row?.state,'duplicate',row?.reason);
   await h.p.v611ConfirmInboxCleanup(row);
   assert(!await h.adapter.exists(inboxPath),'Explicit duplicate cleanup should remove that copy');
   return reviewed;
 }
 const q=await h.p.engine.latestPlan();
 const result=h.p.engine.applyPlan?await h.p.engine.applyPlan(q,{allowDeletes:true}):await h.p.engine.safeApply(q,{allowDeletes:true});
 assert.deepEqual(result.errors,[]);await h.p.registerUndoFromNative(result,q,'隔离集成确认');
 await h.p.v5217CleanupIncoming();
 assert(!await h.adapter.exists('VaultRelay-Transfer/inbox/'+packet.rec.name),'Confirmed inbox original should clean');
 return reviewed;
}
async function main(){
 const a=await host(Windows,A,'Windows'),b=await host(Mobile,B,'Android');
 assert.equal(a.p.data.deviceId,A);assert.equal(a.p.engine.state.deviceId,A);assert.equal(a.p.data.desktopTransportEnabled,false);
 await a.write('Notes/Meeting.md','Monday\n');
 const p1=await publish(a);checks.push('Real Windows core generates native ZIP, verified outgoing carrier and clears only outbox work ZIP');
 const zipTools=Windows.__testing.tools,entries=zipTools.zipDecode(p1.bytes);
 const manifest=JSON.parse(Buffer.from(entries.get('manifest.json')).toString('utf8'));
 const legacyName='ack/old-test-feedback.json',legacyAck=Buffer.from('{}');
 manifest.files.push({path:legacyName,bytes:legacyAck.length,sha256:await zipTools.sha256(legacyAck)});
 entries.set(legacyName,legacyAck);entries.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
 const legacyZip=zipTools.zipEncode([...entries].map(([name,data])=>({name,data})));
 for(const target of [a,b]){
   await assert.rejects(target.p.v601ValidateReceivedPackage(p1.rec.name,legacyZip),/旧版 ACK/);
   await assert.rejects(target.p.importRawAckFile({arrayBuffer:async()=>{throw Error('旧文件不应被读取');}}),/旧版 ACK/);
   assert(!await target.adapter.exists('VaultRelay-Transfer/inbox/'+p1.rec.name));
 }
 const queued=await host(Windows,A,'Windows queued legacy upgrade');
 const mirror=fs.mkdtempSync(path.join(results,'mirror-'));
 const retiredName=p1.rec.name.replace(/[0-9a-f](?=\.zip$)/,c=>c==='a'?'b':'a');
 const standaloneName=p1.rec.name.replace(/^VR-[^-]+/,'ack-Win1Red1').replace(/\.zip$/,'.json');
 for(const [name,bytes] of [[retiredName,legacyZip],[standaloneName,legacyAck],[p1.rec.name,p1.bytes]]){
   const outgoing='VaultRelay-Transfer/outgoing/'+name;
   await queued.write(outgoing,bytes);
   queued.p.data.pendingOutboundFiles[name]={name,path:outgoing,sha256:sha(bytes)};
 }
 queued.p.cloudConfig=()=>({cloud:mirror});
 queued.p.data.desktopTransportEnabled=true;
 assert.equal((await queued.p.flushQueuedOutbound()).published,1);
 assert.deepEqual(fs.readdirSync(mirror),[p1.rec.name]);
 assert(await queued.adapter.exists('VaultRelay-Transfer/outgoing/'+retiredName));
 assert(await queued.adapter.exists('VaultRelay-Transfer/outgoing/'+standaloneName));
 checks.push('Retired ACK files and ACK-bearing ZIPs cannot be received or republished, and fresh ZIPs still send');
 const staged=await receive(b,p1,false);assert(!await b.adapter.exists('Notes/Meeting.md'));
 assert(await b.adapter.exists('VaultRelay-Transfer/inbox/'+p1.rec.name));
 const assertNoAck=h=>{
   assert.equal(Object.keys(h.p.v5218ContentAckState().generated).length,0);
   assert(!h.files().some(x=>/(?:^|\/)ack-[^/]+\.json$/i.test(x.path)));
 };
 assertNoAck(b);checks.push('Verified receipt leaves note untouched and creates no ACK file');
 await receive(b,p1);assert.equal(fs.readFileSync(b.abs('Notes/Meeting.md'),'utf8'),'Monday\n');
 assertNoAck(b);assert.equal(b.p.data.inboundRecords[0].stagingState,'cleaned');
 await receive(b,p1);assertNoAck(b);checks.push('Confirm and repeat still clean inbox without generating ACK');
 await b.write('Notes/Phone.md','from phone\n');const p2=await publish(b);
 assert.equal((await b.adapter.list('VaultRelay-Transfer/outbox')).files.length,0);
 const reply=Windows.__testing.tools.zipDecode(p2.bytes);
 assert(![...reply.keys()].some(name=>name.startsWith('ack/')));
 await receive(a,p2);
 const paired=(await a.p.v5218PackageRows()).packages.find(x=>x.record.sha256===p1.rec.sha256);
 assert.equal(paired.matches.length,0);assert.equal(paired.inventoryReceipts[0][1].state,'processed');
 assertNoAck(a);b.p=await b.restart();assertNoAck(b);
 checks.push('Reply pairs through sync and restart never creates a work JSON');
 await a.write('Notes/Meeting.md','Tuesday\n');const p3=await publish(a);await receive(b,p3);
 assert.equal(fs.readFileSync(b.abs('Notes/Meeting.md'),'utf8'),'Tuesday\n');
 const bb=b.files().filter(x=>x.path.startsWith('VaultRelay-Transfer/recovery/backups/'));
 assert.equal(bb.length,1);assert.equal(fs.readFileSync(b.abs(bb[0].path),'utf8'),'Monday\n');
 const undo=b.p.data.undoOperations.find(x=>x.items.some(y=>y.path==='Notes/Meeting.md'&&y.action==='safe-update'));
 assert.equal(undo.items.find(x=>x.path==='Notes/Meeting.md').backupPath,bb[0].path);await b.p.previewUndo(undo.id);
 checks.push('Mobile update keeps exactly one original backup and undo directly references verified original');
 await b.write('Notes/Phone.md','phone revision\n');const p4=await publish(b);await receive(a,p4);
 const ba=a.files().filter(x=>x.path.startsWith('VaultRelay-Transfer/recovery/backups/'));
 assert.equal(ba.length,1);assert.equal(fs.readFileSync(a.abs(ba[0].path),'utf8'),'from phone\n');
 assert(!fs.existsSync(a.abs('.obsidian/plugins/vault-relay-info-lab/v2-safety-backups')));
 const au=a.p.data.undoOperations.find(x=>x.items.some(y=>y.path==='Notes/Phone.md'&&y.action==='safe-update'));await a.p.previewUndo(au.id);
 checks.push('Windows update creates one backup in recovery/backups; no legacy plugin folder or journal duplicate');
 await a.adapter.remove('Notes/Meeting.md');const dq=await a.p.engine.previewUpload();
 assert(dq.deletions.some(x=>x.path==='Notes/Meeting.md'));
 const dn=await a.p.engine.safeUpload({onlyDeletions:true,allowDeletes:true,selectedPaths:['Notes/Meeting.md'],expectedFingerprint:dq.fingerprint});
 await a.p.finalizeConfirmedUpload(dn);const dr=a.p.data.bundleRecords.at(-1),dp={rec:dr,bytes:await a.adapter.readBinary(dr.stored.path)};
 await receive(b,dp);assert(!await b.adapter.exists('Notes/Meeting.md'));checks.push('Explicit deletion version imports only after confirmation, creates backup and cleans inbox/staging');
 const conflict=await host(Mobile,A,'ContentCompare');await conflict.write('Notes/Phone.md','local divergent body');await receive(conflict,p2,false);
 const cq=await conflict.p.engine.latestPlan();assert(cq.items.some(x=>x.status==='conflict'&&x.path==='Notes/Phone.md'));
 assert.equal(fs.readFileSync(conflict.abs('Notes/Phone.md'),'utf8'),'local divergent body');
 assert(conflict.files().some(x=>x.path.startsWith('VaultRelay-Transfer/inbox/')&&x.path.endsWith('.zip')));assertNoAck(conflict);
 checks.push('Unrelated local edits produce a conflict without rewriting notes or generating ACK');
 const nativeEntry=Windows.__testing.tools.zipDecode(p1.bytes),nativeRole=[...nativeEntry.keys()].find(x=>x.startsWith('content/')),work='VaultRelay-Transfer/outbox/'+nativeRole.slice(8);
 await a.write(work,Buffer.from('changed work file'));await assert.rejects(a.p.v601CleanPackWork(p1.rec),/变化/);assert.equal(fs.readFileSync(a.abs(work),'utf8'),'changed work file');
 checks.push('Changed work bytes are retained, even when carrier itself is valid');
 fs.writeFileSync(path.join(results,'fixtures.json'),JSON.stringify({windows:a.base,mobile:b.base,conflict:conflict.base},null,2));
}
module.exports={host,publish,receive,Windows,Mobile,IOS,group,A,B,sha,results};
if(require.main===module)main().then(()=>{fs.writeFileSync(path.join(results,'integration.json'),JSON.stringify({status:'PASS',scope:'Actual production Windows/mobile engine modules with isolated filesystem and mocked Obsidian host; no devices installed',checks},null,2));console.log('PASS '+checks.length+' integration groups');}).catch(e=>{console.error(e);process.exitCode=1;});

