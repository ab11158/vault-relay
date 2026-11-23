const assert=require('node:assert/strict');
const fs=require('node:fs');
const {host,publish,receive,Windows,IOS,A,B,sha}=require('./test-flow.cjs');
const inbox='VaultRelay-Transfer/inbox/';
const trash='VaultRelay-Transfer/recovery/quarantine';
const settle=(h,rel)=>{const time=new Date(Date.now()-9000);fs.utimesSync(h.abs(rel),time,time);};
const bytes=n=>Buffer.alloc(n,5);
const actions=(h,rows,refresh)=>{
  const Panel=h.p.constructor.__testing.panel;
  const panel=new Panel(h.p.app,h.p);
  const modal={p:h.p,contentEl:panel.contentEl,refresh};
  h.p._v604InboxRows=rows;
  h.p.constructor.__testing.v604.renderQueue(modal);
  return modal.contentEl.querySelectorAll('button');
};
const click=(buttons,text)=>{
  const button=buttons.find(entry=>entry.textContent===text);
  assert(button,'missing UI button: '+text);
  return button.click();
};

async function missingReceipt(sender,receiver,packet){
  const initial=await receive(receiver,packet,false);
  const path=initial.temporary;
  assert(path.startsWith(inbox));
  await receiver.adapter.remove(path);
  const rows=await receiver.p.v604PrepareInbox();
  const missing=rows.find(row=>row.name===packet.rec.name);
  assert.equal(missing?.state,'missing');
  assert(receiver.p.v605HasPending());
  const buttons=actions(receiver,[missing],()=>receiver.p.v604PrepareInbox());
  assert(!buttons.some(button=>button.textContent==='删除异常 ZIP'||button.textContent==='移动至回收站'));
  await click(buttons,'清除异常记录');
  assert(!receiver.p._v604InboxRows.some(row=>row.name===packet.rec.name));
  assert(!receiver.p.v605HasPending());
  assert(!await receiver.adapter.exists('Missing ZIP.md'));
  assert(!(await receiver.adapter.list(trash)).files.length);
  receiver.p=await receiver.restart();
  assert(!(await receiver.p.v604PrepareInbox()).some(row=>row.name===packet.rec.name));
  assert(!receiver.p.v605HasPending());
  const receipt=await receiver.p.v614ReceiveZip({
    name:packet.rec.name.replace(/\.zip$/,' 2.zip'),arrayBuffer:async()=>packet.bytes
  });
  assert(await receiver.adapter.exists(receipt.path));
  assert((await receiver.p.v604PrepareInbox()).some(row=>row.name===packet.rec.name&&row.state==='pending'));
  assert(receiver.p.v605HasPending());
  assert(!await receiver.adapter.exists('Missing ZIP.md'));
}

async function presentFiles(receiver,packet){
  const path=inbox+packet.rec.name;
  const invalid=bytes(53);
  await receiver.adapter.writeBinary(path,invalid);
  settle(receiver,path);
  const rows=await receiver.p.v604PrepareInbox();
  assert.equal(rows.filter(row=>row.name===packet.rec.name).length,1,'invalid replacement must not also appear as pending');
  const invalidRow=rows.find(row=>row.name===packet.rec.name);
  assert.equal(invalidRow?.state,'error');
  await click(actions(receiver,[invalidRow],()=>receiver.p.v604PrepareInbox()),'移动至回收站');
  assert(!await receiver.adapter.exists(path));
  assert(!receiver.p._v604InboxRows.some(row=>row.name===packet.rec.name));
  assert(!receiver.p.v605HasPending());
  const recycled=(await receiver.adapter.list(trash)).files;
  assert.equal(recycled.length,1);
  assert.equal(sha(await receiver.adapter.readBinary(recycled[0])),sha(invalid));

  const short=inbox+packet.rec.name.replace(/\.zip$/,' 9.zip');
  await receiver.adapter.writeBinary(short,bytes(8));
  settle(receiver,short);
  const shortRow=(await receiver.p.v604PrepareInbox()).find(row=>row.path===short);
  assert.equal(shortRow?.state,'error');
  await receiver.adapter.writeBinary(short,packet.bytes);
  await assert.rejects(receiver.p.v605MoveInboxError(shortRow,'delete'),/文件已变化/);
  assert(await receiver.adapter.exists(short));
  await receiver.adapter.writeBinary(short,bytes(8));
  settle(receiver,short);
  const updated=(await receiver.p.v604PrepareInbox()).find(row=>row.path===short);
  await click(actions(receiver,[updated],()=>receiver.p.v604PrepareInbox()),'删除异常 ZIP');
  assert(!await receiver.adapter.exists(short));
  assert(!receiver.p._v604InboxRows.some(row=>row.path===short));
  assert(!await receiver.adapter.exists('Missing ZIP.md'));
}

(async()=>{
  const sender=await host(Windows,A,'Win1');
  await sender.write('Missing ZIP.md','确认前不写入');
  const packet=await publish(sender);
  for(const [runtime,name] of [[Windows,'Win2'],[IOS,'Ios1']]){
    const receiver=await host(runtime,B,name);
    await missingReceipt(sender,receiver,packet);
    await presentFiles(receiver,packet);
  }
  console.log('PASS missing receipt dismissal, re-receipt, safe delete, and byte-verified quarantine (Windows / iOS)');
})().catch(error=>{console.error(error);process.exitCode=1;});
