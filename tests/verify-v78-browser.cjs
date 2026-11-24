const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {host,publish,Windows,Mobile,IOS,A,B,group}=require('./test-flow.cjs');
const playwright=require(process.env.VAULT_RELAY_PLAYWRIGHT_MODULE||'playwright');
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const fullSource=fs.readFileSync(__dirname+'/../main.js','utf8'),sizeSource=fullSource.slice(0,fullSource.indexOf('const VR761Vault=')),css=fs.readFileSync(process.env.VR_CHECK_CSS||__dirname+'/../styles.css','utf8');
const wrapper=fullSource.slice(fullSource.indexOf('function VR603Modal(Base){'),fullSource.indexOf("\n'use strict';",fullSource.indexOf('function VR603Modal(Base){')));
assert(fullSource.startsWith(sizeSource),'Browser check must use the production resizing code');
const out=process.env.VAULT_RELAY_UI_OUTPUT||path.join(require('node:os').tmpdir(),'vault-relay-78-browser');fs.mkdirSync(out,{recursive:true});
function serialize(root,bindings){
 const tag=['content','modal'].includes(root.tag)?'div':root.tag,attrs={...root.attrs};
 if(root.classes.size)attrs.class=[...root.classes].join(' ');if(root.className)attrs.class=(attrs.class||'')+' '+root.className;
 for(const key of ['type','value','placeholder'])if(root[key]!==undefined)attrs[key]=root[key];
 for(const key of ['checked','disabled','hidden'])if(root[key])attrs[key]='';
 if(Object.keys(root.handlers).length){attrs['data-control']=bindings.length;attrs['data-events']=Object.keys(root.handlers).join(' ');bindings.push(root);}
 return '<'+tag+' '+Object.entries(attrs).map(([k,v])=>k+'="'+esc(v)+'"').join(' ')+'>'+esc(root.text)+root.children.map(x=>serialize(x,bindings)).join('')+(['input','br','hr'].includes(tag)?'':'</'+tag+'>');
}
function shell(body,dark){return `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
:root{--background-primary:${dark?'#202124':'#fff'};--background-secondary:${dark?'#292a2e':'#f7f7f7'};--background-modifier-border:${dark?'#555':'#ddd'};--text-normal:${dark?'#eee':'#252525'};--text-muted:${dark?'#bbb':'#666'};--text-error:#b22;--interactive-accent:#8860df;--text-on-accent:#fff;--font-ui-small:14px;--font-smallest:12px;--font-ui-medium:16px;--checkbox-size:18px}*{box-sizing:border-box}body{margin:0;font:16px/1.5 'Microsoft YaHei',sans-serif;background:${dark?'#131416':'#ddd'};color:var(--text-normal)}.modal-container{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}.modal{position:relative;background:var(--background-primary);border-radius:12px;width:95vw;max-height:95vh;overflow:hidden}.modal-content{padding:16px;max-height:90vh;overflow:auto}.modal-close-button{position:absolute;right:9px;top:6px;z-index:2;width:28px;height:28px}button,select{font:inherit;max-width:100%;border:1px solid var(--background-modifier-border);border-radius:7px;padding:6px 10px;background:var(--background-secondary);color:inherit;cursor:pointer}button.mod-cta{background:var(--interactive-accent);color:#fff}button:disabled{opacity:.55}p{overflow-wrap:anywhere}h2{font-size:22px;margin:0 0 12px}.setting-item{padding:12px 0;border-top:1px solid var(--background-modifier-border)}[hidden]{display:none!important}
/* Host-style custom checkboxes: automatic width has no intrinsic native size. */
input[type=checkbox]{appearance:none;-webkit-appearance:none;display:inline-block;position:relative;width:var(--checkbox-size);height:var(--checkbox-size);padding:0;border:1px solid #888;border-radius:3px;background:transparent;flex-shrink:0}input[type=checkbox]:checked{border-color:#8860df;background:#8860df}input[type=checkbox]:checked::after{content:'';position:absolute;inset:2px;background:white;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M1 5L4 8L9 1'/%3E%3C/svg%3E")}
${css}</style><body><main class="modal-container"><div class="modal vr761-upload"><button class="modal-close-button" aria-label="关闭">×</button><div class="modal-content">${body}</div></div></main></body></html>`;}
(async()=>{
 const exe=[process.env.VAULT_RELAY_BROWSER_EXECUTABLE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(fs.existsSync);
 const browser=await playwright.chromium.launch({...exe?{executablePath:exe}:{},headless:true});const checks=[];
 try{for(const [Type,name] of [[Windows,'windows'],[Mobile,'android'],[IOS,'ios']]){
   const h=await host(Type,B,name);await h.write('测试/已一致.md','same');await publish(h);await h.write('测试/新增.md','new');await h.write('测试/另一个新增.md','other');
   await h.write('测试/待信任设备.md','restricted');
   h.p.data.v70PrivateNotes={[JSON.stringify([group,h.p.engine.state.deviceId])]:{notes:['测试/待信任设备.md'],devices:{'测试/待信任设备.md':{out:['vr-'+'d'.repeat(32)],in:[]}},attachments:[],links:{}}};
   const modal=new Type.__testing.NativeUi.upload(h.p.app,h.p);await modal.refresh();
   for(const width of (name==='windows'?[761,1100]:[320,390]))for(const dark of [false,true]){
     modal.view='all';modal.render();let bindings=[];const markup=()=>{bindings=[];return serialize(modal.contentEl,bindings);};
     const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1,isMobile:name!=='windows',hasTouch:name!=='windows'});
     await page.route('http://vault-relay.test/**',route=>route.fulfill({contentType:'text/html',body:shell(markup(),dark)}));await page.goto('http://vault-relay.test/');
     await page.addScriptTag({content:sizeSource+'\nwindow.dialogs=VR78Dialogs;'});
     await page.exposeFunction('vrAction',async(id,type,checked,value,shift)=>{const control=bindings[id];control.checked=checked;if(value!==undefined)control.value=value;await control.handlers[type]?.({shiftKey:shift,preventDefault(){},stopPropagation(){}});return markup();});
     await page.evaluate(()=>{
       window.modal={modalEl:document.querySelector('.modal'),contentEl:document.querySelector('.modal-content')};window.dialogs.mount(window.modal);
        for(const kind of ['click','change'])document.addEventListener(kind,async event=>{const control=event.target.closest('[data-control]');if(!control||!control.dataset.events.split(' ').includes(kind))return;
         const html=await window.vrAction(Number(control.dataset.control),kind,control.checked,control.value,event.shiftKey);window.modal.contentEl.innerHTML=html;});
     });
     const measure=()=>page.locator('.vr2-review-item input[type=checkbox]').evaluateAll(inputs=>inputs.map(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {w:r.width,h:r.height,checked:el.checked,disabled:el.disabled,border:parseFloat(s.borderTopWidth),image:s.backgroundImage,opacity:Number(s.opacity)};}));
     let boxes=await measure();assert.equal(boxes.length,4);for(const box of boxes){assert(box.w>=18&&box.h>=18,'Collapsed checkbox: '+JSON.stringify({name,width,dark,box}));assert(box.border>=1);assert.equal(box.image!=='none',box.checked);}
     assert(boxes.some(x=>x.checked&&!x.disabled));assert(boxes.some(x=>x.disabled));
     await page.getByRole('button',{name:'新增 (2)',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.vr2-review-item').length===2);
     const target=page.getByRole('checkbox',{name:'测试/新增.md',exact:true});await target.uncheck();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('label')).find(x=>x.textContent==='测试/新增.md').querySelector('input').checked);
     assert.equal((await measure()).filter(x=>x.checked).length,1);await page.getByRole('checkbox',{name:'测试/新增.md',exact:true}).focus();await page.keyboard.press('Space');
     await page.waitForFunction(()=>Array.from(document.querySelectorAll('label')).find(x=>x.textContent==='测试/新增.md').querySelector('input').checked);
     await page.getByRole('button',{name:'反选',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.vr2-review-filters .vr2-review-meta')?.textContent.startsWith('已勾选 0'));
     boxes=await measure();assert.equal(boxes.filter(x=>x.checked).length,0);await page.getByRole('button',{name:'全选',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.vr2-review-filters .vr2-review-meta')?.textContent.startsWith('已勾选 2'));
     assert.equal(await page.locator('.vr78-dialog-size').count(),0);assert.equal(await page.locator('.vr78-resize').count(),3);
     const start=await page.locator('.modal').boundingBox(),grip=await page.locator('.vr78-resize-corner').boundingBox();
     // Desktop uses real mouse dragging; mobile uses browser-generated touch events.
     const x=grip.x+grip.width/2,y=grip.y+grip.height/2;
     if(name==='windows') {await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-16,y-40,{steps:6});await page.mouse.up();}
     else {const session=await page.context().newCDPSession(page);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let n=1;n<=6;n++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-16*n/6,y:y-40*n/6}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();}
     let rect=await page.locator('.modal').boundingBox();assert(rect.width<=start.width-20,'Width drag failed '+name);assert(Math.abs(rect.height-(start.height-80))<=2,'Height drag failed '+name);
     let preference=await page.evaluate(()=>JSON.parse(localStorage.getItem('vault-relay.dialog-size.v1')));assert(preference.width<92&&preference.height<88);
     // Keyboard access and bounds work on the same edges, with no added header controls.
     await page.locator('.vr78-resize-corner').focus();for(let n=0;n<6;n++)await page.keyboard.press('Shift+ArrowRight');for(let n=0;n<6;n++)await page.keyboard.press('Shift+ArrowDown');
     rect=await page.locator('.modal').boundingBox();assert(Math.abs(rect.width-(width-24))<=1);assert(Math.abs(rect.height-826)<=1);
     await page.getByRole('button',{name:'刷新结果',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.vr2-review-item').length===2);assert.equal(await page.locator('.vr78-resize').count(),3);
     await page.screenshot({path:path.join(out,name+'-'+width+'-'+(dark?'dark':'light')+'.png'),fullPage:true});
     await page.locator('.vr78-resize-bottom').focus();await page.keyboard.press('Shift+ArrowUp');
     preference=await page.evaluate(()=>JSON.parse(localStorage.getItem('vault-relay.dialog-size.v1')));assert.equal(preference.height,90);
     await page.evaluate(()=>{window.dialogs.unmount(window.modal);window.dialogs.mount(window.modal);});rect=await page.locator('.modal').boundingBox();assert(Math.abs(rect.height-743)<=1);
     // Re-evaluate as a new plugin load: size must come from storage rather than memory.
     await page.evaluate(()=>window.dialogs.unmount(window.modal));await page.addScriptTag({content:'window.dialogs=(()=>{'+sizeSource+';return VR78Dialogs;})();'});await page.evaluate(()=>window.dialogs.mount(window.modal));rect=await page.locator('.modal').boundingBox();assert(Math.abs(rect.height-743)<=1);
     const beforeRight=rect;let edge=await page.locator('.vr78-resize-right').boundingBox();await page.mouse.move(edge.x+edge.width/2,edge.y+20);await page.mouse.down();await page.mouse.move(edge.x+edge.width/2-10,edge.y+20,{steps:3});await page.mouse.up();rect=await page.locator('.modal').boundingBox();assert(Math.abs(rect.width-(beforeRight.width-20))<=2);assert.equal(rect.height,beforeRight.height);
     edge=await page.locator('.vr78-resize-bottom').boundingBox();await page.mouse.move(edge.x+20,edge.y+edge.height/2);await page.mouse.down();await page.mouse.move(edge.x+20,edge.y+edge.height/2-10,{steps:3});await page.mouse.up();const afterBottom=await page.locator('.modal').boundingBox();assert.equal(afterBottom.width,rect.width);assert(Math.abs(afterBottom.height-(rect.height-20))<=2);
     await page.setViewportSize({width:width<700?850:650,height:width<700?390:480});const viewport=page.viewportSize();await page.waitForFunction(()=>{const r=document.querySelector('.modal').getBoundingClientRect();return r.width<=innerWidth-23&&r.height<=innerHeight-23;});rect=await page.locator('.modal').boundingBox();assert(rect.width<=viewport.width-23,JSON.stringify({name,rect,viewport}));assert(rect.height<=viewport.height-23);
     await page.evaluate(()=>{window.dialogs.unmount(window.modal);window.dialogs.mount(window.modal);});await page.locator('.vr78-resize-corner').dblclick();preference=await page.evaluate(()=>JSON.parse(localStorage.getItem('vault-relay.dialog-size.v1')));assert.equal(preference.width,92);assert.equal(preference.height,88);
     checks.push({name,width,dark,checkboxes:'PASS',clickAndKeyboard:'PASS',selection:'PASS',dragResize:'PASS',persistence:'PASS',rotation:'PASS',reset:'PASS',headerControls:'NONE'});await page.close();
   }
 }
 // Exercise the production wrapper against real DOM, including async refresh and cleanup.
 const page=await browser.newPage({viewport:{width:1100,height:850}});await page.route('http://vault-relay.test/**',route=>route.fulfill({contentType:'text/html',body:shell('',false)}));await page.goto('http://vault-relay.test/');
 await page.addScriptTag({content:sizeSource+'\nconst VR603={enhanceLists(){}};\n'+wrapper+'\nwindow.Wrapped=VR603Modal(class{constructor(){this.modalEl=document.querySelector(".modal");this.contentEl=document.querySelector(".modal-content");}open(){this.contentEl.textContent="审核";this.onOpen?.();}close(){this.contentEl.textContent="";}});'});
 await page.evaluate(()=>{window.testModal=new window.Wrapped();window.testModal.open();});assert.equal(await page.locator('.vr78-resize').count(),3);
 await page.evaluate(()=>window.testModal.open());assert.equal(await page.locator('.vr78-resize').count(),3);
 await page.evaluate(()=>window.testModal.close());assert.equal(await page.locator('.vr78-resize').count(),0);
 await page.evaluate(()=>window.testModal.open());assert.equal(await page.locator('.vr78-resize').count(),3);
 await page.evaluate(()=>window.testModal.contentEl.replaceChildren());assert.equal(await page.locator('.vr78-resize').count(),3);
 await page.evaluate(()=>{window.testModal.close();window.testModal.onOpen=()=>window.testModal.close();window.testModal.open();});assert.equal(await page.locator('.vr78-resize').count(),0);
 await page.evaluate(()=>{window.testModal.onOpen=()=>{throw Error('Open failed');};try{window.testModal.open();}catch(_){}});assert.equal(await page.locator('.vr78-resize').count(),0);
 await page.evaluate(()=>{delete window.testModal.onOpen;window.testModal.open();const root=document.querySelector('.modal').cloneNode(true);root.querySelectorAll('.vr78-resize').forEach(el=>el.remove());document.querySelector('.modal-container').append(root);window.second={modalEl:root,contentEl:root.querySelector('.modal-content')};VR78Dialogs.mount(window.second);});
 await page.locator('.vr78-resize-corner').first().focus();await page.keyboard.press('ArrowLeft');const widths=await page.locator('.modal').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().width));assert.equal(widths[0],widths[1]);
 await page.evaluate(()=>{window.testModal.close();VR78Dialogs.unmount(window.second);window.second.modalEl.remove();});assert.equal(await page.locator('.vr78-resize').count(),0);
 await page.evaluate(()=>{Object.defineProperty(window,'localStorage',{configurable:true,get(){throw Error('Storage blocked');}});});await page.addScriptTag({content:'window.noStorage=(()=>{'+sizeSource+';return VR78Dialogs;})();'});await page.evaluate(()=>window.noStorage.mount(window.testModal));await page.locator('.vr78-resize-corner').focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('.vr78-resize').count(),3);await page.evaluate(()=>window.noStorage.unmount(window.testModal));
 await page.close();checks.push({modalWrapper:'PASS open, refresh, close, reopen, nested dialogs, no duplicate handles; immediate close and failed open cleanup; unavailable storage'});
 }finally{await browser.close();}
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));console.log('PASS real browser: visible checked / unchecked / disabled controls, click and Space, selection, all-modal sizing, persistence, refresh, rotation, reset and cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
