const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {host,publish,receive,Windows,Mobile,IOS,A,B,sha} = require('./test-flow.cjs');
const DBOX='VaultRelay-Transfer/Dbox/';
const IN='VaultRelay-Transfer/inbox/';
const button=(modal,text)=>modal.contentEl.querySelectorAll('button').find(e=>e.textContent===text);
const labelField=(modal,text)=>modal.contentEl.querySelectorAll('label').find(e=>e.textContent.includes(text))?.querySelector('input');
const setDownloaded=async(h,rel,data)=>{
  await h.adapter.writeBinary(rel,data);
  const settled=new Date(Date.now()-3000);
  fs.utimesSync(h.abs(rel),settled,settled);
};
const useDOM=panel=>{ global.document={visibilityState:'visible',createElement:tag=>Object.assign(new panel.modalEl.constructor(tag),{dataset:{}})}; };

async function testCollection(){
  const sender=await host(Windows,A,'Win1');
  await sender.write('Dbox acceptance.md','正式笔记仅在确认后导入');
  const packet=await publish(sender);
  for(const [runtime,device] of [[Windows,'Win2'],[Mobile,'Red1'],[IOS,'Ios1']]){
    const h=await host(runtime,B,device);
    if(runtime===Windows)h.p.v615CollectDesktopDownloads=async()=>{};
    if(runtime===Mobile)h.p.scanMobileDownloadSource=async()=>({state:'completed',paths:[],errors:0});
    assert(await h.adapter.exists(DBOX.slice(0,-1)),'Dbox should be initialized in the transfer directory');
    const name=packet.rec.name.replace(/\.zip$/,' 2.zip');
    await setDownloaded(h,DBOX+name,packet.bytes);
    await setDownloaded(h,DBOX+'ordinary.zip',packet.bytes);
    await setDownloaded(h,DBOX+'ordinary.md',new TextEncoder().encode('普通下载'));
    const panel=new runtime.__testing.panel(h.p.app,h.p);
    useDOM(panel);
    try{
      h.p._vrControlPanel=panel;
      await h.p.v603ConsoleOpened(panel);
      if(h.p._v602ReviewReady)await h.p._v602ReviewReady;
      assert(!await h.adapter.exists(DBOX+name),device+' should move the verified source');
      assert(await h.adapter.exists(DBOX+'ordinary.zip'));
      assert.equal(await h.adapter.read(DBOX+'ordinary.md'),'普通下载');
      const upload=await h.p.engine.previewUpload();
      assert(!upload.ready.some(item=>item.path.startsWith(DBOX)),device+' must exclude browser downloads from note synchronization');
      const files=(await h.adapter.list(IN.slice(0,-1))).files;
      assert.equal(files.filter(file=>file.endsWith('.zip')).length,1,device);
      assert.equal(sha(await h.adapter.readBinary(files.find(file=>file.endsWith('.zip')))),sha(packet.bytes));
      assert(!await h.adapter.exists('Dbox acceptance.md'));
      const review=h.p.app.openedModals.find(m=>Object.hasOwn(m,'_v614ReceiptReview'));
      assert(review,device+' should open the review');
      await button(review,'取消审核').click();
      assert((await h.adapter.list(IN.slice(0,-1))).files.some(file=>file.endsWith('.zip')));
    }finally{delete global.document;}
  }
  const ownName=packet.rec.name.replace(/\.zip$/,' 4.zip');
  await setDownloaded(sender,DBOX+ownName,packet.bytes);
  const own=await sender.p.vrCollectDbox();
  assert.equal(own.acceptedZips.length,1);
  assert(!await sender.adapter.exists(DBOX+ownName));
  assert.equal((await sender.p.v604PrepareInbox()).find(row=>row.path===IN+ownName)?.state,'own');
  assert.equal(await sender.adapter.read('Dbox acceptance.md'),'正式笔记仅在确认后导入');
  const ipad=await host(IOS,B,'Ios1');
  await receive(ipad,packet);
  const acks=JSON.stringify(ipad.p.v5218ContentAckState().generated);
  const duplicate=packet.rec.name.replace(/\.zip$/,' (3).zip');
  await setDownloaded(ipad,DBOX+duplicate,packet.bytes);
  const result=await ipad.p.vrCollectDbox();
  assert.equal(result.acceptedZips.length,1);
  assert(!await ipad.adapter.exists(DBOX+duplicate));
  const rows=await ipad.p.v604PrepareInbox();
  assert.equal(rows.find(x=>x.path===IN+duplicate)?.state,'duplicate');
  assert.equal(JSON.stringify(ipad.p.v5218ContentAckState().generated),acks);
  const corrupt=DBOX+packet.rec.name;
  await setDownloaded(ipad,corrupt,new Uint8Array(45));
  const failed=await ipad.p.vrCollectDbox();
  assert.equal(failed.errors,1);
  assert(await ipad.adapter.exists(corrupt));
  assert(!await ipad.adapter.exists(IN+packet.rec.name));
}

const settingsBox=panel=>panel.contentEl.querySelectorAll('details')
  .find(element=>element.querySelector('summary')?.textContent==='设置与连接检查');

async function testSettings(){
  for(const [runtime,device] of [[Windows,'Win1'],[Mobile,'Red1'],[IOS,'Ios1']]){
    const h=await host(runtime,B,device);
    const panel=new runtime.__testing.panel(h.p.app,h.p);
    useDOM(panel);
    try{
      h.p._vrControlPanel=panel;
      panel.render();
      let view={contentEl:settingsBox(panel)};
      assert(!button(panel,'打开设置向导'));
      assert(!button(panel,'群组设置'));
      assert(button(view,'复制设备 ID'));
      assert(button(view,'复制群组 ID'));
      const deviceId=view.contentEl.querySelectorAll('input').find(x=>x.getAttribute('aria-label')==='本机设备 ID');
      const heading=view.contentEl.querySelectorAll('strong').find(x=>x.textContent==='群组 ID（已绑定）');
      assert.equal(heading.parentNode.children[1],button(view,'解绑群组'));
      assert.equal(deviceId.parentNode.parentNode,labelField(view,'本机简称').parentNode.parentNode);
      const all=[...view.contentEl.querySelectorAll('button')];
      const dbox=button(view,'创建并复制增量 ZIP 的 Dbox 路径（可选）');
      const history=all.find(x=>x.textContent.startsWith('查看增量包记录'));
      const startup=view.contentEl.querySelectorAll('summary').find(x=>x.textContent==='一般设置');
      assert(!startup.parentNode.open);
      assert.equal(startup.parentNode.parentNode,view.contentEl);
      assert(all.indexOf(dbox)<all.indexOf(history));
      if(runtime!==IOS)assert.equal(labelField(view,'下载目录（选填）').parentNode.parentNode,dbox.parentNode.parentNode);
      const name=labelField(view,'本机简称');
      name.value='Dev3';
      await name.handlers.change();
      labelField(view,'共享目录地址').value='/测试上传';
      await button(view,'保存百度网盘同步空间共享目录').click();
      labelField(view,'同步空间下载目录').value='/测试下载';
      await button(view,'保存百度网盘同步空间下载目录').click();
      assert(view.contentEl.textContent.includes(DBOX.slice(0,-1)));
      if(runtime===IOS){
        assert(view.contentEl.textContent.includes('Safari 浏览器'));
        assert(!labelField(view,'下载目录（选填）'));
      }else{
        const browserDir=runtime===Windows?path.join(h.base,'browser'): '/storage/emulated/0/Download/VaultRelay';
        if(runtime===Windows)fs.mkdirSync(browserDir);
        const location=labelField(view,'下载目录（选填）');
        location.value=browserDir;
        await location.handlers.change();
      }
      panel.render();
      view={contentEl:settingsBox(panel)};
      assert.equal(labelField(view,'本机简称').value,'Dev3');
      assert.equal(labelField(view,'共享目录地址').value,'/测试上传');
      assert.equal(labelField(view,'同步空间下载目录').value,'/测试下载');
      if(runtime===Windows)assert(labelField(view,'其他本机下载目录').value.endsWith('browser'));
      if(runtime===Mobile)assert(labelField(view,'其他 Android 下载目录').value.endsWith('/Download/VaultRelay/'));
    }finally{delete global.document;}
  }
}

async function testGroupSetup(){
  let groupId='';
  for(const [runtime,name,deviceId] of [
    [Windows,'Win1',A],[Mobile,'Red1',B],[IOS,'Ios1','vr-'+'c'.repeat(32)]
  ]){
    const h=await host(runtime,deviceId,name,{deviceId});
    await h.write('Existing.md','已有笔记');
    const panel=new runtime.__testing.panel(h.p.app,h.p);
    useDOM(panel);
    try{
      assert.equal(h.p.data.groupId,'');
      h.p._vrControlPanel=panel;
      panel.render();
      let view={contentEl:settingsBox(panel)};
      assert(view.contentEl.open,'first-time group setup is visible');
      assert.equal(button(view,'新建群组').disabled,false);
      assert.equal(button(view,'加入已有群组').disabled,false);
      if(!groupId){
        await button(view,'新建群组').click();
        groupId=h.p.data.groupId;
        assert.match(groupId,/^vg-[a-z0-9]{16,40}$/);
      }else{
        if(runtime===IOS){
          view.contentEl.querySelectorAll('input').find(x=>x.getAttribute('aria-label')==='已有群组的 ID').value='vg-invalid';
          await button(view,'加入已有群组').click();
          assert.equal(h.p.data.groupId,'');
          view={contentEl:settingsBox(panel)};
        }
        view.contentEl.querySelectorAll('input').find(x=>x.getAttribute('aria-label')==='已有群组的 ID').value=' '+groupId+' ';
        await button(view,'加入已有群组').click();
      }
      view={contentEl:settingsBox(panel)};
      assert.equal(h.saved().groupId,groupId);
      assert.equal(h.p.engine.state.groupId,groupId);
      assert.equal(h.p.engine.state.deviceId,deviceId);
      const field=view.contentEl.querySelectorAll('input').find(x=>x.getAttribute('aria-label')==='已绑定的群组 ID');
      assert.equal(field?.value,groupId);
      assert(field.readOnly);
      let copied='';
      panel.copy=async value=>{copied=value;};
      await button(view,'复制群组 ID').click();
      assert.equal(copied,groupId);
      assert(button(view,'新建群组').disabled);
      assert(button(view,'加入已有群组').disabled);
      assert.equal(await h.adapter.read('Existing.md'),'已有笔记');
    }finally{delete global.document;}
  }
}

(async()=>{await testGroupSetup();await testCollection();await testSettings();console.log('PASS one settings section, group setup and Dbox collection across Windows, Android, and iOS');})().catch(error=>{console.error(error);process.exitCode=1;});
