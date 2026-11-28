'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {host,publish,receive,Windows,Mobile,A,B,results}=require('./test-flow.cjs');
const exact=(el,tag,text)=>el.querySelectorAll(tag).find(x=>x.textContent===text);
const button=(modal,title)=>{const el=exact(modal.contentEl,'button',title);assert(el,'Missing '+title);return el;};
const settled=async test=>{for(let i=0;i<500;i++){if(test())return;await new Promise(resolve=>setTimeout(resolve,10));}assert(test(),'UI did not update');};
const click=async el=>{assert(!el.disabled&&!el.hidden);await el.handlers.click({preventDefault(){},stopPropagation(){}});};
const set=(el,value)=>{el.checked=value;el.handlers.change();};
async function reviewSamePathVersions(){
  const source=await host(Windows,A,'Review layout sender'),target=await host(Mobile,B,'Review layout receiver');
  const note='8.0-互测.md',other='欢迎.md';
  await source.write(note,'Base');await receive(target,await publish(source));
  await source.write(note,'Second version');const older=await publish(source);await receive(target,older,false);
  await source.write(note,'Third version');await source.write(other,'New note');
  const newer=await publish(source);await receive(target,newer,false);
  target.p.openCoreUi('download');
  const modal=target.p.app.openedModals.at(-1);
  await target.p._v602ReviewReady;
  await click(button(modal,'全选'));
  await click(button(modal,'刷新'));
  await settled(()=>exact(modal.contentEl,'button','全部差异 3'));
  const sections=()=>modal.contentEl.querySelectorAll('.vr607-review-section');
  const ofNote=()=>sections().find(section=>section.querySelector('.vr607-file-title').textContent===note);
  const check=section=>section.querySelector('.vr607-file-title').querySelector('input');
  const occurrences=(text,value)=>text.split(value).length-1;
  assert.equal(sections().length,2);
  let section=ofNote();
  assert.equal(occurrences(section.textContent,note),1);
  assert(check(section).checked);
  const details=section.querySelectorAll('.vr607-review-detail');
  assert.equal(details.length,2);
  assert.deepEqual(details.map(detail=>detail.querySelector('summary').textContent),['详细内容','同路径的其他版本 · 请核对版本关系']);
  assert(details.every(detail=>!detail.open&&detail.parentNode===section));
  assert(details[0].textContent.includes(newer.rec.name));
  assert(details[1].textContent.includes(older.rec.name));
  assert(exact(details[1],'button','查看差异'));
  await click(button(modal,'待处理 1'));
  assert.equal(sections().length,1);
  section=ofNote();assert.equal(occurrences(section.textContent,note),1);
  set(check(section),true);
  await click(button(modal,'全部差异 3'));
  await click(button(modal,'预览确认处理（2）'));
  assert(exact(target.p.app.openedModals.at(-1).contentEl,'button','确认处理'));
}
async function run(){
  for(const [fromType,toType,sourceId,toId] of [[Windows,Mobile,A,B],[Mobile,Windows,B,A]]){
    const source=await host(fromType,sourceId,'Source'),target=await host(toType,toId,'Target');
    await source.write('a.md','a');await source.write('b.md','b');
    await target.write('c.md','c');
    const packet=await publish(source);
    await receive(target,packet,false);
    target.p.openCoreUi('download');const modal=target.p.app.openedModals.at(-1);
    try{await target.p._v602ReviewReady;}catch(error){throw Error(modal.contentEl.textContent,{cause:error});}
    const send=()=>button(modal,'生成本地增量包并上传');
    await settled(()=>exact(modal.contentEl,'button','本机独有 1'));
    assert.equal(send().disabled,true);
    const findCheck=filename=>exact(modal.contentEl,'label',filename)?.children.find(x=>x.tag==='input');
    assert(findCheck('a.md').checked);set(findCheck('b.md'),false);
    await click(button(modal,'预览确认处理（1）'));
    await click(button(target.p.app.openedModals.at(-1),'确认处理'));
    await settled(()=>button(modal,'预览确认处理（1）')&&!target.p.engine.busy);
    assert(await target.adapter.exists('a.md'));assert(!await target.adapter.exists('b.md'));
    await click(button(modal,'预览确认处理（1）'));
    await click(button(target.p.app.openedModals.at(-1),'确认处理'));
    await settled(()=>exact(modal.contentEl,'button','本机独有 1'));
    assert(!target.p.v605HasPending());
    await click(button(modal,'本机独有 1'));
    set(findCheck('c.md'),true);
    await click(send());
    const panel=toType.__testing.panel.prototype;
    const oldUpload=panel.openUploadBrowser,oldBrowse=panel.openSyncSpaceBrowser;
    let uploads=0,browses=0;
    panel.openUploadBrowser=()=>{uploads++;};panel.openSyncSpaceBrowser=()=>{browses++;};
    try{
      await click(button(target.p.app.openedModals.at(-1),'生成并打开上传页'));
      assert.equal(uploads,1);
      assert.deepEqual(target.p.data.bundleRecords.at(-1).versions.map(x=>x.path),['c.md']);
      assert(await target.adapter.exists('b.md'));
      const pack=target.p.data.bundleRecords.at(-1);
      const archive=toType.__testing.tools.zipDecode(await target.adapter.readBinary(pack.stored.path));
      const peer=JSON.parse(Buffer.from(archive.get('sync-inventory.json')).toString('utf8'));
      await source.write('d.md','local comparison');
      const sourcePanel=fromType.__testing.panel.prototype,oldSourceUpload=sourcePanel.openUploadBrowser;
      let comparedUploads=0;sourcePanel.openUploadBrowser=()=>{comparedUploads++;};
      try{
        new fromType.__testing.panel(source.p.app,source.p).showV606Comparison(peer);
        const compared=source.p.app.openedModals.at(-1);await compared.opened;
        assert(compared.contentEl.textContent.includes('本机 '+(fromType===Windows?'Win1 · 对端 Red1':'Red1 · 对端 Win1')));
        assert(!compared.contentEl.textContent.includes('本机 Source'));
        assert(!compared.contentEl.textContent.includes('a.md'));
        assert(compared.contentEl.textContent.includes('请从对端发送'));
        const primary=button(compared,'生成增量包并上传百度网盘');
        assert(primary.disabled);
        const local=exact(compared.contentEl,'label','d.md').children.find(x=>x.tag==='input');
        set(local,true);await click(primary);
        await click(button(source.p.app.openedModals.at(-1),'生成并打开上传页'));
        assert.equal(comparedUploads,1);
        assert.deepEqual(source.p.data.bundleRecords.at(-1).versions.map(x=>x.path),['d.md']);
      }finally{sourcePanel.openUploadBrowser=oldSourceUpload;}
    }finally{panel.openUploadBrowser=oldUpload;panel.openSyncSpaceBrowser=oldBrowse;}
  }
  const checks=['双端审核弹窗支持部分导入，全部导入后保留本次清单及回传入口，两个按钮分别调用现有网盘入口','双端知识库比对弹窗隐藏一致文件，勾选后确认只发布所选笔记并调用现有上传入口'];
  fs.writeFileSync(path.join(results,'ui.json'),JSON.stringify({status:'PASS',checks},null,2)+'\n');
  await reviewSamePathVersions();
  console.log('PASS '+checks.length+' native dialog groups and same-path review layout');
}
run().catch(error=>{console.error(error);process.exitCode=1;});




