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
 put(root+'test3/',name);put(root+'outgoing/backup/',name);
 p.getMobileDownloadEntries=async uri=>{const key=decodeURIComponent(new URL(uri).pathname);visited.add(key);return [...(tree.get(key)?.values()||[])];};
 p.readMobileDownloadEntry=()=>{throw Error('Unbound directory scans must not read ZIP bodies');};
 const panel=testPanel(Mobile,phone);
 const result=await p.vr713ScanDownloads({full:true});
 assert.deepEqual(result.source.files.map(f=>decodeURIComponent(new URL(f.path).pathname)),[root+'test3/'+name]);
 assert(![...visited].some(dir=>dir.includes('/outgoing/')));
 assert(!p.data.groupId);assert(!await phone.adapter.exists('Fresh.md'));
 await panel.refreshDownloadReview({desktopFull:true});
 let modal=p._v5216ScanModal;
 assert(modal.heading.textContent==='审核与确认导入'&&modal.groupHint.textContent.includes('可导入 0'));
 assert(modal.value.files.some(f=>f.name===name));
 modal.selected.add(modal.value.files[0].path);modal.refresh();
 await modal.review.click();assert(!p.engine&&!p._vrReviewModal);
 modal.close();
 const Element=panel.modalEl.constructor;
 Element.prototype.replaceChildren=function(...nodes){this.empty();for(const node of nodes)this.append(node);};
 p.v5217RenderLocation=()=>{};
 global.document={visibilityState:'visible',createElement:tag=>Object.assign(new Element(tag),{dataset:{}})};
 visited.clear();const list=panel.showLocalFiles();
 for(let n=0;n<300&&!list.contentEl.textContent.includes(name);n++)await new Promise(r=>setTimeout(r,10));
 assert(list.contentEl.textContent.includes(name)); assert(![...visited].some(dir=>dir.includes('/outgoing/')));list.close();delete global.document;
 const tab=await host(IOS,null,'Fresh iPad',{}),local='VaultRelay-Transfer/Dbox/'+name;
 await tab.adapter.mkdir('VaultRelay-Transfer/Dbox');await tab.adapter.writeBinary(local,packet.bytes);
 await testPanel(IOS,tab).searchDownloadZips();modal=tab.p._v5216ScanModal;
 assert(modal.value.files.some(f=>f.path===local));assert(await tab.adapter.exists(local));modal.close();
 const win=await host(Windows,null,'Fresh Windows',{}),dir=fs.mkdtempSync(path.join(__dirname,'vr-download-8-'));
 const input=path.join(dir,name);fs.writeFileSync(input,packet.bytes);
 const old=new Date(Date.now()-10000);fs.utimesSync(input,old,old);win.p.data.windowsDownloadDir=dir;
 try{const scanned=await win.p.vr713ScanDownloads();assert(scanned.source.files.some(f=>f.path===input));assert(fs.existsSync(input));assert(!win.p.engine);}finally{fs.unlinkSync(input);fs.rmdirSync(dir);}
 await p.joinGroup(group);
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
 console.log('PASS 8.0 unbound Android/Windows/iPad discovery, Android download list, original ZIP preservation, normal import and multi-device trust management');
})().catch(e=>{console.error(e);process.exitCode=1;});
