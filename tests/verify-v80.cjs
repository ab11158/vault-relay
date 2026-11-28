'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {host,publish,receive,Windows,Mobile,IOS,A,B,group}=require('./test-flow.cjs');
const button=(modal,label)=>modal.contentEl.querySelectorAll('button').find(x=>x.textContent===label);
const testPanel=(Type,h)=>new Type.__testing.panel(h.p.app,h.p);
(async()=>{
 const sender=await host(Windows,A,'8.0 sender');
 await sender.write('Fresh.md','free sync');
 const packet=await publish(sender),name=packet.rec.name;
 const phone=await host(Mobile,null,'Fresh Android',{}),p=phone.p;
 const root='/storage/emulated/0/Download/BaiduNetdisk/_pcs_.workspace/00Obsidian/VaultRelay-Transfer/';
 const shared='/storage/emulated/0/';
 const dl=shared+'Download/DLManager/',learned=shared+'Documents/My downloads/';
 const denied=shared+'Android/data/',deep=root+'test3/'+Array(12).fill('child').join('/')+'/';
 const tree=new Map(),visited=new Set();
 function put(dir,filename){
   let parent='/';
   for(const segment of dir.split('/').filter(Boolean)){
     if(!tree.has(parent))tree.set(parent,new Map());
     tree.get(parent).set(segment,{name:segment,isDirectory:true});parent+=segment+'/';
   }
   if(!tree.has(parent))tree.set(parent,new Map());
   tree.get(parent).set(filename,{name:filename,isFile:true});
 }
 for(let i=0;i<1610;i++)put(shared+'Download/BaiduNetdisk/','other-'+i+'.txt');
 put(root+'test3/',name);put(root+'outgoing/backup/',name);
 put(dl,name);put(learned,name);put(deep,name);put(denied,name);
 p.data.v5218DirectoryRank={[group]:{[learned]:{count:1}}};
 const paths=files=>files.map(f=>decodeURIComponent(new URL(f.path).pathname)).sort();
 const lightPaths=[dl+name,learned+name].sort(),fullPaths=[...lightPaths,root+'test3/'+name,deep+name].sort();
 p.mobileCapacitorFilesystem=()=>({
   readdir:async ({path})=>{
     const dir=decodeURIComponent(path.replace(/^file:\/\//,'')).replace(/\/$/,'')+'/';
     visited.add(dir);
     if(dir===denied)throw Error('Simulated Android permission denial');
     return {files:[...(tree.get(dir)?.keys()||[])]};
   },
   stat:async ({path})=>{
     const file=decodeURIComponent(path.replace(/^file:\/\//,'')),i=file.lastIndexOf('/');
     const entry=tree.get(file.slice(0,i+1))?.get(file.slice(i+1));
     if(!entry)throw Error('Missing test entry '+file);
     return {type:entry.isDirectory?'directory':'file',size:packet.bytes.length};
   },
   readFile:()=>{throw Error('Unbound directory scans must not read ZIP bodies');}
 });
 let metadataReads=0;
 p.readMobileDownloadEntry=async()=>{metadataReads++;return {pending:true};};
 const panel=testPanel(Mobile,phone);
 const Element=panel.modalEl.constructor;
 Element.prototype.replaceChildren=function(...nodes){this.empty();for(const node of nodes)this.append(node);};
 p.v5217RenderLocation=()=>{};
 global.document={visibilityState:'visible',createElement:tag=>Object.assign(new Element(tag),{dataset:{}})};
 p._vrControlPanel=panel;
 const scanned=[];
 const scan=p.vr713ScanDownloads.bind(p);
 p.vr713ScanDownloads=async options=>{
   visited.clear();
   const results=await scan(options);
   scanned.push({options,results,dirs:[...visited].sort()});
   return results;
 };
 async function checkEntries(joined,expected){
   const all=[];
   for(const label of ['④ 扫描下载的增量包','⑤ 审核与确认导入','手动查找／选择 ZIP']){
     panel.render();
     const i=scanned.length;
     const entry=button(panel,label);
     assert(entry&&!entry.disabled,label);
     await entry.click();
     const dialog=joined&&!label.startsWith('手动')?p._vrReviewModal:p._v5216ScanModal;
     assert(dialog,label);
     assert.equal(scanned.length,i+1);
     assert.deepEqual(paths(scanned[i].results.source.files),lightPaths,label);
     assert(!scanned[i].dirs.includes(root+'test3/'),label);
     await button(dialog,'全盘扫描').click();
     assert.equal(scanned.length,i+2);
     assert.deepEqual(paths(scanned[i+1].results.source.files),fullPaths,label);
     assert.equal(scanned[i+1].results.source.pendingDirs,0);
     assert(scanned[i+1].dirs.includes(denied));
     assert(scanned[i+1].results.source.unreadableDirs>0);
     assert(!scanned[i+1].dirs.some(dir=>dir.includes('/outgoing/')));
     const coverage=[scanned[i].dirs,scanned[i+1].dirs];
     if(expected)assert.deepEqual(coverage,expected[all.length],label);
     all.push(coverage);
     if(!joined){
       assert(dialog.value.files.some(f=>f.path.endsWith('/test3/'+name)));
       if(!label.startsWith('手动'))assert(dialog.heading.textContent==='审核与确认导入'&&dialog.groupHint.textContent.includes('可导入 0'));
       dialog.selected.add(dialog.value.files[0].path);dialog.refresh();
       await dialog.review.click();assert(!p.engine&&!p._vrReviewModal);
     }
     dialog.close();
   }
   return all;
 }
 const unboundCoverage=await checkEntries(false);
 assert.equal(metadataReads,0);assert(!p.data.groupId);
 assert(!await phone.adapter.exists('VaultRelay-Transfer/inbox/'+name));
 assert(!await phone.adapter.exists('Fresh.md'));
 visited.clear();const list=panel.showLocalFiles();
 for(let n=0;n<300&&!list.contentEl.textContent.includes(name);n++)await new Promise(r=>setTimeout(r,10));
 assert(list.contentEl.textContent.includes(name));assert(visited.has(dl)&&visited.has(deep));
 assert(![...visited].some(dir=>dir.includes('/outgoing/')));list.close();
 await p.joinGroup(group);
 await checkEntries(true,unboundCoverage);
 assert(metadataReads>0);
 assert(!await phone.adapter.exists('Fresh.md'));
 delete global.document;
 let modal;
 const tab=await host(IOS,null,'Fresh iPad',{}),local='VaultRelay-Transfer/Dbox/'+name;
 await tab.adapter.mkdir('VaultRelay-Transfer/Dbox');await tab.adapter.writeBinary(local,packet.bytes);
 await testPanel(IOS,tab).searchDownloadZips();modal=tab.p._v5216ScanModal;
 assert(modal.value.files.some(f=>f.path===local));assert(await tab.adapter.exists(local));modal.close();
 const win=await host(Windows,null,'Fresh Windows',{}),dir=fs.mkdtempSync(path.join(__dirname,'vr-download-8-'));
 const os=require('node:os'),realHome=os.homedir;
 const transfer=path.join(dir,'VaultRelay-Transfer');
 const test3=path.join(transfer,'test3'),outgoing=path.join(transfer,'outgoing');
 fs.mkdirSync(transfer);fs.mkdirSync(test3);fs.mkdirSync(outgoing);
 const input=path.join(dir,name),nested=path.join(test3,name),excluded=path.join(outgoing,name);
 const old=new Date(Date.now()-10000);
 for(const file of [input,nested,excluded]){fs.writeFileSync(file,packet.bytes);fs.utimesSync(file,old,old);}
 win.p.data.windowsDownloadDir=dir;
 win.p.v5213GetDiscovery=async()=>({roots:[dir]});
 os.homedir=()=>dir;
 try{
   const light=await win.p.vr713ScanDownloads(),full=await win.p.vr713ScanDownloads({full:true});
   assert.deepEqual(light.source.files.map(f=>f.path),[input]);
   assert.deepEqual(full.source.files.map(f=>f.path).sort(),[input,nested].sort());
   assert([input,nested,excluded].every(file=>fs.existsSync(file)));assert(!win.p.engine);
   await win.p.joinGroup(group);
   const joined=await win.p.vr713ScanDownloads({full:true});
   assert.equal(joined.source.candidates,2);
   assert(await win.adapter.exists('VaultRelay-Transfer/inbox/'+name));
   assert(fs.existsSync(excluded));assert(!await win.adapter.exists('Fresh.md'));
 }finally{
   os.homedir=realHome;
   for(const file of [input,nested,excluded])if(fs.existsSync(file))fs.unlinkSync(file);
   for(const folder of [test3,outgoing,transfer,dir])fs.rmdirSync(folder);
 }
 await receive(phone,packet);assert.equal(await phone.adapter.read('Fresh.md'),'free sync');
 const receiver=await host(IOS,B,'Device management');
 const seal=IOS.__testing.v70.sealed;
 const a=(await seal.ownKeys(sender.p)).card;
 const c=(await seal.ownKeys((await host(Mobile,'vr-cccccccccccccccc','Other trusted peer')).p)).card;
 for(const card of [a,c])await seal.trust(receiver.p,card,await seal.fingerprint(card));
 const scope=JSON.stringify([group,B]);
 receiver.p.data.v71Devices={[scope]:[{name:'Sender',id:A},{name:'Other',id:c.deviceId}]};
 await receiver.write('Keep.md','keep');
 const privacy=IOS.__testing.v71.settings.open(receiver.p);
 assert(privacy.contentEl.querySelectorAll('.vr71-device-heading').some(x=>x.textContent.includes('已信任')));
 const saved=receiver.p.persistTransport.bind(receiver.p);
 receiver.p.persistTransport=async()=>{throw Error('simulated save failure');};
 await button(privacy,'解绑').click();assert(seal.state(receiver.p).peers[A]);assert.equal(receiver.p.data.v71Devices[scope].length,2);
 receiver.p.persistTransport=saved;
 await button(privacy,'解绑').click();
 assert(!seal.state(receiver.p).peers[A]);assert(seal.state(receiver.p).peers[c.deviceId]);assert.equal(receiver.saved().v71Devices[scope].length,2);
 global.window={confirm:()=>true};
 try{await button(privacy,'删除').click();}finally{delete global.window;}
 assert.deepEqual(receiver.saved().v71Devices[scope].map(row=>row.id),[c.deviceId]);assert.equal(await receiver.adapter.read('Keep.md'),'keep');
 console.log('PASS 8.0 same Android scan coverage before and after joining at all three entry points, large directory and permission denial, Windows and iPad discovery, original ZIP preservation and normal import');
})().catch(e=>{console.error(e);process.exitCode=1;});
