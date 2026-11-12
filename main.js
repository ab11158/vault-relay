'use strict';
/* Vault Relay V5.2.9 TEST | ACK workflow, readable diagnostics and durable operation results. */
const VR527UI=(()=>{
  function expandable(el){
    if(!el || el.dataset?.vr527Expandable ||
       el.closest?.('.vru-warning,.vru-danger,.vr2-warning,.vr2-summary,.vr527-keep-full'))return;
    if(el.matches?.('.setting-item-description') && /删除|覆盖|回退|确认写入/.test(el.textContent||'')){
      el.classList.add('vr527-keep-full');return;
    }
    el.dataset.vr527Expandable='true';
    el.classList.add('vr527-collapsible');
    el.setAttribute('role','button');el.setAttribute('tabindex','0');
    el.setAttribute('aria-expanded','false');el.title='点击展开或收起完整文字';
    const flip=()=>{
      const expanded=el.classList.toggle('vr527-expanded');
      el.setAttribute('aria-expanded',String(expanded));
    };
    el.addEventListener('click',flip);
    el.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();flip();}
    });
  }
  function enhance(root){
    if(!root?.querySelectorAll)return;
    const selector='.vru-one-line,.vru-ack-file-name,p.vru-meta,p.vru-help,p.vru-path,p.vru-subtitle,.vr2-help,'+
      '.vr2-panel .setting-item-description,.vr2-download .setting-item-description';
    if(root.matches?.(selector))expandable(root);
    for(const el of root.querySelectorAll(selector))expandable(el);
  }
  function observe(plugin){
    if(typeof document==='undefined'||typeof MutationObserver==='undefined')return;
    enhance(document.body);
    const observer=new MutationObserver(changes=>{
      for(const change of changes){
        if(change.target?.nodeType===1 && change.target.closest?.('.modal'))enhance(change.target);
        for(const node of change.addedNodes)if(node.nodeType===1)enhance(node);
      }
    });
    observer.observe(document.body,{childList:true,subtree:true});
    if(typeof plugin.register==='function')plugin.register(()=>observer.disconnect());
    else plugin._vr527TextObserver=observer;
  }
  function normalizeCloudPath(value){
    const raw=String(value||'').trim().replace(/\\/g,'/');
    if(!raw)return '';
    if(!raw.startsWith('/')||raw.length>1000||/[\x00-\x1f\x7f]/.test(raw)||
       raw.split('/').some(x=>x==='.'||x==='..'))throw Error('请填写以 / 开头的网盘目录，不填写网址或 Windows 盘符');
    return '/'+raw.split('/').filter(Boolean).join('/');
  }
  function uploadUrl(value){
    const path=normalizeCloudPath(value);
    return 'https://pan.baidu.com/disk/main#/index?category=all'+(path?'&path='+encodeURIComponent(path):'');
  }
  function ackRows(state){
    const labels={applied:'已正式导入',same:'内容相同，无需重复写入',equivalent:'内容等效',
      conflict:'存在冲突，尚未完成',rejected:'已拒绝导入'};
    const rows=[];
    for(const [kind,ledger] of [['received',state?.receivedAcks],['generated',state?.acks]]){
      for(const ack of Object.values(ledger||{})){
        if(!ack||typeof ack!=='object')continue;
        rows.push({kind,path:ack.path||'（未记录笔记路径）',
          from:ack.fromDeviceId||'未记录',to:ack.toDeviceId||'未记录',
          result:labels[ack.outcome]||('未知结果：'+String(ack.outcome||'未记录')),
          status:kind==='received'?'本机已登记此反馈':'本机已生成；对端是否收到需在对端核对',
          createdAtUtc:ack.createdAtUtc||null,ack});
      }
    }
    return rows.sort((a,b)=>String(b.createdAtUtc||'').localeCompare(String(a.createdAtUtc||'')));
  }
  function formatTime(value){
    if(!value)return '未记录';
    const date=new Date(value);
    return Number.isFinite(date.getTime())?date.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）':String(value);
  }
  return {expandable,enhance,observe,normalizeCloudPath,uploadUrl,ackRows,formatTime};
})();
function loadBridge(){
const module={exports:{}};
'use strict';
/*
 * Vault Relay Transport Bridge v0.2.0 - SAFE TEST BUILD
 * Integrated into Vault Relay V4.0.3. Bundled note engine owns version and conflict decisions.
 * One panel / three-platform outer ZIP transport / checks / persistent logs.
 * Core note comparisons and conflict handling remain with original plugin.
 * No Node/Electron API is loaded on Android or iOS.
 */
const { Plugin, Modal, Notice, Platform } = require('obsidian');

const APP_VERSION = '0.2.0';
const LEGACY_ID = 'vault-relay-info-lab';
const FMT = 'vault-relay-transport-envelope';
const ROLES = ['content', 'info', 'ack'];
const TRANSFER = 'VaultRelay-Transfer';
const MAX_FILES = 120;
const MAX_ITEM_BYTES = 30 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 75 * 1024 * 1024;
const utf8 = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', {fatal:true});

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
}
function platformName() {
  return Platform.isIosApp ? 'iOS' : Platform.isAndroidApp ? 'Android' : 'Windows';
}
function randomHex(count = 12) {
  const a = new Uint8Array(Math.ceil(count / 2));
  crypto.getRandomValues(a);
  return Array.from(a, v => v.toString(16).padStart(2,'0')).join('').slice(0, count);
}
function safeLabel(value) {
  return String(value || 'Vault').replace(/[\x00-\x1f\\\/:*?"<>|]/g,'_')
    .replace(/^\.+/,'').replace(/\s+/g,'_').slice(0,45) || 'Vault';
}
function validGroup(value) {
  return /^vg-[a-z0-9]{16,40}$/.test(String(value || ''));
}
// V4.0.8: transport envelope identity is NOT the native sync-core identity.
// Existing Windows V4 archives may use an older `vr-unified-<hex>` transport
// marker while their nested content/info/ACK devices use `vr-<id>`.
// Admit only these two known outer formats; do NOT relax native/ACK validation.
function validTransportDeviceId(value) {
  return typeof value==='string' && (
    /^vr-[a-z0-9]{16,64}$/.test(value) ||
    /^vr-unified-[a-f0-9]{16,64}$/.test(value)
  );
}
function validShareUrl(value) {
  try {
    const u = new URL(String(value || ''));
    return u.protocol === 'https:' && /(^|\.)pan\.baidu\.com$/.test(u.hostname)
      && u.pathname.startsWith('/s/');
  } catch (_) { return false; }
}
function safeRel(s) {
  if (typeof s !== 'string' || !s || s.length > 500 || s.includes('\\')
      || s.startsWith('/') || /^[A-Za-z]:/.test(s) || /[\x00-\x1f:*?\"<>|]/.test(s))
    return false;
  return s.split('/').every(x => x && x !== '.' && x !== '..'
    && !/[. ]$/.test(x) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x)
    && !['__proto__','constructor','prototype'].includes(x));
}
function safeEntry(s) {
  return safeRel(s) && /^(content|info|ack)\/.+$/.test(s);
}
function asBytes(input) {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}
function hex(bytes) {
  return Array.from(bytes, v => v.toString(16).padStart(2,'0')).join('');
}
async function sha256(input) {
  if (!globalThis.crypto || !crypto.subtle)
    throw Error('当前运行环境缺少 SHA-256 校验能力，已拒绝操作');
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', asBytes(input))));
}
function joinBytes(parts) {
  let n = 0;
  for (const part of parts) n += part.length;
  const out = new Uint8Array(n);
  let i = 0;
  for (const part of parts) { out.set(part,i); i += part.length; }
  return out;
}
let crcTable;
function crc32(u8) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n=0; n<256; n++) {
      let c=n;
      for (let k=0; k<8; k++) c=(c&1)?((c>>>1)^0xedb88320):(c>>>1);
      crcTable[n]=c>>>0;
    }
  }
  let c=0xffffffff;
  for (const v of u8) c=crcTable[(c^v)&255]^(c>>>8);
  return (c^0xffffffff)>>>0;
}

/*
 * Raw ACK transport: the v1.0.0 reference core publishes
 * vaultrelay.ack-batch.v2 JSON. Keep its bytes and filename unchanged.
 * This is a transport precheck; ONLY the running original sync core
 * decides whether an ACK is accepted into its version/receipt history.
 */
const ACK_DEVICE=/^vr-[a-z0-9]{16,64}$/;
const ACK_HASH=/^[a-f0-9]{64}$/;
const ACK_VERSION=/^[a-f0-9]{24,64}:[0-9]{4}$/;
// V5.2.3: human-facing aliases are mandatory before any new transmission.
// External short names are labels only. The native engine always
// stores/checks its original ackbatch-<sha>.json filename and unchanged bytes.
function shortName(value,fallback='Vr1') {
  const v=String(value||'').trim();
  if(/^[A-Za-z]{2,3}[0-9]$/.test(v))
    return v[0].toUpperCase()+v.slice(1,-1).toLowerCase()+v.slice(-1);
  return fallback;
}
// V5.2.9: migrate an unambiguous alias; conflicting valid labels require
// an explicit local choice. Never infer group identity from a short label.
function reconcileGroupAlias(data){
  const current=shortName(data.groupShortName,'');
  const legacy=shortName(data.groupShort,'');
  if(current && legacy && current!==legacy){
    data.v526AliasConflict={current,legacy};
    data.groupShortName='';
    return;
  }
  if(data.v526AliasConflict && !current){
    data.groupShortName='';
    return;
  }
  const chosen=current||legacy;
  data.groupShortName=chosen;
  if(chosen)data.groupShort=chosen;
  delete data.v526AliasConflict;
}
function transferStamp(date=new Date()) {
  // Human-facing filenames use Beijing time; protocol IDs/timestamps stay UTC.
  return new Date(new Date(date).getTime()+8*3600000).toISOString()
    .replace(/[-:]/g,'').replace(/\..+$/,'').replace('T','');
}
function requireShortName(value,kind){
  if(!/^[A-Za-z]{2,3}[0-9]$/.test(String(value||'')))
    throw Error(kind+'简称未配置或不合法，请在公共设置明确填写，例如 Tes1 / Win1；禁止自动替换为 Grp1');
  return shortName(value,'');
}
function namedZip(group,device,when=new Date()){
  const ts=transferStamp(when);
  // YYYYMMDDHHmm + SS(2) + 12 hex: previous filename retains all entropy.
  return 'VR-'+requireShortName(group,'群组')+requireShortName(device,'设备')+
    '-'+ts.slice(0,12)+'-'+ts.slice(12,14)+randomHex(12)+'.zip';
}
function namedAck(group,device,batchId,when=new Date()){
  if(!ACK_HASH.test(batchId))throw Error('ACK 批次 ID 无效');
  const ts=transferStamp(when);
  return 'ack-'+requireShortName(group,'群组')+requireShortName(device,'设备')+
    '-'+ts.slice(0,12)+'-'+ts.slice(12,14)+batchId+'.json';
}
function ackHashFromName(name) {
  const n=String(name||'');
  if(/^ackbatch-[a-f0-9]{64}\.json$/.test(n))return n.slice(9,-5);
  if(/^[a-f0-9]{64}\.json$/.test(n))return n.slice(0,-5);
  // V5.2.1 compact alias and V5.2.2 readable dashed alias.
  const a=/^ack-[A-Z][a-z]{1,2}[0-9][A-Z][a-z]{1,2}[0-9](?:[0-9]{14}|-[0-9]{12}-[0-9]{2})([a-f0-9]{64})\.json$/.exec(n);
  return a?a[1]:null;
}
function validAckName(name){return !!ackHashFromName(name);}
async function validateRawAck(bytes,name,groupId) {
  const raw=asBytes(bytes);
  if(!validAckName(name) || raw.length<10 || raw.length>1024*1024)
    throw Error('ACK 文件名或大小不符合同步核心协议');
  if(!validGroup(groupId))throw Error('未核对 GroupID');
  let obj;
  try {obj=JSON.parse(bytesText(raw));}
  catch(_) {throw Error('ACK JSON 无效');}
  const entries=obj?.format==='vaultrelay.ack-batch.v2'?obj.entries:[obj];
  const device=obj?.format==='vaultrelay.ack-batch.v2'?
    obj.originDeviceId:obj?.fromDeviceId;
  if(!ACK_DEVICE.test(device)||!Array.isArray(entries)||!entries.length||entries.length>80)
    throw Error('ACK 来源设备或条目数量无效');
  if(obj.format==='vaultrelay.ack-batch.v2') {
    if(obj.vaultGroupId!==groupId || !ACK_HASH.test(obj.batchId) ||
       ackHashFromName(name)!==obj.batchId)
      throw Error('ACK 批次 GroupID 或文件名不匹配');
    const digest=await sha256(utf8.encode(device+'|'+entries.map(x=>x?.ackId||'').sort().join('|')));
    if(digest!==obj.batchId)throw Error('ACK 批次指纹错误');
  }else if(!obj || obj.format!=='vaultrelay.ack.v2'||name!==obj.ackId+'.json') {
    throw Error('无法识别的同步核心 ACK 格式');
  }
  for(const e of entries) {
    if(!e||e.format!=='vaultrelay.ack.v2'||e.vaultGroupId!==groupId||
       e.fromDeviceId!==device||!ACK_DEVICE.test(e.toDeviceId)||
       !ACK_VERSION.test(e.versionId)||e.packId!==e.versionId.split(':')[0]||
       !safeRel(e.path)||!ACK_HASH.test(e.ackId)||
       !['applied','same','equivalent','conflict','rejected'].includes(e.outcome)||
       !(e.contentSha256===null||ACK_HASH.test(e.contentSha256)))
      throw Error('ACK 条目内容或版本无效');
    if(e.outcome==='equivalent' &&
       (!ACK_HASH.test(e.equivalentSha256)||!ACK_HASH.test(e.localOriginalSha256)))
      throw Error('ACK 等价确认缺少校验字段');
    const identity=groupId+'|'+e.toDeviceId+'|'+e.versionId+'|'+(e.contentSha256||'delete');
    if(await sha256(utf8.encode(identity+'|'+e.outcome+'|'+device))!==e.ackId)
      throw Error('ACK 条目指纹错误');
  }
  return {device,entries,count:entries.length,name,hash:await sha256(raw),
    canonicalName:obj.format==='vaultrelay.ack-batch.v2'?
      'ackbatch-'+obj.batchId+'.json':obj.ackId+'.json',
    batchId:obj.format==='vaultrelay.ack-batch.v2'?obj.batchId:null};
}

/* No external ZIP dependencies: uncompressed outer ZIP, inner formal ZIP unchanged. */
function zipEncode(entries) {
  if (entries.length > MAX_FILES + 1) throw Error('文件数超过上限');
  let localOffset=0, centralLength=0;
  const locals=[], centrals=[];
  for (const {name, data:raw} of entries) {
    if (!safeRel(name)) throw Error('ZIP 文件名不安全');
    const nameData=utf8.encode(name), data=asBytes(raw);
    if (nameData.length>65535 || data.length>MAX_ITEM_BYTES) throw Error('文件过大');
    const crc=crc32(data);
    const local=new Uint8Array(30+nameData.length), a=new DataView(local.buffer);
    a.setUint32(0,0x04034b50,true);
    a.setUint16(4,20,true); a.setUint16(6,0x0800,true);
    a.setUint16(8,0,true); a.setUint16(10,0,true); a.setUint16(12,0x21,true);
    a.setUint32(14,crc,true); a.setUint32(18,data.length,true);
    a.setUint32(22,data.length,true); a.setUint16(26,nameData.length,true);
    local.set(nameData,30);
    const central=new Uint8Array(46+nameData.length), b=new DataView(central.buffer);
    b.setUint32(0,0x02014b50,true);
    b.setUint16(4,20,true); b.setUint16(6,20,true);
    b.setUint16(8,0x0800,true); b.setUint16(10,0,true);
    b.setUint16(12,0,true); b.setUint16(14,0x21,true);
    b.setUint32(16,crc,true); b.setUint32(20,data.length,true);
    b.setUint32(24,data.length,true); b.setUint16(28,nameData.length,true);
    b.setUint32(42,localOffset,true); central.set(nameData,46);
    locals.push(local,data); centrals.push(central);
    localOffset+=local.length+data.length; centralLength+=central.length;
    if (localOffset+centralLength>MAX_BUNDLE_BYTES) throw Error('增量 ZIP 超出体积限制');
  }
  const end=new Uint8Array(22), e=new DataView(end.buffer);
  e.setUint32(0,0x06054b50,true);
  e.setUint16(8,entries.length,true); e.setUint16(10,entries.length,true);
  e.setUint32(12,centralLength,true); e.setUint32(16,localOffset,true);
  return joinBytes([...locals,...centrals,end]);
}
function zipDecode(input) {
  const data=asBytes(input);
  if (data.length < 22 || data.length > MAX_BUNDLE_BYTES) throw Error('增量 ZIP 体积异常');
  const v=new DataView(data.buffer,data.byteOffset,data.byteLength);
  let end=-1;
  for (let i=data.length-22; i>=Math.max(0,data.length-65557); i--) {
    if (v.getUint32(i,true)===0x06054b50 && i+22+v.getUint16(i+20,true)===data.length) {
      end=i; break;
    }
  }
  if (end<0) throw Error('ZIP 目录不完整');
  if (v.getUint16(end+4,true)!==0 || v.getUint16(end+6,true)!==0)
    throw Error('不支持分卷 ZIP');
  const count=v.getUint16(end+10,true), length=v.getUint32(end+12,true);
  const offset=v.getUint32(end+16,true);
  if (count>MAX_FILES+1 || offset+length!==end) throw Error('ZIP 目录长度无效');
  const files=new Map();
  let cursor=offset, total=0;
  for (let n=0; n<count; n++) {
    if (cursor+46>end || v.getUint32(cursor,true)!==0x02014b50)
      throw Error('ZIP 中央目录损坏');
    const flags=v.getUint16(cursor+8,true), method=v.getUint16(cursor+10,true);
    const crc=v.getUint32(cursor+16,true);
    const packed=v.getUint32(cursor+20,true), original=v.getUint32(cursor+24,true);
    const nameLen=v.getUint16(cursor+28,true), extra=v.getUint16(cursor+30,true);
    const comment=v.getUint16(cursor+32,true), localPos=v.getUint32(cursor+42,true);
    const next=cursor+46+nameLen+extra+comment;
    if (next>end || (flags&1) || (flags&0x0800)===0 || method!==0 || packed!==original
        || original>MAX_ITEM_BYTES)
      throw Error('ZIP 条目类型或大小不符合外层协议');
    const nameBytes=data.slice(cursor+46,cursor+46+nameLen);
    const name=utf8Decoder.decode(nameBytes);
    if (!safeRel(name) || files.has(name)) throw Error('检测到重复或不安全的 ZIP 路径');
    if (localPos+30>offset || v.getUint32(localPos,true)!==0x04034b50)
      throw Error('本地 ZIP 文件头损坏');
    const localNameLength=v.getUint16(localPos+26,true);
    const localExtraLength=v.getUint16(localPos+28,true);
    const localNameStart=localPos+30;
    if (v.getUint16(localPos+8,true)!==0 || localNameLength!==nameLen
        || localNameStart+nameLen+localExtraLength>offset)
      throw Error('ZIP 本地文件头与目录不一致');
    const localName=data.subarray(localNameStart,localNameStart+nameLen);
    if (localName.some((byte,index)=>byte!==nameBytes[index]))
      throw Error('ZIP 中央目录与本地文件名不一致');
    const start=localNameStart+nameLen+localExtraLength;
    if (start+original>offset) throw Error('ZIP 数据边界异常');
    const part=data.slice(start,start+original);
    if (crc32(part)!==crc) throw Error('ZIP CRC 校验失败：'+name);
    total+=original;
    if (total>MAX_BUNDLE_BYTES) throw Error('解包总体积超限');
    files.set(name,part);
    cursor=next;
  }
  if (cursor!==end) throw Error('ZIP 目录残留异常数据');
  return files;
}
function buffer(bytes) {
  const x=asBytes(bytes);
  return x.buffer.slice(x.byteOffset,x.byteOffset+x.byteLength);
}
function bytesText(b) { return utf8Decoder.decode(asBytes(b)); }
function sizeText(n) { return n<1024 ? n+' B' : (n/1024/1024).toFixed(2)+' MB'; }
function errText(e) { return e && e.message ? e.message : String(e); }
/*
 * Write outside the published filename first, then hard-link atomically.
 * A destination that already exists is never overwritten. If the local
 * filesystem does not support hard links, fail closed instead of exposing
 * a partially written ZIP to Baidu/legacy synchronization.
 */
async function exclusiveFinishedWrite(fs, target, data) {
  const pending=target+'.partial-'+randomHex(10);
  try {
    await fs.writeFile(pending,asBytes(data),{flag:'wx'});
    await fs.link(pending,target);
  } finally {
    try {await fs.unlink(pending);} catch (_) {}
  }
}
function nodeFiles() {
  if (!Platform.isDesktopApp) throw Error('桌面文件系统仅 Windows/macOS 可使用');
  return {fs:require('fs').promises, path:require('path')};
}
async function ensureVaultFolder(adapter, folder) {
  let current='';
  for (const p of folder.split('/')) {
    if (!p) continue;
    current=current ? current+'/'+p : p;
    if (!(await adapter.exists(current))) await adapter.mkdir(current);
  }
}
async function scanVaultFolder(adapter, prefix, results, depth) {
  if (depth>3 || !(await adapter.exists(prefix))) return;
  const ls=await adapter.list(prefix);
  for (const full of ls.files) {
    const rolePath=full.slice((TRANSFER+'/outbox/').length);
    if (!safeEntry(rolePath)) continue;
    const st=await adapter.stat(full);
    if (!st || st.size>MAX_ITEM_BYTES) continue;
    results.push({rolePath, size:st.size, mtime:st.mtime,
      read:async()=>asBytes(await adapter.readBinary(full))});
  }
  for (const dir of ls.folders) await scanVaultFolder(adapter,dir,results,depth+1);
}
async function scanWindowsFolder(root, results) {
  const {fs,path}=nodeFiles();
  const resolved=path.resolve(root);
  for (const role of ROLES) {
    async function traverse(folder, rel, depth) {
      if (depth>3) return;
      let nodes;
      try { nodes=await fs.readdir(folder,{withFileTypes:true}); }
      catch (e) { if(e.code==='ENOENT') return; throw e; }
      for (const node of nodes) {
        if (node.isSymbolicLink()) continue; // never follow symlinks
        const next=path.join(folder,node.name);
        const relative=rel ? rel+'/'+node.name : node.name;
        if (node.isDirectory()) { await traverse(next,relative,depth+1); continue; }
        const rolePath=role+'/'+relative;
        if (!node.isFile() || !safeEntry(rolePath)) continue;
        const st=await fs.stat(next);
        if (st.size>MAX_ITEM_BYTES) continue;
        results.push({rolePath,size:st.size,mtime:st.mtimeMs,
          read:async()=>asBytes(await fs.readFile(next))});
      }
    }
    await traverse(path.join(resolved,role),'',0);
  }
}
function createEl(parent,tag,label,cls) {
  const el=document.createElement(tag);
  if (label!==undefined && label!==null) el.textContent=String(label);
  if (cls) el.className=cls;
  parent.appendChild(el); return el;
}
function button(parent,label,cb,cls) {
  const b=createEl(parent,'button',label,'vrb-btn '+(cls||''));
  b.type='button'; b.addEventListener('click',cb); return b;
}
function block(parent,title,description) {
  const section=createEl(parent,'section',null,'vrb-section');
  createEl(section,'h3',title);
  if(description) createEl(section,'p',description,'vrb-muted');
  return section;
}
// Only used for offline tests; does not affect Obsidian plugin registration.
module.exports.__testing={zipEncode,zipDecode,safeRel,safeEntry,validGroup,validShareUrl,validTransportDeviceId,sha256,exclusiveFinishedWrite,asBytes,buffer,bytesText,ensureVaultFolder,scanWindowsFolder,scanVaultFolder,randomHex,timestamp,createEl,button,block,safeLabel,platformName,MAX_FILES,MAX_ITEM_BYTES,MAX_BUNDLE_BYTES,validateRawAck,validAckName,
  shortName,reconcileGroupAlias,requireShortName,transferStamp,namedZip,namedAck,ackHashFromName};

return module.exports;
}
function loadWindows(){
const module={exports:{}};
'use strict';
/**
 * Vault Relay V3 Desktop transport observer.
 * V4 native core is the owner of note-version decisions.
 * This transport scans content/info/ack exchange artifacts and wraps them
 * into one outer transport ZIP in a different Baidu sync folder, and reverses
 * the operation for incoming envelopes. OFF by default.
 *
 * Never rewrites a formal historical content ZIP or overrides a same-named
 * different-hash exchange artifact.
 */
function createDesktopAgent(plugin, tools) {
  const {zipEncode,zipDecode,sha256,randomHex,timestamp,safeLabel,safeEntry,
    asBytes,MAX_FILES,MAX_BUNDLE_BYTES,exclusiveFinishedWrite,validateRawAck,validAckName}=tools;
  const fs=require('node:fs').promises;
  const path=require('node:path');
  const ZIP_MAX=MAX_BUNDLE_BYTES;
  function acceptedManifest(bytes,groupId) {
    const files=zipDecode(bytes);
    const meta=files.get('manifest.json');
    if(!meta) throw Error('缺少 manifest.json');
    let m;
    try { m=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(meta)); }
    catch(_) { throw Error('增量包清单无效'); }
    if(m.format!=='vault-relay-transport-envelope'||m.schema!==1)
      throw Error('增量包格式不兼容');
    if(m.groupId!==groupId) throw Error('GroupID 不匹配');
    if(typeof m.bundleId!=='string'||!/^br-[A-Za-z0-9_-]{10,80}$/.test(m.bundleId))
      throw Error('包唯一标识无效');
    if(!Array.isArray(m.files)||m.files.length<1||m.files.length>MAX_FILES
      ||m.files.length+1!==files.size) throw Error('清单文件数量不匹配');
    const names=new Set();
    for(const entry of m.files) {
      if(!entry || !safeEntry(entry.path) || names.has(entry.path.normalize('NFC').toLowerCase()))
        throw Error('包含重复、大小写冲突或不安全的文件路径');
      names.add(entry.path.normalize('NFC').toLowerCase());
    }
    return {m,files};
  }
  const bytesEq=async (one,two)=> (await sha256(one))===(await sha256(two));
  const lstatSafe=async p=>{try{return await fs.lstat(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
  function isNested(a,b) {return a===b || a.startsWith(b+path.sep)||b.startsWith(a+path.sep);}
  function config() {
    const s=plugin.data;
    const group=s.groupId;
    const original=plugin.currentLegacyGroup?.();
    if(original && original!==group)
      throw Error('V3 GroupID 与同步核心 GroupID 不一致，已停止 Windows 运输');
    if(!/^vg-[a-z0-9]{16,40}$/.test(String(group||'')))
      throw Error('必须确认同步核心 GroupID（vg- 加 16-40 位小写字母数字）');
    if(!s.windowsLegacyDir||!s.windowsCloudDir)
      throw Error('须先配置 Windows 同步核心交换目录和新版云端本地映射目录');
    const legacy=path.resolve(s.windowsLegacyDir), cloud=path.resolve(s.windowsCloudDir);
    if(isNested(legacy,cloud)) throw Error('引擎交换目录与新目录不能互相包含');
    // The unified plugin validates space identity independently of folder name.
    // The active local directory can be renamed/moved without changing GroupID.
    if(plugin.cloudConfig().cloud!==cloud)throw Error('Windows 百度同步目录核对失败');
    // Generated transport ZIPs must not be placed inside the Obsidian
    // note vault; this avoids the core considering them ordinary notes.
    const vaultPath=plugin.app?.vault?.adapter?.getBasePath?.() ||
      plugin.app?.vault?.adapter?.basePath;
    if(vaultPath) {
      const root=path.resolve(vaultPath);
      if(cloud===root || cloud.startsWith(root+path.sep))
        throw Error('百度网盘映射目录不能在当前 Obsidian 知识库内部，避免循环');
      if((legacy===root || legacy.startsWith(root+path.sep)) &&
          !(legacy===path.join(root,'VaultRelay-Transfer') ||
            legacy.startsWith(path.join(root,'VaultRelay-Transfer')+path.sep)))
        throw Error('同步核心交换目录如在知识库内，必须属于 VaultRelay-Transfer');
    }
    return {legacy,cloud,group};
  }
  async function verifyFolders({legacy,cloud}) {
    for(const root of [legacy,cloud]) {
      const st=await lstatSafe(root);
      if(!st||!st.isDirectory()||st.isSymbolicLink())
        throw Error('目录不存在或不是普通文件夹：'+root);
    }
    for(const role of ['content','info','ack']) {
      const full=path.join(legacy,role);
      const st=await lstatSafe(full);
      if(st && (!st.isDirectory()||st.isSymbolicLink()))
        throw Error('交换目录含有不安全项：'+full);
    }
  }
  async function scanRoleFiles(legacy) {
    const result=[];
    async function walk(dir,role,depth,prefix) {
      if(depth>4) return;
      let names;
      try {names=await fs.readdir(dir,{withFileTypes:true});}
      catch(e) {if(e.code==='ENOENT')return;throw e;}
      for(const node of names) {
        if(node.isSymbolicLink()) continue;
        const next=path.join(dir,node.name);
        const relative=role+'/'+(prefix?prefix+'/':'')+node.name;
        if(node.isDirectory()) {await walk(next,role,depth+1,(prefix?prefix+'/':'')+node.name);continue;}
        if(!node.isFile()||!safeEntry(relative)) continue;
        const stat=await lstatSafe(next);
        if(!stat||!stat.isFile()||stat.isSymbolicLink()) continue;
        if(stat.size>MAX_BUNDLE_BYTES-100000||stat.size>30*1024*1024) continue;
        result.push({relative,full:next,size:stat.size,mtime:stat.mtimeMs});
      }
    }
    for(const role of ['content','info','ack'])
      await walk(path.join(legacy,role),role,0,'');
    if(result.length>30000) throw Error('交换文件过多，超出安全扫描上限');
    return result;
  }
  async function readStable(full,stat) {
    // Keep only fully written files; downloader might still be working.
    if(Date.now()-stat.mtime<4000) return null;
    const a=await lstatSafe(full);
    if(!a||a.size!==stat.size||a.mtimeMs!==stat.mtime) return null;
    const data=asBytes(await fs.readFile(full));
    const b=await lstatSafe(full);
    if(!b||b.size!==a.size||b.mtimeMs!==a.mtimeMs) return null;
    return data;
  }
  async function scanSignatures(legacy) {
    const rows=await scanRoleFiles(legacy), map={};
    for(const r of rows)
      map[r.relative]={size:r.size,mtime:r.mtime,full:r.full};
    return map;
  }
  function baseline() {
    if(!plugin.data.desktopLedger || typeof plugin.data.desktopLedger!=='object')
      plugin.data.desktopLedger={};
    const l=plugin.data.desktopLedger;
    if(!l.snapshot || typeof l.snapshot!=='object') l.snapshot={};
    if(!l.incoming || typeof l.incoming!=='object') l.incoming={};
    if(!l.blocked || typeof l.blocked!=='object') l.blocked={};
    if(!l.suppress || typeof l.suppress!=='object') l.suppress={};
    if(!l.published || typeof l.published!=='object') l.published={};
    if(!l.initialSeed || typeof l.initialSeed!=='object') l.initialSeed={};
    if(!l.lastPublishedSha || typeof l.lastPublishedSha!=='object') l.lastPublishedSha={};
    if(!l.receivedSha || typeof l.receivedSha!=='object') l.receivedSha={};
    return l;
  }
  async function verifyIncomingBundle(bytes,group) {
    const {m,files}=acceptedManifest(bytes,group);
    for(const item of m.files) {
      const data=files.get(item.path);
      if(!data || !Number.isInteger(item.bytes)||item.bytes!==data.length
        ||typeof item.sha256!=='string'||(await sha256(data))!==item.sha256)
        throw Error('内容 SHA 校验失败：'+item.path);
      if(item.path.startsWith('ack/')){
        const name=item.path.split('/').pop();
        const ack=await validateRawAck(data,name,m.groupId);
        if(item.path!=='ack/'+ack.device+'/'+ack.canonicalName ||
           !/^vr-[a-z0-9]{16,64}$/.test(m.nativeSenderDeviceId||'') ||
           ack.device!==m.nativeSenderDeviceId)
          throw Error('混合包 ACK 来源设备和路径无法验证');
      }
    }
    return {m,files};
  }
  async function inbound(conf) {
    const ledger=baseline();
    const names=await fs.readdir(conf.cloud,{withFileTypes:true});
    let newFiles=0, duplicates=0, blocked=0;
    for(const ent of names) {
      if(!ent.isFile()||ent.isSymbolicLink()||!ent.name.toLowerCase().endsWith('.zip')) continue;
      // Files uploaded by another user may use any valid prefix; do not rely
      // on the name, only on a fully verified manifest GroupID.
      const full=path.join(conf.cloud,ent.name);
      const st=await lstatSafe(full);
      if(!st||st.size>ZIP_MAX||st.size<22||Date.now()-st.mtimeMs<4500) continue;
      if(ledger.published[ent.name]) continue;
      const bytes=await readStable(full,{size:st.size,mtime:st.mtimeMs});
      if(!bytes) continue;
      const incomingHash=await sha256(bytes);
      if(ledger.incoming[ent.name]===incomingHash){duplicates++;continue;}
      if(ledger.blocked[ent.name]===incomingHash){blocked++;continue;}
      if(ledger.incoming[ent.name] && ledger.incoming[ent.name]!==incomingHash) {
        ledger.blocked[ent.name]=incomingHash;
        await plugin.log('传输异常','同名云端 ZIP 内容变化，拒绝重新导入：'+ent.name);
        blocked++;continue;
      }
      let parsed;
      try {parsed=await verifyIncomingBundle(bytes,conf.group);}
      catch(e){
        ledger.blocked[ent.name]=incomingHash;
        await plugin.log('接收拒绝',ent.name+'：'+e.message);
        blocked++;continue;
      }
      const {m,files}=parsed;
      if(m.transportDeviceId===plugin.data.deviceId) {
        ledger.incoming[ent.name]=incomingHash;
        duplicates++;continue;
      }
      // The verified original ZIP is already in the Baidu-synced workspace.
      // Only verified extracted work entries are placed into staging.
      try {await plugin.stageWindowsArchive(ent.name,bytes,m,files);}
      catch(e){
        ledger.blocked[ent.name]=incomingHash;
        await plugin.log('云端增量文件暂存拒绝',ent.name+'：'+String(e.message||e));
        blocked++;continue;
      }
      // Verify ALL destinations before writing any of them.
      const plan=[];
      let conflict=null;
      for(const item of m.files) {
        const dest=path.join(conf.legacy,...item.path.split('/'));
        if(!dest.startsWith(conf.legacy+path.sep)) {conflict='路径逃逸';break;}
        const parent=path.dirname(dest);
        let walking=conf.legacy;
        for(const segment of item.path.split('/').slice(0,-1)){
          walking=path.join(walking,segment);
          const s=await lstatSafe(walking);
          if(s && (s.isSymbolicLink()||!s.isDirectory())) {conflict='存在符号链接或非法目录';break;}
        }
        if(conflict) break;
        const existing=await lstatSafe(dest);
        if(existing) {
          if(!existing.isFile()||existing.isSymbolicLink()) {conflict='目标文件类型异常';break;}
          const old=await fs.readFile(dest);
          if((await sha256(old))!==item.sha256) {conflict='同名但内容不同：'+item.path;break;}
          plan.push({item,dest,same:true});
        }else {
          plan.push({item,dest,same:false});
        }
      }
      if(conflict) {
        ledger.blocked[ent.name]=incomingHash;
        await plugin.log('解包冲突待人工处理',ent.name+'：'+conflict+
          '；未覆盖原交换文件。云端原包仍保留。');
        blocked++;continue;
      }
      for(const {item,dest,same} of plan) {
        if(!same) {
          await fs.mkdir(path.dirname(dest),{recursive:true});
          await exclusiveFinishedWrite(fs,dest,files.get(item.path));
          newFiles++;
        }
        // Do not re-export received bytes, including if they already existed,
        // or if another local file was being published during this poll.
        ledger.suppress[item.path]=item.sha256;
        ledger.receivedSha[item.path]=item.sha256;
      }
      ledger.incoming[ent.name]=incomingHash;
      await plugin.markWindowsRestored(ent.name,incomingHash);
      await plugin.persistTransport();
      await plugin.log('Windows 安全解包',ent.name+'：还原交换文件 '+
        plan.filter(x=>!x.same).length+' 个、相同跳过 '+plan.filter(x=>x.same).length+
        ' 个；由同步核心执行笔记版本判断。');
      if(m.files.some(x=>x.path.startsWith('ack/')) && plugin.engine?.receiveAck){
        await plugin.engine.receiveAck();
        await plugin.log('混合 ZIP ACK 核对',ent.name+'：同步核心已检查 ZIP 内 ACK，正式笔记仍须人工审核');
      }
    }
    // beta.4: ACK is a raw original .json beside the ZIPs in the same
    // GroupID folder. We merely validate and restore it to legacy ack/<device>/.
    // The original engine must perform the actual ACK acceptance.
    let rawAck=0;
    for(const ent of names) {
      if(!ent.isFile()||ent.isSymbolicLink()||!validAckName(ent.name))continue;
      const full=path.join(conf.cloud,ent.name),st=await lstatSafe(full);
      if(!st||st.size>1024*1024||st.size<10||Date.now()-st.mtimeMs<4500)continue;
      const bytes=await readStable(full,{size:st.size,mtime:st.mtimeMs});
      if(!bytes)continue;
      const hash=await sha256(bytes);
      if(ledger.incoming[ent.name]===hash){duplicates++;continue;}
      if(ledger.blocked[ent.name]===hash){blocked++;continue;}
      if(ledger.incoming[ent.name]&&ledger.incoming[ent.name]!==hash) {
        ledger.blocked[ent.name]=hash;blocked++;
        await plugin.log('独立 ACK 冲突','网盘同名 ACK 内容变化，拒绝覆盖：'+ent.name);
        continue;
      }
      let ack;
      try {ack=await validateRawAck(bytes,ent.name,conf.group);}
      catch(e){
        ledger.blocked[ent.name]=hash;blocked++;
        await plugin.log('独立 ACK 拒绝',ent.name+'：'+String(e.message||e));continue;
      }
      const ownDevice=plugin.getLegacy?.()?.engine?.state?.deviceId;
      if(ack.device===ownDevice){
        ledger.incoming[ent.name]=hash;duplicates++;continue;
      }
      const rel='ack/'+ack.device+'/'+ack.canonicalName;
      const parent=path.join(conf.legacy,'ack',ack.device);
      const oldParent=await lstatSafe(path.join(conf.legacy,'ack'));
      const parentStat=await lstatSafe(parent);
      if((oldParent && (oldParent.isSymbolicLink()||!oldParent.isDirectory())) ||
         (parentStat && (parentStat.isSymbolicLink()||!parentStat.isDirectory()))) {
        blocked++;await plugin.log('独立 ACK 拒绝','本地 ACK 目录不安全：'+rel);continue;
      }
      const dest=path.join(parent,ack.canonicalName),existing=await lstatSafe(dest);
      if(existing){
        if(!existing.isFile()||existing.isSymbolicLink() ||
           await sha256(await fs.readFile(dest))!==hash) {
          ledger.blocked[ent.name]=hash;blocked++;
          await plugin.log('独立 ACK 冲突','同名不同内容，原文件未覆盖：'+rel);continue;
        }
        duplicates++;
      }else{
        await fs.mkdir(parent,{recursive:true});
        await exclusiveFinishedWrite(fs,dest,bytes);rawAck++;newFiles++;
      }
      ledger.receivedSha[rel]=hash;ledger.suppress[rel]=hash;
      ledger.incoming[ent.name]=hash;
      await plugin.persistTransport();
      await plugin.log('Windows 独立 ACK 已暂存',rel+'；仍需同步核心验证 ACK 才算真正接收确认。');
    }
    return {newFiles,duplicates,blocked,rawAck};
  }
  async function outbound(conf,{force=false}={}) {
    const ledger=baseline();
    const signatures=await scanSignatures(conf.legacy);
    if(!ledger.initialized){
      for(const [p,s] of Object.entries(signatures))
        ledger.snapshot[p]={size:s.size,mtime:s.mtime};
      ledger.initialized=true;
      await plugin.persistTransport();
      await plugin.log('Windows 基线就绪','已记录 '+Object.keys(signatures).length+
        ' 个既有交换文件。后续 content/info 使用增量 ZIP，ACK 独立 JSON。');
      if(!force)return {published:0,rawAck:0,baseline:true};
    }
    const content=[],acks=[];
    for(const [p,s] of Object.entries(signatures)) {
      const prev=ledger.snapshot[p];
      if(force&&ledger.initialSeed[p]===s.size+':'+s.mtime)continue;
      if(!force&&prev&&prev.size===s.size&&prev.mtime===s.mtime)continue;
      const bytes=await readStable(s.full,s);
      if(!bytes)continue;
      const hash=await sha256(bytes);
      if(ledger.receivedSha[p]===hash||(!force&&ledger.suppress[p]===hash)){
        ledger.snapshot[p]={size:s.size,mtime:s.mtime};
        ledger.initialSeed[p]=s.size+':'+s.mtime;
        delete ledger.suppress[p];
        continue;
      }
      if(!force&&ledger.lastPublishedSha[p]===hash) {
        ledger.snapshot[p]={size:s.size,mtime:s.mtime};
        continue;
      }
      const entry={name:p,data:bytes,sha256:hash,stat:s};
      (p.startsWith('ack/')?acks:content).push(entry);
    }
    let published=0,zipName=null,rawAck=0,ackRejected=0;
    let total=0;
    const chosen=[];
    const ownDevice=plugin.getLegacy?.()?.engine?.state?.deviceId;
    for(const item of content) {
      // An archive forwarded from another member is NOT authored by this
      // Windows device. Keep it intact but never repackage it as a new
      // sender-authored bundle: that makes ACK cleanup correspondence invalid.
      if(item.name.startsWith('content/')){
        let rejected=null;
        try{
          if(!ownDevice)throw Error('本机设备标识尚未就绪');
          const engine=plugin.getLegacy()?.engine;
          const native=await engine.readPack(item.stat.full,true);
          if(native.manifest.originDeviceId!==ownDevice ||
             native.manifest.vaultGroupId!==conf.group)
            throw Error('内容原始设备不是当前 Windows 发送设备');
          if(await sha256(item.data)!==native.sha256)
            throw Error('内容在核验过程中发生变化');
        }catch(e){rejected=String(e.message||e).slice(0,170);}
        if(rejected){
          ledger.snapshot[item.name]={size:item.stat.size,mtime:item.stat.mtime};
          ledger.lastPublishedSha[item.name]=item.sha256;
          await plugin.log('跳过历史/异源内容包',item.name+'：'+rejected+
            '；原始 ZIP 保留，不伪装成本机新发送版本');
          continue;
        }
      }else if(item.name.startsWith('info/')){
        const token=item.name.match(/__(vr-[a-z0-9]{16,64})__/);
        if(token&&token[1]!==ownDevice){
          ledger.snapshot[item.name]={size:item.stat.size,mtime:item.stat.mtime};
          ledger.lastPublishedSha[item.name]=item.sha256;
          await plugin.log('跳过异源 info',item.name+'：信息包原始设备不属于本机');
          continue;
        }
      }
      if(chosen.length>=Math.min(MAX_FILES-1,90))break;
      if(total+item.data.length>MAX_BUNDLE_BYTES-80000)break;
      chosen.push(item);total+=item.data.length;
    }
    // All items may have been safely excluded as already-forwarded foreign
    // history. No new ZIP is required in that case.
    if(chosen.length===0 && content.length)
      await plugin.log('Windows 本轮未封装内容','没有可安全归属本机的新 content/info；异源历史包均保留');
    const bundledAcks=[];
    if(chosen.some(x=>x.name.startsWith('content/'))){
      // Never package old forwarded ACK files or repeat ACKs from a prior
      // ZIP/JSON. The core outbox is the authority for original raw bytes.
      for(const x of acks){
        const known=plugin.data.ackTransportLedger?.[x.name];
        if(known){
          if(known.sha256!==x.sha256)throw Error('已发送 ACK 路径 SHA 变化，停止封包：'+x.name);
          continue;
        }
        const name=path.basename(x.name);
        let ack;
        try{
          ack=await validateRawAck(x.data,name,conf.group);
          if(ack.device!==ownDevice || x.name!=='ack/'+ownDevice+'/'+ack.canonicalName)
            throw Error('ACK 非本机原始设备或非标准路径');
        }catch(e){
          ackRejected++;
          ledger.lastPublishedSha[x.name]=x.sha256;
          await plugin.log('混合包 ACK 未加入',x.name+'：'+String(e.message||e));
          continue;
        }
        if(chosen.length+1>MAX_FILES || total+x.data.length>MAX_BUNDLE_BYTES-80000)
          throw Error('Windows 本轮 ZIP/ACK 超过上限，不允许部分合包后遗漏剩余 ACK');
        chosen.push(x);total+=x.data.length;bundledAcks.push(x);
      }
    }
    if(chosen.length){
      const m={
        format:'vault-relay-transport-envelope',schema:1,
        bundleId:'br-'+timestamp()+'-'+randomHex(12),
        groupId:conf.group,vaultName:plugin.app.vault.getName(),
        groupName:plugin.data.groupName||plugin.app.vault.getName(),
        transportDeviceId:plugin.data.deviceId,nativeSenderDeviceId:ownDevice,
        platform:'Windows',createdAt:new Date().toISOString(),
        files:chosen.map(x=>({path:x.name,bytes:x.data.length,sha256:x.sha256}))
      };
      const manifest=new TextEncoder().encode(JSON.stringify(m,null,2));
      const archive=zipEncode([{name:'manifest.json',data:manifest},...chosen]);
      zipName=tools.namedZip(plugin.data.groupShortName,plugin.data.deviceShortName);
      // V5.2.3: auto send ON -> approved Baidu local sync folder; OFF ->
      // verified private pending queue in the vault until explicitly resumed.
      const stored=await plugin.writeOutgoing(zipName,archive);
      await plugin.registerWindowsAutoBundle(chosen,m,zipName,archive,stored);
      plugin.data.ackTransportLedger ||= {};
      for(const item of bundledAcks)
        plugin.data.ackTransportLedger[item.name]={mode:'bundle',sha256:item.sha256,
          bundleName:zipName,at:Date.now()};
      plugin.data.latest=stored.path;
      ledger.published[zipName]=await sha256(archive);
      plugin.data.latestCloudFile=stored.path;
      for(const x of chosen){
        ledger.snapshot[x.name]={size:x.stat.size,mtime:x.stat.mtime};
        ledger.lastPublishedSha[x.name]=x.sha256;
        if(force)ledger.initialSeed[x.name]=x.stat.size+':'+x.stat.mtime;
      }
      published=chosen.length-bundledAcks.length;
      await plugin.log('Windows 自动封包',zipName+'：正文/信息 '+published+
        ' 个、合包 ACK '+bundledAcks.length+' 个；'+
        (stored.queued?'自动收发关闭，保留本地待发送区':'已写入百度本地同步目录')+'；云端状态未验证。');
    }
    // With NO new content, ACK stays a standalone JSON. With content, all
    // valid unsent ACKs are in the ZIP; do not publish a duplicate JSON.
    for(const x of (bundledAcks.length?[]:acks.slice(0,40))) {
      if(plugin.data.ackTransportLedger?.[x.name]){
        const older=plugin.data.ackTransportLedger[x.name];
        if(older.sha256!==x.sha256)throw Error('已发布 ACK 位置 SHA 变化：'+x.name);
        ledger.snapshot[x.name]={size:x.stat.size,mtime:x.stat.mtime};
        ledger.lastPublishedSha[x.name]=x.sha256;
        continue;
      }
      const name=path.basename(x.name);
      let parsed;
      try{
        parsed=await validateRawAck(x.data,name,conf.group);
        if(x.name!=='ack/'+parsed.device+'/'+name || parsed.device!==ownDevice)
          throw Error('ACK 非本机来源或 JSON 路径不匹配；禁止再次发布异源确认');
      }catch(e){
        ledger.snapshot[x.name]={size:x.stat.size,mtime:x.stat.mtime};
        ledger.lastPublishedSha[x.name]=x.sha256;
        ackRejected++;
        await plugin.log('独立 ACK 未上传',x.name+'：'+String(e.message||e));continue;
      }
      const publicName=parsed.batchId?
        plugin.getAckPublicName(parsed.batchId,parsed.device):name;
      const dest=path.join(conf.cloud,publicName),existing=await lstatSafe(dest);
      if(existing){
        if(!existing.isFile()||existing.isSymbolicLink() ||
           await sha256(await fs.readFile(dest))!==x.sha256) {
          ackRejected++;
          await plugin.log('独立 ACK 冲突',publicName+'：网盘映射目录存在同名不同内容，未覆盖');
          continue;
        }
      }else{
        // The ACK file remains an independent JSON, written to the mirror once.
        await plugin.writeOutgoing(publicName,x.data);
        rawAck++;
      }
      ledger.snapshot[x.name]={size:x.stat.size,mtime:x.stat.mtime};
      ledger.lastPublishedSha[x.name]=x.sha256;
      plugin.data.ackTransportLedger ||= {};
      plugin.data.ackTransportLedger[x.name]={mode:'json',sha256:x.sha256,
        publicName,at:Date.now()};
      if(force)ledger.initialSeed[x.name]=x.stat.size+':'+x.stat.mtime;
    }
    await plugin.persistTransport();
    if(rawAck)await plugin.log('Windows 独立 ACK 已发布',rawAck+
      ' 个同步核心 ACK JSON 已复制到百度同步目录；是否到达云端仍不可直接确认。');
    return {published,zipName,rawAck,ackRejected,baseline:false};
  }
  let busy=false;
  return {
    config,verifyFolders,acceptedManifest,verifyIncomingBundle,
    async receiveOnly() {
      if(busy)return null;
      busy=true;
      try {
        const conf=config();
        await verifyFolders(conf);
        return await inbound(conf);
      }finally {busy=false;}
    },
    async tick(opts={}) {
      if(busy) return null;
      busy=true;
      try {
        const conf=config();
        await verifyFolders(conf);
        // On startup, restore incoming first. Suppress any re-exports.
        const received=await inbound(conf);
        const sent=await outbound(conf,opts);
        return {received,sent};
      } finally {busy=false;}
    },
    async initialize() {
      const conf=config();await verifyFolders(conf);
      const ledger=baseline();
      const sigs=await scanSignatures(conf.legacy);
      ledger.snapshot={};
      for(const [p,s] of Object.entries(sigs))
        ledger.snapshot[p]={size:s.size,mtime:s.mtime};
      ledger.initialized=true;
      await plugin.persistTransport();
      await plugin.log('初始化传输基线','已标记 '+Object.keys(sigs).length+' 个旧交换文件为既有历史；不会全部重复打包。');
    },
    async firstPublish() {
      const conf=config();await verifyFolders(conf);
      if(!window.confirm('仅在 test 迁移首次使用：将原有交换文件分批封装到新目录，可能有大量历史 ZIP。确认继续？'))
        return {cancelled:true};
      let batches=0, files=0;
      // Five bounded batches per click; next click resumes safely without
      // republishing unchanged items already seeded by this operation.
      for(let i=0;i<5;i++) {
        const r=await outbound(conf,{force:true});
        if(!r.published) break;
        batches++; files+=r.published;
      }
      await plugin.log('首次发布进度',`已生成 ${batches} 个增量包，包含 ${files} 个交换文件。若历史很多，可再次点击继续。`);
      return {batches,files};
    }
  };
}
module.exports={createDesktopAgent};

return module.exports;
}
function loadZip(){
const module={exports:{}};
/* Vault Relay v1.0.0 | desktop plugin release */
/* JSZip v3.10.1: MIT/GPL dual license, see THIRD_PARTY_LICENSES.md */
const VRI_ZIP = (function(){const module={exports:{}};const exports=module.exports;
const setImmediate=typeof globalThis.setImmediate==='function'?globalThis.setImmediate.bind(globalThis):(fn,...args)=>setTimeout(()=>fn(...args),0);
/*!

JSZip v3.10.1 - A JavaScript class for generating and reading zip files
<http://stuartk.com/jszip>

(c) 2009-2016 Stuart Knightley <stuart [at] stuartk.com>
Dual licenced under the MIT license or GPLv3. See https://raw.github.com/Stuk/jszip/main/LICENSE.markdown.

JSZip uses the library pako released under the MIT license :
https://github.com/nodeca/pako/blob/main/LICENSE
*/

!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{("undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:this).JSZip=e()}}(function(){return function s(a,o,h){function u(r,e){if(!o[r]){if(!a[r]){var t="function"==typeof require&&require;if(!e&&t)return t(r,!0);if(l)return l(r,!0);var n=new Error("Cannot find module '"+r+"'");throw n.code="MODULE_NOT_FOUND",n}var i=o[r]={exports:{}};a[r][0].call(i.exports,function(e){var t=a[r][1][e];return u(t||e)},i,i.exports,s,a,o,h)}return o[r].exports}for(var l="function"==typeof require&&require,e=0;e<h.length;e++)u(h[e]);return u}({1:[function(e,t,r){"use strict";var d=e("./utils"),c=e("./support"),p="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";r.encode=function(e){for(var t,r,n,i,s,a,o,h=[],u=0,l=e.length,f=l,c="string"!==d.getTypeOf(e);u<e.length;)f=l-u,n=c?(t=e[u++],r=u<l?e[u++]:0,u<l?e[u++]:0):(t=e.charCodeAt(u++),r=u<l?e.charCodeAt(u++):0,u<l?e.charCodeAt(u++):0),i=t>>2,s=(3&t)<<4|r>>4,a=1<f?(15&r)<<2|n>>6:64,o=2<f?63&n:64,h.push(p.charAt(i)+p.charAt(s)+p.charAt(a)+p.charAt(o));return h.join("")},r.decode=function(e){var t,r,n,i,s,a,o=0,h=0,u="data:";if(e.substr(0,u.length)===u)throw new Error("Invalid base64 input, it looks like a data url.");var l,f=3*(e=e.replace(/[^A-Za-z0-9+/=]/g,"")).length/4;if(e.charAt(e.length-1)===p.charAt(64)&&f--,e.charAt(e.length-2)===p.charAt(64)&&f--,f%1!=0)throw new Error("Invalid base64 input, bad content length.");for(l=c.uint8array?new Uint8Array(0|f):new Array(0|f);o<e.length;)t=p.indexOf(e.charAt(o++))<<2|(i=p.indexOf(e.charAt(o++)))>>4,r=(15&i)<<4|(s=p.indexOf(e.charAt(o++)))>>2,n=(3&s)<<6|(a=p.indexOf(e.charAt(o++))),l[h++]=t,64!==s&&(l[h++]=r),64!==a&&(l[h++]=n);return l}},{"./support":30,"./utils":32}],2:[function(e,t,r){"use strict";var n=e("./external"),i=e("./stream/DataWorker"),s=e("./stream/Crc32Probe"),a=e("./stream/DataLengthProbe");function o(e,t,r,n,i){this.compressedSize=e,this.uncompressedSize=t,this.crc32=r,this.compression=n,this.compressedContent=i}o.prototype={getContentWorker:function(){var e=new i(n.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new a("data_length")),t=this;return e.on("end",function(){if(this.streamInfo.data_length!==t.uncompressedSize)throw new Error("Bug : uncompressed data size mismatch")}),e},getCompressedWorker:function(){return new i(n.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize",this.compressedSize).withStreamInfo("uncompressedSize",this.uncompressedSize).withStreamInfo("crc32",this.crc32).withStreamInfo("compression",this.compression)}},o.createWorkerFrom=function(e,t,r){return e.pipe(new s).pipe(new a("uncompressedSize")).pipe(t.compressWorker(r)).pipe(new a("compressedSize")).withStreamInfo("compression",t)},t.exports=o},{"./external":6,"./stream/Crc32Probe":25,"./stream/DataLengthProbe":26,"./stream/DataWorker":27}],3:[function(e,t,r){"use strict";var n=e("./stream/GenericWorker");r.STORE={magic:"\0\0",compressWorker:function(){return new n("STORE compression")},uncompressWorker:function(){return new n("STORE decompression")}},r.DEFLATE=e("./flate")},{"./flate":7,"./stream/GenericWorker":28}],4:[function(e,t,r){"use strict";var n=e("./utils");var o=function(){for(var e,t=[],r=0;r<256;r++){e=r;for(var n=0;n<8;n++)e=1&e?3988292384^e>>>1:e>>>1;t[r]=e}return t}();t.exports=function(e,t){return void 0!==e&&e.length?"string"!==n.getTypeOf(e)?function(e,t,r,n){var i=o,s=n+r;e^=-1;for(var a=n;a<s;a++)e=e>>>8^i[255&(e^t[a])];return-1^e}(0|t,e,e.length,0):function(e,t,r,n){var i=o,s=n+r;e^=-1;for(var a=n;a<s;a++)e=e>>>8^i[255&(e^t.charCodeAt(a))];return-1^e}(0|t,e,e.length,0):0}},{"./utils":32}],5:[function(e,t,r){"use strict";r.base64=!1,r.binary=!1,r.dir=!1,r.createFolders=!0,r.date=null,r.compression=null,r.compressionOptions=null,r.comment=null,r.unixPermissions=null,r.dosPermissions=null},{}],6:[function(e,t,r){"use strict";var n=null;n="undefined"!=typeof Promise?Promise:e("lie"),t.exports={Promise:n}},{lie:37}],7:[function(e,t,r){"use strict";var n="undefined"!=typeof Uint8Array&&"undefined"!=typeof Uint16Array&&"undefined"!=typeof Uint32Array,i=e("pako"),s=e("./utils"),a=e("./stream/GenericWorker"),o=n?"uint8array":"array";function h(e,t){a.call(this,"FlateWorker/"+e),this._pako=null,this._pakoAction=e,this._pakoOptions=t,this.meta={}}r.magic="\b\0",s.inherits(h,a),h.prototype.processChunk=function(e){this.meta=e.meta,null===this._pako&&this._createPako(),this._pako.push(s.transformTo(o,e.data),!1)},h.prototype.flush=function(){a.prototype.flush.call(this),null===this._pako&&this._createPako(),this._pako.push([],!0)},h.prototype.cleanUp=function(){a.prototype.cleanUp.call(this),this._pako=null},h.prototype._createPako=function(){this._pako=new i[this._pakoAction]({raw:!0,level:this._pakoOptions.level||-1});var t=this;this._pako.onData=function(e){t.push({data:e,meta:t.meta})}},r.compressWorker=function(e){return new h("Deflate",e)},r.uncompressWorker=function(){return new h("Inflate",{})}},{"./stream/GenericWorker":28,"./utils":32,pako:38}],8:[function(e,t,r){"use strict";function A(e,t){var r,n="";for(r=0;r<t;r++)n+=String.fromCharCode(255&e),e>>>=8;return n}function n(e,t,r,n,i,s){var a,o,h=e.file,u=e.compression,l=s!==O.utf8encode,f=I.transformTo("string",s(h.name)),c=I.transformTo("string",O.utf8encode(h.name)),d=h.comment,p=I.transformTo("string",s(d)),m=I.transformTo("string",O.utf8encode(d)),_=c.length!==h.name.length,g=m.length!==d.length,b="",v="",y="",w=h.dir,k=h.date,x={crc32:0,compressedSize:0,uncompressedSize:0};t&&!r||(x.crc32=e.crc32,x.compressedSize=e.compressedSize,x.uncompressedSize=e.uncompressedSize);var S=0;t&&(S|=8),l||!_&&!g||(S|=2048);var z=0,C=0;w&&(z|=16),"UNIX"===i?(C=798,z|=function(e,t){var r=e;return e||(r=t?16893:33204),(65535&r)<<16}(h.unixPermissions,w)):(C=20,z|=function(e){return 63&(e||0)}(h.dosPermissions)),a=k.getUTCHours(),a<<=6,a|=k.getUTCMinutes(),a<<=5,a|=k.getUTCSeconds()/2,o=k.getUTCFullYear()-1980,o<<=4,o|=k.getUTCMonth()+1,o<<=5,o|=k.getUTCDate(),_&&(v=A(1,1)+A(B(f),4)+c,b+="up"+A(v.length,2)+v),g&&(y=A(1,1)+A(B(p),4)+m,b+="uc"+A(y.length,2)+y);var E="";return E+="\n\0",E+=A(S,2),E+=u.magic,E+=A(a,2),E+=A(o,2),E+=A(x.crc32,4),E+=A(x.compressedSize,4),E+=A(x.uncompressedSize,4),E+=A(f.length,2),E+=A(b.length,2),{fileRecord:R.LOCAL_FILE_HEADER+E+f+b,dirRecord:R.CENTRAL_FILE_HEADER+A(C,2)+E+A(p.length,2)+"\0\0\0\0"+A(z,4)+A(n,4)+f+b+p}}var I=e("../utils"),i=e("../stream/GenericWorker"),O=e("../utf8"),B=e("../crc32"),R=e("../signature");function s(e,t,r,n){i.call(this,"ZipFileWorker"),this.bytesWritten=0,this.zipComment=t,this.zipPlatform=r,this.encodeFileName=n,this.streamFiles=e,this.accumulate=!1,this.contentBuffer=[],this.dirRecords=[],this.currentSourceOffset=0,this.entriesCount=0,this.currentFile=null,this._sources=[]}I.inherits(s,i),s.prototype.push=function(e){var t=e.meta.percent||0,r=this.entriesCount,n=this._sources.length;this.accumulate?this.contentBuffer.push(e):(this.bytesWritten+=e.data.length,i.prototype.push.call(this,{data:e.data,meta:{currentFile:this.currentFile,percent:r?(t+100*(r-n-1))/r:100}}))},s.prototype.openedSource=function(e){this.currentSourceOffset=this.bytesWritten,this.currentFile=e.file.name;var t=this.streamFiles&&!e.file.dir;if(t){var r=n(e,t,!1,this.currentSourceOffset,this.zipPlatform,this.encodeFileName);this.push({data:r.fileRecord,meta:{percent:0}})}else this.accumulate=!0},s.prototype.closedSource=function(e){this.accumulate=!1;var t=this.streamFiles&&!e.file.dir,r=n(e,t,!0,this.currentSourceOffset,this.zipPlatform,this.encodeFileName);if(this.dirRecords.push(r.dirRecord),t)this.push({data:function(e){return R.DATA_DESCRIPTOR+A(e.crc32,4)+A(e.compressedSize,4)+A(e.uncompressedSize,4)}(e),meta:{percent:100}});else for(this.push({data:r.fileRecord,meta:{percent:0}});this.contentBuffer.length;)this.push(this.contentBuffer.shift());this.currentFile=null},s.prototype.flush=function(){for(var e=this.bytesWritten,t=0;t<this.dirRecords.length;t++)this.push({data:this.dirRecords[t],meta:{percent:100}});var r=this.bytesWritten-e,n=function(e,t,r,n,i){var s=I.transformTo("string",i(n));return R.CENTRAL_DIRECTORY_END+"\0\0\0\0"+A(e,2)+A(e,2)+A(t,4)+A(r,4)+A(s.length,2)+s}(this.dirRecords.length,r,e,this.zipComment,this.encodeFileName);this.push({data:n,meta:{percent:100}})},s.prototype.prepareNextSource=function(){this.previous=this._sources.shift(),this.openedSource(this.previous.streamInfo),this.isPaused?this.previous.pause():this.previous.resume()},s.prototype.registerPrevious=function(e){this._sources.push(e);var t=this;return e.on("data",function(e){t.processChunk(e)}),e.on("end",function(){t.closedSource(t.previous.streamInfo),t._sources.length?t.prepareNextSource():t.end()}),e.on("error",function(e){t.error(e)}),this},s.prototype.resume=function(){return!!i.prototype.resume.call(this)&&(!this.previous&&this._sources.length?(this.prepareNextSource(),!0):this.previous||this._sources.length||this.generatedError?void 0:(this.end(),!0))},s.prototype.error=function(e){var t=this._sources;if(!i.prototype.error.call(this,e))return!1;for(var r=0;r<t.length;r++)try{t[r].error(e)}catch(e){}return!0},s.prototype.lock=function(){i.prototype.lock.call(this);for(var e=this._sources,t=0;t<e.length;t++)e[t].lock()},t.exports=s},{"../crc32":4,"../signature":23,"../stream/GenericWorker":28,"../utf8":31,"../utils":32}],9:[function(e,t,r){"use strict";var u=e("../compressions"),n=e("./ZipFileWorker");r.generateWorker=function(e,a,t){var o=new n(a.streamFiles,t,a.platform,a.encodeFileName),h=0;try{e.forEach(function(e,t){h++;var r=function(e,t){var r=e||t,n=u[r];if(!n)throw new Error(r+" is not a valid compression method !");return n}(t.options.compression,a.compression),n=t.options.compressionOptions||a.compressionOptions||{},i=t.dir,s=t.date;t._compressWorker(r,n).withStreamInfo("file",{name:e,dir:i,date:s,comment:t.comment||"",unixPermissions:t.unixPermissions,dosPermissions:t.dosPermissions}).pipe(o)}),o.entriesCount=h}catch(e){o.error(e)}return o}},{"../compressions":3,"./ZipFileWorker":8}],10:[function(e,t,r){"use strict";function n(){if(!(this instanceof n))return new n;if(arguments.length)throw new Error("The constructor with parameters has been removed in JSZip 3.0, please check the upgrade guide.");this.files=Object.create(null),this.comment=null,this.root="",this.clone=function(){var e=new n;for(var t in this)"function"!=typeof this[t]&&(e[t]=this[t]);return e}}(n.prototype=e("./object")).loadAsync=e("./load"),n.support=e("./support"),n.defaults=e("./defaults"),n.version="3.10.1",n.loadAsync=function(e,t){return(new n).loadAsync(e,t)},n.external=e("./external"),t.exports=n},{"./defaults":5,"./external":6,"./load":11,"./object":15,"./support":30}],11:[function(e,t,r){"use strict";var u=e("./utils"),i=e("./external"),n=e("./utf8"),s=e("./zipEntries"),a=e("./stream/Crc32Probe"),l=e("./nodejsUtils");function f(n){return new i.Promise(function(e,t){var r=n.decompressed.getContentWorker().pipe(new a);r.on("error",function(e){t(e)}).on("end",function(){r.streamInfo.crc32!==n.decompressed.crc32?t(new Error("Corrupted zip : CRC32 mismatch")):e()}).resume()})}t.exports=function(e,o){var h=this;return o=u.extend(o||{},{base64:!1,checkCRC32:!1,optimizedBinaryString:!1,createFolders:!1,decodeFileName:n.utf8decode}),l.isNode&&l.isStream(e)?i.Promise.reject(new Error("JSZip can't accept a stream when loading a zip file.")):u.prepareContent("the loaded zip file",e,!0,o.optimizedBinaryString,o.base64).then(function(e){var t=new s(o);return t.load(e),t}).then(function(e){var t=[i.Promise.resolve(e)],r=e.files;if(o.checkCRC32)for(var n=0;n<r.length;n++)t.push(f(r[n]));return i.Promise.all(t)}).then(function(e){for(var t=e.shift(),r=t.files,n=0;n<r.length;n++){var i=r[n],s=i.fileNameStr,a=u.resolve(i.fileNameStr);h.file(a,i.decompressed,{binary:!0,optimizedBinaryString:!0,date:i.date,dir:i.dir,comment:i.fileCommentStr.length?i.fileCommentStr:null,unixPermissions:i.unixPermissions,dosPermissions:i.dosPermissions,createFolders:o.createFolders}),i.dir||(h.file(a).unsafeOriginalName=s)}return t.zipComment.length&&(h.comment=t.zipComment),h})}},{"./external":6,"./nodejsUtils":14,"./stream/Crc32Probe":25,"./utf8":31,"./utils":32,"./zipEntries":33}],12:[function(e,t,r){"use strict";var n=e("../utils"),i=e("../stream/GenericWorker");function s(e,t){i.call(this,"Nodejs stream input adapter for "+e),this._upstreamEnded=!1,this._bindStream(t)}n.inherits(s,i),s.prototype._bindStream=function(e){var t=this;(this._stream=e).pause(),e.on("data",function(e){t.push({data:e,meta:{percent:0}})}).on("error",function(e){t.isPaused?this.generatedError=e:t.error(e)}).on("end",function(){t.isPaused?t._upstreamEnded=!0:t.end()})},s.prototype.pause=function(){return!!i.prototype.pause.call(this)&&(this._stream.pause(),!0)},s.prototype.resume=function(){return!!i.prototype.resume.call(this)&&(this._upstreamEnded?this.end():this._stream.resume(),!0)},t.exports=s},{"../stream/GenericWorker":28,"../utils":32}],13:[function(e,t,r){"use strict";var i=e("readable-stream").Readable;function n(e,t,r){i.call(this,t),this._helper=e;var n=this;e.on("data",function(e,t){n.push(e)||n._helper.pause(),r&&r(t)}).on("error",function(e){n.emit("error",e)}).on("end",function(){n.push(null)})}e("../utils").inherits(n,i),n.prototype._read=function(){this._helper.resume()},t.exports=n},{"../utils":32,"readable-stream":16}],14:[function(e,t,r){"use strict";t.exports={isNode:"undefined"!=typeof Buffer,newBufferFrom:function(e,t){if(Buffer.from&&Buffer.from!==Uint8Array.from)return Buffer.from(e,t);if("number"==typeof e)throw new Error('The "data" argument must not be a number');return new Buffer(e,t)},allocBuffer:function(e){if(Buffer.alloc)return Buffer.alloc(e);var t=new Buffer(e);return t.fill(0),t},isBuffer:function(e){return Buffer.isBuffer(e)},isStream:function(e){return e&&"function"==typeof e.on&&"function"==typeof e.pause&&"function"==typeof e.resume}}},{}],15:[function(e,t,r){"use strict";function s(e,t,r){var n,i=u.getTypeOf(t),s=u.extend(r||{},f);s.date=s.date||new Date,null!==s.compression&&(s.compression=s.compression.toUpperCase()),"string"==typeof s.unixPermissions&&(s.unixPermissions=parseInt(s.unixPermissions,8)),s.unixPermissions&&16384&s.unixPermissions&&(s.dir=!0),s.dosPermissions&&16&s.dosPermissions&&(s.dir=!0),s.dir&&(e=g(e)),s.createFolders&&(n=_(e))&&b.call(this,n,!0);var a="string"===i&&!1===s.binary&&!1===s.base64;r&&void 0!==r.binary||(s.binary=!a),(t instanceof c&&0===t.uncompressedSize||s.dir||!t||0===t.length)&&(s.base64=!1,s.binary=!0,t="",s.compression="STORE",i="string");var o=null;o=t instanceof c||t instanceof l?t:p.isNode&&p.isStream(t)?new m(e,t):u.prepareContent(e,t,s.binary,s.optimizedBinaryString,s.base64);var h=new d(e,o,s);this.files[e]=h}var i=e("./utf8"),u=e("./utils"),l=e("./stream/GenericWorker"),a=e("./stream/StreamHelper"),f=e("./defaults"),c=e("./compressedObject"),d=e("./zipObject"),o=e("./generate"),p=e("./nodejsUtils"),m=e("./nodejs/NodejsStreamInputAdapter"),_=function(e){"/"===e.slice(-1)&&(e=e.substring(0,e.length-1));var t=e.lastIndexOf("/");return 0<t?e.substring(0,t):""},g=function(e){return"/"!==e.slice(-1)&&(e+="/"),e},b=function(e,t){return t=void 0!==t?t:f.createFolders,e=g(e),this.files[e]||s.call(this,e,null,{dir:!0,createFolders:t}),this.files[e]};function h(e){return"[object RegExp]"===Object.prototype.toString.call(e)}var n={load:function(){throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")},forEach:function(e){var t,r,n;for(t in this.files)n=this.files[t],(r=t.slice(this.root.length,t.length))&&t.slice(0,this.root.length)===this.root&&e(r,n)},filter:function(r){var n=[];return this.forEach(function(e,t){r(e,t)&&n.push(t)}),n},file:function(e,t,r){if(1!==arguments.length)return e=this.root+e,s.call(this,e,t,r),this;if(h(e)){var n=e;return this.filter(function(e,t){return!t.dir&&n.test(e)})}var i=this.files[this.root+e];return i&&!i.dir?i:null},folder:function(r){if(!r)return this;if(h(r))return this.filter(function(e,t){return t.dir&&r.test(e)});var e=this.root+r,t=b.call(this,e),n=this.clone();return n.root=t.name,n},remove:function(r){r=this.root+r;var e=this.files[r];if(e||("/"!==r.slice(-1)&&(r+="/"),e=this.files[r]),e&&!e.dir)delete this.files[r];else for(var t=this.filter(function(e,t){return t.name.slice(0,r.length)===r}),n=0;n<t.length;n++)delete this.files[t[n].name];return this},generate:function(){throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")},generateInternalStream:function(e){var t,r={};try{if((r=u.extend(e||{},{streamFiles:!1,compression:"STORE",compressionOptions:null,type:"",platform:"DOS",comment:null,mimeType:"application/zip",encodeFileName:i.utf8encode})).type=r.type.toLowerCase(),r.compression=r.compression.toUpperCase(),"binarystring"===r.type&&(r.type="string"),!r.type)throw new Error("No output type specified.");u.checkSupport(r.type),"darwin"!==r.platform&&"freebsd"!==r.platform&&"linux"!==r.platform&&"sunos"!==r.platform||(r.platform="UNIX"),"win32"===r.platform&&(r.platform="DOS");var n=r.comment||this.comment||"";t=o.generateWorker(this,r,n)}catch(e){(t=new l("error")).error(e)}return new a(t,r.type||"string",r.mimeType)},generateAsync:function(e,t){return this.generateInternalStream(e).accumulate(t)},generateNodeStream:function(e,t){return(e=e||{}).type||(e.type="nodebuffer"),this.generateInternalStream(e).toNodejsStream(t)}};t.exports=n},{"./compressedObject":2,"./defaults":5,"./generate":9,"./nodejs/NodejsStreamInputAdapter":12,"./nodejsUtils":14,"./stream/GenericWorker":28,"./stream/StreamHelper":29,"./utf8":31,"./utils":32,"./zipObject":35}],16:[function(e,t,r){"use strict";t.exports=e("stream")},{stream:void 0}],17:[function(e,t,r){"use strict";var n=e("./DataReader");function i(e){n.call(this,e);for(var t=0;t<this.data.length;t++)e[t]=255&e[t]}e("../utils").inherits(i,n),i.prototype.byteAt=function(e){return this.data[this.zero+e]},i.prototype.lastIndexOfSignature=function(e){for(var t=e.charCodeAt(0),r=e.charCodeAt(1),n=e.charCodeAt(2),i=e.charCodeAt(3),s=this.length-4;0<=s;--s)if(this.data[s]===t&&this.data[s+1]===r&&this.data[s+2]===n&&this.data[s+3]===i)return s-this.zero;return-1},i.prototype.readAndCheckSignature=function(e){var t=e.charCodeAt(0),r=e.charCodeAt(1),n=e.charCodeAt(2),i=e.charCodeAt(3),s=this.readData(4);return t===s[0]&&r===s[1]&&n===s[2]&&i===s[3]},i.prototype.readData=function(e){if(this.checkOffset(e),0===e)return[];var t=this.data.slice(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./DataReader":18}],18:[function(e,t,r){"use strict";var n=e("../utils");function i(e){this.data=e,this.length=e.length,this.index=0,this.zero=0}i.prototype={checkOffset:function(e){this.checkIndex(this.index+e)},checkIndex:function(e){if(this.length<this.zero+e||e<0)throw new Error("End of data reached (data length = "+this.length+", asked index = "+e+"). Corrupted zip ?")},setIndex:function(e){this.checkIndex(e),this.index=e},skip:function(e){this.setIndex(this.index+e)},byteAt:function(){},readInt:function(e){var t,r=0;for(this.checkOffset(e),t=this.index+e-1;t>=this.index;t--)r=(r<<8)+this.byteAt(t);return this.index+=e,r},readString:function(e){return n.transformTo("string",this.readData(e))},readData:function(){},lastIndexOfSignature:function(){},readAndCheckSignature:function(){},readDate:function(){var e=this.readInt(4);return new Date(Date.UTC(1980+(e>>25&127),(e>>21&15)-1,e>>16&31,e>>11&31,e>>5&63,(31&e)<<1))}},t.exports=i},{"../utils":32}],19:[function(e,t,r){"use strict";var n=e("./Uint8ArrayReader");function i(e){n.call(this,e)}e("../utils").inherits(i,n),i.prototype.readData=function(e){this.checkOffset(e);var t=this.data.slice(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./Uint8ArrayReader":21}],20:[function(e,t,r){"use strict";var n=e("./DataReader");function i(e){n.call(this,e)}e("../utils").inherits(i,n),i.prototype.byteAt=function(e){return this.data.charCodeAt(this.zero+e)},i.prototype.lastIndexOfSignature=function(e){return this.data.lastIndexOf(e)-this.zero},i.prototype.readAndCheckSignature=function(e){return e===this.readData(4)},i.prototype.readData=function(e){this.checkOffset(e);var t=this.data.slice(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./DataReader":18}],21:[function(e,t,r){"use strict";var n=e("./ArrayReader");function i(e){n.call(this,e)}e("../utils").inherits(i,n),i.prototype.readData=function(e){if(this.checkOffset(e),0===e)return new Uint8Array(0);var t=this.data.subarray(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./ArrayReader":17}],22:[function(e,t,r){"use strict";var n=e("../utils"),i=e("../support"),s=e("./ArrayReader"),a=e("./StringReader"),o=e("./NodeBufferReader"),h=e("./Uint8ArrayReader");t.exports=function(e){var t=n.getTypeOf(e);return n.checkSupport(t),"string"!==t||i.uint8array?"nodebuffer"===t?new o(e):i.uint8array?new h(n.transformTo("uint8array",e)):new s(n.transformTo("array",e)):new a(e)}},{"../support":30,"../utils":32,"./ArrayReader":17,"./NodeBufferReader":19,"./StringReader":20,"./Uint8ArrayReader":21}],23:[function(e,t,r){"use strict";r.LOCAL_FILE_HEADER="PK",r.CENTRAL_FILE_HEADER="PK",r.CENTRAL_DIRECTORY_END="PK",r.ZIP64_CENTRAL_DIRECTORY_LOCATOR="PK",r.ZIP64_CENTRAL_DIRECTORY_END="PK",r.DATA_DESCRIPTOR="PK\b"},{}],24:[function(e,t,r){"use strict";var n=e("./GenericWorker"),i=e("../utils");function s(e){n.call(this,"ConvertWorker to "+e),this.destType=e}i.inherits(s,n),s.prototype.processChunk=function(e){this.push({data:i.transformTo(this.destType,e.data),meta:e.meta})},t.exports=s},{"../utils":32,"./GenericWorker":28}],25:[function(e,t,r){"use strict";var n=e("./GenericWorker"),i=e("../crc32");function s(){n.call(this,"Crc32Probe"),this.withStreamInfo("crc32",0)}e("../utils").inherits(s,n),s.prototype.processChunk=function(e){this.streamInfo.crc32=i(e.data,this.streamInfo.crc32||0),this.push(e)},t.exports=s},{"../crc32":4,"../utils":32,"./GenericWorker":28}],26:[function(e,t,r){"use strict";var n=e("../utils"),i=e("./GenericWorker");function s(e){i.call(this,"DataLengthProbe for "+e),this.propName=e,this.withStreamInfo(e,0)}n.inherits(s,i),s.prototype.processChunk=function(e){if(e){var t=this.streamInfo[this.propName]||0;this.streamInfo[this.propName]=t+e.data.length}i.prototype.processChunk.call(this,e)},t.exports=s},{"../utils":32,"./GenericWorker":28}],27:[function(e,t,r){"use strict";var n=e("../utils"),i=e("./GenericWorker");function s(e){i.call(this,"DataWorker");var t=this;this.dataIsReady=!1,this.index=0,this.max=0,this.data=null,this.type="",this._tickScheduled=!1,e.then(function(e){t.dataIsReady=!0,t.data=e,t.max=e&&e.length||0,t.type=n.getTypeOf(e),t.isPaused||t._tickAndRepeat()},function(e){t.error(e)})}n.inherits(s,i),s.prototype.cleanUp=function(){i.prototype.cleanUp.call(this),this.data=null},s.prototype.resume=function(){return!!i.prototype.resume.call(this)&&(!this._tickScheduled&&this.dataIsReady&&(this._tickScheduled=!0,n.delay(this._tickAndRepeat,[],this)),!0)},s.prototype._tickAndRepeat=function(){this._tickScheduled=!1,this.isPaused||this.isFinished||(this._tick(),this.isFinished||(n.delay(this._tickAndRepeat,[],this),this._tickScheduled=!0))},s.prototype._tick=function(){if(this.isPaused||this.isFinished)return!1;var e=null,t=Math.min(this.max,this.index+16384);if(this.index>=this.max)return this.end();switch(this.type){case"string":e=this.data.substring(this.index,t);break;case"uint8array":e=this.data.subarray(this.index,t);break;case"array":case"nodebuffer":e=this.data.slice(this.index,t)}return this.index=t,this.push({data:e,meta:{percent:this.max?this.index/this.max*100:0}})},t.exports=s},{"../utils":32,"./GenericWorker":28}],28:[function(e,t,r){"use strict";function n(e){this.name=e||"default",this.streamInfo={},this.generatedError=null,this.extraStreamInfo={},this.isPaused=!0,this.isFinished=!1,this.isLocked=!1,this._listeners={data:[],end:[],error:[]},this.previous=null}n.prototype={push:function(e){this.emit("data",e)},end:function(){if(this.isFinished)return!1;this.flush();try{this.emit("end"),this.cleanUp(),this.isFinished=!0}catch(e){this.emit("error",e)}return!0},error:function(e){return!this.isFinished&&(this.isPaused?this.generatedError=e:(this.isFinished=!0,this.emit("error",e),this.previous&&this.previous.error(e),this.cleanUp()),!0)},on:function(e,t){return this._listeners[e].push(t),this},cleanUp:function(){this.streamInfo=this.generatedError=this.extraStreamInfo=null,this._listeners=[]},emit:function(e,t){if(this._listeners[e])for(var r=0;r<this._listeners[e].length;r++)this._listeners[e][r].call(this,t)},pipe:function(e){return e.registerPrevious(this)},registerPrevious:function(e){if(this.isLocked)throw new Error("The stream '"+this+"' has already been used.");this.streamInfo=e.streamInfo,this.mergeStreamInfo(),this.previous=e;var t=this;return e.on("data",function(e){t.processChunk(e)}),e.on("end",function(){t.end()}),e.on("error",function(e){t.error(e)}),this},pause:function(){return!this.isPaused&&!this.isFinished&&(this.isPaused=!0,this.previous&&this.previous.pause(),!0)},resume:function(){if(!this.isPaused||this.isFinished)return!1;var e=this.isPaused=!1;return this.generatedError&&(this.error(this.generatedError),e=!0),this.previous&&this.previous.resume(),!e},flush:function(){},processChunk:function(e){this.push(e)},withStreamInfo:function(e,t){return this.extraStreamInfo[e]=t,this.mergeStreamInfo(),this},mergeStreamInfo:function(){for(var e in this.extraStreamInfo)Object.prototype.hasOwnProperty.call(this.extraStreamInfo,e)&&(this.streamInfo[e]=this.extraStreamInfo[e])},lock:function(){if(this.isLocked)throw new Error("The stream '"+this+"' has already been used.");this.isLocked=!0,this.previous&&this.previous.lock()},toString:function(){var e="Worker "+this.name;return this.previous?this.previous+" -> "+e:e}},t.exports=n},{}],29:[function(e,t,r){"use strict";var h=e("../utils"),i=e("./ConvertWorker"),s=e("./GenericWorker"),u=e("../base64"),n=e("../support"),a=e("../external"),o=null;if(n.nodestream)try{o=e("../nodejs/NodejsStreamOutputAdapter")}catch(e){}function l(e,o){return new a.Promise(function(t,r){var n=[],i=e._internalType,s=e._outputType,a=e._mimeType;e.on("data",function(e,t){n.push(e),o&&o(t)}).on("error",function(e){n=[],r(e)}).on("end",function(){try{var e=function(e,t,r){switch(e){case"blob":return h.newBlob(h.transformTo("arraybuffer",t),r);case"base64":return u.encode(t);default:return h.transformTo(e,t)}}(s,function(e,t){var r,n=0,i=null,s=0;for(r=0;r<t.length;r++)s+=t[r].length;switch(e){case"string":return t.join("");case"array":return Array.prototype.concat.apply([],t);case"uint8array":for(i=new Uint8Array(s),r=0;r<t.length;r++)i.set(t[r],n),n+=t[r].length;return i;case"nodebuffer":return Buffer.concat(t);default:throw new Error("concat : unsupported type '"+e+"'")}}(i,n),a);t(e)}catch(e){r(e)}n=[]}).resume()})}function f(e,t,r){var n=t;switch(t){case"blob":case"arraybuffer":n="uint8array";break;case"base64":n="string"}try{this._internalType=n,this._outputType=t,this._mimeType=r,h.checkSupport(n),this._worker=e.pipe(new i(n)),e.lock()}catch(e){this._worker=new s("error"),this._worker.error(e)}}f.prototype={accumulate:function(e){return l(this,e)},on:function(e,t){var r=this;return"data"===e?this._worker.on(e,function(e){t.call(r,e.data,e.meta)}):this._worker.on(e,function(){h.delay(t,arguments,r)}),this},resume:function(){return h.delay(this._worker.resume,[],this._worker),this},pause:function(){return this._worker.pause(),this},toNodejsStream:function(e){if(h.checkSupport("nodestream"),"nodebuffer"!==this._outputType)throw new Error(this._outputType+" is not supported by this method");return new o(this,{objectMode:"nodebuffer"!==this._outputType},e)}},t.exports=f},{"../base64":1,"../external":6,"../nodejs/NodejsStreamOutputAdapter":13,"../support":30,"../utils":32,"./ConvertWorker":24,"./GenericWorker":28}],30:[function(e,t,r){"use strict";if(r.base64=!0,r.array=!0,r.string=!0,r.arraybuffer="undefined"!=typeof ArrayBuffer&&"undefined"!=typeof Uint8Array,r.nodebuffer="undefined"!=typeof Buffer,r.uint8array="undefined"!=typeof Uint8Array,"undefined"==typeof ArrayBuffer)r.blob=!1;else{var n=new ArrayBuffer(0);try{r.blob=0===new Blob([n],{type:"application/zip"}).size}catch(e){try{var i=new(self.BlobBuilder||self.WebKitBlobBuilder||self.MozBlobBuilder||self.MSBlobBuilder);i.append(n),r.blob=0===i.getBlob("application/zip").size}catch(e){r.blob=!1}}}try{r.nodestream=!!e("readable-stream").Readable}catch(e){r.nodestream=!1}},{"readable-stream":16}],31:[function(e,t,s){"use strict";for(var o=e("./utils"),h=e("./support"),r=e("./nodejsUtils"),n=e("./stream/GenericWorker"),u=new Array(256),i=0;i<256;i++)u[i]=252<=i?6:248<=i?5:240<=i?4:224<=i?3:192<=i?2:1;u[254]=u[254]=1;function a(){n.call(this,"utf-8 decode"),this.leftOver=null}function l(){n.call(this,"utf-8 encode")}s.utf8encode=function(e){return h.nodebuffer?r.newBufferFrom(e,"utf-8"):function(e){var t,r,n,i,s,a=e.length,o=0;for(i=0;i<a;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),o+=r<128?1:r<2048?2:r<65536?3:4;for(t=h.uint8array?new Uint8Array(o):new Array(o),i=s=0;s<o;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),r<128?t[s++]=r:(r<2048?t[s++]=192|r>>>6:(r<65536?t[s++]=224|r>>>12:(t[s++]=240|r>>>18,t[s++]=128|r>>>12&63),t[s++]=128|r>>>6&63),t[s++]=128|63&r);return t}(e)},s.utf8decode=function(e){return h.nodebuffer?o.transformTo("nodebuffer",e).toString("utf-8"):function(e){var t,r,n,i,s=e.length,a=new Array(2*s);for(t=r=0;t<s;)if((n=e[t++])<128)a[r++]=n;else if(4<(i=u[n]))a[r++]=65533,t+=i-1;else{for(n&=2===i?31:3===i?15:7;1<i&&t<s;)n=n<<6|63&e[t++],i--;1<i?a[r++]=65533:n<65536?a[r++]=n:(n-=65536,a[r++]=55296|n>>10&1023,a[r++]=56320|1023&n)}return a.length!==r&&(a.subarray?a=a.subarray(0,r):a.length=r),o.applyFromCharCode(a)}(e=o.transformTo(h.uint8array?"uint8array":"array",e))},o.inherits(a,n),a.prototype.processChunk=function(e){var t=o.transformTo(h.uint8array?"uint8array":"array",e.data);if(this.leftOver&&this.leftOver.length){if(h.uint8array){var r=t;(t=new Uint8Array(r.length+this.leftOver.length)).set(this.leftOver,0),t.set(r,this.leftOver.length)}else t=this.leftOver.concat(t);this.leftOver=null}var n=function(e,t){var r;for((t=t||e.length)>e.length&&(t=e.length),r=t-1;0<=r&&128==(192&e[r]);)r--;return r<0?t:0===r?t:r+u[e[r]]>t?r:t}(t),i=t;n!==t.length&&(h.uint8array?(i=t.subarray(0,n),this.leftOver=t.subarray(n,t.length)):(i=t.slice(0,n),this.leftOver=t.slice(n,t.length))),this.push({data:s.utf8decode(i),meta:e.meta})},a.prototype.flush=function(){this.leftOver&&this.leftOver.length&&(this.push({data:s.utf8decode(this.leftOver),meta:{}}),this.leftOver=null)},s.Utf8DecodeWorker=a,o.inherits(l,n),l.prototype.processChunk=function(e){this.push({data:s.utf8encode(e.data),meta:e.meta})},s.Utf8EncodeWorker=l},{"./nodejsUtils":14,"./stream/GenericWorker":28,"./support":30,"./utils":32}],32:[function(e,t,a){"use strict";var o=e("./support"),h=e("./base64"),r=e("./nodejsUtils"),u=e("./external");function n(e){return e}function l(e,t){for(var r=0;r<e.length;++r)t[r]=255&e.charCodeAt(r);return t}e("setimmediate"),a.newBlob=function(t,r){a.checkSupport("blob");try{return new Blob([t],{type:r})}catch(e){try{var n=new(self.BlobBuilder||self.WebKitBlobBuilder||self.MozBlobBuilder||self.MSBlobBuilder);return n.append(t),n.getBlob(r)}catch(e){throw new Error("Bug : can't construct the Blob.")}}};var i={stringifyByChunk:function(e,t,r){var n=[],i=0,s=e.length;if(s<=r)return String.fromCharCode.apply(null,e);for(;i<s;)"array"===t||"nodebuffer"===t?n.push(String.fromCharCode.apply(null,e.slice(i,Math.min(i+r,s)))):n.push(String.fromCharCode.apply(null,e.subarray(i,Math.min(i+r,s)))),i+=r;return n.join("")},stringifyByChar:function(e){for(var t="",r=0;r<e.length;r++)t+=String.fromCharCode(e[r]);return t},applyCanBeUsed:{uint8array:function(){try{return o.uint8array&&1===String.fromCharCode.apply(null,new Uint8Array(1)).length}catch(e){return!1}}(),nodebuffer:function(){try{return o.nodebuffer&&1===String.fromCharCode.apply(null,r.allocBuffer(1)).length}catch(e){return!1}}()}};function s(e){var t=65536,r=a.getTypeOf(e),n=!0;if("uint8array"===r?n=i.applyCanBeUsed.uint8array:"nodebuffer"===r&&(n=i.applyCanBeUsed.nodebuffer),n)for(;1<t;)try{return i.stringifyByChunk(e,r,t)}catch(e){t=Math.floor(t/2)}return i.stringifyByChar(e)}function f(e,t){for(var r=0;r<e.length;r++)t[r]=e[r];return t}a.applyFromCharCode=s;var c={};c.string={string:n,array:function(e){return l(e,new Array(e.length))},arraybuffer:function(e){return c.string.uint8array(e).buffer},uint8array:function(e){return l(e,new Uint8Array(e.length))},nodebuffer:function(e){return l(e,r.allocBuffer(e.length))}},c.array={string:s,array:n,arraybuffer:function(e){return new Uint8Array(e).buffer},uint8array:function(e){return new Uint8Array(e)},nodebuffer:function(e){return r.newBufferFrom(e)}},c.arraybuffer={string:function(e){return s(new Uint8Array(e))},array:function(e){return f(new Uint8Array(e),new Array(e.byteLength))},arraybuffer:n,uint8array:function(e){return new Uint8Array(e)},nodebuffer:function(e){return r.newBufferFrom(new Uint8Array(e))}},c.uint8array={string:s,array:function(e){return f(e,new Array(e.length))},arraybuffer:function(e){return e.buffer},uint8array:n,nodebuffer:function(e){return r.newBufferFrom(e)}},c.nodebuffer={string:s,array:function(e){return f(e,new Array(e.length))},arraybuffer:function(e){return c.nodebuffer.uint8array(e).buffer},uint8array:function(e){return f(e,new Uint8Array(e.length))},nodebuffer:n},a.transformTo=function(e,t){if(t=t||"",!e)return t;a.checkSupport(e);var r=a.getTypeOf(t);return c[r][e](t)},a.resolve=function(e){for(var t=e.split("/"),r=[],n=0;n<t.length;n++){var i=t[n];"."===i||""===i&&0!==n&&n!==t.length-1||(".."===i?r.pop():r.push(i))}return r.join("/")},a.getTypeOf=function(e){return"string"==typeof e?"string":"[object Array]"===Object.prototype.toString.call(e)?"array":o.nodebuffer&&r.isBuffer(e)?"nodebuffer":o.uint8array&&e instanceof Uint8Array?"uint8array":o.arraybuffer&&e instanceof ArrayBuffer?"arraybuffer":void 0},a.checkSupport=function(e){if(!o[e.toLowerCase()])throw new Error(e+" is not supported by this platform")},a.MAX_VALUE_16BITS=65535,a.MAX_VALUE_32BITS=-1,a.pretty=function(e){var t,r,n="";for(r=0;r<(e||"").length;r++)n+="\\x"+((t=e.charCodeAt(r))<16?"0":"")+t.toString(16).toUpperCase();return n},a.delay=function(e,t,r){setImmediate(function(){e.apply(r||null,t||[])})},a.inherits=function(e,t){function r(){}r.prototype=t.prototype,e.prototype=new r},a.extend=function(){var e,t,r={};for(e=0;e<arguments.length;e++)for(t in arguments[e])Object.prototype.hasOwnProperty.call(arguments[e],t)&&void 0===r[t]&&(r[t]=arguments[e][t]);return r},a.prepareContent=function(r,e,n,i,s){return u.Promise.resolve(e).then(function(n){return o.blob&&(n instanceof Blob||-1!==["[object File]","[object Blob]"].indexOf(Object.prototype.toString.call(n)))&&"undefined"!=typeof FileReader?new u.Promise(function(t,r){var e=new FileReader;e.onload=function(e){t(e.target.result)},e.onerror=function(e){r(e.target.error)},e.readAsArrayBuffer(n)}):n}).then(function(e){var t=a.getTypeOf(e);return t?("arraybuffer"===t?e=a.transformTo("uint8array",e):"string"===t&&(s?e=h.decode(e):n&&!0!==i&&(e=function(e){return l(e,o.uint8array?new Uint8Array(e.length):new Array(e.length))}(e))),e):u.Promise.reject(new Error("Can't read the data of '"+r+"'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?"))})}},{"./base64":1,"./external":6,"./nodejsUtils":14,"./support":30,setimmediate:54}],33:[function(e,t,r){"use strict";var n=e("./reader/readerFor"),i=e("./utils"),s=e("./signature"),a=e("./zipEntry"),o=e("./support");function h(e){this.files=[],this.loadOptions=e}h.prototype={checkSignature:function(e){if(!this.reader.readAndCheckSignature(e)){this.reader.index-=4;var t=this.reader.readString(4);throw new Error("Corrupted zip or bug: unexpected signature ("+i.pretty(t)+", expected "+i.pretty(e)+")")}},isSignature:function(e,t){var r=this.reader.index;this.reader.setIndex(e);var n=this.reader.readString(4)===t;return this.reader.setIndex(r),n},readBlockEndOfCentral:function(){this.diskNumber=this.reader.readInt(2),this.diskWithCentralDirStart=this.reader.readInt(2),this.centralDirRecordsOnThisDisk=this.reader.readInt(2),this.centralDirRecords=this.reader.readInt(2),this.centralDirSize=this.reader.readInt(4),this.centralDirOffset=this.reader.readInt(4),this.zipCommentLength=this.reader.readInt(2);var e=this.reader.readData(this.zipCommentLength),t=o.uint8array?"uint8array":"array",r=i.transformTo(t,e);this.zipComment=this.loadOptions.decodeFileName(r)},readBlockZip64EndOfCentral:function(){this.zip64EndOfCentralSize=this.reader.readInt(8),this.reader.skip(4),this.diskNumber=this.reader.readInt(4),this.diskWithCentralDirStart=this.reader.readInt(4),this.centralDirRecordsOnThisDisk=this.reader.readInt(8),this.centralDirRecords=this.reader.readInt(8),this.centralDirSize=this.reader.readInt(8),this.centralDirOffset=this.reader.readInt(8),this.zip64ExtensibleData={};for(var e,t,r,n=this.zip64EndOfCentralSize-44;0<n;)e=this.reader.readInt(2),t=this.reader.readInt(4),r=this.reader.readData(t),this.zip64ExtensibleData[e]={id:e,length:t,value:r}},readBlockZip64EndOfCentralLocator:function(){if(this.diskWithZip64CentralDirStart=this.reader.readInt(4),this.relativeOffsetEndOfZip64CentralDir=this.reader.readInt(8),this.disksCount=this.reader.readInt(4),1<this.disksCount)throw new Error("Multi-volumes zip are not supported")},readLocalFiles:function(){var e,t;for(e=0;e<this.files.length;e++)t=this.files[e],this.reader.setIndex(t.localHeaderOffset),this.checkSignature(s.LOCAL_FILE_HEADER),t.readLocalPart(this.reader),t.handleUTF8(),t.processAttributes()},readCentralDir:function(){var e;for(this.reader.setIndex(this.centralDirOffset);this.reader.readAndCheckSignature(s.CENTRAL_FILE_HEADER);)(e=new a({zip64:this.zip64},this.loadOptions)).readCentralPart(this.reader),this.files.push(e);if(this.centralDirRecords!==this.files.length&&0!==this.centralDirRecords&&0===this.files.length)throw new Error("Corrupted zip or bug: expected "+this.centralDirRecords+" records in central dir, got "+this.files.length)},readEndOfCentral:function(){var e=this.reader.lastIndexOfSignature(s.CENTRAL_DIRECTORY_END);if(e<0)throw!this.isSignature(0,s.LOCAL_FILE_HEADER)?new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html"):new Error("Corrupted zip: can't find end of central directory");this.reader.setIndex(e);var t=e;if(this.checkSignature(s.CENTRAL_DIRECTORY_END),this.readBlockEndOfCentral(),this.diskNumber===i.MAX_VALUE_16BITS||this.diskWithCentralDirStart===i.MAX_VALUE_16BITS||this.centralDirRecordsOnThisDisk===i.MAX_VALUE_16BITS||this.centralDirRecords===i.MAX_VALUE_16BITS||this.centralDirSize===i.MAX_VALUE_32BITS||this.centralDirOffset===i.MAX_VALUE_32BITS){if(this.zip64=!0,(e=this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR))<0)throw new Error("Corrupted zip: can't find the ZIP64 end of central directory locator");if(this.reader.setIndex(e),this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR),this.readBlockZip64EndOfCentralLocator(),!this.isSignature(this.relativeOffsetEndOfZip64CentralDir,s.ZIP64_CENTRAL_DIRECTORY_END)&&(this.relativeOffsetEndOfZip64CentralDir=this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_END),this.relativeOffsetEndOfZip64CentralDir<0))throw new Error("Corrupted zip: can't find the ZIP64 end of central directory");this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir),this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_END),this.readBlockZip64EndOfCentral()}var r=this.centralDirOffset+this.centralDirSize;this.zip64&&(r+=20,r+=12+this.zip64EndOfCentralSize);var n=t-r;if(0<n)this.isSignature(t,s.CENTRAL_FILE_HEADER)||(this.reader.zero=n);else if(n<0)throw new Error("Corrupted zip: missing "+Math.abs(n)+" bytes.")},prepareReader:function(e){this.reader=n(e)},load:function(e){this.prepareReader(e),this.readEndOfCentral(),this.readCentralDir(),this.readLocalFiles()}},t.exports=h},{"./reader/readerFor":22,"./signature":23,"./support":30,"./utils":32,"./zipEntry":34}],34:[function(e,t,r){"use strict";var n=e("./reader/readerFor"),s=e("./utils"),i=e("./compressedObject"),a=e("./crc32"),o=e("./utf8"),h=e("./compressions"),u=e("./support");function l(e,t){this.options=e,this.loadOptions=t}l.prototype={isEncrypted:function(){return 1==(1&this.bitFlag)},useUTF8:function(){return 2048==(2048&this.bitFlag)},readLocalPart:function(e){var t,r;if(e.skip(22),this.fileNameLength=e.readInt(2),r=e.readInt(2),this.fileName=e.readData(this.fileNameLength),e.skip(r),-1===this.compressedSize||-1===this.uncompressedSize)throw new Error("Bug or corrupted zip : didn't get enough information from the central directory (compressedSize === -1 || uncompressedSize === -1)");if(null===(t=function(e){for(var t in h)if(Object.prototype.hasOwnProperty.call(h,t)&&h[t].magic===e)return h[t];return null}(this.compressionMethod)))throw new Error("Corrupted zip : compression "+s.pretty(this.compressionMethod)+" unknown (inner file : "+s.transformTo("string",this.fileName)+")");this.decompressed=new i(this.compressedSize,this.uncompressedSize,this.crc32,t,e.readData(this.compressedSize))},readCentralPart:function(e){this.versionMadeBy=e.readInt(2),e.skip(2),this.bitFlag=e.readInt(2),this.compressionMethod=e.readString(2),this.date=e.readDate(),this.crc32=e.readInt(4),this.compressedSize=e.readInt(4),this.uncompressedSize=e.readInt(4);var t=e.readInt(2);if(this.extraFieldsLength=e.readInt(2),this.fileCommentLength=e.readInt(2),this.diskNumberStart=e.readInt(2),this.internalFileAttributes=e.readInt(2),this.externalFileAttributes=e.readInt(4),this.localHeaderOffset=e.readInt(4),this.isEncrypted())throw new Error("Encrypted zip are not supported");e.skip(t),this.readExtraFields(e),this.parseZIP64ExtraField(e),this.fileComment=e.readData(this.fileCommentLength)},processAttributes:function(){this.unixPermissions=null,this.dosPermissions=null;var e=this.versionMadeBy>>8;this.dir=!!(16&this.externalFileAttributes),0==e&&(this.dosPermissions=63&this.externalFileAttributes),3==e&&(this.unixPermissions=this.externalFileAttributes>>16&65535),this.dir||"/"!==this.fileNameStr.slice(-1)||(this.dir=!0)},parseZIP64ExtraField:function(){if(this.extraFields[1]){var e=n(this.extraFields[1].value);this.uncompressedSize===s.MAX_VALUE_32BITS&&(this.uncompressedSize=e.readInt(8)),this.compressedSize===s.MAX_VALUE_32BITS&&(this.compressedSize=e.readInt(8)),this.localHeaderOffset===s.MAX_VALUE_32BITS&&(this.localHeaderOffset=e.readInt(8)),this.diskNumberStart===s.MAX_VALUE_32BITS&&(this.diskNumberStart=e.readInt(4))}},readExtraFields:function(e){var t,r,n,i=e.index+this.extraFieldsLength;for(this.extraFields||(this.extraFields={});e.index+4<i;)t=e.readInt(2),r=e.readInt(2),n=e.readData(r),this.extraFields[t]={id:t,length:r,value:n};e.setIndex(i)},handleUTF8:function(){var e=u.uint8array?"uint8array":"array";if(this.useUTF8())this.fileNameStr=o.utf8decode(this.fileName),this.fileCommentStr=o.utf8decode(this.fileComment);else{var t=this.findExtraFieldUnicodePath();if(null!==t)this.fileNameStr=t;else{var r=s.transformTo(e,this.fileName);this.fileNameStr=this.loadOptions.decodeFileName(r)}var n=this.findExtraFieldUnicodeComment();if(null!==n)this.fileCommentStr=n;else{var i=s.transformTo(e,this.fileComment);this.fileCommentStr=this.loadOptions.decodeFileName(i)}}},findExtraFieldUnicodePath:function(){var e=this.extraFields[28789];if(e){var t=n(e.value);return 1!==t.readInt(1)?null:a(this.fileName)!==t.readInt(4)?null:o.utf8decode(t.readData(e.length-5))}return null},findExtraFieldUnicodeComment:function(){var e=this.extraFields[25461];if(e){var t=n(e.value);return 1!==t.readInt(1)?null:a(this.fileComment)!==t.readInt(4)?null:o.utf8decode(t.readData(e.length-5))}return null}},t.exports=l},{"./compressedObject":2,"./compressions":3,"./crc32":4,"./reader/readerFor":22,"./support":30,"./utf8":31,"./utils":32}],35:[function(e,t,r){"use strict";function n(e,t,r){this.name=e,this.dir=r.dir,this.date=r.date,this.comment=r.comment,this.unixPermissions=r.unixPermissions,this.dosPermissions=r.dosPermissions,this._data=t,this._dataBinary=r.binary,this.options={compression:r.compression,compressionOptions:r.compressionOptions}}var s=e("./stream/StreamHelper"),i=e("./stream/DataWorker"),a=e("./utf8"),o=e("./compressedObject"),h=e("./stream/GenericWorker");n.prototype={internalStream:function(e){var t=null,r="string";try{if(!e)throw new Error("No output type specified.");var n="string"===(r=e.toLowerCase())||"text"===r;"binarystring"!==r&&"text"!==r||(r="string"),t=this._decompressWorker();var i=!this._dataBinary;i&&!n&&(t=t.pipe(new a.Utf8EncodeWorker)),!i&&n&&(t=t.pipe(new a.Utf8DecodeWorker))}catch(e){(t=new h("error")).error(e)}return new s(t,r,"")},async:function(e,t){return this.internalStream(e).accumulate(t)},nodeStream:function(e,t){return this.internalStream(e||"nodebuffer").toNodejsStream(t)},_compressWorker:function(e,t){if(this._data instanceof o&&this._data.compression.magic===e.magic)return this._data.getCompressedWorker();var r=this._decompressWorker();return this._dataBinary||(r=r.pipe(new a.Utf8EncodeWorker)),o.createWorkerFrom(r,e,t)},_decompressWorker:function(){return this._data instanceof o?this._data.getContentWorker():this._data instanceof h?this._data:new i(this._data)}};for(var u=["asText","asBinary","asNodeBuffer","asUint8Array","asArrayBuffer"],l=function(){throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")},f=0;f<u.length;f++)n.prototype[u[f]]=l;t.exports=n},{"./compressedObject":2,"./stream/DataWorker":27,"./stream/GenericWorker":28,"./stream/StreamHelper":29,"./utf8":31}],36:[function(e,l,t){(function(t){"use strict";var r,n,e=t.MutationObserver||t.WebKitMutationObserver;if(e){var i=0,s=new e(u),a=t.document.createTextNode("");s.observe(a,{characterData:!0}),r=function(){a.data=i=++i%2}}else if(t.setImmediate||void 0===t.MessageChannel)r="document"in t&&"onreadystatechange"in t.document.createElement("script")?function(){var e=t.document.createElement("script");e.onreadystatechange=function(){u(),e.onreadystatechange=null,e.parentNode.removeChild(e),e=null},t.document.documentElement.appendChild(e)}:function(){setTimeout(u,0)};else{var o=new t.MessageChannel;o.port1.onmessage=u,r=function(){o.port2.postMessage(0)}}var h=[];function u(){var e,t;n=!0;for(var r=h.length;r;){for(t=h,h=[],e=-1;++e<r;)t[e]();r=h.length}n=!1}l.exports=function(e){1!==h.push(e)||n||r()}}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{}],37:[function(e,t,r){"use strict";var i=e("immediate");function u(){}var l={},s=["REJECTED"],a=["FULFILLED"],n=["PENDING"];function o(e){if("function"!=typeof e)throw new TypeError("resolver must be a function");this.state=n,this.queue=[],this.outcome=void 0,e!==u&&d(this,e)}function h(e,t,r){this.promise=e,"function"==typeof t&&(this.onFulfilled=t,this.callFulfilled=this.otherCallFulfilled),"function"==typeof r&&(this.onRejected=r,this.callRejected=this.otherCallRejected)}function f(t,r,n){i(function(){var e;try{e=r(n)}catch(e){return l.reject(t,e)}e===t?l.reject(t,new TypeError("Cannot resolve promise with itself")):l.resolve(t,e)})}function c(e){var t=e&&e.then;if(e&&("object"==typeof e||"function"==typeof e)&&"function"==typeof t)return function(){t.apply(e,arguments)}}function d(t,e){var r=!1;function n(e){r||(r=!0,l.reject(t,e))}function i(e){r||(r=!0,l.resolve(t,e))}var s=p(function(){e(i,n)});"error"===s.status&&n(s.value)}function p(e,t){var r={};try{r.value=e(t),r.status="success"}catch(e){r.status="error",r.value=e}return r}(t.exports=o).prototype.finally=function(t){if("function"!=typeof t)return this;var r=this.constructor;return this.then(function(e){return r.resolve(t()).then(function(){return e})},function(e){return r.resolve(t()).then(function(){throw e})})},o.prototype.catch=function(e){return this.then(null,e)},o.prototype.then=function(e,t){if("function"!=typeof e&&this.state===a||"function"!=typeof t&&this.state===s)return this;var r=new this.constructor(u);this.state!==n?f(r,this.state===a?e:t,this.outcome):this.queue.push(new h(r,e,t));return r},h.prototype.callFulfilled=function(e){l.resolve(this.promise,e)},h.prototype.otherCallFulfilled=function(e){f(this.promise,this.onFulfilled,e)},h.prototype.callRejected=function(e){l.reject(this.promise,e)},h.prototype.otherCallRejected=function(e){f(this.promise,this.onRejected,e)},l.resolve=function(e,t){var r=p(c,t);if("error"===r.status)return l.reject(e,r.value);var n=r.value;if(n)d(e,n);else{e.state=a,e.outcome=t;for(var i=-1,s=e.queue.length;++i<s;)e.queue[i].callFulfilled(t)}return e},l.reject=function(e,t){e.state=s,e.outcome=t;for(var r=-1,n=e.queue.length;++r<n;)e.queue[r].callRejected(t);return e},o.resolve=function(e){if(e instanceof this)return e;return l.resolve(new this(u),e)},o.reject=function(e){var t=new this(u);return l.reject(t,e)},o.all=function(e){var r=this;if("[object Array]"!==Object.prototype.toString.call(e))return this.reject(new TypeError("must be an array"));var n=e.length,i=!1;if(!n)return this.resolve([]);var s=new Array(n),a=0,t=-1,o=new this(u);for(;++t<n;)h(e[t],t);return o;function h(e,t){r.resolve(e).then(function(e){s[t]=e,++a!==n||i||(i=!0,l.resolve(o,s))},function(e){i||(i=!0,l.reject(o,e))})}},o.race=function(e){var t=this;if("[object Array]"!==Object.prototype.toString.call(e))return this.reject(new TypeError("must be an array"));var r=e.length,n=!1;if(!r)return this.resolve([]);var i=-1,s=new this(u);for(;++i<r;)a=e[i],t.resolve(a).then(function(e){n||(n=!0,l.resolve(s,e))},function(e){n||(n=!0,l.reject(s,e))});var a;return s}},{immediate:36}],38:[function(e,t,r){"use strict";var n={};(0,e("./lib/utils/common").assign)(n,e("./lib/deflate"),e("./lib/inflate"),e("./lib/zlib/constants")),t.exports=n},{"./lib/deflate":39,"./lib/inflate":40,"./lib/utils/common":41,"./lib/zlib/constants":44}],39:[function(e,t,r){"use strict";var a=e("./zlib/deflate"),o=e("./utils/common"),h=e("./utils/strings"),i=e("./zlib/messages"),s=e("./zlib/zstream"),u=Object.prototype.toString,l=0,f=-1,c=0,d=8;function p(e){if(!(this instanceof p))return new p(e);this.options=o.assign({level:f,method:d,chunkSize:16384,windowBits:15,memLevel:8,strategy:c,to:""},e||{});var t=this.options;t.raw&&0<t.windowBits?t.windowBits=-t.windowBits:t.gzip&&0<t.windowBits&&t.windowBits<16&&(t.windowBits+=16),this.err=0,this.msg="",this.ended=!1,this.chunks=[],this.strm=new s,this.strm.avail_out=0;var r=a.deflateInit2(this.strm,t.level,t.method,t.windowBits,t.memLevel,t.strategy);if(r!==l)throw new Error(i[r]);if(t.header&&a.deflateSetHeader(this.strm,t.header),t.dictionary){var n;if(n="string"==typeof t.dictionary?h.string2buf(t.dictionary):"[object ArrayBuffer]"===u.call(t.dictionary)?new Uint8Array(t.dictionary):t.dictionary,(r=a.deflateSetDictionary(this.strm,n))!==l)throw new Error(i[r]);this._dict_set=!0}}function n(e,t){var r=new p(t);if(r.push(e,!0),r.err)throw r.msg||i[r.err];return r.result}p.prototype.push=function(e,t){var r,n,i=this.strm,s=this.options.chunkSize;if(this.ended)return!1;n=t===~~t?t:!0===t?4:0,"string"==typeof e?i.input=h.string2buf(e):"[object ArrayBuffer]"===u.call(e)?i.input=new Uint8Array(e):i.input=e,i.next_in=0,i.avail_in=i.input.length;do{if(0===i.avail_out&&(i.output=new o.Buf8(s),i.next_out=0,i.avail_out=s),1!==(r=a.deflate(i,n))&&r!==l)return this.onEnd(r),!(this.ended=!0);0!==i.avail_out&&(0!==i.avail_in||4!==n&&2!==n)||("string"===this.options.to?this.onData(h.buf2binstring(o.shrinkBuf(i.output,i.next_out))):this.onData(o.shrinkBuf(i.output,i.next_out)))}while((0<i.avail_in||0===i.avail_out)&&1!==r);return 4===n?(r=a.deflateEnd(this.strm),this.onEnd(r),this.ended=!0,r===l):2!==n||(this.onEnd(l),!(i.avail_out=0))},p.prototype.onData=function(e){this.chunks.push(e)},p.prototype.onEnd=function(e){e===l&&("string"===this.options.to?this.result=this.chunks.join(""):this.result=o.flattenChunks(this.chunks)),this.chunks=[],this.err=e,this.msg=this.strm.msg},r.Deflate=p,r.deflate=n,r.deflateRaw=function(e,t){return(t=t||{}).raw=!0,n(e,t)},r.gzip=function(e,t){return(t=t||{}).gzip=!0,n(e,t)}},{"./utils/common":41,"./utils/strings":42,"./zlib/deflate":46,"./zlib/messages":51,"./zlib/zstream":53}],40:[function(e,t,r){"use strict";var c=e("./zlib/inflate"),d=e("./utils/common"),p=e("./utils/strings"),m=e("./zlib/constants"),n=e("./zlib/messages"),i=e("./zlib/zstream"),s=e("./zlib/gzheader"),_=Object.prototype.toString;function a(e){if(!(this instanceof a))return new a(e);this.options=d.assign({chunkSize:16384,windowBits:0,to:""},e||{});var t=this.options;t.raw&&0<=t.windowBits&&t.windowBits<16&&(t.windowBits=-t.windowBits,0===t.windowBits&&(t.windowBits=-15)),!(0<=t.windowBits&&t.windowBits<16)||e&&e.windowBits||(t.windowBits+=32),15<t.windowBits&&t.windowBits<48&&0==(15&t.windowBits)&&(t.windowBits|=15),this.err=0,this.msg="",this.ended=!1,this.chunks=[],this.strm=new i,this.strm.avail_out=0;var r=c.inflateInit2(this.strm,t.windowBits);if(r!==m.Z_OK)throw new Error(n[r]);this.header=new s,c.inflateGetHeader(this.strm,this.header)}function o(e,t){var r=new a(t);if(r.push(e,!0),r.err)throw r.msg||n[r.err];return r.result}a.prototype.push=function(e,t){var r,n,i,s,a,o,h=this.strm,u=this.options.chunkSize,l=this.options.dictionary,f=!1;if(this.ended)return!1;n=t===~~t?t:!0===t?m.Z_FINISH:m.Z_NO_FLUSH,"string"==typeof e?h.input=p.binstring2buf(e):"[object ArrayBuffer]"===_.call(e)?h.input=new Uint8Array(e):h.input=e,h.next_in=0,h.avail_in=h.input.length;do{if(0===h.avail_out&&(h.output=new d.Buf8(u),h.next_out=0,h.avail_out=u),(r=c.inflate(h,m.Z_NO_FLUSH))===m.Z_NEED_DICT&&l&&(o="string"==typeof l?p.string2buf(l):"[object ArrayBuffer]"===_.call(l)?new Uint8Array(l):l,r=c.inflateSetDictionary(this.strm,o)),r===m.Z_BUF_ERROR&&!0===f&&(r=m.Z_OK,f=!1),r!==m.Z_STREAM_END&&r!==m.Z_OK)return this.onEnd(r),!(this.ended=!0);h.next_out&&(0!==h.avail_out&&r!==m.Z_STREAM_END&&(0!==h.avail_in||n!==m.Z_FINISH&&n!==m.Z_SYNC_FLUSH)||("string"===this.options.to?(i=p.utf8border(h.output,h.next_out),s=h.next_out-i,a=p.buf2string(h.output,i),h.next_out=s,h.avail_out=u-s,s&&d.arraySet(h.output,h.output,i,s,0),this.onData(a)):this.onData(d.shrinkBuf(h.output,h.next_out)))),0===h.avail_in&&0===h.avail_out&&(f=!0)}while((0<h.avail_in||0===h.avail_out)&&r!==m.Z_STREAM_END);return r===m.Z_STREAM_END&&(n=m.Z_FINISH),n===m.Z_FINISH?(r=c.inflateEnd(this.strm),this.onEnd(r),this.ended=!0,r===m.Z_OK):n!==m.Z_SYNC_FLUSH||(this.onEnd(m.Z_OK),!(h.avail_out=0))},a.prototype.onData=function(e){this.chunks.push(e)},a.prototype.onEnd=function(e){e===m.Z_OK&&("string"===this.options.to?this.result=this.chunks.join(""):this.result=d.flattenChunks(this.chunks)),this.chunks=[],this.err=e,this.msg=this.strm.msg},r.Inflate=a,r.inflate=o,r.inflateRaw=function(e,t){return(t=t||{}).raw=!0,o(e,t)},r.ungzip=o},{"./utils/common":41,"./utils/strings":42,"./zlib/constants":44,"./zlib/gzheader":47,"./zlib/inflate":49,"./zlib/messages":51,"./zlib/zstream":53}],41:[function(e,t,r){"use strict";var n="undefined"!=typeof Uint8Array&&"undefined"!=typeof Uint16Array&&"undefined"!=typeof Int32Array;r.assign=function(e){for(var t=Array.prototype.slice.call(arguments,1);t.length;){var r=t.shift();if(r){if("object"!=typeof r)throw new TypeError(r+"must be non-object");for(var n in r)r.hasOwnProperty(n)&&(e[n]=r[n])}}return e},r.shrinkBuf=function(e,t){return e.length===t?e:e.subarray?e.subarray(0,t):(e.length=t,e)};var i={arraySet:function(e,t,r,n,i){if(t.subarray&&e.subarray)e.set(t.subarray(r,r+n),i);else for(var s=0;s<n;s++)e[i+s]=t[r+s]},flattenChunks:function(e){var t,r,n,i,s,a;for(t=n=0,r=e.length;t<r;t++)n+=e[t].length;for(a=new Uint8Array(n),t=i=0,r=e.length;t<r;t++)s=e[t],a.set(s,i),i+=s.length;return a}},s={arraySet:function(e,t,r,n,i){for(var s=0;s<n;s++)e[i+s]=t[r+s]},flattenChunks:function(e){return[].concat.apply([],e)}};r.setTyped=function(e){e?(r.Buf8=Uint8Array,r.Buf16=Uint16Array,r.Buf32=Int32Array,r.assign(r,i)):(r.Buf8=Array,r.Buf16=Array,r.Buf32=Array,r.assign(r,s))},r.setTyped(n)},{}],42:[function(e,t,r){"use strict";var h=e("./common"),i=!0,s=!0;try{String.fromCharCode.apply(null,[0])}catch(e){i=!1}try{String.fromCharCode.apply(null,new Uint8Array(1))}catch(e){s=!1}for(var u=new h.Buf8(256),n=0;n<256;n++)u[n]=252<=n?6:248<=n?5:240<=n?4:224<=n?3:192<=n?2:1;function l(e,t){if(t<65537&&(e.subarray&&s||!e.subarray&&i))return String.fromCharCode.apply(null,h.shrinkBuf(e,t));for(var r="",n=0;n<t;n++)r+=String.fromCharCode(e[n]);return r}u[254]=u[254]=1,r.string2buf=function(e){var t,r,n,i,s,a=e.length,o=0;for(i=0;i<a;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),o+=r<128?1:r<2048?2:r<65536?3:4;for(t=new h.Buf8(o),i=s=0;s<o;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),r<128?t[s++]=r:(r<2048?t[s++]=192|r>>>6:(r<65536?t[s++]=224|r>>>12:(t[s++]=240|r>>>18,t[s++]=128|r>>>12&63),t[s++]=128|r>>>6&63),t[s++]=128|63&r);return t},r.buf2binstring=function(e){return l(e,e.length)},r.binstring2buf=function(e){for(var t=new h.Buf8(e.length),r=0,n=t.length;r<n;r++)t[r]=e.charCodeAt(r);return t},r.buf2string=function(e,t){var r,n,i,s,a=t||e.length,o=new Array(2*a);for(r=n=0;r<a;)if((i=e[r++])<128)o[n++]=i;else if(4<(s=u[i]))o[n++]=65533,r+=s-1;else{for(i&=2===s?31:3===s?15:7;1<s&&r<a;)i=i<<6|63&e[r++],s--;1<s?o[n++]=65533:i<65536?o[n++]=i:(i-=65536,o[n++]=55296|i>>10&1023,o[n++]=56320|1023&i)}return l(o,n)},r.utf8border=function(e,t){var r;for((t=t||e.length)>e.length&&(t=e.length),r=t-1;0<=r&&128==(192&e[r]);)r--;return r<0?t:0===r?t:r+u[e[r]]>t?r:t}},{"./common":41}],43:[function(e,t,r){"use strict";t.exports=function(e,t,r,n){for(var i=65535&e|0,s=e>>>16&65535|0,a=0;0!==r;){for(r-=a=2e3<r?2e3:r;s=s+(i=i+t[n++]|0)|0,--a;);i%=65521,s%=65521}return i|s<<16|0}},{}],44:[function(e,t,r){"use strict";t.exports={Z_NO_FLUSH:0,Z_PARTIAL_FLUSH:1,Z_SYNC_FLUSH:2,Z_FULL_FLUSH:3,Z_FINISH:4,Z_BLOCK:5,Z_TREES:6,Z_OK:0,Z_STREAM_END:1,Z_NEED_DICT:2,Z_ERRNO:-1,Z_STREAM_ERROR:-2,Z_DATA_ERROR:-3,Z_BUF_ERROR:-5,Z_NO_COMPRESSION:0,Z_BEST_SPEED:1,Z_BEST_COMPRESSION:9,Z_DEFAULT_COMPRESSION:-1,Z_FILTERED:1,Z_HUFFMAN_ONLY:2,Z_RLE:3,Z_FIXED:4,Z_DEFAULT_STRATEGY:0,Z_BINARY:0,Z_TEXT:1,Z_UNKNOWN:2,Z_DEFLATED:8}},{}],45:[function(e,t,r){"use strict";var o=function(){for(var e,t=[],r=0;r<256;r++){e=r;for(var n=0;n<8;n++)e=1&e?3988292384^e>>>1:e>>>1;t[r]=e}return t}();t.exports=function(e,t,r,n){var i=o,s=n+r;e^=-1;for(var a=n;a<s;a++)e=e>>>8^i[255&(e^t[a])];return-1^e}},{}],46:[function(e,t,r){"use strict";var h,c=e("../utils/common"),u=e("./trees"),d=e("./adler32"),p=e("./crc32"),n=e("./messages"),l=0,f=4,m=0,_=-2,g=-1,b=4,i=2,v=8,y=9,s=286,a=30,o=19,w=2*s+1,k=15,x=3,S=258,z=S+x+1,C=42,E=113,A=1,I=2,O=3,B=4;function R(e,t){return e.msg=n[t],t}function T(e){return(e<<1)-(4<e?9:0)}function D(e){for(var t=e.length;0<=--t;)e[t]=0}function F(e){var t=e.state,r=t.pending;r>e.avail_out&&(r=e.avail_out),0!==r&&(c.arraySet(e.output,t.pending_buf,t.pending_out,r,e.next_out),e.next_out+=r,t.pending_out+=r,e.total_out+=r,e.avail_out-=r,t.pending-=r,0===t.pending&&(t.pending_out=0))}function N(e,t){u._tr_flush_block(e,0<=e.block_start?e.block_start:-1,e.strstart-e.block_start,t),e.block_start=e.strstart,F(e.strm)}function U(e,t){e.pending_buf[e.pending++]=t}function P(e,t){e.pending_buf[e.pending++]=t>>>8&255,e.pending_buf[e.pending++]=255&t}function L(e,t){var r,n,i=e.max_chain_length,s=e.strstart,a=e.prev_length,o=e.nice_match,h=e.strstart>e.w_size-z?e.strstart-(e.w_size-z):0,u=e.window,l=e.w_mask,f=e.prev,c=e.strstart+S,d=u[s+a-1],p=u[s+a];e.prev_length>=e.good_match&&(i>>=2),o>e.lookahead&&(o=e.lookahead);do{if(u[(r=t)+a]===p&&u[r+a-1]===d&&u[r]===u[s]&&u[++r]===u[s+1]){s+=2,r++;do{}while(u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&s<c);if(n=S-(c-s),s=c-S,a<n){if(e.match_start=t,o<=(a=n))break;d=u[s+a-1],p=u[s+a]}}}while((t=f[t&l])>h&&0!=--i);return a<=e.lookahead?a:e.lookahead}function j(e){var t,r,n,i,s,a,o,h,u,l,f=e.w_size;do{if(i=e.window_size-e.lookahead-e.strstart,e.strstart>=f+(f-z)){for(c.arraySet(e.window,e.window,f,f,0),e.match_start-=f,e.strstart-=f,e.block_start-=f,t=r=e.hash_size;n=e.head[--t],e.head[t]=f<=n?n-f:0,--r;);for(t=r=f;n=e.prev[--t],e.prev[t]=f<=n?n-f:0,--r;);i+=f}if(0===e.strm.avail_in)break;if(a=e.strm,o=e.window,h=e.strstart+e.lookahead,u=i,l=void 0,l=a.avail_in,u<l&&(l=u),r=0===l?0:(a.avail_in-=l,c.arraySet(o,a.input,a.next_in,l,h),1===a.state.wrap?a.adler=d(a.adler,o,l,h):2===a.state.wrap&&(a.adler=p(a.adler,o,l,h)),a.next_in+=l,a.total_in+=l,l),e.lookahead+=r,e.lookahead+e.insert>=x)for(s=e.strstart-e.insert,e.ins_h=e.window[s],e.ins_h=(e.ins_h<<e.hash_shift^e.window[s+1])&e.hash_mask;e.insert&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[s+x-1])&e.hash_mask,e.prev[s&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=s,s++,e.insert--,!(e.lookahead+e.insert<x)););}while(e.lookahead<z&&0!==e.strm.avail_in)}function Z(e,t){for(var r,n;;){if(e.lookahead<z){if(j(e),e.lookahead<z&&t===l)return A;if(0===e.lookahead)break}if(r=0,e.lookahead>=x&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart),0!==r&&e.strstart-r<=e.w_size-z&&(e.match_length=L(e,r)),e.match_length>=x)if(n=u._tr_tally(e,e.strstart-e.match_start,e.match_length-x),e.lookahead-=e.match_length,e.match_length<=e.max_lazy_match&&e.lookahead>=x){for(e.match_length--;e.strstart++,e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart,0!=--e.match_length;);e.strstart++}else e.strstart+=e.match_length,e.match_length=0,e.ins_h=e.window[e.strstart],e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+1])&e.hash_mask;else n=u._tr_tally(e,0,e.window[e.strstart]),e.lookahead--,e.strstart++;if(n&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=e.strstart<x-1?e.strstart:x-1,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}function W(e,t){for(var r,n,i;;){if(e.lookahead<z){if(j(e),e.lookahead<z&&t===l)return A;if(0===e.lookahead)break}if(r=0,e.lookahead>=x&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart),e.prev_length=e.match_length,e.prev_match=e.match_start,e.match_length=x-1,0!==r&&e.prev_length<e.max_lazy_match&&e.strstart-r<=e.w_size-z&&(e.match_length=L(e,r),e.match_length<=5&&(1===e.strategy||e.match_length===x&&4096<e.strstart-e.match_start)&&(e.match_length=x-1)),e.prev_length>=x&&e.match_length<=e.prev_length){for(i=e.strstart+e.lookahead-x,n=u._tr_tally(e,e.strstart-1-e.prev_match,e.prev_length-x),e.lookahead-=e.prev_length-1,e.prev_length-=2;++e.strstart<=i&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart),0!=--e.prev_length;);if(e.match_available=0,e.match_length=x-1,e.strstart++,n&&(N(e,!1),0===e.strm.avail_out))return A}else if(e.match_available){if((n=u._tr_tally(e,0,e.window[e.strstart-1]))&&N(e,!1),e.strstart++,e.lookahead--,0===e.strm.avail_out)return A}else e.match_available=1,e.strstart++,e.lookahead--}return e.match_available&&(n=u._tr_tally(e,0,e.window[e.strstart-1]),e.match_available=0),e.insert=e.strstart<x-1?e.strstart:x-1,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}function M(e,t,r,n,i){this.good_length=e,this.max_lazy=t,this.nice_length=r,this.max_chain=n,this.func=i}function H(){this.strm=null,this.status=0,this.pending_buf=null,this.pending_buf_size=0,this.pending_out=0,this.pending=0,this.wrap=0,this.gzhead=null,this.gzindex=0,this.method=v,this.last_flush=-1,this.w_size=0,this.w_bits=0,this.w_mask=0,this.window=null,this.window_size=0,this.prev=null,this.head=null,this.ins_h=0,this.hash_size=0,this.hash_bits=0,this.hash_mask=0,this.hash_shift=0,this.block_start=0,this.match_length=0,this.prev_match=0,this.match_available=0,this.strstart=0,this.match_start=0,this.lookahead=0,this.prev_length=0,this.max_chain_length=0,this.max_lazy_match=0,this.level=0,this.strategy=0,this.good_match=0,this.nice_match=0,this.dyn_ltree=new c.Buf16(2*w),this.dyn_dtree=new c.Buf16(2*(2*a+1)),this.bl_tree=new c.Buf16(2*(2*o+1)),D(this.dyn_ltree),D(this.dyn_dtree),D(this.bl_tree),this.l_desc=null,this.d_desc=null,this.bl_desc=null,this.bl_count=new c.Buf16(k+1),this.heap=new c.Buf16(2*s+1),D(this.heap),this.heap_len=0,this.heap_max=0,this.depth=new c.Buf16(2*s+1),D(this.depth),this.l_buf=0,this.lit_bufsize=0,this.last_lit=0,this.d_buf=0,this.opt_len=0,this.static_len=0,this.matches=0,this.insert=0,this.bi_buf=0,this.bi_valid=0}function G(e){var t;return e&&e.state?(e.total_in=e.total_out=0,e.data_type=i,(t=e.state).pending=0,t.pending_out=0,t.wrap<0&&(t.wrap=-t.wrap),t.status=t.wrap?C:E,e.adler=2===t.wrap?0:1,t.last_flush=l,u._tr_init(t),m):R(e,_)}function K(e){var t=G(e);return t===m&&function(e){e.window_size=2*e.w_size,D(e.head),e.max_lazy_match=h[e.level].max_lazy,e.good_match=h[e.level].good_length,e.nice_match=h[e.level].nice_length,e.max_chain_length=h[e.level].max_chain,e.strstart=0,e.block_start=0,e.lookahead=0,e.insert=0,e.match_length=e.prev_length=x-1,e.match_available=0,e.ins_h=0}(e.state),t}function Y(e,t,r,n,i,s){if(!e)return _;var a=1;if(t===g&&(t=6),n<0?(a=0,n=-n):15<n&&(a=2,n-=16),i<1||y<i||r!==v||n<8||15<n||t<0||9<t||s<0||b<s)return R(e,_);8===n&&(n=9);var o=new H;return(e.state=o).strm=e,o.wrap=a,o.gzhead=null,o.w_bits=n,o.w_size=1<<o.w_bits,o.w_mask=o.w_size-1,o.hash_bits=i+7,o.hash_size=1<<o.hash_bits,o.hash_mask=o.hash_size-1,o.hash_shift=~~((o.hash_bits+x-1)/x),o.window=new c.Buf8(2*o.w_size),o.head=new c.Buf16(o.hash_size),o.prev=new c.Buf16(o.w_size),o.lit_bufsize=1<<i+6,o.pending_buf_size=4*o.lit_bufsize,o.pending_buf=new c.Buf8(o.pending_buf_size),o.d_buf=1*o.lit_bufsize,o.l_buf=3*o.lit_bufsize,o.level=t,o.strategy=s,o.method=r,K(e)}h=[new M(0,0,0,0,function(e,t){var r=65535;for(r>e.pending_buf_size-5&&(r=e.pending_buf_size-5);;){if(e.lookahead<=1){if(j(e),0===e.lookahead&&t===l)return A;if(0===e.lookahead)break}e.strstart+=e.lookahead,e.lookahead=0;var n=e.block_start+r;if((0===e.strstart||e.strstart>=n)&&(e.lookahead=e.strstart-n,e.strstart=n,N(e,!1),0===e.strm.avail_out))return A;if(e.strstart-e.block_start>=e.w_size-z&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=0,t===f?(N(e,!0),0===e.strm.avail_out?O:B):(e.strstart>e.block_start&&(N(e,!1),e.strm.avail_out),A)}),new M(4,4,8,4,Z),new M(4,5,16,8,Z),new M(4,6,32,32,Z),new M(4,4,16,16,W),new M(8,16,32,32,W),new M(8,16,128,128,W),new M(8,32,128,256,W),new M(32,128,258,1024,W),new M(32,258,258,4096,W)],r.deflateInit=function(e,t){return Y(e,t,v,15,8,0)},r.deflateInit2=Y,r.deflateReset=K,r.deflateResetKeep=G,r.deflateSetHeader=function(e,t){return e&&e.state?2!==e.state.wrap?_:(e.state.gzhead=t,m):_},r.deflate=function(e,t){var r,n,i,s;if(!e||!e.state||5<t||t<0)return e?R(e,_):_;if(n=e.state,!e.output||!e.input&&0!==e.avail_in||666===n.status&&t!==f)return R(e,0===e.avail_out?-5:_);if(n.strm=e,r=n.last_flush,n.last_flush=t,n.status===C)if(2===n.wrap)e.adler=0,U(n,31),U(n,139),U(n,8),n.gzhead?(U(n,(n.gzhead.text?1:0)+(n.gzhead.hcrc?2:0)+(n.gzhead.extra?4:0)+(n.gzhead.name?8:0)+(n.gzhead.comment?16:0)),U(n,255&n.gzhead.time),U(n,n.gzhead.time>>8&255),U(n,n.gzhead.time>>16&255),U(n,n.gzhead.time>>24&255),U(n,9===n.level?2:2<=n.strategy||n.level<2?4:0),U(n,255&n.gzhead.os),n.gzhead.extra&&n.gzhead.extra.length&&(U(n,255&n.gzhead.extra.length),U(n,n.gzhead.extra.length>>8&255)),n.gzhead.hcrc&&(e.adler=p(e.adler,n.pending_buf,n.pending,0)),n.gzindex=0,n.status=69):(U(n,0),U(n,0),U(n,0),U(n,0),U(n,0),U(n,9===n.level?2:2<=n.strategy||n.level<2?4:0),U(n,3),n.status=E);else{var a=v+(n.w_bits-8<<4)<<8;a|=(2<=n.strategy||n.level<2?0:n.level<6?1:6===n.level?2:3)<<6,0!==n.strstart&&(a|=32),a+=31-a%31,n.status=E,P(n,a),0!==n.strstart&&(P(n,e.adler>>>16),P(n,65535&e.adler)),e.adler=1}if(69===n.status)if(n.gzhead.extra){for(i=n.pending;n.gzindex<(65535&n.gzhead.extra.length)&&(n.pending!==n.pending_buf_size||(n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),F(e),i=n.pending,n.pending!==n.pending_buf_size));)U(n,255&n.gzhead.extra[n.gzindex]),n.gzindex++;n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),n.gzindex===n.gzhead.extra.length&&(n.gzindex=0,n.status=73)}else n.status=73;if(73===n.status)if(n.gzhead.name){i=n.pending;do{if(n.pending===n.pending_buf_size&&(n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),F(e),i=n.pending,n.pending===n.pending_buf_size)){s=1;break}s=n.gzindex<n.gzhead.name.length?255&n.gzhead.name.charCodeAt(n.gzindex++):0,U(n,s)}while(0!==s);n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),0===s&&(n.gzindex=0,n.status=91)}else n.status=91;if(91===n.status)if(n.gzhead.comment){i=n.pending;do{if(n.pending===n.pending_buf_size&&(n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),F(e),i=n.pending,n.pending===n.pending_buf_size)){s=1;break}s=n.gzindex<n.gzhead.comment.length?255&n.gzhead.comment.charCodeAt(n.gzindex++):0,U(n,s)}while(0!==s);n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),0===s&&(n.status=103)}else n.status=103;if(103===n.status&&(n.gzhead.hcrc?(n.pending+2>n.pending_buf_size&&F(e),n.pending+2<=n.pending_buf_size&&(U(n,255&e.adler),U(n,e.adler>>8&255),e.adler=0,n.status=E)):n.status=E),0!==n.pending){if(F(e),0===e.avail_out)return n.last_flush=-1,m}else if(0===e.avail_in&&T(t)<=T(r)&&t!==f)return R(e,-5);if(666===n.status&&0!==e.avail_in)return R(e,-5);if(0!==e.avail_in||0!==n.lookahead||t!==l&&666!==n.status){var o=2===n.strategy?function(e,t){for(var r;;){if(0===e.lookahead&&(j(e),0===e.lookahead)){if(t===l)return A;break}if(e.match_length=0,r=u._tr_tally(e,0,e.window[e.strstart]),e.lookahead--,e.strstart++,r&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=0,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}(n,t):3===n.strategy?function(e,t){for(var r,n,i,s,a=e.window;;){if(e.lookahead<=S){if(j(e),e.lookahead<=S&&t===l)return A;if(0===e.lookahead)break}if(e.match_length=0,e.lookahead>=x&&0<e.strstart&&(n=a[i=e.strstart-1])===a[++i]&&n===a[++i]&&n===a[++i]){s=e.strstart+S;do{}while(n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&i<s);e.match_length=S-(s-i),e.match_length>e.lookahead&&(e.match_length=e.lookahead)}if(e.match_length>=x?(r=u._tr_tally(e,1,e.match_length-x),e.lookahead-=e.match_length,e.strstart+=e.match_length,e.match_length=0):(r=u._tr_tally(e,0,e.window[e.strstart]),e.lookahead--,e.strstart++),r&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=0,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}(n,t):h[n.level].func(n,t);if(o!==O&&o!==B||(n.status=666),o===A||o===O)return 0===e.avail_out&&(n.last_flush=-1),m;if(o===I&&(1===t?u._tr_align(n):5!==t&&(u._tr_stored_block(n,0,0,!1),3===t&&(D(n.head),0===n.lookahead&&(n.strstart=0,n.block_start=0,n.insert=0))),F(e),0===e.avail_out))return n.last_flush=-1,m}return t!==f?m:n.wrap<=0?1:(2===n.wrap?(U(n,255&e.adler),U(n,e.adler>>8&255),U(n,e.adler>>16&255),U(n,e.adler>>24&255),U(n,255&e.total_in),U(n,e.total_in>>8&255),U(n,e.total_in>>16&255),U(n,e.total_in>>24&255)):(P(n,e.adler>>>16),P(n,65535&e.adler)),F(e),0<n.wrap&&(n.wrap=-n.wrap),0!==n.pending?m:1)},r.deflateEnd=function(e){var t;return e&&e.state?(t=e.state.status)!==C&&69!==t&&73!==t&&91!==t&&103!==t&&t!==E&&666!==t?R(e,_):(e.state=null,t===E?R(e,-3):m):_},r.deflateSetDictionary=function(e,t){var r,n,i,s,a,o,h,u,l=t.length;if(!e||!e.state)return _;if(2===(s=(r=e.state).wrap)||1===s&&r.status!==C||r.lookahead)return _;for(1===s&&(e.adler=d(e.adler,t,l,0)),r.wrap=0,l>=r.w_size&&(0===s&&(D(r.head),r.strstart=0,r.block_start=0,r.insert=0),u=new c.Buf8(r.w_size),c.arraySet(u,t,l-r.w_size,r.w_size,0),t=u,l=r.w_size),a=e.avail_in,o=e.next_in,h=e.input,e.avail_in=l,e.next_in=0,e.input=t,j(r);r.lookahead>=x;){for(n=r.strstart,i=r.lookahead-(x-1);r.ins_h=(r.ins_h<<r.hash_shift^r.window[n+x-1])&r.hash_mask,r.prev[n&r.w_mask]=r.head[r.ins_h],r.head[r.ins_h]=n,n++,--i;);r.strstart=n,r.lookahead=x-1,j(r)}return r.strstart+=r.lookahead,r.block_start=r.strstart,r.insert=r.lookahead,r.lookahead=0,r.match_length=r.prev_length=x-1,r.match_available=0,e.next_in=o,e.input=h,e.avail_in=a,r.wrap=s,m},r.deflateInfo="pako deflate (from Nodeca project)"},{"../utils/common":41,"./adler32":43,"./crc32":45,"./messages":51,"./trees":52}],47:[function(e,t,r){"use strict";t.exports=function(){this.text=0,this.time=0,this.xflags=0,this.os=0,this.extra=null,this.extra_len=0,this.name="",this.comment="",this.hcrc=0,this.done=!1}},{}],48:[function(e,t,r){"use strict";t.exports=function(e,t){var r,n,i,s,a,o,h,u,l,f,c,d,p,m,_,g,b,v,y,w,k,x,S,z,C;r=e.state,n=e.next_in,z=e.input,i=n+(e.avail_in-5),s=e.next_out,C=e.output,a=s-(t-e.avail_out),o=s+(e.avail_out-257),h=r.dmax,u=r.wsize,l=r.whave,f=r.wnext,c=r.window,d=r.hold,p=r.bits,m=r.lencode,_=r.distcode,g=(1<<r.lenbits)-1,b=(1<<r.distbits)-1;e:do{p<15&&(d+=z[n++]<<p,p+=8,d+=z[n++]<<p,p+=8),v=m[d&g];t:for(;;){if(d>>>=y=v>>>24,p-=y,0===(y=v>>>16&255))C[s++]=65535&v;else{if(!(16&y)){if(0==(64&y)){v=m[(65535&v)+(d&(1<<y)-1)];continue t}if(32&y){r.mode=12;break e}e.msg="invalid literal/length code",r.mode=30;break e}w=65535&v,(y&=15)&&(p<y&&(d+=z[n++]<<p,p+=8),w+=d&(1<<y)-1,d>>>=y,p-=y),p<15&&(d+=z[n++]<<p,p+=8,d+=z[n++]<<p,p+=8),v=_[d&b];r:for(;;){if(d>>>=y=v>>>24,p-=y,!(16&(y=v>>>16&255))){if(0==(64&y)){v=_[(65535&v)+(d&(1<<y)-1)];continue r}e.msg="invalid distance code",r.mode=30;break e}if(k=65535&v,p<(y&=15)&&(d+=z[n++]<<p,(p+=8)<y&&(d+=z[n++]<<p,p+=8)),h<(k+=d&(1<<y)-1)){e.msg="invalid distance too far back",r.mode=30;break e}if(d>>>=y,p-=y,(y=s-a)<k){if(l<(y=k-y)&&r.sane){e.msg="invalid distance too far back",r.mode=30;break e}if(S=c,(x=0)===f){if(x+=u-y,y<w){for(w-=y;C[s++]=c[x++],--y;);x=s-k,S=C}}else if(f<y){if(x+=u+f-y,(y-=f)<w){for(w-=y;C[s++]=c[x++],--y;);if(x=0,f<w){for(w-=y=f;C[s++]=c[x++],--y;);x=s-k,S=C}}}else if(x+=f-y,y<w){for(w-=y;C[s++]=c[x++],--y;);x=s-k,S=C}for(;2<w;)C[s++]=S[x++],C[s++]=S[x++],C[s++]=S[x++],w-=3;w&&(C[s++]=S[x++],1<w&&(C[s++]=S[x++]))}else{for(x=s-k;C[s++]=C[x++],C[s++]=C[x++],C[s++]=C[x++],2<(w-=3););w&&(C[s++]=C[x++],1<w&&(C[s++]=C[x++]))}break}}break}}while(n<i&&s<o);n-=w=p>>3,d&=(1<<(p-=w<<3))-1,e.next_in=n,e.next_out=s,e.avail_in=n<i?i-n+5:5-(n-i),e.avail_out=s<o?o-s+257:257-(s-o),r.hold=d,r.bits=p}},{}],49:[function(e,t,r){"use strict";var I=e("../utils/common"),O=e("./adler32"),B=e("./crc32"),R=e("./inffast"),T=e("./inftrees"),D=1,F=2,N=0,U=-2,P=1,n=852,i=592;function L(e){return(e>>>24&255)+(e>>>8&65280)+((65280&e)<<8)+((255&e)<<24)}function s(){this.mode=0,this.last=!1,this.wrap=0,this.havedict=!1,this.flags=0,this.dmax=0,this.check=0,this.total=0,this.head=null,this.wbits=0,this.wsize=0,this.whave=0,this.wnext=0,this.window=null,this.hold=0,this.bits=0,this.length=0,this.offset=0,this.extra=0,this.lencode=null,this.distcode=null,this.lenbits=0,this.distbits=0,this.ncode=0,this.nlen=0,this.ndist=0,this.have=0,this.next=null,this.lens=new I.Buf16(320),this.work=new I.Buf16(288),this.lendyn=null,this.distdyn=null,this.sane=0,this.back=0,this.was=0}function a(e){var t;return e&&e.state?(t=e.state,e.total_in=e.total_out=t.total=0,e.msg="",t.wrap&&(e.adler=1&t.wrap),t.mode=P,t.last=0,t.havedict=0,t.dmax=32768,t.head=null,t.hold=0,t.bits=0,t.lencode=t.lendyn=new I.Buf32(n),t.distcode=t.distdyn=new I.Buf32(i),t.sane=1,t.back=-1,N):U}function o(e){var t;return e&&e.state?((t=e.state).wsize=0,t.whave=0,t.wnext=0,a(e)):U}function h(e,t){var r,n;return e&&e.state?(n=e.state,t<0?(r=0,t=-t):(r=1+(t>>4),t<48&&(t&=15)),t&&(t<8||15<t)?U:(null!==n.window&&n.wbits!==t&&(n.window=null),n.wrap=r,n.wbits=t,o(e))):U}function u(e,t){var r,n;return e?(n=new s,(e.state=n).window=null,(r=h(e,t))!==N&&(e.state=null),r):U}var l,f,c=!0;function j(e){if(c){var t;for(l=new I.Buf32(512),f=new I.Buf32(32),t=0;t<144;)e.lens[t++]=8;for(;t<256;)e.lens[t++]=9;for(;t<280;)e.lens[t++]=7;for(;t<288;)e.lens[t++]=8;for(T(D,e.lens,0,288,l,0,e.work,{bits:9}),t=0;t<32;)e.lens[t++]=5;T(F,e.lens,0,32,f,0,e.work,{bits:5}),c=!1}e.lencode=l,e.lenbits=9,e.distcode=f,e.distbits=5}function Z(e,t,r,n){var i,s=e.state;return null===s.window&&(s.wsize=1<<s.wbits,s.wnext=0,s.whave=0,s.window=new I.Buf8(s.wsize)),n>=s.wsize?(I.arraySet(s.window,t,r-s.wsize,s.wsize,0),s.wnext=0,s.whave=s.wsize):(n<(i=s.wsize-s.wnext)&&(i=n),I.arraySet(s.window,t,r-n,i,s.wnext),(n-=i)?(I.arraySet(s.window,t,r-n,n,0),s.wnext=n,s.whave=s.wsize):(s.wnext+=i,s.wnext===s.wsize&&(s.wnext=0),s.whave<s.wsize&&(s.whave+=i))),0}r.inflateReset=o,r.inflateReset2=h,r.inflateResetKeep=a,r.inflateInit=function(e){return u(e,15)},r.inflateInit2=u,r.inflate=function(e,t){var r,n,i,s,a,o,h,u,l,f,c,d,p,m,_,g,b,v,y,w,k,x,S,z,C=0,E=new I.Buf8(4),A=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];if(!e||!e.state||!e.output||!e.input&&0!==e.avail_in)return U;12===(r=e.state).mode&&(r.mode=13),a=e.next_out,i=e.output,h=e.avail_out,s=e.next_in,n=e.input,o=e.avail_in,u=r.hold,l=r.bits,f=o,c=h,x=N;e:for(;;)switch(r.mode){case P:if(0===r.wrap){r.mode=13;break}for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(2&r.wrap&&35615===u){E[r.check=0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0),l=u=0,r.mode=2;break}if(r.flags=0,r.head&&(r.head.done=!1),!(1&r.wrap)||(((255&u)<<8)+(u>>8))%31){e.msg="incorrect header check",r.mode=30;break}if(8!=(15&u)){e.msg="unknown compression method",r.mode=30;break}if(l-=4,k=8+(15&(u>>>=4)),0===r.wbits)r.wbits=k;else if(k>r.wbits){e.msg="invalid window size",r.mode=30;break}r.dmax=1<<k,e.adler=r.check=1,r.mode=512&u?10:12,l=u=0;break;case 2:for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(r.flags=u,8!=(255&r.flags)){e.msg="unknown compression method",r.mode=30;break}if(57344&r.flags){e.msg="unknown header flags set",r.mode=30;break}r.head&&(r.head.text=u>>8&1),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0)),l=u=0,r.mode=3;case 3:for(;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.head&&(r.head.time=u),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,E[2]=u>>>16&255,E[3]=u>>>24&255,r.check=B(r.check,E,4,0)),l=u=0,r.mode=4;case 4:for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.head&&(r.head.xflags=255&u,r.head.os=u>>8),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0)),l=u=0,r.mode=5;case 5:if(1024&r.flags){for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.length=u,r.head&&(r.head.extra_len=u),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0)),l=u=0}else r.head&&(r.head.extra=null);r.mode=6;case 6:if(1024&r.flags&&(o<(d=r.length)&&(d=o),d&&(r.head&&(k=r.head.extra_len-r.length,r.head.extra||(r.head.extra=new Array(r.head.extra_len)),I.arraySet(r.head.extra,n,s,d,k)),512&r.flags&&(r.check=B(r.check,n,d,s)),o-=d,s+=d,r.length-=d),r.length))break e;r.length=0,r.mode=7;case 7:if(2048&r.flags){if(0===o)break e;for(d=0;k=n[s+d++],r.head&&k&&r.length<65536&&(r.head.name+=String.fromCharCode(k)),k&&d<o;);if(512&r.flags&&(r.check=B(r.check,n,d,s)),o-=d,s+=d,k)break e}else r.head&&(r.head.name=null);r.length=0,r.mode=8;case 8:if(4096&r.flags){if(0===o)break e;for(d=0;k=n[s+d++],r.head&&k&&r.length<65536&&(r.head.comment+=String.fromCharCode(k)),k&&d<o;);if(512&r.flags&&(r.check=B(r.check,n,d,s)),o-=d,s+=d,k)break e}else r.head&&(r.head.comment=null);r.mode=9;case 9:if(512&r.flags){for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(u!==(65535&r.check)){e.msg="header crc mismatch",r.mode=30;break}l=u=0}r.head&&(r.head.hcrc=r.flags>>9&1,r.head.done=!0),e.adler=r.check=0,r.mode=12;break;case 10:for(;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}e.adler=r.check=L(u),l=u=0,r.mode=11;case 11:if(0===r.havedict)return e.next_out=a,e.avail_out=h,e.next_in=s,e.avail_in=o,r.hold=u,r.bits=l,2;e.adler=r.check=1,r.mode=12;case 12:if(5===t||6===t)break e;case 13:if(r.last){u>>>=7&l,l-=7&l,r.mode=27;break}for(;l<3;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}switch(r.last=1&u,l-=1,3&(u>>>=1)){case 0:r.mode=14;break;case 1:if(j(r),r.mode=20,6!==t)break;u>>>=2,l-=2;break e;case 2:r.mode=17;break;case 3:e.msg="invalid block type",r.mode=30}u>>>=2,l-=2;break;case 14:for(u>>>=7&l,l-=7&l;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if((65535&u)!=(u>>>16^65535)){e.msg="invalid stored block lengths",r.mode=30;break}if(r.length=65535&u,l=u=0,r.mode=15,6===t)break e;case 15:r.mode=16;case 16:if(d=r.length){if(o<d&&(d=o),h<d&&(d=h),0===d)break e;I.arraySet(i,n,s,d,a),o-=d,s+=d,h-=d,a+=d,r.length-=d;break}r.mode=12;break;case 17:for(;l<14;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(r.nlen=257+(31&u),u>>>=5,l-=5,r.ndist=1+(31&u),u>>>=5,l-=5,r.ncode=4+(15&u),u>>>=4,l-=4,286<r.nlen||30<r.ndist){e.msg="too many length or distance symbols",r.mode=30;break}r.have=0,r.mode=18;case 18:for(;r.have<r.ncode;){for(;l<3;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.lens[A[r.have++]]=7&u,u>>>=3,l-=3}for(;r.have<19;)r.lens[A[r.have++]]=0;if(r.lencode=r.lendyn,r.lenbits=7,S={bits:r.lenbits},x=T(0,r.lens,0,19,r.lencode,0,r.work,S),r.lenbits=S.bits,x){e.msg="invalid code lengths set",r.mode=30;break}r.have=0,r.mode=19;case 19:for(;r.have<r.nlen+r.ndist;){for(;g=(C=r.lencode[u&(1<<r.lenbits)-1])>>>16&255,b=65535&C,!((_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(b<16)u>>>=_,l-=_,r.lens[r.have++]=b;else{if(16===b){for(z=_+2;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(u>>>=_,l-=_,0===r.have){e.msg="invalid bit length repeat",r.mode=30;break}k=r.lens[r.have-1],d=3+(3&u),u>>>=2,l-=2}else if(17===b){for(z=_+3;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}l-=_,k=0,d=3+(7&(u>>>=_)),u>>>=3,l-=3}else{for(z=_+7;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}l-=_,k=0,d=11+(127&(u>>>=_)),u>>>=7,l-=7}if(r.have+d>r.nlen+r.ndist){e.msg="invalid bit length repeat",r.mode=30;break}for(;d--;)r.lens[r.have++]=k}}if(30===r.mode)break;if(0===r.lens[256]){e.msg="invalid code -- missing end-of-block",r.mode=30;break}if(r.lenbits=9,S={bits:r.lenbits},x=T(D,r.lens,0,r.nlen,r.lencode,0,r.work,S),r.lenbits=S.bits,x){e.msg="invalid literal/lengths set",r.mode=30;break}if(r.distbits=6,r.distcode=r.distdyn,S={bits:r.distbits},x=T(F,r.lens,r.nlen,r.ndist,r.distcode,0,r.work,S),r.distbits=S.bits,x){e.msg="invalid distances set",r.mode=30;break}if(r.mode=20,6===t)break e;case 20:r.mode=21;case 21:if(6<=o&&258<=h){e.next_out=a,e.avail_out=h,e.next_in=s,e.avail_in=o,r.hold=u,r.bits=l,R(e,c),a=e.next_out,i=e.output,h=e.avail_out,s=e.next_in,n=e.input,o=e.avail_in,u=r.hold,l=r.bits,12===r.mode&&(r.back=-1);break}for(r.back=0;g=(C=r.lencode[u&(1<<r.lenbits)-1])>>>16&255,b=65535&C,!((_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(g&&0==(240&g)){for(v=_,y=g,w=b;g=(C=r.lencode[w+((u&(1<<v+y)-1)>>v)])>>>16&255,b=65535&C,!(v+(_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}u>>>=v,l-=v,r.back+=v}if(u>>>=_,l-=_,r.back+=_,r.length=b,0===g){r.mode=26;break}if(32&g){r.back=-1,r.mode=12;break}if(64&g){e.msg="invalid literal/length code",r.mode=30;break}r.extra=15&g,r.mode=22;case 22:if(r.extra){for(z=r.extra;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.length+=u&(1<<r.extra)-1,u>>>=r.extra,l-=r.extra,r.back+=r.extra}r.was=r.length,r.mode=23;case 23:for(;g=(C=r.distcode[u&(1<<r.distbits)-1])>>>16&255,b=65535&C,!((_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(0==(240&g)){for(v=_,y=g,w=b;g=(C=r.distcode[w+((u&(1<<v+y)-1)>>v)])>>>16&255,b=65535&C,!(v+(_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}u>>>=v,l-=v,r.back+=v}if(u>>>=_,l-=_,r.back+=_,64&g){e.msg="invalid distance code",r.mode=30;break}r.offset=b,r.extra=15&g,r.mode=24;case 24:if(r.extra){for(z=r.extra;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.offset+=u&(1<<r.extra)-1,u>>>=r.extra,l-=r.extra,r.back+=r.extra}if(r.offset>r.dmax){e.msg="invalid distance too far back",r.mode=30;break}r.mode=25;case 25:if(0===h)break e;if(d=c-h,r.offset>d){if((d=r.offset-d)>r.whave&&r.sane){e.msg="invalid distance too far back",r.mode=30;break}p=d>r.wnext?(d-=r.wnext,r.wsize-d):r.wnext-d,d>r.length&&(d=r.length),m=r.window}else m=i,p=a-r.offset,d=r.length;for(h<d&&(d=h),h-=d,r.length-=d;i[a++]=m[p++],--d;);0===r.length&&(r.mode=21);break;case 26:if(0===h)break e;i[a++]=r.length,h--,r.mode=21;break;case 27:if(r.wrap){for(;l<32;){if(0===o)break e;o--,u|=n[s++]<<l,l+=8}if(c-=h,e.total_out+=c,r.total+=c,c&&(e.adler=r.check=r.flags?B(r.check,i,c,a-c):O(r.check,i,c,a-c)),c=h,(r.flags?u:L(u))!==r.check){e.msg="incorrect data check",r.mode=30;break}l=u=0}r.mode=28;case 28:if(r.wrap&&r.flags){for(;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(u!==(4294967295&r.total)){e.msg="incorrect length check",r.mode=30;break}l=u=0}r.mode=29;case 29:x=1;break e;case 30:x=-3;break e;case 31:return-4;case 32:default:return U}return e.next_out=a,e.avail_out=h,e.next_in=s,e.avail_in=o,r.hold=u,r.bits=l,(r.wsize||c!==e.avail_out&&r.mode<30&&(r.mode<27||4!==t))&&Z(e,e.output,e.next_out,c-e.avail_out)?(r.mode=31,-4):(f-=e.avail_in,c-=e.avail_out,e.total_in+=f,e.total_out+=c,r.total+=c,r.wrap&&c&&(e.adler=r.check=r.flags?B(r.check,i,c,e.next_out-c):O(r.check,i,c,e.next_out-c)),e.data_type=r.bits+(r.last?64:0)+(12===r.mode?128:0)+(20===r.mode||15===r.mode?256:0),(0==f&&0===c||4===t)&&x===N&&(x=-5),x)},r.inflateEnd=function(e){if(!e||!e.state)return U;var t=e.state;return t.window&&(t.window=null),e.state=null,N},r.inflateGetHeader=function(e,t){var r;return e&&e.state?0==(2&(r=e.state).wrap)?U:((r.head=t).done=!1,N):U},r.inflateSetDictionary=function(e,t){var r,n=t.length;return e&&e.state?0!==(r=e.state).wrap&&11!==r.mode?U:11===r.mode&&O(1,t,n,0)!==r.check?-3:Z(e,t,n,n)?(r.mode=31,-4):(r.havedict=1,N):U},r.inflateInfo="pako inflate (from Nodeca project)"},{"../utils/common":41,"./adler32":43,"./crc32":45,"./inffast":48,"./inftrees":50}],50:[function(e,t,r){"use strict";var D=e("../utils/common"),F=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258,0,0],N=[16,16,16,16,16,16,16,16,17,17,17,17,18,18,18,18,19,19,19,19,20,20,20,20,21,21,21,21,16,72,78],U=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577,0,0],P=[16,16,16,16,17,17,18,18,19,19,20,20,21,21,22,22,23,23,24,24,25,25,26,26,27,27,28,28,29,29,64,64];t.exports=function(e,t,r,n,i,s,a,o){var h,u,l,f,c,d,p,m,_,g=o.bits,b=0,v=0,y=0,w=0,k=0,x=0,S=0,z=0,C=0,E=0,A=null,I=0,O=new D.Buf16(16),B=new D.Buf16(16),R=null,T=0;for(b=0;b<=15;b++)O[b]=0;for(v=0;v<n;v++)O[t[r+v]]++;for(k=g,w=15;1<=w&&0===O[w];w--);if(w<k&&(k=w),0===w)return i[s++]=20971520,i[s++]=20971520,o.bits=1,0;for(y=1;y<w&&0===O[y];y++);for(k<y&&(k=y),b=z=1;b<=15;b++)if(z<<=1,(z-=O[b])<0)return-1;if(0<z&&(0===e||1!==w))return-1;for(B[1]=0,b=1;b<15;b++)B[b+1]=B[b]+O[b];for(v=0;v<n;v++)0!==t[r+v]&&(a[B[t[r+v]]++]=v);if(d=0===e?(A=R=a,19):1===e?(A=F,I-=257,R=N,T-=257,256):(A=U,R=P,-1),b=y,c=s,S=v=E=0,l=-1,f=(C=1<<(x=k))-1,1===e&&852<C||2===e&&592<C)return 1;for(;;){for(p=b-S,_=a[v]<d?(m=0,a[v]):a[v]>d?(m=R[T+a[v]],A[I+a[v]]):(m=96,0),h=1<<b-S,y=u=1<<x;i[c+(E>>S)+(u-=h)]=p<<24|m<<16|_|0,0!==u;);for(h=1<<b-1;E&h;)h>>=1;if(0!==h?(E&=h-1,E+=h):E=0,v++,0==--O[b]){if(b===w)break;b=t[r+a[v]]}if(k<b&&(E&f)!==l){for(0===S&&(S=k),c+=y,z=1<<(x=b-S);x+S<w&&!((z-=O[x+S])<=0);)x++,z<<=1;if(C+=1<<x,1===e&&852<C||2===e&&592<C)return 1;i[l=E&f]=k<<24|x<<16|c-s|0}}return 0!==E&&(i[c+E]=b-S<<24|64<<16|0),o.bits=k,0}},{"../utils/common":41}],51:[function(e,t,r){"use strict";t.exports={2:"need dictionary",1:"stream end",0:"","-1":"file error","-2":"stream error","-3":"data error","-4":"insufficient memory","-5":"buffer error","-6":"incompatible version"}},{}],52:[function(e,t,r){"use strict";var i=e("../utils/common"),o=0,h=1;function n(e){for(var t=e.length;0<=--t;)e[t]=0}var s=0,a=29,u=256,l=u+1+a,f=30,c=19,_=2*l+1,g=15,d=16,p=7,m=256,b=16,v=17,y=18,w=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],k=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13],x=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,3,7],S=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],z=new Array(2*(l+2));n(z);var C=new Array(2*f);n(C);var E=new Array(512);n(E);var A=new Array(256);n(A);var I=new Array(a);n(I);var O,B,R,T=new Array(f);function D(e,t,r,n,i){this.static_tree=e,this.extra_bits=t,this.extra_base=r,this.elems=n,this.max_length=i,this.has_stree=e&&e.length}function F(e,t){this.dyn_tree=e,this.max_code=0,this.stat_desc=t}function N(e){return e<256?E[e]:E[256+(e>>>7)]}function U(e,t){e.pending_buf[e.pending++]=255&t,e.pending_buf[e.pending++]=t>>>8&255}function P(e,t,r){e.bi_valid>d-r?(e.bi_buf|=t<<e.bi_valid&65535,U(e,e.bi_buf),e.bi_buf=t>>d-e.bi_valid,e.bi_valid+=r-d):(e.bi_buf|=t<<e.bi_valid&65535,e.bi_valid+=r)}function L(e,t,r){P(e,r[2*t],r[2*t+1])}function j(e,t){for(var r=0;r|=1&e,e>>>=1,r<<=1,0<--t;);return r>>>1}function Z(e,t,r){var n,i,s=new Array(g+1),a=0;for(n=1;n<=g;n++)s[n]=a=a+r[n-1]<<1;for(i=0;i<=t;i++){var o=e[2*i+1];0!==o&&(e[2*i]=j(s[o]++,o))}}function W(e){var t;for(t=0;t<l;t++)e.dyn_ltree[2*t]=0;for(t=0;t<f;t++)e.dyn_dtree[2*t]=0;for(t=0;t<c;t++)e.bl_tree[2*t]=0;e.dyn_ltree[2*m]=1,e.opt_len=e.static_len=0,e.last_lit=e.matches=0}function M(e){8<e.bi_valid?U(e,e.bi_buf):0<e.bi_valid&&(e.pending_buf[e.pending++]=e.bi_buf),e.bi_buf=0,e.bi_valid=0}function H(e,t,r,n){var i=2*t,s=2*r;return e[i]<e[s]||e[i]===e[s]&&n[t]<=n[r]}function G(e,t,r){for(var n=e.heap[r],i=r<<1;i<=e.heap_len&&(i<e.heap_len&&H(t,e.heap[i+1],e.heap[i],e.depth)&&i++,!H(t,n,e.heap[i],e.depth));)e.heap[r]=e.heap[i],r=i,i<<=1;e.heap[r]=n}function K(e,t,r){var n,i,s,a,o=0;if(0!==e.last_lit)for(;n=e.pending_buf[e.d_buf+2*o]<<8|e.pending_buf[e.d_buf+2*o+1],i=e.pending_buf[e.l_buf+o],o++,0===n?L(e,i,t):(L(e,(s=A[i])+u+1,t),0!==(a=w[s])&&P(e,i-=I[s],a),L(e,s=N(--n),r),0!==(a=k[s])&&P(e,n-=T[s],a)),o<e.last_lit;);L(e,m,t)}function Y(e,t){var r,n,i,s=t.dyn_tree,a=t.stat_desc.static_tree,o=t.stat_desc.has_stree,h=t.stat_desc.elems,u=-1;for(e.heap_len=0,e.heap_max=_,r=0;r<h;r++)0!==s[2*r]?(e.heap[++e.heap_len]=u=r,e.depth[r]=0):s[2*r+1]=0;for(;e.heap_len<2;)s[2*(i=e.heap[++e.heap_len]=u<2?++u:0)]=1,e.depth[i]=0,e.opt_len--,o&&(e.static_len-=a[2*i+1]);for(t.max_code=u,r=e.heap_len>>1;1<=r;r--)G(e,s,r);for(i=h;r=e.heap[1],e.heap[1]=e.heap[e.heap_len--],G(e,s,1),n=e.heap[1],e.heap[--e.heap_max]=r,e.heap[--e.heap_max]=n,s[2*i]=s[2*r]+s[2*n],e.depth[i]=(e.depth[r]>=e.depth[n]?e.depth[r]:e.depth[n])+1,s[2*r+1]=s[2*n+1]=i,e.heap[1]=i++,G(e,s,1),2<=e.heap_len;);e.heap[--e.heap_max]=e.heap[1],function(e,t){var r,n,i,s,a,o,h=t.dyn_tree,u=t.max_code,l=t.stat_desc.static_tree,f=t.stat_desc.has_stree,c=t.stat_desc.extra_bits,d=t.stat_desc.extra_base,p=t.stat_desc.max_length,m=0;for(s=0;s<=g;s++)e.bl_count[s]=0;for(h[2*e.heap[e.heap_max]+1]=0,r=e.heap_max+1;r<_;r++)p<(s=h[2*h[2*(n=e.heap[r])+1]+1]+1)&&(s=p,m++),h[2*n+1]=s,u<n||(e.bl_count[s]++,a=0,d<=n&&(a=c[n-d]),o=h[2*n],e.opt_len+=o*(s+a),f&&(e.static_len+=o*(l[2*n+1]+a)));if(0!==m){do{for(s=p-1;0===e.bl_count[s];)s--;e.bl_count[s]--,e.bl_count[s+1]+=2,e.bl_count[p]--,m-=2}while(0<m);for(s=p;0!==s;s--)for(n=e.bl_count[s];0!==n;)u<(i=e.heap[--r])||(h[2*i+1]!==s&&(e.opt_len+=(s-h[2*i+1])*h[2*i],h[2*i+1]=s),n--)}}(e,t),Z(s,u,e.bl_count)}function X(e,t,r){var n,i,s=-1,a=t[1],o=0,h=7,u=4;for(0===a&&(h=138,u=3),t[2*(r+1)+1]=65535,n=0;n<=r;n++)i=a,a=t[2*(n+1)+1],++o<h&&i===a||(o<u?e.bl_tree[2*i]+=o:0!==i?(i!==s&&e.bl_tree[2*i]++,e.bl_tree[2*b]++):o<=10?e.bl_tree[2*v]++:e.bl_tree[2*y]++,s=i,u=(o=0)===a?(h=138,3):i===a?(h=6,3):(h=7,4))}function V(e,t,r){var n,i,s=-1,a=t[1],o=0,h=7,u=4;for(0===a&&(h=138,u=3),n=0;n<=r;n++)if(i=a,a=t[2*(n+1)+1],!(++o<h&&i===a)){if(o<u)for(;L(e,i,e.bl_tree),0!=--o;);else 0!==i?(i!==s&&(L(e,i,e.bl_tree),o--),L(e,b,e.bl_tree),P(e,o-3,2)):o<=10?(L(e,v,e.bl_tree),P(e,o-3,3)):(L(e,y,e.bl_tree),P(e,o-11,7));s=i,u=(o=0)===a?(h=138,3):i===a?(h=6,3):(h=7,4)}}n(T);var q=!1;function J(e,t,r,n){P(e,(s<<1)+(n?1:0),3),function(e,t,r,n){M(e),n&&(U(e,r),U(e,~r)),i.arraySet(e.pending_buf,e.window,t,r,e.pending),e.pending+=r}(e,t,r,!0)}r._tr_init=function(e){q||(function(){var e,t,r,n,i,s=new Array(g+1);for(n=r=0;n<a-1;n++)for(I[n]=r,e=0;e<1<<w[n];e++)A[r++]=n;for(A[r-1]=n,n=i=0;n<16;n++)for(T[n]=i,e=0;e<1<<k[n];e++)E[i++]=n;for(i>>=7;n<f;n++)for(T[n]=i<<7,e=0;e<1<<k[n]-7;e++)E[256+i++]=n;for(t=0;t<=g;t++)s[t]=0;for(e=0;e<=143;)z[2*e+1]=8,e++,s[8]++;for(;e<=255;)z[2*e+1]=9,e++,s[9]++;for(;e<=279;)z[2*e+1]=7,e++,s[7]++;for(;e<=287;)z[2*e+1]=8,e++,s[8]++;for(Z(z,l+1,s),e=0;e<f;e++)C[2*e+1]=5,C[2*e]=j(e,5);O=new D(z,w,u+1,l,g),B=new D(C,k,0,f,g),R=new D(new Array(0),x,0,c,p)}(),q=!0),e.l_desc=new F(e.dyn_ltree,O),e.d_desc=new F(e.dyn_dtree,B),e.bl_desc=new F(e.bl_tree,R),e.bi_buf=0,e.bi_valid=0,W(e)},r._tr_stored_block=J,r._tr_flush_block=function(e,t,r,n){var i,s,a=0;0<e.level?(2===e.strm.data_type&&(e.strm.data_type=function(e){var t,r=4093624447;for(t=0;t<=31;t++,r>>>=1)if(1&r&&0!==e.dyn_ltree[2*t])return o;if(0!==e.dyn_ltree[18]||0!==e.dyn_ltree[20]||0!==e.dyn_ltree[26])return h;for(t=32;t<u;t++)if(0!==e.dyn_ltree[2*t])return h;return o}(e)),Y(e,e.l_desc),Y(e,e.d_desc),a=function(e){var t;for(X(e,e.dyn_ltree,e.l_desc.max_code),X(e,e.dyn_dtree,e.d_desc.max_code),Y(e,e.bl_desc),t=c-1;3<=t&&0===e.bl_tree[2*S[t]+1];t--);return e.opt_len+=3*(t+1)+5+5+4,t}(e),i=e.opt_len+3+7>>>3,(s=e.static_len+3+7>>>3)<=i&&(i=s)):i=s=r+5,r+4<=i&&-1!==t?J(e,t,r,n):4===e.strategy||s===i?(P(e,2+(n?1:0),3),K(e,z,C)):(P(e,4+(n?1:0),3),function(e,t,r,n){var i;for(P(e,t-257,5),P(e,r-1,5),P(e,n-4,4),i=0;i<n;i++)P(e,e.bl_tree[2*S[i]+1],3);V(e,e.dyn_ltree,t-1),V(e,e.dyn_dtree,r-1)}(e,e.l_desc.max_code+1,e.d_desc.max_code+1,a+1),K(e,e.dyn_ltree,e.dyn_dtree)),W(e),n&&M(e)},r._tr_tally=function(e,t,r){return e.pending_buf[e.d_buf+2*e.last_lit]=t>>>8&255,e.pending_buf[e.d_buf+2*e.last_lit+1]=255&t,e.pending_buf[e.l_buf+e.last_lit]=255&r,e.last_lit++,0===t?e.dyn_ltree[2*r]++:(e.matches++,t--,e.dyn_ltree[2*(A[r]+u+1)]++,e.dyn_dtree[2*N(t)]++),e.last_lit===e.lit_bufsize-1},r._tr_align=function(e){P(e,2,3),L(e,m,z),function(e){16===e.bi_valid?(U(e,e.bi_buf),e.bi_buf=0,e.bi_valid=0):8<=e.bi_valid&&(e.pending_buf[e.pending++]=255&e.bi_buf,e.bi_buf>>=8,e.bi_valid-=8)}(e)}},{"../utils/common":41}],53:[function(e,t,r){"use strict";t.exports=function(){this.input=null,this.next_in=0,this.avail_in=0,this.total_in=0,this.output=null,this.next_out=0,this.avail_out=0,this.total_out=0,this.msg="",this.state=null,this.data_type=2,this.adler=0}},{}],54:[function(e,t,r){(function(e){!function(r,n){"use strict";if(!r.setImmediate){var i,s,t,a,o=1,h={},u=!1,l=r.document,e=Object.getPrototypeOf&&Object.getPrototypeOf(r);e=e&&e.setTimeout?e:r,i="[object process]"==={}.toString.call(r.process)?function(e){process.nextTick(function(){c(e)})}:function(){if(r.postMessage&&!r.importScripts){var e=!0,t=r.onmessage;return r.onmessage=function(){e=!1},r.postMessage("","*"),r.onmessage=t,e}}()?(a="setImmediate$"+Math.random()+"$",r.addEventListener?r.addEventListener("message",d,!1):r.attachEvent("onmessage",d),function(e){r.postMessage(a+e,"*")}):r.MessageChannel?((t=new MessageChannel).port1.onmessage=function(e){c(e.data)},function(e){t.port2.postMessage(e)}):l&&"onreadystatechange"in l.createElement("script")?(s=l.documentElement,function(e){var t=l.createElement("script");t.onreadystatechange=function(){c(e),t.onreadystatechange=null,s.removeChild(t),t=null},s.appendChild(t)}):function(e){setTimeout(c,0,e)},e.setImmediate=function(e){"function"!=typeof e&&(e=new Function(""+e));for(var t=new Array(arguments.length-1),r=0;r<t.length;r++)t[r]=arguments[r+1];var n={callback:e,args:t};return h[o]=n,i(o),o++},e.clearImmediate=f}function f(e){delete h[e]}function c(e){if(u)setTimeout(c,0,e);else{var t=h[e];if(t){u=!0;try{!function(e){var t=e.callback,r=e.args;switch(r.length){case 0:t();break;case 1:t(r[0]);break;case 2:t(r[0],r[1]);break;case 3:t(r[0],r[1],r[2]);break;default:t.apply(n,r)}}(t)}finally{f(e),u=!1}}}}function d(e){e.source===r&&"string"==typeof e.data&&0===e.data.indexOf(a)&&c(+e.data.slice(a.length))}}("undefined"==typeof self?void 0===e?this:e:self)}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{}]},{},[10])(10)});
return module.exports;})();
module.exports=VRI_ZIP;

return module.exports;
}
function loadImport(){
const module={exports:{}};
'use strict';
/*
 * V3.0-BETA2 import inspector
 *
 * Opens generic ZIPs with the same unmodified JSZip v3.10.1 bundled by
 * the supplied desktop v1.0.0. No note is changed during inspection.
 * Three supported classes:
 *   A: V3 outer incremental ZIP: restore exchange artifacts only.
 *   B: legacy formal content ZIP: restore original ZIP to exchange inbox only.
 *   C: ordinary knowledge-base ZIP: preview and import NEW files only.
 * Path rejection, item limits, SHA checking and preview apply recheck.
 */
function createImportInspector(JSZip, tools) {
  const {
    sha256, zipDecode, safeRel, safeEntry, asBytes, buffer, ensureVaultFolder,
    exclusiveFinishedWrite, validateRawAck
  }=tools;
  const MAX_ARCHIVE=75*1024*1024;
  const MAX_ENTRY=32*1024*1024;
  const MAX_EXPANDED=120*1024*1024;
  const MAX_ARCHIVE_MEMBERS=400;
  const utf8=new TextDecoder('utf-8',{fatal:true});
  const reader=new TextDecoder('utf-8',{fatal:false});
  const encoder=new TextEncoder();
  function fail(message){throw new Error(message);}
  function vPath(raw,dir=false) {
    const name=dir&&raw.endsWith('/')?raw.slice(0,-1):raw;
    if(!safeRel(name) || name.length>420)
      fail('ZIP 包含不安全的路径：'+String(raw).slice(0,90));
    return name;
  }
  function fileNameOnly(name){
    if(!name || typeof name!=='string'||/[\/\\:\x00-\x1f]/.test(name))
      fail('ZIP 文件名不安全');
    if(!/\.zip$/i.test(name)) fail('请选择 ZIP 文件');
    const value=name.replace(/[^A-Za-z0-9_\u4e00-\u9fff().\-]/g,'_').slice(0,120);
    if(!value || value==='.'||value==='..')fail('无法识别 ZIP 文件名');
    return value;
  }
  function scanCentral(bytes) {
    const data=asBytes(bytes);
    const v=new DataView(data.buffer,data.byteOffset,data.byteLength);
    let eocd=-1;
    for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--){
      if(v.getUint32(i,true)===0x06054b50&&
         i+22+v.getUint16(i+20,true)===data.length){eocd=i;break;}
    }
    if(eocd<0) fail('ZIP 缺少完整的中央目录');
    if(v.getUint16(eocd+4,true)!==0 || v.getUint16(eocd+6,true)!==0)
      fail('不支持分卷 ZIP');
    const count=v.getUint16(eocd+10,true),size=v.getUint32(eocd+12,true);
    let at=v.getUint32(eocd+16,true);
    if(count>=65535 || count>MAX_ARCHIVE_MEMBERS || size===0xffffffff ||
       at===0xffffffff || at+size>eocd)
      fail('ZIP 条目数量或目录大小超过测试上限');
    const end=at+size,seen=new Set();
    let total=0;
    for(let n=0;n<count;n++){
      if(at+46>end||v.getUint32(at,true)!==0x02014b50)fail('ZIP 中央目录已损坏');
      const flags=v.getUint16(at+8,true),method=v.getUint16(at+10,true);
      const packed=v.getUint32(at+20,true),plain=v.getUint32(at+24,true);
      const nl=v.getUint16(at+28,true),ex=v.getUint16(at+30,true);
      const cm=v.getUint16(at+32,true),external=v.getUint32(at+38,true);
      const made=v.getUint16(at+4,true)>>8;
      const next=at+46+nl+ex+cm;
      if(next>end || nl===0 || packed===0xffffffff || plain===0xffffffff ||
         (flags&1) || ![0,8].includes(method))fail('ZIP 包含不支持的条目');
      if(plain>MAX_ENTRY)fail('ZIP 内单个文件超过 32 MiB 限制');
      if(packed===0 && plain!==0)fail('ZIP 文件长度信息不合法');
      if(packed>0 && plain>packed*300+1024)
        fail('ZIP 压缩比例异常，已拒绝导入');
      total+=plain;
      if(total>MAX_EXPANDED)fail('ZIP 解压总大小超过 120 MiB 限制');
      const name=Array.from(data.subarray(at+46,at+46+nl),
        x=>x.toString(16).padStart(2,'0')).join('');
      if(seen.has(name))fail('ZIP 内有重复文件名');
      seen.add(name);
      if(made===3 && ((external>>>16)&0xf000)===0xa000)
        fail('不接受 ZIP 中的符号链接');
      at=next;
    }
    if(at!==end)fail('ZIP 中央目录长度不一致');
    return {count,total};
  }
  function isExcluded(path) {
    const seg=path.split('/');
    if(seg.some(x=>/^(?:\.obsidian|\.trash|\.git|__MACOSX|VaultRelay-Transfer|VaultRelay|\.vault-relay-merge-drafts|Vault Relay 合并草稿)$/i.test(x)))
      return true;
    if(seg.some(x=>x.startsWith('.')))return true;
    if(/^(?:desktop\.ini|thumbs\.db|\.DS_Store)$/i.test(seg[seg.length-1]))return true;
    return false;
  }
  function allowedContent(path) {
    return /\.(?:md|markdown|canvas|excalidraw|png|jpe?g|gif|webp|svg|pdf|txt|json|mp3|wav|ogg|m4a|mp4|mov|webm|avif|bmp|epub|csv)$/i.test(path);
  }
  function isNotes(path){return /\.(?:md|markdown|canvas)$/i.test(path);}
  function suggestedRoot(paths) {
    if(!paths.length || paths.some(p=>p.split('/').length<2))return '';
    const first=paths[0].split('/')[0];
    if(paths.every(p=>p.startsWith(first+'/')))return first+'/';
    return '';
  }
  async function readEntry(entry) {
    const declared=entry?._data?.uncompressedSize;
    if(!Number.isFinite(declared) || declared<0 || declared>MAX_ENTRY)
      fail('ZIP 条目大小不合法');
    const data=asBytes(await entry.async('uint8array'));
    if(data.length!==declared || data.length>MAX_ENTRY)
      fail('ZIP 解压后的文件大小不一致');
    return data;
  }
  async function parseZIP(file) {
    if(!file || !/\.zip$/i.test(file.name||''))fail('请选择 ZIP 文件');
    if(!Number.isSafeInteger(file.size)||file.size<22||file.size>MAX_ARCHIVE)
      fail('ZIP 大小超过 75 MiB 测试上限');
    const bytes=asBytes(await file.arrayBuffer());
    if(bytes.length!==file.size)fail('文件读取长度变化，已停止');
    scanCentral(bytes);
    const zip=await JSZip.loadAsync(bytes,{checkCRC32:true,createFolders:false});
    const entries=Object.values(zip.files);
    if(entries.length>MAX_ARCHIVE_MEMBERS)fail('ZIP 文件过多');
    let total=0;
    for(const e of entries) {
      vPath(e.unsafeOriginalName || e.name,!!e.dir);
      vPath(e.name,!!e.dir);
      const declared=e._data?.uncompressedSize || 0;
      if(!e.dir && (!Number.isFinite(declared)||declared>MAX_ENTRY))
        fail('ZIP 包含超大文件');
      if(!e.dir)total+=declared;
      if(total>MAX_EXPANDED)fail('ZIP 解压数据超过安全上限');
      const u=typeof e.unixPermissions==='string'?
        parseInt(e.unixPermissions,8):e.unixPermissions;
      if(typeof u==='number' && (u&0xf000)===0xa000)
        fail('ZIP 中发现符号链接');
    }
    return {bytes,zip,entries,archiveHash:await sha256(bytes)};
  }
  async function getManifest(parsed) {
    const mf=parsed.zip.file('manifest.json');
    if(!mf)return null;
    if(mf._data?.uncompressedSize>1024*1024) fail('manifest.json 过大');
    const raw=await readEntry(mf);
    try {return JSON.parse(utf8.decode(raw));}
    catch(_){fail('manifest.json 不符合 JSON 格式');}
  }
  function currentGroup(context) {
    const group=context.plugin.data.groupId;
    if(!/^vg-[a-z0-9]{16,40}$/.test(String(group||'')))
      fail('请先核对当前知识库 GroupID');
    const original=context.plugin.currentLegacyGroup?.();
    if(original && original!==group)
      fail('V3 GroupID 与同步核心不一致，禁止导入或写入');
    return group;
  }
  async function inspect(file, context) {
    const group=currentGroup(context);
    const parsed=await parseZIP(file);
    const mf=await getManifest(parsed);
    if(mf && mf.format==='vault-relay-transport-envelope')
      return inspectEnvelope(file,parsed,mf,context);
    if(mf && mf.format==='vaultrelay.content.v2')
      return inspectFormal(file,parsed,mf,context);
    if(mf && typeof mf.format==='string')
      fail('无法识别的同步 ZIP 版本：'+mf.format);
    return inspectOrdinary(file,parsed,context);
  }
  async function inspectEnvelope(file,parsed,m,context) {
    if(m.schema!==1 || m.groupId!==context.plugin.data.groupId)
      fail('增量 ZIP 的 GroupID 或协议版本不匹配');
    if(!Array.isArray(m.files)||m.files.length===0||m.files.length>120)
      fail('增量 ZIP 文件清单不合法');
    const archive=zipDecode(parsed.bytes); // strict STORE / CRC verification
    if(archive.size!==m.files.length+1)fail('增量 ZIP 内包含未声明的文件');
    const seen=new Set(),contents=[];
    for(const x of m.files) {
      if(!x || !safeEntry(x.path) || seen.has(x.path.normalize('NFC').toLowerCase()))
        fail('增量 ZIP 交换路径重复、大小写冲突或不安全');
      seen.add(x.path.normalize('NFC').toLowerCase());
      const data=archive.get(x.path);
      if(!data || x.bytes!==data.length ||
        typeof x.sha256!=='string'||await sha256(data)!==x.sha256)
        fail('增量 ZIP 内容 SHA-256 不匹配：'+x.path);
      if(x.path.startsWith('ack/')){
        const name=x.path.split('/').pop();
        const parsedAck=await validateRawAck(data,name,m.groupId);
        if(x.path!=='ack/'+parsedAck.device+'/'+parsedAck.canonicalName ||
           !/^vr-[a-z0-9]{16,64}$/.test(m.nativeSenderDeviceId||'') ||
           parsedAck.device!==m.nativeSenderDeviceId)
          fail('ZIP 内 ACK 的来源设备、标准路径或发送设备证明不匹配');
      }
      contents.push({path:x.path,data,sha256:x.sha256});
    }
    return {kind:'incremental', fileName:fileNameOnly(file.name), hash:parsed.archiveHash,
      contents,groupId:m.groupId,bundleId:m.bundleId,
      transportDeviceId:m.transportDeviceId,
      newItems:[],sameItems:[],conflicts:[],excluded:[],invalid:[]};
  }
  function checkFormalMetadata(m) {
    // Mirror the supplied v1.0.0 vaultrelay.content.v2 manifest contract.
    // A malformed "formal" ZIP must not be presented as a verified sync pack.
    const hash=/^[a-f0-9]{64}$/;
    const version=/^[a-f0-9]{24,64}:[0-9]{4}$/;
    const validDate=x=>typeof x==='string' && !Number.isNaN(Date.parse(x));
    if(!/^vg-[a-z0-9]{16,40}$/.test(m.vaultGroupId||''))
      fail('正式 ZIP 群组 ID 不合法');
    if(!/^vr-[a-z0-9]{16,64}$/.test(m.originDeviceId||''))
      fail('正式 ZIP 设备 ID 不合法');
    if(m.originName!==undefined && (typeof m.originName!=='string' ||
        m.originName.length>80 || /[\x00-\x1f]/.test(m.originName)))
      fail('正式 ZIP 设备名称不合法');
    if(!/^[a-f0-9]{24,64}$/.test(m.packId||'') ||
       !Number.isSafeInteger(m.originSeq) || m.originSeq<=0 ||
       !validDate(m.createdAtUtc))
      fail('正式 ZIP 版本元数据不合法');
    const seen=new Set(),versions=new Set(),payloads=new Set();
    for(let i=0;i<m.entries.length;i++){
      const x=m.entries[i],expected=m.packId+':'+String(i+1).padStart(4,'0');
      if(!x || typeof x!=='object' || Array.isArray(x) ||
         typeof x.path!=='string' || !safeRel(x.path) ||
         isExcluded(x.path) || seen.has(x.path.normalize('NFC').toLowerCase()))
        fail('正式 ZIP 包含无效、重复或大小写冲突的笔记路径');
      seen.add(x.path.normalize('NFC').toLowerCase());
      if(x.versionId!==expected || versions.has(x.versionId))
        fail('正式 ZIP 文件版本 ID 不合法');
      versions.add(x.versionId);
      if(x.parentVersionId!==null && !version.test(x.parentVersionId||''))
        fail('正式 ZIP 上游版本 ID 不合法');
      if(x.parentVersionId===x.versionId)fail('正式 ZIP 存在自引用版本');
      if(x.mergeParents!==undefined){
        if(!Array.isArray(x.mergeParents)||x.mergeParents.length>24||
           new Set(x.mergeParents).size!==x.mergeParents.length ||
           x.mergeParents.some(p=>typeof p!=='string'||!version.test(p)||
             p===x.versionId||p===x.parentVersionId))
          fail('正式 ZIP 合并父版本列表不合法');
      }
      if(!validDate(x.eventAtUtc) ||
         !(x.baseSha256===null || (typeof x.baseSha256==='string' &&
           hash.test(x.baseSha256))))
        fail('正式 ZIP 文件时间或基准 SHA 不合法');
      if(x.op==='upsert') {
        if(!hash.test(x.sha256||'') ||
           !Number.isSafeInteger(x.size) || x.size<0 || x.size>MAX_ENTRY ||
           x.payload!=='files/'+String(i+1).padStart(4,'0')+'.bin' ||
           payloads.has(x.payload))
          fail('正式 ZIP 内容条目元数据不合法');
        payloads.add(x.payload);
      }else if(x.op==='delete'){
        if(x.sha256!==null || x.size!==0 || x.payload!==null)
          fail('正式 ZIP 删除标记不合法');
      }else fail('正式 ZIP 文件操作类型不合法');
    }
  }
  async function inspectFormal(file,parsed,m,context) {
    if(m.vaultGroupId!==context.plugin.data.groupId)
      fail('正式内容 ZIP 属于其他 GroupID，禁止混入当前知识库');
    if(!Array.isArray(m.entries)||!m.entries.length||m.entries.length>60)
      fail('正式内容 ZIP 清单不符合同步核心格式');
    checkFormalMetadata(m);
    const entries=new Set(),payloads=new Set(),allowed=new Set(['manifest.json']);
    let upsert=0,deletes=0;
    for(const x of m.entries) {
      if(!x || typeof x.path!=='string'||!safeRel(x.path) ||
         isExcluded(x.path) || entries.has(x.path))fail('正式内容 ZIP 笔记路径不安全或重复');
      entries.add(x.path);
      if(x.op==='delete') {
        if(x.payload!==null)fail('删除条目仍含内容载荷');
        deletes++;continue;
      }
      if(x.op!=='upsert' || !x.payload || !safeRel(x.payload) ||
         !x.payload.startsWith('files/')||payloads.has(x.payload))
        fail('正式内容 ZIP 载荷不合法');
      payloads.add(x.payload);allowed.add(x.payload);
      const f=parsed.zip.file(x.payload);
      if(!f)fail('正式内容 ZIP 缺少载荷：'+x.payload);
      const declared=f._data?.uncompressedSize;
      if(declared!==x.size || !Number.isSafeInteger(x.size) || x.size>MAX_ENTRY)
        fail('正式内容 ZIP 文件大小不匹配');
      const data=await readEntry(f);
      if(await sha256(data)!==x.sha256)
        fail('正式内容 ZIP 笔记内容 SHA-256 校验失败：'+x.path);
      upsert++;
    }
    for(const f of parsed.entries) {
      if(!f.dir && !allowed.has(f.name))fail('正式内容 ZIP 存在清单以外的文件：'+f.name);
    }
    return {kind:'formal',fileName:fileNameOnly(file.name),hash:parsed.archiveHash,
      bytes:parsed.bytes,groupId:m.vaultGroupId,upsert,deletes,
      newItems:[],sameItems:[],conflicts:[],excluded:[],invalid:[]};
  }
  async function inspectOrdinary(file,parsed,context) {
    const candidates=[];
    const excluded=[],invalid=[];
    for(const z of parsed.entries) {
      if(z.dir)continue;
      if(isExcluded(z.name)){excluded.push(z.name);continue;}
      if(!allowedContent(z.name)){invalid.push(z.name);continue;}
      candidates.push(z);
    }
    if(!candidates.some(z=>isNotes(z.name)))
      fail('该 ZIP 不包含可识别的 Markdown/Canvas 笔记，不按普通知识库导入');
    const prefix=suggestedRoot(candidates.map(z=>z.name));
    const adapter=context.app.vault.adapter;
    const names=new Set(),newItems=[],sameItems=[],conflicts=[];
    for(const z of candidates) {
      const rel=z.name.slice(prefix.length);
      if(!safeRel(rel)||isExcluded(rel)){excluded.push(z.name);continue;}
      if(names.has(rel.normalize('NFC').toLowerCase()))
        fail('去除知识库根目录后出现重复或大小写冲突路径：'+rel);
      names.add(rel.normalize('NFC').toLowerCase());
      const content=await readEntry(z),hash=await sha256(content);
      if(await adapter.exists(rel)){
        const existing=asBytes(await adapter.readBinary(rel));
        if(await sha256(existing)===hash)sameItems.push(rel);
        else conflicts.push(rel);
      }else{
        // An ordinary archive has no parent-version evidence. A formerly known
        // path must use the explicit Markdown restore workflow instead of
        // resurrecting content behind an accepted tombstone or old upsert.
        const known=context.plugin.engine?.state?.known?.[rel]||null;
        if(known)conflicts.push(rel);
        else newItems.push({path:rel,data:content,sha256:hash});
      }
    }
    return {kind:'ordinary',fileName:fileNameOnly(file.name),hash:parsed.archiveHash,
      newItems,sameItems,conflicts,excluded,invalid,rootPrefix:prefix,upsert:0,deletes:0};
  }
  async function ensureExternal(target, data, ctx) {
    const fs=require('node:fs').promises, path=require('node:path');
    const base=path.resolve(ctx.plugin.data.windowsLegacyDir||'');
    if(!ctx.plugin.data.windowsLegacyDir||path.basename(base)!==ctx.plugin.data.groupId)
      fail('Windows 同步核心交换目录尚未正确配置');
    const p=path.resolve(base,...target.split('/'));
    if(!p.startsWith(base+path.sep))fail('外部交换路径越界');
    let walk=base;
    for(const part of target.split('/').slice(0,-1)) {
      walk=path.join(walk,part);
      let st;
      try{st=await fs.lstat(walk);}catch(e){if(e.code==='ENOENT')continue;throw e;}
      if(st.isSymbolicLink()||!st.isDirectory())fail('目标包含不安全的目录项');
    }
    try{
      const st=await fs.lstat(p);
      if(!st.isFile()||st.isSymbolicLink())fail('目标不是普通文件');
      const old=asBytes(await fs.readFile(p));
      if(await sha256(old)===await sha256(data))return 'same';
      return 'conflict';
    }catch(e){if(e.code==='ENOENT')return 'new';throw e;}
  }
  async function applyExchangeItems(items, context) {
    const {app,plugin}=context;
    const desktop=context.desktop;
    const adapter=app.vault.adapter;
    const plan=[],seen=new Set();
    for(const x of items){
      if(!safeEntry(x.path)||seen.has(x.path))fail('不安全或重复的交换路径');
      seen.add(x.path);
      const rel=desktop?x.path:'VaultRelay-Transfer/inbox/'+x.path;
      let status;
      if(desktop)status=await ensureExternal(rel,x.data,context);
      else if(await adapter.exists(rel)) {
        const bytes=asBytes(await adapter.readBinary(rel));
        status=(await sha256(bytes))===x.sha256?'same':'conflict';
      }else status='new';
      plan.push({...x,rel,status});
    }
    if(plan.some(p=>p.status==='conflict'))
      fail('同名不同内容的交换文件已存在；此次未写入任何文件：'+
        plan.filter(p=>p.status==='conflict').map(p=>p.path).slice(0,5).join('、'));
    let added=0,skipped=0;
    if(desktop){
      if(!plugin.data.desktopLedger||typeof plugin.data.desktopLedger!=='object')
        plugin.data.desktopLedger={};
      const l=plugin.data.desktopLedger;
      if(!l.suppress||typeof l.suppress!=='object')l.suppress={};
      for(const x of plan)l.suppress[x.path]=x.sha256;
      await plugin.saveData(plugin.data);
    }
    for(const x of plan){
      if(x.status==='same'){skipped++;continue;}
      if(desktop){
        const fs=require('node:fs').promises, path=require('node:path');
        const base=path.resolve(plugin.data.windowsLegacyDir);
        const p=path.resolve(base,...x.path.split('/'));
        await fs.mkdir(path.dirname(p),{recursive:true});
        await exclusiveFinishedWrite(fs,p,x.data);
      }else{
        await ensureVaultFolder(adapter,x.rel.slice(0,x.rel.lastIndexOf('/')));
        if(await adapter.exists(x.rel))fail('目标文件出现并发变化，已拒绝覆盖');
        await adapter.writeBinary(x.rel,buffer(x.data));
      }
      added++;
    }
    return {added,skipped};
  }
  async function applyFormal(report,context) {
    const items=[{path:'content/'+report.fileName,data:report.bytes,sha256:report.hash}];
    const result=await applyExchangeItems(items,context);
    return {...result,notesChanged:false};
  }
  async function applyIncremental(report,context) {
    const result=await applyExchangeItems(report.contents,context);
    if(!Array.isArray(context.plugin.data.importedHashes))context.plugin.data.importedHashes=[];
    if(!context.plugin.data.importedHashes.includes(report.hash))
      context.plugin.data.importedHashes.unshift(report.hash);
    context.plugin.data.importedHashes=context.plugin.data.importedHashes.slice(0,250);
    await context.plugin.saveData(context.plugin.data);
    return {...result,notesChanged:false};
  }
  async function applyOrdinary(report,context) {
    const adapter=context.app.vault.adapter;
    const newFiles=report.newItems;
    const plan=[];
    for(const item of newFiles){
      if(await adapter.exists(item.path)) {
        const current=asBytes(await adapter.readBinary(item.path));
        if((await sha256(current))===item.sha256)continue;
        fail('预览后目标文件发生变化，已停止写入：'+item.path);
      }
      if(context.plugin.engine?.state?.known?.[item.path])
        fail('预览后发现已知版本历史；普通 ZIP 不能绕过删除墓碑或父版本：'+
          item.path+'。请使用「导入普通 Markdown（先预览）」进行明确恢复');
      plan.push(item);
    }
    let created=0;
    const inserted=[];
    try{
      for(const item of plan) {
        const at=item.path.lastIndexOf('/');
        if(at!==-1)await ensureVaultFolder(adapter,item.path.slice(0,at));
        if(await adapter.exists(item.path))fail('导入期间出现同名文件，已停止');
        if(typeof context.app.vault.createBinary==='function')
          await context.app.vault.createBinary(item.path,buffer(item.data));
        else await adapter.writeBinary(item.path,buffer(item.data));
        inserted.push(item);
        created++;
      }
    }catch(err){
      let rolled=0;
      // Only delete newly inserted files when they are still byte-identical.
      for(const item of inserted.reverse()){
        try {
          const existing=asBytes(await adapter.readBinary(item.path));
          if(await sha256(existing)===item.sha256) {
            await adapter.remove(item.path);rolled++;
          }
        }catch(_){}
      }
      fail('普通 ZIP 导入失败，尝试回滚已写入的 '+rolled+' 个新文件：'+
        String(err.message||err));
    }
    return {added:created,skipped:report.sameItems.length,
      conflicts:report.conflicts.length,excluded:report.excluded.length+
        report.invalid.length,notesChanged:created>0};
  }
  async function apply(report,context) {
    const group=currentGroup(context);
    if(report.groupId && report.groupId!==group)
      fail('预览后 GroupID 已改变，禁止导入原包');
    if(report.kind==='ordinary')return applyOrdinary(report,context);
    if(report.kind==='formal')return applyFormal(report,context);
    if(report.kind==='incremental')return applyIncremental(report,context);
    fail('不支持的 ZIP 格式');
  }
  async function exportVault(context) {
    const {app}=context,adapter=app.vault.adapter;
    if(typeof app.vault.getFiles!=='function')
      fail('当前 Obsidian 未提供知识库文件列表；请使用同步核心导出功能');
    const listed=app.vault.getFiles().filter(f=>
      f && safeRel(f.path) && !isExcluded(f.path) && allowedContent(f.path));
    if(!listed.some(f=>isNotes(f.path)))
      fail('当前知识库没有可导出的 Markdown/Canvas 文件');
    if(listed.length>MAX_ARCHIVE_MEMBERS)
      fail('知识库文件数超过当前测试版导出上限');
    const archive=new JSZip();
    let total=0;
    for(const f of listed){
      const data=asBytes(await adapter.readBinary(f.path));
      if(data.length>MAX_ENTRY)fail('知识库存在大于 32 MiB 的文件，无法安全导出：'+f.path);
      total+=data.length;
      if(total>MAX_EXPANDED)fail('导出知识库大小超过 120 MiB 测试上限');
      archive.file(f.path,data,{binary:true,compression:'DEFLATE',
        compressionOptions:{level:3}});
    }
    const packed=asBytes(await archive.generateAsync({
      type:'uint8array',compression:'DEFLATE',compressionOptions:{level:3}
    }));
    if(packed.length>MAX_ARCHIVE)
      fail('导出备份 ZIP 超过 75 MiB 测试上限');
    await ensureVaultFolder(adapter,'VaultRelay-Transfer/exports');
    const name=String(app.vault.getName()||'Vault').replace(
      /[\/\\:*?"<>|\x00-\x1f]/g,'_').slice(0,38)+
      '_全量知识库_'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')+
      '.zip';
    const dest='VaultRelay-Transfer/exports/'+name;
    if(await adapter.exists(dest))fail('导出备份文件名意外重复');
    await adapter.writeBinary(dest,buffer(packed));
    return {path:dest,files:listed.length,bytes:packed.length};
  }
  return {inspect,apply,exportVault,scanCentral};
}
module.exports={createImportInspector};

return module.exports;
}
function loadLifecycle(){
const module={exports:{}};
'use strict';
/*
 * Unified alpha outbound package lifecycle. Deletion is OFF until the original
 * The bundled sync engine exposes a trustworthy receivedAcks state AND the exact
 * expected recipient device IDs were frozen when the bundle was created.
 * Never infer receipt from a Baidu upload, a file download, or an ACK JSON
 * merely appearing in the exchange folder.
 */
function createLifecycle(JSZip, tools) {
  const {sha256,asBytes,buffer,validGroup,safeRel}=tools;
  const goodHash=x=>/^[a-f0-9]{64}$/.test(String(x||''));
  const goodDevice=x=>/^vr-[a-z0-9]{16,64}$/.test(String(x||''));
  const goodVersion=x=>/^[a-f0-9]{24,64}:[0-9]{4}$/.test(String(x||''));
  function recipients(raw) {
    const parts=String(raw||'').split(/[,;\s]+/).map(x=>x.trim()).filter(Boolean);
    if(parts.length>10 || parts.some(x=>!goodDevice(x)) || new Set(parts).size!==parts.length)
      throw Error('ACK 预期接收设备 ID 不合法或重复');
    return parts;
  }
  async function versionsFromContent(sources,group,ownDevice) {
    const result=[],unknown=[];
    let seenContent=false;
    for(const src of sources){
      if(!src.name.startsWith('content/')) continue;
      seenContent=true;
      try{
        const bytes=asBytes(src.bytes);
        if(!src.name.toLowerCase().endsWith('.zip')||bytes.length>32*1024*1024)
          throw Error('正式内容文件格式不适合 ACK 精确关联');
        const z=await JSZip.loadAsync(bytes,{checkCRC32:true});
        const mf=z.file('manifest.json');
        if(!mf)throw Error('正式内容 ZIP 缺少清单');
        const m=JSON.parse(await mf.async('text'));
        if(m.format!=='vaultrelay.content.v2' || m.vaultGroupId!==group ||
           m.originDeviceId!==ownDevice ||
           !/^[a-f0-9]{24,64}$/.test(m.packId||'') ||
           !Array.isArray(m.entries)||!m.entries.length||m.entries.length>60)
          throw Error('内容包格式、GroupID 或同步核心发送设备未匹配');
        const names=new Set();
        for(let i=0;i<m.entries.length;i++) {
          const e=m.entries[i];
          if(!e||!safeRel(e.path)||names.has(e.path) ||
             e.versionId!==m.packId+':'+String(i+1).padStart(4,'0')||
             !goodVersion(e.versionId) ||
             (e.op!=='upsert'&&e.op!=='delete') ||
             (e.op==='upsert'&&!goodHash(e.sha256)) ||
             (e.op==='delete'&&e.sha256!==null))
            throw Error('正式内容 ZIP 版本清单不完整');
          names.add(e.path);
          if(e.op==='upsert') {
            if(e.payload!=='files/'+String(i+1).padStart(4,'0')+'.bin')
              throw Error('版本载荷命名不匹配');
            const payload=z.file(e.payload);
            if(!payload || await sha256(await payload.async('uint8array'))!==e.sha256)
              throw Error('正式内容载荷 SHA 校验失败');
          }
          result.push({versionId:e.versionId,packId:m.packId,path:e.path,
            contentSha256:e.sha256});
        }
      }catch(e){unknown.push(src.name+'：'+String(e.message||e));}
    }
    return {versions:unknown.length?[]:result,eligible:seenContent&&unknown.length===0&&result.length>0,
      reason:unknown.length?unknown.join('；'):(!seenContent?'仅有 info 状态文件，没有可核对的内容版本':'')};
  }
  async function acknowledged(rec,received,group,ownDevice) {
    if(!rec || !rec.eligible || !Array.isArray(rec.versions)||!rec.versions.length ||
       !validGroup(group)||rec.groupId!==group||rec.senderId!==ownDevice ||
       !goodDevice(ownDevice)||!received||typeof received!=='object')
      return false;
    // Records created before V5.2.0 are always strict and their frozen
    // recipients/eligibility remain unchanged; never retroactively loosen them.
    const policy=rec.ackPolicy||'all';
    if(!['any','all','manual'].includes(policy)||policy==='manual')return false;
    const items=Object.values(received).filter(x=>x&&typeof x==='object');
    const candidates=policy==='all'?rec.recipients:
      [...new Set(items.map(x=>x.fromDeviceId).filter(x=>goodDevice(x)&&x!==ownDevice))];
    if(!Array.isArray(candidates)||!candidates.length)return false;
    const confirmedBy=async device=>{
      if(!goodDevice(device)||device===ownDevice)return false;
      for(const version of rec.versions){
        let matched=false;
        for(const a of items){
          if(a.format!=='vaultrelay.ack.v2'||a.vaultGroupId!==group||
             a.fromDeviceId!==device||a.toDeviceId!==ownDevice||
             a.versionId!==version.versionId||a.packId!==version.packId||
             a.path!==version.path||a.contentSha256!==version.contentSha256||
             !['applied','same','equivalent'].includes(a.outcome)||
             !goodHash(a.ackId))continue;
          const key=group+'|'+ownDevice+'|'+version.versionId+'|'+
            (version.contentSha256||'delete')+'|'+a.outcome+'|'+device;
          if(await sha256(new TextEncoder().encode(key))===a.ackId){
            matched=true;break;
          }
        }
        if(!matched)return false;
      }
      return true;
    };
    if(policy==='any'){
      // Never aggregate partial acknowledgements from different receivers.
      for(const device of candidates)if(await confirmedBy(device))return true;
      return false;
    }
    for(const device of candidates)if(!await confirmedBy(device))return false;
    return true;
  }
  async function collect(plugin, sources,manifest,name,archiveHash,ref) {
    const own=plugin.getLegacy()?.engine?.state?.deviceId||'';
    const policy=plugin.data.ackCleanupPolicy||'any';
    if(!['any','all','manual'].includes(policy))throw Error('ACK 清理策略无效');
    const assigned=policy==='all'?recipients(plugin.data.ackRecipientIds||''):[];
    if(assigned.includes(own))throw Error('预期 ACK 接收设备不能包含本机');
    const parsed=await versionsFromContent(sources,manifest.groupId,own);
    const eligible=parsed.eligible && goodDevice(own) && policy!=='manual' &&
      (policy==='any'||assigned.length>0);
    const record={
      id:manifest.bundleId,name,sha256:archiveHash,
      groupId:manifest.groupId,senderId:own,
      ackPolicy:policy,recipients:assigned,versions:parsed.versions,
      eligible,
      reason:!goodDevice(own)?'本机 Device ID 未知，禁止自动清理':
        policy==='manual'?'本次选择仅人工保留，不根据 ACK 自动清理':
        policy==='all'&&!assigned.length?'严格模式未设置预期接收设备 ID，禁止自动清理':parsed.reason,
      stored:ref,createdAt:Date.now(),status:'pending'
    };
    if(!Array.isArray(plugin.data.bundleRecords))plugin.data.bundleRecords=[];
    plugin.data.bundleRecords.push(record);
    // Only prune old finalized records; never erase pending safety mappings.
    const done=plugin.data.bundleRecords.filter(x=>x.status==='deleted').slice(-200);
    const pending=plugin.data.bundleRecords.filter(x=>x.status!=='deleted');
    plugin.data.bundleRecords=[...done,...pending];
    return record;
  }
  async function cleanup(plugin,storage) {
    if(!plugin||!Array.isArray(plugin.data?.bundleRecords))return {deleted:0,pending:0,blocked:0};
    const old=plugin.getLegacy();
    const state=old?.engine?.state;
    const group=plugin.data.groupId;
    if(!state||state.groupId!==group||!goodDevice(state.deviceId) ||
       !state.receivedAcks||typeof state.receivedAcks!=='object')
      return {deleted:0,pending:plugin.data.bundleRecords.filter(x=>x.status==='pending').length,
        blocked:0,note:'ACK 状态不可核对，未删除任何文件'};
    let deleted=0,blocked=0,confirmed=0;
    for(const rec of plugin.data.bundleRecords) {
      if(rec.status!=='pending')continue;
      if(!await acknowledged(rec,state.receivedAcks,group,state.deviceId))continue;
      try {
        let bytes;
        if(rec.stored?.kind==='public'){
          bytes=asBytes(await storage.read(rec.stored.ref));
        }else if(rec.stored?.kind==='cloud'){
          bytes=await plugin.readTransportRecord(rec);
          if(await sha256(bytes)!==rec.sha256)
            throw Error('Windows 同步目录 ZIP SHA 已改变，拒绝清理');
          // ACK is complete, but a mirror delete may delete the cloud copy.
          // Mark for explicit manual decision; never unlink here.
          rec.status='cloud-confirmed';rec.ackConfirmedAt=Date.now();
          confirmed++;
          continue;
        }else if(rec.stored?.kind==='vault') {
          const target=rec.stored.path;
          if(typeof target!=='string' ||
             !/^VaultRelay-Transfer\/(?:outgoing|temporary)\/[^/]+\.zip$/i.test(target))
            throw Error('本地暂存文件路径不符合安全白名单');
          bytes=asBytes(await plugin.app.vault.adapter.readBinary(target));
        }else throw Error('文件存储引用缺失');
        if(await sha256(bytes)!==rec.sha256)
          throw Error('本地增量 ZIP SHA 不一致，禁止删除');
        if(rec.stored.kind==='public')await storage.remove(rec.stored.ref);
        else await plugin.app.vault.adapter.remove(rec.stored.path);
        rec.status='deleted';rec.deletedAt=Date.now();deleted++;
        if(plugin.data.latest===rec.stored.path)plugin.data.latest='';
        if(plugin.data.latestPublic?.path===rec.stored?.ref?.path)plugin.data.latestPublic=null;
      }catch(e){
        blocked++;
        rec.lastCleanupError=String(e.message||e).slice(0,300);
      }
    }
    if(deleted||blocked||confirmed) {
      await plugin.persistTransport();
      await plugin.log('ACK 清理检查',`经同步核心 ACK 核对删除 ${deleted} 个知识库临时 ZIP；`+
        `Windows 同步盘中有 ${confirmed} 个发送 ZIP 已完全确认但保留，待用户明确选择；阻止清理 ${blocked} 个。`);
    }
    return {deleted,confirmed,pending:plugin.data.bundleRecords.filter(x=>x.status==='pending').length,blocked};
  }
  return {recipients,versionsFromContent,acknowledged,collect,cleanup};
}
module.exports={createLifecycle};

return module.exports;
}
function loadPanel(){
const module={exports:{}};
'use strict';
/** Simple single-panel UI. All actions report exactly what has been verified. */
function createUnifiedPanel() {
  const {Modal,Notice,Platform}=require('obsidian');
  const device=()=>Platform.isIosApp?'iPadOS / iOS':Platform.isAndroidApp?'Android':'Windows / macOS';
  const ele=(p,tag,text,cls)=>{const x=document.createElement(tag);if(text!=null)x.textContent=text;if(cls)x.className=cls;p.appendChild(x);return x;};
  const section=(p,title,desc)=>{const s=ele(p,'section',null,'vru-section');ele(s,'h3',title);if(desc)ele(s,'p',desc,'vru-help');return s;};
  const button=(p,label,handler,primary=false)=>{
    const x=ele(p,'button',label,primary?'vru-button vru-primary':'vru-button');
    x.type='button';x.addEventListener('click',handler);return x;
  };
  const row=p=>ele(p,'div',null,'vru-row');
  const toggle=(p,on,handler)=>{
    const x=button(p,on?'已开启':'已关闭',handler,on);
    x.className+=' vru-toggle '+(on?'vru-toggle-on':'vru-toggle-off');
    x.title=on?'点击关闭自动功能':'点击开启自动功能';
    return x;
  };
  function collapsible(p,text){
    const d=ele(p,'details',null,'vru-fold');const summary=ele(d,'summary',text);
    ele(d,'p',text,'vru-help');return d;
  }


  // V4.0.11: read-only, nearly full-screen content review.
  // It uses the native engine's verified payload(), never the untrusted outer ZIP.
  class VaultRelayReviewFileModal extends Modal {
    constructor(app,plugin,item){
      super(app);this.plugin=plugin;this.item=item;this.allowLarge=false;
    }
    async onOpen(){
      this.modalEl.addClass('vru-review-modal');
      await this.render();
    }
    async getText(bytes,path,side){
      const raw=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
      const textual=/\.(md|markdown|txt|canvas|json|yml|yaml|xml|csv|tsv|html|css|js|ts|py|log)$/i.test(path);
      if(!textual)return `[${side}：非文本文件，${raw.length} 字节；请根据 SHA 和文件类型审核]`;
      if(raw.length>4*1024*1024&&!this.allowLarge)
        return `[${side}：文本超过 4 MiB。点击「加载大文件」后才显示全文，避免手机卡顿。]`;
      try{return new TextDecoder('utf-8',{fatal:true}).decode(raw);}
      catch(_){return `[${side}：不是合法 UTF-8 文本，已保留原始字节，不能在此预览]`;}
    }
    async render(){
      const e=this.contentEl,item=this.item,p=this.plugin;
      e.empty();
      const head=ele(e,'div',null,'vru-review-heading');
      ele(head,'h2','文件内容 · 写入前只读审核');
      button(head,'关闭',()=>this.close());
      ele(e,'p','文件：'+item.path,'vru-review-path');
      const v=item.version;
      const facts=[
        '状态：'+item.status,
        '来源：'+(v?.originName||v?.originDeviceId||'本地'),
        '版本：'+(v?.versionId||'无共享版本'),
        '时间：'+(v?.eventAtUtc||v?.createdAtUtc||'未提供'),
        '本机 SHA：'+(item.localHash||'本机没有此文件'),
        '接收 SHA：'+(v?.sha256||'无'),
        item.reason?'判定原因：'+item.reason:''
      ].filter(Boolean);
      const meta=ele(e,'details',null,'vru-review-meta');
      ele(meta,'summary','查看来源、版本、SHA 与判定依据');
      for(const x of facts)ele(meta,'p',x);
      const warning=ele(e,'p','这里仅供阅读与比较，不修改正式笔记。必须返回审核界面明确确认，才允许应用安全内容。','vru-review-warning');
      let leftText='本机没有该文件',rightText='没有可读取的接收版本';
      try{
        const local=p.app.vault.getAbstractFileByPath(item.path);
        if(local && !local.children){
          if((local.stat?.size||0)>4*1024*1024&&!this.allowLarge)
            leftText='[本机文件超过 4 MiB；点击「加载大文件」查看全文]';
          else leftText=await this.getText(await p.app.vault.readBinary(local),item.path,'本机文件');
        }
      }catch(err){leftText='本机读取失败：'+String(err.message||err);}
      try{
        if(v?.op==='delete')rightText='接收端标记为删除；不展示正文';
        else if(v && typeof p.engine?.payload==='function'){
          if((v.size||0)>4*1024*1024&&!this.allowLarge)
            rightText='[接收版本超过 4 MiB；点击「加载大文件」查看全文]';
          else rightText=await this.getText(await p.engine.payload(v),item.path,'接收版本');
        }
      }catch(err){rightText='接收版本读取或完整性验证失败：'+String(err.message||err);}
      const grid=ele(e,'div',null,'vru-review-columns');
      const left=ele(grid,'section',null,'vru-review-side');
      ele(left,'h3','本机现有文件');
      ele(left,'pre',leftText,'vru-review-text');
      const right=ele(grid,'section',null,'vru-review-side');
      ele(right,'h3','收到的共享版本');
      ele(right,'pre',rightText,'vru-review-text');
      if(leftText!==rightText &&
         !leftText.startsWith('[') && !rightText.startsWith('[')){
        const lhs=leftText.replace(/\r\n?/g,'\n').split('\n');
        const rhs=rightText.replace(/\r\n?/g,'\n').split('\n');
        let first=0;while(first<Math.min(lhs.length,rhs.length)&&lhs[first]===rhs[first])first++;
        const note=ele(e,'p',`文本差异起始行（逐行对照）：本机 ${Math.min(first+1,lhs.length)}，接收 ${Math.min(first+1,rhs.length)}。如有插入/删除行，请以左右完整正文核对。`,'vru-review-diff-note');
      }
      if(!this.allowLarge && ((v?.size||0)>4*1024*1024 ||
           (p.app.vault.getAbstractFileByPath(item.path)?.stat?.size||0)>4*1024*1024))
        button(e,'加载大文件全文（可能占用较多内存）',async()=>{this.allowLarge=true;await this.render();});
      const actions=ele(e,'div',null,'vru-review-actions');
      button(actions,'返回文件审核列表',()=>this.close(),true);
      warning.title='本窗口没有任何正式写入按钮';
    }
  }

  class VaultRelayHelpModal extends Modal {
    constructor(app,plugin){super(app);this.plugin=plugin;}
    onOpen(){
      this.modalEl.addClass('vru-manual-modal');
      const c=this.contentEl;c.empty();c.addClass('vru-manual-content');
      const h=ele(c,'div',null,'vru-manual-head');
      ele(h,'h2','Vault Relay V'+(this.plugin.manifest?.version||'4.0.10')+' · 使用说明');
      button(h,'关闭',()=>this.close());
      ele(c,'p','适用 Windows、Android、iPadOS。日常使用 ① 预览并生成增量 ZIP → ② 下载并导入；接收后连续进入只读审核，只有明确确认正式写入才算导入完成。知识库比对只读，不会强制两台设备一致。','vru-manual-intro');
      function part(title,paragraphs,steps){
        const s=ele(c,'section',null,'vru-manual-section');ele(s,'h3',title);
        for(const p of paragraphs||[])ele(s,'p',p);
        if(steps?.length){const ol=ele(s,'ol');for(const t of steps)ele(ol,'li',t);}
      }
      part('一、最重要的安全规则',[
        '有内容增量时 ZIP 可包含 content/info 和待回传 ACK；只有 ACK 时发送独立 JSON。任何接收文件都必须经过稳定性、GroupID、DeviceID、SHA-256、CRC 和安全路径检查。',
        '方案 A：下载后自动校验、自动核对版本并显示待审核结果。正式笔记只在用户明确点击审核确认后写入；冲突、版本分叉和删除不会静默覆盖。',
        '「传输区已有 ZIP」不等于百度网盘已上传，「已下载」不等于笔记已应用，也不等于 ACK 已完成。'
      ]);
      part('二、首次配置',[
        '打开真正需要同步的 Obsidian 知识库；设备可在任何正常位置，不要求命名为 00Obsidian。首次创建或加入群组并核对 GroupID，每台设备的 Device ID 应独立。',
        'Windows：指定唯一已经与百度网盘云端群组文件夹建立同步关系的本地目录，插件验证 VaultRelay-Space.json。Android/iPadOS：保存该群组的长期分享链接及可选提取码。',
        '不要在多个不同的云端目录同时使用同一个 GroupID。已有 data.json、身份、版本历史和 ACK 记录在升级时必须保留。',
        'V5.2.3 新发送包默认采用“任意一台设备完整 ACK”：只要一台其他设备确认本包所有版本，即满足 ACK 条件；不需要填写接收设备 ID。严格模式才填写其他设备的完整 ID，要求全部确认；“仅人工清理”不因 ACK 清理。旧版本包沿用创建时的规则，Windows 百度同步目录 ZIP 不自动删除。'
      ]);
      part('知识库移动与普通 Markdown 默认目标（V5.2.3）',[
        'Vault Relay 通过 Obsidian 当前打开的 vault.adapter 识别当前知识库，而不是从插件文件夹反推路径，更不会固定 test1、某个磁盘或 00Obsidian。',
        '普通 Markdown 默认导入当前知识库根目录；只有展开“指定知识库内的子文件夹（可选）”才需要填写学习/英语等相对路径。禁止填写盘符或知识库名称。',
        '移动 Windows 知识库时，应先关闭 Obsidian，将整个知识库连同隐藏配置和 VaultRelay-Transfer 完整移动，再从新位置重新打开。插件仅在旧内部交换区已不存在、当前内部目录和 GroupID 完整可信时重绑定绝对路径。',
        '如果旧知识库仍存在，可能是复制而非移动；插件拒绝自动重绑定相同 DeviceID，以避免两个副本同时运行。移动知识库不会自动搬动知识库外的百度网盘同步目录；其连接需要单独核对。'
      ]);
      part('三、生成 ZIP 与打开网盘上传入口',[
        '点击「预览并生成增量 ZIP」，打开同步核心的新增/修改/冲突预览。先检查真实文件和版本，再点击「确认上传」或「确认生成」。',
        '确认后插件自动继续：生成核心 content/info → 封装外层增量 ZIP → 校验并准备 ZIP 与独立 ACK。没有新内容时只准备仍需回传的 ACK，不制造空 ZIP。',
        'V5.2.9：生成后点击“上传 ZIP / ACK（打开百度网盘入口）”。保存目标云端目录，打开自己的网盘上传；也可复核最新 ZIP 的 SHA 后准备系统分享。手动上传区提供相同入口。',
        'Windows：Windows 自动收发关闭时 ZIP/ACK 只保存到知识库本地待发送区；开启时校验、去重后自动写入已绑定的百度同步目录。百度客户端上传状态须另外确认。Android/iPadOS：从知识库的 VaultRelay-Transfer/temporary 手动上传至云端群组文件夹。系统分享只在 Obsidian 宿主提供 Web Share 或原生 Share/Filesystem 桥接时可直接打开；不可用时请用文件管理器手动上传。点击本按钮本身不证明云端成功。'
      ]);
      part('四、下载增量包：自动核对，人工应用',[
        'Android/iPadOS 点击「下载增量包」打开保存的百度网盘群组分享页，由你在百度网盘中手动下载需要的 ZIP / ACK。Windows 的同步客户端负责把云端文件送到已绑定的本地目录。',
        'Android 返回 Obsidian 时，插件尝试从设置的 Download/BaiduNetdisk 目录安全复制并回读 SHA 到 temporary；iPadOS 仍依赖系统文件选择器，所有平台保留安全兜底。',
        '接收到新的有效 ZIP 后，插件在前台自动执行只读版本核对并尝试弹出审核窗口。若手机没有弹出，直接点击「高级操作 → 手动下载 → 查看待审核文件（人工打开）」，不必重复下载。',
        '审核列表不再局限于小型滚动框：支持搜索文件名/路径，点击文件名打开接近全屏的双栏只读全文与差异查看器。最后仍须亲自确认「仅应用安全文件」。',
        '如果自动接收不成功，点击「从系统文件夹选择增量包」，选择已下载的 ZIP / ACK。手动入口同样先复制、校验并进入统一 temporary 流程，不直接写正式笔记。'
      ]);
      part('五、审核窗口怎么用',[
        '审核中可查看待新增、安全更新、字节相同、内容等效、冲突与分叉。使用搜索框定位文件，直接点击文件名查看真实路径、来源、版本、完整正文及本机/接收端差异。',
        '对于非常大的文本，查看器先显示内存保护提示，可由用户主动选择加载；非文本附件显示大小与哈希信息，不假装可以解析为文字。',
        '没有冲突的文件也必须人工点击确认才正式写入。遇到冲突先保留两边版本，Windows 可进一步查看历史和智能合并。'
      ]);
      part('六、文件列表、日志和诊断',[
        'VaultRelay-Transfer 是插件的临时交换工作区，实际保留在知识库里，并由同步扫描排除；V4.0.12 只在 Obsidian 左侧文件浏览器中隐藏它；.obsidian 和 VaultRelay-Transfer 全部子目录均递归排除正式笔记同步。其他普通文件夹照常显示，不做笔记类别白名单识别。',
        '控制台五个主标题默认均收起。Windows 可以用窗口宽度滑杆调整 520–1100 像素并保留设置；手机随屏幕自适应。日志和诊断位于独立标题；导出后可保存本地、尝试系统分享或打开文件所在文件夹。无新增时静默运行。',
        'V5 系列诊断会只读列出历史来源，并把已经接受、后来从本机删除的文件归类为 local-deleted：不再计入待新增，等待用户明确选择发布删除版本。',
        '诊断 JSON 保留在 VaultRelay-Transfer/diagnostics；可从文件管理器取出。它不包含笔记正文、完整网盘分享链接或明文提取码，但会包含知识库相对文件路径，分享前请检查文件名是否涉及隐私。'
      ]);
      part('七、独立 ACK 和安全清理',[
        '新内容 ZIP 优先携带尚未发送的 ACK；无新内容时单独发送 ACK JSON。上传按钮同时准备待发送 ACK；待确认 ACK 和尚未应用的内容不应删除。',
        'Windows 同步盘 ZIP/ACK 不自动删除，因为同步删除可能影响百度网盘。发送包的 ACK 清理规则在封包时固定：新版默认任意一台设备对本包全部版本完整确认；严格模式按所有指定接收设备确认，人工模式不自动清理。不能把不同设备的部分 ACK 拼成完整确认；旧包规则不会因升级改变。'
      ]);
      part('八、本地大批量旧笔记与当前能力边界',[
        '你可以手动将现成笔记文件夹放进每台设备的知识库；这样可以绕过 Vault Relay 传输正文，但从百度网盘手动下载大文件仍可能消耗百度的配额。',
        '此前讨论的「每台设备独立登记初始 SHA 基线」属于后续独立功能；V5.2.3 的独立知识库 SHA 清单只作为只读对照，不伪装为已经验证的同步版本。尚未登记的批量文件仍可能成为待发送新增项，启用上传前应先查看预览。',
        'V4.0.14 已实机验证已知本机删除识别、人工发布删除墓碑、接收端独立确认删除及备份、可核实本机未发送包的人工隔离撤销。Android/iPadOS 删除前必须人工确认；百度实际上传状态无法由插件自动证明，真实设备仍需单独验收。'
      ]);
      part("九、用两个动作完成日常同步",[
        "① 预览并生成增量 ZIP：先核对本机新增、更新、删除候选，再明确确认。Windows 写入百度网盘本地同步区；手机/iPad 生成待手动上传的外层 ZIP。上传后的云端状态必须另行核对。",
        "② 下载并导入：先让百度网盘客户端下载新包或使用系统文件选择器；插件校验 ZIP、GroupID、SHA/CRC，并把交换文件安全写入受排除的同步工作区。接着自动打开只读版本审核；你在同一流程中明确确认新增/更新，删除单独确认。",
        "“下载成功”只证明增量文件安全接收，不代表正文已经写入。如果关闭审核窗口，本机正式笔记仍保持原样；重新打开「高级操作 → 手动下载 → ② 核对并确认正式导入」继续，不需要重新扫描已接收文件。",
        "Windows 已开启自动收发时，一般不必点击「立即安全扫描」；在急于接收新包或排查目录问题时才使用。手动下载界面的系统文件选择也能处理未自动接收的 ZIP/ACK。",
        "一致状态的笔记从来不需要重复写入。待新增、安全更新需要一次明确确认；删除墓碑需要独立确认；冲突/分叉必须先人工解决。"
      ],[
        "准备两台设备的同一 GroupID（DeviceID 不同）",
        "在发送端创建一篇无关紧要的测试笔记，点击 ① 上传并确认",
        "核实 ZIP 确实到达百度网盘云端；在另一台设备下载该 ZIP",
        "使用 ② 下载并导入或手动选择增量包，进入只读审核并确认安全新增",
        "检查目标笔记确实出现；再查看操作日志。不要把“只接收到 ZIP”误判成“正式导入完成”"
      ]);
      part("十、知识库比对：导出 → 导入 → 比对",[
        "入口为「高级操作 → 知识库比对」，不在日常主按钮中。用于检测两台设备的正式知识库文件是否不同，不会更改任何笔记。两台设备清单生成时间不同，结果仅代表两个快照。",
        "① 在设备 A 点击「导出本机知识库信息」，插件重新读取符合范围的文件并计算 SHA-256；弹窗可选择「保存本地」或「系统分享」。清单 JSON 中包含相对路径、字节数、SHA、修改时间、已知版本 ID/操作及设备身份，但不含笔记正文。",
        "② 将 A 的 JSON 清单通过百度网盘或系统分享传给设备 B。在 B 点击「导入对端知识库信息」，从系统文件选择该 JSON。要求 GroupID 相同、DeviceID 不同；保存到 VaultRelay-Transfer/comparisons 排除区。",
        "③ 在设备 B 点击「开始比对」。插件**重新扫描 B 当前的正式文件**，逐路径对照 A 的已保存快照，显示字节相同、仅本机、仅对端、相同路径内容不同和异常数量。可搜索、筛选和展开 SHA 等信息。",
        "相同 SHA 意味着两份文件字节完全相同；修改时间/版本 ID 不同并不意味着正文不同。不同 SHA 无法确定哪一端正确，更不能自动删除另一端文件。不同路径但相同 SHA 也可能是移动/复制；本版不自动认定改名。",
        "比对清单有文件数量/单文件 64 MiB/JSON 8 MiB 等上限。超大或无法读取的文件会计入异常，结果不能宣称“整个知识库一致”。清单不是远端的实时视图或来源签名；如资料已改动，需要对端重新导出。"
      ],[
        "在 A 生成并保存/分享清单",
        "在 B 导入 A 的清单",
        "在 B 开始比对，查看汇总和差异清单",
        "先理解差异成因，再按需选择性导出笔记，绝不按摘要数字自动覆盖"
      ]);
      part("十一、对不同文件做选择性导出",[
        "比对结果列表只允许勾选“本机存在且与对端不同”的文件；仅对端存在的文件必须回到对端进行导出。选中文件的真实字节在导出前再次 SHA 校验；比对后修改过则拒绝导出。",
        "「导出所选普通文件 ZIP」仅封装所勾选的真实文件和其相对目录结构，不带 Vault Relay 原生版本关系。对端应从「知识库管理 → 导入知识库（先预览）」检查，已知历史路径/同名不同内容不能绕过保护直接写入。",
        "「导出所选增量包（新版本）」创建新的原生 upsert 后继版本并封装外层 ZIP；不是简单复制旧 outbox。每次最多选择 25 项，不能用于冲突、分叉或未经授权的删除恢复。Windows 会准备到已绑定的百度本地目录；移动端生成临时外层 ZIP 待用户手动上传。",
        "对于“原文件已被删除，另一端保留旧正文”的情形，请优先使用普通 Markdown 的明确恢复流程，建立合法的新版本，再手动上传。不得单靠普通 ZIP 强行复活曾经接受过的删除墓碑。",
        "只用 SHA/路径来决策文件是否相同，不在导出环节判断谁有权覆盖另一个设备。选定导出后也必须由接收端按原有安全确认流程应用。"
      ]);
      part("十二、删除、恢复与回退的关键差别",[
        "删除墓碑是历史版本清单内的 op: delete 记录，说明发送设备明确删除某路径；不会触发其他设备自动删除。接收端只读审核将该文件列为待审核删除，必须另行确认并留存 SHA 核验备份。",
        "主动从备份恢复正式笔记，不等于回到旧的历史时间点。新的恢复形成后继版本；旧删除记录、旧内容 ZIP 与 ACK 不被改写。另一个设备的正式文件仍需它自己的用户确认。",
        "V5 新操作如果在操作日志中存在完整事务索引（操作前/后 SHA、版本关系、备份路径），才能显示「回退此操作（先预览）」。方式 A 只提取副本至 VaultRelay-Transfer/recovered；方式 B 在严格检查后改动正式笔记。",
        "V4.0.14 旧普通操作日志不保证具备可回退索引，不能凭一次日志“成功”就猜测旧备份的 SHA 或路径。对端明确选择保留文件也不会强制其他设备跟着恢复。"
      ]);
      part("十三、平台差异与常见排错",[
        "Windows：关闭自动收发后新 ZIP/ACK 只进入本地待发送区；开启后校验、去重并复制到百度同步目录，百度客户端是否上传至云端仍须自行确认。暂停前已在同步目录的文件可能继续被百度客户端上传。",
        "Android：下载目录可能因系统版本/授权不同而无法读取。自动检测失败，使用系统文件夹选取下载 ZIP/ACK；回 Obsidian 后如果审核窗口没置顶，进入高级操作下的 ② 核对并确认。",
        "iPadOS：优先通过系统文件选择器指定下载的 ZIP/ACK；系统分享是否能打开还取决于 iOS/Obsidian 的 WebView 权限，应先做小文件实测。",
        "出现 GroupID、SHA、CRC、版本分叉、安全路径冲突或权限异常时，不要循环重试确认删除或清空目录。保留 data.json、历史 ZIP/ACK、安全备份，导出诊断并结合操作时间定位。",
        "版本号相同不等于各端拥有相同知识库内容。可以通过知识库比对定期检查，但差异可能是有意保留的本机文件，只有用户才能决定要不要补齐。"
      ]);
      part('十四、注意事项 · 常见问题问答',[
        "Q01：Windows 显示「当前待传 ZIP」，是否代表百度网盘已经成功上传？ 答：不是。它只说明本地已经准备了待传包。需要在百度网盘云端检查同名 ZIP；本地同步图标不是 Vault Relay 获取的云端上传回执。",
        "Q02：Windows「自动收发增量文件」已开启，会自动删改我的正式笔记吗？ 答：不会。该开关只负责 ZIP 和独立 ACK 的自动运输。笔记新增、更新、删除仍要人工预览并确认。",
        "Q03：删除墓碑是什么文件？ 答：是原生内容 ZIP 中 manifest.json 的一条 op: delete 版本记录，有父版本 ID，不单独保存为 .md 文件，也不重复附带被删正文。",
        "Q04：一台设备删除，另一台一定要跟着删除吗？ 答：不一定。接收端默认不删除；你可以明确确认删除，也可以记录「拒绝删除并保留本机文件」。两端可能暂时不同，目的是保护用户选择。",
        "Q05：为何删除完成后，在「全部」审核中仍然能找到那篇文件？ 答：「全部」包括只读历史，不只包括可执行任务。真正待删除数量应该刷新为 0；历史已不存在状态仍可供追溯。",
        "Q06：「本机已删除（25）」是不是 25 篇待恢复的笔记？ 答：不是。它们是设备以前接受过历史 upsert、随后在本机已删除的文件，不能因此把旧内容误判为新版本并恢复。",
        "Q07：为什么 25 项本机删除不能立刻一键批量发布墓碑？ 答：这些历史可能存在旧内容包，其中包含仍在使用的文件。必须逐项确认删除意图、版本父子关系及传输状态；不要直接删除旧 ZIP。",
        "Q08：撤销未上传的本机包有什么限制？ 答：只支持能校验的本机草稿，且用户确实知道它从未上传、分享、复制或交付；历史状态未知、已出现 ACK、已离开活动发送区等情况都会被拒绝。",
        "Q09：可以直接从百度网盘下载普通 .md 再导入吗？ 答：可以。使用「高级操作 → 知识库管理 → 导入普通 Markdown（先预览）」，确认目标目录及冲突后，才写入正式知识库。",
        "Q10：只下载 .md 能保留原文件夹结构吗？ 答：通常不能。单个 Markdown 文件本身不携带可靠的原始相对目录，请在导入页面指定目标相对文件夹。",
        "Q11：如果 Windows 已发布 V2 删除墓碑，再从 Android 导入旧正文会怎样？ 答：只有当前设备已正确接受该删除头版本、目标本机不存在且内容/版本检查通过时，才能经明确确认恢复。恢复是新本机版本，之后另行手动发布 V3 upsert，不是修改旧 V2。",
        "Q12：如果下载的 .md 与正式笔记同名但正文不同，可以自动覆盖吗？ 答：不可以。它会被判定为冲突，必须用户另行比较或选择其他路径；不能绕过正式笔记保护。",
        "Q13：普通 Markdown 导入会自动导入图片、附件吗？ 答：不会。只选择 .md 不会自动带上它引用的图片或其他二进制附件，应另行按同步机制处理。",
        "Q14：操作日志里是否每条记录都能直接回退？ 答：不是。只有 V5 以后真实记录了操作 ID、操作前后 SHA、备份位置和版本关系的事务才显示可靠的回退按钮。普通只读日志或 V4 旧日志不能据此凭空恢复正文。",
        "Q15：为什么回退时还要二次确认？ 答：回退本身就是一次正式笔记写入甚至删除，必须预览、重新验证当前版本和备份，并由用户明确授权。",
        "Q16：回退操作的方式 A 和 B 有何区别？ 答：A 只提取副本到排除同步的 VaultRelay-Transfer/recovered/；B 在严格验证后恢复到正式知识库。推荐 B 用于真正恢复，A 用于查阅历史。",
        "Q17：方式 B 成功后其他设备会立即恢复吗？ 答：不会。本机恢复后仍需手动检查上传预览并发布新版本；接收端依然需要人工确认正式应用。",
        "Q18：为什么操作日志里找不到 V4 删除的回退按钮？ 答：V4 旧日志没有稳定的可回退事务索引，不能靠时间和文件名猜测备份。可先查独立安全备份，再用 V5 普通 Markdown 导入安全恢复。",
        "Q19：诊断「系统分享」与知识库「系统分享」会直接发给谁？ 答：只打开系统分享面板，由你亲自选择目的地。诊断包含路径摘要，知识库备份包含真实正文；绝不能在不检查隐私时公开分享。",
        "Q20：为什么点击「导出诊断日志 / 导出知识库」后，要先准备文件再选择「系统分享」？ 答：系统分享 API 通常要求由实际按钮点击直接调用。V5.2.3 会在弹窗内先生成本地文件，准备完成后再让用户点击「系统分享」，避免异步导出使 Android/iPadOS 拒绝打开分享面板；不需要再回主控制台找第二个分享按钮。",
        "Q21：新版为什么把「检测下载目录」和「查看待审核文件」移走了？ 答：为了压缩日常控制台长度，它们集中在「高级操作 → 手动下载」；日常下载主按钮仍然保留。",
        "Q22：为何删除审核按钮现在是「审核删除版本预览（0）」？ 答：数字只统计真正仍需删除本机文件的候选。若只剩本机已不存在的历史版本，按钮禁用并显示 0，避免让用户误以为删除失败。",
        "Q23：为什么有新的 ZIP，却没有待新增/更新？ 答：可能是重复包、内容相同、已被更新版本覆盖、或包未通过检查。应核对只读审核、来源与 SHA，而不是重复确认上传。",
        "Q24：独立 ACK 就是删除墓碑吗？ 答：不是。ACK 是独立 JSON 确认，说明接收设备如何处理版本；删除墓碑则是内容版本本身。二者均不直接证明百度云上传成功。",
        "Q25：可以手动清理旧 ZIP、ACK、data.json 或整个 VaultRelay-Transfer 吗？ 答：不要。这些可能涉及旧正文恢复、父版本校验、设备身份或未回传确认。清理仅能按明确的安全条件操作。",
        "Q26：GroupID 和 DeviceID 分别是什么？ 答：GroupID 标识同一个逻辑同步群组；每台设备应有自己的 DeviceID。升级不得复制别台设备的身份或重建原 GroupID。",
        "Q27：Android 下载目录检测失败时怎么办？ 答：使用「高级操作 → 手动下载 → 从系统文件夹选择增量包」作为兜底。系统文件选择仍走校验流程，不直接覆盖正式笔记。",
        "Q28：Windows 与 Android 测试通过，代表 iPadOS 的全部功能也通过了吗？ 答：不代表。V4.0.14 Windows→红米删除同步已实测；V5 的新增分享、导入、回退和 iPadOS 真机能力仍须单独验收。",
        "Q29：如何处理冲突或版本分叉？ 答：不要用普通导入覆盖。先读两个版本及父版本的完整内容，保留各端现有文件，在「版本与冲突」中人工解决或在 Windows 使用智能合并。",
        "Q30：如果出现异常，应先保留哪些证据？ 答：停止执行任何正式笔记写入/删除；备份 data.json、正式知识库、内容 ZIP/ACK、VaultRelay-Transfer/backups/，然后保存或分享脱敏的运行诊断。",
        "Q31：知识库比对需要上传全部笔记正文到百度网盘吗？ 答：不需要。① 导出的 JSON 只包含路径、大小、SHA 与已知版本信息；文件正文只在用户另外选择性导出时才传输。",
        "Q32：知识库比对的 ①、②、③ 分别在哪里？ 答：高级操作 → 知识库比对。① 本机生成并保存或分享 JSON，② 导入另一设备的 JSON，③ 重新扫描本机并查看只读比对结果。",
        "Q33：比较两端清单时，GroupID 可以不同吗？ 答：不可以。不同 GroupID 属于不同逻辑同步群组，会被拒绝；DeviceID 也必须不同，以防把本机快照与自己比较。",
        "Q34：SHA-256 相同就说明两篇笔记的版本完全相同吗？ 答：只说明正文的文件字节相同。版本 ID、父版本和修改时间可能不同；比对面板会把这类“内容相同但版本记录不同”单独计数。",
        "Q35：两个文件大小相同，就能认定内容一致吗？ 答：不能。最终以同路径 SHA-256 比较字节，大小和修改时间只是辅助信息。",
        "Q36：比较的文件范围包括图片、PDF 和附件吗？ 答：包括 Obsidian 文件列表里属于正式知识库的文件与附件；递归排除 .obsidian/ 和 VaultRelay-Transfer/，单文件默认不超过 64 MiB。",
        "Q37：为什么对端只有 20 个文件、而本机 30 个，系统不自动复制差的 10 个？ 答：差异可能是对端主动删除、路径移动或只留本机使用；只读比对不能代表用户希望强制两端一致。须手动选择正确版本和传输方向。",
        "Q38：为什么比对显示“结果不完整”？ 答：任一设备存在超大、读取失败、大小写冲突或其他异常文件。异常项没有可靠 SHA，不能被当成“一致”或“不同”。",
        "Q39：比对结果过了几小时还能使用吗？ 答：可用于参考，但对端 JSON 是旧快照，本机每次执行③会重扫；要验证最新一致性，需要对端重新执行①。",
        "Q40：知识库信息 JSON 会泄露笔记内容吗？ 答：不会包含正文，但相对路径、文件名、大小、SHA、设备 ID 可能涉及隐私，不应随意公开分享。",
        "Q41：可以只导出比对中不同的一两篇笔记吗？ 答：可以。比对结果内勾选本机存在的差异文件，选择普通 ZIP 或发布新的选择性增量 ZIP；不能选择本机不存在的对端文件。",
        "Q42：普通文件 ZIP 和选择性增量 ZIP 有什么根本区别？ 答：普通 ZIP 保存文件字节与目录，不带 Vault Relay 的原生版本链；选择性增量 ZIP 会生成新的受父版本约束的正式同步版本。",
        "Q43：普通 ZIP 导入已有删除历史的文件为什么被拦截？ 答：它没有父版本证据，无法证明是用户主动恢复。使用普通 Markdown 安全恢复流程明确确认，保留墓碑并建立新的后继版本。",
        "Q44：为什么选中的文件改动后不能直接导出？ 答：比对时记录了 SHA。导出前再读一次并比对；文件变更意味着预览已过期，需要重新执行③。",
        "Q45：导出所选增量 ZIP 会把 outbox 里其他旧文件一并传出吗？ 答：不会。V5.2.3 只封装本次选择产生的原生内容包，并在外层 ZIP 打包前逐项核对所选路径。",
        "Q46：“下载并导入”是不是接收 ZIP 后立刻自动写入所有笔记？ 答：不是。它把接收、只读审核、明确确认放在连续流程里，减少来回点击；真正写入仍要你主动按确认按钮。",
        "Q47：如果下载过程中直接关闭了审核窗口，会不会自动导入？ 答：不会。已经通过校验的 ZIP 和版本记录可保留，但正式笔记未写入，不能称为“下载并导入完成”。可用高级操作下的审核入口继续。",
        "Q48：既然取消了“稍后审核”，万一我临时退出怎么办？ 答：不再将其作为正常步骤，但未处理记录不会因此消失。重新打开高级操作 → 手动下载 → ② 核对并确认正式导入即可。",
        "Q49：Windows 开启自动收发后，还要每次点击 ② 下载并导入吗？ 答：通常只需在收到变更时查看只读审核并确认。自动收发负责运输；主动点击②可立即打开审核，但不会绕过人工写入确认。",
        "Q50：Android 自动下载目录检测失败怎么办？ 答：先确认百度网盘确实下载完成；在高级操作 → 手动下载使用「从系统文件夹选择增量包」，仍会进行 SHA/CRC 和版本核验。",
        "Q51：为什么删除成功后“审核删除版本预览”应显示 0？ 答：该数字只统计本机仍存在、真正待删除的正式文件；已不存在的删除历史保留为 absent，但不再计入待执行数。",
        "Q52：仅本机有某篇笔记，是否一定说明对端同步失败？ 答：未必。可能是新建未上传、对端主动删除、文件移动或对端清单已过期，需要结合历史、ACK、版本关系判断。",
        "Q53：“导出所选普通文件 ZIP”会自动导入另一台设备吗？ 答：不会。另一台设备还需要接收该 ZIP，打开知识库管理的导入预览，明确确认新增；已知历史和同名冲突按安全规则阻止。",
        "Q54：知识库比对可以直接恢复图片等附件吗？ 答：比对只提供清单，选择性普通 ZIP 可以导出符合大小限制的真实附件；接收端是否允许导入取决于文件类型、冲突与当前导入器支持范围。",
        "Q55：选择性发布增量包会立刻上传百度网盘吗？ 答：Windows 只写入已绑定的本地同步目录；手机/iPad 生成待用户上传的临时包。是否到达云端，需要另外验证。",
        "Q56：为什么选择性增量包在冲突或分叉时不允许生成？ 答：不应通过重新发布来绕过冲突、父版本或删除授权。必须先查看完整版本关系并人工解决。",
        "Q57：如果两台设备有不同的路径，但文件 SHA 相同，插件会自动认为是重命名吗？ 答：不会。清单按相对路径匹配，移动、复制和重命名必须由用户确认。",
        "Q58：诊断日志、知识库信息清单、知识库备份可以系统分享吗？ 答：可以，在相应导出弹窗主动选择系统分享；是否成功取决于操作系统能力。不会自动选定接收者或上传到云端。",
        "Q59：本次版本号和插件目录名为什么不同？ 答：新版本显示 V5.2.3，但插件唯一 ID 仍是 vault-relay-v4；升级只替换代码、清单与样式，不重置 data.json 或群组身份。",
        "Q60：升级 V5.2.3 后可以直接对重要知识库批量删除或覆盖吗？ 答：不建议。先备份当前知识库和传输历史，优先只读检查与小文件试验，三端的新增功能都需要真实设备验收后再逐步扩大使用范围。",
        "Q61：预期接收设备 Device ID 是传输白名单吗？ 答：不是。V5.2.3 默认“任意一台设备完整 ACK”无需填写；仅严格模式才填写实际预期设备，控制临时 ZIP 的 ACK 清理条件。",
        "Q62：何时需要填写接收设备 Device ID？ 答：只有选择“所有预期设备均确认（严格模式）”时，才填写其他接收设备完整 vr-... ID，逗号分隔，不填自己 ID；名单在封包时冻结。",
        "Q63：Android 系统分享仍打不开怎么办？ 答：部分 Obsidian 宿主不提供 Web Share 或原生 Share 插件。V5.2.3 会尝试已有原生接口，失败时原 ZIP 仍在 VaultRelay-Transfer/temporary，可用系统文件管理器分享。",
        "Q64：手动下载时 ① 和 ② 是否都需要操作？ 答：先任选一种 ① 接收方式，再进行 ② 只读审核和明确写入确认；已自动接收就不必重复点击①，审核成功不需要再做安全扫描。",
        "Q65：插件是不是只能服务 test1 知识库？ 答：不是。Obsidian 当前打开的知识库就是操作根目录，名称与位置可以任意，内部交换路径以该根目录为基准。",
        "Q66：Windows 知识库从 D 盘移动到 E 盘，GroupID 和 DeviceID 会变吗？ 答：不会自动改；V5.2.3 仅在安全条件满足时重绑定知识库内绝对交换路径，身份与历史仍保留。",
        "Q67：复制知识库是不是等同于移动？ 答：不是。旧位置仍在时，自动重绑定会被阻止，避免同一 DeviceID 在两个知识库副本同时运行。请先确认哪个是正式设备。",
        "Q68：知识库移动后，百度网盘同步文件夹也会自动移动吗？ 答：不会。知识库外的 Windows 百度同步目录单独绑定、单独核验；不要通过改 GroupID 来修复路径。",
        "Q69：任意一台设备 ACK 是什么意思？ 答：一台其他设备必须对同一个 ZIP 里的每个正式版本都有匹配 GroupID、DeviceID、版本、SHA 和接受结果的有效 ACK，才算完整。",
        "Q70：红米确认两篇、iPad 确认另外两篇，可算同一包完整 ACK 吗？ 答：不能。不同设备的部分 ACK 不能拼凑；必须至少一台设备完整确认。",
        "Q71：严格 ACK 清理模式如何设置？ 答：在公共设置选择“所有预期设备均确认”，填写所有实际接收设备完整 Device ID。缺一个人的有效 ACK 就保留该包。",
        "Q72：仅人工清理模式是什么意思？ 答：插件不会因收到 ACK 自动删除发送临时副本。手动处理时仍须核对文件与历史，勿擅自删除云端共享 ZIP。",
        "Q73：切换 ACK 模式会修改之前已经生成的包吗？ 答：不会。每个新版包保存创建时的规则；旧版未记录策略的包始终沿用升级前的严格收件设备确认规则。",
        "Q74：ACK 可以证明云端现在还存在 ZIP 吗？ 答：不能。它能表明某台设备处理过对应同步版本，但不能单凭 ACK 确认下载来源或云端现在仍保留文件。",
        "Q75：Windows 控制台能调整宽度吗？ 答：可以。标题下方的宽度滑杆支持约 520 至 1100 像素，并记住当前设备上次保存的宽度；可恢复默认 680 像素。",
        "Q76：为什么知识库比对结果页筛选区变小了？ 答：筛选和搜索均为紧凑控件；结果列表扩大，导出操作固定在弹窗下部，仍由用户勾选文件才会导出。",
        "Q77：普通 Markdown 的目标文件夹留空，是否就自动找到原文件？ 答：不是。目标位置默认当前知识库根目录；系统文件选择器读取的是你主动选择的外部 .md，子文件夹是可选的知识库内部保存位置。",
        "Q78：导出后“打开文件所在文件夹”在 Android 没有跳转怎么办？ 答：Obsidian 移动端可能不开放文件管理器目录跳转；插件会给出或尝试复制知识库相对路径，文件原件不会丢失。",
        "Q79：Windows 点击打开文件夹没有响应怎么办？ 答：部分 Obsidian 宿主不开放 Electron 定位接口，插件会提示实际绝对路径并尝试复制；可用资源管理器手动定位，不能把弹窗关闭误当作已定位。",
        "Q80：V5.2.3 的新功能已通过三台真实设备测试了吗？ 答：尚未。原有 Windows/红米选择性同步与 Markdown 导入曾实机通过，但新的移动重绑定、ACK 策略和宽度调节仍需逐项实机验收。"
      ]);
      const tail=ele(c,'div',null,'vru-manual-tail');
      button(tail,'我已阅读 · 关闭说明',()=>this.close(),true);
    }
  }

  class VaultRelayCleanupModal extends Modal {
    constructor(app,plugin){super(app);this.plugin=plugin;this.running=false;}
    onOpen(){this.modalEl.addClass('vru-cleanup-modal');void this.render();}
    async runSafe(action,label='安全隔离操作',target=''){
      if(this.running)return;
      this.running=true;
      try{
        const result=await action();
        if(result?.cancelled){
          await this.plugin.log('安全操作已取消',label+' · '+target+'；未执行文件操作');
          new Notice('已取消；未执行文件操作',5000);
        }else{
          await this.plugin.log('安全操作已完成',label+' · '+target);
          new Notice('已完成操作，请检查下方最新状态',5000);
        }
      }
      catch(e){
        const message=String(e.message||e);
        try{await this.plugin.log('安全操作未完成',label+' · '+target+' · '+message);}
        catch(_){new Notice('操作结果日志保存失败，请保留当前提示',10000);}
        new Notice('操作未完成：'+message,10000);
      }
      finally{this.running=false;await this.render();}
    }
    async render(){
      const c=this.contentEl;c.empty();
      ele(c,'h2','V5.2.9 · 30 天安全隔离');
      ele(c,'p','本功能只处理插件自有的 Windows 知识库发送 ZIP。进入隔离后保留 30 天，期间允许恢复；本测试版永久删除关闭。','vru-meta');
      ele(c,'p','百度网盘云端和 Windows 百度本地同步盘禁止插件删除；移动端公共下载文件、独立 ACK 暂不自动清理。','vru-warning');
      ele(c,'p','正在核验 ACK、原包哈希与隔离账本…','vru-meta');
      if(!this.plugin._v525){ele(c,'p','V5.2.9 安全管理器尚未准备，未执行操作');return;}
      let report;
      try{report=await this.plugin.v525CleanupPreview();}
      catch(e){ele(c,'p','检查失败：'+String(e.message||e),'vru-danger');return;}
      c.empty();
      ele(c,'h2','V5.2.9 · 30 天安全隔离');
      ele(c,'p','本地隔离路径：VaultRelay-Transfer/quarantine/；30天后仍需重新核验。测试版关闭永久删除。','vru-meta');
      ele(c,'p','重要：百度云端与百度本地同步盘始终保留；不会清理正式笔记、墓碑、版本账本和第三方下载文件。','vru-warning');
      ele(c,'p','可手动隔离 '+report.eligible.length+' 项 · 暂不隔离 '+report.blocked.length+' 项 · 已记账隔离/恢复 '+report.records.length+' 项。','vru-meta');
      const controls=row(c);
      button(controls,'重新检查',()=>this.render());
      const listing=ele(c,'div',null,'vru-cleanup-list');
      for(const item of report.outgoing.slice(0,150)){
        const li=ele(listing,'div',null,'vru-cleanup-item');
        ele(li,'strong',(item.eligible?'可隔离 · ':'保留 · ')+item.name);
        ele(li,'p',item.path,'vru-path');
        ele(li,'p',item.reason,'vru-meta');
        if(item.canConfirm && !item.eligible && !item.cloud){
          button(li,'我已在百度网盘云端亲自核对此 ZIP',()=>this.runSafe(async()=>{
            if(typeof window==='undefined'||!window.confirm(
              '只确认：已在【百度网盘云端】核对这份 ZIP 的文件名和内容。\n'+
              '仅看到 Windows 本地同步盘中有文件不算完成上传。\n'+
              '这项确认只是隔离前的证据，并不会删除任何文件。确定已核实吗？'))return {cancelled:true};
            await this.plugin.v525ConfirmCloudPublication(item.id);
          },'确认云端发布',item.path));
        }
        if(item.eligible){
          button(li,'手动移入 30 天隔离区',()=>this.runSafe(async()=>{
            if(typeof window==='undefined'||!window.confirm(
              '确认将【插件自有知识库副本】移入 quarantine 保留 30 天？\n'+
              item.path+'\n云端及百度同步盘不删除，30天内可恢复；当前不允许永久删除。'))return {cancelled:true};
            await this.plugin.v525Stage(item.id);
          },'移入30天隔离区',item.path),true);
        }
      }
      if(!report.outgoing.length)ele(listing,'p','当前没有待发送 ZIP 记录。','vru-meta');
      if(report.records.length){
        ele(c,'h3','隔离与恢复记录');
        for(const record of report.records.slice().reverse().slice(0,100)){
          const el=ele(c,'div',null,'vru-cleanup-item');
          ele(el,'strong',record.status+' · '+record.originalPath);
          ele(el,'p','隔离时间 '+VR527UI.formatTime(record.quarantineAtUtc)+
            '；最早可考虑到期复核 '+VR527UI.formatTime(record.purgeNotBeforeUtc),'vru-meta');
          ele(el,'p',record.quarantinePath,'vru-path');
          if(record.status==='quarantined'){
            button(el,'恢复原始位置（SHA 二次核验）',()=>this.runSafe(async()=>{
              if(typeof window==='undefined'||!window.confirm('恢复到原始位置？现有原路径若有文件则禁止覆盖。'))return {cancelled:true};
              await this.plugin.v525Restore(record.id);
            },'恢复原始位置',record.originalPath));
          }
          if(['move-intent','restore-intent','purge-intent'].includes(record.status))
            ele(el,'p','检测到未完成事务：停止自动操作，需人工核查文件与 SHA。','vru-warning');
        }
      }
      if(report.inbound.length)ele(c,'p',
        '另外 '+report.inbound.length+' 个入站文件/下载记录继续保留；需待移动端独立 ACK 流程实机验证后另行设计清理。','vru-meta');
    }
  }

  class VaultRelayUndoModal extends Modal {
    constructor(app,plugin,id){super(app);this.p=plugin;this.id=id;this.preview=null;}
    async onOpen(){
      this.contentEl.empty();ele(this.contentEl,'h2','回退此操作 · 写入前预览');
      ele(this.contentEl,'p','正在验证原操作、备份 SHA 和当前文件版本……','vru-help');
      try{this.preview=await this.p.previewUndo(this.id);this.render();}
      catch(err){this.contentEl.empty();ele(this.contentEl,'h2','暂不能安全回退');
        ele(this.contentEl,'p',String(err.message||err),'vru-warning');
        button(this.contentEl,'关闭',()=>this.close());}
    }
    render(){
      const c=this.contentEl;c.empty();
      ele(c,'h2','操作日志 · 回退预览');
      ele(c,'p','方式 B：明确确认后恢复正式笔记，但不修改旧 ZIP/删除墓碑，也不自动上传云端。方式 A：只提取历史副本到交换区，不动正式笔记。','vru-help');
      const tx=this.preview.tx;
      ele(c,'p','操作：'+tx.kind+' · '+tx.createdAt+' · 本次 '+this.preview.reviewed.length+' 个文件','vru-meta');
      for(const item of this.preview.reviewed){
        const box=ele(c,'div',null,'vru-preview');
        ele(box,'strong',item.path);
        ele(box,'p',item.action==='delete'?'恢复之前被删除的正文':item.action==='safe-update'?'恢复更新前的正文':'撤销此前新建的文件（删除本机现有副本）','vru-help');
        ele(box,'p','当前 SHA：'+(item.currentSha||'不存在')+'；历史 SHA：'+(item.restoreSha||'原先不存在'),'vru-path');
      }
      ele(c,'p','如文件已被进一步修改、后继版本发生变化或备份 SHA 不匹配，回退会被阻止。批量回退可能逐项执行，遇到意外会停止，不会伪称整体成功。','vru-warning');
      const actions=row(c);
      button(actions,'方式 A · 仅提取历史副本',async()=>{
        try{const result=await this.p.executeUndo(this.id,{mode:'extract'});
          new Notice('已提取 '+result.files+' 项：'+result.path,9000);this.close();}
        catch(err){new Notice('提取失败：'+String(err.message||err),9000);}
      });
      button(actions,'方式 B · 明确确认恢复',async()=>{
        if(!window.confirm('准备恢复 '+this.preview.reviewed.length+' 个正式笔记操作。\n'+
          this.preview.reviewed.map(x=>x.path).join('\n')+'\n再次确认？新内容需要另行人工确认上传。'))return;
        try{const result=await this.p.executeUndo(this.id,{mode:'restore'});
          new Notice('已在本机回退 '+result.files+' 项。请重新核对后手动上传新的同步版本。',10000);this.close();}
        catch(err){new Notice('回退未全部完成，请检查正式文件和诊断：'+String(err.message||err),11000);}
      },true);
      button(actions,'取消',()=>this.close());
    }
  }

  class VaultRelayMarkdownImportModal extends Modal {
    constructor(app,plugin){super(app);this.p=plugin;this.folder='';this.files=[];this.preview=null;this.working=false;}
    onOpen(){this.modalEl.addClass('vru-manual-modal');this.render();}
    render(){
      const c=this.contentEl;c.empty();
      ele(c,'h2','普通 Markdown · 安全导入预览');
      const currentVault=this.app.vault.getName();
      ele(c,'p','当前知识库：'+currentVault+' · 默认导入到当前知识库根目录。'+
        '只读取选中的系统 Markdown 文件并先预览；未经明确确认不写入正式笔记。','vru-help');
      const optional=ele(c,'details',null,'vru-optional-folder');
      const title=ele(optional,'summary','指定知识库内的子文件夹（可选）');
      if(this.folderExpanded||this.folder)optional.open=true;
      optional.addEventListener('toggle',()=>{this.folderExpanded=optional.open;});
      const target=ele(optional,'label',null,'vru-setting');
      ele(target,'span','保存到当前知识库下的相对子文件夹');
      const folder=ele(target,'input');folder.type='text';folder.value=this.folder;
      folder.placeholder='例如：学习/英语（留空即根目录）';
      folder.addEventListener('change',()=>{
        this.folder=folder.value.trim();this.preview=null;this.folderExpanded=true;this.render();
      });
      ele(optional,'p','此处不填写盘符、知识库名称或绝对路径；只允许知识库内部的相对子目录。','vru-help');
      const chosen=ele(c,'input');chosen.type='file';chosen.multiple=true;
      chosen.accept='.md,text/markdown';chosen.className='vru-hidden';
      chosen.addEventListener('change',async()=>{
        this.files=Array.from(chosen.files||[]);chosen.value='';await this.refresh();
      });
      const buttons=row(c);
      button(buttons,'选择 Markdown 文件',()=>chosen.click(),true);
      if(this.files.length)button(buttons,'重新预览 ('+this.files.length+')',()=>this.refresh());
      if(this.preview){
        const counts={create:0,restore:0,conflict:0,same:0};
        for(const x of this.preview.items)counts[x.status]++;
        ele(c,'p',`待新增 ${counts.create} · 已删除笔记恢复 ${counts.restore} · 同内容跳过 ${counts.same} · 冲突阻止 ${counts.conflict}`,'vru-meta');
        for(const item of this.preview.items){
          const box=ele(c,'div',null,'vru-preview');
          ele(box,'strong',item.path);
          ele(box,'p',({create:'允许新增',restore:'允许作为删除后的新版本恢复（需后续手动发布）',
            same:'目标已有相同内容，本次跳过',conflict:'目标存在或共享历史冲突：禁止覆盖'})[item.status],
            item.status==='conflict'?'vru-warning':'vru-meta');
        }
        const count=counts.create+counts.restore;
        const controls=row(c);
        const confirm=button(controls,'明确确认导入 ('+count+')',async()=>{
          if(!window.confirm('确认向正式知识库新增／恢复 '+count+' 个 Markdown 文件？\n'+
            this.preview.items.filter(x=>['create','restore'].includes(x.status)).map(x=>x.path).join('\n')+
            '\n冲突不覆盖，历史版本不抹除，云端上传另行确认。'))return;
          this.working=true;
          try{const result=await this.p.applyMarkdownPreview(this.preview);
            new Notice('Markdown 已导入：新增 '+result.created+'，恢复 '+result.restored+'；尚未上传。',9000);
            this.close();
          }catch(err){new Notice('导入停止：'+String(err.message||err),9500);
            // A partially completed batch must be re-reviewed instead of reused.
            this.preview=null;this.render();}
          finally{this.working=false;}
        },true);
        confirm.disabled=!count||this.working;
      }
      const footer=row(c);button(footer,'取消 / 关闭',()=>this.close());
    }
    async refresh(){
      if(this.working)return;
      this.working=true;this.preview=null;
      try{this.preview=await this.p.previewMarkdownFiles(this.files,this.folder);}
      catch(err){new Notice('Markdown 预览失败：'+String(err.message||err),9000);}
      finally{this.working=false;this.render();}
    }
  }

  class VaultRelayKeepDeletionModal extends Modal {
    constructor(app,p){super(app);this.p=p;this.plan=null;this.selected=new Map();}
    async onOpen(){
      this.contentEl.empty();ele(this.contentEl,'h2','检查删除墓碑……');
      try{this.plan=await this.p.engine.latestPlan();this.render();}
      catch(err){this.contentEl.empty();ele(this.contentEl,'p',String(err.message||err),'vru-warning');}
    }
    render(){
      const c=this.contentEl;c.empty();
      ele(c,'h2','拒绝删除并保留本机文件');
      ele(c,'p','仅记录本机决定，不向其他设备伪造「已删除」ACK，也不改变正式笔记。后来有更新的删除版本时需要重新审核。','vru-help');
      const choices=this.plan.items.filter(x=>x.status==='delete-review');
      if(!choices.length)ele(c,'p','没有待决定的本机删除候选。','vru-meta');
      for(const item of choices){
        const label=ele(c,'label',null,'vru-keep-item');
        const input=ele(label,'input');input.type='checkbox';input.checked=this.selected.has(item.path);
        input.addEventListener('change',()=>{if(input.checked)this.selected.set(item.path,{path:item.path,
          versionId:item.version.versionId,localHash:item.localHash});else this.selected.delete(item.path);});
        ele(label,'span',item.path);
      }
      const actions=row(c);
      button(actions,'明确拒绝删除所选文件',async()=>{
        const selected=[...this.selected.values()];
        if(!selected.length){new Notice('请勾选要保留的笔记');return;}
        if(!window.confirm('确认本机保留 '+selected.length+' 篇笔记，不执行删除？'))return;
        try{const n=await this.p.keepDeletionItems(selected);
          new Notice('已记录本机保留决定 '+n+' 项，正式文件未改动。',8000);this.close();}
        catch(err){new Notice('保留决定未保存：'+String(err.message||err),8500);}
      },true);
      button(actions,'取消',()=>this.close());
    }
  }


  // V5.0.1: one export entry opens exactly two user-facing choices.
  // A verified local file is prepared before enabling system share, so the
  // navigator.share call still runs directly within a button click gesture.
  class VaultRelayExportChoiceModal extends Modal {
    constructor(app,plugin,kind,share,refresh){
      super(app);
      this.p=plugin;this.kind=kind;this.share=share;this.refresh=refresh;
      this.fileInfo=null;this.error='';this._started=false;this._closed=false;
    }
    onOpen(){
      this.modalEl.addClass('vru-export-choice-modal');
      this.contentEl.addClass('vru-export-choice');
      this.render();
      void this.prepare();
    }
    onClose(){
      this._closed=true;
      if(typeof this.refresh==='function')this.refresh();
    }
    async prepare(){
      if(this._started)return;
      this._started=true;this.error='';
      try{
        let result;
        if(this.kind==='diagnostic'){
          const report=await this.p.exportRuntimeDiagnostics();
          result={path:report.path,content:report.content};
        }else if(this.kind==='inventory'){
          const report=await this.p.exportVaultInventory();
          result={path:report.path,content:report.content,files:report.files,errors:report.errors};
        }else if(this.kind==='vault'){
          const report=await this.p.exportVault();
          result={
            path:report.path,
            content:await this.p.app.vault.adapter.readBinary(report.path),
            files:report.files
          };
        }else throw Error('未知导出类型');
        if(this._closed)return;
        if(!result.path||!result.content)throw Error('导出的文件内容为空');
        this.fileInfo=result;
      }catch(e){
        if(this._closed)return;
        this.error=String(e.message||e);
      }
      this.render();
    }
    render(){
      const c=this.contentEl;c.empty();
      const diagnostic=this.kind==='diagnostic';
      const inventory=this.kind==='inventory';
      const title=diagnostic?'导出诊断日志':inventory?'导出本机知识库信息':'导出知识库';
      ele(c,'h2',title);
      ele(c,'p',diagnostic?
        '运行诊断不含正式笔记正文，但可能包含相对文件路径。分享前请检查隐私。':
        inventory?'此清单不含正文，但含完整相对路径、SHA、设备身份与修改时间；只用于比较，不是身份签名。':
        '知识库备份可能包含你的全部正式笔记；请谨慎选择系统分享目标。','vru-export-caution');
      if(!this.fileInfo){
        ele(c,'p',this.error?'文件准备失败：'+this.error:
          '正在准备导出文件；准备完成后可选择保存本地或系统分享。','vru-export-status');
        const commands=row(c);
        if(this.error)button(commands,'重新准备',()=>{
          this._started=false;this.render();void this.prepare();
        });
        button(commands,'取消',()=>this.close());
        return;
      }
      ele(c,'p','文件已生成并安全保存在本地：','vru-export-status');
      ele(c,'p',this.fileInfo.path,'vru-export-path');
      if(!diagnostic && this.fileInfo.files!=null)
        ele(c,'p','已导出 '+this.fileInfo.files+' 个知识库条目。'+
          (inventory?'异常或跳过 '+(this.fileInfo.errors||0)+' 项。':''),'vru-export-status');
      const commands=row(c);
      button(commands,'保存本地',()=>new Notice('已保存本地：'+this.fileInfo.path,8500),true);
      button(commands,'系统分享',()=>{
        // No await before share: mobile WebView needs direct user activation.
        this.share(this.fileInfo,(diagnostic||inventory)?'application/json':'application/zip',
          diagnostic?'Vault Relay 运行诊断':inventory?'Vault Relay 知识库信息清单':'Vault Relay 知识库备份');
      });
      button(c,'打开文件所在文件夹',()=>{try{this.p.openPreparedFileLocation(this.fileInfo.path);}catch(e){new Notice('无法定位导出文件：'+String(e.message||e),10000);}});
    }
  }

  // Files are prepared and SHA-read-back-verified before the user chooses
  // local save or a direct user-gesture system share. No automatic sending.
  class VaultRelayPreparedComparisonFileModal extends Modal {
    constructor(app,info,share,plugin,description){
      super(app);this.info=info;this.share=share;this.p=plugin;this.description=description;
    }
    onOpen(){
      const c=this.contentEl;c.empty();c.addClass('vru-comparison-modal');
      ele(c,'h2','导出文件已准备好');
      ele(c,'p',this.description||'已在知识库内的隔离区生成文件，并完成回读 SHA 校验。','vru-help');
      ele(c,'p',this.info.path,'vru-path');
      ele(c,'p','本次文件数量：'+(this.info.files||0)+'。选择「保存本地」或者「系统分享」。','vru-meta');
      const actions=row(c);
      button(actions,'保存本地',()=>new Notice('已保存本地：'+this.info.path,8000),true);
      button(actions,'系统分享',()=>this.share(this.info,
        /\.json$/i.test(this.info.path)?'application/json':'application/zip',
        'Vault Relay 知识库比对导出'));
      button(c,'打开文件所在文件夹',()=>{try{this.p.openPreparedFileLocation(this.info.path);}catch(e){new Notice('无法定位导出文件：'+String(e.message||e),10000);}});
    }
  }

  class VaultRelayComparisonResultsModal extends Modal {
    constructor(app,p,share){super(app);this.p=p;this.share=share;
      this.report=null;this.selected=new Set();this.query='';this.filter='diff';this.busy=false;}
    async onOpen(){
      this.modalEl.addClass('vru-comparison-modal');
      this.contentEl.empty();ele(this.contentEl,'h2','正在重新计算本机 SHA-256……');
      try{this.report=await this.p.compareVaultInventory();this.render();}
      catch(e){this.contentEl.empty();ele(this.contentEl,'h2','知识库比对未完成');
        ele(this.contentEl,'p',String(e.message||e),'vru-warning');
        button(this.contentEl,'关闭',()=>this.close());}
    }
    render(){
      const c=this.contentEl,r=this.report;c.empty();
      ele(c,'h2','知识库比对结果（只读）');
      ele(c,'p','本机 '+r.local.vaultName+' · 对端 '+r.remote.vaultName+
        ' · 对端清单生成于 '+r.remote.createdAt,'vru-meta');
      ele(c,'p','一致 '+r.totals.same+'（其中版本记录不同 '+r.totals.versionOnly+'）'+
        '；仅本机 '+r.totals.localOnly+'；仅对端 '+r.totals.remoteOnly+
        '；同路径正文不同 '+r.totals.different,'vru-comparison-summary');
      if(r.incomplete)ele(c,'p','两端有无法读取或超大文件，下面只代表成功计算 SHA 的部分；不得认定两端完整一致。'+
        ' 本机异常 '+r.local.errors.length+'，对端异常 '+r.remote.errors.length,'vru-warning');
      const explanation=ele(c,'details',null,'vru-comparison-info');
      ele(explanation,'summary','关于 SHA 差异、清单时间和安全说明');
      ele(explanation,'p','这只是两台设备在不同时间生成的快照；SHA 相同表示字节相同，不能判断谁的版本更新或正确。比对本身不传输或覆盖笔记。','vru-help');
      const controls=ele(c,'div',null,'vru-comparison-filters');
      const filter=ele(controls,'select');
      for(const [v,label] of [['diff','只看差异'],['all','全部文件'],['local-only','仅本机'],
        ['remote-only','仅对端'],['different','同名内容不同'],['same','内容相同']]){
        const option=ele(filter,'option',label);option.value=v;
      }
      filter.value=this.filter;
      filter.setAttribute?.('aria-label','筛选比对结果');
      filter.addEventListener('change',()=>{this.filter=filter.value;this.selected.clear();this.render();});
      const search=ele(controls,'input');search.type='search';search.value=this.query;
      search.placeholder='搜索文件名或文件夹';
      search.setAttribute?.('aria-label','搜索文件名或文件夹');
      search.addEventListener('change',()=>{this.query=search.value;this.render();});
      const filtered=r.rows.filter(x=>(this.filter==='all'||this.filter==='diff'&&x.status!=='same'||
        this.filter===x.status)&&x.path.toLowerCase().includes(this.query.toLowerCase()));
      ele(c,'p','当前显示 '+Math.min(filtered.length,400)+' / '+filtered.length+
        ' 项；可勾选本机存在的差异文件导出。仅对端存在的文件须到对端导出。','vru-meta');
      const list=ele(c,'div',null,'vru-comparison-list');
      for(const item of filtered.slice(0,400)){
        const pane=ele(list,'div',null,'vru-comparison-item');
        const heading=row(pane);
        if(item.local && item.status!=='same'){
          const check=ele(heading,'input');check.type='checkbox';
          check.checked=this.selected.has(item.path);
          check.addEventListener('change',()=>{
            if(check.checked)this.selected.add(item.path);else this.selected.delete(item.path);
          });
        }
        ele(heading,'strong',item.path);
        const label={same:'两端字节相同','different':'同路径内容不同',
          'local-only':'仅本机存在','remote-only':'仅对端存在'}[item.status];
        ele(pane,'p',label,'vru-comparison-label');
        if(item.status!=='same'){
          const detail=ele(pane,'details',null,'vru-comparison-detail');
          ele(detail,'summary','查看路径、大小、SHA、版本与修改时间');
          for(const [who,data] of [['本机',item.local],['对端',item.remote]]){
            if(!data){ele(detail,'p',who+'：无此文件');continue;}
            ele(detail,'p',who+'：'+data.path+' · '+data.size+' B'+
              ' · SHA-256 '+data.sha256+' · 修改时间 '+
              (data.mtimeMs===null?'未知':new Date(data.mtimeMs).toISOString())+
              ' · 版本 '+(data.versionId||'未登记')+' · 已知操作 '+(data.knownOp||'未登记'),
              'vru-comparison-detail-text');
          }
        }
      }
      if(filtered.length>400)ele(c,'p','列表较多，请使用搜索或筛选缩小范围；未展示的行不会被自动选择。','vru-warning');
      const operations=ele(c,'div',null,'vru-comparison-actions');
      const first=button(operations,'导出所选普通文件 ZIP',()=>this.exportChosen(false),true);
      first.disabled=this.busy;
      const second=button(operations,'导出所选增量包（新版本）',()=>this.exportChosen(true));
      second.disabled=this.busy;
      const policyNotes=ele(c,'details',null,'vru-comparison-info');
      ele(policyNotes,'summary','导出安全规则与差异处理说明');
      ele(policyNotes,'p','增量包会为所选文件发布新的同步版本并保留历史。'+
        '本机若有冲突、分叉或未确认删除，必须先解决，不能强行导出。'+
        '普通 ZIP 不含版本关系，不能直接覆盖同名不同内容文件。','vru-help');
    }
    async exportChosen(native){
      if(this.busy)return;
      const paths=[...this.selected];
      if(!paths.length){new Notice('请先勾选本机存在的差异文件',6000);return;}
      if(native&&paths.length>25){new Notice('增量包每次最多选择 25 项',6000);return;}
      const question=native?
        '将为所选 '+paths.length+' 篇文件生成新的原生同步版本并封装外层增量 ZIP。旧版本和墓碑不会被覆盖。\n'+
        '确认前请核对路径；本次操作不能作为普通“仅导出副本”撤销。\n'+paths.join('\n'):
        '将选中的 '+paths.length+' 项打成不含历史版本的普通文件 ZIP，源笔记不修改。\n'+paths.join('\n');
      if(!window.confirm(question))return;
      this.busy=true;
      try{
        const file=native?await this.p.exportComparedIncremental(this.report,paths):
          await this.p.exportComparedOrdinary(this.report,paths);
        new VaultRelayPreparedComparisonFileModal(this.app,file,this.share,this.p,
          native?'原生版本与仅含所选文件的外层增量 ZIP 已生成；Windows 放入百度网盘本地目录不等于云端已上传。':
            '只打包所选正式文件，不包含 .obsidian、交换目录及其他笔记；导入对端前仍须核对目标路径与冲突。').open();
        // Native export advances known versions. Retire the stale comparison
        // selection so a second click cannot silently publish a duplicate.
        this.selected.clear();
        this.close();
      }catch(e){new Notice('选择性导出未完成：'+String(e.message||e),10000);}
      finally{this.busy=false;}
    }
  }

  class VaultRelayAckUploadModal extends Modal {
    constructor(app,panel,zipMode=false){super(app);this.panel=panel;this.p=panel.plugin;this.zipMode=zipMode;}
    async renderLatestZip(c){
      const p=this.p;
      ele(c,'h3','最近生成的待上传增量 ZIP');
      const filePath=p.data.latest;
      const record=(p.data.bundleRecords||[]).slice().reverse().find(x=>x.stored?.path===filePath);
      const own=p.engine?.state?.deviceId;
      if(!filePath || !record || record.status!=='pending' || record.groupId!==p.data.groupId ||
         !own || record.senderId!==own){
        ele(c,'p','没有可准备的本机待上传 ZIP。请返回控制台，先“预览并生成增量 ZIP”；此入口不会自动生成或重新封装历史包。','vru-meta');
        return;
      }
      const local=record.stored.kind==='vault' &&
        /^VaultRelay-Transfer\/(?:temporary|outgoing)\/[^/]+\.zip$/i.test(filePath);
      const cloud=Platform.isDesktopApp && record.stored.kind==='cloud';
      const name=filePath.split(/[\\/]/).pop();
      if((!local&&!cloud) || name!==record.name){
        ele(c,'p','待上传 ZIP 的位置与安全记录不一致，请重新核对。','vru-danger');return;
      }
      const line=ele(c,'div',null,'vru-ack-upload-file');
      const label=ele(line,'span',name,'vru-ack-file-name');VR527UI.expandable(label);
      const location=ele(line,'p',filePath,'vru-path');VR527UI.expandable(location);
      const controls=row(line);
      button(controls,'复制 ZIP 文件名',()=>this.panel.copy(name));
      button(controls,'复制 ZIP 完整路径',()=>this.panel.copy(filePath));
      const result=ele(line,'p','准备分享前会重新读取 ZIP 并核对 SHA；不会生成新包、上传文件或确认云端备份。','vru-help');
      const prepare=button(controls,'复核 ZIP 并准备分享',async()=>{
        prepare.disabled=true;ready.replaceChildren();
        try{
          if(record.status!=='pending' || p.data.groupId!==record.groupId ||
             p.engine?.state?.deviceId!==record.senderId || p.data.latest!==filePath ||
             record.stored.path!==filePath)throw Error('群组、设备或待传记录已变化，请关闭并重新打开上传入口');
          const raw=new Uint8Array(await p.readTransportRecord(record));
          const tools=p.constructor.__testing.tools;
          if(raw.length>tools.MAX_BUNDLE_BYTES || await tools.sha256(raw)!==record.sha256)
            throw Error('ZIP SHA 变化或超过大小限制，拒绝准备分享');
          if(record.status!=='pending' || p.data.groupId!==record.groupId ||
             p.engine?.state?.deviceId!==record.senderId || p.data.latest!==filePath ||
             record.stored.path!==filePath)throw Error('复核期间待传记录变化，请重新打开上传入口');
          result.textContent='ZIP SHA 复核通过。点击下方按钮打开系统分享；上传后仍需在百度云端核对同名文件。';
          button(ready,'分享此 ZIP 到百度网盘',()=>{
            if(record.status!=='pending' || p.data.groupId!==record.groupId ||
               p.engine?.state?.deviceId!==record.senderId || p.data.latest!==filePath ||
               record.stored.path!==filePath){new Notice('待传记录已变化，请重新复核 ZIP',7000);return;}
            this.panel.sharePreparedFile({path:filePath,content:raw},'application/zip','上传增量 ZIP');
          },true);
        }catch(e){result.textContent='ZIP 未通过复核：'+String(e.message||e);}
        finally{prepare.disabled=false;VR527UI.enhance(line);}
      });
      const ready=row(line);
      VR527UI.enhance(line);
    }
    async onOpen(){
      this.modalEl.addClass('vru-panel');this.modalEl.addClass('vru-ack-upload-modal');
      const c=this.contentEl;c.empty();
      const p=this.p;
      ele(c,'h2',this.zipMode?'上传 ZIP / ACK':'上传 ACK');
      ele(c,'p',this.zipMode?
        '先在控制台预览并生成增量 ZIP，再打开自己的网盘目录上传，或使用下方系统分享。分享下载页没有上传入口。':
        '分享页只能下载。上传请使用自己的网盘目录，或把下方 ACK 分享给百度网盘。','vru-help');
      const saved=p.data.ackUploadTarget;
      const configured=saved?.groupId===p.data.groupId?saved.path:'';
      ele(c,'h3','本群组的网盘目标目录');
      const field=ele(c,'label',null,'vru-setting');
      ele(field,'span','网盘目录（首次填写，保存后复用）');
      const input=ele(field,'input');input.type='text';input.value=configured||'';
      input.placeholder='/00Obsdian/VaultRelay-Transfer/test1';
      ele(c,'p','填写 Windows 正在同步的真实云端路径；不要填写手机知识库路径。目录需有上传权限。','vru-help');
      const actions=row(c);
      button(actions,'保存目标目录',async()=>{
        try{
          const path=VR527UI.normalizeCloudPath(input.value);
          if(!path)throw Error('请填写目标目录');
          p.data.ackUploadTarget={groupId:p.data.groupId,path};
          await p.persistTransport();
          await p.log(this.zipMode?'ZIP / ACK 上传目录已保存':'ACK 上传目录已保存',path+'；仅保存导航位置，未上传文件');
          new Notice('目标目录已保存',5000);
        }catch(e){new Notice('未保存：'+String(e.message||e),8000);}
      });
      button(actions,'复制目标目录',()=>this.panel.copy(input.value));
      button(c,'打开百度网盘目标目录',()=>{
        try{
          const path=VR527UI.normalizeCloudPath(input.value);
          const opened=window.open(VR527UI.uploadUrl(path),'_blank','noopener,noreferrer');
          new Notice(opened?'已尝试打开自己的网盘'+(path?'目标目录':'首页')+'；登录后检查目录，再点上传／＋':
            '未能确认页面打开，请手动打开百度网盘“文件／我的文件”并进入目标目录',10000);
        }catch(e){new Notice(String(e.message||e),8000);}
      },true);
      ele(c,'p','客户端接管链接或登录跳转后可能不保留目录定位。若仍进入分享下载页，请返回网盘“文件／我的文件”，按复制的路径进入目录；不要上传到独立转存副本。','vru-help');
      if(this.zipMode)await this.renderLatestZip(c);
      ele(c,'h3','选择要上传的独立 ACK');
      ele(c,'p','本机文件位于当前知识库的 VaultRelay-Transfer/temporary。可复制路径后在网盘“上传文件”中选择；宿主支持时也可分享文件。打开入口或完成分享不等于已上传成功。','vru-help');
      const files=ele(c,'div',null,'vru-fixed-scroll vru-ack-upload-files');
      const own=p.engine?.state?.deviceId;
      for(const filePath of (p.data.lastPreparedAckFiles?.paths||[]).slice().reverse()){
        if(!/^VaultRelay-Transfer\/(?:temporary|outgoing)\/[^/]+\.json$/.test(filePath))continue;
        const line=ele(files,'div',null,'vru-ack-upload-file');
        const name=filePath.split('/').pop();
        const label=ele(line,'span',name,'vru-ack-file-name');VR527UI.expandable(label);
        const controls=row(line);
        button(controls,'复制文件名',()=>this.panel.copy(name));
        button(controls,'复制完整路径',()=>this.panel.copy(filePath));
        try{
          const raw=new Uint8Array(await p.app.vault.adapter.readBinary(filePath));
          const ack=await p.constructor.__testing.tools.validateRawAck(raw,name,p.data.groupId);
          if(ack.device!==own)throw Error('不是本机生成的 ACK');
          button(controls,'分享此 ACK 到百度网盘',()=>this.panel.sharePreparedFile(
            {path:filePath,content:raw},'application/json','上传独立 ACK'));
        }catch(e){ele(line,'p','文件未通过复核：'+String(e.message||e),'vru-danger');}
      }
      if(!files.children.length)ele(files,'p','请先返回 ACK 高级管理，点击“① 手动生成独立 ACK”。','vru-meta');
      ele(c,'p',Platform.isIosApp?(this.zipMode?
        '若分享列表没有百度网盘，请先“存储到文件”，再到百度网盘上传所选 ZIP / ACK。保持原文件名不变。接收 ZIP 后仍需人工确认写入，ACK 回传后在 Windows 重新核对。':
        '若系统分享列表没有百度网盘，请先选择“存储到文件”，再到百度网盘上传该 ACK。保持原文件名不变，上传后核对云端同名文件；Windows 点④重新核对。'):
        '上传后在云端核对同名文件；Windows 自动运输关闭时，先“检查本地同步目录”，再“重新核对 ACK 状态”。','vru-help');
      VR527UI.enhance(c);
    }
  }

  class VaultRelayUnifiedPanel extends Modal {
    constructor(app,plugin){super(app);this.plugin=plugin;this.review=null;this.active=false;this._mainOpen={};}
    onOpen(){
      // Size the modal against the actual Obsidian host window/phone viewport;
      // never assume a desktop width or force a fixed number of columns.
      this.modalEl?.addClass?.('vru-control-modal');
      if(Platform.isDesktopApp&&this.modalEl?.style?.setProperty){
        const width=Math.max(520,Math.min(1100,Number(this.plugin.data.desktopPanelWidthPx)||680));
        this.modalEl.style.setProperty('--vr-console-width',width+'px');
        this.modalEl.addEventListener?.('pointerup',()=>{
          const actual=Math.round(this.modalEl.getBoundingClientRect?.().width||0);
          if(actual>=520&&actual<=1100 &&
             Math.abs(actual-(this.plugin.data.desktopPanelWidthPx||680))>=10){
            this.plugin.data.desktopPanelWidthPx=actual;
            this.modalEl.style.setProperty('--vr-console-width',actual+'px');
            void this.plugin.persistTransport();
          }
        });
      }
      this.plugin._vrControlPanel=this;
      if(this.plugin._v525)this._v525Unsubscribe=this.plugin._v525.refresh.subscribe(()=>{
        if(this.plugin._vrControlPanel===this&&!this.active)
          Promise.resolve().then(()=>{if(this.plugin._vrControlPanel===this)this.render();});
      });
      this.render();
    }
    onClose(){
      if(this._v525Unsubscribe){this._v525Unsubscribe();this._v525Unsubscribe=null;}
      this._mobilePicker?.remove();this._mobilePicker=null;
      this.review=null;
      if(this.plugin._vrControlPanel===this)this.plugin._vrControlPanel=null;
    }
    pickMobileTransferFiles(){
      if(Platform.isDesktopApp)throw Error('此文件选择入口仅用于移动端');
      this.plugin.assertGroup();
      if(this.active)return;
      // Keep this input outside contentEl: focus-triggered console renders must
      // not detach the pending iOS document-picker request.
      if(!this._mobilePicker){
        const input=ele(this.modalEl,'input',null,'vru-document-picker');
        input.type='file';input.multiple=true;
        input.accept='.zip,.json,application/zip,application/x-zip-compressed,application/json,application/octet-stream';
        input.setAttribute('aria-label','选择已下载的 Vault Relay ZIP 或 ACK');
        input.addEventListener('cancel',()=>{input.value='';});
        input.addEventListener('change',()=>{
          const chosen=Array.from(input.files||[]);input.value='';
          if(!chosen.length)return;
          void (async()=>{
            const received=await this.run('系统文件安全接收',()=>this.plugin.importMobileChosenFiles(chosen));
            if(received && (received.copied||received.direct))
              await this.plugin.showReviewAfterReceive({reason:'download-and-import',forceOpen:true});
          })().catch(e=>new Notice('审核窗口打开未完成：'+String(e.message||e),7000));
        });
        this._mobilePicker=input;
      }
      this._mobilePicker.value='';
      // Must stay synchronous with the actual tap for WKWebView activation.
      this._mobilePicker.click();
    }
    async run(label,callback){
      if(this.active)return;
      this.active=true;
      let outcome=null;
      try {outcome=await callback();new Notice(label+'：操作结束；具体结果见日志',5000);}
      catch(e){await this.plugin.log('操作未完成',label+'：'+String(e.message||e));new Notice(label+'：'+String(e.message||e),8000);}
      finally{this.active=false;this.render();}
      return outcome;
    }
    legacy(key){
      if(!this.plugin.engine)return new Notice('请先创建或加入同步群组',5500);
      return this.plugin.openCoreUi(key);
    }
    sharePreparedFile(fileInfo,mime,title){
      if(!fileInfo?.content){new Notice('请先生成要分享的文件',6000);return;}
      // The real exported file remains in VaultRelay-Transfer even when all
      // sharing interfaces are absent or the user dismisses the chooser.
      const manual=()=>new Notice(
        '此 Obsidian 环境不能分享此文件。原文件仍在：'+fileInfo.path+
        '；请用系统文件管理器找到它并上传百度网盘。',10000);
      const fallback=()=>{
        const bridge=typeof globalThis!=='undefined'?globalThis.Capacitor:null;
        const plugins=bridge?.Plugins;
        if(typeof plugins?.Share?.share!=='function'||
           typeof plugins?.Filesystem?.writeFile!=='function'||
           typeof plugins?.Filesystem?.getUri!=='function')return manual();
        void this.sharePreparedFileNative(fileInfo,mime,title,
          plugins.Share,plugins.Filesystem).catch(e=>{
          new Notice('原生系统分享未成功：'+String(e.message||e).slice(0,180)+
            '。原文件仍在：'+fileInfo.path+'；可用文件管理器分享。',10000);
        });
      };
      // This path must be invoked synchronously inside the click event: Android
      // Web Share requires a user activation gesture that an await would lose.
      if(typeof File!=='undefined' && typeof navigator!=='undefined' &&
         typeof navigator.share==='function'){
        try{
          const name=fileInfo.path.split('/').pop();
          const file=new File([fileInfo.content],name,{type:mime});
          if(!navigator.canShare || navigator.canShare({files:[file]})){
            navigator.share({files:[file],title}).catch(e=>{
              if(e?.name!=='AbortError')fallback();
            });
            return;
          }
        }catch(_){/* Try an actually available native plugin, not a text link. */}
      }
      fallback();
    }
    async sharePreparedFileNative(fileInfo,mime,title,share,filesystem){
      // Runtime-only bridge. No native dependencies or Android permissions are
      // bundled into this Obsidian plugin; the host must already expose both
      // plugins. Default Capacitor FileProvider can share CACHE files.
      const input=fileInfo.content;
      let bytes;
      if(typeof input==='string')bytes=new TextEncoder().encode(input);
      else if(input instanceof ArrayBuffer)bytes=new Uint8Array(input);
      else if(ArrayBuffer.isView(input))
        bytes=new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
      else throw Error('不支持的分享文件数据');
      // Bound native bridge memory; larger ZIPs still work with file manager.
      if(bytes.byteLength>8*1024*1024)
        throw Error('文件大于 8 MiB，请使用文件管理器分享原始 ZIP');
      if(typeof btoa!=='function')throw Error('本机没有文件分享所需的编码接口');
      const segments=[];
      for(let pos=0;pos<bytes.length;pos+=12288){
        const chunk=bytes.subarray(pos,pos+12288);
        let raw='';for(let i=0;i<chunk.length;i++)raw+=String.fromCharCode(chunk[i]);
        segments.push(btoa(raw));
      }
      const safeName=String(fileInfo.path.split('/').pop()||'vault-relay-file.zip');
      if(!/^[a-zA-Z0-9._-]{1,155}$/.test(safeName)||safeName.startsWith('.'))
        throw Error('文件名不适合系统分享，请用文件管理器上传原文件');
      // Isolate the cache directory, not the filename: native ACK aliases must
      // keep their complete name, batch fingerprint and .json extension.
      const safePath='VaultRelayShare/'+Date.now()+'-'+
        Math.random().toString(16).slice(2,10)+'/'+safeName;
      // CACHE is necessary for native FileProvider; do not share Vault's
      // own potentially inaccessible file:// path. CACHE is app-managed and
      // may remain until the operating system cleans it.
      const target={path:safePath,directory:'CACHE'};
      await filesystem.writeFile({...target,data:segments.join(''),recursive:true});
      const found=await filesystem.getUri(target);
      const uri=String(found?.uri||'');
      if(!/^(?:file|content):\/\//.test(uri))
        throw Error('系统未提供可分享的本地文件 URI');
      await share.share({title,dialogTitle:'分享 Vault Relay 文件',files:[uri]});
      new Notice('已调用原生分享；是否实际发送请以接收应用结果为准。',6500);
    }
    async copy(value){
      try{await navigator.clipboard.writeText(value);new Notice('已复制',3000);}
      catch(_){
        try{window.prompt('请手动复制',value);}
        catch(_){new Notice('剪贴板不可用，请长按显示的文字复制',6000);}
      }
    }
    async copyGroupShare(field){
      const saved=String(this.plugin.data.shareUrl||'').trim();
      if(!saved){new Notice('请先在「设置与连接检查」保存群组分享链接',6000);return;}
      if(field && field.value.trim()!==saved){
        new Notice('链接输入有未保存的修改，请先保存后再复制',6500);return;
      }
      let copied=false;
      try{
        if(typeof navigator!=='undefined' && navigator.clipboard?.writeText){
          await navigator.clipboard.writeText(saved);copied=true;
        }
      }catch(_){}
      if(!copied && field){
        try{field.focus?.();field.select?.();copied=!!document.execCommand?.('copy');}
        catch(_){}
      }
      new Notice(copied?'群组分享链接已复制，请在浏览器地址栏粘贴':
        '未能复制：请长按设置区的群组链接选择复制，再粘贴到浏览器地址栏',
        copied?4500:8000);
    }
    openShareBrowser(firstUse=false){
      const saved=String(this.plugin.data.shareUrl||'').trim();
      if(!/^https:\/\/pan\.baidu\.com\/s\/[A-Za-z0-9_-]+\/?(?:[?#][^\s]*)?$/.test(saved)){
        new Notice('请先到「设置与连接检查」保存有效的百度网盘群组分享链接',7500);
        return false;
      }
      // Keep browser launching directly inside the user click. Never await
      // clipboard access before this call or claim which browser opened.
      const destination=firstUse?'https://pan.baidu.com/':saved;
      if(!firstUse) this.plugin._mobileAwaitingDownloadAt=Date.now();
      try{
        if(typeof window==='undefined' || typeof window.open!=='function')
          throw Error('当前环境不支持浏览器打开接口');
        const opened=window.open(destination,'_blank','noopener,noreferrer');
        if(!opened){
          new Notice(firstUse?
            '未能确认浏览器已打开。请手动启动 Chrome / Safari，再粘贴刚复制的链接。':
            '无法确认下载页已打开。请用 Chrome / Safari 手动访问设置区保存的分享链接。',8500);
          return false;
        }
        new Notice(firstUse?
          '已尝试打开浏览器首页。请把刚复制的群组链接粘贴到地址栏并回车。':
          '已尝试打开分享页。下载到手机默认目录即可；返回 Obsidian 后先检测自动接收，失败时使用系统选文件兜底。',7500);
        return true;
      }catch(e){
        new Notice('打开浏览器未完成：'+String(e.message||e)+
          '。请手动打开 Chrome / Safari，使用设置区保存的分享链接。',9000);
        return false;
      }
    }
    settings(p,label,key,placeholder){
      const line=ele(p,'label',null,'vru-setting');ele(line,'span',label);
      const input=ele(line,'input');input.value=this.plugin.data[key]||'';
      input.placeholder=placeholder||'';input.type='text';
      input.addEventListener('change',async()=>{
        const value=input.value.trim();
        if(key==='groupId' && value && !/^vg-[a-z0-9]{16,40}$/.test(value)) {
          new Notice('GroupID 格式无效，拒绝保存',6000);return;
        }
        if(key==='ackRecipientIds'){
          try {this.plugin.validateAckRecipients(value);}catch(e){new Notice(e.message,6000);return;}
        }
        if(key==='shareUrl' && value &&
           !/https:\/\/pan\.baidu\.com\/s\//.test(value)){
          new Notice('请粘贴百度网盘群组的 HTTPS 分享链接',6500);return;
        }
        try{
          await this.plugin.updateSetting(key,value);
          await this.plugin.log('设置保存',label+' 已更新');
        }catch(e){new Notice('设置未保存：'+String(e.message||e),7000);input.value=this.plugin.data[key]||'';}
      });
    }
    async receiveZip(file){
      if(!file)return;
      await this.run('下载 ZIP 安全校验',async()=>{
        const x=await this.plugin.storeDownloadedZip(file);
        if(window.confirm('SHA/CRC 和 GroupID 已校验，ZIP 已存入本机传输区并经过 staging 校验。\n现在只将交换文件恢复到同步核心交换区吗？（不直接改动笔记）')){
          await this.plugin.applyDownloaded(x);
        } else await this.plugin.log('暂不恢复','原始下载 ZIP 和已校验 staging 保留，正式笔记未修改');
      });
    }
    async receiveTransferFiles(files){
      const items=Array.from(files||[]);
      if(!items.length)return;
      const received=await this.run('① 增量包校验与安全接收',async()=>{
        let zips=0,acks=0;
        for(const file of items){
          if(/\.json$/i.test(file.name)){
            await this.plugin.importRawAckFile(file);acks++;
          }else if(/\.zip$/i.test(file.name)){
            const reviewed=await this.plugin.storeDownloadedZip(file);
            // Safe exchange-only import: no formal note is created or changed.
            await this.plugin.applyDownloaded(reviewed);
            zips++;
          }else throw Error('不支持的文件类型：'+file.name);
        }
        await this.plugin.log('本次接收统计','ZIP '+zips+'、独立 ACK '+acks+
          '；交换区已核验；正式笔记仍需在下一窗口确认');
        return {zips,acks};
      });
      if(received?.zips){
        new Notice('已完成 ① 安全接收；现在进入 ② 预览并确认导入正式笔记',6000);
        try{await this.plugin.showReviewAfterReceive({reason:'download-and-import',forceOpen:true});}
        catch(e){new Notice('打开审核窗口未完成：'+String(e.message||e),7500);}
      }
    }
    async reviewImport(file){
      if(!file)return;
      await this.run('知识库 ZIP 格式审查',async()=>{
        const r=await this.plugin.importOther(file);this.review=r;
        const count=r.kind==='ordinary'?r.newItems.length:r.kind==='formal'?r.upsert:r.contents.length;
        await this.plugin.log('导入预览','类型 '+r.kind+'，待处理 '+count+'，同名不同内容不覆盖');
      });
    }
    render(){
      const p=this.plugin,c=this.contentEl;c.empty();c.addClass('vru-panel');
      const headline=ele(c,'div',null,'vru-headline');
      const shownVersion=p.manifest?.version||'5.2.3';
      ele(headline,'h2','Vault Relay V'+shownVersion+' · 同步控制台');
      ele(c,'p',shownVersion+' · '+device()+' · 增量同步 / 版本保护 / 混合 ZIP 与独立 ACK','vru-subtitle');
      if(Platform.isDesktopApp){
        const size=ele(c,'div',null,'vru-width-controls');
        const widthLabel=ele(size,'label','窗口宽度','vru-width-label');
        const adjust=ele(size,'input');adjust.type='range';adjust.min='520';adjust.max='1100';
        adjust.step='10';adjust.value=String(p.data.desktopPanelWidthPx||680);
        const px=ele(size,'span',adjust.value+' px','vru-width-value');
        adjust.setAttribute?.('aria-label','调整 Windows 控制台宽度');
        adjust.addEventListener('input',()=>{
          px.textContent=adjust.value+' px';
          this.modalEl?.style?.setProperty?.('--vr-console-width',adjust.value+'px');
        });
        adjust.addEventListener('change',async()=>{
          p.data.desktopPanelWidthPx=Number(adjust.value);await p.persistTransport();
        });
        button(size,'恢复默认宽度',async()=>{
          adjust.value='680';px.textContent='680 px';
          this.modalEl?.style?.setProperty?.('--vr-console-width','680px');
          p.data.desktopPanelWidthPx=680;await p.persistTransport();
        });
      }
      // Place Help on its own permanent row. Some Obsidian desktop themes
      // can clip a flexible heading's trailing button even when it exists.
      // This entry must remain visible regardless of which main pane is open.
      const helpBar=ele(c,'div',null,'vru-help-access');
      const helpEntry=button(helpBar,'📖 使用说明（含注意事项）',
        ()=>new VaultRelayHelpModal(this.app,p).open(),true);
      helpEntry.title='打开完整使用说明与常见问题；不修改任何正式笔记';
      const warning=ele(c,'div',null,'vru-warning');
      warning.textContent='安全写入：下载并导入会连续引导审核；正式新增、覆盖、删除都需要你明确确认。';
      const mainSection=(title,key)=>{
        const root=ele(c,'details',null,'vru-settings vru-main-section');
        if(this._mainOpen[key])root.open=true;
        ele(root,'summary',title);
        root.addEventListener('toggle',()=>{this._mainOpen[key]=root.open;});
        return root;
      };
      const info=mainSection('当前知识库与交换目录','vault');
      ele(info,'p','当前知识库：'+this.app.vault.getName()+' · 知识库可放在任意位置','vru-ok');
      ele(info,'p',Platform.isDesktopApp?
        'Windows：百度网盘同步目录直接存放所有收发 ZIP / ACK；知识库内 staging 仅存校验工作文件。':
        '移动端：当前知识库/VaultRelay-Transfer/temporary 统一存放收发 ZIP / ACK；staging 只用于校验工作文件。','vru-path');
      ele(info,'p','云端：使用已核实的百度网盘同步文件夹；名称和位置可不同于知识库。GroupID 才是同步身份。','vru-path');
      ele(info,'p','同步引擎：'+(p.engine?'已就绪 · Device ID：'+p.engine.state.deviceId:'尚未就绪'),'vru-meta');
      const b=row(info);
      button(b,'检查 / 创建本地目录',()=>this.run('自动创建交换目录',async()=>{
        const root=await p.ensureLayout();await p.log('目录检查通过','当前知识库/'+root+' 已存在，未触碰正式笔记');
      }),true);

      const set=mainSection('设置与连接检查','settings');
      const common=section(set,'① 公共设置');
      const identity=ele(common,'div',null,'vru-identity');
      ele(identity,'strong','本机 Device ID');
      const idrow=row(identity);
      const realId=p.engine?.state?.deviceId||p.data.deviceId;
      const deviceInput=ele(idrow,'input');deviceInput.value=realId;
      deviceInput.readOnly=true;deviceInput.className='vru-readonly';
      button(idrow,'复制 Device ID',()=>this.copy(realId));
      if(!p.data.groupId){
        ele(common,'p','GroupID 尚未设置。请选择创建新群组或加入已有群组；安装时只生成 Device ID。','vru-meta');
        const create=ele(common,'div',null,'vru-group-choice');
        ele(create,'strong','创建新群组');
        ele(create,'p','云端文件夹名称任意；一个 GroupID 同时只使用一个有效云端交换空间。','vru-meta');
        button(create,'创建群组并生成 GroupID',()=>this.run('创建新群组',()=>p.createGroup()),true);
        const join=ele(common,'div',null,'vru-group-choice');
        ele(join,'strong','加入已有群组');
        const joined=ele(join,'input');joined.type='text';joined.placeholder='粘贴已有 vg-... GroupID';
        button(join,'加入群组',()=>this.run('加入现有群组',()=>p.joinGroup(joined.value)));
      }else{
        const groupRow=row(common);
        ele(groupRow,'strong','GroupID（已绑定）');
        const id=ele(groupRow,'input');id.value=p.data.groupId;
        id.readOnly=true;id.className='vru-readonly';
        button(groupRow,'复制 GroupID',()=>this.copy(p.data.groupId));
        ele(common,'p','如需更换群组，应先完整备份并走单独的迁移流程，不能直接改写 GroupID。','vru-meta');
      }
      if(p.data.v526AliasConflict){
        const conflict=p.data.v526AliasConflict;
        ele(common,'p','本机保存的群组简称不一致：'+conflict.current+' / '+conflict.legacy+
          '。请在下方填写并保存要使用的简称（例如 Tes1）；已发送文件保留原名，群组身份不变。','vru-warning');
      }
      this.settings(common,'群组简称（3–4 位，如 Tes1）','groupShortName','Tes1');
      this.settings(common,'设备简称（3–4 位，如 Win1 / Red1）','deviceShortName','Win1');
      const ackPolicy=ele(common,'label',null,'vru-setting');
      ele(ackPolicy,'span','ACK 清理策略（只影响以后生成的新包）');
      const policyChoice=ele(ackPolicy,'select');
      for(const [value,label] of [
        ['any','任意一台设备完整确认（默认）'],
        ['all','所有预期设备均确认（严格模式）'],
        ['manual','仅人工清理（不根据 ACK 自动删除）']]){
        const option=ele(policyChoice,'option',label);option.value=value;
      }
      policyChoice.value=p.data.ackCleanupPolicy||'any';
      policyChoice.addEventListener('change',()=>{
        this._mainOpen.settings=true;
        void this.run('ACK 清理策略',()=>p.updateSetting('ackCleanupPolicy',policyChoice.value));
      });
      this.settings(common,'预期接收设备 Device ID（常规保存；严格模式使用）','ackRecipientIds','vr-...');
      if((p.data.ackCleanupPolicy||'any')==='all'){
        ele(common,'p','严格模式：填写每台必须确认的接收设备 ID，以逗号分隔；旧包沿用生成时的规则。','vru-help');
      }else{
        ele(common,'p',(p.data.ackCleanupPolicy==='manual'?
          '保守模式：不因收到 ACK 自动清理发送临时 ZIP；旧包规则不变。':
          '默认模式：任意一台其他设备对同一包内全部正式版本提供有效 ACK 即满足 ACK 条件，无需预填 Device ID。')+
          ' ACK 不证明云端当前仍可下载；百度同步目录的 ZIP 不会自动删除。','vru-help');
      }
      const connection=section(set,'② 连接设置');
      if(Platform.isDesktopApp){
        this.settings(connection,'Windows 百度网盘已同步的本地文件夹',
          'windowsCloudDir','例如：你的百度网盘本地同步目录（完整路径）');
        ele(connection,'p','用户指定已由百度客户端同步的文件夹。文件夹名与位置均不绑定 GroupID；首次验证后写入 VaultRelay-Space.json 身份文件，改名或移动时它随文件夹一起移动。','vru-meta');
        const wc=row(connection);
        button(wc,'检查空间身份',()=>this.run('Windows 云端空间身份检查',async()=>{
          const info=p.cloudConfig();
          await p.log('空间身份有效','GroupID '+p.data.groupId+' · '+info.cloud);
        }));
        if(p.data.windowsCloudDir)ele(connection,'p','当前 Windows 同步位置：'+p.data.windowsCloudDir,'vru-path');
      }else{
        ele(connection,'p','首次在百度网盘为唯一群组文件夹创建长期分享链接和提取码。日常「下载增量包」使用保存的分享网址。','vru-meta');
        const linkSetting=ele(connection,'label',null,'vru-share-setting');
        ele(linkSetting,'span','百度网盘群组长期分享链接');
        const urlInput=ele(linkSetting,'input');urlInput.type='text';
        urlInput.value=p.data.shareUrl||'';
        urlInput.placeholder='粘贴 https://pan.baidu.com/s/...（可包含提取码文字）';
        urlInput.className='vru-share-edit';
        const pwdSetting=ele(connection,'label',null,'vru-share-setting');
        ele(pwdSetting,'span','固定提取码（可选，4 位）');
        const pwdInput=ele(pwdSetting,'input');pwdInput.type='text';
        pwdInput.value=p.data.shareCode||'';
        pwdInput.placeholder='例如 abcd';pwdInput.className='vru-share-edit';
        const saveLink=row(connection);
        button(saveLink,'保存群组长期分享信息',()=>{this._mainOpen.settings=true;return this.run('保存群组长期分享信息',
          ()=>p.saveGroupShare(urlInput.value,pwdInput.value));},true);
        const firstActions=row(connection);
        button(firstActions,'① 复制百度网盘群组链接',()=>this.copyGroupShare(urlInput));
        button(firstActions,'② 打开浏览器',()=>this.openShareBrowser(true));
        ele(connection,'p','首次测试：保存 → ① 复制 → ② 打开浏览器 → 自己粘贴链接并回车。浏览器能否由系统拉起，须实机核实。','vru-meta');
        if(Platform.isAndroidApp){
          this.settings(connection,'Android 优先扫描目录（不限制全范围扫描）',
            'mobileSourcePath','/storage/emulated/0/Download/BaiduNetdisk/');
          const extra=ele(connection,'label',null,'vru-setting');
          ele(extra,'span','补充优先目录（每行一条，最多 20 条）');
          const extInput=ele(extra,'textarea');extInput.rows=3;
          extInput.value=(p.data.mobileExtraSources||[]).map(x=>decodeURI(x).replace(/^file:\/\//,'')).join('\n');
          extInput.placeholder='/storage/emulated/0/Documents/';
          button(connection,'保存补充扫描目录',()=>this.run('保存扫描目录',()=>
            p.updateSetting('mobileExtraSources',extInput.value)));
          ele(connection,'p','进入「③ 核对并确认」将尝试检查系统允许读取的共享存储范围及子目录，并优先检查已知和新增下载目录；增量索引避免重复读文件。受 Android 权限和本轮扫描上限影响时会明确显示未覆盖数量，不声称扫描完整。外部原件不删除。','vru-meta');
        }else{
          ele(connection,'p','iOS / iPadOS 使用“从‘文件’选择 ZIP / ACK”将已下载文件安全复制到 temporary；也可使用日常步骤③。','vru-meta');
        }
      }
      ele(connection,'p','平台：'+device()+'。仅显示当前系统可用的配置。','vru-meta');

      if(Platform.isDesktopApp){
        const w=section(connection,'Windows 专用 · 自动收发增量文件');
        ele(w,'p','开关关闭：新 ZIP/ACK 仅写入本地待发送区；重新开启：校验 SHA、去重并自动补发至百度同步文件夹。百度客户端负责上传云端，云端状态不能由本插件推断。','vru-meta');
        ele(w,'p','待补发 '+Object.keys(p.data.pendingOutboundFiles||{}).length+' 个 · 本地云端状态未验证','vru-meta');
        const waiting=Object.values(p.data.pendingOutboundFiles||{}).slice(-40);
        if(waiting.length){
          const itemsBox=ele(w,'div',null,'vru-fixed-scroll vru-ack-list-scroll');
          for(const f of waiting){
            const line=row(itemsBox);line.className+=' vru-ack-file-line';
            ele(line,'span',f.name,'vru-ack-file-name').title=f.path;
            button(line,'复制完整路径',()=>this.copy(f.path));
          }
        }
        const wr=row(w);
        toggle(wr,!!p.data.desktopTransportEnabled,()=>this.run('Windows 自动收发开关',async()=>{
          if(!p.agent)throw Error('没有桌面代理');
          if(!p.data.desktopTransportEnabled){
            const config=p.agent.config();await p.agent.verifyFolders(config);
            if(!p.getLegacy())throw Error('同步引擎尚未初始化');
            if(!p.data.desktopLedger?.initialized)await p.agent.initialize();
            p.data.desktopTransportEnabled=true;
            await p.persistTransport();
            const flushed=await p.flushQueuedOutbound();
            await p.log('Windows 自动收发已恢复','已校验并补发本地排队文件 '+flushed.published+
              ' 个、云端映射目录已有相同文件 '+flushed.duplicates+' 个；百度客户端云端上传状态未验证');
            const tick=await p.agent.tick();
            await p.log('恢复后的扫描',p.describeDesktopScan(tick));
          }else{
            p.data.desktopTransportEnabled=false;
            await p.persistTransport();
            await p.log('Windows 自动收发已暂停','后续自动扫描与自动发布停止；新 ZIP/ACK 仅保存在本地待发送区。百度客户端可能继续上传此前已经进入同步目录的文件');
          }
        }));
        button(wr,'立即安全扫描',()=>this.run('Windows 增量扫描',async()=>{
          const r=p.data.desktopTransportEnabled?await p.agent.tick():await p.agent.receiveOnly();
          await p.log('Windows 扫描结果',p.describeDesktopScan(r)+'；自动发送'+(p.data.desktopTransportEnabled?'开启':'关闭'));
        }));
      }
      const transfer=mainSection('增量 ZIP 上传下载与导入','transfer');
      ele(transfer,'p',
        '有正文增量时 ZIP 合并尚未发送的 ACK；只有 ACK 时仍提供独立 JSON。正式笔记始终需要人工审核。','vru-help');
      const controls=row(transfer);
      const groupReady=!!p.data.groupId && !!p.engine;
      const upload=button(controls,'① 预览并生成增量 ZIP',()=>this.legacy('upload'),true);
      upload.disabled=!groupReady;
      const uploadLink=button(controls,'上传 ZIP / ACK（打开百度网盘入口）',()=>new VaultRelayAckUploadModal(this.app,this,true).open());
      uploadLink.disabled=!groupReady;
      const download=row(transfer);
      if(Platform.isDesktopApp){
        const receive=button(download,'② 检查本地同步目录（下载接收）',()=>this.run('Windows 安全扫描',async()=>{
          if(!p.agent)throw Error('桌面代理未初始化');
          const r=p.data.desktopTransportEnabled?await p.agent.tick():await p.agent.receiveOnly();
          await p.log('Windows 安全扫描',p.describeDesktopScan(r)+'；自动发送'+(p.data.desktopTransportEnabled?'开启':'关闭'));
        }),true);
        receive.disabled=!groupReady;
      }else{
        const direct=button(download,'② 打开百度网盘（下载）',()=>this.openShareBrowser(false),true);
        direct.disabled=!groupReady;
      }
      const audit=row(transfer);
      const reviewNow=button(audit,Platform.isIosApp?'③ 选择已下载 ZIP / ACK 并审核':'③ 核对与确认导入（自动搜索已下载文件）',()=>{
        if(Platform.isIosApp)return this.pickMobileTransferFiles();
        return this.run('只读审核与扫描',()=>p.showReviewAfterReceive({reason:'manual-review',forceOpen:true}));
      },true);
      reviewNow.disabled=!groupReady;
      ele(transfer,'p',Platform.isIosApp?
        '苹果端：② 下载后在百度网盘中“打开方式／分享”→“存储到文件”，再点③从“文件”中选择 ZIP / ACK。等待 iCloud 文件下载完成后选取；只读审核后仍需人工确认写入。':
        '日常步骤：① 预览确认上传 → ② 手机上从百度网盘下载（Windows 只检查已同步到本地的文件） → ③ 自动搜索已下载文件、校验及只读审核，用户确认后才写入正式笔记。Android 无权限目录可用手动选文件兜底。','vru-help');
      ele(transfer,'p','同步范围递归排除 .obsidian/ 与 VaultRelay-Transfer/，其余普通用户文件夹正常参与同步。','vru-meta');

      const advanced=mainSection('高级操作','advanced');
      advanced.className+=' vru-advanced-root';
      const more=ele(advanced,'details',null,'vru-settings vru-advanced');
      ele(more,'summary','手动上传');
      if(this._advOpen?.upload)more.open=true;
      more.addEventListener('toggle',()=>{(this._advOpen||={}).upload=more.open;});
      ele(more,'p','先预览并确认生成 ZIP，再打开百度网盘上传入口，手动选择文件上传。接收方正式导入后回传 ACK；打开网盘或系统分享均不代表云端上传完成。','vru-help');
      const step=row(more);
      button(step,'预览并生成增量 ZIP',()=>this.legacy('upload')).disabled=!groupReady;
      button(step,'打开百度网盘上传入口（ZIP / ACK）',()=>new VaultRelayAckUploadModal(this.app,this,true).open()).disabled=!groupReady;
      if(!Platform.isDesktopApp)button(step,'撤销确定未上传的本机草稿',()=>this.legacy('withdraw'));

      const manualDownload=ele(advanced,'details',null,'vru-settings vru-advanced');
      ele(manualDownload,'summary','手动下载');
      if(this._advOpen?.download)manualDownload.open=true;
      manualDownload.addEventListener('toggle',()=>{(this._advOpen||={}).download=manualDownload.open;});
      ele(manualDownload,'p',Platform.isDesktopApp?
        '① 手动从系统文件夹选择 ZIP/ACK 并安全接收，随后自动进入 ② 审核及确认。Windows 自动收发和立即安全扫描在「设置与连接检查 → 连接设置」。':
        Platform.isIosApp?'iOS / iPadOS 不会扫描其他应用的下载目录。请先将下载文件存储到“文件”，再通过下方按钮选择 ZIP / ACK；取消选择不会导入。':
        '扫描尽量覆盖可访问的公共存储目录（含子目录），并优先检测常用和自设目录；如有权限限制、数量上限或中途退出，请采用系统选文件兜底。','vru-help');
      if(!Platform.isDesktopApp)
        button(manualDownload,'打开百度网盘群组分享页（下载 ZIP / ACK）',()=>this.openShareBrowser(false)).disabled=!groupReady;
      const receiveTools=row(manualDownload);
      if(Platform.isDesktopApp){
        const chooser=ele(manualDownload,'input');chooser.type='file';
        chooser.accept='.zip,.json,application/zip,application/json';
        chooser.multiple=true;chooser.className='vru-hidden';
        chooser.addEventListener('change',()=>{
          const files=Array.from(chooser.files||[]);chooser.value='';
          this.receiveTransferFiles(files);
        });
        const choose=button(receiveTools,'① 从系统文件夹选择增量包',()=>chooser.click());
        choose.disabled=!groupReady;
      }else{
        if(Platform.isAndroidApp){
          button(receiveTools,'全范围智能扫描并安全接收',()=>{
            if(!p.mobileCapacitorFilesystem() &&
               (typeof window==='undefined'||typeof window.resolveLocalFileSystemURL!=='function')){
              new Notice('没有可用的目录读取接口，请从系统文件夹选取下载文件',5000);
              return this.pickMobileTransferFiles();
            }
            return (async()=>{const received=await this.run('① 移动端下载目录安全接收',async()=>{
              const result=await p.scanMobileReception({reason:'manual',notify:true});
              if(['access-denied','source-error','not-configured','partial','no-native-api'].includes(result.source.state))
                new Notice('自动读取未成功，请使用“从系统文件夹选择 ZIP / ACK”',6000);
              return result;
            });await p.reviewMobileScanResult(received);
            })().catch(e=>new Notice('审核未完成：'+String(e.message||e),7000));
          });
        }
        const choose=button(receiveTools,Platform.isIosApp?'从“文件”选择 ZIP / ACK':'从系统文件夹选择 ZIP / ACK',()=>this.pickMobileTransferFiles());
        choose.disabled=!groupReady;
        if(Platform.isAndroidApp)
          button(receiveTools,'取消正在进行的扫描',()=>{
            p.cancelMobileDownloadScan();new Notice('已请求取消；已经安全复制的文件保留',4500);
          });
      }
      const openAudit=button(receiveTools,'③ 核对并确认正式导入',
        ()=>this.run('手动打开只读审核',()=>p.showReviewAfterReceive({
          reason:'manual-review',forceOpen:true
        })),true);
      openAudit.disabled=!groupReady;



      const ack=ele(advanced,'details',null,'vru-settings vru-advanced');
      ele(ack,'summary','ACK 高级管理');
      if(this._advOpen?.ack)ack.open=true;
      ack.addEventListener('toggle',()=>{(this._advOpen||={}).ack=ack.open;});
      ele(ack,'p','有新正文时优先合包 ACK；只有 ACK 时生成单独 JSON。此处仍保留独立 ACK 的手动准备、完整路径复制和故障处理功能。','vru-meta');
      const ackTools=row(ack);
      button(ackTools,'① 手动生成独立 ACK',()=>this.run('生成独立 ACK',()=>p.exportRawAcks()),true);
      const lastAck=p.data.lastPreparedAckFiles?.paths||[];
      ele(ack,'h4','已生成的独立 ACK 文件');
      const filesBox=ele(ack,'div',null,'vru-fixed-scroll vru-ack-list-scroll');
      if(lastAck.length){
        for(const filePath of lastAck.slice(-35).reverse()){
          const line=row(filesBox);line.className+=' vru-ack-file-line';
          const name=filePath.split(/[\/]/).pop();
          const text=ele(line,'span',name,'vru-ack-file-name');VR527UI.expandable(text);
          const copyTools=row(line);copyTools.className+=' vru-ack-copy-tools';
          button(copyTools,'复制文件名',()=>this.copy(name));
          button(copyTools,'复制完整路径',()=>this.copy(filePath));
        }
      }else ele(filesBox,'p','尚未生成独立 ACK。','vru-meta');
      const navigation=row(ack);navigation.className+=' vru-ack-navigation';
      button(navigation,'② 上传 ACK（打开百度网盘上传入口）',()=>new VaultRelayAckUploadModal(this.app,this).open());
      button(navigation,'③ 下载 ACK（打开百度群组分享页）',()=>this.openShareBrowser(false));
      button(ack,'④ 重新核对 ACK 状态',()=>this.run('ACK 状态核对',()=>p.recheckAckStatus()),true);
      const state=p.engine?.state;
      ele(ack,'p','待确认发送 ZIP：'+p.data.bundleRecords.filter(x=>x.status==='pending').length+
        ' · 已接收 ACK 条目：'+Object.keys(state?.receivedAcks||{}).length+
        ' · 本机已生成 ACK 条目：'+Object.keys(state?.acks||{}).length,'vru-meta');
      const details=ele(ack,'details');
      ele(details,'summary','ACK 诊断明细');
      const fullAckJson=JSON.stringify({
        deviceId:state?.deviceId||p.data.deviceId,
        receivedAckCount:Object.keys(state?.receivedAcks||{}).length,
        generatedAckCount:Object.keys(state?.acks||{}).length,
        pendingContentPackages:p.data.bundleRecords.filter(x=>x.status==='pending').map(x=>x.name),
        receivedAcks:state?.receivedAcks||{},
        pendingAcks:state?.acks||{}
      },null,2);
      const ackTextBox=ele(details,'div',null,'vru-fixed-scroll vru-ack-diagnostics-scroll');
      const diagnosticRows=VR527UI.ackRows(state);
      if(!diagnosticRows.length)ele(ackTextBox,'p','暂无 ACK 记录。','vru-meta');
      for(const item of diagnosticRows){
        const entry=ele(ackTextBox,'div',null,'vru-ack-diagnostic-entry');
        const heading=ele(entry,'strong','笔记：'+item.path);heading.className='vr527-keep-full';
        ele(entry,'p','处理结果：'+item.result,'vr527-keep-full');
        ele(entry,'p','接收状态：'+item.status,'vr527-keep-full');
        const names=state?.devices||{};
        const display=id=>id===state?.deviceId?(state.displayName||p.data.displayName||'本机'):
          (names[id]?.name||id);
        ele(entry,'p','确认方向：'+display(item.from)+' → '+display(item.to),'vru-meta');
        ele(entry,'p','ACK 生成时间：'+VR527UI.formatTime(item.createdAtUtc),'vru-meta');
        const technical=ele(entry,'details');ele(technical,'summary','技术详情');
        for(const [label,value] of [['来源设备 ID',item.from],['目标设备 ID',item.to],
          ['版本',item.ack.versionId],['内容 SHA',item.ack.contentSha256??'删除版本（无正文 SHA）'],
          ['ACK ID',item.ack.ackId]])ele(technical,'p',label+'：'+(value||'未记录'),'vru-meta');
      }
      button(details,'复制诊断数据',()=>this.copy(fullAckJson));

      const base=ele(advanced,'details',null,'vru-settings vru-advanced');
      ele(base,'summary','知识库管理');
      if(this._advOpen?.vault)base.open=true;
      base.addEventListener('toggle',()=>{(this._advOpen||={}).vault=base.open;});
      const tools=row(base);
      button(tools,'导出知识库',()=>
        new VaultRelayExportChoiceModal(this.app,p,'vault',
          (file,mime,title)=>this.sharePreparedFile(file,mime,title),
          ()=>this.render()).open());
      button(tools,'导入普通 Markdown（先预览）',()=>new VaultRelayMarkdownImportModal(this.app,p).open());
      const ordinary=ele(base,'input');ordinary.type='file';ordinary.accept='.zip';ordinary.className='vru-hidden';
      ordinary.addEventListener('change',()=>this.reviewImport(ordinary.files?.[0]));
      button(tools,'导入知识库（先预览）',()=>ordinary.click());
      button(tools,'查看临时包清理条件（不执行删除）',()=>new VaultRelayCleanupModal(this.app,p).open());
      if(this.review){
        const r=this.review;
        const preview=ele(base,'div',null,'vru-preview');
        ele(preview,'strong','待导入：'+r.fileName+' / '+r.kind);
        ele(preview,'p',r.kind==='ordinary'?`新增 ${r.newItems.length}，同哈希跳过 ${r.sameItems.length}，冲突 ${r.conflicts.length}（不覆盖）`:
          `同步核心交换包：${r.upsert||0} 个条目，只写同步核心交换区`);
        const pr=row(preview);
        button(pr,'确认按预览导入',()=>this.run('确认导入',async()=>{
          if(!window.confirm('严格按预览处理：同名不同内容不覆盖，同步核心同步状态不会由本插件伪造。确认吗？'))return;
          await p.applyOther(r);this.review=null;
        }),true);
        button(pr,'取消',()=>{this.review=null;this.render();});
      }
      const comparison=ele(advanced,'details',null,'vru-settings vru-advanced');
      ele(comparison,'summary','知识库比对');
      if(this._advOpen?.comparison)comparison.open=true;
      comparison.addEventListener('toggle',()=>{(this._advOpen||={}).comparison=comparison.open;});
      ele(comparison,'p','只读比较两台设备的正式文件：按相对路径、文件大小、SHA-256、修改时间和已知版本标识生成清单。不包含正文，不会自动使两端一致。','vru-help');
      const compareTools=row(comparison);
      button(compareTools,'① 导出本机知识库信息',()=>
        new VaultRelayExportChoiceModal(this.app,p,'inventory',
          (file,mime,title)=>this.sharePreparedFile(file,mime,title),()=>this.render()).open(),true);
      const inventoryInput=ele(comparison,'input');inventoryInput.type='file';
      inventoryInput.accept='.json,application/json';inventoryInput.className='vru-hidden';
      inventoryInput.addEventListener('change',async()=>{
        const file=inventoryInput.files?.[0];inventoryInput.value='';
        if(file)await this.run('② 导入对端知识库信息',()=>p.importVaultInventoryFile(file));
      });
      button(compareTools,'② 导入对端知识库信息',()=>inventoryInput.click());
      const runComparison=button(compareTools,'③ 开始比对',()=>
        new VaultRelayComparisonResultsModal(this.app,p,
          (file,mime,title)=>this.sharePreparedFile(file,mime,title)).open());
      runComparison.disabled=!p.data.vaultComparisonRemote||!groupReady;
      const remote=p.data.vaultComparisonRemote;
      if(remote)ele(comparison,'p','已导入对端：'+remote.name+' · '+remote.files+
        ' 文件 · 清单时间 '+remote.createdAt+'。比对会重新扫描本机。','vru-meta');
      ele(comparison,'p','发现差异后，可勾选本机存在的文件导出普通 ZIP 或选择性新版本增量 ZIP。仅对端存在的文件必须在对端导出。','vru-help');

      const versions=ele(advanced,'details',null,'vru-settings vru-advanced');
      ele(versions,'summary','版本与冲突');
      if(this._advOpen?.version)versions.open=true;
      versions.addEventListener('toggle',()=>{(this._advOpen||={}).version=versions.open;});
      const versionActions=row(versions);
      button(versionActions,'拒绝删除并保留本机文件（先预览）',
        ()=>new VaultRelayKeepDeletionModal(this.app,p).open());
      const legacy=row(versions);
      for(const [name,key] of [['历史版本','history'],['冲突列表','conflicts'],['智能合并','merge'],['本机设备设置','setup']])
        button(legacy,name,()=>this.legacy(key));

      const logs=mainSection('操作日志、诊断与回退','logs');
      logs.className+=' vru-logs-root';
      const clear=row(logs);
      button(clear,'复制操作日志',async()=>{
        const value=p.data.history.map(x=>x.time+' ['+x.kind+'] '+x.message).join('\n');
        try{await navigator.clipboard.writeText(value);new Notice('已复制');}
        catch(_){window.prompt('复制日志',value);}
      });
      button(clear,'清空日志（不删除文件）',()=>this.run('清理日志',async()=>{
        if(window.confirm('仅清除操作日志？')){p.data.history=[];await p.persistTransport();}
      }));
      button(clear,'导出诊断日志',()=>
        new VaultRelayExportChoiceModal(this.app,p,'diagnostic',
          (file,mime,title)=>this.sharePreparedFile(file,mime,title),
          ()=>this.render()).open());
      if(p.data.latestDiagnosticPath){
        button(clear,'复制最近诊断路径',()=>this.copy(p.data.latestDiagnosticPath));
        ele(logs,'p','最近诊断：'+p.data.latestDiagnosticPath,'vru-path');
      }

      ele(logs,'h3','最近传输状态');
      if(p.data.mobileLastScan)
        ele(logs,'p','最近安全扫描：'+p.data.mobileLastScan.summary,'vru-meta');
      if(p.data.mobileLastSource){
        const ext=p.data.mobileLastSource;
        ele(logs,'p','Android 智能扫描：'+ext.state+'；已查目录 '+(ext.scannedDirs||0)+
          '、不可读 '+(ext.unreadableDirs||0)+'、未查完 '+(ext.pendingDirs||0)+
          '；新复制 '+(ext.copied||0)+'、跳过 '+(ext.skipped||0)+'、失败 '+(ext.errors||0)+
          '。部分扫描不是全盘覆盖完成。','vru-meta');
      }
      ele(logs,'p','当前待传 ZIP：'+(p.data.latest||'尚未生成'),'vru-meta');
      ele(logs,'p',Platform.isDesktopApp?
        'Windows 通过既有百度本地同步目录收发 ZIP / ACK，不直接证明已上传云端。':
        '移动端 ZIP / 独立 ACK 在 temporary 安全暂存，staging 为校验区。Android 自动下载与系统文件选择均进入相同校验流程。','vru-meta');
      ele(logs,'h3','可回退操作');
      ele(logs,'p','只有保存了操作前 SHA、备份、操作后 SHA 和版本关系的记录才能回退；V4.0.14 旧日志不能凭文字直接逆转。方式 B 恢复正式笔记后，上传仍需另行确认。','vru-help');
      const undoItems=Array.isArray(p.data.undoOperations)?p.data.undoOperations:[];
      const undoScroll=ele(logs,'div',null,'vru-fixed-scroll vru-undo-scroll');
      if(!undoItems.length)ele(undoScroll,'p','目前没有可直接回退的事务记录；旧删除备份可以通过普通 Markdown 安全导入恢复。','vru-meta');
      for(const tx of undoItems){
        const line=ele(undoScroll,'div',null,'vru-log');
        ele(line,'strong',tx.createdAt+' · '+tx.kind+' · '+
          (tx.status==='available'?'待处理':'已回退'));
        ele(line,'p',(tx.items||[]).map(x=>x.path).join('、'),'vru-meta');
        if(tx.status==='available')button(line,'回退此操作（先预览）',
          ()=>new VaultRelayUndoModal(this.app,p,tx.id).open(),true);
      }
      ele(logs,'h3','操作结果记录');
      if(!p.data.history.length)ele(logs,'p','暂无记录','vru-meta');
      const logScroll=ele(logs,'div',null,'vru-fixed-scroll vru-operation-scroll');
      for(const line of p.data.history.slice(0,100)){
        const x=ele(logScroll,'div',null,'vru-log');
        ele(x,'strong',line.time+' · '+line.kind);
        ele(x,'p',line.message);
      }
      ele(c,'p','Vault Relay V'+(p.manifest?.version||'5.2.3')+' · Windows / Android / iPadOS','vru-footer');
      VR527UI.enhance(c);
    }
  }
  VaultRelayUnifiedPanel.ReviewModal=VaultRelayReviewFileModal;
  VaultRelayUnifiedPanel.HelpModal=VaultRelayHelpModal;
  VaultRelayUnifiedPanel.CleanupModal=VaultRelayCleanupModal;
  VaultRelayUnifiedPanel.AckUploadModal=VaultRelayAckUploadModal;
  return VaultRelayUnifiedPanel;
}
module.exports={createUnifiedPanel};

return module.exports;
}
function loadUnified(){
const module={exports:{}};
'use strict';
/** Vault Relay V4. Single cross-platform transport control panel.
 * The V4 built-in native engines are responsible for note versions,
 * conflicts and official ACK processing; envelopes never directly overwrite notes.
 */
function createUnifiedPlugin(Bridge, createDesktopAgent, JSZip, importer, Lifecycle, Panel) {
  const {Plugin, Platform, Notice}=require('obsidian');
  const T=Bridge.__testing;
  const ROOT='VaultRelay-Transfer';
  // GroupID is the identity of exactly one logical cloud exchange space.
  // Neither cloud folder name nor the Windows mirror path is an identity.
  // Keep this human-visible so Baidu sync clients are less likely to omit it.
  const SPACE_MARKER='VaultRelay-Space.json';
  const SPACE_FORMAT='vaultrelay.space.v1';
  const sameLocalPath=(a,b)=>process.platform==='win32'?
    String(a).toLowerCase()===String(b).toLowerCase():String(a)===String(b);
  const SUB=['outgoing','temporary','staging','inbox','outbox'];
  const toBytes=T.asBytes;
  const hex=async data=>T.sha256(toBytes(data));
  const text=new TextEncoder();
  const fileNameOK=s=>typeof s==='string' && s.length>0 && s.length<=155 &&
    !/[/\\:\x00-\x1f]/.test(s) && !s.startsWith('.') && !/[. ]$/.test(s);
  const isValidGroup=x=>/^vg-[a-z0-9]{16,40}$/.test(String(x||''));
  async function writeChecked(adapter,path,data) {
    const bytes=toBytes(data),h=await hex(bytes);
    if(await adapter.exists(path)) {
      const old=toBytes(await adapter.readBinary(path));
      if(await hex(old)!==h)throw Error('同名文件内容不同，拒绝覆盖：'+path);
      return {created:false,sha256:h,path};
    }
    await T.ensureVaultFolder(adapter,path.slice(0,path.lastIndexOf('/')));
    await adapter.writeBinary(path,T.buffer(bytes));
    if(await hex(await adapter.readBinary(path))!==h)
      throw Error('保存后 SHA-256 回读校验失败：'+path);
    return {created:true,sha256:h,path};
  }
  async function promoteToCloud(plugin,filename,data) {
    if(!Platform.isDesktopApp)throw Error('此操作仅 Windows/macOS 可用');
    if(!plugin.data.desktopTransportEnabled)throw Error('自动收发已关闭：拒绝将文件发布到百度同步目录');
    const {fs,path}=T.nodeFiles?T.nodeFiles():{fs:require('node:fs').promises,path:require('node:path')};
    const config=plugin.cloudConfig();
    const dest=path.join(config.cloud,filename);
    let stat;
    try{stat=await fs.lstat(dest);}catch(e){if(e.code!=='ENOENT')throw e;}
    const raw=toBytes(data),hash=await hex(raw);
    if(stat) {
      if(!stat.isFile()||stat.isSymbolicLink()||await hex(await fs.readFile(dest))!==hash)
        throw Error('云盘映射目录存在同名不同内容文件，已拒绝覆盖：'+filename);
      return {path:dest,created:false};
    }
    await T.exclusiveFinishedWrite(fs,dest,raw);
    if(await hex(await fs.readFile(dest))!==hash)
      throw Error('Windows 映射目录回读 SHA 校验失败');
    return {path:dest,created:true};
  }
  return class VaultRelayUnifiedLab extends Plugin {
    async onload() {
      const saved=await this.loadData();
      if(saved!=null && (typeof saved!=='object'||Array.isArray(saved))) {
        new Notice('统一版配置内容损坏：未覆盖现有数据',9000);return;
      }
      this.data=Object.assign({
        groupId:'',groupName:'',groupShortName:'',deviceShortName:'',
        shareUrl:'',shareCode:'',deviceId:'',displayName:'',
        windowsLegacyDir:'',windowsCloudDir:'',windowsCloudActiveRoot:'',
        desktopTransportEnabled:false,
        history:[],latest:'',latestFingerprint:'',latestCloudFile:'',
        bundleRecords:[],inboundRecords:[],ackRecipientIds:'',ackCleanupPolicy:'any',desktopPanelWidthPx:680,
        receivedHashes:[],importedHashes:[],desktopLedger:null,
        mobileInboxLedger:{},mobileLastScan:null,ackTransportLedger:{},pendingOutboundFiles:{}
      }, saved||{});
      if(!Array.isArray(this.data.history))this.data.history=[];
      if(!Array.isArray(this.data.bundleRecords))this.data.bundleRecords=[];
      if(!['any','all','manual'].includes(this.data.ackCleanupPolicy))
        this.data.ackCleanupPolicy='any';
      if(!Array.isArray(this.data.inboundRecords))this.data.inboundRecords=[];
      if(!Array.isArray(this.data.receivedHashes))this.data.receivedHashes=[];
      if(!Array.isArray(this.data.importedHashes))this.data.importedHashes=[];
      if(!this.data.ackTransportLedger||typeof this.data.ackTransportLedger!=='object')this.data.ackTransportLedger={};
      if(!this.data.pendingOutboundFiles||typeof this.data.pendingOutboundFiles!=='object')this.data.pendingOutboundFiles={};
      if(!this.data.mobileInboxLedger || typeof this.data.mobileInboxLedger!=='object' ||
         Array.isArray(this.data.mobileInboxLedger))this.data.mobileInboxLedger={};
      if(!this.data.deviceId)this.data.deviceId='vr-'+T.randomHex(32);
      if(!this.data.groupName)this.data.groupName=this.app.vault.getName();
      // Add aliases without modifying legacy GroupID, DeviceID or the
      // native engine's display/history fields on existing installations.
      T.reconcileGroupAlias(this.data);
      this.data.deviceShortName=T.shortName(this.data.deviceShortName,
        Platform.isAndroidApp?'Red1':Platform.isIosApp?'Ios1':'Win1');
      const original=this.currentLegacyGroup();
      if(original && !this.data.groupId)this.data.groupId=original;
      await this.saveData(this.data);
      this.addRibbonIcon('folder-sync','Vault Relay V4',()=>new Panel(this.app,this).open());
      this.addCommand({id:'open-console',name:'打开 Vault Relay 统一控制台',
        callback:()=>new Panel(this.app,this).open()});
      // A second independent access path for the manual, even if a custom
      // Obsidian theme temporarily interferes with the control panel header.
      this.addCommand({id:'open-user-manual',name:'Vault Relay：使用说明与注意事项',
        callback:()=>new Panel.HelpModal(this.app,this).open()});
      try{await this.ensureLayout();}
      catch(e){await this.log('目录创建未完成',String(e.message||e));}
      if(Platform.isDesktopApp){
        this.agent=createDesktopAgent(this,T);
        this.registerInterval(setInterval(()=>this.monitor(),60000));
      }
    }
    validateAckRecipients(value){return Lifecycle.recipients(value);}
    getLegacy(){try{return this.app.plugins?.plugins?.['vault-relay-info-lab']||null;}catch(_){return null;}}
    currentLegacyGroup(){const old=this.getLegacy();return old?.engine?.state?.groupId||old?.data?.v2?.groupId||old?.data?.groupId||'';}
    vaultIsCorrect(){return !!(this.app?.vault?.adapter && this.app.vault.getName());}
    assertVault(){if(!this.vaultIsCorrect())throw Error('无法访问当前 Obsidian 知识库目录');}
    assertGroup(){this.assertVault();if(!isValidGroup(this.data.groupId))throw Error('先从同步核心核对并填写完整 GroupID');const g=this.currentLegacyGroup();if(g&&g!==this.data.groupId)throw Error('同步核心与统一版 GroupID 不一致，已停止');return this.data.groupId;}
    async ensureLayout(){
      this.assertVault();
      const parts=Platform.isDesktopApp?['outgoing','temporary','staging','inbox','outbox']:
        ['temporary','staging','inbox','outbox'];
      for(const part of [ROOT,...parts.map(x=>ROOT+'/'+x)])
        await T.ensureVaultFolder(this.app.vault.adapter,part);
      // The older outgoing/temporary folders are preserved during upgrades.
      // They are never silently deleted or recreated for new Windows installs.
      return ROOT;
    }
    async persistTransport(){await this.saveData(this.data);}
    async log(kind,message) {
      this.data.history.unshift({time:new Date().toLocaleString('zh-CN',{hour12:false}),
        kind:String(kind),message:String(message).slice(0,1300)});
      this.data.history=this.data.history.slice(0,150);
      await this.persistTransport();
    }
    readWindowsSpaceMarker(dir) {
      const fs=require('node:fs'),path=require('node:path');
      const file=path.join(dir,SPACE_MARKER);
      let st;
      try{st=fs.lstatSync(file);}
      catch(e){if(e.code==='ENOENT')return null;throw e;}
      if(!st.isFile()||st.isSymbolicLink()||st.size<20||st.size>4096)
        throw Error('云端空间身份文件不是安全的普通 JSON 文件：'+file);
      let identity;
      try{identity=JSON.parse(fs.readFileSync(file,'utf8'));}
      catch(_){throw Error('云端空间身份文件不是合法 JSON：'+file);}
      if(identity?.format!==SPACE_FORMAT||identity.schema!==1||
         !isValidGroup(identity.groupId))
        throw Error('云端空间身份文件的格式或 GroupID 无效：'+file);
      return identity;
    }
    verifyUnmarkedWindowsSpace(dir){
      // Backwards compatibility: a V4.0.3 folder may already contain ZIP and
      // ACK files but not yet have a space marker. Reject foreign/invalid
      // exchange artifacts before assigning it a permanent identity.
      const fs=require('node:fs'),path=require('node:path');
      const files=fs.readdirSync(dir,{withFileTypes:true});
      if(files.length>2000)throw Error('交换目录文件过多，无法完成首次身份核验');
      for(const item of files){
        if(item.name===SPACE_MARKER)continue;
        if(item.isSymbolicLink())throw Error('交换目录含有符号链接，拒绝首次绑定：'+item.name);
        if(!item.isFile())continue;
        if(/\.zip$/i.test(item.name)){
          const target=path.join(dir,item.name),st=fs.lstatSync(target);
          if(st.size<22||st.size>T.MAX_BUNDLE_BYTES)throw Error('旧增量 ZIP 大小异常：'+item.name);
          let manifest;
          try{
            const archive=T.zipDecode(fs.readFileSync(target));
            manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(
              archive.get('manifest.json')));
          }catch(_){throw Error('旧增量 ZIP 的 GroupID 无法验证：'+item.name);}
          if(manifest?.format!=='vault-relay-transport-envelope'||
             manifest.schema!==1||manifest.groupId!==this.data.groupId)
            throw Error('此目录存在其他 GroupID 的增量 ZIP：'+item.name);
        }else if(T.validAckName(item.name)){
          const target=path.join(dir,item.name),st=fs.lstatSync(target);
          if(st.size<10||st.size>1024*1024)throw Error('旧 ACK 文件大小无效：'+item.name);
          let ack;
          try{ack=JSON.parse(fs.readFileSync(target,'utf8'));}
          catch(_){throw Error('旧 ACK JSON 无法核验：'+item.name);}
          if(ack?.vaultGroupId!==this.data.groupId)
            throw Error('此目录存在其他 GroupID 的 ACK JSON：'+item.name);
        }
      }
    }
    inspectWindowsSpace(dir,{createMarker=false}={}){
      if(!Platform.isDesktopApp)throw Error('只有 Windows 需要设置百度本地同步目录');
      this.assertGroup();
      const fs=require('node:fs'),path=require('node:path');
      const entered=String(dir||'').trim();
      if(!entered)throw Error('请填写百度网盘客户端已同步的本地文件夹');
      if(!path.isAbsolute(entered))throw Error('Windows 同步文件夹必须填写完整绝对路径');
      const full=path.resolve(entered);
      const stat=fs.lstatSync(full);
      if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('同步位置不是普通文件夹');
      const real=fs.realpathSync(full),base=this.app.vault.adapter?.getBasePath?.();
      if(base){
        const root=path.resolve(base),vault=fs.realpathSync(root);
        const nested=(a,b)=>a===b||a.startsWith(b+path.sep)||b.startsWith(a+path.sep);
        if(nested(full,root)||nested(real,vault))
          throw Error('百度同步盘不能位于 Obsidian 知识库内，也不能包含整个知识库');
      }
      // One active binding per device. Moving the SAME folder makes the old
      // path disappear. Copying it into a second live folder is not a move.
      const previous=this.data.windowsCloudActiveRoot?
        path.resolve(this.data.windowsCloudActiveRoot):'';
      if(previous && !sameLocalPath(previous,full) && fs.existsSync(previous))
        throw Error('原同步空间仍位于 '+previous+
          '；不能同时绑定第二个目录。请先移动原文件夹，再指定新位置');
      let identity=this.readWindowsSpaceMarker(full);
      if(identity && identity.groupId!==this.data.groupId)
        throw Error('该文件夹属于另一个 GroupID，禁止混用：'+identity.groupId);
      if(!identity&&previous){
        if(sameLocalPath(previous,full))
          throw Error('已绑定的同步空间身份文件丢失：'+SPACE_MARKER+'。请从百度网盘恢复，禁止自动重新生成');
        throw Error('原群组已有空间身份文件；新位置没有随文件夹一起移动的 '+SPACE_MARKER+
          '，拒绝创建第二个同组空间');
      }
      // Detect copies that are visible beside the configured directory.
      // A whole Baidu Netdisk cloud-wide uniqueness check is not available.
      const siblings=fs.readdirSync(path.dirname(full),{withFileTypes:true});
      if(siblings.length>2000)throw Error('上级目录文件夹过多，无法排查同级重复同步空间');
      for(const item of siblings){
        if(!item.isDirectory()||item.isSymbolicLink()||
           sameLocalPath(path.resolve(path.dirname(full),item.name),full))continue;
        const other=path.resolve(path.dirname(full),item.name);
        const otherMarker=this.readWindowsSpaceMarker(other);
        if(otherMarker?.groupId===this.data.groupId)
          throw Error('在同一同步根目录发现第二个相同 GroupID 的空间：'+other+
            '。请仅保留一个有效云端交换文件夹');
      }
      if(!identity){
        if(!createMarker)throw Error('尚未为此目录生成空间身份文件');
        this.verifyUnmarkedWindowsSpace(full);
        const fresh={format:SPACE_FORMAT,schema:1,groupId:this.data.groupId,
          createdAt:new Date().toISOString(),createdByDeviceId:this.data.deviceId};
        try{fs.writeFileSync(path.join(full,SPACE_MARKER),
          JSON.stringify(fresh,null,2)+'\n',{encoding:'utf8',flag:'wx'});}
        catch(e){if(e.code!=='EEXIST')throw e;}
        identity=this.readWindowsSpaceMarker(full);
        if(!identity||identity.groupId!==this.data.groupId)
          throw Error('空间身份文件写入后核验不通过');
      }
      return {cloud:full,identity};
    }
    async bindWindowsSpace(dir){
      if(!Platform.isDesktopApp)throw Error('移动端目录由插件自动创建，无需设置');
      const {cloud}=this.inspectWindowsSpace(dir,{createMarker:true});
      const path=require('node:path'),fs=require('node:fs');
      const old=this.data.windowsCloudActiveRoot?
        path.resolve(this.data.windowsCloudActiveRoot):'';
      const updates=[];
      if(old && !sameLocalPath(old,cloud)) {
        const entries=[
          ...(this.data.bundleRecords||[]).filter(r=>r.stored?.kind==='cloud').map(r=>({
            object:r.stored,key:'path',hash:r.sha256,
            required:['pending','cloud-confirmed'].includes(r.status)})),
          ...(this.data.inboundRecords||[]).filter(r=>r.kind==='cloud').map(r=>({
            object:r,key:'path',hash:r.sha256,required:r.status==='staged'}))
        ];
        for(const item of entries){
          const current=path.resolve(String(item.object[item.key]||''));
          if(path.dirname(current)!==old)continue;
          const target=path.join(cloud,path.basename(current));
          let exists;
          try{
            const st=fs.lstatSync(target);
            exists=st.isFile()&&!st.isSymbolicLink()&&
              await hex(fs.readFileSync(target))===item.hash;
          }catch(e){if(e.code!=='ENOENT')throw e;exists=false;}
          if(item.required&&!exists)
            throw Error('新目录缺少旧传输文件或 SHA 不匹配：'+path.basename(target)+
              '；移动必须携带原有 ZIP 与 ACK');
          if(exists)updates.push({...item,target});
        }
      }
      // Update records only after every required file passed SHA validation.
      for(const item of updates)item.object[item.key]=item.target;
      const remap=value=>{
        if(!old||!value)return value;
        const entered=path.resolve(String(value));
        return path.dirname(entered)===old?
          path.join(cloud,path.basename(entered)):value;
      };
      this.data.latest=remap(this.data.latest);
      this.data.latestCloudFile=remap(this.data.latestCloudFile);
      this.data.windowsCloudDir=cloud;
      this.data.windowsCloudActiveRoot=cloud;
      if(old && !sameLocalPath(old,cloud))
        this.data.desktopTransportEnabled=false; // Moving pauses observer.
      await this.persistTransport();
      await this.log('空间身份核验','GroupID '+this.data.groupId+
        ' · 身份文件 '+SPACE_MARKER+' · 当前同步盘目录 '+cloud+
        '。目录名称与路径均不参与 GroupID 判断');
      return cloud;
    }
    cloudConfig(){
      if(!Platform.isDesktopApp)throw Error('仅 Windows 使用本地百度同步文件夹');
      const {cloud}=this.inspectWindowsSpace(this.data.windowsCloudDir,
        {createMarker:!this.data.windowsCloudActiveRoot});
      if(this.data.windowsCloudActiveRoot &&
         !sameLocalPath(require('node:path').resolve(this.data.windowsCloudActiveRoot),cloud))
        throw Error('同步位置已变化，必须从控制台重新指定并验证');
      return {cloud};
    }
    async writeOutgoing(name,bytes){
      if(!fileNameOK(name) || !(/\.zip$/i.test(name)||T.validAckName(name)))
        throw Error('输出文件名不安全');
      await this.ensureLayout();
      if(Platform.isDesktopApp){
        if(!this.data.desktopTransportEnabled){
          const stored=await writeChecked(this.app.vault.adapter,ROOT+'/outgoing/'+name,bytes);
          this.data.pendingOutboundFiles ||= {};
          const prior=this.data.pendingOutboundFiles[name];
          if(prior && prior.sha256!==stored.sha256)
            throw Error('待发送队列存在同名不同 SHA 文件，拒绝替换');
          this.data.pendingOutboundFiles[name]={name,path:stored.path,sha256:stored.sha256,at:Date.now()};
          await this.persistTransport();
          await this.log('自动收发暂停 · 本地排队',name+' · SHA '+stored.sha256.slice(0,16)+'…；未写入百度同步目录');
          return {...stored,kind:'vault',queued:true};
        }
        const published=await promoteToCloud(this,name,bytes);
        return {kind:'cloud',path:published.path,sha256:await hex(bytes),created:published.created};
      }
      const stored=await writeChecked(this.app.vault.adapter,ROOT+'/temporary/'+name,bytes);
      return {...stored,kind:'vault'};
    }
    async flushQueuedOutbound(){
      if(!Platform.isDesktopApp||!this.data.desktopTransportEnabled)
        return {paused:true,published:0};
      const queue=this.data.pendingOutboundFiles||{};
      let published=0,duplicates=0;
      for(const [name,entry] of Object.entries(queue)){
        if(!fileNameOK(name)||!entry||entry.path!==ROOT+'/outgoing/'+name ||
           !/^[a-f0-9]{64}$/.test(entry.sha256||''))
          throw Error('本地待发送队列路径或 SHA 记录异常，已暂停自动补发');
        const raw=toBytes(await this.app.vault.adapter.readBinary(entry.path));
        if(raw.length>T.MAX_BUNDLE_BYTES || await hex(raw)!==entry.sha256)
          throw Error('待补发文件大小或 SHA 发生变化：'+name+'；未发布');
        const saved=await promoteToCloud(this,name,raw);
        const record=(this.data.bundleRecords||[]).find(x=>x.name===name && x.sha256===entry.sha256);
        if(record){record.stored={kind:'cloud',path:saved.path};}
        if(this.data.latest===entry.path)this.data.latest=saved.path;
        if((this.data.lastPreparedAckFiles?.paths||[]).includes(entry.path))
          this.data.lastPreparedAckFiles.paths=this.data.lastPreparedAckFiles.paths.map(x=>x===entry.path?saved.path:x);
        delete queue[name];
        if(saved.created)published++;else duplicates++;
        await this.persistTransport();
        await this.log('Windows 自动恢复补发',name+'：已核验 SHA 并'+(saved.created?'写入':'确认已存在于')+'百度本地同步目录；未证明云端上传成功');
      }
      return {published,duplicates};
    }
    async readTransportRecord(rec){
      const ref=rec?.stored||rec;
      if(ref?.kind==='cloud'){
        if(!Platform.isDesktopApp)throw Error('非 Windows 设备禁止读取外部同步目录');
        const fs=require('node:fs'),path=require('node:path');
        const root=this.cloudConfig().cloud,target=path.resolve(String(ref.path||''));
        if(path.dirname(target)!==root || !fileNameOK(path.basename(target)))
          throw Error('传输文件不在已确认的百度同步文件夹');
        const st=fs.lstatSync(target);
        if(!st.isFile()||st.isSymbolicLink()||st.size>T.MAX_BUNDLE_BYTES)
          throw Error('同步目录文件类型异常或超过安全大小上限');
        return toBytes(fs.readFileSync(target));
      }
      if(ref?.kind==='vault' || typeof ref?.path==='string' && ref.path.startsWith(ROOT+'/')){
        if(!/^VaultRelay-Transfer\/(?:outgoing|temporary)\/[^/]+\.(?:zip|json)$/i.test(ref.path||''))
          throw Error('知识库内临时文件路径不安全');
        return toBytes(await this.app.vault.adapter.readBinary(ref.path));
      }
      throw Error('不明的传输文件存储引用');
    }
    async registerWindowsAutoBundle(source,manifest,name,archive,stored){
      const hash=await hex(archive);
      const records=this.data.bundleRecords||[];
      const existing=records.find(x=>x.name===name && x.sha256===hash);
      if(existing)return existing;
      const record=await Lifecycle.collect(this,source.map(x=>({
        name:x.name,bytes:x.data,sha256:x.sha256})),manifest,name,hash,
        {kind:stored.kind,path:stored.path});
      record.sourceFingerprint='auto-'+manifest.bundleId;
      await this.persistTransport();
      return record;
    }
    async scanOutbox(includeAck=false){
      await this.ensureLayout();
      const found=[];
      await T.scanVaultFolder(this.app.vault.adapter,ROOT+'/outbox',found,0);
      return found.filter(x=>includeAck?x.rolePath.startsWith('ack/'):
        /^(content|info)\/.+/.test(x.rolePath));
    }
    async createIncremental({sourceNames=null}={}){
      const group=this.assertGroup();
      if(sourceNames===null)throw Error('必须由本轮核心上传确认返回明确内容包范围，不能扫描历史 outbox 全量封装');
      let candidates=await this.scanOutbox();
      // The native engine may keep many historical, including foreign-device,
      // content ZIPs in outbox. A confirmed upload must package ONLY the native
      // content ZIPs generated by that confirmation, not every history file.
      if(sourceNames!==null){
        const selected=new Set(sourceNames);
        candidates=candidates.filter(x=>selected.has(x.rolePath));
        const present=new Set(candidates.map(x=>x.rolePath));
        for(const name of selected)if(!present.has(name))
          throw Error('本次生成的原生内容包缺失，拒绝退回历史全量封装：'+name);
      }
      if(!candidates.length) {
        await this.log('没有可封装的 content/info','同步核心可能尚未生成交换文件；请使用同步核心上传预览生成正式内容 ZIP');
        return {empty:true};
      }
      const source=[],fingerparts=[];let total=0;
      for(const item of candidates.slice(0,Math.min(T.MAX_FILES-1,95))){
        const raw=toBytes(await item.read()),hash=await hex(raw);
        if(raw.length>T.MAX_ITEM_BYTES)continue;
        if(total+raw.length>T.MAX_BUNDLE_BYTES-100000)break;
        source.push({name:item.rolePath,bytes:raw,sha256:hash});
        fingerparts.push(item.rolePath+':'+hash);total+=raw.length;
      }
      if(!source.length)throw Error('交换文件超过当前增量 ZIP 安全体积限制');
      if(source.length!==candidates.length)throw Error('当前交换文件超出单包数量或大小限制；不能默默丢弃剩余文件，请缩小本次内容并重试');
      fingerparts.sort();
      const fingerprint=await hex(text.encode(group+'|'+fingerparts.join('|')));
      const old=(this.data.bundleRecords||[]).filter(r=>r.sourceFingerprint===fingerprint).slice(-1)[0];
      if(['deleted','cloud-confirmed'].includes(old?.status)) {
        await this.log('增量已完成','对应正式内容已按同步核心 ACK 完成清理；不重新发送');
        return {complete:true};
      }
      if(old?.status==='pending' && old.stored?.path){
        let raw;
        try{raw=await this.readTransportRecord(old);}catch(_){raw=null;}
        if(raw && await hex(raw)===old.sha256){
          this.data.latest=old.stored.path;await this.persistTransport();
          await this.log('复用现有增量 ZIP','SHA 校验通过：'+old.stored.path+'；未重复压缩');
          return {reused:true,path:old.stored.path};
        }
        throw Error('已记录待发送包，但文件缺失或 SHA 改变；拒绝静默重新生成');
      }
      const pendingAcks=await this.pendingNativeAckEntries();
      if(pendingAcks.length+source.length>T.MAX_FILES ||
         pendingAcks.reduce((n,x)=>n+x.bytes.length,0)+total>T.MAX_BUNDLE_BYTES-100000)
        throw Error('本轮内容和 ACK 总数或体积超出单包限制；未发布不完整的混合包');
      source.push(...pendingAcks);
      const manifest={format:'vault-relay-transport-envelope',schema:1,
        bundleId:'br-'+T.timestamp()+'-'+T.randomHex(12),groupId:group,
        vaultName:this.app.vault.getName(),groupName:this.data.groupName||this.app.vault.getName(),
        transportDeviceId:this.data.deviceId,nativeSenderDeviceId:this.engine.state.deviceId,
        platform:Platform.isIosApp?'iOS':Platform.isAndroidApp?'Android':'Windows',
        createdAt:new Date().toISOString(),
        files:source.map(x=>({path:x.name,bytes:x.bytes.length,sha256:x.sha256}))};
      const archive=T.zipEncode([
        {name:'manifest.json',data:text.encode(JSON.stringify(manifest,null,2))},
        ...source.map(x=>({name:x.name,data:x.bytes}))]);
      const filename=T.namedZip(this.data.groupShortName,this.data.deviceShortName);
      const stored=await this.writeOutgoing(filename,archive);
      const rec=await Lifecycle.collect(this,source,manifest,filename,await hex(archive),
        {kind:stored.kind,path:stored.path});
      rec.sourceFingerprint=fingerprint;
      for(const item of pendingAcks){
        this.data.ackTransportLedger[item.name]={mode:'bundle',sha256:item.sha256,
          bundleName:filename,at:Date.now()};
      }
      this.data.latest=stored.path;this.data.latestFingerprint=fingerprint;
      if(Platform.isDesktopApp){
        // Manual packaging already published the engine artifacts. Tell the
        // automatic scanner not to produce a second envelope for the same SHA.
        this.data.desktopLedger ||= {};
        this.data.desktopLedger.lastPublishedSha ||= {};
        for(const item of source)this.data.desktopLedger.lastPublishedSha[item.name]=item.sha256;
      }
      await this.persistTransport();
      await this.log('生成增量 ZIP',stored.path+' · 正文/信息 '+(source.length-pendingAcks.length)+
        ' 个 · 合包 ACK '+pendingAcks.length+' 个 · SHA '+stored.sha256.slice(0,16)+
        '…；'+(stored.queued?'自动收发关闭，仅本地待传':'已写入本地同步目录')+'；尚未证明云端上传成功');
      return {path:stored.path,files:source.length-pendingAcks.length,bundledAcks:pendingAcks.length};
    }
    async publishLatest(){
      this.assertGroup();
      const file=this.data.latest;
      if(!file)throw Error('没有可上传的本机增量 ZIP');
      const rec=this.data.bundleRecords.slice().reverse().find(x=>x.stored?.path===file);
      if(!rec)throw Error('找不到增量 ZIP 的安全版本记录，不能发布');
      const bytes=await this.readTransportRecord(rec);
      if(await hex(bytes)!==rec.sha256)throw Error('增量 ZIP SHA 变化，拒绝发布');
      if(Platform.isDesktopApp){
        if(rec.stored.kind==='cloud'){
          this.data.latestCloudFile=rec.stored.path;
          await this.log('Windows 发送区校验完成',file+' 已直接处于百度同步目录；云端上传成功仍需客户端确认');
          return {path:file,alreadyInMirror:true};
        }
        // Closing automatic transport queues ALL newly confirmed files locally.
        // Never bypass the switch through the manual upload confirmation path.
        if(!this.data.desktopTransportEnabled){
          await this.log('发送暂停',rec.name+' 已安全保存在本地待发送区；重新开启后验证 SHA 补发');
          return {path:rec.stored.path,queued:true};
        }
        // A V4.0.2 installation may still have an unfinished ZIP in outgoing.
        // Copy it once to the new Windows transport area, but never delete the old file.
        const uploaded=await promoteToCloud(this,rec.name,bytes);
        rec.stored={kind:'cloud',path:uploaded.path};
        this.data.latest=uploaded.path;this.data.latestCloudFile=uploaded.path;
        await this.persistTransport();
        await this.log('旧版增量已迁移','已从旧 outgoing 将完成校验的待传 ZIP 发布到 Windows 同步目录；旧文件保留供备份');
        return {path:uploaded.path,migrated:true};
      }
      let location=file;
      if(rec.stored.kind==='vault' && file.startsWith(ROOT+'/outgoing/')){
        // V4.0.2 upgrade: preserve the old file and copy a validated ZIP into
        // the unified temporary workspace before returning the upload path.
        const moved=await writeChecked(this.app.vault.adapter,
          ROOT+'/temporary/'+rec.name,bytes);
        rec.stored.path=moved.path;
        this.data.latest=location=moved.path;
        await this.persistTransport();
      }
      await this.log('移动端待上传','请在百度网盘中从当前知识库/'+location+
        ' 手动选择 ZIP 与 ACK 上传。当前临时区为 temporary；按钮不代表云端上传成功。');
      return {manual:true,path:location};
    }
    async migrateLegacyOutgoing(){
      // V4.0.2 upgrade safety: new outgoing files use temporary (mobile) or
      // the Windows Baidu mirror. Keep the old files untouched as backups.
      this.assertGroup();
      const adapter=this.app.vault.adapter;
      const folder=ROOT+'/outgoing';
      if(!await adapter.exists(folder))return {count:0,acks:[]};
      const list=await adapter.list(folder);
      const state=this.engine?.state;
      let migrated=0;const acks=[];
      for(const file of (list.files||[])){
        if(!file.startsWith(folder+'/'))continue;
        const name=file.slice(folder.length+1);
        if(!fileNameOK(name))continue;
        const data=toBytes(await adapter.readBinary(file));
        if(/\.zip$/i.test(name)){
          const rec=(this.data.bundleRecords||[]).find(x=>
            x.status==='pending'&&x.stored?.kind==='vault'&&x.stored.path===file&&
            x.name===name);
          if(!rec||await hex(data)!==rec.sha256)continue;
          const stored=await this.writeOutgoing(name,data);
          rec.stored={kind:stored.kind,path:stored.path};
          if(this.data.latest===file)this.data.latest=stored.path;
          if(stored.created)migrated++;
        }else if(T.validAckName(name)){
          try{
            const ack=await T.validateRawAck(data,name,this.data.groupId);
            // This folder is an outgoing source; never transfer a foreign ACK.
            if(ack.device!==state?.deviceId)continue;
            const stored=await this.writeOutgoing(name,data);
            acks.push(stored.path);
            if(stored.created)migrated++;
          }catch(_){/* invalid legacy ACK must never be silently published */}
        }
      }
      if(migrated){
        await this.persistTransport();
        await this.log('旧传输文件迁移','已将 '+migrated+
          ' 个经过校验的旧版待传文件复制到新运输区；旧 outgoing 文件保留，未执行删除');
      }
      return {count:migrated,acks};
    }
    async prepareTransferUpload({includeLatest=true}={}){
      this.assertGroup();
      // Do not silently migrate/publish historical outgoing files during a
      // normal confirmation. Only explicitly queued V5.2.3 files resume.
      const legacy={acks:[]};
      let zip=null;
      if(includeLatest && this.data.latest){
        const rec=this.data.bundleRecords.slice().reverse().find(x=>x.stored?.path===this.data.latest);
        if(rec){const bytes=await this.readTransportRecord(rec).catch(()=>null);
          if(bytes && await hex(bytes)===rec.sha256)zip=await this.publishLatest();}
      }
      const acks=[...new Set([...legacy.acks,...await this.exportRawAcks({onlyPending:true})])];
      if(!zip && acks.length===0)
        throw Error('没有需要上传的增量 ZIP 或独立 ACK');
      await this.log('待传文件清单','内容包 '+(zip?1:0)+' 个；独立 ACK '+acks.length+
        ' 个。'+(Platform.isDesktopApp?(this.data.desktopTransportEnabled?
         '已写入本地百度同步目录，云端完成状态仍需确认':
         '自动收发已暂停，文件仅进入本地待发送区；开启后补发'): 
         '请在百度网盘群组文件夹中从 temporary 选择 ZIP/ACK 上传；按钮不代表上传成功'));
      return {zip,acks};
    }
    getAckPublicName(batchId,originDeviceId){
      this.data.ackPublicNames ||= {};
      if(!/^[a-f0-9]{64}$/.test(batchId))throw Error('无效的 ACK 批次标识');
      if(!this.data.ackPublicNames[batchId]){
        // Do not derive a remote device's short name from its untrusted ID.
        // Outbound source must match this device before a public alias is made.
        const own=this.engine?.state?.deviceId;
        if(originDeviceId!==own)throw Error('不能以本机简称发布其他设备的 ACK');
        this.data.ackPublicNames[batchId]=T.namedAck(
          this.data.groupShortName,
          this.data.deviceShortName,batchId);
      }
      return this.data.ackPublicNames[batchId];
    }
    async pendingNativeAckEntries(){
      this.assertGroup();
      const own=this.engine?.state?.deviceId;
      if(!/^vr-[a-z0-9]{16,64}$/.test(own||''))throw Error('本机同步核心 Device ID 不可验证');
      const ledger=this.data.ackTransportLedger ||= {};
      const previous=(this.data.lastPreparedAckFiles?.paths||[]).map(x=>String(x).split(/[\\/]/).pop());
      const result=[];
      for(const x of (await this.scanOutbox(true))){
        if(!x.rolePath.startsWith('ack/'))continue;
        // Other devices' received ACKs belong to receipt/cleanup history.
        // Do not even parse them as our own pending outbound ACK candidates;
        // an unrelated malformed foreign file must not block local publishing.
        if(!x.rolePath.startsWith('ack/'+own+'/'))continue;
        const name=x.rolePath.split('/').pop(),bytes=toBytes(await x.read());
        const ack=await T.validateRawAck(bytes,name,this.data.groupId);
        if(x.rolePath!=='ack/'+own+'/'+ack.canonicalName || ack.device!==own)
          throw Error('本机待发 ACK 来源或标准文件路径不匹配：'+x.rolePath);
        const hash=await hex(bytes),known=ledger[x.rolePath];
        if(known && known.sha256!==hash)
          throw Error('已发送 ACK 路径出现不同字节，已拒绝静默重新发布：'+x.rolePath);
        if(known)continue;
        if(ack.batchId && previous.includes(this.data.ackPublicNames?.[ack.batchId])){
          ledger[x.rolePath]={mode:'legacy-json',sha256:hash,at:Date.now()};
          continue;
        }
        result.push({name:x.rolePath,bytes,sha256:hash,device:ack.device});
        if(result.length>60)throw Error('待回传 ACK 过多，请分批处理，不能遗漏任何确认');
      }
      return result;
    }
    async exportRawAcks({onlyPending=false}={}){
      this.assertGroup();
      const acks=onlyPending?await this.pendingNativeAckEntries():
        (await this.scanOutbox(true)).map(x=>({...x,name:x.rolePath}));
      const result=[];
      for(const x of acks.filter(c=>(c.rolePath||c.name).startsWith('ack/'))){
        const rel=x.rolePath||x.name;
        const name=rel.split('/').pop(),bytes=x.bytes||toBytes(await x.read());
        const ack=await T.validateRawAck(bytes,name,this.data.groupId);
        if(rel!=='ack/'+ack.device+'/'+name ||
           ack.device!==this.engine?.state?.deviceId)
          throw Error('ACK JSON 所属设备路径不匹配：'+rel);
        const publicName=ack.batchId?
          this.getAckPublicName(ack.batchId,ack.device):name;
        const stored=await this.writeOutgoing(publicName,bytes);
        const hash=await hex(bytes);
        this.data.ackTransportLedger ||= {};
        this.data.ackTransportLedger[rel]={mode:'json',sha256:hash,publicName,
          storedPath:stored.path,at:Date.now()};
        result.push(stored.path);
      }
      this.data.lastPreparedAckFiles={at:Date.now(),paths:result.slice(-80)};
      await this.persistTransport();
      await this.log('独立 ACK 已准备',result.length+' 个 JSON 已保存到'+
        (Platform.isDesktopApp?(this.data.desktopTransportEnabled?' Windows 百度本地同步文件夹':' Windows 本地待发送区'):' 知识库 temporary；请从百度网盘 App 手动选择上传')+
        '；没有新正文时直接使用 ACK JSON');
      return result;
    }
    async storeDownloadedZip(file,{externalSource=''}={}){
      this.assertGroup();
      if(!file || !fileNameOK(file.name)|| !/\.zip$/i.test(file.name))throw Error('请选择安全的 ZIP 文件名');
      const report=await importer.inspect(file,{app:this.app,plugin:this,desktop:Platform.isDesktopApp});
      if(report.kind!=='incremental')throw Error('当前下载入口只接受外层增量 ZIP');
      const bytes=toBytes(await file.arrayBuffer());
      if(await hex(bytes)!==report.hash)throw Error('下载文件检查后 SHA 已改变');
      const temporary=externalSource && !Platform.isDesktopApp?
        {path:externalSource,kind:'external'}:
        await writeChecked(this.app.vault.adapter,ROOT+'/temporary/'+file.name,bytes);
      // Before restoring any exchange file, preserve verified contents in staging.
      const bundleId=report.bundleId;
      if(!/^br-[A-Za-z0-9_-]{10,80}$/.test(bundleId))throw Error('bundleId 不合法');
      const plan=[];
      for(const f of report.contents){
        if(!T.safeEntry(f.path))throw Error('增量 ZIP 包含非法路径');
        const target=ROOT+'/staging/'+bundleId+'/'+f.path;
        if(await this.app.vault.adapter.exists(target) &&
           await hex(await this.app.vault.adapter.readBinary(target))!==f.sha256)
          throw Error('staging 存在同名不同内容；未覆盖 '+f.path);
        plan.push({path:target,data:f.data});
      }
      for(const item of plan)await writeChecked(this.app.vault.adapter,item.path,item.data);
      const old=(this.data.inboundRecords||[]).find(x=>x.sha256===report.hash);
      if(!old) {
        this.data.inboundRecords.push({name:file.name,sha256:report.hash,
          path:temporary.path,kind:temporary.kind||
            (Platform.isDesktopApp?'cloud':'vault'),
          bundleId,receivedAt:Date.now(),status:'staged',
          files:report.contents.map(x=>x.path),
          fileHashes:Object.fromEntries(report.contents.map(x=>[x.path,x.sha256]))});
      }else{
        // Upgrade old receipts only AFTER the fresh ZIP has passed all manifest
        // and staging SHA checks. Do not erase status, ACK or historical IDs.
        old.files=report.contents.map(x=>x.path);
        old.fileHashes=Object.fromEntries(report.contents.map(x=>[x.path,x.sha256]));
      }
      await this.persistTransport();
      await this.log('增量 ZIP 校验与暂存',temporary.path+' · '+
        report.contents.length+' 个交换文件已校验 SHA/CRC 并保存到 staging；'+
        (Platform.isDesktopApp?'Windows 使用百度同步盘原始 ZIP，不创建知识库副本；':'')+
        '未修改正式笔记');
      return {report,temporary:temporary.path,bundleId};
    }
    async stageWindowsArchive(name,bytes,manifest,files) {
      this.assertGroup();
      if(!fileNameOK(name)||!/\.zip$/i.test(name))throw Error('接收 ZIP 文件名不安全');
      const originalHash=await hex(bytes);
      const existing=(this.data.inboundRecords||[]).find(x=>x.name===name);
      if(existing && existing.sha256!==originalHash)
        throw Error('同名下载增量 ZIP 的 SHA 改变；拒绝迁移');
      const cloud=this.cloudConfig().cloud;
      const path=require('node:path');
      const mirrored=path.join(cloud,name);
      const live=await this.readTransportRecord({kind:'cloud',path:mirrored});
      if(await hex(live)!==originalHash)
        throw Error('Windows 同步盘 ZIP 接收时发生变化，禁止恢复到版本交换区');
      const archiveId=manifest.bundleId;
      if(!/^br-[A-Za-z0-9_-]{10,80}$/.test(archiveId))throw Error('下载包 ID 非法');
      const planned=[];
      for(const item of manifest.files) {
        if(!T.safeEntry(item.path)||!files.has(item.path))throw Error('解包路径非法');
        const target=ROOT+'/staging/'+archiveId+'/'+item.path;
        const b=files.get(item.path);
        if(await hex(b)!==item.sha256)throw Error('二次校验 SHA 失败');
        if(await this.app.vault.adapter.exists(target) &&
           await hex(await this.app.vault.adapter.readBinary(target))!==item.sha256)
          throw Error('staging 同名文件 SHA 不匹配，拒绝覆盖');
        planned.push({path:target,bytes:b});
      }
      for(const item of planned)await writeChecked(this.app.vault.adapter,item.path,item.bytes);
      if(!existing) {
        this.data.inboundRecords.push({name,sha256:originalHash,path:mirrored,
          kind:'cloud',bundleId:archiveId,receivedAt:Date.now(),status:'staged',
          files:manifest.files.map(x=>x.path)});
        await this.persistTransport();
      }
      return {path:mirrored,sha256:originalHash};
    }
    async markWindowsRestored(name,hash) {
      const rec=this.data.inboundRecords.find(x=>x.name===name && x.sha256===hash);
      if(rec){rec.status='restored';await this.persistTransport();}
    }
    async applyDownloaded(review){
      if(!review?.report)throw Error('尚未选择并验证增量 ZIP');
      if(!this.getLegacy())throw Error('内置同步核心尚未就绪：保留 temporary/staging，不允许跳过笔记审核');
      const ans=await importer.apply(review.report,{app:this.app,plugin:this,desktop:Platform.isDesktopApp});
      const bundledAcks=review.report.contents.filter(x=>x.path.startsWith('ack/'));
      if(bundledAcks.length){
        for(const item of bundledAcks){
          const name=item.path.split('/').pop();
          if(Platform.isDesktopApp){
            if(this.engine?.receiveAck)await this.engine.receiveAck();
          }else if(typeof this.acceptMobileAck==='function'){
            await this.acceptMobileAck({name,arrayBuffer:async()=>T.buffer(item.data)});
          }
        }
        await this.log('混合 ZIP ACK 已处理',bundledAcks.length+' 份原始 ACK 经来源和 SHA 校验，已交同步核心核对；未写入正式笔记');
      }
      const rec=this.data.inboundRecords.find(x=>x.sha256===review.report.hash);
      if(rec)rec.status='restored';
      await this.persistTransport();
      await this.log('交换文件安全恢复','新增 '+ans.added+'，相同跳过 '+ans.skipped+
        '；只恢复到同步核心交换区，由同步核心执行版本、冲突及正式笔记处理');
      return ans;
    }
    async importRawAckFile(file,{externalSource=false}={}){
      this.assertGroup();
      if(!file||!fileNameOK(file.name)||file.size>1024*1024||file.size<10)
        throw Error('独立 ACK JSON 文件名或体积无效');
      const bytes=toBytes(await file.arrayBuffer());
      const ack=await T.validateRawAck(bytes,file.name,this.data.groupId);
      if(this.getLegacy()?.engine?.state?.deviceId===ack.device)
        throw Error('不能将本机自己生成的 ACK 当作远端反馈');
      if(!Platform.isDesktopApp && !externalSource)
        await writeChecked(this.app.vault.adapter,ROOT+'/temporary/'+file.name,bytes);
      if(Platform.isDesktopApp){
        const {fs,path}=T.nodeFiles?T.nodeFiles():{fs:require('node:fs').promises,path:require('node:path')};
        const dir=this.data.windowsLegacyDir;
        if(!dir)throw Error('Windows 同步核心交换目录尚未配置');
        const base=path.resolve(dir),dest=path.join(base,'ack',ack.device,ack.canonicalName);
        const source=path.resolve(base,'ack',ack.device);
        if(!source.startsWith(base+path.sep))throw Error('ACK 路径逃逸');
        let cur=base;
        for(const part of ['ack',ack.device]) {
          cur=path.join(cur,part);try {const stat=await fs.lstat(cur);
            if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('ACK 路径含符号链接');
          } catch(e){if(e.code!=='ENOENT')throw e;}
        }
        await fs.mkdir(source,{recursive:true});
        try {const old=await fs.readFile(dest);
          if(await hex(old)!==await hex(bytes))throw Error('同名 ACK 内容不同');
        }catch(e){if(e.code!=='ENOENT')throw e;await T.exclusiveFinishedWrite(fs,dest,bytes);}
      }else {
        await writeChecked(this.app.vault.adapter,
          ROOT+'/inbox/ack/'+ack.device+'/'+ack.canonicalName,bytes);
      }
      await this.log('独立 ACK 已暂存','SHA 校验通过，已交给同步核心交换区；不代表同步核心已经处理 ACK');
      return ack;
    }
    async cleanupAckConfirmed(){
      this.assertGroup();
      const result=await Lifecycle.cleanup(this,{read:async()=>{throw Error('不支持的存储引用，不能自动清理');}});
      if(result.note)await this.log('ACK 核对',result.note);
      return result;
    }
    async verifyDownloadAckMapping(rec){
      const legacy=this.getLegacy()?.engine?.state;
      const group=this.assertGroup();
      if(!legacy||legacy.groupId!==group||!legacy.deviceId ||
         !legacy.acks || !legacy.publishedAckIds)return {ok:false,reason:'同步核心 ACK 记录不可核对'};
      const adapter=this.app.vault.adapter;
      const original=await this.readTransportRecord({kind:rec.kind||'vault',path:rec.path});
      if(await hex(original)!==rec.sha256)throw Error('下载临时 ZIP SHA 变化，不能清理');
      const contents=T.zipDecode(original);
      const mf=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(contents.get('manifest.json')));
      if(mf.bundleId!==rec.bundleId||mf.groupId!==group||!Array.isArray(mf.files))
        throw Error('下载包清单与清理记录不匹配');
      if(mf.files.some(x=>!T.safeEntry(x.path)||!contents.has(x.path) ||
        !/^(content|info|ack)\/.+/.test(x.path)))return {ok:false,reason:'存在未确认的特殊交换条目'};
      const all=[],senders=new Set();
      for(const file of mf.files.filter(x=>x.path.startsWith('content/'))){
        const bytes=contents.get(file.path);
        if(await hex(bytes)!==file.sha256)throw Error('下载包内容 SHA 校验失败');
        let formal;
        try{formal=await JSZip.loadAsync(bytes,{checkCRC32:true});}
        catch(_){return {ok:false,reason:'正式内容 ZIP 不能解析'};}
        const entry=formal.file('manifest.json');
        if(!entry)return {ok:false,reason:'正式内容 ZIP 无版本清单'};
        let meta;try{meta=JSON.parse(await entry.async('text'));}catch(_){return {ok:false,reason:'正式内容版本清单损坏'};}
        if(meta.format!=='vaultrelay.content.v2'||meta.vaultGroupId!==group||
           !/^vr-[a-z0-9]{16,64}$/.test(meta.originDeviceId||''))
          return {ok:false,reason:'正式内容来源设备无法核对'};
        const parsed=await Lifecycle.versionsFromContent(
          [{name:file.path,bytes}],group,meta.originDeviceId);
        if(!parsed.eligible)return {ok:false,reason:'有正式内容版本无法精确映射到 ACK'};
        senders.add(meta.originDeviceId);
        for(const v of parsed.versions)all.push({...v,from:meta.originDeviceId});
      }
      if(!all.length)return {ok:false,reason:'仅有 info 的增量包没有可验证的内容 ACK，保留临时包'};
      const generated=Object.values(legacy.acks).filter(x=>x && typeof x==='object');
      const originalId=legacy.deviceId;
      const batches=new Set();
      for(const v of all){
        const match=generated.find(a=>a.format==='vaultrelay.ack.v2'&&
          a.vaultGroupId===group&&a.fromDeviceId===originalId&&
          a.toDeviceId===v.from&&a.versionId===v.versionId&&
          a.packId===v.packId&&a.path===v.path&&
          a.contentSha256===v.contentSha256&&
          ['applied','same','equivalent'].includes(a.outcome)&&
          /^[a-f0-9]{64}$/.test(a.ackId||'') &&
          typeof legacy.publishedAckIds[a.ackId]==='string');
        if(!match)return {ok:false,reason:'至少一个版本尚无同步核心已发布的有效 ACK'};
        const fingerprint=await hex(text.encode(group+'|'+v.from+'|'+v.versionId+'|'+
          (v.contentSha256||'delete')+'|'+match.outcome+'|'+originalId));
        if(fingerprint!==match.ackId)return {ok:false,reason:'ACK 指纹与同步核心版本不一致'};
        batches.add(legacy.publishedAckIds[match.ackId]);
      }
      for(const batch of batches){
        if(!/^[a-f0-9]{64}$/.test(batch||''))return {ok:false,reason:'同步核心 ACK 批次标识无效'};
        const name='ackbatch-'+batch+'.json';
        let payload;
        try{
          payload=Platform.isDesktopApp?
            await this.readTransportRecord({kind:'cloud',path:require('node:path').join(this.cloudConfig().cloud,name)}):
            toBytes(await adapter.readBinary(ROOT+'/temporary/'+name));
        }catch(_){
          // A V5.2.3 ACK can be bundled. Prove that its exact SHA occurs in
          // an existing, intact locally saved outbound ZIP. This does not
          // certify that Baidu actually uploaded it; cleanup remains manual.
          const sent=this.data.ackTransportLedger||{};
          const item=Object.entries(sent).find(([p,r])=>p.endsWith('/'+name) && r.mode==='bundle');
          if(!item)return {ok:false,reason:'未找到可校验的待回传 ACK 文件或混合 ZIP'};
          const [p,r]=item;
          const bundle=(this.data.bundleRecords||[]).find(x=>x.name===r.bundleName);
          if(!bundle)return {ok:false,reason:'ACK 混合包的本地版本记录不存在'};
          let original;
          try{original=await this.readTransportRecord(bundle);}catch(_){return {ok:false,reason:'ACK 混合包文件缺失'};}
          if(await hex(original)!==bundle.sha256)return {ok:false,reason:'ACK 混合包 SHA 校验失败'};
          const map=T.zipDecode(original),member=map.get(p);
          if(!member||await hex(member)!==r.sha256)return {ok:false,reason:'混合包 ACK 成员 SHA 校验失败'};
          payload=member;
        }
        await T.validateRawAck(payload,name,group);
      }
      return {ok:true,batches:[...batches],versions:all.length};
    }
    async checkTemporary(deleteConfirmed=false,silent=false){
      this.assertGroup();
      let eligible=0,deleted=0,blocked=0;
      const pending=this.data.inboundRecords.filter(x=>x.status==='restored');
      for(const rec of pending){
        let check;
        try{check=await this.verifyDownloadAckMapping(rec);}
        catch(e){check={ok:false,reason:String(e.message||e)};}
        if(!check.ok){blocked++;rec.lastCleanupMessage=check.reason;continue;}
        if(rec.kind==='external'){
          blocked++;
          rec.lastCleanupMessage='外部下载原件只读接收，永不由插件自动删除；staging 保留';
          continue;
        }
        eligible++;
        if(!deleteConfirmed)continue;
        if(!rec.ackReturnConfirmedAt){
          blocked++;rec.lastCleanupMessage='ACK 回传尚未由用户确认，不允许删除下载原包';
          continue;
        }
        // Deletion is an explicit action after the user confirms external ACK
        // upload/return; a local Baidu mapping alone cannot prove cloud upload.
        const adapter=this.app.vault.adapter;
        const original=await this.readTransportRecord({kind:rec.kind||'vault',path:rec.path});
        if(await hex(original)!==rec.sha256){blocked++;continue;}
        const parsed=T.zipDecode(original);
        const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(parsed.get('manifest.json')));
        if(manifest.bundleId!==rec.bundleId || manifest.groupId!==this.data.groupId ||
           !Array.isArray(manifest.files))throw Error('待清理 ZIP 清单异常，未删除');
        // Preflight all staging copies before removing any. Missing entries can
        // reflect a previously interrupted cleanup, but differing hashes block.
        const stages=[];
        for(const item of manifest.files){
          if(!T.safeEntry(item.path) || !/^(content|info)\/.+/.test(item.path))
            throw Error('staging 路径不在安全白名单');
          const path=ROOT+'/staging/'+rec.bundleId+'/'+item.path;
          if(await adapter.exists(path)){
            if(await hex(await adapter.readBinary(path))!==item.sha256)
              throw Error('staging 副本 SHA 不匹配，拒绝清理');
            stages.push(path);
          }
        }
        for(const path of stages)await adapter.remove(path);
        // Last, delete the original temporary ZIP only when its exact SHA
        // matches the receipt mapping; never touch official inbox/history.
        if(rec.kind==='cloud'){
          // Cloud-synced incoming ZIP must stay available for other receivers.
          // Only verified staging working files may be removed on Windows.
          rec.status='staging-cleaned';rec.stagingCleanedAt=Date.now();
          rec.stageCopiesCleaned=stages.length;deleted++;
        }else{
          if(await hex(await adapter.readBinary(rec.path))!==rec.sha256)
            throw Error('删除前 temporary ZIP SHA 发生变化');
          await adapter.remove(rec.path);
          rec.status='cleaned';rec.cleanedAt=Date.now();rec.stageCopiesCleaned=stages.length;
          deleted++;
        }
      }
      if(deleted)await this.persistTransport();
      if(!silent || deleted || blocked && deleteConfirmed)
        await this.log('下载临时包清理检查','已恢复 '+pending.length+'，有效 ACK 对应 '+eligible+
          '，本次仅清理原始临时 ZIP '+deleted+'，未满足条件 '+blocked+
          '；Windows 仅清理 staging，百度同步目录原始文件保留；移动端清理 temporary；正式笔记和版本历史不删除');
      return {eligible,deleted,blocked,pending:this.data.inboundRecords.filter(x=>
        x.status!=='cleaned'&&x.status!=='staging-cleaned').length};
    }
    async inspectReceivedAckCopies(){
      this.assertGroup();
      const adapter=this.app.vault.adapter;
      const state=this.getLegacy()?.engine?.state;
      if(!state?.receivedAcks)return [];
      const persisted=Object.values(state.receivedAcks).filter(x=>x&&typeof x==='object');
      let paths=[];
      try{
        if(Platform.isDesktopApp){
          const fs=require('node:fs'),path=require('node:path');
          const root=this.cloudConfig().cloud;
          paths=fs.readdirSync(root,{withFileTypes:true})
            .filter(x=>x.isFile()&&!x.isSymbolicLink()&&T.validAckName(x.name))
            .map(x=>path.join(root,x.name));
        }else{
          const listing=await adapter.list(ROOT+'/temporary');
          paths=listing.files||[];
        }
      }catch(_){return [];}
      const rows=[];
      for(const path of paths){
        const name=String(path).split('/').pop();
        if(!T.validAckName(name))continue;
        if(!Platform.isDesktopApp&&!path.startsWith(ROOT+'/temporary/'))continue;
        try{
          const data=await this.readTransportRecord({kind:Platform.isDesktopApp?'cloud':'vault',path});
          const obj=await T.validateRawAck(data,name,this.data.groupId);
          const raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
          const entries=raw.format==='vaultrelay.ack-batch.v2'?raw.entries:[raw];
          if(!Array.isArray(entries)||!entries.length)continue;
          // Every receipt must already exist in the durable native ACK ledger.
          const every=entries.every(e=>e&&e.toDeviceId===state.deviceId &&
            persisted.some(x=>x.ackId===e.ackId &&
              x.fromDeviceId===e.fromDeviceId && x.toDeviceId===e.toDeviceId &&
              x.vaultGroupId===e.vaultGroupId && x.versionId===e.versionId &&
              x.packId===e.packId && x.path===e.path &&
              x.contentSha256===e.contentSha256 && x.outcome===e.outcome));
          const stat=Platform.isDesktopApp?
            require('node:fs').statSync(path):await adapter.stat(path);
          const age=stat?.mtimeMs?Date.now()-stat.mtimeMs:
            stat?.mtime?Date.now()-stat.mtime:0;
          rows.push({kind:'ack',path,size:data.byteLength,cloud:Platform.isDesktopApp,
            sha256:await hex(data),eligible:every && age>=7*86400000,
            reason:!every?'未在正式 ACK 状态中完全核对':
              age<7*86400000?'已核对，但本地副本保留期未满 7 天':
              '所有 ACK 条目已写入持久状态，且原始下载副本保留满 7 天'});
        }catch(_){rows.push({kind:'ack',path,size:0,eligible:false,reason:'ACK 校验不通过，保留'});}
      }
      return rows;
    }
    async inspectCleanup(){
      this.assertGroup();
      const adapter=this.app.vault.adapter;
      const state=this.engine?.state;
      const rows=[];
      for(const rec of this.data.bundleRecords||[]){
        if(!['pending','cloud-confirmed'].includes(rec.status))continue;
        const path=rec.stored?.path||'';
        let eligible=false,reason='尚未收到完整有效 ACK';
        try{
          eligible=!!(state && await Lifecycle.acknowledged(rec,state.receivedAcks,
            this.data.groupId,state.deviceId));
          if(eligible){
            const bytes=await this.readTransportRecord(rec);
            if(await hex(bytes)!==rec.sha256)throw Error('文件 SHA 变化，不能清理');
            const mode=rec.ackPolicy||'all';
            const detail=mode==='any'?'某一接收设备已对本包全部版本有效确认':
              '所有预期接收设备已对本包全部版本有效确认';
            reason=rec.stored?.kind==='cloud'?
              detail+'；此文件位于百度同步盘，自动清理不会删除；手动删除可能同步删除云端':
              detail+'，SHA 未变化';
          }else if(!rec.eligible)reason=rec.reason||'缺少清理映射，继续保留';
        }catch(e){eligible=false;reason=String(e.message||e);}
        rows.push({kind:'outgoing',path,size:0,eligible,cloud:rec.stored?.kind==='cloud',reason});
      }
      for(const rec of this.data.inboundRecords||[]){
        if(rec.status==='cleaned'||rec.status==='staging-cleaned')continue;
        let check={ok:false,reason:'下载文件尚未完成安全恢复'};
        if(rec.status==='restored'){
          try{check=await this.verifyDownloadAckMapping(rec);}
          catch(e){check={ok:false,reason:String(e.message||e)};}
        }
        if(rec.kind==='external'){
          rows.push({kind:'external',path:rec.path,size:0,eligible:false,
            reason:'外部下载文件由手机文件管理器自行管理；插件不删除原件'});
          continue;
        }
        rows.push({kind:rec.kind==='cloud'?'staging':'temporary',path:rec.path,size:0,
          eligible:!!(check.ok && rec.ackReturnConfirmedAt),
          requiresReturnConfirmation:!!(check.ok && !rec.ackReturnConfirmedAt),
          reason:check.ok?(rec.ackReturnConfirmedAt?'ACK 已核对且回传已确认':'ACK 已生成；仍需用户确认确实回传'):
            check.reason});
      }
      rows.push(...await this.inspectReceivedAckCopies());
      return {rows,eligible:rows.filter(x=>x.eligible),blocked:rows.filter(x=>!x.eligible)};
    }
    async confirmEligibleAckReturns(){
      // Only mark incoming packets with a fresh exact engine ACK mapping.
      this.assertGroup();
      let confirmed=0;
      for(const rec of this.data.inboundRecords||[]){
        if(rec.status!=='restored'||rec.ackReturnConfirmedAt)continue;
        const check=await this.verifyDownloadAckMapping(rec).catch(()=>({ok:false}));
        if(check.ok){rec.ackReturnConfirmedAt=Date.now();confirmed++;}
      }
      if(confirmed)await this.persistTransport();
      await this.log('确认 ACK 回传','已标记 '+confirmed+' 个通过版本核对的下载包，可按条件清理');
      return confirmed;
    }
    async removeVerifiedAckCopies(){
      const adapter=this.app.vault.adapter;
      const rows=await this.inspectReceivedAckCopies();
      let deleted=0;
      for(const item of rows.filter(x=>x.eligible)){
        if(item.cloud)continue; // Windows cloud JSON must not be auto-deleted.
        if(!/^VaultRelay-Transfer\/temporary\/[^/]+\.json$/i.test(item.path))continue;
        const raw=toBytes(await adapter.readBinary(item.path));
        if(await hex(raw)!==item.sha256)continue;
        // Revalidate the ledger and the retention time immediately before deletion.
        const latest=(await this.inspectReceivedAckCopies()).find(x=>x.path===item.path);
        if(!latest?.eligible||latest.sha256!==item.sha256)continue;
        await adapter.remove(item.path);
        deleted++;
      }
      if(deleted)await this.log('已清理 ACK 下载副本','已删除 '+deleted+
        ' 个保留满 7 天且持久化确认的临时 JSON；outgoing ACK 与正式历史不删除');
      return deleted;
    }
    async deleteVerifiedCloudCopies(){
      if(!Platform.isDesktopApp)throw Error('仅 Windows 支持同步盘安全清理');
      const fs=require('node:fs').promises,path=require('node:path');
      const cloud=this.cloudConfig().cloud;
      const state=this.engine?.state;
      let sending=0,acks=0;
      for(const rec of this.data.bundleRecords||[]){
        if(rec.status!=='cloud-confirmed'||rec.stored?.kind!=='cloud')continue;
        if(!await Lifecycle.acknowledged(rec,state?.receivedAcks,this.data.groupId,state.deviceId))continue;
        const target=path.resolve(rec.stored.path);
        if(path.dirname(target)!==cloud||path.basename(target)!==rec.name||
           !fileNameOK(rec.name)||!/\.zip$/i.test(rec.name))continue;
        try{
          const before=await fs.lstat(target);
          if(!before.isFile()||before.isSymbolicLink())continue;
          if(await hex(await fs.readFile(target))!==rec.sha256)continue;
          // The user explicitly accepted the risk that this remove propagates
          // to Baidu cloud; verify everything again immediately before unlink.
          if(await hex(await fs.readFile(target))!==rec.sha256)continue;
          await fs.unlink(target);
          rec.status='deleted';rec.deletedAt=Date.now();sending++;
          if(this.data.latest===target)this.data.latest='';
        }catch(e){rec.lastCleanupError=String(e.message||e);}
      }
      const copies=await this.inspectReceivedAckCopies();
      for(const item of copies.filter(x=>x.cloud&&x.eligible)){
        const target=path.resolve(item.path);
        if(path.dirname(target)!==cloud||!T.validAckName(path.basename(target)))continue;
        try{
          const original=await this.readTransportRecord({kind:'cloud',path:target});
          if(await hex(original)!==item.sha256)continue;
          const recent=(await this.inspectReceivedAckCopies()).find(x=>x.path===target);
          if(!recent?.eligible||recent.sha256!==item.sha256)continue;
          await fs.unlink(target);acks++;
        }catch(e){await this.log('云端 ACK 清理保留',String(e.message||e));}
      }
      if(sending||acks)await this.persistTransport();
      await this.log('手动同步盘清理','已经用户额外确认，删除本机百度同步目录中已完整确认的发送 ZIP '+sending+
        ' 个和已持久化 ACK 副本 '+acks+' 个。百度客户端可能把删除同步到云端；待接收 ZIP、待发送 ACK 均未删除');
      return {sending,acks};
    }
    async safeCleanup({automatic=false,allowCloudDeletion=false}={}){
      this.assertGroup();
      const send=await this.cleanupAckConfirmed();
      // Only a separately confirmed return permits the downloaded ZIP or staging
      // copies to be cleaned. Cloud-received ZIPs remain in the sync directory.
      const hasConfirmed=(this.data.inboundRecords||[]).some(x=>
        x.status==='restored'&&x.ackReturnConfirmedAt);
      const received=hasConfirmed ? await this.checkTemporary(true,true):{deleted:0};
      const ack=await this.removeVerifiedAckCopies();
      let cloud={sending:0,acks:0};
      if(!automatic&&allowCloudDeletion&&Platform.isDesktopApp)
        cloud=await this.deleteVerifiedCloudCopies();
      if(!automatic)await this.log('安全清理结果',
        '本地发送 ZIP '+send.deleted+'，下载 ZIP / staging '+received.deleted+
        '，手机 ACK 副本 '+ack+'；Windows 用户明确确认后同步盘发送 ZIP '+cloud.sending+
        '、已消费 ACK '+cloud.acks+'；其余文件均保留');
      return {sending:(send.deleted||0)+cloud.sending,downloads:received.deleted||0,
        acks:ack+cloud.acks,cloud:cloud.sending+cloud.acks};
    }
    async exportVault(){this.assertVault();const result=await importer.exportVault({app:this.app,plugin:this,desktop:Platform.isDesktopApp});await this.log('导出知识库',result.path+' · '+result.files+' 个文件');return result;}
    async importOther(file){this.assertGroup();const report=await importer.inspect(file,{app:this.app,plugin:this,desktop:Platform.isDesktopApp});if(report.kind==='incremental')throw Error('增量 ZIP 请用“选择已下载增量 ZIP”');return report;}
    async applyOther(report){this.assertGroup();if(!this.getLegacy()&&report.kind==='formal')throw Error('同步核心未启用，禁止将正式交换包当作笔记直接导入');const result=await importer.apply(report,{app:this.app,plugin:this,desktop:Platform.isDesktopApp});await this.log('导入知识库','新增 '+result.added+' · 相同跳过 '+result.skipped);return result;}
    describeDesktopScan(result){
      if(!result||typeof result!=='object')return '检查已执行；详细状态请导出诊断日志';
      const groups=[];
      for(const [key,label] of [['received','接收'],['sent','发送'],['copied','复制'],
        ['acks','ACK'],['skipped','跳过'],['errors','异常'],['deleted','已清理']]){
        const x=result[key];
        if(typeof x==='number')groups.push(label+' '+x);
        else if(x&&typeof x==='object'){
          for(const [name,value] of Object.entries(x))if(typeof value==='number')
            groups.push(label+'/'+name+' '+value);
        }
      }
      return groups.length?groups.join('，'):'已检查本地同步目录；没有可展示的数量变化';
    }
    async monitor(){
      if(!this.data.desktopTransportEnabled||!this.agent)return;
      try{this.assertGroup();await this.flushQueuedOutbound();const result=await this.agent.tick();if(result)await this.log('Windows 自动运输完成',this.describeDesktopScan(result));}
      catch(e){const msg=String(e.message||e);if(this.lastMonitorError!==msg){this.lastMonitorError=msg;await this.log('自动运输异常',msg);}}
    }
  };
}
module.exports={createUnifiedPlugin};

return module.exports;
}

function loadNativeWindows(){
const module={exports:{}};
/* Vault Relay 4.0 · desktop core */
/* JSZip v3.10.1: MIT/GPL dual license, see THIRD_PARTY_LICENSES.md */
const VRI_ZIP = (function(){const module={exports:{}};const exports=module.exports;
const setImmediate=typeof globalThis.setImmediate==='function'?globalThis.setImmediate.bind(globalThis):(fn,...args)=>setTimeout(()=>fn(...args),0);
/*!

JSZip v3.10.1 - A JavaScript class for generating and reading zip files
<http://stuartk.com/jszip>

(c) 2009-2016 Stuart Knightley <stuart [at] stuartk.com>
Dual licenced under the MIT license or GPLv3. See https://raw.github.com/Stuk/jszip/main/LICENSE.markdown.

JSZip uses the library pako released under the MIT license :
https://github.com/nodeca/pako/blob/main/LICENSE
*/

!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{("undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:this).JSZip=e()}}(function(){return function s(a,o,h){function u(r,e){if(!o[r]){if(!a[r]){var t="function"==typeof require&&require;if(!e&&t)return t(r,!0);if(l)return l(r,!0);var n=new Error("Cannot find module '"+r+"'");throw n.code="MODULE_NOT_FOUND",n}var i=o[r]={exports:{}};a[r][0].call(i.exports,function(e){var t=a[r][1][e];return u(t||e)},i,i.exports,s,a,o,h)}return o[r].exports}for(var l="function"==typeof require&&require,e=0;e<h.length;e++)u(h[e]);return u}({1:[function(e,t,r){"use strict";var d=e("./utils"),c=e("./support"),p="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";r.encode=function(e){for(var t,r,n,i,s,a,o,h=[],u=0,l=e.length,f=l,c="string"!==d.getTypeOf(e);u<e.length;)f=l-u,n=c?(t=e[u++],r=u<l?e[u++]:0,u<l?e[u++]:0):(t=e.charCodeAt(u++),r=u<l?e.charCodeAt(u++):0,u<l?e.charCodeAt(u++):0),i=t>>2,s=(3&t)<<4|r>>4,a=1<f?(15&r)<<2|n>>6:64,o=2<f?63&n:64,h.push(p.charAt(i)+p.charAt(s)+p.charAt(a)+p.charAt(o));return h.join("")},r.decode=function(e){var t,r,n,i,s,a,o=0,h=0,u="data:";if(e.substr(0,u.length)===u)throw new Error("Invalid base64 input, it looks like a data url.");var l,f=3*(e=e.replace(/[^A-Za-z0-9+/=]/g,"")).length/4;if(e.charAt(e.length-1)===p.charAt(64)&&f--,e.charAt(e.length-2)===p.charAt(64)&&f--,f%1!=0)throw new Error("Invalid base64 input, bad content length.");for(l=c.uint8array?new Uint8Array(0|f):new Array(0|f);o<e.length;)t=p.indexOf(e.charAt(o++))<<2|(i=p.indexOf(e.charAt(o++)))>>4,r=(15&i)<<4|(s=p.indexOf(e.charAt(o++)))>>2,n=(3&s)<<6|(a=p.indexOf(e.charAt(o++))),l[h++]=t,64!==s&&(l[h++]=r),64!==a&&(l[h++]=n);return l}},{"./support":30,"./utils":32}],2:[function(e,t,r){"use strict";var n=e("./external"),i=e("./stream/DataWorker"),s=e("./stream/Crc32Probe"),a=e("./stream/DataLengthProbe");function o(e,t,r,n,i){this.compressedSize=e,this.uncompressedSize=t,this.crc32=r,this.compression=n,this.compressedContent=i}o.prototype={getContentWorker:function(){var e=new i(n.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new a("data_length")),t=this;return e.on("end",function(){if(this.streamInfo.data_length!==t.uncompressedSize)throw new Error("Bug : uncompressed data size mismatch")}),e},getCompressedWorker:function(){return new i(n.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize",this.compressedSize).withStreamInfo("uncompressedSize",this.uncompressedSize).withStreamInfo("crc32",this.crc32).withStreamInfo("compression",this.compression)}},o.createWorkerFrom=function(e,t,r){return e.pipe(new s).pipe(new a("uncompressedSize")).pipe(t.compressWorker(r)).pipe(new a("compressedSize")).withStreamInfo("compression",t)},t.exports=o},{"./external":6,"./stream/Crc32Probe":25,"./stream/DataLengthProbe":26,"./stream/DataWorker":27}],3:[function(e,t,r){"use strict";var n=e("./stream/GenericWorker");r.STORE={magic:"\0\0",compressWorker:function(){return new n("STORE compression")},uncompressWorker:function(){return new n("STORE decompression")}},r.DEFLATE=e("./flate")},{"./flate":7,"./stream/GenericWorker":28}],4:[function(e,t,r){"use strict";var n=e("./utils");var o=function(){for(var e,t=[],r=0;r<256;r++){e=r;for(var n=0;n<8;n++)e=1&e?3988292384^e>>>1:e>>>1;t[r]=e}return t}();t.exports=function(e,t){return void 0!==e&&e.length?"string"!==n.getTypeOf(e)?function(e,t,r,n){var i=o,s=n+r;e^=-1;for(var a=n;a<s;a++)e=e>>>8^i[255&(e^t[a])];return-1^e}(0|t,e,e.length,0):function(e,t,r,n){var i=o,s=n+r;e^=-1;for(var a=n;a<s;a++)e=e>>>8^i[255&(e^t.charCodeAt(a))];return-1^e}(0|t,e,e.length,0):0}},{"./utils":32}],5:[function(e,t,r){"use strict";r.base64=!1,r.binary=!1,r.dir=!1,r.createFolders=!0,r.date=null,r.compression=null,r.compressionOptions=null,r.comment=null,r.unixPermissions=null,r.dosPermissions=null},{}],6:[function(e,t,r){"use strict";var n=null;n="undefined"!=typeof Promise?Promise:e("lie"),t.exports={Promise:n}},{lie:37}],7:[function(e,t,r){"use strict";var n="undefined"!=typeof Uint8Array&&"undefined"!=typeof Uint16Array&&"undefined"!=typeof Uint32Array,i=e("pako"),s=e("./utils"),a=e("./stream/GenericWorker"),o=n?"uint8array":"array";function h(e,t){a.call(this,"FlateWorker/"+e),this._pako=null,this._pakoAction=e,this._pakoOptions=t,this.meta={}}r.magic="\b\0",s.inherits(h,a),h.prototype.processChunk=function(e){this.meta=e.meta,null===this._pako&&this._createPako(),this._pako.push(s.transformTo(o,e.data),!1)},h.prototype.flush=function(){a.prototype.flush.call(this),null===this._pako&&this._createPako(),this._pako.push([],!0)},h.prototype.cleanUp=function(){a.prototype.cleanUp.call(this),this._pako=null},h.prototype._createPako=function(){this._pako=new i[this._pakoAction]({raw:!0,level:this._pakoOptions.level||-1});var t=this;this._pako.onData=function(e){t.push({data:e,meta:t.meta})}},r.compressWorker=function(e){return new h("Deflate",e)},r.uncompressWorker=function(){return new h("Inflate",{})}},{"./stream/GenericWorker":28,"./utils":32,pako:38}],8:[function(e,t,r){"use strict";function A(e,t){var r,n="";for(r=0;r<t;r++)n+=String.fromCharCode(255&e),e>>>=8;return n}function n(e,t,r,n,i,s){var a,o,h=e.file,u=e.compression,l=s!==O.utf8encode,f=I.transformTo("string",s(h.name)),c=I.transformTo("string",O.utf8encode(h.name)),d=h.comment,p=I.transformTo("string",s(d)),m=I.transformTo("string",O.utf8encode(d)),_=c.length!==h.name.length,g=m.length!==d.length,b="",v="",y="",w=h.dir,k=h.date,x={crc32:0,compressedSize:0,uncompressedSize:0};t&&!r||(x.crc32=e.crc32,x.compressedSize=e.compressedSize,x.uncompressedSize=e.uncompressedSize);var S=0;t&&(S|=8),l||!_&&!g||(S|=2048);var z=0,C=0;w&&(z|=16),"UNIX"===i?(C=798,z|=function(e,t){var r=e;return e||(r=t?16893:33204),(65535&r)<<16}(h.unixPermissions,w)):(C=20,z|=function(e){return 63&(e||0)}(h.dosPermissions)),a=k.getUTCHours(),a<<=6,a|=k.getUTCMinutes(),a<<=5,a|=k.getUTCSeconds()/2,o=k.getUTCFullYear()-1980,o<<=4,o|=k.getUTCMonth()+1,o<<=5,o|=k.getUTCDate(),_&&(v=A(1,1)+A(B(f),4)+c,b+="up"+A(v.length,2)+v),g&&(y=A(1,1)+A(B(p),4)+m,b+="uc"+A(y.length,2)+y);var E="";return E+="\n\0",E+=A(S,2),E+=u.magic,E+=A(a,2),E+=A(o,2),E+=A(x.crc32,4),E+=A(x.compressedSize,4),E+=A(x.uncompressedSize,4),E+=A(f.length,2),E+=A(b.length,2),{fileRecord:R.LOCAL_FILE_HEADER+E+f+b,dirRecord:R.CENTRAL_FILE_HEADER+A(C,2)+E+A(p.length,2)+"\0\0\0\0"+A(z,4)+A(n,4)+f+b+p}}var I=e("../utils"),i=e("../stream/GenericWorker"),O=e("../utf8"),B=e("../crc32"),R=e("../signature");function s(e,t,r,n){i.call(this,"ZipFileWorker"),this.bytesWritten=0,this.zipComment=t,this.zipPlatform=r,this.encodeFileName=n,this.streamFiles=e,this.accumulate=!1,this.contentBuffer=[],this.dirRecords=[],this.currentSourceOffset=0,this.entriesCount=0,this.currentFile=null,this._sources=[]}I.inherits(s,i),s.prototype.push=function(e){var t=e.meta.percent||0,r=this.entriesCount,n=this._sources.length;this.accumulate?this.contentBuffer.push(e):(this.bytesWritten+=e.data.length,i.prototype.push.call(this,{data:e.data,meta:{currentFile:this.currentFile,percent:r?(t+100*(r-n-1))/r:100}}))},s.prototype.openedSource=function(e){this.currentSourceOffset=this.bytesWritten,this.currentFile=e.file.name;var t=this.streamFiles&&!e.file.dir;if(t){var r=n(e,t,!1,this.currentSourceOffset,this.zipPlatform,this.encodeFileName);this.push({data:r.fileRecord,meta:{percent:0}})}else this.accumulate=!0},s.prototype.closedSource=function(e){this.accumulate=!1;var t=this.streamFiles&&!e.file.dir,r=n(e,t,!0,this.currentSourceOffset,this.zipPlatform,this.encodeFileName);if(this.dirRecords.push(r.dirRecord),t)this.push({data:function(e){return R.DATA_DESCRIPTOR+A(e.crc32,4)+A(e.compressedSize,4)+A(e.uncompressedSize,4)}(e),meta:{percent:100}});else for(this.push({data:r.fileRecord,meta:{percent:0}});this.contentBuffer.length;)this.push(this.contentBuffer.shift());this.currentFile=null},s.prototype.flush=function(){for(var e=this.bytesWritten,t=0;t<this.dirRecords.length;t++)this.push({data:this.dirRecords[t],meta:{percent:100}});var r=this.bytesWritten-e,n=function(e,t,r,n,i){var s=I.transformTo("string",i(n));return R.CENTRAL_DIRECTORY_END+"\0\0\0\0"+A(e,2)+A(e,2)+A(t,4)+A(r,4)+A(s.length,2)+s}(this.dirRecords.length,r,e,this.zipComment,this.encodeFileName);this.push({data:n,meta:{percent:100}})},s.prototype.prepareNextSource=function(){this.previous=this._sources.shift(),this.openedSource(this.previous.streamInfo),this.isPaused?this.previous.pause():this.previous.resume()},s.prototype.registerPrevious=function(e){this._sources.push(e);var t=this;return e.on("data",function(e){t.processChunk(e)}),e.on("end",function(){t.closedSource(t.previous.streamInfo),t._sources.length?t.prepareNextSource():t.end()}),e.on("error",function(e){t.error(e)}),this},s.prototype.resume=function(){return!!i.prototype.resume.call(this)&&(!this.previous&&this._sources.length?(this.prepareNextSource(),!0):this.previous||this._sources.length||this.generatedError?void 0:(this.end(),!0))},s.prototype.error=function(e){var t=this._sources;if(!i.prototype.error.call(this,e))return!1;for(var r=0;r<t.length;r++)try{t[r].error(e)}catch(e){}return!0},s.prototype.lock=function(){i.prototype.lock.call(this);for(var e=this._sources,t=0;t<e.length;t++)e[t].lock()},t.exports=s},{"../crc32":4,"../signature":23,"../stream/GenericWorker":28,"../utf8":31,"../utils":32}],9:[function(e,t,r){"use strict";var u=e("../compressions"),n=e("./ZipFileWorker");r.generateWorker=function(e,a,t){var o=new n(a.streamFiles,t,a.platform,a.encodeFileName),h=0;try{e.forEach(function(e,t){h++;var r=function(e,t){var r=e||t,n=u[r];if(!n)throw new Error(r+" is not a valid compression method !");return n}(t.options.compression,a.compression),n=t.options.compressionOptions||a.compressionOptions||{},i=t.dir,s=t.date;t._compressWorker(r,n).withStreamInfo("file",{name:e,dir:i,date:s,comment:t.comment||"",unixPermissions:t.unixPermissions,dosPermissions:t.dosPermissions}).pipe(o)}),o.entriesCount=h}catch(e){o.error(e)}return o}},{"../compressions":3,"./ZipFileWorker":8}],10:[function(e,t,r){"use strict";function n(){if(!(this instanceof n))return new n;if(arguments.length)throw new Error("The constructor with parameters has been removed in JSZip 3.0, please check the upgrade guide.");this.files=Object.create(null),this.comment=null,this.root="",this.clone=function(){var e=new n;for(var t in this)"function"!=typeof this[t]&&(e[t]=this[t]);return e}}(n.prototype=e("./object")).loadAsync=e("./load"),n.support=e("./support"),n.defaults=e("./defaults"),n.version="3.10.1",n.loadAsync=function(e,t){return(new n).loadAsync(e,t)},n.external=e("./external"),t.exports=n},{"./defaults":5,"./external":6,"./load":11,"./object":15,"./support":30}],11:[function(e,t,r){"use strict";var u=e("./utils"),i=e("./external"),n=e("./utf8"),s=e("./zipEntries"),a=e("./stream/Crc32Probe"),l=e("./nodejsUtils");function f(n){return new i.Promise(function(e,t){var r=n.decompressed.getContentWorker().pipe(new a);r.on("error",function(e){t(e)}).on("end",function(){r.streamInfo.crc32!==n.decompressed.crc32?t(new Error("Corrupted zip : CRC32 mismatch")):e()}).resume()})}t.exports=function(e,o){var h=this;return o=u.extend(o||{},{base64:!1,checkCRC32:!1,optimizedBinaryString:!1,createFolders:!1,decodeFileName:n.utf8decode}),l.isNode&&l.isStream(e)?i.Promise.reject(new Error("JSZip can't accept a stream when loading a zip file.")):u.prepareContent("the loaded zip file",e,!0,o.optimizedBinaryString,o.base64).then(function(e){var t=new s(o);return t.load(e),t}).then(function(e){var t=[i.Promise.resolve(e)],r=e.files;if(o.checkCRC32)for(var n=0;n<r.length;n++)t.push(f(r[n]));return i.Promise.all(t)}).then(function(e){for(var t=e.shift(),r=t.files,n=0;n<r.length;n++){var i=r[n],s=i.fileNameStr,a=u.resolve(i.fileNameStr);h.file(a,i.decompressed,{binary:!0,optimizedBinaryString:!0,date:i.date,dir:i.dir,comment:i.fileCommentStr.length?i.fileCommentStr:null,unixPermissions:i.unixPermissions,dosPermissions:i.dosPermissions,createFolders:o.createFolders}),i.dir||(h.file(a).unsafeOriginalName=s)}return t.zipComment.length&&(h.comment=t.zipComment),h})}},{"./external":6,"./nodejsUtils":14,"./stream/Crc32Probe":25,"./utf8":31,"./utils":32,"./zipEntries":33}],12:[function(e,t,r){"use strict";var n=e("../utils"),i=e("../stream/GenericWorker");function s(e,t){i.call(this,"Nodejs stream input adapter for "+e),this._upstreamEnded=!1,this._bindStream(t)}n.inherits(s,i),s.prototype._bindStream=function(e){var t=this;(this._stream=e).pause(),e.on("data",function(e){t.push({data:e,meta:{percent:0}})}).on("error",function(e){t.isPaused?this.generatedError=e:t.error(e)}).on("end",function(){t.isPaused?t._upstreamEnded=!0:t.end()})},s.prototype.pause=function(){return!!i.prototype.pause.call(this)&&(this._stream.pause(),!0)},s.prototype.resume=function(){return!!i.prototype.resume.call(this)&&(this._upstreamEnded?this.end():this._stream.resume(),!0)},t.exports=s},{"../stream/GenericWorker":28,"../utils":32}],13:[function(e,t,r){"use strict";var i=e("readable-stream").Readable;function n(e,t,r){i.call(this,t),this._helper=e;var n=this;e.on("data",function(e,t){n.push(e)||n._helper.pause(),r&&r(t)}).on("error",function(e){n.emit("error",e)}).on("end",function(){n.push(null)})}e("../utils").inherits(n,i),n.prototype._read=function(){this._helper.resume()},t.exports=n},{"../utils":32,"readable-stream":16}],14:[function(e,t,r){"use strict";t.exports={isNode:"undefined"!=typeof Buffer,newBufferFrom:function(e,t){if(Buffer.from&&Buffer.from!==Uint8Array.from)return Buffer.from(e,t);if("number"==typeof e)throw new Error('The "data" argument must not be a number');return new Buffer(e,t)},allocBuffer:function(e){if(Buffer.alloc)return Buffer.alloc(e);var t=new Buffer(e);return t.fill(0),t},isBuffer:function(e){return Buffer.isBuffer(e)},isStream:function(e){return e&&"function"==typeof e.on&&"function"==typeof e.pause&&"function"==typeof e.resume}}},{}],15:[function(e,t,r){"use strict";function s(e,t,r){var n,i=u.getTypeOf(t),s=u.extend(r||{},f);s.date=s.date||new Date,null!==s.compression&&(s.compression=s.compression.toUpperCase()),"string"==typeof s.unixPermissions&&(s.unixPermissions=parseInt(s.unixPermissions,8)),s.unixPermissions&&16384&s.unixPermissions&&(s.dir=!0),s.dosPermissions&&16&s.dosPermissions&&(s.dir=!0),s.dir&&(e=g(e)),s.createFolders&&(n=_(e))&&b.call(this,n,!0);var a="string"===i&&!1===s.binary&&!1===s.base64;r&&void 0!==r.binary||(s.binary=!a),(t instanceof c&&0===t.uncompressedSize||s.dir||!t||0===t.length)&&(s.base64=!1,s.binary=!0,t="",s.compression="STORE",i="string");var o=null;o=t instanceof c||t instanceof l?t:p.isNode&&p.isStream(t)?new m(e,t):u.prepareContent(e,t,s.binary,s.optimizedBinaryString,s.base64);var h=new d(e,o,s);this.files[e]=h}var i=e("./utf8"),u=e("./utils"),l=e("./stream/GenericWorker"),a=e("./stream/StreamHelper"),f=e("./defaults"),c=e("./compressedObject"),d=e("./zipObject"),o=e("./generate"),p=e("./nodejsUtils"),m=e("./nodejs/NodejsStreamInputAdapter"),_=function(e){"/"===e.slice(-1)&&(e=e.substring(0,e.length-1));var t=e.lastIndexOf("/");return 0<t?e.substring(0,t):""},g=function(e){return"/"!==e.slice(-1)&&(e+="/"),e},b=function(e,t){return t=void 0!==t?t:f.createFolders,e=g(e),this.files[e]||s.call(this,e,null,{dir:!0,createFolders:t}),this.files[e]};function h(e){return"[object RegExp]"===Object.prototype.toString.call(e)}var n={load:function(){throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")},forEach:function(e){var t,r,n;for(t in this.files)n=this.files[t],(r=t.slice(this.root.length,t.length))&&t.slice(0,this.root.length)===this.root&&e(r,n)},filter:function(r){var n=[];return this.forEach(function(e,t){r(e,t)&&n.push(t)}),n},file:function(e,t,r){if(1!==arguments.length)return e=this.root+e,s.call(this,e,t,r),this;if(h(e)){var n=e;return this.filter(function(e,t){return!t.dir&&n.test(e)})}var i=this.files[this.root+e];return i&&!i.dir?i:null},folder:function(r){if(!r)return this;if(h(r))return this.filter(function(e,t){return t.dir&&r.test(e)});var e=this.root+r,t=b.call(this,e),n=this.clone();return n.root=t.name,n},remove:function(r){r=this.root+r;var e=this.files[r];if(e||("/"!==r.slice(-1)&&(r+="/"),e=this.files[r]),e&&!e.dir)delete this.files[r];else for(var t=this.filter(function(e,t){return t.name.slice(0,r.length)===r}),n=0;n<t.length;n++)delete this.files[t[n].name];return this},generate:function(){throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")},generateInternalStream:function(e){var t,r={};try{if((r=u.extend(e||{},{streamFiles:!1,compression:"STORE",compressionOptions:null,type:"",platform:"DOS",comment:null,mimeType:"application/zip",encodeFileName:i.utf8encode})).type=r.type.toLowerCase(),r.compression=r.compression.toUpperCase(),"binarystring"===r.type&&(r.type="string"),!r.type)throw new Error("No output type specified.");u.checkSupport(r.type),"darwin"!==r.platform&&"freebsd"!==r.platform&&"linux"!==r.platform&&"sunos"!==r.platform||(r.platform="UNIX"),"win32"===r.platform&&(r.platform="DOS");var n=r.comment||this.comment||"";t=o.generateWorker(this,r,n)}catch(e){(t=new l("error")).error(e)}return new a(t,r.type||"string",r.mimeType)},generateAsync:function(e,t){return this.generateInternalStream(e).accumulate(t)},generateNodeStream:function(e,t){return(e=e||{}).type||(e.type="nodebuffer"),this.generateInternalStream(e).toNodejsStream(t)}};t.exports=n},{"./compressedObject":2,"./defaults":5,"./generate":9,"./nodejs/NodejsStreamInputAdapter":12,"./nodejsUtils":14,"./stream/GenericWorker":28,"./stream/StreamHelper":29,"./utf8":31,"./utils":32,"./zipObject":35}],16:[function(e,t,r){"use strict";t.exports=e("stream")},{stream:void 0}],17:[function(e,t,r){"use strict";var n=e("./DataReader");function i(e){n.call(this,e);for(var t=0;t<this.data.length;t++)e[t]=255&e[t]}e("../utils").inherits(i,n),i.prototype.byteAt=function(e){return this.data[this.zero+e]},i.prototype.lastIndexOfSignature=function(e){for(var t=e.charCodeAt(0),r=e.charCodeAt(1),n=e.charCodeAt(2),i=e.charCodeAt(3),s=this.length-4;0<=s;--s)if(this.data[s]===t&&this.data[s+1]===r&&this.data[s+2]===n&&this.data[s+3]===i)return s-this.zero;return-1},i.prototype.readAndCheckSignature=function(e){var t=e.charCodeAt(0),r=e.charCodeAt(1),n=e.charCodeAt(2),i=e.charCodeAt(3),s=this.readData(4);return t===s[0]&&r===s[1]&&n===s[2]&&i===s[3]},i.prototype.readData=function(e){if(this.checkOffset(e),0===e)return[];var t=this.data.slice(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./DataReader":18}],18:[function(e,t,r){"use strict";var n=e("../utils");function i(e){this.data=e,this.length=e.length,this.index=0,this.zero=0}i.prototype={checkOffset:function(e){this.checkIndex(this.index+e)},checkIndex:function(e){if(this.length<this.zero+e||e<0)throw new Error("End of data reached (data length = "+this.length+", asked index = "+e+"). Corrupted zip ?")},setIndex:function(e){this.checkIndex(e),this.index=e},skip:function(e){this.setIndex(this.index+e)},byteAt:function(){},readInt:function(e){var t,r=0;for(this.checkOffset(e),t=this.index+e-1;t>=this.index;t--)r=(r<<8)+this.byteAt(t);return this.index+=e,r},readString:function(e){return n.transformTo("string",this.readData(e))},readData:function(){},lastIndexOfSignature:function(){},readAndCheckSignature:function(){},readDate:function(){var e=this.readInt(4);return new Date(Date.UTC(1980+(e>>25&127),(e>>21&15)-1,e>>16&31,e>>11&31,e>>5&63,(31&e)<<1))}},t.exports=i},{"../utils":32}],19:[function(e,t,r){"use strict";var n=e("./Uint8ArrayReader");function i(e){n.call(this,e)}e("../utils").inherits(i,n),i.prototype.readData=function(e){this.checkOffset(e);var t=this.data.slice(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./Uint8ArrayReader":21}],20:[function(e,t,r){"use strict";var n=e("./DataReader");function i(e){n.call(this,e)}e("../utils").inherits(i,n),i.prototype.byteAt=function(e){return this.data.charCodeAt(this.zero+e)},i.prototype.lastIndexOfSignature=function(e){return this.data.lastIndexOf(e)-this.zero},i.prototype.readAndCheckSignature=function(e){return e===this.readData(4)},i.prototype.readData=function(e){this.checkOffset(e);var t=this.data.slice(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./DataReader":18}],21:[function(e,t,r){"use strict";var n=e("./ArrayReader");function i(e){n.call(this,e)}e("../utils").inherits(i,n),i.prototype.readData=function(e){if(this.checkOffset(e),0===e)return new Uint8Array(0);var t=this.data.subarray(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./ArrayReader":17}],22:[function(e,t,r){"use strict";var n=e("../utils"),i=e("../support"),s=e("./ArrayReader"),a=e("./StringReader"),o=e("./NodeBufferReader"),h=e("./Uint8ArrayReader");t.exports=function(e){var t=n.getTypeOf(e);return n.checkSupport(t),"string"!==t||i.uint8array?"nodebuffer"===t?new o(e):i.uint8array?new h(n.transformTo("uint8array",e)):new s(n.transformTo("array",e)):new a(e)}},{"../support":30,"../utils":32,"./ArrayReader":17,"./NodeBufferReader":19,"./StringReader":20,"./Uint8ArrayReader":21}],23:[function(e,t,r){"use strict";r.LOCAL_FILE_HEADER="PK",r.CENTRAL_FILE_HEADER="PK",r.CENTRAL_DIRECTORY_END="PK",r.ZIP64_CENTRAL_DIRECTORY_LOCATOR="PK",r.ZIP64_CENTRAL_DIRECTORY_END="PK",r.DATA_DESCRIPTOR="PK\b"},{}],24:[function(e,t,r){"use strict";var n=e("./GenericWorker"),i=e("../utils");function s(e){n.call(this,"ConvertWorker to "+e),this.destType=e}i.inherits(s,n),s.prototype.processChunk=function(e){this.push({data:i.transformTo(this.destType,e.data),meta:e.meta})},t.exports=s},{"../utils":32,"./GenericWorker":28}],25:[function(e,t,r){"use strict";var n=e("./GenericWorker"),i=e("../crc32");function s(){n.call(this,"Crc32Probe"),this.withStreamInfo("crc32",0)}e("../utils").inherits(s,n),s.prototype.processChunk=function(e){this.streamInfo.crc32=i(e.data,this.streamInfo.crc32||0),this.push(e)},t.exports=s},{"../crc32":4,"../utils":32,"./GenericWorker":28}],26:[function(e,t,r){"use strict";var n=e("../utils"),i=e("./GenericWorker");function s(e){i.call(this,"DataLengthProbe for "+e),this.propName=e,this.withStreamInfo(e,0)}n.inherits(s,i),s.prototype.processChunk=function(e){if(e){var t=this.streamInfo[this.propName]||0;this.streamInfo[this.propName]=t+e.data.length}i.prototype.processChunk.call(this,e)},t.exports=s},{"../utils":32,"./GenericWorker":28}],27:[function(e,t,r){"use strict";var n=e("../utils"),i=e("./GenericWorker");function s(e){i.call(this,"DataWorker");var t=this;this.dataIsReady=!1,this.index=0,this.max=0,this.data=null,this.type="",this._tickScheduled=!1,e.then(function(e){t.dataIsReady=!0,t.data=e,t.max=e&&e.length||0,t.type=n.getTypeOf(e),t.isPaused||t._tickAndRepeat()},function(e){t.error(e)})}n.inherits(s,i),s.prototype.cleanUp=function(){i.prototype.cleanUp.call(this),this.data=null},s.prototype.resume=function(){return!!i.prototype.resume.call(this)&&(!this._tickScheduled&&this.dataIsReady&&(this._tickScheduled=!0,n.delay(this._tickAndRepeat,[],this)),!0)},s.prototype._tickAndRepeat=function(){this._tickScheduled=!1,this.isPaused||this.isFinished||(this._tick(),this.isFinished||(n.delay(this._tickAndRepeat,[],this),this._tickScheduled=!0))},s.prototype._tick=function(){if(this.isPaused||this.isFinished)return!1;var e=null,t=Math.min(this.max,this.index+16384);if(this.index>=this.max)return this.end();switch(this.type){case"string":e=this.data.substring(this.index,t);break;case"uint8array":e=this.data.subarray(this.index,t);break;case"array":case"nodebuffer":e=this.data.slice(this.index,t)}return this.index=t,this.push({data:e,meta:{percent:this.max?this.index/this.max*100:0}})},t.exports=s},{"../utils":32,"./GenericWorker":28}],28:[function(e,t,r){"use strict";function n(e){this.name=e||"default",this.streamInfo={},this.generatedError=null,this.extraStreamInfo={},this.isPaused=!0,this.isFinished=!1,this.isLocked=!1,this._listeners={data:[],end:[],error:[]},this.previous=null}n.prototype={push:function(e){this.emit("data",e)},end:function(){if(this.isFinished)return!1;this.flush();try{this.emit("end"),this.cleanUp(),this.isFinished=!0}catch(e){this.emit("error",e)}return!0},error:function(e){return!this.isFinished&&(this.isPaused?this.generatedError=e:(this.isFinished=!0,this.emit("error",e),this.previous&&this.previous.error(e),this.cleanUp()),!0)},on:function(e,t){return this._listeners[e].push(t),this},cleanUp:function(){this.streamInfo=this.generatedError=this.extraStreamInfo=null,this._listeners=[]},emit:function(e,t){if(this._listeners[e])for(var r=0;r<this._listeners[e].length;r++)this._listeners[e][r].call(this,t)},pipe:function(e){return e.registerPrevious(this)},registerPrevious:function(e){if(this.isLocked)throw new Error("The stream '"+this+"' has already been used.");this.streamInfo=e.streamInfo,this.mergeStreamInfo(),this.previous=e;var t=this;return e.on("data",function(e){t.processChunk(e)}),e.on("end",function(){t.end()}),e.on("error",function(e){t.error(e)}),this},pause:function(){return!this.isPaused&&!this.isFinished&&(this.isPaused=!0,this.previous&&this.previous.pause(),!0)},resume:function(){if(!this.isPaused||this.isFinished)return!1;var e=this.isPaused=!1;return this.generatedError&&(this.error(this.generatedError),e=!0),this.previous&&this.previous.resume(),!e},flush:function(){},processChunk:function(e){this.push(e)},withStreamInfo:function(e,t){return this.extraStreamInfo[e]=t,this.mergeStreamInfo(),this},mergeStreamInfo:function(){for(var e in this.extraStreamInfo)Object.prototype.hasOwnProperty.call(this.extraStreamInfo,e)&&(this.streamInfo[e]=this.extraStreamInfo[e])},lock:function(){if(this.isLocked)throw new Error("The stream '"+this+"' has already been used.");this.isLocked=!0,this.previous&&this.previous.lock()},toString:function(){var e="Worker "+this.name;return this.previous?this.previous+" -> "+e:e}},t.exports=n},{}],29:[function(e,t,r){"use strict";var h=e("../utils"),i=e("./ConvertWorker"),s=e("./GenericWorker"),u=e("../base64"),n=e("../support"),a=e("../external"),o=null;if(n.nodestream)try{o=e("../nodejs/NodejsStreamOutputAdapter")}catch(e){}function l(e,o){return new a.Promise(function(t,r){var n=[],i=e._internalType,s=e._outputType,a=e._mimeType;e.on("data",function(e,t){n.push(e),o&&o(t)}).on("error",function(e){n=[],r(e)}).on("end",function(){try{var e=function(e,t,r){switch(e){case"blob":return h.newBlob(h.transformTo("arraybuffer",t),r);case"base64":return u.encode(t);default:return h.transformTo(e,t)}}(s,function(e,t){var r,n=0,i=null,s=0;for(r=0;r<t.length;r++)s+=t[r].length;switch(e){case"string":return t.join("");case"array":return Array.prototype.concat.apply([],t);case"uint8array":for(i=new Uint8Array(s),r=0;r<t.length;r++)i.set(t[r],n),n+=t[r].length;return i;case"nodebuffer":return Buffer.concat(t);default:throw new Error("concat : unsupported type '"+e+"'")}}(i,n),a);t(e)}catch(e){r(e)}n=[]}).resume()})}function f(e,t,r){var n=t;switch(t){case"blob":case"arraybuffer":n="uint8array";break;case"base64":n="string"}try{this._internalType=n,this._outputType=t,this._mimeType=r,h.checkSupport(n),this._worker=e.pipe(new i(n)),e.lock()}catch(e){this._worker=new s("error"),this._worker.error(e)}}f.prototype={accumulate:function(e){return l(this,e)},on:function(e,t){var r=this;return"data"===e?this._worker.on(e,function(e){t.call(r,e.data,e.meta)}):this._worker.on(e,function(){h.delay(t,arguments,r)}),this},resume:function(){return h.delay(this._worker.resume,[],this._worker),this},pause:function(){return this._worker.pause(),this},toNodejsStream:function(e){if(h.checkSupport("nodestream"),"nodebuffer"!==this._outputType)throw new Error(this._outputType+" is not supported by this method");return new o(this,{objectMode:"nodebuffer"!==this._outputType},e)}},t.exports=f},{"../base64":1,"../external":6,"../nodejs/NodejsStreamOutputAdapter":13,"../support":30,"../utils":32,"./ConvertWorker":24,"./GenericWorker":28}],30:[function(e,t,r){"use strict";if(r.base64=!0,r.array=!0,r.string=!0,r.arraybuffer="undefined"!=typeof ArrayBuffer&&"undefined"!=typeof Uint8Array,r.nodebuffer="undefined"!=typeof Buffer,r.uint8array="undefined"!=typeof Uint8Array,"undefined"==typeof ArrayBuffer)r.blob=!1;else{var n=new ArrayBuffer(0);try{r.blob=0===new Blob([n],{type:"application/zip"}).size}catch(e){try{var i=new(self.BlobBuilder||self.WebKitBlobBuilder||self.MozBlobBuilder||self.MSBlobBuilder);i.append(n),r.blob=0===i.getBlob("application/zip").size}catch(e){r.blob=!1}}}try{r.nodestream=!!e("readable-stream").Readable}catch(e){r.nodestream=!1}},{"readable-stream":16}],31:[function(e,t,s){"use strict";for(var o=e("./utils"),h=e("./support"),r=e("./nodejsUtils"),n=e("./stream/GenericWorker"),u=new Array(256),i=0;i<256;i++)u[i]=252<=i?6:248<=i?5:240<=i?4:224<=i?3:192<=i?2:1;u[254]=u[254]=1;function a(){n.call(this,"utf-8 decode"),this.leftOver=null}function l(){n.call(this,"utf-8 encode")}s.utf8encode=function(e){return h.nodebuffer?r.newBufferFrom(e,"utf-8"):function(e){var t,r,n,i,s,a=e.length,o=0;for(i=0;i<a;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),o+=r<128?1:r<2048?2:r<65536?3:4;for(t=h.uint8array?new Uint8Array(o):new Array(o),i=s=0;s<o;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),r<128?t[s++]=r:(r<2048?t[s++]=192|r>>>6:(r<65536?t[s++]=224|r>>>12:(t[s++]=240|r>>>18,t[s++]=128|r>>>12&63),t[s++]=128|r>>>6&63),t[s++]=128|63&r);return t}(e)},s.utf8decode=function(e){return h.nodebuffer?o.transformTo("nodebuffer",e).toString("utf-8"):function(e){var t,r,n,i,s=e.length,a=new Array(2*s);for(t=r=0;t<s;)if((n=e[t++])<128)a[r++]=n;else if(4<(i=u[n]))a[r++]=65533,t+=i-1;else{for(n&=2===i?31:3===i?15:7;1<i&&t<s;)n=n<<6|63&e[t++],i--;1<i?a[r++]=65533:n<65536?a[r++]=n:(n-=65536,a[r++]=55296|n>>10&1023,a[r++]=56320|1023&n)}return a.length!==r&&(a.subarray?a=a.subarray(0,r):a.length=r),o.applyFromCharCode(a)}(e=o.transformTo(h.uint8array?"uint8array":"array",e))},o.inherits(a,n),a.prototype.processChunk=function(e){var t=o.transformTo(h.uint8array?"uint8array":"array",e.data);if(this.leftOver&&this.leftOver.length){if(h.uint8array){var r=t;(t=new Uint8Array(r.length+this.leftOver.length)).set(this.leftOver,0),t.set(r,this.leftOver.length)}else t=this.leftOver.concat(t);this.leftOver=null}var n=function(e,t){var r;for((t=t||e.length)>e.length&&(t=e.length),r=t-1;0<=r&&128==(192&e[r]);)r--;return r<0?t:0===r?t:r+u[e[r]]>t?r:t}(t),i=t;n!==t.length&&(h.uint8array?(i=t.subarray(0,n),this.leftOver=t.subarray(n,t.length)):(i=t.slice(0,n),this.leftOver=t.slice(n,t.length))),this.push({data:s.utf8decode(i),meta:e.meta})},a.prototype.flush=function(){this.leftOver&&this.leftOver.length&&(this.push({data:s.utf8decode(this.leftOver),meta:{}}),this.leftOver=null)},s.Utf8DecodeWorker=a,o.inherits(l,n),l.prototype.processChunk=function(e){this.push({data:s.utf8encode(e.data),meta:e.meta})},s.Utf8EncodeWorker=l},{"./nodejsUtils":14,"./stream/GenericWorker":28,"./support":30,"./utils":32}],32:[function(e,t,a){"use strict";var o=e("./support"),h=e("./base64"),r=e("./nodejsUtils"),u=e("./external");function n(e){return e}function l(e,t){for(var r=0;r<e.length;++r)t[r]=255&e.charCodeAt(r);return t}e("setimmediate"),a.newBlob=function(t,r){a.checkSupport("blob");try{return new Blob([t],{type:r})}catch(e){try{var n=new(self.BlobBuilder||self.WebKitBlobBuilder||self.MozBlobBuilder||self.MSBlobBuilder);return n.append(t),n.getBlob(r)}catch(e){throw new Error("Bug : can't construct the Blob.")}}};var i={stringifyByChunk:function(e,t,r){var n=[],i=0,s=e.length;if(s<=r)return String.fromCharCode.apply(null,e);for(;i<s;)"array"===t||"nodebuffer"===t?n.push(String.fromCharCode.apply(null,e.slice(i,Math.min(i+r,s)))):n.push(String.fromCharCode.apply(null,e.subarray(i,Math.min(i+r,s)))),i+=r;return n.join("")},stringifyByChar:function(e){for(var t="",r=0;r<e.length;r++)t+=String.fromCharCode(e[r]);return t},applyCanBeUsed:{uint8array:function(){try{return o.uint8array&&1===String.fromCharCode.apply(null,new Uint8Array(1)).length}catch(e){return!1}}(),nodebuffer:function(){try{return o.nodebuffer&&1===String.fromCharCode.apply(null,r.allocBuffer(1)).length}catch(e){return!1}}()}};function s(e){var t=65536,r=a.getTypeOf(e),n=!0;if("uint8array"===r?n=i.applyCanBeUsed.uint8array:"nodebuffer"===r&&(n=i.applyCanBeUsed.nodebuffer),n)for(;1<t;)try{return i.stringifyByChunk(e,r,t)}catch(e){t=Math.floor(t/2)}return i.stringifyByChar(e)}function f(e,t){for(var r=0;r<e.length;r++)t[r]=e[r];return t}a.applyFromCharCode=s;var c={};c.string={string:n,array:function(e){return l(e,new Array(e.length))},arraybuffer:function(e){return c.string.uint8array(e).buffer},uint8array:function(e){return l(e,new Uint8Array(e.length))},nodebuffer:function(e){return l(e,r.allocBuffer(e.length))}},c.array={string:s,array:n,arraybuffer:function(e){return new Uint8Array(e).buffer},uint8array:function(e){return new Uint8Array(e)},nodebuffer:function(e){return r.newBufferFrom(e)}},c.arraybuffer={string:function(e){return s(new Uint8Array(e))},array:function(e){return f(new Uint8Array(e),new Array(e.byteLength))},arraybuffer:n,uint8array:function(e){return new Uint8Array(e)},nodebuffer:function(e){return r.newBufferFrom(new Uint8Array(e))}},c.uint8array={string:s,array:function(e){return f(e,new Array(e.length))},arraybuffer:function(e){return e.buffer},uint8array:n,nodebuffer:function(e){return r.newBufferFrom(e)}},c.nodebuffer={string:s,array:function(e){return f(e,new Array(e.length))},arraybuffer:function(e){return c.nodebuffer.uint8array(e).buffer},uint8array:function(e){return f(e,new Uint8Array(e.length))},nodebuffer:n},a.transformTo=function(e,t){if(t=t||"",!e)return t;a.checkSupport(e);var r=a.getTypeOf(t);return c[r][e](t)},a.resolve=function(e){for(var t=e.split("/"),r=[],n=0;n<t.length;n++){var i=t[n];"."===i||""===i&&0!==n&&n!==t.length-1||(".."===i?r.pop():r.push(i))}return r.join("/")},a.getTypeOf=function(e){return"string"==typeof e?"string":"[object Array]"===Object.prototype.toString.call(e)?"array":o.nodebuffer&&r.isBuffer(e)?"nodebuffer":o.uint8array&&e instanceof Uint8Array?"uint8array":o.arraybuffer&&e instanceof ArrayBuffer?"arraybuffer":void 0},a.checkSupport=function(e){if(!o[e.toLowerCase()])throw new Error(e+" is not supported by this platform")},a.MAX_VALUE_16BITS=65535,a.MAX_VALUE_32BITS=-1,a.pretty=function(e){var t,r,n="";for(r=0;r<(e||"").length;r++)n+="\\x"+((t=e.charCodeAt(r))<16?"0":"")+t.toString(16).toUpperCase();return n},a.delay=function(e,t,r){setImmediate(function(){e.apply(r||null,t||[])})},a.inherits=function(e,t){function r(){}r.prototype=t.prototype,e.prototype=new r},a.extend=function(){var e,t,r={};for(e=0;e<arguments.length;e++)for(t in arguments[e])Object.prototype.hasOwnProperty.call(arguments[e],t)&&void 0===r[t]&&(r[t]=arguments[e][t]);return r},a.prepareContent=function(r,e,n,i,s){return u.Promise.resolve(e).then(function(n){return o.blob&&(n instanceof Blob||-1!==["[object File]","[object Blob]"].indexOf(Object.prototype.toString.call(n)))&&"undefined"!=typeof FileReader?new u.Promise(function(t,r){var e=new FileReader;e.onload=function(e){t(e.target.result)},e.onerror=function(e){r(e.target.error)},e.readAsArrayBuffer(n)}):n}).then(function(e){var t=a.getTypeOf(e);return t?("arraybuffer"===t?e=a.transformTo("uint8array",e):"string"===t&&(s?e=h.decode(e):n&&!0!==i&&(e=function(e){return l(e,o.uint8array?new Uint8Array(e.length):new Array(e.length))}(e))),e):u.Promise.reject(new Error("Can't read the data of '"+r+"'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?"))})}},{"./base64":1,"./external":6,"./nodejsUtils":14,"./support":30,setimmediate:54}],33:[function(e,t,r){"use strict";var n=e("./reader/readerFor"),i=e("./utils"),s=e("./signature"),a=e("./zipEntry"),o=e("./support");function h(e){this.files=[],this.loadOptions=e}h.prototype={checkSignature:function(e){if(!this.reader.readAndCheckSignature(e)){this.reader.index-=4;var t=this.reader.readString(4);throw new Error("Corrupted zip or bug: unexpected signature ("+i.pretty(t)+", expected "+i.pretty(e)+")")}},isSignature:function(e,t){var r=this.reader.index;this.reader.setIndex(e);var n=this.reader.readString(4)===t;return this.reader.setIndex(r),n},readBlockEndOfCentral:function(){this.diskNumber=this.reader.readInt(2),this.diskWithCentralDirStart=this.reader.readInt(2),this.centralDirRecordsOnThisDisk=this.reader.readInt(2),this.centralDirRecords=this.reader.readInt(2),this.centralDirSize=this.reader.readInt(4),this.centralDirOffset=this.reader.readInt(4),this.zipCommentLength=this.reader.readInt(2);var e=this.reader.readData(this.zipCommentLength),t=o.uint8array?"uint8array":"array",r=i.transformTo(t,e);this.zipComment=this.loadOptions.decodeFileName(r)},readBlockZip64EndOfCentral:function(){this.zip64EndOfCentralSize=this.reader.readInt(8),this.reader.skip(4),this.diskNumber=this.reader.readInt(4),this.diskWithCentralDirStart=this.reader.readInt(4),this.centralDirRecordsOnThisDisk=this.reader.readInt(8),this.centralDirRecords=this.reader.readInt(8),this.centralDirSize=this.reader.readInt(8),this.centralDirOffset=this.reader.readInt(8),this.zip64ExtensibleData={};for(var e,t,r,n=this.zip64EndOfCentralSize-44;0<n;)e=this.reader.readInt(2),t=this.reader.readInt(4),r=this.reader.readData(t),this.zip64ExtensibleData[e]={id:e,length:t,value:r}},readBlockZip64EndOfCentralLocator:function(){if(this.diskWithZip64CentralDirStart=this.reader.readInt(4),this.relativeOffsetEndOfZip64CentralDir=this.reader.readInt(8),this.disksCount=this.reader.readInt(4),1<this.disksCount)throw new Error("Multi-volumes zip are not supported")},readLocalFiles:function(){var e,t;for(e=0;e<this.files.length;e++)t=this.files[e],this.reader.setIndex(t.localHeaderOffset),this.checkSignature(s.LOCAL_FILE_HEADER),t.readLocalPart(this.reader),t.handleUTF8(),t.processAttributes()},readCentralDir:function(){var e;for(this.reader.setIndex(this.centralDirOffset);this.reader.readAndCheckSignature(s.CENTRAL_FILE_HEADER);)(e=new a({zip64:this.zip64},this.loadOptions)).readCentralPart(this.reader),this.files.push(e);if(this.centralDirRecords!==this.files.length&&0!==this.centralDirRecords&&0===this.files.length)throw new Error("Corrupted zip or bug: expected "+this.centralDirRecords+" records in central dir, got "+this.files.length)},readEndOfCentral:function(){var e=this.reader.lastIndexOfSignature(s.CENTRAL_DIRECTORY_END);if(e<0)throw!this.isSignature(0,s.LOCAL_FILE_HEADER)?new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html"):new Error("Corrupted zip: can't find end of central directory");this.reader.setIndex(e);var t=e;if(this.checkSignature(s.CENTRAL_DIRECTORY_END),this.readBlockEndOfCentral(),this.diskNumber===i.MAX_VALUE_16BITS||this.diskWithCentralDirStart===i.MAX_VALUE_16BITS||this.centralDirRecordsOnThisDisk===i.MAX_VALUE_16BITS||this.centralDirRecords===i.MAX_VALUE_16BITS||this.centralDirSize===i.MAX_VALUE_32BITS||this.centralDirOffset===i.MAX_VALUE_32BITS){if(this.zip64=!0,(e=this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR))<0)throw new Error("Corrupted zip: can't find the ZIP64 end of central directory locator");if(this.reader.setIndex(e),this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR),this.readBlockZip64EndOfCentralLocator(),!this.isSignature(this.relativeOffsetEndOfZip64CentralDir,s.ZIP64_CENTRAL_DIRECTORY_END)&&(this.relativeOffsetEndOfZip64CentralDir=this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_END),this.relativeOffsetEndOfZip64CentralDir<0))throw new Error("Corrupted zip: can't find the ZIP64 end of central directory");this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir),this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_END),this.readBlockZip64EndOfCentral()}var r=this.centralDirOffset+this.centralDirSize;this.zip64&&(r+=20,r+=12+this.zip64EndOfCentralSize);var n=t-r;if(0<n)this.isSignature(t,s.CENTRAL_FILE_HEADER)||(this.reader.zero=n);else if(n<0)throw new Error("Corrupted zip: missing "+Math.abs(n)+" bytes.")},prepareReader:function(e){this.reader=n(e)},load:function(e){this.prepareReader(e),this.readEndOfCentral(),this.readCentralDir(),this.readLocalFiles()}},t.exports=h},{"./reader/readerFor":22,"./signature":23,"./support":30,"./utils":32,"./zipEntry":34}],34:[function(e,t,r){"use strict";var n=e("./reader/readerFor"),s=e("./utils"),i=e("./compressedObject"),a=e("./crc32"),o=e("./utf8"),h=e("./compressions"),u=e("./support");function l(e,t){this.options=e,this.loadOptions=t}l.prototype={isEncrypted:function(){return 1==(1&this.bitFlag)},useUTF8:function(){return 2048==(2048&this.bitFlag)},readLocalPart:function(e){var t,r;if(e.skip(22),this.fileNameLength=e.readInt(2),r=e.readInt(2),this.fileName=e.readData(this.fileNameLength),e.skip(r),-1===this.compressedSize||-1===this.uncompressedSize)throw new Error("Bug or corrupted zip : didn't get enough information from the central directory (compressedSize === -1 || uncompressedSize === -1)");if(null===(t=function(e){for(var t in h)if(Object.prototype.hasOwnProperty.call(h,t)&&h[t].magic===e)return h[t];return null}(this.compressionMethod)))throw new Error("Corrupted zip : compression "+s.pretty(this.compressionMethod)+" unknown (inner file : "+s.transformTo("string",this.fileName)+")");this.decompressed=new i(this.compressedSize,this.uncompressedSize,this.crc32,t,e.readData(this.compressedSize))},readCentralPart:function(e){this.versionMadeBy=e.readInt(2),e.skip(2),this.bitFlag=e.readInt(2),this.compressionMethod=e.readString(2),this.date=e.readDate(),this.crc32=e.readInt(4),this.compressedSize=e.readInt(4),this.uncompressedSize=e.readInt(4);var t=e.readInt(2);if(this.extraFieldsLength=e.readInt(2),this.fileCommentLength=e.readInt(2),this.diskNumberStart=e.readInt(2),this.internalFileAttributes=e.readInt(2),this.externalFileAttributes=e.readInt(4),this.localHeaderOffset=e.readInt(4),this.isEncrypted())throw new Error("Encrypted zip are not supported");e.skip(t),this.readExtraFields(e),this.parseZIP64ExtraField(e),this.fileComment=e.readData(this.fileCommentLength)},processAttributes:function(){this.unixPermissions=null,this.dosPermissions=null;var e=this.versionMadeBy>>8;this.dir=!!(16&this.externalFileAttributes),0==e&&(this.dosPermissions=63&this.externalFileAttributes),3==e&&(this.unixPermissions=this.externalFileAttributes>>16&65535),this.dir||"/"!==this.fileNameStr.slice(-1)||(this.dir=!0)},parseZIP64ExtraField:function(){if(this.extraFields[1]){var e=n(this.extraFields[1].value);this.uncompressedSize===s.MAX_VALUE_32BITS&&(this.uncompressedSize=e.readInt(8)),this.compressedSize===s.MAX_VALUE_32BITS&&(this.compressedSize=e.readInt(8)),this.localHeaderOffset===s.MAX_VALUE_32BITS&&(this.localHeaderOffset=e.readInt(8)),this.diskNumberStart===s.MAX_VALUE_32BITS&&(this.diskNumberStart=e.readInt(4))}},readExtraFields:function(e){var t,r,n,i=e.index+this.extraFieldsLength;for(this.extraFields||(this.extraFields={});e.index+4<i;)t=e.readInt(2),r=e.readInt(2),n=e.readData(r),this.extraFields[t]={id:t,length:r,value:n};e.setIndex(i)},handleUTF8:function(){var e=u.uint8array?"uint8array":"array";if(this.useUTF8())this.fileNameStr=o.utf8decode(this.fileName),this.fileCommentStr=o.utf8decode(this.fileComment);else{var t=this.findExtraFieldUnicodePath();if(null!==t)this.fileNameStr=t;else{var r=s.transformTo(e,this.fileName);this.fileNameStr=this.loadOptions.decodeFileName(r)}var n=this.findExtraFieldUnicodeComment();if(null!==n)this.fileCommentStr=n;else{var i=s.transformTo(e,this.fileComment);this.fileCommentStr=this.loadOptions.decodeFileName(i)}}},findExtraFieldUnicodePath:function(){var e=this.extraFields[28789];if(e){var t=n(e.value);return 1!==t.readInt(1)?null:a(this.fileName)!==t.readInt(4)?null:o.utf8decode(t.readData(e.length-5))}return null},findExtraFieldUnicodeComment:function(){var e=this.extraFields[25461];if(e){var t=n(e.value);return 1!==t.readInt(1)?null:a(this.fileComment)!==t.readInt(4)?null:o.utf8decode(t.readData(e.length-5))}return null}},t.exports=l},{"./compressedObject":2,"./compressions":3,"./crc32":4,"./reader/readerFor":22,"./support":30,"./utf8":31,"./utils":32}],35:[function(e,t,r){"use strict";function n(e,t,r){this.name=e,this.dir=r.dir,this.date=r.date,this.comment=r.comment,this.unixPermissions=r.unixPermissions,this.dosPermissions=r.dosPermissions,this._data=t,this._dataBinary=r.binary,this.options={compression:r.compression,compressionOptions:r.compressionOptions}}var s=e("./stream/StreamHelper"),i=e("./stream/DataWorker"),a=e("./utf8"),o=e("./compressedObject"),h=e("./stream/GenericWorker");n.prototype={internalStream:function(e){var t=null,r="string";try{if(!e)throw new Error("No output type specified.");var n="string"===(r=e.toLowerCase())||"text"===r;"binarystring"!==r&&"text"!==r||(r="string"),t=this._decompressWorker();var i=!this._dataBinary;i&&!n&&(t=t.pipe(new a.Utf8EncodeWorker)),!i&&n&&(t=t.pipe(new a.Utf8DecodeWorker))}catch(e){(t=new h("error")).error(e)}return new s(t,r,"")},async:function(e,t){return this.internalStream(e).accumulate(t)},nodeStream:function(e,t){return this.internalStream(e||"nodebuffer").toNodejsStream(t)},_compressWorker:function(e,t){if(this._data instanceof o&&this._data.compression.magic===e.magic)return this._data.getCompressedWorker();var r=this._decompressWorker();return this._dataBinary||(r=r.pipe(new a.Utf8EncodeWorker)),o.createWorkerFrom(r,e,t)},_decompressWorker:function(){return this._data instanceof o?this._data.getContentWorker():this._data instanceof h?this._data:new i(this._data)}};for(var u=["asText","asBinary","asNodeBuffer","asUint8Array","asArrayBuffer"],l=function(){throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")},f=0;f<u.length;f++)n.prototype[u[f]]=l;t.exports=n},{"./compressedObject":2,"./stream/DataWorker":27,"./stream/GenericWorker":28,"./stream/StreamHelper":29,"./utf8":31}],36:[function(e,l,t){(function(t){"use strict";var r,n,e=t.MutationObserver||t.WebKitMutationObserver;if(e){var i=0,s=new e(u),a=t.document.createTextNode("");s.observe(a,{characterData:!0}),r=function(){a.data=i=++i%2}}else if(t.setImmediate||void 0===t.MessageChannel)r="document"in t&&"onreadystatechange"in t.document.createElement("script")?function(){var e=t.document.createElement("script");e.onreadystatechange=function(){u(),e.onreadystatechange=null,e.parentNode.removeChild(e),e=null},t.document.documentElement.appendChild(e)}:function(){setTimeout(u,0)};else{var o=new t.MessageChannel;o.port1.onmessage=u,r=function(){o.port2.postMessage(0)}}var h=[];function u(){var e,t;n=!0;for(var r=h.length;r;){for(t=h,h=[],e=-1;++e<r;)t[e]();r=h.length}n=!1}l.exports=function(e){1!==h.push(e)||n||r()}}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{}],37:[function(e,t,r){"use strict";var i=e("immediate");function u(){}var l={},s=["REJECTED"],a=["FULFILLED"],n=["PENDING"];function o(e){if("function"!=typeof e)throw new TypeError("resolver must be a function");this.state=n,this.queue=[],this.outcome=void 0,e!==u&&d(this,e)}function h(e,t,r){this.promise=e,"function"==typeof t&&(this.onFulfilled=t,this.callFulfilled=this.otherCallFulfilled),"function"==typeof r&&(this.onRejected=r,this.callRejected=this.otherCallRejected)}function f(t,r,n){i(function(){var e;try{e=r(n)}catch(e){return l.reject(t,e)}e===t?l.reject(t,new TypeError("Cannot resolve promise with itself")):l.resolve(t,e)})}function c(e){var t=e&&e.then;if(e&&("object"==typeof e||"function"==typeof e)&&"function"==typeof t)return function(){t.apply(e,arguments)}}function d(t,e){var r=!1;function n(e){r||(r=!0,l.reject(t,e))}function i(e){r||(r=!0,l.resolve(t,e))}var s=p(function(){e(i,n)});"error"===s.status&&n(s.value)}function p(e,t){var r={};try{r.value=e(t),r.status="success"}catch(e){r.status="error",r.value=e}return r}(t.exports=o).prototype.finally=function(t){if("function"!=typeof t)return this;var r=this.constructor;return this.then(function(e){return r.resolve(t()).then(function(){return e})},function(e){return r.resolve(t()).then(function(){throw e})})},o.prototype.catch=function(e){return this.then(null,e)},o.prototype.then=function(e,t){if("function"!=typeof e&&this.state===a||"function"!=typeof t&&this.state===s)return this;var r=new this.constructor(u);this.state!==n?f(r,this.state===a?e:t,this.outcome):this.queue.push(new h(r,e,t));return r},h.prototype.callFulfilled=function(e){l.resolve(this.promise,e)},h.prototype.otherCallFulfilled=function(e){f(this.promise,this.onFulfilled,e)},h.prototype.callRejected=function(e){l.reject(this.promise,e)},h.prototype.otherCallRejected=function(e){f(this.promise,this.onRejected,e)},l.resolve=function(e,t){var r=p(c,t);if("error"===r.status)return l.reject(e,r.value);var n=r.value;if(n)d(e,n);else{e.state=a,e.outcome=t;for(var i=-1,s=e.queue.length;++i<s;)e.queue[i].callFulfilled(t)}return e},l.reject=function(e,t){e.state=s,e.outcome=t;for(var r=-1,n=e.queue.length;++r<n;)e.queue[r].callRejected(t);return e},o.resolve=function(e){if(e instanceof this)return e;return l.resolve(new this(u),e)},o.reject=function(e){var t=new this(u);return l.reject(t,e)},o.all=function(e){var r=this;if("[object Array]"!==Object.prototype.toString.call(e))return this.reject(new TypeError("must be an array"));var n=e.length,i=!1;if(!n)return this.resolve([]);var s=new Array(n),a=0,t=-1,o=new this(u);for(;++t<n;)h(e[t],t);return o;function h(e,t){r.resolve(e).then(function(e){s[t]=e,++a!==n||i||(i=!0,l.resolve(o,s))},function(e){i||(i=!0,l.reject(o,e))})}},o.race=function(e){var t=this;if("[object Array]"!==Object.prototype.toString.call(e))return this.reject(new TypeError("must be an array"));var r=e.length,n=!1;if(!r)return this.resolve([]);var i=-1,s=new this(u);for(;++i<r;)a=e[i],t.resolve(a).then(function(e){n||(n=!0,l.resolve(s,e))},function(e){n||(n=!0,l.reject(s,e))});var a;return s}},{immediate:36}],38:[function(e,t,r){"use strict";var n={};(0,e("./lib/utils/common").assign)(n,e("./lib/deflate"),e("./lib/inflate"),e("./lib/zlib/constants")),t.exports=n},{"./lib/deflate":39,"./lib/inflate":40,"./lib/utils/common":41,"./lib/zlib/constants":44}],39:[function(e,t,r){"use strict";var a=e("./zlib/deflate"),o=e("./utils/common"),h=e("./utils/strings"),i=e("./zlib/messages"),s=e("./zlib/zstream"),u=Object.prototype.toString,l=0,f=-1,c=0,d=8;function p(e){if(!(this instanceof p))return new p(e);this.options=o.assign({level:f,method:d,chunkSize:16384,windowBits:15,memLevel:8,strategy:c,to:""},e||{});var t=this.options;t.raw&&0<t.windowBits?t.windowBits=-t.windowBits:t.gzip&&0<t.windowBits&&t.windowBits<16&&(t.windowBits+=16),this.err=0,this.msg="",this.ended=!1,this.chunks=[],this.strm=new s,this.strm.avail_out=0;var r=a.deflateInit2(this.strm,t.level,t.method,t.windowBits,t.memLevel,t.strategy);if(r!==l)throw new Error(i[r]);if(t.header&&a.deflateSetHeader(this.strm,t.header),t.dictionary){var n;if(n="string"==typeof t.dictionary?h.string2buf(t.dictionary):"[object ArrayBuffer]"===u.call(t.dictionary)?new Uint8Array(t.dictionary):t.dictionary,(r=a.deflateSetDictionary(this.strm,n))!==l)throw new Error(i[r]);this._dict_set=!0}}function n(e,t){var r=new p(t);if(r.push(e,!0),r.err)throw r.msg||i[r.err];return r.result}p.prototype.push=function(e,t){var r,n,i=this.strm,s=this.options.chunkSize;if(this.ended)return!1;n=t===~~t?t:!0===t?4:0,"string"==typeof e?i.input=h.string2buf(e):"[object ArrayBuffer]"===u.call(e)?i.input=new Uint8Array(e):i.input=e,i.next_in=0,i.avail_in=i.input.length;do{if(0===i.avail_out&&(i.output=new o.Buf8(s),i.next_out=0,i.avail_out=s),1!==(r=a.deflate(i,n))&&r!==l)return this.onEnd(r),!(this.ended=!0);0!==i.avail_out&&(0!==i.avail_in||4!==n&&2!==n)||("string"===this.options.to?this.onData(h.buf2binstring(o.shrinkBuf(i.output,i.next_out))):this.onData(o.shrinkBuf(i.output,i.next_out)))}while((0<i.avail_in||0===i.avail_out)&&1!==r);return 4===n?(r=a.deflateEnd(this.strm),this.onEnd(r),this.ended=!0,r===l):2!==n||(this.onEnd(l),!(i.avail_out=0))},p.prototype.onData=function(e){this.chunks.push(e)},p.prototype.onEnd=function(e){e===l&&("string"===this.options.to?this.result=this.chunks.join(""):this.result=o.flattenChunks(this.chunks)),this.chunks=[],this.err=e,this.msg=this.strm.msg},r.Deflate=p,r.deflate=n,r.deflateRaw=function(e,t){return(t=t||{}).raw=!0,n(e,t)},r.gzip=function(e,t){return(t=t||{}).gzip=!0,n(e,t)}},{"./utils/common":41,"./utils/strings":42,"./zlib/deflate":46,"./zlib/messages":51,"./zlib/zstream":53}],40:[function(e,t,r){"use strict";var c=e("./zlib/inflate"),d=e("./utils/common"),p=e("./utils/strings"),m=e("./zlib/constants"),n=e("./zlib/messages"),i=e("./zlib/zstream"),s=e("./zlib/gzheader"),_=Object.prototype.toString;function a(e){if(!(this instanceof a))return new a(e);this.options=d.assign({chunkSize:16384,windowBits:0,to:""},e||{});var t=this.options;t.raw&&0<=t.windowBits&&t.windowBits<16&&(t.windowBits=-t.windowBits,0===t.windowBits&&(t.windowBits=-15)),!(0<=t.windowBits&&t.windowBits<16)||e&&e.windowBits||(t.windowBits+=32),15<t.windowBits&&t.windowBits<48&&0==(15&t.windowBits)&&(t.windowBits|=15),this.err=0,this.msg="",this.ended=!1,this.chunks=[],this.strm=new i,this.strm.avail_out=0;var r=c.inflateInit2(this.strm,t.windowBits);if(r!==m.Z_OK)throw new Error(n[r]);this.header=new s,c.inflateGetHeader(this.strm,this.header)}function o(e,t){var r=new a(t);if(r.push(e,!0),r.err)throw r.msg||n[r.err];return r.result}a.prototype.push=function(e,t){var r,n,i,s,a,o,h=this.strm,u=this.options.chunkSize,l=this.options.dictionary,f=!1;if(this.ended)return!1;n=t===~~t?t:!0===t?m.Z_FINISH:m.Z_NO_FLUSH,"string"==typeof e?h.input=p.binstring2buf(e):"[object ArrayBuffer]"===_.call(e)?h.input=new Uint8Array(e):h.input=e,h.next_in=0,h.avail_in=h.input.length;do{if(0===h.avail_out&&(h.output=new d.Buf8(u),h.next_out=0,h.avail_out=u),(r=c.inflate(h,m.Z_NO_FLUSH))===m.Z_NEED_DICT&&l&&(o="string"==typeof l?p.string2buf(l):"[object ArrayBuffer]"===_.call(l)?new Uint8Array(l):l,r=c.inflateSetDictionary(this.strm,o)),r===m.Z_BUF_ERROR&&!0===f&&(r=m.Z_OK,f=!1),r!==m.Z_STREAM_END&&r!==m.Z_OK)return this.onEnd(r),!(this.ended=!0);h.next_out&&(0!==h.avail_out&&r!==m.Z_STREAM_END&&(0!==h.avail_in||n!==m.Z_FINISH&&n!==m.Z_SYNC_FLUSH)||("string"===this.options.to?(i=p.utf8border(h.output,h.next_out),s=h.next_out-i,a=p.buf2string(h.output,i),h.next_out=s,h.avail_out=u-s,s&&d.arraySet(h.output,h.output,i,s,0),this.onData(a)):this.onData(d.shrinkBuf(h.output,h.next_out)))),0===h.avail_in&&0===h.avail_out&&(f=!0)}while((0<h.avail_in||0===h.avail_out)&&r!==m.Z_STREAM_END);return r===m.Z_STREAM_END&&(n=m.Z_FINISH),n===m.Z_FINISH?(r=c.inflateEnd(this.strm),this.onEnd(r),this.ended=!0,r===m.Z_OK):n!==m.Z_SYNC_FLUSH||(this.onEnd(m.Z_OK),!(h.avail_out=0))},a.prototype.onData=function(e){this.chunks.push(e)},a.prototype.onEnd=function(e){e===m.Z_OK&&("string"===this.options.to?this.result=this.chunks.join(""):this.result=d.flattenChunks(this.chunks)),this.chunks=[],this.err=e,this.msg=this.strm.msg},r.Inflate=a,r.inflate=o,r.inflateRaw=function(e,t){return(t=t||{}).raw=!0,o(e,t)},r.ungzip=o},{"./utils/common":41,"./utils/strings":42,"./zlib/constants":44,"./zlib/gzheader":47,"./zlib/inflate":49,"./zlib/messages":51,"./zlib/zstream":53}],41:[function(e,t,r){"use strict";var n="undefined"!=typeof Uint8Array&&"undefined"!=typeof Uint16Array&&"undefined"!=typeof Int32Array;r.assign=function(e){for(var t=Array.prototype.slice.call(arguments,1);t.length;){var r=t.shift();if(r){if("object"!=typeof r)throw new TypeError(r+"must be non-object");for(var n in r)r.hasOwnProperty(n)&&(e[n]=r[n])}}return e},r.shrinkBuf=function(e,t){return e.length===t?e:e.subarray?e.subarray(0,t):(e.length=t,e)};var i={arraySet:function(e,t,r,n,i){if(t.subarray&&e.subarray)e.set(t.subarray(r,r+n),i);else for(var s=0;s<n;s++)e[i+s]=t[r+s]},flattenChunks:function(e){var t,r,n,i,s,a;for(t=n=0,r=e.length;t<r;t++)n+=e[t].length;for(a=new Uint8Array(n),t=i=0,r=e.length;t<r;t++)s=e[t],a.set(s,i),i+=s.length;return a}},s={arraySet:function(e,t,r,n,i){for(var s=0;s<n;s++)e[i+s]=t[r+s]},flattenChunks:function(e){return[].concat.apply([],e)}};r.setTyped=function(e){e?(r.Buf8=Uint8Array,r.Buf16=Uint16Array,r.Buf32=Int32Array,r.assign(r,i)):(r.Buf8=Array,r.Buf16=Array,r.Buf32=Array,r.assign(r,s))},r.setTyped(n)},{}],42:[function(e,t,r){"use strict";var h=e("./common"),i=!0,s=!0;try{String.fromCharCode.apply(null,[0])}catch(e){i=!1}try{String.fromCharCode.apply(null,new Uint8Array(1))}catch(e){s=!1}for(var u=new h.Buf8(256),n=0;n<256;n++)u[n]=252<=n?6:248<=n?5:240<=n?4:224<=n?3:192<=n?2:1;function l(e,t){if(t<65537&&(e.subarray&&s||!e.subarray&&i))return String.fromCharCode.apply(null,h.shrinkBuf(e,t));for(var r="",n=0;n<t;n++)r+=String.fromCharCode(e[n]);return r}u[254]=u[254]=1,r.string2buf=function(e){var t,r,n,i,s,a=e.length,o=0;for(i=0;i<a;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),o+=r<128?1:r<2048?2:r<65536?3:4;for(t=new h.Buf8(o),i=s=0;s<o;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),r<128?t[s++]=r:(r<2048?t[s++]=192|r>>>6:(r<65536?t[s++]=224|r>>>12:(t[s++]=240|r>>>18,t[s++]=128|r>>>12&63),t[s++]=128|r>>>6&63),t[s++]=128|63&r);return t},r.buf2binstring=function(e){return l(e,e.length)},r.binstring2buf=function(e){for(var t=new h.Buf8(e.length),r=0,n=t.length;r<n;r++)t[r]=e.charCodeAt(r);return t},r.buf2string=function(e,t){var r,n,i,s,a=t||e.length,o=new Array(2*a);for(r=n=0;r<a;)if((i=e[r++])<128)o[n++]=i;else if(4<(s=u[i]))o[n++]=65533,r+=s-1;else{for(i&=2===s?31:3===s?15:7;1<s&&r<a;)i=i<<6|63&e[r++],s--;1<s?o[n++]=65533:i<65536?o[n++]=i:(i-=65536,o[n++]=55296|i>>10&1023,o[n++]=56320|1023&i)}return l(o,n)},r.utf8border=function(e,t){var r;for((t=t||e.length)>e.length&&(t=e.length),r=t-1;0<=r&&128==(192&e[r]);)r--;return r<0?t:0===r?t:r+u[e[r]]>t?r:t}},{"./common":41}],43:[function(e,t,r){"use strict";t.exports=function(e,t,r,n){for(var i=65535&e|0,s=e>>>16&65535|0,a=0;0!==r;){for(r-=a=2e3<r?2e3:r;s=s+(i=i+t[n++]|0)|0,--a;);i%=65521,s%=65521}return i|s<<16|0}},{}],44:[function(e,t,r){"use strict";t.exports={Z_NO_FLUSH:0,Z_PARTIAL_FLUSH:1,Z_SYNC_FLUSH:2,Z_FULL_FLUSH:3,Z_FINISH:4,Z_BLOCK:5,Z_TREES:6,Z_OK:0,Z_STREAM_END:1,Z_NEED_DICT:2,Z_ERRNO:-1,Z_STREAM_ERROR:-2,Z_DATA_ERROR:-3,Z_BUF_ERROR:-5,Z_NO_COMPRESSION:0,Z_BEST_SPEED:1,Z_BEST_COMPRESSION:9,Z_DEFAULT_COMPRESSION:-1,Z_FILTERED:1,Z_HUFFMAN_ONLY:2,Z_RLE:3,Z_FIXED:4,Z_DEFAULT_STRATEGY:0,Z_BINARY:0,Z_TEXT:1,Z_UNKNOWN:2,Z_DEFLATED:8}},{}],45:[function(e,t,r){"use strict";var o=function(){for(var e,t=[],r=0;r<256;r++){e=r;for(var n=0;n<8;n++)e=1&e?3988292384^e>>>1:e>>>1;t[r]=e}return t}();t.exports=function(e,t,r,n){var i=o,s=n+r;e^=-1;for(var a=n;a<s;a++)e=e>>>8^i[255&(e^t[a])];return-1^e}},{}],46:[function(e,t,r){"use strict";var h,c=e("../utils/common"),u=e("./trees"),d=e("./adler32"),p=e("./crc32"),n=e("./messages"),l=0,f=4,m=0,_=-2,g=-1,b=4,i=2,v=8,y=9,s=286,a=30,o=19,w=2*s+1,k=15,x=3,S=258,z=S+x+1,C=42,E=113,A=1,I=2,O=3,B=4;function R(e,t){return e.msg=n[t],t}function T(e){return(e<<1)-(4<e?9:0)}function D(e){for(var t=e.length;0<=--t;)e[t]=0}function F(e){var t=e.state,r=t.pending;r>e.avail_out&&(r=e.avail_out),0!==r&&(c.arraySet(e.output,t.pending_buf,t.pending_out,r,e.next_out),e.next_out+=r,t.pending_out+=r,e.total_out+=r,e.avail_out-=r,t.pending-=r,0===t.pending&&(t.pending_out=0))}function N(e,t){u._tr_flush_block(e,0<=e.block_start?e.block_start:-1,e.strstart-e.block_start,t),e.block_start=e.strstart,F(e.strm)}function U(e,t){e.pending_buf[e.pending++]=t}function P(e,t){e.pending_buf[e.pending++]=t>>>8&255,e.pending_buf[e.pending++]=255&t}function L(e,t){var r,n,i=e.max_chain_length,s=e.strstart,a=e.prev_length,o=e.nice_match,h=e.strstart>e.w_size-z?e.strstart-(e.w_size-z):0,u=e.window,l=e.w_mask,f=e.prev,c=e.strstart+S,d=u[s+a-1],p=u[s+a];e.prev_length>=e.good_match&&(i>>=2),o>e.lookahead&&(o=e.lookahead);do{if(u[(r=t)+a]===p&&u[r+a-1]===d&&u[r]===u[s]&&u[++r]===u[s+1]){s+=2,r++;do{}while(u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&s<c);if(n=S-(c-s),s=c-S,a<n){if(e.match_start=t,o<=(a=n))break;d=u[s+a-1],p=u[s+a]}}}while((t=f[t&l])>h&&0!=--i);return a<=e.lookahead?a:e.lookahead}function j(e){var t,r,n,i,s,a,o,h,u,l,f=e.w_size;do{if(i=e.window_size-e.lookahead-e.strstart,e.strstart>=f+(f-z)){for(c.arraySet(e.window,e.window,f,f,0),e.match_start-=f,e.strstart-=f,e.block_start-=f,t=r=e.hash_size;n=e.head[--t],e.head[t]=f<=n?n-f:0,--r;);for(t=r=f;n=e.prev[--t],e.prev[t]=f<=n?n-f:0,--r;);i+=f}if(0===e.strm.avail_in)break;if(a=e.strm,o=e.window,h=e.strstart+e.lookahead,u=i,l=void 0,l=a.avail_in,u<l&&(l=u),r=0===l?0:(a.avail_in-=l,c.arraySet(o,a.input,a.next_in,l,h),1===a.state.wrap?a.adler=d(a.adler,o,l,h):2===a.state.wrap&&(a.adler=p(a.adler,o,l,h)),a.next_in+=l,a.total_in+=l,l),e.lookahead+=r,e.lookahead+e.insert>=x)for(s=e.strstart-e.insert,e.ins_h=e.window[s],e.ins_h=(e.ins_h<<e.hash_shift^e.window[s+1])&e.hash_mask;e.insert&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[s+x-1])&e.hash_mask,e.prev[s&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=s,s++,e.insert--,!(e.lookahead+e.insert<x)););}while(e.lookahead<z&&0!==e.strm.avail_in)}function Z(e,t){for(var r,n;;){if(e.lookahead<z){if(j(e),e.lookahead<z&&t===l)return A;if(0===e.lookahead)break}if(r=0,e.lookahead>=x&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart),0!==r&&e.strstart-r<=e.w_size-z&&(e.match_length=L(e,r)),e.match_length>=x)if(n=u._tr_tally(e,e.strstart-e.match_start,e.match_length-x),e.lookahead-=e.match_length,e.match_length<=e.max_lazy_match&&e.lookahead>=x){for(e.match_length--;e.strstart++,e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart,0!=--e.match_length;);e.strstart++}else e.strstart+=e.match_length,e.match_length=0,e.ins_h=e.window[e.strstart],e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+1])&e.hash_mask;else n=u._tr_tally(e,0,e.window[e.strstart]),e.lookahead--,e.strstart++;if(n&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=e.strstart<x-1?e.strstart:x-1,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}function W(e,t){for(var r,n,i;;){if(e.lookahead<z){if(j(e),e.lookahead<z&&t===l)return A;if(0===e.lookahead)break}if(r=0,e.lookahead>=x&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart),e.prev_length=e.match_length,e.prev_match=e.match_start,e.match_length=x-1,0!==r&&e.prev_length<e.max_lazy_match&&e.strstart-r<=e.w_size-z&&(e.match_length=L(e,r),e.match_length<=5&&(1===e.strategy||e.match_length===x&&4096<e.strstart-e.match_start)&&(e.match_length=x-1)),e.prev_length>=x&&e.match_length<=e.prev_length){for(i=e.strstart+e.lookahead-x,n=u._tr_tally(e,e.strstart-1-e.prev_match,e.prev_length-x),e.lookahead-=e.prev_length-1,e.prev_length-=2;++e.strstart<=i&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart),0!=--e.prev_length;);if(e.match_available=0,e.match_length=x-1,e.strstart++,n&&(N(e,!1),0===e.strm.avail_out))return A}else if(e.match_available){if((n=u._tr_tally(e,0,e.window[e.strstart-1]))&&N(e,!1),e.strstart++,e.lookahead--,0===e.strm.avail_out)return A}else e.match_available=1,e.strstart++,e.lookahead--}return e.match_available&&(n=u._tr_tally(e,0,e.window[e.strstart-1]),e.match_available=0),e.insert=e.strstart<x-1?e.strstart:x-1,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}function M(e,t,r,n,i){this.good_length=e,this.max_lazy=t,this.nice_length=r,this.max_chain=n,this.func=i}function H(){this.strm=null,this.status=0,this.pending_buf=null,this.pending_buf_size=0,this.pending_out=0,this.pending=0,this.wrap=0,this.gzhead=null,this.gzindex=0,this.method=v,this.last_flush=-1,this.w_size=0,this.w_bits=0,this.w_mask=0,this.window=null,this.window_size=0,this.prev=null,this.head=null,this.ins_h=0,this.hash_size=0,this.hash_bits=0,this.hash_mask=0,this.hash_shift=0,this.block_start=0,this.match_length=0,this.prev_match=0,this.match_available=0,this.strstart=0,this.match_start=0,this.lookahead=0,this.prev_length=0,this.max_chain_length=0,this.max_lazy_match=0,this.level=0,this.strategy=0,this.good_match=0,this.nice_match=0,this.dyn_ltree=new c.Buf16(2*w),this.dyn_dtree=new c.Buf16(2*(2*a+1)),this.bl_tree=new c.Buf16(2*(2*o+1)),D(this.dyn_ltree),D(this.dyn_dtree),D(this.bl_tree),this.l_desc=null,this.d_desc=null,this.bl_desc=null,this.bl_count=new c.Buf16(k+1),this.heap=new c.Buf16(2*s+1),D(this.heap),this.heap_len=0,this.heap_max=0,this.depth=new c.Buf16(2*s+1),D(this.depth),this.l_buf=0,this.lit_bufsize=0,this.last_lit=0,this.d_buf=0,this.opt_len=0,this.static_len=0,this.matches=0,this.insert=0,this.bi_buf=0,this.bi_valid=0}function G(e){var t;return e&&e.state?(e.total_in=e.total_out=0,e.data_type=i,(t=e.state).pending=0,t.pending_out=0,t.wrap<0&&(t.wrap=-t.wrap),t.status=t.wrap?C:E,e.adler=2===t.wrap?0:1,t.last_flush=l,u._tr_init(t),m):R(e,_)}function K(e){var t=G(e);return t===m&&function(e){e.window_size=2*e.w_size,D(e.head),e.max_lazy_match=h[e.level].max_lazy,e.good_match=h[e.level].good_length,e.nice_match=h[e.level].nice_length,e.max_chain_length=h[e.level].max_chain,e.strstart=0,e.block_start=0,e.lookahead=0,e.insert=0,e.match_length=e.prev_length=x-1,e.match_available=0,e.ins_h=0}(e.state),t}function Y(e,t,r,n,i,s){if(!e)return _;var a=1;if(t===g&&(t=6),n<0?(a=0,n=-n):15<n&&(a=2,n-=16),i<1||y<i||r!==v||n<8||15<n||t<0||9<t||s<0||b<s)return R(e,_);8===n&&(n=9);var o=new H;return(e.state=o).strm=e,o.wrap=a,o.gzhead=null,o.w_bits=n,o.w_size=1<<o.w_bits,o.w_mask=o.w_size-1,o.hash_bits=i+7,o.hash_size=1<<o.hash_bits,o.hash_mask=o.hash_size-1,o.hash_shift=~~((o.hash_bits+x-1)/x),o.window=new c.Buf8(2*o.w_size),o.head=new c.Buf16(o.hash_size),o.prev=new c.Buf16(o.w_size),o.lit_bufsize=1<<i+6,o.pending_buf_size=4*o.lit_bufsize,o.pending_buf=new c.Buf8(o.pending_buf_size),o.d_buf=1*o.lit_bufsize,o.l_buf=3*o.lit_bufsize,o.level=t,o.strategy=s,o.method=r,K(e)}h=[new M(0,0,0,0,function(e,t){var r=65535;for(r>e.pending_buf_size-5&&(r=e.pending_buf_size-5);;){if(e.lookahead<=1){if(j(e),0===e.lookahead&&t===l)return A;if(0===e.lookahead)break}e.strstart+=e.lookahead,e.lookahead=0;var n=e.block_start+r;if((0===e.strstart||e.strstart>=n)&&(e.lookahead=e.strstart-n,e.strstart=n,N(e,!1),0===e.strm.avail_out))return A;if(e.strstart-e.block_start>=e.w_size-z&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=0,t===f?(N(e,!0),0===e.strm.avail_out?O:B):(e.strstart>e.block_start&&(N(e,!1),e.strm.avail_out),A)}),new M(4,4,8,4,Z),new M(4,5,16,8,Z),new M(4,6,32,32,Z),new M(4,4,16,16,W),new M(8,16,32,32,W),new M(8,16,128,128,W),new M(8,32,128,256,W),new M(32,128,258,1024,W),new M(32,258,258,4096,W)],r.deflateInit=function(e,t){return Y(e,t,v,15,8,0)},r.deflateInit2=Y,r.deflateReset=K,r.deflateResetKeep=G,r.deflateSetHeader=function(e,t){return e&&e.state?2!==e.state.wrap?_:(e.state.gzhead=t,m):_},r.deflate=function(e,t){var r,n,i,s;if(!e||!e.state||5<t||t<0)return e?R(e,_):_;if(n=e.state,!e.output||!e.input&&0!==e.avail_in||666===n.status&&t!==f)return R(e,0===e.avail_out?-5:_);if(n.strm=e,r=n.last_flush,n.last_flush=t,n.status===C)if(2===n.wrap)e.adler=0,U(n,31),U(n,139),U(n,8),n.gzhead?(U(n,(n.gzhead.text?1:0)+(n.gzhead.hcrc?2:0)+(n.gzhead.extra?4:0)+(n.gzhead.name?8:0)+(n.gzhead.comment?16:0)),U(n,255&n.gzhead.time),U(n,n.gzhead.time>>8&255),U(n,n.gzhead.time>>16&255),U(n,n.gzhead.time>>24&255),U(n,9===n.level?2:2<=n.strategy||n.level<2?4:0),U(n,255&n.gzhead.os),n.gzhead.extra&&n.gzhead.extra.length&&(U(n,255&n.gzhead.extra.length),U(n,n.gzhead.extra.length>>8&255)),n.gzhead.hcrc&&(e.adler=p(e.adler,n.pending_buf,n.pending,0)),n.gzindex=0,n.status=69):(U(n,0),U(n,0),U(n,0),U(n,0),U(n,0),U(n,9===n.level?2:2<=n.strategy||n.level<2?4:0),U(n,3),n.status=E);else{var a=v+(n.w_bits-8<<4)<<8;a|=(2<=n.strategy||n.level<2?0:n.level<6?1:6===n.level?2:3)<<6,0!==n.strstart&&(a|=32),a+=31-a%31,n.status=E,P(n,a),0!==n.strstart&&(P(n,e.adler>>>16),P(n,65535&e.adler)),e.adler=1}if(69===n.status)if(n.gzhead.extra){for(i=n.pending;n.gzindex<(65535&n.gzhead.extra.length)&&(n.pending!==n.pending_buf_size||(n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),F(e),i=n.pending,n.pending!==n.pending_buf_size));)U(n,255&n.gzhead.extra[n.gzindex]),n.gzindex++;n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),n.gzindex===n.gzhead.extra.length&&(n.gzindex=0,n.status=73)}else n.status=73;if(73===n.status)if(n.gzhead.name){i=n.pending;do{if(n.pending===n.pending_buf_size&&(n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),F(e),i=n.pending,n.pending===n.pending_buf_size)){s=1;break}s=n.gzindex<n.gzhead.name.length?255&n.gzhead.name.charCodeAt(n.gzindex++):0,U(n,s)}while(0!==s);n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),0===s&&(n.gzindex=0,n.status=91)}else n.status=91;if(91===n.status)if(n.gzhead.comment){i=n.pending;do{if(n.pending===n.pending_buf_size&&(n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),F(e),i=n.pending,n.pending===n.pending_buf_size)){s=1;break}s=n.gzindex<n.gzhead.comment.length?255&n.gzhead.comment.charCodeAt(n.gzindex++):0,U(n,s)}while(0!==s);n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),0===s&&(n.status=103)}else n.status=103;if(103===n.status&&(n.gzhead.hcrc?(n.pending+2>n.pending_buf_size&&F(e),n.pending+2<=n.pending_buf_size&&(U(n,255&e.adler),U(n,e.adler>>8&255),e.adler=0,n.status=E)):n.status=E),0!==n.pending){if(F(e),0===e.avail_out)return n.last_flush=-1,m}else if(0===e.avail_in&&T(t)<=T(r)&&t!==f)return R(e,-5);if(666===n.status&&0!==e.avail_in)return R(e,-5);if(0!==e.avail_in||0!==n.lookahead||t!==l&&666!==n.status){var o=2===n.strategy?function(e,t){for(var r;;){if(0===e.lookahead&&(j(e),0===e.lookahead)){if(t===l)return A;break}if(e.match_length=0,r=u._tr_tally(e,0,e.window[e.strstart]),e.lookahead--,e.strstart++,r&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=0,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}(n,t):3===n.strategy?function(e,t){for(var r,n,i,s,a=e.window;;){if(e.lookahead<=S){if(j(e),e.lookahead<=S&&t===l)return A;if(0===e.lookahead)break}if(e.match_length=0,e.lookahead>=x&&0<e.strstart&&(n=a[i=e.strstart-1])===a[++i]&&n===a[++i]&&n===a[++i]){s=e.strstart+S;do{}while(n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&i<s);e.match_length=S-(s-i),e.match_length>e.lookahead&&(e.match_length=e.lookahead)}if(e.match_length>=x?(r=u._tr_tally(e,1,e.match_length-x),e.lookahead-=e.match_length,e.strstart+=e.match_length,e.match_length=0):(r=u._tr_tally(e,0,e.window[e.strstart]),e.lookahead--,e.strstart++),r&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=0,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}(n,t):h[n.level].func(n,t);if(o!==O&&o!==B||(n.status=666),o===A||o===O)return 0===e.avail_out&&(n.last_flush=-1),m;if(o===I&&(1===t?u._tr_align(n):5!==t&&(u._tr_stored_block(n,0,0,!1),3===t&&(D(n.head),0===n.lookahead&&(n.strstart=0,n.block_start=0,n.insert=0))),F(e),0===e.avail_out))return n.last_flush=-1,m}return t!==f?m:n.wrap<=0?1:(2===n.wrap?(U(n,255&e.adler),U(n,e.adler>>8&255),U(n,e.adler>>16&255),U(n,e.adler>>24&255),U(n,255&e.total_in),U(n,e.total_in>>8&255),U(n,e.total_in>>16&255),U(n,e.total_in>>24&255)):(P(n,e.adler>>>16),P(n,65535&e.adler)),F(e),0<n.wrap&&(n.wrap=-n.wrap),0!==n.pending?m:1)},r.deflateEnd=function(e){var t;return e&&e.state?(t=e.state.status)!==C&&69!==t&&73!==t&&91!==t&&103!==t&&t!==E&&666!==t?R(e,_):(e.state=null,t===E?R(e,-3):m):_},r.deflateSetDictionary=function(e,t){var r,n,i,s,a,o,h,u,l=t.length;if(!e||!e.state)return _;if(2===(s=(r=e.state).wrap)||1===s&&r.status!==C||r.lookahead)return _;for(1===s&&(e.adler=d(e.adler,t,l,0)),r.wrap=0,l>=r.w_size&&(0===s&&(D(r.head),r.strstart=0,r.block_start=0,r.insert=0),u=new c.Buf8(r.w_size),c.arraySet(u,t,l-r.w_size,r.w_size,0),t=u,l=r.w_size),a=e.avail_in,o=e.next_in,h=e.input,e.avail_in=l,e.next_in=0,e.input=t,j(r);r.lookahead>=x;){for(n=r.strstart,i=r.lookahead-(x-1);r.ins_h=(r.ins_h<<r.hash_shift^r.window[n+x-1])&r.hash_mask,r.prev[n&r.w_mask]=r.head[r.ins_h],r.head[r.ins_h]=n,n++,--i;);r.strstart=n,r.lookahead=x-1,j(r)}return r.strstart+=r.lookahead,r.block_start=r.strstart,r.insert=r.lookahead,r.lookahead=0,r.match_length=r.prev_length=x-1,r.match_available=0,e.next_in=o,e.input=h,e.avail_in=a,r.wrap=s,m},r.deflateInfo="pako deflate (from Nodeca project)"},{"../utils/common":41,"./adler32":43,"./crc32":45,"./messages":51,"./trees":52}],47:[function(e,t,r){"use strict";t.exports=function(){this.text=0,this.time=0,this.xflags=0,this.os=0,this.extra=null,this.extra_len=0,this.name="",this.comment="",this.hcrc=0,this.done=!1}},{}],48:[function(e,t,r){"use strict";t.exports=function(e,t){var r,n,i,s,a,o,h,u,l,f,c,d,p,m,_,g,b,v,y,w,k,x,S,z,C;r=e.state,n=e.next_in,z=e.input,i=n+(e.avail_in-5),s=e.next_out,C=e.output,a=s-(t-e.avail_out),o=s+(e.avail_out-257),h=r.dmax,u=r.wsize,l=r.whave,f=r.wnext,c=r.window,d=r.hold,p=r.bits,m=r.lencode,_=r.distcode,g=(1<<r.lenbits)-1,b=(1<<r.distbits)-1;e:do{p<15&&(d+=z[n++]<<p,p+=8,d+=z[n++]<<p,p+=8),v=m[d&g];t:for(;;){if(d>>>=y=v>>>24,p-=y,0===(y=v>>>16&255))C[s++]=65535&v;else{if(!(16&y)){if(0==(64&y)){v=m[(65535&v)+(d&(1<<y)-1)];continue t}if(32&y){r.mode=12;break e}e.msg="invalid literal/length code",r.mode=30;break e}w=65535&v,(y&=15)&&(p<y&&(d+=z[n++]<<p,p+=8),w+=d&(1<<y)-1,d>>>=y,p-=y),p<15&&(d+=z[n++]<<p,p+=8,d+=z[n++]<<p,p+=8),v=_[d&b];r:for(;;){if(d>>>=y=v>>>24,p-=y,!(16&(y=v>>>16&255))){if(0==(64&y)){v=_[(65535&v)+(d&(1<<y)-1)];continue r}e.msg="invalid distance code",r.mode=30;break e}if(k=65535&v,p<(y&=15)&&(d+=z[n++]<<p,(p+=8)<y&&(d+=z[n++]<<p,p+=8)),h<(k+=d&(1<<y)-1)){e.msg="invalid distance too far back",r.mode=30;break e}if(d>>>=y,p-=y,(y=s-a)<k){if(l<(y=k-y)&&r.sane){e.msg="invalid distance too far back",r.mode=30;break e}if(S=c,(x=0)===f){if(x+=u-y,y<w){for(w-=y;C[s++]=c[x++],--y;);x=s-k,S=C}}else if(f<y){if(x+=u+f-y,(y-=f)<w){for(w-=y;C[s++]=c[x++],--y;);if(x=0,f<w){for(w-=y=f;C[s++]=c[x++],--y;);x=s-k,S=C}}}else if(x+=f-y,y<w){for(w-=y;C[s++]=c[x++],--y;);x=s-k,S=C}for(;2<w;)C[s++]=S[x++],C[s++]=S[x++],C[s++]=S[x++],w-=3;w&&(C[s++]=S[x++],1<w&&(C[s++]=S[x++]))}else{for(x=s-k;C[s++]=C[x++],C[s++]=C[x++],C[s++]=C[x++],2<(w-=3););w&&(C[s++]=C[x++],1<w&&(C[s++]=C[x++]))}break}}break}}while(n<i&&s<o);n-=w=p>>3,d&=(1<<(p-=w<<3))-1,e.next_in=n,e.next_out=s,e.avail_in=n<i?i-n+5:5-(n-i),e.avail_out=s<o?o-s+257:257-(s-o),r.hold=d,r.bits=p}},{}],49:[function(e,t,r){"use strict";var I=e("../utils/common"),O=e("./adler32"),B=e("./crc32"),R=e("./inffast"),T=e("./inftrees"),D=1,F=2,N=0,U=-2,P=1,n=852,i=592;function L(e){return(e>>>24&255)+(e>>>8&65280)+((65280&e)<<8)+((255&e)<<24)}function s(){this.mode=0,this.last=!1,this.wrap=0,this.havedict=!1,this.flags=0,this.dmax=0,this.check=0,this.total=0,this.head=null,this.wbits=0,this.wsize=0,this.whave=0,this.wnext=0,this.window=null,this.hold=0,this.bits=0,this.length=0,this.offset=0,this.extra=0,this.lencode=null,this.distcode=null,this.lenbits=0,this.distbits=0,this.ncode=0,this.nlen=0,this.ndist=0,this.have=0,this.next=null,this.lens=new I.Buf16(320),this.work=new I.Buf16(288),this.lendyn=null,this.distdyn=null,this.sane=0,this.back=0,this.was=0}function a(e){var t;return e&&e.state?(t=e.state,e.total_in=e.total_out=t.total=0,e.msg="",t.wrap&&(e.adler=1&t.wrap),t.mode=P,t.last=0,t.havedict=0,t.dmax=32768,t.head=null,t.hold=0,t.bits=0,t.lencode=t.lendyn=new I.Buf32(n),t.distcode=t.distdyn=new I.Buf32(i),t.sane=1,t.back=-1,N):U}function o(e){var t;return e&&e.state?((t=e.state).wsize=0,t.whave=0,t.wnext=0,a(e)):U}function h(e,t){var r,n;return e&&e.state?(n=e.state,t<0?(r=0,t=-t):(r=1+(t>>4),t<48&&(t&=15)),t&&(t<8||15<t)?U:(null!==n.window&&n.wbits!==t&&(n.window=null),n.wrap=r,n.wbits=t,o(e))):U}function u(e,t){var r,n;return e?(n=new s,(e.state=n).window=null,(r=h(e,t))!==N&&(e.state=null),r):U}var l,f,c=!0;function j(e){if(c){var t;for(l=new I.Buf32(512),f=new I.Buf32(32),t=0;t<144;)e.lens[t++]=8;for(;t<256;)e.lens[t++]=9;for(;t<280;)e.lens[t++]=7;for(;t<288;)e.lens[t++]=8;for(T(D,e.lens,0,288,l,0,e.work,{bits:9}),t=0;t<32;)e.lens[t++]=5;T(F,e.lens,0,32,f,0,e.work,{bits:5}),c=!1}e.lencode=l,e.lenbits=9,e.distcode=f,e.distbits=5}function Z(e,t,r,n){var i,s=e.state;return null===s.window&&(s.wsize=1<<s.wbits,s.wnext=0,s.whave=0,s.window=new I.Buf8(s.wsize)),n>=s.wsize?(I.arraySet(s.window,t,r-s.wsize,s.wsize,0),s.wnext=0,s.whave=s.wsize):(n<(i=s.wsize-s.wnext)&&(i=n),I.arraySet(s.window,t,r-n,i,s.wnext),(n-=i)?(I.arraySet(s.window,t,r-n,n,0),s.wnext=n,s.whave=s.wsize):(s.wnext+=i,s.wnext===s.wsize&&(s.wnext=0),s.whave<s.wsize&&(s.whave+=i))),0}r.inflateReset=o,r.inflateReset2=h,r.inflateResetKeep=a,r.inflateInit=function(e){return u(e,15)},r.inflateInit2=u,r.inflate=function(e,t){var r,n,i,s,a,o,h,u,l,f,c,d,p,m,_,g,b,v,y,w,k,x,S,z,C=0,E=new I.Buf8(4),A=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];if(!e||!e.state||!e.output||!e.input&&0!==e.avail_in)return U;12===(r=e.state).mode&&(r.mode=13),a=e.next_out,i=e.output,h=e.avail_out,s=e.next_in,n=e.input,o=e.avail_in,u=r.hold,l=r.bits,f=o,c=h,x=N;e:for(;;)switch(r.mode){case P:if(0===r.wrap){r.mode=13;break}for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(2&r.wrap&&35615===u){E[r.check=0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0),l=u=0,r.mode=2;break}if(r.flags=0,r.head&&(r.head.done=!1),!(1&r.wrap)||(((255&u)<<8)+(u>>8))%31){e.msg="incorrect header check",r.mode=30;break}if(8!=(15&u)){e.msg="unknown compression method",r.mode=30;break}if(l-=4,k=8+(15&(u>>>=4)),0===r.wbits)r.wbits=k;else if(k>r.wbits){e.msg="invalid window size",r.mode=30;break}r.dmax=1<<k,e.adler=r.check=1,r.mode=512&u?10:12,l=u=0;break;case 2:for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(r.flags=u,8!=(255&r.flags)){e.msg="unknown compression method",r.mode=30;break}if(57344&r.flags){e.msg="unknown header flags set",r.mode=30;break}r.head&&(r.head.text=u>>8&1),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0)),l=u=0,r.mode=3;case 3:for(;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.head&&(r.head.time=u),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,E[2]=u>>>16&255,E[3]=u>>>24&255,r.check=B(r.check,E,4,0)),l=u=0,r.mode=4;case 4:for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.head&&(r.head.xflags=255&u,r.head.os=u>>8),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0)),l=u=0,r.mode=5;case 5:if(1024&r.flags){for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.length=u,r.head&&(r.head.extra_len=u),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0)),l=u=0}else r.head&&(r.head.extra=null);r.mode=6;case 6:if(1024&r.flags&&(o<(d=r.length)&&(d=o),d&&(r.head&&(k=r.head.extra_len-r.length,r.head.extra||(r.head.extra=new Array(r.head.extra_len)),I.arraySet(r.head.extra,n,s,d,k)),512&r.flags&&(r.check=B(r.check,n,d,s)),o-=d,s+=d,r.length-=d),r.length))break e;r.length=0,r.mode=7;case 7:if(2048&r.flags){if(0===o)break e;for(d=0;k=n[s+d++],r.head&&k&&r.length<65536&&(r.head.name+=String.fromCharCode(k)),k&&d<o;);if(512&r.flags&&(r.check=B(r.check,n,d,s)),o-=d,s+=d,k)break e}else r.head&&(r.head.name=null);r.length=0,r.mode=8;case 8:if(4096&r.flags){if(0===o)break e;for(d=0;k=n[s+d++],r.head&&k&&r.length<65536&&(r.head.comment+=String.fromCharCode(k)),k&&d<o;);if(512&r.flags&&(r.check=B(r.check,n,d,s)),o-=d,s+=d,k)break e}else r.head&&(r.head.comment=null);r.mode=9;case 9:if(512&r.flags){for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(u!==(65535&r.check)){e.msg="header crc mismatch",r.mode=30;break}l=u=0}r.head&&(r.head.hcrc=r.flags>>9&1,r.head.done=!0),e.adler=r.check=0,r.mode=12;break;case 10:for(;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}e.adler=r.check=L(u),l=u=0,r.mode=11;case 11:if(0===r.havedict)return e.next_out=a,e.avail_out=h,e.next_in=s,e.avail_in=o,r.hold=u,r.bits=l,2;e.adler=r.check=1,r.mode=12;case 12:if(5===t||6===t)break e;case 13:if(r.last){u>>>=7&l,l-=7&l,r.mode=27;break}for(;l<3;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}switch(r.last=1&u,l-=1,3&(u>>>=1)){case 0:r.mode=14;break;case 1:if(j(r),r.mode=20,6!==t)break;u>>>=2,l-=2;break e;case 2:r.mode=17;break;case 3:e.msg="invalid block type",r.mode=30}u>>>=2,l-=2;break;case 14:for(u>>>=7&l,l-=7&l;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if((65535&u)!=(u>>>16^65535)){e.msg="invalid stored block lengths",r.mode=30;break}if(r.length=65535&u,l=u=0,r.mode=15,6===t)break e;case 15:r.mode=16;case 16:if(d=r.length){if(o<d&&(d=o),h<d&&(d=h),0===d)break e;I.arraySet(i,n,s,d,a),o-=d,s+=d,h-=d,a+=d,r.length-=d;break}r.mode=12;break;case 17:for(;l<14;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(r.nlen=257+(31&u),u>>>=5,l-=5,r.ndist=1+(31&u),u>>>=5,l-=5,r.ncode=4+(15&u),u>>>=4,l-=4,286<r.nlen||30<r.ndist){e.msg="too many length or distance symbols",r.mode=30;break}r.have=0,r.mode=18;case 18:for(;r.have<r.ncode;){for(;l<3;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.lens[A[r.have++]]=7&u,u>>>=3,l-=3}for(;r.have<19;)r.lens[A[r.have++]]=0;if(r.lencode=r.lendyn,r.lenbits=7,S={bits:r.lenbits},x=T(0,r.lens,0,19,r.lencode,0,r.work,S),r.lenbits=S.bits,x){e.msg="invalid code lengths set",r.mode=30;break}r.have=0,r.mode=19;case 19:for(;r.have<r.nlen+r.ndist;){for(;g=(C=r.lencode[u&(1<<r.lenbits)-1])>>>16&255,b=65535&C,!((_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(b<16)u>>>=_,l-=_,r.lens[r.have++]=b;else{if(16===b){for(z=_+2;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(u>>>=_,l-=_,0===r.have){e.msg="invalid bit length repeat",r.mode=30;break}k=r.lens[r.have-1],d=3+(3&u),u>>>=2,l-=2}else if(17===b){for(z=_+3;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}l-=_,k=0,d=3+(7&(u>>>=_)),u>>>=3,l-=3}else{for(z=_+7;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}l-=_,k=0,d=11+(127&(u>>>=_)),u>>>=7,l-=7}if(r.have+d>r.nlen+r.ndist){e.msg="invalid bit length repeat",r.mode=30;break}for(;d--;)r.lens[r.have++]=k}}if(30===r.mode)break;if(0===r.lens[256]){e.msg="invalid code -- missing end-of-block",r.mode=30;break}if(r.lenbits=9,S={bits:r.lenbits},x=T(D,r.lens,0,r.nlen,r.lencode,0,r.work,S),r.lenbits=S.bits,x){e.msg="invalid literal/lengths set",r.mode=30;break}if(r.distbits=6,r.distcode=r.distdyn,S={bits:r.distbits},x=T(F,r.lens,r.nlen,r.ndist,r.distcode,0,r.work,S),r.distbits=S.bits,x){e.msg="invalid distances set",r.mode=30;break}if(r.mode=20,6===t)break e;case 20:r.mode=21;case 21:if(6<=o&&258<=h){e.next_out=a,e.avail_out=h,e.next_in=s,e.avail_in=o,r.hold=u,r.bits=l,R(e,c),a=e.next_out,i=e.output,h=e.avail_out,s=e.next_in,n=e.input,o=e.avail_in,u=r.hold,l=r.bits,12===r.mode&&(r.back=-1);break}for(r.back=0;g=(C=r.lencode[u&(1<<r.lenbits)-1])>>>16&255,b=65535&C,!((_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(g&&0==(240&g)){for(v=_,y=g,w=b;g=(C=r.lencode[w+((u&(1<<v+y)-1)>>v)])>>>16&255,b=65535&C,!(v+(_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}u>>>=v,l-=v,r.back+=v}if(u>>>=_,l-=_,r.back+=_,r.length=b,0===g){r.mode=26;break}if(32&g){r.back=-1,r.mode=12;break}if(64&g){e.msg="invalid literal/length code",r.mode=30;break}r.extra=15&g,r.mode=22;case 22:if(r.extra){for(z=r.extra;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.length+=u&(1<<r.extra)-1,u>>>=r.extra,l-=r.extra,r.back+=r.extra}r.was=r.length,r.mode=23;case 23:for(;g=(C=r.distcode[u&(1<<r.distbits)-1])>>>16&255,b=65535&C,!((_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(0==(240&g)){for(v=_,y=g,w=b;g=(C=r.distcode[w+((u&(1<<v+y)-1)>>v)])>>>16&255,b=65535&C,!(v+(_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}u>>>=v,l-=v,r.back+=v}if(u>>>=_,l-=_,r.back+=_,64&g){e.msg="invalid distance code",r.mode=30;break}r.offset=b,r.extra=15&g,r.mode=24;case 24:if(r.extra){for(z=r.extra;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.offset+=u&(1<<r.extra)-1,u>>>=r.extra,l-=r.extra,r.back+=r.extra}if(r.offset>r.dmax){e.msg="invalid distance too far back",r.mode=30;break}r.mode=25;case 25:if(0===h)break e;if(d=c-h,r.offset>d){if((d=r.offset-d)>r.whave&&r.sane){e.msg="invalid distance too far back",r.mode=30;break}p=d>r.wnext?(d-=r.wnext,r.wsize-d):r.wnext-d,d>r.length&&(d=r.length),m=r.window}else m=i,p=a-r.offset,d=r.length;for(h<d&&(d=h),h-=d,r.length-=d;i[a++]=m[p++],--d;);0===r.length&&(r.mode=21);break;case 26:if(0===h)break e;i[a++]=r.length,h--,r.mode=21;break;case 27:if(r.wrap){for(;l<32;){if(0===o)break e;o--,u|=n[s++]<<l,l+=8}if(c-=h,e.total_out+=c,r.total+=c,c&&(e.adler=r.check=r.flags?B(r.check,i,c,a-c):O(r.check,i,c,a-c)),c=h,(r.flags?u:L(u))!==r.check){e.msg="incorrect data check",r.mode=30;break}l=u=0}r.mode=28;case 28:if(r.wrap&&r.flags){for(;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(u!==(4294967295&r.total)){e.msg="incorrect length check",r.mode=30;break}l=u=0}r.mode=29;case 29:x=1;break e;case 30:x=-3;break e;case 31:return-4;case 32:default:return U}return e.next_out=a,e.avail_out=h,e.next_in=s,e.avail_in=o,r.hold=u,r.bits=l,(r.wsize||c!==e.avail_out&&r.mode<30&&(r.mode<27||4!==t))&&Z(e,e.output,e.next_out,c-e.avail_out)?(r.mode=31,-4):(f-=e.avail_in,c-=e.avail_out,e.total_in+=f,e.total_out+=c,r.total+=c,r.wrap&&c&&(e.adler=r.check=r.flags?B(r.check,i,c,e.next_out-c):O(r.check,i,c,e.next_out-c)),e.data_type=r.bits+(r.last?64:0)+(12===r.mode?128:0)+(20===r.mode||15===r.mode?256:0),(0==f&&0===c||4===t)&&x===N&&(x=-5),x)},r.inflateEnd=function(e){if(!e||!e.state)return U;var t=e.state;return t.window&&(t.window=null),e.state=null,N},r.inflateGetHeader=function(e,t){var r;return e&&e.state?0==(2&(r=e.state).wrap)?U:((r.head=t).done=!1,N):U},r.inflateSetDictionary=function(e,t){var r,n=t.length;return e&&e.state?0!==(r=e.state).wrap&&11!==r.mode?U:11===r.mode&&O(1,t,n,0)!==r.check?-3:Z(e,t,n,n)?(r.mode=31,-4):(r.havedict=1,N):U},r.inflateInfo="pako inflate (from Nodeca project)"},{"../utils/common":41,"./adler32":43,"./crc32":45,"./inffast":48,"./inftrees":50}],50:[function(e,t,r){"use strict";var D=e("../utils/common"),F=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258,0,0],N=[16,16,16,16,16,16,16,16,17,17,17,17,18,18,18,18,19,19,19,19,20,20,20,20,21,21,21,21,16,72,78],U=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577,0,0],P=[16,16,16,16,17,17,18,18,19,19,20,20,21,21,22,22,23,23,24,24,25,25,26,26,27,27,28,28,29,29,64,64];t.exports=function(e,t,r,n,i,s,a,o){var h,u,l,f,c,d,p,m,_,g=o.bits,b=0,v=0,y=0,w=0,k=0,x=0,S=0,z=0,C=0,E=0,A=null,I=0,O=new D.Buf16(16),B=new D.Buf16(16),R=null,T=0;for(b=0;b<=15;b++)O[b]=0;for(v=0;v<n;v++)O[t[r+v]]++;for(k=g,w=15;1<=w&&0===O[w];w--);if(w<k&&(k=w),0===w)return i[s++]=20971520,i[s++]=20971520,o.bits=1,0;for(y=1;y<w&&0===O[y];y++);for(k<y&&(k=y),b=z=1;b<=15;b++)if(z<<=1,(z-=O[b])<0)return-1;if(0<z&&(0===e||1!==w))return-1;for(B[1]=0,b=1;b<15;b++)B[b+1]=B[b]+O[b];for(v=0;v<n;v++)0!==t[r+v]&&(a[B[t[r+v]]++]=v);if(d=0===e?(A=R=a,19):1===e?(A=F,I-=257,R=N,T-=257,256):(A=U,R=P,-1),b=y,c=s,S=v=E=0,l=-1,f=(C=1<<(x=k))-1,1===e&&852<C||2===e&&592<C)return 1;for(;;){for(p=b-S,_=a[v]<d?(m=0,a[v]):a[v]>d?(m=R[T+a[v]],A[I+a[v]]):(m=96,0),h=1<<b-S,y=u=1<<x;i[c+(E>>S)+(u-=h)]=p<<24|m<<16|_|0,0!==u;);for(h=1<<b-1;E&h;)h>>=1;if(0!==h?(E&=h-1,E+=h):E=0,v++,0==--O[b]){if(b===w)break;b=t[r+a[v]]}if(k<b&&(E&f)!==l){for(0===S&&(S=k),c+=y,z=1<<(x=b-S);x+S<w&&!((z-=O[x+S])<=0);)x++,z<<=1;if(C+=1<<x,1===e&&852<C||2===e&&592<C)return 1;i[l=E&f]=k<<24|x<<16|c-s|0}}return 0!==E&&(i[c+E]=b-S<<24|64<<16|0),o.bits=k,0}},{"../utils/common":41}],51:[function(e,t,r){"use strict";t.exports={2:"need dictionary",1:"stream end",0:"","-1":"file error","-2":"stream error","-3":"data error","-4":"insufficient memory","-5":"buffer error","-6":"incompatible version"}},{}],52:[function(e,t,r){"use strict";var i=e("../utils/common"),o=0,h=1;function n(e){for(var t=e.length;0<=--t;)e[t]=0}var s=0,a=29,u=256,l=u+1+a,f=30,c=19,_=2*l+1,g=15,d=16,p=7,m=256,b=16,v=17,y=18,w=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],k=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13],x=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,3,7],S=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],z=new Array(2*(l+2));n(z);var C=new Array(2*f);n(C);var E=new Array(512);n(E);var A=new Array(256);n(A);var I=new Array(a);n(I);var O,B,R,T=new Array(f);function D(e,t,r,n,i){this.static_tree=e,this.extra_bits=t,this.extra_base=r,this.elems=n,this.max_length=i,this.has_stree=e&&e.length}function F(e,t){this.dyn_tree=e,this.max_code=0,this.stat_desc=t}function N(e){return e<256?E[e]:E[256+(e>>>7)]}function U(e,t){e.pending_buf[e.pending++]=255&t,e.pending_buf[e.pending++]=t>>>8&255}function P(e,t,r){e.bi_valid>d-r?(e.bi_buf|=t<<e.bi_valid&65535,U(e,e.bi_buf),e.bi_buf=t>>d-e.bi_valid,e.bi_valid+=r-d):(e.bi_buf|=t<<e.bi_valid&65535,e.bi_valid+=r)}function L(e,t,r){P(e,r[2*t],r[2*t+1])}function j(e,t){for(var r=0;r|=1&e,e>>>=1,r<<=1,0<--t;);return r>>>1}function Z(e,t,r){var n,i,s=new Array(g+1),a=0;for(n=1;n<=g;n++)s[n]=a=a+r[n-1]<<1;for(i=0;i<=t;i++){var o=e[2*i+1];0!==o&&(e[2*i]=j(s[o]++,o))}}function W(e){var t;for(t=0;t<l;t++)e.dyn_ltree[2*t]=0;for(t=0;t<f;t++)e.dyn_dtree[2*t]=0;for(t=0;t<c;t++)e.bl_tree[2*t]=0;e.dyn_ltree[2*m]=1,e.opt_len=e.static_len=0,e.last_lit=e.matches=0}function M(e){8<e.bi_valid?U(e,e.bi_buf):0<e.bi_valid&&(e.pending_buf[e.pending++]=e.bi_buf),e.bi_buf=0,e.bi_valid=0}function H(e,t,r,n){var i=2*t,s=2*r;return e[i]<e[s]||e[i]===e[s]&&n[t]<=n[r]}function G(e,t,r){for(var n=e.heap[r],i=r<<1;i<=e.heap_len&&(i<e.heap_len&&H(t,e.heap[i+1],e.heap[i],e.depth)&&i++,!H(t,n,e.heap[i],e.depth));)e.heap[r]=e.heap[i],r=i,i<<=1;e.heap[r]=n}function K(e,t,r){var n,i,s,a,o=0;if(0!==e.last_lit)for(;n=e.pending_buf[e.d_buf+2*o]<<8|e.pending_buf[e.d_buf+2*o+1],i=e.pending_buf[e.l_buf+o],o++,0===n?L(e,i,t):(L(e,(s=A[i])+u+1,t),0!==(a=w[s])&&P(e,i-=I[s],a),L(e,s=N(--n),r),0!==(a=k[s])&&P(e,n-=T[s],a)),o<e.last_lit;);L(e,m,t)}function Y(e,t){var r,n,i,s=t.dyn_tree,a=t.stat_desc.static_tree,o=t.stat_desc.has_stree,h=t.stat_desc.elems,u=-1;for(e.heap_len=0,e.heap_max=_,r=0;r<h;r++)0!==s[2*r]?(e.heap[++e.heap_len]=u=r,e.depth[r]=0):s[2*r+1]=0;for(;e.heap_len<2;)s[2*(i=e.heap[++e.heap_len]=u<2?++u:0)]=1,e.depth[i]=0,e.opt_len--,o&&(e.static_len-=a[2*i+1]);for(t.max_code=u,r=e.heap_len>>1;1<=r;r--)G(e,s,r);for(i=h;r=e.heap[1],e.heap[1]=e.heap[e.heap_len--],G(e,s,1),n=e.heap[1],e.heap[--e.heap_max]=r,e.heap[--e.heap_max]=n,s[2*i]=s[2*r]+s[2*n],e.depth[i]=(e.depth[r]>=e.depth[n]?e.depth[r]:e.depth[n])+1,s[2*r+1]=s[2*n+1]=i,e.heap[1]=i++,G(e,s,1),2<=e.heap_len;);e.heap[--e.heap_max]=e.heap[1],function(e,t){var r,n,i,s,a,o,h=t.dyn_tree,u=t.max_code,l=t.stat_desc.static_tree,f=t.stat_desc.has_stree,c=t.stat_desc.extra_bits,d=t.stat_desc.extra_base,p=t.stat_desc.max_length,m=0;for(s=0;s<=g;s++)e.bl_count[s]=0;for(h[2*e.heap[e.heap_max]+1]=0,r=e.heap_max+1;r<_;r++)p<(s=h[2*h[2*(n=e.heap[r])+1]+1]+1)&&(s=p,m++),h[2*n+1]=s,u<n||(e.bl_count[s]++,a=0,d<=n&&(a=c[n-d]),o=h[2*n],e.opt_len+=o*(s+a),f&&(e.static_len+=o*(l[2*n+1]+a)));if(0!==m){do{for(s=p-1;0===e.bl_count[s];)s--;e.bl_count[s]--,e.bl_count[s+1]+=2,e.bl_count[p]--,m-=2}while(0<m);for(s=p;0!==s;s--)for(n=e.bl_count[s];0!==n;)u<(i=e.heap[--r])||(h[2*i+1]!==s&&(e.opt_len+=(s-h[2*i+1])*h[2*i],h[2*i+1]=s),n--)}}(e,t),Z(s,u,e.bl_count)}function X(e,t,r){var n,i,s=-1,a=t[1],o=0,h=7,u=4;for(0===a&&(h=138,u=3),t[2*(r+1)+1]=65535,n=0;n<=r;n++)i=a,a=t[2*(n+1)+1],++o<h&&i===a||(o<u?e.bl_tree[2*i]+=o:0!==i?(i!==s&&e.bl_tree[2*i]++,e.bl_tree[2*b]++):o<=10?e.bl_tree[2*v]++:e.bl_tree[2*y]++,s=i,u=(o=0)===a?(h=138,3):i===a?(h=6,3):(h=7,4))}function V(e,t,r){var n,i,s=-1,a=t[1],o=0,h=7,u=4;for(0===a&&(h=138,u=3),n=0;n<=r;n++)if(i=a,a=t[2*(n+1)+1],!(++o<h&&i===a)){if(o<u)for(;L(e,i,e.bl_tree),0!=--o;);else 0!==i?(i!==s&&(L(e,i,e.bl_tree),o--),L(e,b,e.bl_tree),P(e,o-3,2)):o<=10?(L(e,v,e.bl_tree),P(e,o-3,3)):(L(e,y,e.bl_tree),P(e,o-11,7));s=i,u=(o=0)===a?(h=138,3):i===a?(h=6,3):(h=7,4)}}n(T);var q=!1;function J(e,t,r,n){P(e,(s<<1)+(n?1:0),3),function(e,t,r,n){M(e),n&&(U(e,r),U(e,~r)),i.arraySet(e.pending_buf,e.window,t,r,e.pending),e.pending+=r}(e,t,r,!0)}r._tr_init=function(e){q||(function(){var e,t,r,n,i,s=new Array(g+1);for(n=r=0;n<a-1;n++)for(I[n]=r,e=0;e<1<<w[n];e++)A[r++]=n;for(A[r-1]=n,n=i=0;n<16;n++)for(T[n]=i,e=0;e<1<<k[n];e++)E[i++]=n;for(i>>=7;n<f;n++)for(T[n]=i<<7,e=0;e<1<<k[n]-7;e++)E[256+i++]=n;for(t=0;t<=g;t++)s[t]=0;for(e=0;e<=143;)z[2*e+1]=8,e++,s[8]++;for(;e<=255;)z[2*e+1]=9,e++,s[9]++;for(;e<=279;)z[2*e+1]=7,e++,s[7]++;for(;e<=287;)z[2*e+1]=8,e++,s[8]++;for(Z(z,l+1,s),e=0;e<f;e++)C[2*e+1]=5,C[2*e]=j(e,5);O=new D(z,w,u+1,l,g),B=new D(C,k,0,f,g),R=new D(new Array(0),x,0,c,p)}(),q=!0),e.l_desc=new F(e.dyn_ltree,O),e.d_desc=new F(e.dyn_dtree,B),e.bl_desc=new F(e.bl_tree,R),e.bi_buf=0,e.bi_valid=0,W(e)},r._tr_stored_block=J,r._tr_flush_block=function(e,t,r,n){var i,s,a=0;0<e.level?(2===e.strm.data_type&&(e.strm.data_type=function(e){var t,r=4093624447;for(t=0;t<=31;t++,r>>>=1)if(1&r&&0!==e.dyn_ltree[2*t])return o;if(0!==e.dyn_ltree[18]||0!==e.dyn_ltree[20]||0!==e.dyn_ltree[26])return h;for(t=32;t<u;t++)if(0!==e.dyn_ltree[2*t])return h;return o}(e)),Y(e,e.l_desc),Y(e,e.d_desc),a=function(e){var t;for(X(e,e.dyn_ltree,e.l_desc.max_code),X(e,e.dyn_dtree,e.d_desc.max_code),Y(e,e.bl_desc),t=c-1;3<=t&&0===e.bl_tree[2*S[t]+1];t--);return e.opt_len+=3*(t+1)+5+5+4,t}(e),i=e.opt_len+3+7>>>3,(s=e.static_len+3+7>>>3)<=i&&(i=s)):i=s=r+5,r+4<=i&&-1!==t?J(e,t,r,n):4===e.strategy||s===i?(P(e,2+(n?1:0),3),K(e,z,C)):(P(e,4+(n?1:0),3),function(e,t,r,n){var i;for(P(e,t-257,5),P(e,r-1,5),P(e,n-4,4),i=0;i<n;i++)P(e,e.bl_tree[2*S[i]+1],3);V(e,e.dyn_ltree,t-1),V(e,e.dyn_dtree,r-1)}(e,e.l_desc.max_code+1,e.d_desc.max_code+1,a+1),K(e,e.dyn_ltree,e.dyn_dtree)),W(e),n&&M(e)},r._tr_tally=function(e,t,r){return e.pending_buf[e.d_buf+2*e.last_lit]=t>>>8&255,e.pending_buf[e.d_buf+2*e.last_lit+1]=255&t,e.pending_buf[e.l_buf+e.last_lit]=255&r,e.last_lit++,0===t?e.dyn_ltree[2*r]++:(e.matches++,t--,e.dyn_ltree[2*(A[r]+u+1)]++,e.dyn_dtree[2*N(t)]++),e.last_lit===e.lit_bufsize-1},r._tr_align=function(e){P(e,2,3),L(e,m,z),function(e){16===e.bi_valid?(U(e,e.bi_buf),e.bi_buf=0,e.bi_valid=0):8<=e.bi_valid&&(e.pending_buf[e.pending++]=255&e.bi_buf,e.bi_buf>>=8,e.bi_valid-=8)}(e)}},{"../utils/common":41}],53:[function(e,t,r){"use strict";t.exports=function(){this.input=null,this.next_in=0,this.avail_in=0,this.total_in=0,this.output=null,this.next_out=0,this.avail_out=0,this.total_out=0,this.msg="",this.state=null,this.data_type=2,this.adler=0}},{}],54:[function(e,t,r){(function(e){!function(r,n){"use strict";if(!r.setImmediate){var i,s,t,a,o=1,h={},u=!1,l=r.document,e=Object.getPrototypeOf&&Object.getPrototypeOf(r);e=e&&e.setTimeout?e:r,i="[object process]"==={}.toString.call(r.process)?function(e){process.nextTick(function(){c(e)})}:function(){if(r.postMessage&&!r.importScripts){var e=!0,t=r.onmessage;return r.onmessage=function(){e=!1},r.postMessage("","*"),r.onmessage=t,e}}()?(a="setImmediate$"+Math.random()+"$",r.addEventListener?r.addEventListener("message",d,!1):r.attachEvent("onmessage",d),function(e){r.postMessage(a+e,"*")}):r.MessageChannel?((t=new MessageChannel).port1.onmessage=function(e){c(e.data)},function(e){t.port2.postMessage(e)}):l&&"onreadystatechange"in l.createElement("script")?(s=l.documentElement,function(e){var t=l.createElement("script");t.onreadystatechange=function(){c(e),t.onreadystatechange=null,s.removeChild(t),t=null},s.appendChild(t)}):function(e){setTimeout(c,0,e)},e.setImmediate=function(e){"function"!=typeof e&&(e=new Function(""+e));for(var t=new Array(arguments.length-1),r=0;r<t.length;r++)t[r]=arguments[r+1];var n={callback:e,args:t};return h[o]=n,i(o),o++},e.clearImmediate=f}function f(e){delete h[e]}function c(e){if(u)setTimeout(c,0,e);else{var t=h[e];if(t){u=!0;try{!function(e){var t=e.callback,r=e.args;switch(r.length){case 0:t();break;case 1:t(r[0]);break;case 2:t(r[0],r[1]);break;case 3:t(r[0],r[1],r[2]);break;default:t.apply(n,r)}}(t)}finally{f(e),u=!1}}}}function d(e){e.source===r&&"string"==typeof e.data&&0===e.data.indexOf(a)&&c(+e.data.slice(a.length))}}("undefined"==typeof self?void 0===e?this:e:self)}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{}]},{},[10])(10)});
return module.exports;})();

const VRCore=(()=>{const module={exports:{}};
'use strict';
const nodeCrypto=require('crypto');
const HASH=/^[a-f0-9]{64}$/;
const GROUP=/^vg-[a-z0-9]{16,40}$/;
const DEVICE=/^vr-[a-z0-9]{16,64}$/;
const PACK=/^[a-f0-9]{24,64}$/;
const MAX_ENTRIES=60;
const MAX_FILE=128*1024*1024;
const MAX_PACK=160*1024*1024;
const MAX_MANIFEST=1024*1024;
function check(ok,message){if(!ok)throw Error(message);}
// V4.0.12: two exact root directories and every descendant stay OUT of
// formal-note synchronization, on both case-sensitive and Windows vaults.
// This never deletes/moves files or changes the user's version history.
function isSyncExcludedPath(p){
  if(typeof p!=='string')return false;
  const first=p.split('/')[0].toLowerCase();
  return first==='.obsidian'||first==='vaultrelay-transfer';
}
function safePath(p){
  check(typeof p==='string'&&p.length>0&&p.length<=1024,'Invalid file path');
  check(!/[\\:\u0000-\u001f]/.test(p)&&!p.startsWith('/')&&!p.endsWith('/'),'Unsafe file path');
  const seg=p.split('/');
  check(seg.every(s=>s&&s!=='.'&&s!=='..'&&s!=='__proto__'&&s!=='constructor'&&s!=='prototype'),'Unsafe path segments');
  check(!isSyncExcludedPath(p),'Excluded sync working directory');
  // Preserve older internal/unsafe exclusions; no new rules for ordinary folders.
  check(!['.trash','.vault-relay-merge-drafts','Vault Relay 合并草稿','VaultRelay'].includes(seg[0]),'Excluded private directory');
  return p;
}
function validId(id,re,label){check(typeof id==='string'&&re.test(id),`Invalid ${label}`);return id;}
function validHash(h,label){check(typeof h==='string'&&HASH.test(h),`Invalid ${label}`);return h;}
function manifest(raw,group){
  check(raw&&typeof raw==='object'&&!Array.isArray(raw),'Invalid manifest');
  check(raw.format==='vaultrelay.content.v2','Unsupported pack format');
  validId(raw.vaultGroupId,GROUP,'group');
  if(group)check(raw.vaultGroupId===group,'Wrong Vault group');
  validId(raw.originDeviceId,DEVICE,'origin device');
  if(raw.originName!==undefined)
    check(typeof raw.originName==='string'&&raw.originName.length<=80 &&
      !/[\u0000-\u001f]/.test(raw.originName),'Invalid origin name');
  validId(raw.packId,PACK,'pack ID');
  check(Number.isSafeInteger(raw.originSeq)&&raw.originSeq>0,'Invalid sequence');
  check(typeof raw.createdAtUtc==='string'&&!Number.isNaN(Date.parse(raw.createdAtUtc)),'Invalid pack time');
  check(Array.isArray(raw.entries)&&raw.entries.length>0&&raw.entries.length<=MAX_ENTRIES,'Invalid entry count');
  const paths=new Set(),versions=new Set(),payloads=new Set();
  let total=0;
  for(let i=0;i<raw.entries.length;i++){
    const e=raw.entries[i];
    check(e&&typeof e==='object'&&!Array.isArray(e),'Invalid version entry');
    safePath(e.path);check(!paths.has(e.path),'Duplicate file path');paths.add(e.path);
    check(typeof e.versionId==='string'&&e.versionId===`${raw.packId}:${String(i+1).padStart(4,'0')}`,'Invalid version ID');
    check(!versions.has(e.versionId),'Duplicate version ID');versions.add(e.versionId);
    check(e.parentVersionId===null||(typeof e.parentVersionId==='string'&&/^[a-f0-9]{24,64}:[0-9]{4}$/.test(e.parentVersionId)),'Invalid parent version');
    check(e.parentVersionId!==e.versionId,'Cyclic self-parent');
    if(e.mergeParents!==undefined){
      check(Array.isArray(e.mergeParents)&&e.mergeParents.length<=24,'Invalid merge parents');
      check(new Set(e.mergeParents).size===e.mergeParents.length,'Duplicate merge parents');
      for(const id of e.mergeParents)
        check(typeof id==='string'&&/^[a-f0-9]{24,64}:[0-9]{4}$/.test(id)&&
          id!==e.versionId&&id!==e.parentVersionId,'Invalid merge parent ID');
    }
    check(e.op==='upsert'||e.op==='delete','Invalid operation');
    check(typeof e.eventAtUtc==='string'&&!Number.isNaN(Date.parse(e.eventAtUtc)),'Invalid event time');
    check(e.baseSha256===null||(typeof e.baseSha256==='string'&&HASH.test(e.baseSha256)),'Invalid base hash');
    if(e.op==='upsert'){
      validHash(e.sha256,'entry hash');
      check(Number.isSafeInteger(e.size)&&e.size>=0&&e.size<=MAX_FILE,'Oversized file');
      check(e.payload===`files/${String(i+1).padStart(4,'0')}.bin`,'Unexpected ZIP payload');
      check(!payloads.has(e.payload),'Duplicate ZIP payload');payloads.add(e.payload);
      total+=e.size;
    }else{
      check(e.sha256===null&&e.size===0&&e.payload===null,'Invalid deletion tombstone');
    }
  }
  check(total<=MAX_PACK,'Uncompressed package too large');
  return raw;
}
function parentsOf(v){
  return [v.parentVersionId,...(Array.isArray(v.mergeParents)?v.mergeParents:[])].filter(Boolean);
}
function heads(list){
  const unique=new Map(),warnings=[];
  for(const v of list){
    const old=unique.get(v.versionId);
    if(old){
      if(old.sha256!==v.sha256||old.op!==v.op||old.parentVersionId!==v.parentVersionId||
         JSON.stringify(old.mergeParents||[])!==JSON.stringify(v.mergeParents||[]))
        warnings.push('Duplicate version ID with different content');
    }else unique.set(v.versionId,v);
  }
  const ids=new Set(unique.keys()),consumed=new Set();
  for(const v of unique.values())for(const id of parentsOf(v))if(ids.has(id))consumed.add(id);
  const live=[...unique.values()].filter(v=>!consumed.has(v.versionId));
  const variants=new Set(live.map(v=>v.op+':'+(v.sha256||'')));
  return {head:live.length&&variants.size===1?live.slice().sort((a,b)=>a.versionId.localeCompare(b.versionId))[0]:null,
    fork:variants.size>1||(list.length>0&&live.length===0),heads:live,warnings,
    missingParents:[...new Set([...unique.values()].flatMap(v=>parentsOf(v)).filter(x=>!ids.has(x)))],
    unresolved:live.length>1};
}
function isAncestor(versionId,head,versions){
  if(!versionId||!head)return false;
  const byId=new Map(versions.map(v=>[v.versionId,v]));
  const todo=[head.versionId],seen=new Set();
  while(todo.length){
    const cur=todo.pop();
    if(cur===versionId)return true;
    if(seen.has(cur))continue;
    seen.add(cur);
    const v=byId.get(cur);
    if(v)todo.push(...parentsOf(v));
  }
  return false;
}
// Content equivalence is deliberately *narrow*: valid UTF-8 Markdown,
// optionally one leading BOM, and CRLF versus LF. Never normalize spaces,
// Unicode, metadata, Markdown markup, or attachments.
function equivalentSha(bytes,path,limit=16*1024*1024){
  if(!/\.md$/i.test(path))return null;
  const buffer=Buffer.from(bytes);
  if(buffer.length>limit)return null;
  try{
    const isBom=buffer.length>=3&&buffer[0]===239&&buffer[1]===187&&buffer[2]===191;
    const text=new TextDecoder('utf-8',{fatal:true}).decode(isBom?buffer.subarray(3):buffer);
    if(text.includes('\0'))return null;
    return nodeCrypto.createHash('sha256').update(Buffer.from(text.replace(/\r\n/g,'\n'),'utf8')).digest('hex');
  }catch(_){return null;}
}
// Strict UTF-8 analysis for read-only diagnosis and explicitly confirmed byte repair.
// A format-only classification changes ONLY CRLF/LF and a leading UTF-8 BOM.
function compareTextBytes(historical,current,limit=512*1024){
  const a=Buffer.from(historical),b=Buffer.from(current);
  if(a.length>limit||b.length>limit)return {kind:'unavailable',reason:'Text exceeds safe analysis size'};
  const inspect=(bytes)=>{
    const bom=bytes.length>=3&&bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf;
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bom?bytes.subarray(3):bytes);
    if(text.includes('\0'))throw Error('NUL bytes found in Markdown');
    const crlf=(text.match(/\r\n/g)||[]).length;
    const allLf=(text.match(/\n/g)||[]).length;
    const singleCr=(text.match(/\r(?!\n)/g)||[]).length;
    return {bytes:bytes.length,bom,crlf,lf:allLf-crlf,singleCr,text};
  };
  try{
    const x=inspect(a),y=inspect(b);
    const exact=a.equals(b);
    const normalizedSame=x.text.replace(/\r\n/g,'\n')===y.text.replace(/\r\n/g,'\n');
    const summary=(z)=>({bytes:z.bytes,bom:z.bom,crlf:z.crlf,lf:z.lf,singleCr:z.singleCr});
    return {kind:exact?'byte-identical':normalizedSame?'format-only':'text-different',
      historical:summary(x),current:summary(y),byteDelta:y.bytes-x.bytes,
      onlyNewlinesAndBom:normalizedSame&&!exact};
  }catch(err){return {kind:'unavailable',reason:String(err.message||err)};}
}
function lineDiff(oldText,newText,limit=900){
  const a=oldText.replace(/\r\n/g,'\n').split('\n'),b=newText.replace(/\r\n/g,'\n').split('\n');
  check(a.length<=limit&&b.length<=limit,'Text too large for inline diff');
  const n=a.length,m=b.length,dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const out=[];let i=0,j=0;
  while(i<n||j<m){
    if(i<n&&j<m&&a[i]===b[j]){out.push({type:'equal',a:i+1,b:j+1,text:a[i]});i++;j++;}
    else if(j<m&&(i===n||dp[i][j+1]>dp[i+1][j])){out.push({type:'add',a:null,b:j+1,text:b[j]});j++;}
    else{out.push({type:'remove',a:i+1,b:null,text:a[i]});i++;}
  }
  return out;
}
function describe(current,version){
  if(version.op==='delete')return current?'deleted-in-history':'both-absent';
  if(!current)return 'missing-local';
  return current===version.sha256?'same':'different';
}
module.exports={equivalentSha,isAncestor,parentsOf,isSyncExcludedPath,safePath,validId,validHash,manifest,heads,lineDiff,compareTextBytes,describe,HASH,GROUP,DEVICE,PACK,MAX_ENTRIES,MAX_FILE,MAX_PACK,MAX_MANIFEST};

return module.exports;})();
const VRMergeModule=(()=>{const module={exports:{}};
'use strict';
// Merge-draft generator: conservative, three-way, line-based. No source version
// is discarded. When context cannot be matched, both full documents are shown.
const C=VRCore;

function lines(s){return s.replace(/\r\n/g,'\n').split('\n');}
function edits(base,variant){
  const diff=C.lineDiff(base,variant,900);
  const edits=[];let i=0,current=null;
  function flush(){
    if(current){current.end=i;edits.push(current);current=null;}
  }
  for(const row of diff){
    if(row.type==='equal'){flush();i++;}
    else if(row.type==='remove'){if(!current)current={start:i,add:[]};i++;}
    else if(row.type==='add'){if(!current)current={start:i,add:[]};current.add.push(row.text);}
  }
  flush();
  return edits;
}
function side(base,edits,start,end){
  let result=[],at=start;
  for(const e of edits){
    if(e.start>=end && !(e.start===end&&start===end))break;
    if(e.end<start||e.start>end)continue;
    result.push(...base.slice(at,e.start),...e.add);
    at=e.end;
  }
  result.push(...base.slice(at,end));
  return result;
}
function safeName(name){
  return String(name||'未命名终端').replace(/[\r\n<>&`\\[\\]{}*]/g,'').slice(0,64);
}
function sourceBlock(deviceName,color,contents){
  const kind=color==='blue'?'vr-blue':'vr-orange';
  const label=safeName(deviceName);
  const rows=[`<!-- VRMERGE:UNRESOLVED:${color}:START -->`,
    `> [!${kind}] ${label} 的版本（${color==='blue'?'蓝色':'橙色'}）`];
  for(const line of contents){
    rows.push('> '+line);
  }
  rows.push(`<!-- VRMERGE:UNRESOLVED:${color}:END -->`);
  return rows;
}
function generate(baseText,aText,bText,aName,bName){
  if(typeof aText!=='string'||typeof bText!=='string')throw Error('Both Markdown texts required');
  const prefix=[
    '> [!warning] Vault Relay 智能合并草稿',
    '> 蓝色来自 '+safeName(aName||'设备一')+'；橙色来自 '+safeName(bName||'设备二')+'。',
    '> 请逐段编辑，删除不需要的来源标记；确认之前不会发布正式版本。',
    ''
  ];
  if(aText===bText)return [...prefix,...lines(aText)].join('\n');
  if(baseText===null||baseText===undefined){
    return [...prefix,...sourceBlock(aName,'blue',lines(aText)),'',
      ...sourceBlock(bName,'orange',lines(bText)),''].join('\n');
  }
  try{
    const base=lines(baseText);
    const A=edits(baseText,aText),B=edits(baseText,bText);
    let output=[...prefix],index=0,ai=0,bi=0;
    while(index<=base.length && (ai<A.length||bi<B.length)){
      const start=Math.min(A[ai]?.start??Infinity,B[bi]?.start??Infinity);
      output.push(...base.slice(index,start));
      let end=start,ae=ai,be=bi,changed=true;
      while(changed){
        changed=false;
        while(ae<A.length && A[ae].start<=end){end=Math.max(end,A[ae].end);ae++;changed=true;}
        while(be<B.length && B[be].start<=end){end=Math.max(end,B[be].end);be++;changed=true;}
      }
      const av=side(base,A.slice(ai,ae),start,end),bv=side(base,B.slice(bi,be),start,end);
      if(av.join('\n')===bv.join('\n'))output.push(...av);
      else{
        output.push(...sourceBlock(aName,'blue',av),'',...sourceBlock(bName,'orange',bv),'');
      }
      index=end;ai=ae;bi=be;
    }
    output.push(...base.slice(index));
    return output.join('\n');
  }catch(err){
    return [...prefix,'> [!warning] 差异太复杂，以下完整保留两个版本，供人工编辑。','',
      ...sourceBlock(aName,'blue',lines(aText)),'',
      ...sourceBlock(bName,'orange',lines(bText)),''].join('\n');
  }
}
function unresolved(text){return /<!-- VRMERGE:UNRESOLVED:(blue|orange):(START|END) -->/.test(text);}
module.exports={generate,unresolved};

return module.exports;})();
const VREngine=(()=>{const module={exports:{}};
'use strict';
const C=VRCore;
const VRMerge=VRMergeModule;
const nodeFs=require('fs');
const nodePath=require('path');
const nodeCrypto=require('crypto');
function sha(bytes){return nodeCrypto.createHash('sha256').update(bytes).digest('hex');}
function uid(){return nodeCrypto.randomBytes(16).toString('hex');}
function utc(clock){return new Date(clock()).toISOString();}
function stamp(clock){return utc(clock).replace(/[-:]/g,'').replace('.','').replace('Z','Z');}
function exists(p){try{return nodeFs.existsSync(p);}catch(_){return false;}}
function atomicWrite(name,bytes){
  const temp=name+'.partial-'+uid();
  nodeFs.mkdirSync(nodePath.dirname(name),{recursive:true});
  try{
    const fd=nodeFs.openSync(temp,'wx',0o600);
    try{nodeFs.writeFileSync(fd,bytes);nodeFs.fsyncSync(fd);}finally{nodeFs.closeSync(fd);}
    if(exists(name)){
      if(sha(nodeFs.readFileSync(name))!==sha(bytes))throw Error('Immutable file name collision');
      nodeFs.unlinkSync(temp);return false;
    }
    nodeFs.renameSync(temp,name);
    return true;
  }finally{if(exists(temp))nodeFs.unlinkSync(temp);}
}
function currentDigest(file){return file?sha(nodeFs.readFileSync(file)):null;}
function checkedChildDirectories(base,relative,create){
  let cursor=base;
  for(const part of relative.split(nodePath.sep).filter(Boolean)){
    cursor=nodePath.join(cursor,part);
    if(exists(cursor)){
      if(nodeFs.lstatSync(cursor).isSymbolicLink()||!nodeFs.statSync(cursor).isDirectory())throw Error('Unsafe symlink or file inside shared directory');
    }else if(create){nodeFs.mkdirSync(cursor);}
    else break;
  }
}
function assertSafeBase(vault,share){
  if(!nodePath.isAbsolute(vault)||!nodePath.isAbsolute(share))throw Error('Vault and shared folder must be absolute paths');
  if(!exists(vault)||!nodeFs.statSync(vault).isDirectory())throw Error('Vault folder does not exist');
  if(!exists(share)||!nodeFs.statSync(share).isDirectory())throw Error('Shared folder does not exist');
  const a=nodeFs.realpathSync(vault),b=nodeFs.realpathSync(share);
  const inside=(x,y)=>x===y||x.startsWith(y+nodePath.sep);
  if(inside(a,b))throw Error('共享目录不得包含知识库根目录');
  if(inside(b,a)){
    const permitted=nodePath.join(a,'VaultRelay-Transfer','engine');
    if(b!==permitted)throw Error('知识库内部交换区仅允许 VaultRelay-Transfer/engine');
    for(const relative of ['VaultRelay-Transfer','VaultRelay-Transfer'+nodePath.sep+'engine']){
      const part=nodePath.join(a,relative);
      if(!exists(part)||nodeFs.lstatSync(part).isSymbolicLink()||!nodeFs.statSync(part).isDirectory())
        throw Error('交换目录缺失或包含符号链接');
    }
  }
  return {vault:a,share:b};
}
function emptyState(deviceId,groupId){
  return {schema:2,deviceId,groupId,shareRoot:'',syncEnabled:false,exitUploadContent:false,
    seq:0,messageSeq:0,known:{},processed:{},seenInfo:{},seenAck:{},acks:{},publishedAckIds:{},receivedAcks:{},
    displayName:'',groupName:'',devices:{},drafts:{},setupComplete:false,initialReviewComplete:false,
    schedule:{lastInfoAt:0,lastContentAt:0,lastAckAt:0,lastReceiveAt:0,firstPendingAt:0,lastPendingAt:0,pendingFingerprint:''},
    lastOperation:null,errors:[]};
}
class V2Engine{
  constructor({vaultPath,state,zip,persist,clock=Date.now}){
    this.vaultPath=vaultPath;this.state=state;this.zip=zip;this.persist=persist||(async()=>{});this.clock=clock;
    C.validId(state.deviceId,C.DEVICE,'device');C.validId(state.groupId,C.GROUP,'group');
    if(!zip||typeof zip.loadAsync!=='function')throw Error('ZIP implementation required');
    for(const key of ['known','processed','seenInfo','seenAck','acks','publishedAckIds','receivedAcks'])this.state[key] ||= {};
    this.state.schedule||={};this.state.errors||=[];
    this.state.devices||={};this.state.drafts||={};
    this.running=false;
  }
  bindRoot(){
    C.validId(this.state.groupId,C.GROUP,'group');
    const p=assertSafeBase(this.vaultPath,this.state.shareRoot);
    return nodePath.join(p.share,'VaultRelay',this.state.groupId);
  }
  dirs(create=false){
    const r=this.bindRoot(),d={root:r,content:nodePath.join(r,'content'),info:nodePath.join(r,'info'),ack:nodePath.join(r,'ack')};
    const share=nodeFs.realpathSync(this.state.shareRoot);
    checkedChildDirectories(share,nodePath.join('VaultRelay',this.state.groupId),create);
    for(const child of ['content','info','ack'])checkedChildDirectories(share,nodePath.join('VaultRelay',this.state.groupId,child),create);
    return d;
  }
  setRoot(raw){
    const candidate=nodePath.resolve(String(raw||'').trim());
    const roots=assertSafeBase(this.vaultPath,candidate);
    this.state.shareRoot=roots.share;return this.state.shareRoot;
  }
  setGroup(raw){
    const id=String(raw||'').trim();C.validId(id,C.GROUP,'group');
    if(id===this.state.groupId)return id; // Idempotent; preserve ACKs, sequence and known versions.
    if(id!==this.state.groupId&&Object.keys(this.state.known).length)throw Error('This Vault already has versions; use a new empty Vault to join another group');
    if(id!==this.state.groupId&&this.state.syncEnabled)throw Error('Turn synchronization OFF before switching groups');
    this.state.groupId=id;
    this.state.seq=0;this.state.messageSeq=0;
    this.state.processed={};this.state.seenInfo={};this.state.seenAck={};this.state.acks={};this.state.publishedAckIds={};this.state.receivedAcks={};
    this.state.schedule={};
  }
  resetDeviceIdentity(){
    if(this.state.syncEnabled)throw Error('Cannot change identity while automatic sync is ON');
    if(Object.keys(this.state.drafts||{}).length)
      throw Error('Finish or independently export merge drafts before changing device identity');
    // Make a fresh per-installation author identity, but retain the Vault and
    // the shared group. Existing versions remain in immutable historical ZIPs.
    this.state.deviceId=`vr-${uid()}`;
    this.state.seq=0;this.state.messageSeq=0;
    this.state.known={};this.state.processed={};this.state.seenInfo={};
    this.state.seenAck={};this.state.acks={};this.state.publishedAckIds={};
    this.state.receivedAcks={};this.state.schedule={};
    this.state.drafts={};this.state.machineChanged=false;this.state.initialReviewComplete=false;
    return this.state.deviceId;
  }
  vaultFile(rel){
    C.safePath(rel);
    const base=nodeFs.realpathSync(this.vaultPath),candidate=nodePath.resolve(base,...rel.split('/'));
    if(!candidate.startsWith(base+nodePath.sep))throw Error('Vault path traversal');
    let cur=base;
    for(const segment of rel.split('/')){
      cur=nodePath.join(cur,segment);
      if(exists(cur)&&nodeFs.lstatSync(cur).isSymbolicLink())throw Error('Symlink paths are not allowed');
    }
    return candidate;
  }
  scanVault(){
    const root=nodeFs.realpathSync(this.vaultPath),snapshot={};let excluded=0;
    const walk=(dir,prefix)=>{
      const children=nodeFs.readdirSync(dir,{withFileTypes:true});
      for(const ent of children){
        const rel=prefix?prefix+'/'+ent.name:ent.name;
        if(/\.vrwrite-[a-f0-9]{32}$/.test(ent.name)){excluded++;continue;}
        if(C.isSyncExcludedPath(rel)){excluded++;continue;}
        try{C.safePath(rel);}catch(_){excluded++;continue;}
        if(ent.isSymbolicLink()){excluded++;continue;}
        const full=nodePath.join(dir,ent.name);
        if(ent.isDirectory())walk(full,rel);
        else if(ent.isFile()){
          const stat=nodeFs.statSync(full);
          if(stat.size>C.MAX_FILE){snapshot[rel]={error:'File exceeds 128 MiB safety limit',size:stat.size};continue;}
          snapshot[rel]={sha256:sha(nodeFs.readFileSync(full)),size:stat.size,mtime:stat.mtimeMs};
        }else excluded++;
      }
    };
    walk(root,'');return {files:snapshot,excluded};
  }
  pendingPlan(){
    const {files,excluded}=this.scanVault();const changes=[];const errors=[];
    for(const [p,f] of Object.entries(files).sort((a,b)=>a[0].localeCompare(b[0]))){
      if(C.isSyncExcludedPath(p))continue;
      if(f.error){errors.push({path:p,error:f.error});continue;}
      const known=this.state.known[p]||null;
      if(known&&known.op==='upsert'&&known.sha256===f.sha256)continue;
      if(known&&known.op==='upsert'&&known.equivalentSha&&/\.md$/i.test(p)){
        const localEq=C.equivalentSha(nodeFs.readFileSync(this.vaultFile(p)),p);
        if(localEq&&localEq===known.equivalentSha)continue;
      }
      changes.push({path:p,op:'upsert',sha256:f.sha256,size:f.size,mtime:f.mtime,
        baseSha256:known?.sha256||null,parentVersionId:known?.versionId||null,
        mergeParents:(known?.equivalentHeads||[]).filter(x=>x!==known.versionId)});
    }
    for(const [p,known] of Object.entries(this.state.known)){
      // A once-tracked file inside an excluded tree must NEVER become a
      // tombstone simply because scanning now skips its private directory.
      if(C.isSyncExcludedPath(p)||files[p]||known.op==='delete')continue;
      // A missing file has no stable filesystem mtime. Using the clock here
      // would change the plan between preview and commit and falsely reject
      // a legitimate delete. The actual event timestamp is set at commit.
      changes.push({path:p,op:'delete',sha256:null,size:0,mtime:0,
        baseSha256:known.sha256||null,parentVersionId:known.versionId||null});
    }
    changes.sort((a,b)=>a.path.localeCompare(b.path));
    return {changes,errors,excluded,totalFiles:Object.keys(files).length,
      upserts:changes.filter(x=>x.op==='upsert').length,deletions:changes.filter(x=>x.op==='delete').length};
  }
  schedulePending(plan){
    const s=this.state.schedule,fp=sha(Buffer.from(JSON.stringify(plan.changes.map(x=>[x.path,x.op,x.sha256]))));
    if(!plan.changes.length){s.firstPendingAt=0;s.lastPendingAt=0;s.pendingFingerprint='';return;}
    if(fp!==s.pendingFingerprint){if(!s.firstPendingAt)s.firstPendingAt=this.clock();s.lastPendingAt=this.clock();s.pendingFingerprint=fp;}
  }
  async readPack(file,verify=true){
    if(nodeFs.statSync(file).size>C.MAX_PACK+8*1024*1024)throw Error('Oversized ZIP on disk');
    const bytes=nodeFs.readFileSync(file);
    const z=await this.zip.loadAsync(bytes,{checkCRC32:false});
    const mf=z.file('manifest.json');
    if(!mf||!mf._data||mf._data.uncompressedSize>C.MAX_MANIFEST)throw Error('Invalid manifest entry size');
    const manifest=C.manifest(JSON.parse(await mf.async('string')),this.state.groupId);
    const allowed=new Set(['manifest.json','files/']);
    for(const e of manifest.entries){
      if(e.op==='upsert'){
        allowed.add(e.payload);
        const zipped=z.file(e.payload);
        if(!zipped||!zipped._data||zipped._data.uncompressedSize!==e.size)throw Error('Unexpected ZIP payload size');
      }
    }
    if(Object.keys(z.files).some(name=>!allowed.has(name)))throw Error('Unexpected ZIP member');
    if(verify){
      for(const e of manifest.entries)if(e.op==='upsert'){
        const data=await z.file(e.payload).async('nodebuffer');
        if(data.length!==e.size||sha(data)!==e.sha256)throw Error('Payload hash does not match manifest');
      }
    }
    return {manifest,zip:z,sha256:sha(bytes),bytes:bytes.length};
  }
  async scanCatalog(){
    const dir=this.dirs(false).content;
    const result={packages:[],byPath:{},warnings:[],count:0};
    if(!exists(dir))return result;
    const names=nodeFs.readdirSync(dir).filter(n=>/^\d{8}T\d{9}Z__vr-[a-z0-9]{16,64}__\d{6,12}__[a-f0-9]{8}\.zip$/.test(n)).sort();
    if(names.length>50000)throw Error('Too many ZIPs; indexing limit reached');
    for(const name of names){
      const f=nodePath.join(dir,name);
      try{
        if(nodeFs.lstatSync(f).isSymbolicLink())throw Error('Symlinked ZIP is not allowed');
        const rec=await this.readPack(f,true);
        const parts=name.match(/^\d{8}T\d{9}Z__(vr-[a-z0-9]{16,64})__(\d{6,12})__[a-f0-9]{8}\.zip$/);
        if(!parts||parts[1]!==rec.manifest.originDeviceId||Number(parts[2])!==rec.manifest.originSeq)throw Error('Filename and manifest origin/sequence disagree');
        result.count++;
        const info={name,path:f,packId:rec.manifest.packId,createdAtUtc:rec.manifest.createdAtUtc,
          originDeviceId:rec.manifest.originDeviceId,originSeq:rec.manifest.originSeq,sha256:rec.sha256,size:rec.bytes,
          entryCount:rec.manifest.entries.length};
        result.packages.push(info);
        for(const entry of rec.manifest.entries){
          if(C.isSyncExcludedPath(entry.path))continue;
          (result.byPath[entry.path] ||= []).push({...entry,packId:info.packId,packPath:f,packName:name,
            packSha256:info.sha256,originDeviceId:info.originDeviceId,
            originName:rec.manifest.originName||this.state.devices?.[info.originDeviceId]?.name||info.originDeviceId,
            createdAtUtc:info.createdAtUtc});
        }
      }catch(e){result.warnings.push({file:name,error:String(e.message||e)});}
    }
    // ZIPs with unexpected names are never treated as verified content.
    const all=nodeFs.readdirSync(dir).filter(n=>n.endsWith('.zip'));
    for(const n of all)if(!names.includes(n))result.warnings.push({file:n,error:'Unrecognized ZIP filename'});
    return result;
  }
  async reconcileSelf(){
    const cat=await this.scanCatalog();
    let recovered=0;
    for(const [p,versions] of Object.entries(cat.byPath)){
      const mine=versions.filter(v=>v.originDeviceId===this.state.deviceId);
      for(const v of mine){
        const seq=cat.packages.find(x=>x.packId===v.packId)?.originSeq||0;
        this.state.seq=Math.max(this.state.seq,seq);
      }
      const h=C.heads(versions),last=h.head,known=this.state.known[p]||null;
      if(!last||last.originDeviceId!==this.state.deviceId)continue;
      const live=this.scanLocalOne(p);
      if(!((last.op==='upsert'&&live===last.sha256)||(last.op==='delete'&&!live)))continue;
      if(known?.versionId===last.versionId)continue;
      if(!known || last.parentVersionId===known.versionId){
        this.state.known[p]={op:last.op,sha256:last.sha256,versionId:last.versionId,at:last.eventAtUtc};
        recovered++;
      }
    }
    if(recovered)await this.persist();
    return {recovered,warnings:cat.warnings};
  }
  scanLocalOne(p){const full=this.vaultFile(p);return exists(full)?currentDigest(full):null;}
  async backup(options={}){
    if(this.backingUp)throw Error('Backup already running');
    this.backingUp=true;
    try{return await this.performBackup(options);}finally{this.backingUp=false;}
  }
  async performBackup({plan,allowDeletes=false,skipPaths=[]}={}){
    const now=this.pendingPlan();
    if(plan&&sha(Buffer.from(JSON.stringify(plan.changes)))!==sha(Buffer.from(JSON.stringify(now.changes))))
      throw Error('Local files changed after preview; please preview again');
    if(now.errors.length)throw Error(`${now.errors.length} oversized/unreadable files; backup cannot be reported complete`);
    if(now.deletions&&!allowDeletes){
      // Upserts still proceed, but deletion tombstones require explicit confirmation.
    }
    const omitted=new Set(skipPaths);
    const pending=now.changes.filter(e=>(allowDeletes||e.op!=='delete')&&!omitted.has(e.path));
    if(pending.length)this.dirs(true);
    if(!pending.length)return {written:0,files:0,skippedDeletes:now.deletions,errors:[]};
    const groups=[];let current=[],bytes=0;
    for(const entry of pending){
      if(current.length&&(current.length>=40||bytes+entry.size>32*1024*1024)){
        groups.push(current);current=[];bytes=0;
      }
      current.push(entry);bytes+=entry.size;
      if(current.length===1&&bytes>32*1024*1024){groups.push(current);current=[];bytes=0;}
    }
    if(current.length)groups.push(current);
    const summary={written:0,files:0,skippedDeletes:allowDeletes?0:now.deletions,errors:[],packages:[]};
    for(const group of groups){
      const seq=this.state.seq+1,packId=uid(),zip=new this.zip(),entries=[];
      for(const x of group){
        const index=entries.length+1,number=String(index).padStart(4,'0');
        const e={path:x.path,versionId:`${packId}:${number}`,parentVersionId:x.parentVersionId,
          mergeParents:x.mergeParents||[],op:x.op,
          eventAtUtc:new Date(x.mtime||this.clock()).toISOString(),baseSha256:x.baseSha256,
          sha256:x.op==='delete'?null:x.sha256,size:x.size,payload:x.op==='delete'?null:`files/${number}.bin`};
        if(x.op==='upsert'){
          const buf=nodeFs.readFileSync(this.vaultFile(x.path));
          if(buf.length!==x.size||sha(buf)!==x.sha256)throw Error('File changed during backup: '+x.path);
          zip.file(e.payload,buf,{binary:true,compression:'DEFLATE',compressionOptions:{level:3}});
        }entries.push(e);
      }
      const manifest={format:'vaultrelay.content.v2',vaultGroupId:this.state.groupId,packId,
        originDeviceId:this.state.deviceId,originName:this.state.displayName||this.state.deviceId,
        originSeq:seq,createdAtUtc:utc(this.clock),entries};
      C.manifest(manifest,this.state.groupId);
      zip.file('manifest.json',JSON.stringify(manifest,null,2));
      const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:3}});
      if(bytes.length>C.MAX_PACK)throw Error('ZIP exceeds safe size');
      const name=`${stamp(this.clock)}__${this.state.deviceId}__${String(seq).padStart(8,'0')}__${packId.slice(0,8)}.zip`;
      const dest=nodePath.join(this.dirs(true).content,name);
      atomicWrite(dest,bytes);
      const reread=await this.readPack(dest,true);
      if(reread.manifest.packId!==packId)throw Error('Written pack verification failed');
      this.state.seq=seq;
      for(const e of entries)this.state.known[e.path]={op:e.op,sha256:e.sha256,
        equivalentSha:e.op==='upsert'?C.equivalentSha(nodeFs.readFileSync(this.vaultFile(e.path)),e.path):null,
        versionId:e.versionId,at:e.eventAtUtc};
      this.state.schedule.lastContentAt=this.clock();
      this.state.lastOperation={kind:'backup',at:this.clock(),fileCount:entries.length,zip:name,localOnly:true};
      await this.persist();
      summary.written++;summary.files+=entries.length;summary.packages.push(name);
    }
    this.schedulePending(this.pendingPlan());await this.persist();
    return summary;
  }
  async latestPlan(){
    const catalog=await this.scanCatalog(),{files:local}=this.scanVault();
    const items=[];
    for(const [p,versions] of Object.entries(catalog.byPath).sort((a,b)=>a[0].localeCompare(b[0]))){
      if(C.isSyncExcludedPath(p))continue; // historical paths are not restored
      const h=C.heads(versions);
      if(h.warnings.length)catalog.warnings.push(...h.warnings.map(error=>({file:p,error})));
      // Parallel heads with provably identical Markdown content are logically
      // equivalent. Do not manufacture a user-visible conflict. Preserve ALL
      // parent IDs so the next real edit joins the version graph.
      let equivalentHeads=false,head=null;
      if(h.heads.length>1&&!h.warnings.length&&!h.missingParents.length&&
        h.heads.every(v=>v.op==='upsert')){
        const ordered=h.heads.slice().sort((a,b)=>a.versionId.localeCompare(b.versionId));
        if(ordered.every(v=>v.sha256===ordered[0].sha256)){
          equivalentHeads=true;head=ordered[0];
        }else if(/\.md$/i.test(p)&&ordered.length<=24&&
           ordered.every(v=>v.size<=16*1024*1024)){
          try{
            const equivalents=await Promise.all(ordered.map(async v=>
              C.equivalentSha(await this.payload(v),p)));
            if(equivalents[0]!==null&&equivalents.every(v=>v===equivalents[0])){
              equivalentHeads=true;head=ordered[0];
            }
          }catch(_){/* Any unreadable source must stay a fork, never equal. */}
        }
      }
      if((h.fork&&!equivalentHeads)||h.warnings.length||h.missingParents.length){
        items.push({path:p,status:'fork',heads:h.heads.map(v=>v.versionId),versions:h.heads,
          localHash:local[p]?.sha256||null,missingParents:h.missingParents});
        continue;
      }
      if(!head)head=h.head;
      if(!head)continue;
      const v=head,here=local[p]?.sha256||null,known=this.state.known[p];
      const equivalentHeadIds=equivalentHeads?h.heads.map(x=>x.versionId).sort():null;
      let status='same',formatAnalysis=null,equivalentHash=null;
      if(local[p]?.error)status='local-error';
      else if(v.op==='delete'){
        const recovery=this.state.authorizedRestores?.[p];
        const keep=this.state.deletionDecisions?.[p];
        status=!here?'absent':
          (recovery?.parentVersionId===v.versionId &&
           recovery?.sha256===here && known?.op==='delete' &&
           known.versionId===v.versionId)?'local-update':
          (keep?.versionId===v.versionId && keep?.localSha256===here &&
           known?.op==='upsert' && known.versionId===v.parentVersionId)?'delete-kept':
          (known?.op==='upsert'&&known.sha256===here&&
           known.versionId===v.parentVersionId)?'delete-review':'conflict';
      }
      else if(!here){
        // Missing after a version was already accepted/published locally is a
        // deletion intention candidate, never an instruction to restore it.
        // If the head advanced meanwhile, keep a conflict rather than deleting.
        status=known?.op==='upsert'
          ? (known.versionId===v.versionId?'local-deleted':'conflict')
          : 'create';
      }
      else if(here===v.sha256)status='same';
      else{
        // First SHA is an exact byte hash; second SHA normalizes only BOM and
        // CRLF/LF for valid UTF-8 Markdown. Equivalent files stay untouched.
        if(/\.md$/i.test(p) && v.size<=16*1024*1024 && local[p]?.size<=16*1024*1024){
          try{
            const cloud=await this.payload(v),live=nodeFs.readFileSync(this.vaultFile(p));
            const a=C.equivalentSha(cloud,p),b=C.equivalentSha(live,p);
            if(a!==null&&a===b){
              status='equivalent';equivalentHash=a;
              if(cloud.length<=512*1024&&live.length<=512*1024)
                formatAnalysis=C.compareTextBytes(cloud,live);
            }
          }catch(_){/* never treat missing or corrupt source as equivalent */}
        }
        if(status!=='equivalent'){
          const localIsKnown=known?.sha256===here||
            (known?.equivalentSha&&
             C.equivalentSha(nodeFs.readFileSync(this.vaultFile(p)),p)===known.equivalentSha);
          const isCurrentHead=known?.versionId===v.versionId||
            (equivalentHeadIds||[]).includes(known?.versionId);
          status=localIsKnown&&C.isAncestor(known?.versionId,v,versions)
            &&!isCurrentHead?'safe-update':
            isCurrentHead?'local-update':'conflict';
        }
      }
      items.push({path:p,status,localHash:here,version:v,
        equivalentHeadIds,formatAnalysis,equivalentHash,missingParents:h.missingParents});
    }
    const counts=Object.fromEntries(
      ['create','safe-update','same','equivalent','local-update','local-deleted','delete-review','delete-kept','conflict','fork','absent','local-error']
        .map(k=>[k,items.filter(e=>e.status===k).length]));
    counts.byteSame=counts.same;
    counts.same+=counts.equivalent; // user-facing count includes format equivalence
    counts.formatOnly=counts.equivalent;
    return {items,catalog,at:this.clock(),counts};
  }
  async adoptEqualVersions(preview){
    let adopted=0;
    for(const item of preview.items){
      if(!['same','equivalent'].includes(item.status)||!item.version||item.version.op!=='upsert')continue;
      const v=item.version;
      const before=this.state.known[item.path];
      const equivalentSha=item.status==='equivalent'?item.equivalentHash:
        C.equivalentSha(nodeFs.readFileSync(this.vaultFile(item.path)),item.path);
      const newState={op:'upsert',sha256:v.sha256,versionId:v.versionId,
        equivalentHeads:item.equivalentHeadIds||null,
        at:v.eventAtUtc,equivalentSha,localSha:item.localHash};
      if(JSON.stringify(before)!==JSON.stringify(newState)){
        this.state.known[item.path]=newState;adopted++;
      }
      // This device has verified that it already possesses the received
      // version (perhaps with different CRLF/BOM bytes). It may acknowledge
      // that fact without pretending byte identity.
      if(v.originDeviceId!==this.state.deviceId){
        const outcome=item.status==='equivalent'?'equivalent':'same';
        const key=this.state.groupId+'|'+v.originDeviceId+'|'+v.versionId+'|'+(v.sha256||'delete');
        const ackId=sha(Buffer.from(key+'|'+outcome+'|'+this.state.deviceId));
        this.state.acks[ackId]={format:'vaultrelay.ack.v2',ackId,
          vaultGroupId:this.state.groupId,fromDeviceId:this.state.deviceId,toDeviceId:v.originDeviceId,
          packId:v.packId,versionId:v.versionId,path:v.path,contentSha256:v.sha256,outcome,
          equivalentSha256:item.status==='equivalent'?equivalentSha:null,
          localOriginalSha256:item.status==='equivalent'?item.localHash:null,
          createdAtUtc:utc(this.clock)};
        this.state.processed[key]={outcome,at:this.clock()};
      }
    }
    if(adopted)await this.persist();
    return adopted;
  }
  // A new device can contribute independent differences, but only after the
  // user explicitly authorizes uploading those branches. Automatic background
  // synchronization never publishes unreviewed conflicts.
  async safeUpload({allowFirstJoinBranches=false,allowDeletes=false}={}){
    const preview=await this.latestPlan();
    if(preview.catalog.warnings.length)throw Error('Historical ZIP warnings; resolve them before uploading');
    await this.adoptEqualVersions(preview);
    // When a real edit follows several byte-different but content-equivalent
    // heads, publish one descendant referencing every equal head. Preserve
    // the local content's verified common equivalent hash.
    for(const item of preview.items){
      if(item.status!=='local-update'||!item.equivalentHeadIds?.length)continue;
      const known=this.state.known[item.path];
      if(!known||!item.equivalentHeadIds.includes(known.versionId))continue;
      const canonical=item.version;
      known.versionId=canonical.versionId;
      known.sha256=canonical.sha256;
      known.equivalentHeads=item.equivalentHeadIds;
      known.equivalentSha=C.equivalentSha(await this.payload(canonical),item.path);
    }
    const skipPaths=new Set();
    const branches=[];
    const known=this.state.known;
    for(const item of preview.items){
      const v=item.version;
      if(['fork','local-error','safe-update','delete-review','equivalent','same'].includes(item.status)){
        skipPaths.add(item.path);
        if(item.status==='fork'&&allowFirstJoinBranches&&!known[item.path]&&
           item.localHash&&!item.missingParents?.length)
          branches.push(item);
        continue;
      }
      if(item.status==='conflict'){
        // A current edit is a safe successor only if this device actually
        // previously accepted the head it is editing.
        if(known[item.path]?.versionId===v?.versionId)continue;
        skipPaths.add(item.path);
        if(allowFirstJoinBranches&&!known[item.path]&&item.localHash&&v?.op==='upsert')
          branches.push(item);
      }
    }
    const plan=this.pendingPlan();
    const summary=await this.backup({plan,allowDeletes,skipPaths:[...skipPaths]});
    const branchResults=[];
    for(const item of branches){
      const staged=await this.publishLocalBranch(item);
      if(staged?.pack)branchResults.push(staged);
    }
    // Even when all local files are equivalent and no content ZIP is
    // needed, a deliberate manual upload publishes this device's info and
    // acknowledgements for remote versions it has verified.
    this.writeInfoSync(true,true);
    await this.publishAck(true);
    this.state.initialReviewComplete=true; // explicit reviewed manual upload
    await this.persist();
    return {...summary,adopted:preview.counts.same,skipped:skipPaths.size,
      conflicting:preview.counts.conflict+preview.counts.fork,
      branches:branchResults.length,branchResults};
  }
  async publishLocalBranch(item){
    if(!item||!['conflict','fork'].includes(item.status)||!item.localHash)
      throw Error('A current verified conflict or fork is required');
    if(this.state.known[item.path])
      throw Error('Only previously untracked first-join files can create an independent root branch');
    const latest=await this.latestPlan(),candidate=latest.items.find(x=>x.path===item.path);
    if(!candidate||candidate.status!==item.status||candidate.localHash!==item.localHash)
      throw Error('Conflict changed; recheck before first-join upload');
    if(item.status==='conflict'&&
      (candidate.version?.versionId!==item.version?.versionId||!item.version))
      throw Error('Chosen shared version changed');
    if(item.status==='fork'){
      if(item.missingParents?.length||candidate.missingParents?.length)
        throw Error('Remote fork has incomplete version history');
      const before=(item.heads||[]).slice().sort().join('|');
      const after=(candidate.heads||[]).slice().sort().join('|');
      if(before!==after)throw Error('The remote fork changed during staging');
    }
    const data=nodeFs.readFileSync(this.vaultFile(item.path));
    if(sha(data)!==item.localHash)throw Error('Local file changed during first-join upload');
    // A device with the same content as any already stored head does not
    // need to upload its own duplicate, even if other heads remain divergent.
    const heads=item.status==='fork'?candidate.versions||[]:[candidate.version];
    const localEq=C.equivalentSha(data,item.path);
    for(const v of heads){
      if(v.op!=='upsert')continue;
      let matched=v.sha256===item.localHash;
      if(!matched&&localEq){
        const remote=await this.payload(v);
        matched=C.equivalentSha(remote,item.path)===localEq;
      }
      if(matched){
        this.state.known[item.path]={op:'upsert',sha256:v.sha256,
          equivalentSha:localEq,localSha:item.localHash,
          versionId:v.versionId,at:v.eventAtUtc};
        await this.persist();
        return {alreadyExists:true,versionId:v.versionId};
      }
    }
    return this.publishVersions([{path:item.path,bytes:data,parentVersionId:null,
      baseSha256:null,mergeParents:[]}],{kind:'first-join-branch'});
  }
  async publishVersions(parts,{kind='manual-merge'}={}){
    if(this.publishing)throw Error('Version publication already in progress');
    this.publishing=true;
    try{
      const current=await this.scanCatalog();
      if(current.warnings.length)throw Error('Historical catalog contains damaged or unverified ZIPs');
      if(!parts.length||parts.length>40)throw Error('Invalid publication size');
      const paths=new Set();
      for(const item of parts){
        C.safePath(item.path);
        if(paths.has(item.path))throw Error('Duplicate published path');
        paths.add(item.path);
        if(!Buffer.isBuffer(item.bytes)||item.bytes.length>C.MAX_FILE)
          throw Error('File exceeds allowed publication size');
        if(item.parentVersionId&&
           !current.byPath[item.path]?.some(v=>v.versionId===item.parentVersionId))
          throw Error('Chosen parent version is missing');
      }
      const seq=Math.max(this.state.seq||0,
        ...current.packages.filter(x=>x.originDeviceId===this.state.deviceId).map(x=>x.originSeq))+1;
      const packId=uid(),zip=new this.zip(),entries=[];
      for(const item of parts){
        const n=String(entries.length+1).padStart(4,'0');
        const e={path:item.path,versionId:`${packId}:${n}`,parentVersionId:item.parentVersionId||null,
          mergeParents:item.mergeParents||[],op:'upsert',eventAtUtc:utc(this.clock),
          baseSha256:item.baseSha256||null,sha256:sha(item.bytes),size:item.bytes.length,
          payload:`files/${n}.bin`};
        zip.file(e.payload,item.bytes,{binary:true,compression:'DEFLATE',compressionOptions:{level:3}});
        entries.push(e);
      }
      const manifest={format:'vaultrelay.content.v2',vaultGroupId:this.state.groupId,packId,
        originDeviceId:this.state.deviceId,originName:this.state.displayName||this.state.deviceId,
        originSeq:seq,createdAtUtc:utc(this.clock),entries};
      C.manifest(manifest,this.state.groupId);
      zip.file('manifest.json',JSON.stringify(manifest,null,2));
      const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:3}});
      if(bytes.length>C.MAX_PACK)throw Error('Published ZIP too large');
      const name=`${stamp(this.clock)}__${this.state.deviceId}__${String(seq).padStart(8,'0')}__${packId.slice(0,8)}.zip`;
      const dest=nodePath.join(this.dirs(true).content,name);
      atomicWrite(dest,bytes);
      const verified=await this.readPack(dest,true);
      if(verified.manifest.packId!==packId)throw Error('Written ZIP did not verify');
      this.state.seq=seq;
      for(const e of entries){
        this.state.known[e.path]={op:'upsert',sha256:e.sha256,
          equivalentSha:C.equivalentSha(parts.find(x=>x.path===e.path).bytes,e.path),
          versionId:e.versionId,at:e.eventAtUtc};
        if(this.state.authorizedRestores?.[e.path])delete this.state.authorizedRestores[e.path];
      }
      this.state.lastOperation={kind,at:this.clock(),zip:name,paths:[...paths]};
      this.state.schedule.lastContentAt=this.clock();
      await this.persist();
      return {pack:name,entries};
    }finally{this.publishing=false;}
  }
  privateBackup(p){
    const source=this.vaultFile(p);if(!exists(source))return null;
    const backupDir=nodePath.join(this.vaultPath,'.obsidian','plugins','vault-relay-info-lab','v2-safety-backups');
    checkedChildDirectories(nodeFs.realpathSync(this.vaultPath),nodePath.join('.obsidian','plugins','vault-relay-info-lab','v2-safety-backups'),true);
    const name=`${this.clock()}-${sha(Buffer.from(p)).slice(0,16)}-${uid().slice(0,8)}.bin`;
    const dest=nodePath.join(backupDir,name);
    atomicWrite(dest,nodeFs.readFileSync(source));return dest;
  }
  writeVault(p,bytes,expected){
    const file=this.vaultFile(p),current=currentDigest(exists(file)?file:null);
    if(current!==expected)throw Error('Local file changed during download: '+p);
    const backupPath=current!==null?this.privateBackup(p):null;
    nodeFs.mkdirSync(nodePath.dirname(file),{recursive:true});
    const stage=file+'.vrwrite-'+uid();
    atomicWrite(stage,bytes);
    try{
      if(currentDigest(exists(file)?file:null)!==expected)throw Error('Local file changed during write: '+p);
      nodeFs.renameSync(stage,file);
    }finally{
      if(exists(stage))nodeFs.unlinkSync(stage);
    }
    if(sha(nodeFs.readFileSync(file))!==sha(bytes))throw Error('Local write verification failed');
    return {backupPath,sha256:sha(bytes)};
  }
  async payload(v){
    const rec=await this.readPack(v.packPath,true);
    const e=rec.manifest.entries.find(e=>e.versionId===v.versionId&&e.path===v.path);
    if(!e||e.op!=='upsert'||e.sha256!==v.sha256)throw Error('Historical version missing or invalid');
    const bytes=await rec.zip.file(e.payload).async('nodebuffer');
    if(sha(bytes)!==e.sha256)throw Error('Historical file hash mismatch');
    return bytes;
  }
  async applyPlan(preview,{auto=false,allowDeletes=false}={}){
    const latest=await this.latestPlan();
    if(latest.catalog.warnings.length)
      throw Error('Remote history has damaged or incomplete ZIPs; download safely blocked');
    // Re-check latest catalog and all affected local hashes; prevent stale plan writes.
    if(JSON.stringify(latest.items.map(x=>[x.path,x.status,x.version?.versionId,
        x.version?.sha256,x.version?.packSha256,x.localHash,x.equivalentHeadIds,x.heads]))!==
      JSON.stringify(preview.items.map(x=>[x.path,x.status,x.version?.versionId,
        x.version?.sha256,x.version?.packSha256,x.localHash,x.equivalentHeadIds,x.heads])))
      throw Error('Download preview is stale. Run the preview again.');
    const counts={created:0,updated:0,equal:0,conflicts:0,deletions:0,skipped:0,createdPaths:[],updatedPaths:[],skippedPaths:[],errors:[],undoRecords:[]};
    for(const item of latest.items){
      if(C.isSyncExcludedPath(item.path)||C.isSyncExcludedPath(item.version?.path)){
        counts.skipped++;continue; // no write, no delete, no ACK for protected dirs
      }
      if(!item.version){counts.conflicts++;continue;}
      const v=item.version;
      if(auto&&v.originDeviceId===this.state.deviceId){counts.skipped++;continue;}
      const key=this.state.groupId+'|'+v.originDeviceId+'|'+v.versionId+'|'+(v.sha256||'delete');
      let outcome='skipped';
      try{
        if(item.status==='same'||item.status==='equivalent'||item.status==='absent'){
          outcome=item.status==='equivalent'?'equivalent':'same';counts.equal++;if(item.status==='equivalent')counts.skippedPaths.push(item.path);
          this.state.known[item.path]={op:v.op,sha256:v.sha256,versionId:v.versionId,
            at:v.eventAtUtc,equivalentHeads:item.equivalentHeadIds||null,
            equivalentSha:item.status==='equivalent'?item.equivalentHash:
              (v.op==='upsert'?C.equivalentSha(nodeFs.readFileSync(this.vaultFile(item.path)),item.path):null),
            localSha:item.localHash};
        }else if(item.status==='create'||item.status==='safe-update'){
          const data=await this.payload(v);
          const write=this.writeVault(v.path,data,item.localHash);
          counts.undoRecords.push({path:item.path,action:item.status,
            backupAbsolutePath:write.backupPath||null,beforeSha:item.localHash,
            afterSha:v.sha256,afterVersionId:v.versionId});
          counts[item.status==='create'?'created':'updated']++;
          counts[item.status==='create'?'createdPaths':'updatedPaths'].push(item.path);
          outcome='applied';
          this.state.known[item.path]={op:v.op,sha256:v.sha256,versionId:v.versionId,
            equivalentSha:C.equivalentSha(data,item.path),
            equivalentHeads:item.equivalentHeadIds||null,at:v.eventAtUtc};
        }else if(item.status==='delete-review'&&allowDeletes&&!auto){
          const target=this.vaultFile(v.path);
          if(currentDigest(target)!==item.localHash)throw Error('Deletion source changed');
          const backupAbsolutePath=this.privateBackup(v.path);
          nodeFs.unlinkSync(target);
          if(exists(target))throw Error('Deletion failed');
          counts.undoRecords.push({path:item.path,action:'delete',
            backupAbsolutePath,beforeSha:item.localHash,afterSha:null,
            afterVersionId:v.versionId});
          this.state.known[item.path]={op:'delete',sha256:null,versionId:v.versionId,at:v.eventAtUtc};
          counts.deletions++;outcome='applied';
        }else if(item.status==='conflict'||item.status==='delete-review'||item.status==='local-error'){
          counts.conflicts++;outcome='conflict';
        }else{counts.skipped++;continue;}
        this.state.processed[key]={outcome,at:this.clock()};
        if(v.originDeviceId!==this.state.deviceId){
          const ackId=sha(Buffer.from(key+'|'+outcome+'|'+this.state.deviceId));
          this.state.acks[ackId]={format:'vaultrelay.ack.v2',ackId,vaultGroupId:this.state.groupId,
            fromDeviceId:this.state.deviceId,toDeviceId:v.originDeviceId,packId:v.packId,
            versionId:v.versionId,path:v.path,contentSha256:v.sha256,outcome,
            equivalentSha256:item.status==='equivalent'?item.equivalentHash:null,
            localOriginalSha256:item.status==='equivalent'?item.localHash:null,
            createdAtUtc:utc(this.clock)};
        }
        await this.persist();
      }catch(e){counts.errors.push({path:v.path,error:String(e.message||e)});}
    }
    if(!auto&&counts.errors.length===0)this.state.initialReviewComplete=true;
    this.state.lastOperation={kind:auto?'auto-import':'download',at:this.clock(),counts};await this.persist();
    return counts;
  }
  writeInfoSync(force=false,manual=false){
    if(!this.state.syncEnabled&&!manual)return null;
    const d=this.dirs(true);const seq=++this.state.messageSeq;
    const infoId=`${this.state.deviceId}-${String(seq).padStart(8,'0')}-${uid().slice(0,8)}`;
    const knownEntries=Object.entries(this.state.known).sort((a,b)=>a[0].localeCompare(b[0]));
    const versionsHash=sha(Buffer.from(JSON.stringify(knownEntries.map(([p,v])=>[p,v.sha256,v.versionId,v.op]))));
    const body={format:'vaultrelay.info.v2',vaultGroupId:this.state.groupId,originDeviceId:this.state.deviceId,
      infoId,deviceName:this.state.displayName||this.state.deviceId,createdAtUtc:utc(this.clock),lastContentAt:this.state.schedule.lastContentAt||0,
      knownVersionCount:knownEntries.length,knownVersionsSha256:versionsHash,
      pendingAckCount:Object.keys(this.state.acks).length};
    const target=nodePath.join(d.info,this.state.deviceId,`${infoId}.json`);
    atomicWrite(target,Buffer.from(JSON.stringify(body)));
    this.state.schedule.lastInfoAt=this.clock();return target;
  }
  async publishInfo(force=false){
    if(!this.state.syncEnabled)return {off:true};
    const file=this.writeInfoSync(force);await this.persist();return {file,localOnly:true};
  }
  async receiveInfo(){
    const root=this.dirs(false).info;let processed=0,ignored=0;
    if(!exists(root))return {processed,ignored};
    for(const device of nodeFs.readdirSync(root)){
      if(device===this.state.deviceId){ignored++;continue;}
      if(!C.DEVICE.test(device))continue;
      const dir=nodePath.join(root,device);if(!nodeFs.statSync(dir).isDirectory()||nodeFs.lstatSync(dir).isSymbolicLink())continue;
      for(const name of nodeFs.readdirSync(dir).filter(x=>x.endsWith('.json'))){
        const f=nodePath.join(dir,name);if(nodeFs.lstatSync(f).isSymbolicLink())continue;
        const key=device+'|'+name;
        if(this.state.seenInfo[key]){ignored++;continue;}
        try{
          if(nodeFs.statSync(f).size>1024*1024)throw Error('Oversized info');
          const bytes=nodeFs.readFileSync(f),x=JSON.parse(bytes.toString('utf8'));
          if(x.format!=='vaultrelay.info.v2'||x.vaultGroupId!==this.state.groupId||x.originDeviceId!==device||
             x.infoId+'.json'!==name||!Number.isSafeInteger(x.knownVersionCount)||
             !/^[a-f0-9]{64}$/.test(x.knownVersionsSha256))throw Error('Invalid info message');
          if(typeof x.deviceName==='string'&&x.deviceName.length<=80&&
             !/[\u0000-\u001f]/.test(x.deviceName))
            this.state.devices[device]={name:x.deviceName,at:this.clock()};
          this.state.seenInfo[key]={hash:sha(bytes),at:this.clock()};processed++;
        }catch(e){this.error('Info '+name+': '+String(e.message||e));}
      }
    }
    if(processed)await this.persist();return {processed,ignored};
  }
  async publishAck(manual=false){
    if(!this.state.syncEnabled&&!manual)return {off:true};
    const dir=nodePath.join(this.dirs(true).ack,this.state.deviceId);
    const queued=Object.values(this.state.acks).filter(a=>!this.state.publishedAckIds[a.ackId]);
    let count=0,files=0;
    for(let i=0;i<queued.length;i+=80){
      const entries=queued.slice(i,i+80);
      const batchId=sha(Buffer.from(this.state.deviceId+'|'+entries.map(a=>a.ackId).sort().join('|')));
      const payload={format:'vaultrelay.ack-batch.v2',vaultGroupId:this.state.groupId,
        originDeviceId:this.state.deviceId,batchId,createdAtUtc:utc(this.clock),entries};
      const target=nodePath.join(dir,`ackbatch-${batchId}.json`);
      atomicWrite(target,Buffer.from(JSON.stringify(payload)));
      for(const a of entries)this.state.publishedAckIds[a.ackId]=batchId;
      files++;count+=entries.length;
      await this.persist();
    }
    this.state.schedule.lastAckAt=this.clock();await this.persist();return {count,files};
  }
  ackValid(x,device){
    if(!x||x.format!=='vaultrelay.ack.v2'||x.vaultGroupId!==this.state.groupId||
       x.fromDeviceId!==device||x.toDeviceId!==this.state.deviceId||
       !['applied','same','equivalent','conflict','rejected'].includes(x.outcome)||
       !/^([a-f0-9]{24,64}):[0-9]{4}$/.test(x.versionId)||
       x.packId!==x.versionId.split(':')[0]||!C.safePath(x.path)||
       (x.contentSha256!==null&&!C.HASH.test(x.contentSha256||'')))throw Error('Invalid ACK');
    if(x.outcome==='equivalent'&&
      (!C.HASH.test(x.equivalentSha256||'')||!C.HASH.test(x.localOriginalSha256||'')))
      throw Error('Invalid equivalent ACK metadata');
    const key=this.state.groupId+'|'+this.state.deviceId+'|'+x.versionId+'|'+(x.contentSha256||'delete');
    if(sha(Buffer.from(key+'|'+x.outcome+'|'+device))!==x.ackId)throw Error('ACK ID checksum does not match message');
    return x;
  }
  async receiveAck(){
    const dir=this.dirs(false).ack;let accepted=0,ignored=0;
    if(!exists(dir))return {accepted,ignored};
    for(const device of nodeFs.readdirSync(dir)){
      if(device===this.state.deviceId){ignored++;continue;}
      if(!C.DEVICE.test(device))continue;
      const sub=nodePath.join(dir,device);if(!nodeFs.statSync(sub).isDirectory()||nodeFs.lstatSync(sub).isSymbolicLink())continue;
      for(const name of nodeFs.readdirSync(sub).filter(n=>/^(ackbatch-)?[a-f0-9]{64}\.json$/.test(n))){
        const k=device+'|'+name;if(this.state.seenAck[k]){ignored++;continue;}
        try{
          const file=nodePath.join(sub,name);if(nodeFs.lstatSync(file).isSymbolicLink()||nodeFs.statSync(file).size>1024*1024)throw Error('Unsafe ACK file');
          const x=JSON.parse(nodeFs.readFileSync(file,'utf8'));
          let entries;
          if(x.format==='vaultrelay.ack-batch.v2'){
            if(x.vaultGroupId!==this.state.groupId||x.originDeviceId!==device||
               name!==`ackbatch-${x.batchId}.json`||!Array.isArray(x.entries)||!x.entries.length||x.entries.length>80)
              throw Error('Invalid ACK batch');
            const expected=sha(Buffer.from(device+'|'+x.entries.map(a=>a.ackId).sort().join('|')));
            if(expected!==x.batchId)throw Error('ACK batch fingerprint incorrect');
            entries=x.entries;
          }else{
            if(name!==x.ackId+'.json')throw Error('Invalid ACK filename');
            entries=[x];
          }
          for(const msg of entries){
            this.ackValid(msg,device);
            const own=this.state.known[msg.path];
            // Only track receipts for versions currently owned by this sender.
            if(own?.versionId!==msg.versionId){ignored++;continue;}
            const itemKey=device+'|'+msg.ackId;
            if(this.state.receivedAcks[itemKey]){ignored++;continue;}
            this.state.receivedAcks[itemKey]=msg;accepted++;
          }
          this.state.seenAck[k]={at:this.clock()};
        }catch(e){this.error('ACK '+name+': '+String(e.message||e));}
      }
    }
    if(accepted)await this.persist();return {accepted,ignored};
  }
  error(msg){this.state.errors.push({at:this.clock(),message:String(msg)});if(this.state.errors.length>80)this.state.errors.shift();}
  async tick(){
    if(!this.state.syncEnabled)return {off:true};
    if(this.running)return {busy:true};
    this.running=true;
    try{
      this.dirs(true);
      const now=this.clock(),s=this.state.schedule,plan=this.pendingPlan();this.schedulePending(plan);
      const result={pending:plan.changes.length,info:0,backups:0,receive:null,ack:0,errors:[]};
      if(now-(s.lastReceiveAt||0)>=60000){
        await this.receiveInfo();await this.receiveAck();
        const preview=await this.latestPlan();result.receive=await this.applyPlan(preview,{auto:true});
        s.lastReceiveAt=now;
      }
      if(plan.upserts&&now-(s.lastContentAt||0)>=15*60000 &&
        (now-(s.lastPendingAt||now)>=5*60000||now-(s.firstPendingAt||now)>=30*60000)){
        try{
          // An editor may silently rewrite CRLF/BOM. Do not auto-publish this
          // as a new version; users may still explicitly back up such changes.
          const safety=await this.latestPlan();
          const skipPaths=safety.items.filter(x=>x.formatAnalysis?.kind==='format-only').map(x=>x.path);
          result.formatOnlyDeferred=skipPaths.length;
          const sent=await this.safeUpload({allowFirstJoinBranches:false,allowDeletes:false});result.backups=sent.written;
        }catch(e){result.errors.push(String(e.message||e));this.error(e.message||e);}
      }
      if(now-(s.lastInfoAt||0)>=5*60000){await this.publishInfo();result.info++;}
      if(now-(s.lastAckAt||0)>=5*60000){const a=await this.publishAck();result.ack=a.count;}
      await this.persist();return result;
    }finally{this.running=false;}
  }
  async historicalComparison(version){
    const bytes=version.op==='upsert'?await this.payload(version):null;
    const currentFile=this.vaultFile(version.path),current=exists(currentFile)?nodeFs.readFileSync(currentFile):null;
    const currentHash=current?sha(current):null;
    const isMarkdown=/\.md$/i.test(version.path);
    let diff=null,formatAnalysis=null,isLatestHead=false;
    if(isMarkdown&&bytes!==null&&current!==null){
      formatAnalysis=C.compareTextBytes(bytes,current);
      if(bytes.length<=256*1024&&current.length<=256*1024){
        const decoder=new TextDecoder('utf-8',{fatal:true});
        try{diff=C.lineDiff(decoder.decode(bytes),decoder.decode(current));}catch(e){diff={error:String(e.message||e)};}
      }
      if(formatAnalysis.kind==='format-only'){
        const catalog=await this.scanCatalog(),h=C.heads(catalog.byPath[version.path]||[]);
        isLatestHead=!h.fork&&!h.warnings.length&&h.head?.versionId===version.versionId&&
          h.head?.sha256===version.sha256&&h.head?.packSha256===version.packSha256;
      }
    }
    return {version,currentHash,currentSize:current?.length??null,status:C.describe(currentHash,version),
      diff,formatAnalysis,isLatestHead,canRestoreFormat:formatAnalysis?.kind==='format-only'&&isLatestHead&&!this.state.syncEnabled};
  }

  // Explicit conflict resolution. The local original is never erased without a
  // verified safety backup; the remote version is always preserved in immutable ZIP history.
  // A = latest verified content version in the shared directory, B = this Vault's local file.
  async resolveConflict(path,choice,expectedLocalSha,expectedVersionId,expectedPackSha256){
    if(this.resolvingConflict)throw Error('Another conflict resolution is still running');
    this.resolvingConflict=true;
    try{
      if(this.state.syncEnabled)throw Error('Turn automatic synchronization OFF before resolving conflicts');
      if(!['keep-cloud','keep-local','keep-both'].includes(choice))throw Error('Invalid conflict choice');
      C.safePath(path);
      if(!C.HASH.test(expectedLocalSha||''))throw Error('Invalid expected local SHA');
      const preview=await this.latestPlan();
      const item=preview.items.find(x=>x.path===path);
      if(!item||item.status!=='conflict'||!item.version||item.version.op!=='upsert')
        throw Error('Conflict has changed; refresh the conflict list');
      const v=item.version;
      if(item.localHash!==expectedLocalSha||v.versionId!==expectedVersionId||
         v.packSha256!==expectedPackSha256)
        throw Error('Selected conflict or local file changed; refresh the list');
      const headGraph=C.heads(preview.catalog.byPath[path]||[]);
      if(headGraph.fork||headGraph.heads.length!==1||
         headGraph.warnings.length||headGraph.missingParents.length)
        throw Error('Cloud version chain is ambiguous or incomplete; manual resolution is unavailable');
      const file=this.vaultFile(path);
      if(!exists(file))throw Error('Local original is no longer present');
      const localBytes=nodeFs.readFileSync(file);
      if(sha(localBytes)!==expectedLocalSha)throw Error('Local file changed while resolving; refresh');
      const remoteBytes=await this.payload(v);
      if(sha(remoteBytes)!==v.sha256)throw Error('Remote history could not be verified');
      if(this.state.syncEnabled||this.scanLocalOne(path)!==expectedLocalSha)
        throw Error('Sync state or local file changed; refresh before resolving');
      if(choice==='keep-cloud'){
        const result=this.writeVault(path,remoteBytes,expectedLocalSha);
        this.state.known[path]={op:'upsert',sha256:v.sha256,versionId:v.versionId,at:v.eventAtUtc};
        this.state.lastOperation={kind:'resolve-conflict',choice,at:this.clock(),
          path,backupPath:result.backupPath,sha256:v.sha256};
        await this.persist();
        return {choice,path,sha256:v.sha256,backupPath:result.backupPath,publishedZip:null};
      }
      // For keeping B, publish a NEW child of the verified cloud head so that
      // both peers eventually agree. Merely changing known[] would hide a conflict.
      // This is a manual operation and intentionally writes a new content ZIP while OFF.
      let copyPath=null;
      if(choice==='keep-both'){
        const ext=nodePath.posix.extname(path);
        const stem=path.slice(0,path.length-ext.length);
        const label=` (云端版-${stamp(this.clock).replace(/[^0-9]/g,'')}-${v.originDeviceId.slice(3,11)})`;
        let chosen=null;
        for(let n=0;n<1000;n++){
          const candidate=stem+label+(n?`-${n}`:'')+ext;
          C.safePath(candidate);
          if(preview.catalog.byPath[candidate]||exists(this.vaultFile(candidate)))continue;
          chosen=candidate;break;
        }
        if(!chosen)throw Error('No safe unused filename for retaining both versions');
        copyPath=chosen;
      }
      const backupPath=this.privateBackup(path); // snapshot B before declaring a resolution
      if(!backupPath)throw Error('Could not preserve local original');
      let copyCreated=false;
      if(copyPath){
        if(this.scanLocalOne(path)!==expectedLocalSha)throw Error('Local file changed after backup');
        this.writeVault(copyPath,remoteBytes,null);
        copyCreated=true;
      }
      const payloads=[{path,bytes:localBytes,parentVersionId:v.versionId,
        baseSha256:v.sha256}];
      if(copyPath)payloads.push({path:copyPath,bytes:remoteBytes,
        parentVersionId:null,baseSha256:null});
      try{
        // Re-check the remote graph before publishing the new immutable successor.
        const newer=await this.latestPlan();
        const current=newer.items.find(x=>x.path===path);
        if(!current||current.version?.versionId!==v.versionId||
           current.version?.packSha256!==v.packSha256||
           this.scanLocalOne(path)!==expectedLocalSha||this.state.syncEnabled)
          throw Error('Cloud or local content changed; no conflict resolution was published');
        if(copyPath&&(newer.catalog.byPath[copyPath]||this.scanLocalOne(copyPath)!==v.sha256))
          throw Error('Retained-copy path changed; refusing to publish');
        const seq=Math.max(this.state.seq||0,
          ...newer.catalog.packages.filter(x=>x.originDeviceId===this.state.deviceId).map(x=>x.originSeq))+1;
        const packId=uid(),zip=new this.zip(),entries=[];
        for(const item of payloads){
          if(item.bytes.length>C.MAX_FILE)throw Error('Conflict file exceeds safe upload limit');
          const num=String(entries.length+1).padStart(4,'0');
          const e={path:item.path,versionId:`${packId}:${num}`,
            parentVersionId:item.parentVersionId,op:'upsert',
            eventAtUtc:utc(this.clock),baseSha256:item.baseSha256,
            sha256:sha(item.bytes),size:item.bytes.length,payload:`files/${num}.bin`};
          zip.file(e.payload,item.bytes,{binary:true,compression:'DEFLATE',compressionOptions:{level:3}});
          entries.push(e);
        }
        const manifest={format:'vaultrelay.content.v2',vaultGroupId:this.state.groupId,
          packId,originDeviceId:this.state.deviceId,originSeq:seq,createdAtUtc:utc(this.clock),entries};
        C.manifest(manifest,this.state.groupId);
        zip.file('manifest.json',JSON.stringify(manifest,null,2));
        const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:3}});
        if(bytes.length>C.MAX_PACK)throw Error('Conflict resolution ZIP exceeds package limit');
        if(this.scanLocalOne(path)!==expectedLocalSha||this.state.syncEnabled)
          throw Error('Local file changed during packaging; refusing publication');
        const name=`${stamp(this.clock)}__${this.state.deviceId}__${String(seq).padStart(8,'0')}__${packId.slice(0,8)}.zip`;
        const dest=nodePath.join(this.dirs(true).content,name);
        atomicWrite(dest,bytes);
        const verified=await this.readPack(dest,true);
        if(verified.manifest.packId!==packId)throw Error('Published conflict package verification failed');
        this.state.seq=seq;
        for(const e of entries)this.state.known[e.path]={
          op:'upsert',sha256:e.sha256,versionId:e.versionId,at:e.eventAtUtc};
        this.state.schedule.lastContentAt=this.clock();
        this.state.lastOperation={kind:'resolve-conflict',choice,at:this.clock(),
          path,copyPath,backupPath,zip:name,localOnly:true};
        await this.persist();
        return {choice,path,copyPath,backupPath,publishedZip:name,sha256:entries[0].sha256};
      }catch(err){
        // If a pre-publication failure occurred, the extra local file is harmless;
        // do not remove it if the ZIP may have been published already.
        // Explicitly report the interruption so that the user rechecks all state.
        throw Error('Conflict resolution incomplete; inspect new content ZIPs and the local copy before retrying. '+err.message);
      }
    }finally{this.resolvingConflict=false;}
  }

  draftRoot(){
    return nodePath.join(this.vaultPath,'Vault Relay 合并草稿');
  }
  findSharedAncestor(a,b,byPath){
    const lookup=new Map(byPath.map(v=>[v.versionId,v]));
    const collect=(v)=>{
      const out=new Map(),queue=[{id:v.versionId,d:0}];
      while(queue.length){
        const q=queue.shift();
        if(out.has(q.id))continue;
        out.set(q.id,q.d);
        const z=lookup.get(q.id);
        if(z)for(const parent of C.parentsOf(z))queue.push({id:parent,d:q.d+1});
      }
      return out;
    };
    const x=collect(a),y=collect(b);
    const common=[...x.keys()].filter(z=>y.has(z));
    common.sort((u,v)=>x.get(u)+y.get(u)-x.get(v)-y.get(v));
    return common.length?lookup.get(common[0]):null;
  }
  async beginSmartMerge(path){
    if(this.state.syncEnabled)throw Error('请先关闭自动同步，再创建合并草稿');
    if(!/\.md$/i.test(path))throw Error('智能合并目前只支持 Markdown 文件');
    C.safePath(path);
    if(this.state.drafts[path])throw Error('本文件已有待确认的智能合并草稿');
    let catalog=await this.scanCatalog(),h=C.heads(catalog.byPath[path]||[]);
    if(catalog.warnings.length||h.warnings.length||h.missingParents.length)
      throw Error('Historical content is incomplete; cannot safely create draft');
    if(h.heads.length===0)throw Error('No verified shared versions to merge');
    const currentFile=this.vaultFile(path);
    const current=exists(currentFile)?nodeFs.readFileSync(currentFile):null;
    if(h.heads.length===1){
      if(current===null)throw Error('Only one shared version exists and local file is missing');
      const v=h.head,localSha=sha(current),equiv=C.equivalentSha(current,path);
      const origin=await this.payload(v);
      if(localSha===v.sha256||(equiv&&equiv===C.equivalentSha(origin,path)))
        throw Error('Local file and shared version are already equivalent; no merge needed');
      const known=this.state.known[path];
      if(known?.versionId===v.versionId)
        throw Error('This is a normal local edit, not a branch conflict. Use Upload Files');
      if(known?.versionId && !catalog.byPath[path].some(x=>x.versionId===known.versionId))
        throw Error('Local base version missing from shared history');
      // Preserve the local independent version in a fully verified immutable ZIP
      // before writing the editable merge draft. This is a deliberate action.
      await this.publishVersions([{path,bytes:current,
        parentVersionId:known?.versionId||null,baseSha256:known?.sha256||null,
        mergeParents:[]}],{kind:'preserve-local-merge-source'});
      catalog=await this.scanCatalog();h=C.heads(catalog.byPath[path]||[]);
    }
    if(h.heads.length<2||!h.fork)
      throw Error('没有至少两个需要合并的独立版本');
    // With 3+ source devices, merge two branches at a time. The remaining
    // heads are never consumed without user review in later rounds.
    if(current!==null){
      const currentSha=sha(current);
      if(!h.heads.some(v=>v.sha256===currentSha)){
        const equiv=C.equivalentSha(current,path);
        let match=false;
        if(equiv)for(const v of h.heads){
          if(C.equivalentSha(await this.payload(v),path)===equiv){match=true;break;}
        }
        if(!match)throw Error('Local file contains additional unrecorded changes; export it before merging');
      }
    }
    const snapshot=h.heads.slice().sort((a,b)=>a.versionId.localeCompare(b.versionId));
    const sources=snapshot.slice(0,2);
    const [a,b]=sources;
    const ancestor=this.findSharedAncestor(a,b,catalog.byPath[path]||[]);
    const decoder=new TextDecoder('utf-8',{fatal:true});
    const bufA=await this.payload(a),bufB=await this.payload(b);
    if(bufA.length>512*1024||bufB.length>512*1024)
      throw Error('合并草稿暂支持单份不超过 512 KiB 的 Markdown');
    let ta,tb,base=null;
    try{
      ta=decoder.decode(bufA);tb=decoder.decode(bufB);
      if(ancestor&&ancestor.op==='upsert')base=decoder.decode(await this.payload(ancestor));
    }catch(err){throw Error('Markdown is not valid UTF-8: '+err.message);}
    const nameA=a.originName||a.originDeviceId,nameB=b.originName||b.originDeviceId;
    const merged=VRMerge.generate(base,ta,tb,nameA,nameB);
    const rel=nodePath.posix.join('Vault Relay 合并草稿',
      path.replace(/\.md$/i,'（智能合并）.md'));
    const abs=nodePath.join(this.vaultPath,...rel.split('/'));
    if(exists(abs))throw Error('Merge draft already exists: '+rel);
    const scan=await this.scanCatalog();
    const check=C.heads(scan.byPath[path]||[]);
    if(check.fork!==true||
       check.heads.map(v=>v.versionId).sort().join('|')!==snapshot.map(v=>v.versionId).sort().join('|'))
      throw Error('Shared versions changed while drafting; retry');
    atomicWrite(abs,Buffer.from(merged,'utf8'));
    const meta={originalPath:path,draftPath:rel,initialSha:sha(Buffer.from(merged,'utf8')),
      initialEquivalentSha:C.equivalentSha(Buffer.from(merged,'utf8'),rel),
      heads:sources.map(v=>({versionId:v.versionId,sha256:v.sha256,packSha256:v.packSha256})),
      snapshotHeads:snapshot.map(v=>({versionId:v.versionId,sha256:v.sha256,packSha256:v.packSha256})),
      remainingHeads:snapshot.length-2,sourceNames:[nameA,nameB],createdAt:this.clock(),edited:false};
    this.state.drafts[path]=meta;
    await this.persist();
    return meta;
  }
  async noteDraftModification(filePath,renameInApp=null){
    const draft=Object.values(this.state.drafts).find(x=>x.draftPath===filePath);
    if(!draft||draft.edited)return {changed:false};
    const src=nodePath.join(this.vaultPath,...filePath.split('/'));
    if(!exists(src))return {changed:false};
    const bytes=nodeFs.readFileSync(src);
    if(sha(bytes)===draft.initialSha ||
       (C.equivalentSha(bytes,filePath)===draft.initialEquivalentSha))
      return {changed:false};
    const targetRel=filePath.replace('（智能合并）.md','.md');
    if(targetRel===filePath||exists(nodePath.join(this.vaultPath,...targetRel.split('/'))))
      throw Error('Cannot rename edited merge draft: destination already exists');
    if(renameInApp)await renameInApp(filePath,targetRel);
    else nodeFs.renameSync(src,nodePath.join(this.vaultPath,...targetRel.split('/')));
    if(!exists(nodePath.join(this.vaultPath,...targetRel.split('/'))))
      throw Error('Merge draft rename could not be verified');
    draft.draftPath=targetRel;
    draft.edited=true;
    draft.renamedAt=this.clock();
    await this.persist();
    return {changed:true,draftPath:targetRel,originalPath:draft.originalPath};
  }
  async finishSmartMerge(path){
    if(this.state.syncEnabled)throw Error('Turn automatic sync OFF before publishing merged version');
    const draft=this.state.drafts[path];
    if(!draft)throw Error('No pending merge draft for this file');
    const abs=nodePath.join(this.vaultPath,...draft.draftPath.split('/'));
    if(!exists(abs))throw Error('Merge draft is missing');
    const originalDraft=nodeFs.readFileSync(abs);
    const text=new TextDecoder('utf-8',{fatal:true}).decode(originalDraft);
    // Strip the exact plugin-generated header before publishing a clean note.
    const clean=text.replace(/^> \[!warning\] Vault Relay 智能合并草稿\n> 蓝色来自 [^\n]*\n> 请逐段编辑，[^\n]*\n\n/,'');
    const merged=Buffer.from(clean,'utf8');
    if(!draft.edited||sha(merged)===draft.initialSha)
      throw Error('Please edit the smart-merge draft before finalizing');
    if(VRMerge.unresolved(text)||
       /^> \[!(info|warning|vr-blue|vr-orange)\] .*的版本（(蓝色|橙色)）/m.test(text))
      throw Error('未解决的蓝色/橙色来源标记仍存在，请先在草稿中编辑并移除');
    const catalog=await this.scanCatalog(),head=C.heads(catalog.byPath[path]||[]);
    const snapshot=draft.snapshotHeads||draft.heads;
    if(catalog.warnings.length||head.warnings.length||head.missingParents.length||
      !head.fork||head.heads.length!==snapshot.length)
      throw Error('Shared versions have changed or are incomplete; merge cannot be published');
    for(const ref of snapshot){
      const seen=head.heads.find(v=>v.versionId===ref.versionId &&
        v.sha256===ref.sha256&&v.packSha256===ref.packSha256);
      if(!seen)throw Error('One original version changed; recheck merge draft');
    }
    const localFile=this.vaultFile(path),before=exists(localFile)?sha(nodeFs.readFileSync(localFile)):null;
    // Replace only after verifying both historical versions and the exact
    // original file SHA. writeVault creates a separately checked local backup.
    const backup=this.writeVault(path,merged,before);
    const [parent,...extra]=draft.heads;
    const published=await this.publishVersions([{
      path,bytes:merged,parentVersionId:parent.versionId,
      baseSha256:parent.sha256,mergeParents:extra.map(x=>x.versionId)}],{kind:'smart-merge-final'});
    // Remove draft only after finished ZIP was verified; preserve its
    // contents in the new full-file history package.
    nodeFs.unlinkSync(abs);
    delete this.state.drafts[path];
    this.state.lastOperation={kind:'smart-merge-final',path,at:this.clock(),
      zip:published.pack,backupPath:backup.backupPath};
    await this.persist();
    return {path,published:published.pack,backupPath:backup.backupPath};
  }
  async exportLocalZip(target,{includeSettings=false}={}){
    const out=nodePath.resolve(String(target||''));
    const vault=nodeFs.realpathSync(this.vaultPath);
    if(!nodePath.isAbsolute(out)||out===vault||out.startsWith(vault+nodePath.sep))
      throw Error('Export ZIP must be outside the Obsidian Vault');
    if(!out.toLowerCase().endsWith('.zip'))throw Error('Export path must end with .zip');
    if(this.state.shareRoot&&exists(this.state.shareRoot)){
      const share=nodeFs.realpathSync(this.state.shareRoot);
      if(out===share||out.startsWith(share+nodePath.sep))
        throw Error('Offline ZIP must not be inside the Baidu synchronization folder');
    }
    if(exists(out))throw Error('Export filename already exists; choose another name');
    const files=[];
    const walk=(dir,prefix)=>{
      for(const ent of nodeFs.readdirSync(dir,{withFileTypes:true})){
        if(!includeSettings&&prefix===''&&ent.name==='.obsidian')continue;
        const rel=prefix?prefix+'/'+ent.name:ent.name;
        const full=nodePath.join(dir,ent.name);
        if(ent.isSymbolicLink())continue;
        if(ent.isDirectory())walk(full,rel);
        else if(ent.isFile()){
          const st=nodeFs.statSync(full);
          if(st.size>C.MAX_FILE)throw Error('Exported file exceeds 128 MiB: '+rel);
          files.push({path:rel,full,size:st.size});
        }
      }
    };
    walk(vault,'');
    if(!files.length)throw Error('No files found to export');
    const total=files.reduce((n,x)=>n+x.size,0);
    if(total>512*1024*1024)throw Error('Export exceeds 512 MiB in-memory safety limit');
    if(files.length>20000)throw Error('Too many files for single ZIP export');
    const zip=new this.zip(),manifest=[];
    for(const f of files){
      const bytes=nodeFs.readFileSync(f.full);
      if(bytes.length!==f.size)throw Error('File changed while exporting: '+f.path);
      zip.file(f.path,bytes,{binary:true,compression:'DEFLATE',compressionOptions:{level:3}});
      manifest.push({path:f.path,size:bytes.length,sha256:sha(bytes)});
    }
    const doc={format:'vaultrelay.offline-export.v1',createdAt:utc(this.clock),
      groupId:this.state.groupId,deviceName:this.state.displayName||null,
      includesSettings:includeSettings,files:manifest};
    const manifestPath='__VaultRelay_export_manifest.json';
    if(files.some(x=>x.path===manifestPath))throw Error('Reserved export manifest filename already exists');
    zip.file(manifestPath,JSON.stringify(doc,null,2));
    const output=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:3}});
    if(output.length>512*1024*1024)throw Error('Generated export ZIP exceeds limit');
    // Detect external edits before committing export.
    for(const f of files)if(sha(nodeFs.readFileSync(f.full))!==manifest.find(x=>x.path===f.path)?.sha256)
      throw Error('A local file changed during export: '+f.path);
    atomicWrite(out,output);
    const verified=await this.zip.loadAsync(nodeFs.readFileSync(out));
    const saved=JSON.parse(await verified.file(manifestPath).async('string'));
    for(const entry of saved.files){
      const payload=verified.file(entry.path);
      if(!payload)throw Error('Missing ZIP entry '+entry.path);
      if(sha(await payload.async('nodebuffer'))!==entry.sha256)throw Error('Export ZIP SHA mismatch: '+entry.path);
    }
    return {output:out,files:manifest.length,bytes:output.length,includeSettings};
  }
  // A deliberate, OFF-only byte restoration from a verified *latest* history entry.
  // Never silently accept normalized text as byte-identical.
  async restoreFormatOnly(version,expectedCurrentSha){
    if(this.state.syncEnabled)throw Error('Turn synchronization OFF before repairing bytes');
    if(!version||version.op!=='upsert'||!/\.md$/i.test(version.path))throw Error('Only Markdown full versions are eligible');
    C.safePath(version.path);
    if(!C.HASH.test(expectedCurrentSha||''))throw Error('Invalid expected local hash');
    const catalog=await this.scanCatalog(),head=C.heads(catalog.byPath[version.path]||[]);
    const v=head.head;
    if(head.fork||head.warnings.length||!v||v.versionId!==version.versionId||
       v.sha256!==version.sha256||v.packSha256!==version.packSha256)
      throw Error('Selected historical version is not the latest unambiguous verified head');
    const file=this.vaultFile(v.path);
    if(!exists(file))throw Error('Current local file does not exist');
    const before=nodeFs.readFileSync(file),beforeSha=sha(before);
    if(beforeSha!==expectedCurrentSha)throw Error('Local file changed after comparison; compare again');
    const verifiedBytes=await this.payload(v);
    const analysis=C.compareTextBytes(verifiedBytes,before);
    if(analysis.kind!=='format-only')throw Error('Content is not confirmed format-only; refusing to overwrite');
    const result=this.writeVault(v.path,verifiedBytes,beforeSha);
    this.state.known[v.path]={op:v.op,sha256:v.sha256,versionId:v.versionId,at:v.eventAtUtc};
    this.state.lastOperation={kind:'format-restore',at:this.clock(),path:v.path,
      backupPath:result.backupPath,restoredSha:v.sha256};
    await this.persist();
    return {path:v.path,backupPath:result.backupPath,sha256:v.sha256,analysis};
  }
}
module.exports={V2Engine,emptyState,sha,uid,atomicWrite,assertSafeBase};

return module.exports;})();
'use strict';
const {Plugin,Modal,Notice,Setting}=require('obsidian');
const vrOs=require('os'),vrFs=require('fs'),vrPath=require('path');
const {V2Engine,emptyState,uid}=VREngine;
const C=VRCore;
function notify(msg){new Notice(msg,6500);}
function fmt(t){return t?new Date(t).toLocaleString():'尚无记录';}
function count(obj){return Object.keys(obj||{}).length;}
async function copyValue(v){
  try{
    const electron=require('electron');
    if(electron.clipboard?.writeText){electron.clipboard.writeText(v);notify('已复制到剪贴板');return;}
  }catch(_){}
  if(typeof navigator!=='undefined'&&navigator.clipboard?.writeText){
    await navigator.clipboard.writeText(v);notify('已复制到剪贴板');return;
  }
  notify('此环境无法自动复制，请手动选择文字复制。');
}
function deviceLabel(p,id,name){
  return name||p.engine.state.devices?.[id]?.name||id;
}

class HomeModal extends Modal{
  constructor(app,p){super(app);this.p=p;this.advanced=false;this.expanded=null;this.checkDetails=null;}
  onOpen(){
    this.modalEl.addClass('vr2-panel');
    if(!this.p.engine.state.setupComplete){
      this.close();new SetupWizardModal(this.app,this.p).open();return;
    }
    this.render();
  }
  render(){
    const e=this.contentEl,p=this.p,s=p.engine.state;
    e.empty();e.createEl('h2',{text:'Vault Relay · 知识库同步'});
    e.createEl('p',{cls:'vr2-help',text:`本机：${s.displayName||'未命名设备'} · 自动同步 ${s.syncEnabled?'ON':'OFF'}`});
    if(s.machineChanged)e.createEl('p',{cls:'vr2-warning',
      text:'设备名称与配置时不同，可能复制过整个 Vault。请先检查并重新确认本机身份。自动同步保持关闭。'});
    // 前置连接检查置顶。说明区默认收起，同一时刻只展开一项；设置向导仍保留弹窗。
    new Setting(e).setName('设置与连接检查')
      .addButton(b=>b.setButtonText('向导与设置').onClick(()=>{
        this.expanded='setup';this.advanced=false;this.render();
        new SetupWizardModal(this.app,p).open();
      }))
      .addButton(b=>b.setButtonText('检查连接').onClick(async()=>{
        this.expanded='check';this.advanced=false;
        this.checkDetails={busy:true};this.render();
        await p.run(async()=>{
          const cat=await p.engine.scanCatalog(),plan=await p.engine.latestPlan();
          this.checkDetails={valid:cat.count,bad:cat.warnings.length,same:plan.counts.same,
            equivalent:plan.counts.equivalent,conflict:plan.counts.conflict+plan.counts.fork,
            folder:s.shareRoot,group:s.groupId,errors:cat.warnings.slice(0,4)};
          this.render();
          if(cat.warnings.length)notify('发现异常 ZIP，请检查详情后再操作。');
        });
        if(this.checkDetails?.busy){this.checkDetails={error:'连接检查失败，请确认目录和配置。'};this.render();}
      }));
    if(this.expanded==='setup'){
      e.createDiv({cls:'vr2-inline',text:'向导用于配置当前知识库的网盘GroupID、群组名称、设备身份和百度同步目录。修改绑定前先保持自动同步 OFF；重要设置仍在弹窗中确认。'});
    }else if(this.expanded==='check'){
      const d=this.checkDetails||{};
      const msg=d.busy?'正在核对本地共享目录和内容 ZIP…':
        d.error||`目录：${d.folder||'未指定'}\n网盘GroupID：${d.group||''}\n有效 ZIP：${d.valid}；异常 ZIP：${d.bad}；已一致：${d.same}；等效：${d.equivalent}；冲突：${d.conflict}。\n此检查不代表百度云端已完成传输。`;
      e.createDiv({cls:'vr2-inline'+(d.bad||d.error?' vr2-warning':''),text:msg});
    }
        new Setting(e).setName('自动同步').setDesc('关闭时不自动发送或接收；上传、下载按钮可手动使用。')
      .addToggle(t=>t.setValue(!!s.syncEnabled).onChange(async v=>{
        try{
          if(v){
            if(s.machineChanged)throw Error('请先处理设备身份异常');
            if(!s.initialReviewComplete)
              throw Error('请先运行上传文件或下载文件，完成首次预览和确认');
            p.engine.dirs(false);
          }
          s.syncEnabled=!!v;await p.persist();notify(v?'自动同步已开启':'自动同步已关闭');this.render();
        }catch(err){s.syncEnabled=false;notify('不能开启：'+err.message);this.render();}
      }));
    new Setting(e).setName('上传文件').setDesc('比较共享目录，内容等效的不重复上传；真正不同的版本先保留来源。')
      .addButton(b=>b.setButtonText('上传文件').setCta().onClick(()=>new BackupModal(p.app,p).open()));
    new Setting(e).setName('下载文件').setDesc('只下载缺失或可安全更新的内容；等效 SHA 的文件保持原样。')
      .addButton(b=>b.setButtonText('下载文件').onClick(()=>new DownloadModal(p.app,p).open()));
    new Setting(e).setName('导出 ZIP').setDesc('将本机知识库完整打包到本地 ZIP，不写入百度同步目录。')
      .addButton(b=>b.setButtonText('导出 ZIP').onClick(()=>new OfflineZipModal(p.app,p).open()));
    new Setting(e).setName('历史与冲突').setDesc('比较版本、查看所有冲突及进行智能合并。')
      .addButton(b=>b.setButtonText('历史与冲突').onClick(()=>new HistoryModal(p.app,p).open()));
    new Setting(e).setName('智能合并草稿')
      .setDesc(`${Object.keys(s.drafts||{}).length} 个待确认草稿。改动后自动去掉标题中的「智能合并」字样，确认前不上传。`)
      .addButton(b=>b.setButtonText('查看草稿').onClick(()=>new MergeDraftsModal(p.app,p).open()));
    const idSetting=new Setting(e).setName('网盘GroupID').setDesc(s.groupId);
    idSetting.addButton(b=>b.setButtonText('复制').onClick(()=>copyValue(s.groupId)));
    // 群组名称是本知识库的本地显示标签，修改它不会更改网盘GroupID。
    let newGroupName=s.groupName||'';
    new Setting(e).setName('群组名称').setDesc('仅用于标识当前知识库，不改变网盘GroupID或历史版本。')
      .addText(t=>t.setPlaceholder('例如：E生学物理').setValue(newGroupName).onChange(v=>{newGroupName=v;}))
      .addButton(b=>b.setButtonText('保存名称').onClick(()=>p.run(async()=>{
        const v=newGroupName.trim();if(v.length>80||/[\u0000-\u001f]/.test(v))throw Error('群组名称不能超过80字且不能包含控制字符');
        s.groupName=v;await p.persist();this.render();
      },'群组名称已保存')));
    new Setting(e).setName('本机设备 ID').setDesc(s.deviceId)
      .addButton(b=>b.setButtonText('复制').onClick(()=>copyValue(s.deviceId)));
    new Setting(e).setName('加入信息').setDesc('发送到另一台电脑后，可用于加入同一群组。')
      .addButton(b=>b.setButtonText('复制入组信息').onClick(()=>copyValue(
        `Vault Relay Group ID: ${s.groupId}\n群组名称：${s.groupName||''}\n设备名称：${s.displayName||''}\n请在另一台电脑生成自己的 Device ID。`)));
    new Setting(e).setName('高级信息').setDesc('仅在排查同步问题时使用。')
      .addButton(b=>b.setButtonText(this.advanced?'收起':'展开').onClick(()=>{this.advanced=!this.advanced;this.expanded=null;this.render();}));
    if(this.advanced){
      new Setting(e).setName('发送本地信息包').setDesc('自动同步 ON 时可发送。')
        .addButton(b=>b.setButtonText('发送信息').onClick(()=>p.run(()=>p.engine.publishInfo(true),'已写入本地信息包')));
      new Setting(e).setName('立即检查同步').setDesc('仅同步 ON 时执行。')
        .addButton(b=>b.setButtonText('立即检查').onClick(()=>p.run(()=>p.engine.tick(),'同步检查完成')));
      new Setting(e).setName('退出时尝试备份待发文件')
        .addToggle(t=>t.setValue(!!s.exitUploadContent).onChange(async v=>{s.exitUploadContent=!!v;await p.persist();}));
    }
    e.createEl('p',{cls:'vr2-help',text:'使用百度本地同步目录交换完整文件版本；写入本地目录不等于已上传百度云端。历史 ZIP 不自动清理。'});
  }
  onClose(){this.contentEl.empty();}
}
class SetupWizardModal extends Modal{
  constructor(app,p){
    super(app);this.p=p;this.mode=null;this.folder=p.engine.state.shareRoot||'';
    this.group=p.engine.state.groupId;this.groupName=p.engine.state.groupName||'';this.name=p.engine.state.displayName||vrOs.hostname()||'我的电脑';
    this.detected=[];
  }
  onOpen(){this.modalEl.addClass('vr2-panel');this.render();}
  async chooseFolder(){
    try{
      const electron=require('electron');
      const dialog=electron.remote?.dialog||electron.dialog;
      if(dialog?.showOpenDialog){
        const result=await dialog.showOpenDialog({title:'请选择百度同步盘本地目录',properties:['openDirectory','createDirectory']});
        if(result?.filePaths?.[0]){this.folder=result.filePaths[0];this.render();return;}
      }
    }catch(_){}
    notify('请将百度同步盘本地目录的完整路径填写在输入框中。');
  }
  detect(){
    this.detected=[];
    try{
      const base=vrPath.join(this.folder,'VaultRelay');
      if(vrFs.existsSync(base))
        this.detected=vrFs.readdirSync(base,{withFileTypes:true})
          .filter(x=>x.isDirectory()&&C.GROUP.test(x.name)).map(x=>x.name);
      if(this.detected.length===1)this.group=this.detected[0];
    }catch(err){notify('识别失败：'+err.message);}
    this.render();
  }
  render(){
    const e=this.contentEl,s=this.p.engine.state;e.empty();
    e.createEl('h2',{text:'首次使用与同步设置向导'});
    e.createEl('p',{cls:'vr2-help',text:'每个知识库使用一个共同网盘GroupID；每台电脑拥有独立 Device ID。所有设置都可以先保持自动同步 OFF。'});
    if(!this.mode){
      new Setting(e).setName('创建新同步群组').setDesc('第一台已拥有资料的电脑：自动创建网盘GroupID。')
        .addButton(b=>b.setButtonText('创建新组').onClick(()=>{this.mode='create';this.render();}));
      new Setting(e).setName('合并已有知识库').setDesc('本机已有笔记，加入同一群组；相同内容去重，独有文件上传，真正差异保留。')
        .addButton(b=>b.setButtonText('加入已有组').onClick(()=>{this.mode='join';this.render();}));
      if(s.shareRoot)new Setting(e).setName('沿用当前配置').setDesc('继续使用当前 GroupID、Device ID 和已确认的同步状态。')
        .addButton(b=>b.setButtonText('沿用当前配置').onClick(()=>{this.mode='keep';this.render();}));
      return;
    }
    new Setting(e).setName('群组名称（当前知识库）').setDesc('例如：E生学物理；可修改，不会改变网盘GroupID。')
      .addText(t=>t.setValue(this.groupName).setPlaceholder('请输入中文群组名称').onChange(v=>{this.groupName=v;}));
    new Setting(e).setName('设备名称').setDesc('例如办公电脑、家用电脑、随身笔记本；可随时修改。')
      .addText(t=>t.setValue(this.name).onChange(v=>{this.name=v;}));
    new Setting(e).setName('百度同步盘本地目录').setDesc('选择已存在的百度同步盘文件夹，不能与 Obsidian 库互相包含。')
      .addText(t=>t.setValue(this.folder).setPlaceholder('C:\\BaiduSyncdisk').onChange(v=>{this.folder=v;}))
      .addButton(b=>b.setButtonText('选择文件夹').onClick(()=>this.chooseFolder()));
    const candidates=[
      vrPath.join(vrOs.homedir(),'BaiduSyncdisk'),
      vrPath.join(vrOs.homedir(),'BaiduNetdiskSync'),
      vrPath.join(vrOs.homedir(),'百度同步盘'),
      vrPath.join(vrOs.homedir(),'百度网盘同步空间')
    ].filter(x=>vrFs.existsSync(x)&&vrFs.statSync(x).isDirectory());
    for(const path of candidates){
      new Setting(e).setName('发现可能的百度同步目录').setDesc(path)
        .addButton(b=>b.setButtonText('使用此目录').onClick(()=>{this.folder=path;this.render();}));
    }
    if(this.mode==='join'){
      new Setting(e).setName('从本地目录自动识别群组').setDesc('只发现一个群组时自动填入；多个群组请手动选择。')
        .addButton(b=>b.setButtonText('扫描群组').onClick(()=>this.detect()));
      for(const id of this.detected)new Setting(e).setName(id)
        .addButton(b=>b.setButtonText('选择此组').onClick(()=>{this.group=id;this.render();}));
      new Setting(e).setName('已有网盘GroupID').setDesc('可直接粘贴另一台电脑复制的网盘GroupID。')
        .addText(t=>t.setValue(this.group).onChange(v=>{this.group=v.trim();}))
        .addButton(b=>b.setButtonText('从剪贴板粘贴').onClick(async()=>{
          try{
            const electron=require('electron'),value=electron.clipboard?.readText()||'';
            const m=value.match(/vg-[a-z0-9]{16,40}/);
            if(!m)throw Error('剪贴板没有有效 Group ID');
            this.group=m[0];this.render();
          }catch(err){notify('请手动粘贴 Group ID：'+err.message);}
        }));
    }
    e.createEl('p',{cls:'vr2-help',text:`设备 ID：${s.deviceId}（由插件自动管理）`});
    new Setting(e).setName(s.machineChanged?'检测到设备身份可能重复':'知识库复制到新设备了吗？')
      .setDesc('只在复制到另一台独立电脑或克隆成第二个实例时使用；正常升级不要重置 ID。')
      .addButton(b=>b.setButtonText('为新设备生成独立身份').onClick(async()=>{
        try{
          if(s.syncEnabled)throw Error('先关闭自动同步');
          this.p.engine.resetDeviceIdentity();
          await this.p.persist();notify('已生成本机新的 Device ID');this.render();
        }catch(err){notify('重设失败：'+err.message);}
      }));
    new Setting(e).setName('保存向导配置').setDesc('完成后保持同步 OFF，并由你决定首次上传或下载。')
      .addButton(b=>b.setButtonText('完成设置').setCta().onClick(async()=>{
        try{
          if(!this.name.trim()||this.name.length>80)throw Error('设备名称必须为 1–80 个字符');
          if(this.mode==='create'&&Object.keys(s.known||{}).length)
            throw Error('已跟踪文件版本的知识库不能直接创建新群组，请选择沿用当前配置');
          if(s.machineChanged)throw Error('检测到设备身份可能重复，请先为这台电脑生成新 Device ID');
          // Validate group and ZIPs BEFORE changing the persisted group identity.
          const candidateRoot=vrPath.resolve(String(this.folder||'').trim());
          if(this.mode==='join'){
            const groupId=this.group.trim();
            C.validId(groupId,C.GROUP,'group');
            const probe=new V2Engine({vaultPath:this.p.engine.vaultPath,
              state:{...s,groupId,shareRoot:candidateRoot},zip:VRI_ZIP,persist:async()=>{}});
            if(!vrFs.existsSync(probe.dirs(false).root))
              throw Error('没有找到该 Group ID 的同步目录，请从已有电脑复制加入信息');
            const catalog=await probe.scanCatalog();
            if(!catalog.count)throw Error('该群组没有已验证的内容 ZIP。请先让创建群组的电脑完成首次上传及同步');
            if(catalog.warnings.length)throw Error('检测到损坏或不完整的历史 ZIP，请先解决后入组');
          }
          // In case a filesystem check throws, retain the original identity.
          const originalRoot=s.shareRoot;
          try{
            this.p.engine.setRoot(this.folder);
            if(this.mode==='join')this.p.engine.setGroup(this.group.trim());
          }catch(err){s.shareRoot=originalRoot;throw err;}
          if(this.groupName.trim().length>80||/[\u0000-\u001f]/.test(this.groupName))
             throw Error('群组名称不能超过80字且不能包含控制字符');
           s.groupName=this.groupName.trim();
           s.displayName=this.name.trim();
          s.machineName=vrOs.hostname();
          s.machineChanged=false;s.setupComplete=true;s.syncEnabled=false;
          await this.p.persist();this.close();notify('同步设置已保存，自动同步保持 OFF');
          new HomeModal(this.app,this.p).open();
        }catch(err){notify('配置失败：'+err.message);}
      }))
    new Setting(e).setName('返回选择').addButton(b=>b.setButtonText('上一步').onClick(()=>{this.mode=null;this.render();}));
  }
  onClose(){this.contentEl.empty();}
}
class OfflineZipModal extends Modal{
  constructor(app,p){
    super(app);this.p=p;this.includeSettings=false;
    const name=vrPath.basename(p.engine.vaultPath).replace(/[\\/:*?"<>|]/g,'_');
    const download=vrPath.join(vrOs.homedir(),'Downloads');
    const outputDir=vrFs.existsSync(download)?download:vrPath.dirname(p.engine.vaultPath);
    this.output=vrPath.join(outputDir,`${name}_${new Date().toISOString().slice(0,10)}_${Date.now()}.zip`);
  }
  onOpen(){
    const e=this.contentEl;e.createEl('h3',{text:'导出本地知识库 ZIP'});
    e.createEl('p',{cls:'vr2-help',text:'保存当前本地笔记、附件及未完成的智能合并草稿；不会上传至百度网盘。'});
    new Setting(e).setName('导出路径').setDesc('选择一个不在 Vault、也不在百度同步目录中的完整 ZIP 文件路径。')
      .addText(t=>t.setValue(this.output).onChange(v=>{this.output=v;}));
    new Setting(e).setName('同时导出 .obsidian 配置').setDesc('包含插件数据和设备身份，复制到新设备后必须重新确认 Device ID。')
      .addToggle(t=>t.setValue(false).onChange(v=>{this.includeSettings=v;}));
    new Setting(e).setName('创建并校验 ZIP')
      .addButton(b=>b.setButtonText('导出 ZIP').setCta().onClick(async()=>{
        const result=await this.p.run(()=>this.p.engine.exportLocalZip(this.output,{includeSettings:this.includeSettings}));
        if(result){notify(`已导出 ${result.files} 个文件，并逐项校验 SHA。文件：${result.output}`);this.close();}
      }));
  }
  onClose(){this.contentEl.empty();}
}
class BackupModal extends Modal{
  constructor(app,p){super(app);this.p=p;this.allowDeletes=false;this.allowBranches=false;this.plan=null;}
  async onOpen(){
    const e=this.contentEl;e.empty();e.createEl('h3',{text:'上传文件｜预览'});
    try{
      this.p.engine.dirs(false);
      await this.p.engine.reconcileSelf();
      this.remote=await this.p.engine.latestPlan();
      this.plan=this.p.engine.pendingPlan();
    }catch(err){e.createEl('p',{cls:'vr2-warning',text:'无法准备上传：'+err.message});return;}
    const q=this.plan,r=this.remote;
    e.createEl('p',{cls:'vr2-summary',text:`扫描本机：待检查新增/修改 ${q.upserts}；删除候选 ${q.deletions}；排除 ${q.excluded}；无法读取 ${q.errors.length}。`});
    e.createEl('p',{text:`群组已一致 ${r.counts.same}（其中内容等效 ${r.counts.equivalent}）；本机待上传 ${r.counts['local-update']}；真正冲突 ${r.counts.conflict}；版本分叉 ${r.counts.fork}。`});
    e.createEl('p',{cls:'vr2-help',text:'原始 SHA 不同但等效 SHA 相同的 Markdown 不重复上传，不替换本地文件。新增和正常修改按版本关系发送。'});
    if(q.errors.length)e.createEl('p',{cls:'vr2-warning',text:'文件检查异常：'+q.errors.slice(0,8).map(x=>x.path).join(', ')});
    if(r.catalog.warnings.length)e.createEl('p',{cls:'vr2-warning',text:'历史 ZIP 存在异常；安全上传将被阻止。'});
    const firstJoin=r.items.filter(x=>x.status==='conflict'&&!this.p.engine.state.known[x.path]);
    if(firstJoin.length)new Setting(e).setName(`登记 ${firstJoin.length} 个来自本机的不同版本`)
      .setDesc('首次入组可将本机不同正文保存为独立历史分支，不覆盖共享版本，稍后进入智能合并。此操作会生成 ZIP 并可能被百度客户端上传。')
      .addToggle(t=>t.setValue(false).onChange(v=>{this.allowBranches=v;}));
    if(q.deletions)new Setting(e).setName('同时发布删除墓碑')
      .setDesc('默认关闭；删除可能传播到其他设备。')
      .addToggle(t=>t.setValue(false).onChange(v=>{this.allowDeletes=v;}));
    const list=e.createDiv({cls:'vr2-scroll'});
    for(const x of q.changes.slice(0,80))list.createEl('p',{text:`${x.op==='delete'?'删除待确认':'新增或修改'} · ${x.path}`});
    if(q.changes.length>80)list.createEl('p',{text:`还有 ${q.changes.length-80} 条；重复内容将由二级哈希在发送前跳过。`});
    new Setting(e).setName('确认手动上传')
      .setDesc('先校验 ZIP：Windows 自动收发关闭时仅本地排队、开启时写入百度同步目录；若已有待回传 ACK 则一起装入 ZIP。')
      .addButton(b=>b.setButtonText('确认上传').setCta().onClick(async()=>{
        const result=await this.p.run(()=>this.p.engine.safeUpload({
          allowFirstJoinBranches:this.allowBranches,allowDeletes:this.allowDeletes}));
        if(result){
          try{
            const ready=await this.p.finalizeConfirmedUpload(result);
            notify('已按“内容+待回传 ACK 合包；仅 ACK 独立 JSON”准备文件；自动收发关闭时仅本地排队，云端状态未验证');
          }catch(err){
            await this.p.log('自动封装/准备未完成',String(err.message||err)+
              '；同步核心已保留原始交换文件，请到高级操作重试②③');
            notify('正式内容已生成，但外层 ZIP/ACK 准备失败，请查看日志');
          }
          this.close();
        }
      }));
  }
  onClose(){this.contentEl.empty();}
}
class DownloadModal extends Modal{
  constructor(app,p){
    super(app);
    this.p=p;
    this.plan=null;
    this.allowDeletes=false;
    this.view='conflicts';
    this.regularLimit=100;
    this.closed=false;
  }
  async onOpen(){
    this.modalEl.addClass('vr2-download');
    await this.refresh(true);
  }
  async refresh(first=false){
    const e=this.contentEl;
    e.empty();
    e.createEl('h3',{text:'正在重新校验内容包与本机文件…'});
    try{
      // Never reuse the old preview after any repair, local edit or new cloud ZIP.
      this.plan=await this.p.engine.latestPlan();
      if(this.closed)return;
      if(first){
        this.view=this.plan.items.some(x=>['conflict','fork','local-error'].includes(x.status))?'conflicts':'all';
      }
      this.render();
    }catch(err){
      if(this.closed)return;
      this.plan=null;
      e.empty();
      e.createEl('h3',{text:'文件检查失败'});
      e.createEl('p',{cls:'vr2-warning',text:String(err.message||err)});
      new Setting(e).addButton(b=>b.setButtonText('重试检查').onClick(()=>this.refresh()));
    }
  }
  render(){
    if(this.closed||!this.plan)return;
    const e=this.contentEl,q=this.plan;
    e.empty();
    e.createEl('h3',{text:'写入前核对版本'});
    e.createEl('p',{text:Object.entries(q.counts).map(([k,v])=>`${k}: ${v}`).join(' | ')});
    if(q.counts.equivalent)e.createEl('p',{cls:'vr2-summary',
      text:`已有 ${q.counts.equivalent} 个 Markdown 虽然原始 SHA 不同，但等效 SHA 相同：直接视为已一致，不下载、不覆盖、不重复上传。`});
    if(q.catalog.warnings.length)e.createEl('p',{cls:'vr2-warning',
      text:`损坏或不可用的 ZIP：${q.catalog.warnings.length}。预览可能不完整，请先检查。`});
    if(q.items.some(x=>x.status==='delete-review')){
      new Setting(e).setName('同时应用删除墓碑')
        .setDesc('可选且有风险；删除前先保存本机安全备份。')
        .addToggle(t=>t.setValue(this.allowDeletes).onChange(v=>{this.allowDeletes=v;}));
    }
    const issues=q.items.filter(x=>['conflict','fork','local-error'].includes(x.status));
    const formatOnly=q.items.filter(x=>x.status==='equivalent');
    const toCreate=q.items.filter(x=>x.status==='create');
    const toUpdate=q.items.filter(x=>x.status==='safe-update');
    new Setting(e).setName(`待处理问题：${issues.length} 项`)
      .setDesc('冲突文件全部单独列出，不再混在前 100 个普通文件中。查看差异不会修改笔记。')
      .addButton(b=>b.setButtonText(`只看冲突 (${issues.length})`)
        .onClick(()=>{this.view='conflicts';this.render();}))
      .addButton(b=>b.setButtonText(`只看待新增 (${toCreate.length})`)
        .onClick(()=>{this.view='create';this.render();}))
      .addButton(b=>b.setButtonText(`只看等效格式 (${formatOnly.length})`)
        .onClick(()=>{this.view='format';this.render();}))
      .addButton(b=>b.setButtonText('查看全部文件')
        .onClick(()=>{this.view='all';this.render();}));
    new Setting(e).setName('重新检查当前状态')
      .setDesc('修复文件后重新扫描 ZIP 和本机文件，更新 same / conflict 数量。')
      .addButton(b=>b.setButtonText('刷新结果').onClick(()=>this.refresh()));
    const relevant=this.view==='format'?formatOnly:this.view==='create'?toCreate:issues;
    const heading=this.view==='format'?`已一致（仅格式不同）：${relevant.length} 个`:
      this.view==='create'?`待新增文件：${relevant.length} 个`:`冲突与异常文件：${relevant.length} 个`;
    e.createEl('h4',{text:heading});
    const problemList=e.createDiv({cls:'vr2-scroll vr2-conflicts'});
    if(!relevant.length)problemList.createEl('p',{text:'当前没有此类文件。'});
    for(const item of relevant){
      let tag='真实内容或版本冲突';
      if(item.status==='equivalent')tag='已一致（仅换行格式或 BOM 差异，无需处理）';
      else if(item.status==='create')tag='待新增（原知识库没有这个文件）';
      else if(item.status==='fork')tag='版本分叉（禁止自动覆盖）';
      else if(item.status==='local-error')tag='本机文件异常（需人工核对）';
      const detail=item.version?`${tag} | ${item.version.originDeviceId} | ${item.version.eventAtUtc}`:tag;
      const setting=new Setting(problemList).setName(item.path).setDesc(detail);
      setting.addButton(b=>b.setButtonText('查看全文与差异')
        .onClick(()=>this.p.openReviewFile(item)));
      if(item.status==='equivalent'){
        setting.addButton(b=>b.setButtonText('复制只读诊断').onClick(()=>copyValue(
          JSON.stringify({at:new Date(q.at).toISOString(),groupId:this.p.engine.state.groupId,
            path:item.path,localSha256:item.localHash,sharedSha256:item.version?.sha256,
            versionId:item.version?.versionId,packSha256:item.version?.packSha256,
            equivalentSha:item.equivalentHash,formatAnalysis:item.formatAnalysis},null,2))));
        continue;
      }
      if(item.status==='create')continue;
      if(item.version){
        setting.addButton(b=>b.setButtonText('查看差异')
          .onClick(()=>new HistoryCompareModal(this.app,this.p,item.version,
            ()=>this.refresh()).open()));
        if(item.status==='conflict'){
          setting.addButton(b=>b.setButtonText('处理冲突')
            .onClick(()=>new ConflictChoiceModal(this.app,this.p,item,
              ()=>this.refresh()).open()));
          if(/\.md$/i.test(item.path))
            setting.addButton(b=>b.setButtonText('智能合并')
              .onClick(()=>new MergeStartModal(this.app,this.p,item.path,()=>this.refresh()).open()));
        }
      }else{
        setting.addButton(b=>b.setButtonText('查看历史')
          .onClick(()=>new HistoryModal(this.app,this.p,item.path).open()));
        if(item.status==='fork'&&/\.md$/i.test(item.path))
          setting.addButton(b=>b.setButtonText('智能合并')
            .onClick(()=>new MergeStartModal(this.app,this.p,item.path,()=>this.refresh()).open()));
      }
    }
    if(this.view==='all'){
      const others=q.items.filter(x=>!['conflict','fork','local-error'].includes(x.status));
      e.createEl('h4',{text:`其他文件：${others.length} 个（默认只显示前 ${this.regularLimit} 个）`});
      const container=e.createDiv({cls:'vr2-scroll'});
      const names={create:'待新增','safe-update':'安全更新',same:'字节一致',
        equivalent:'内容等效，无需替换','local-update':'本机待上传',
        'delete-review':'删除待确认','delete-kept':'明确保留本机',absent:'已不存在'};
      for(const item of others.slice(0,this.regularLimit)){
        new Setting(container).setName(`[${names[item.status]||item.status}] ${item.path}`)
          .addButton(b=>b.setButtonText('查看全文与差异')
            .onClick(()=>this.p.openReviewFile(item)));
      }
      if(others.length>this.regularLimit){
        new Setting(e).setName(`还有 ${others.length-this.regularLimit} 个普通文件未展开`)
          .addButton(b=>b.setButtonText('继续显示 100 个')
            .onClick(()=>{this.regularLimit+=100;this.render();}));
      }
    }
    if(this.lastDownload){
      const r=this.lastDownload;
      const div=e.createDiv({cls:'vr2-inline'});
      div.createEl('h4',{text:`本次下载结果：新增 ${r.created}；安全更新 ${r.updated}；错误 ${r.errors.length}`});
      for(const path of r.createdPaths||[])div.createEl('p',{text:`[新增] ${path}`});
      for(const path of r.updatedPaths||[])div.createEl('p',{text:`[安全更新] ${path}`});
      if(!r.created&&!r.updated)div.createEl('p',{text:'本次没有改写任何笔记。等效文件保持原始字节不变。'});
    }
    new Setting(e).setName('仅应用安全变更')
      .setDesc('只新增缺失文件或安全更新；等效内容不替换；冲突和分叉均不覆盖。')
      .addButton(b=>b.setButtonText('确认下载').setCta().onClick(async()=>{
        const r=await this.p.run(async()=>this.p.engine.applyPlan(q,{allowDeletes:this.allowDeletes}),
          '下载与校验流程已完成');
        if(r){
          try{await this.p.registerUndoFromNative(r,q,'人工确认下载');}
          catch(err){notify('文件操作已完成，但可回退记录保存失败：'+String(err.message||err));}
          // ACK is independent of the outer content ZIP. Publish it only
          // AFTER the user's explicit confirmation and core applyPlan().
          try{
            await this.p.engine.publishAck(true);
            await this.p.safeCleanup({automatic:true});
            await this.p.log('人工确认应用与 ACK',
              '新增 '+r.created+'、更新 '+r.updated+
              '；独立 ACK 已准备；未经确认的冲突未覆盖');
          }catch(err){
            await this.p.log('人工应用后 ACK 待重试',String(err.message||err));
            notify('笔记已按人工确认处理，但 ACK 准备失败，请查看日志并手动重试');
          }
          notify(`新增 ${r.created}，安全更新 ${r.updated}，待处理冲突 ${r.conflicts}，失败 ${r.errors.length}。`);
          this.lastDownload=r;
          await this.refresh();
        }
      }));
  }
  onClose(){this.closed=true;this.contentEl.empty();}
}
class ConflictChoiceModal extends Modal{
  constructor(app,p,item,afterSuccess){
    super(app);
    this.p=p;this.item=item;this.afterSuccess=afterSuccess;
  }
  onOpen(){
    const e=this.contentEl,item=this.item;
    e.empty();e.createEl('h3',{text:'手动处理冲突'});
    e.createEl('p',{text:`文件：${item.path}`});
    e.createEl('p',{cls:'vr2-help',text:'共享版本 = 本地同步目录中已校验的最新有效文件；本机版本 = 正在操作这台电脑里的文件。'});
    e.createEl('p',{text:`A SHA-256：${item.version.sha256}`});
    e.createEl('p',{text:`B SHA-256：${item.localHash}`});
    e.createEl('p',{cls:'vr2-warning',text:'操作前请关闭自动同步。保留本机版本会发布新 ZIP；智能合并会先完整保存双方来源版本、创建单一 Markdown 草稿，最终确认之前不发布合并稿。'});
    const options=[
      {id:'keep-cloud',name:'保留共享版本',desc:'把共享目录的 A 版本恢复到 B 的原文件名。本机原件先备份到插件安全备份目录，不会丢失。'},
      {id:'keep-local',name:'保留本机版本',desc:'保留本机原文件，把本机修改发布为共享版本的后继 ZIP；原共享版本仍留在历史中。'},
      {id:'smart-merge',name:'智能合并',desc:'将双方不同内容组成一篇双色标注的 Markdown 草稿；用户编辑后去掉「智能合并」标记，再确认发布统一版本。'}
    ];
    for(const op of options){
      new Setting(e).setName(op.name).setDesc(op.desc)
        .addButton(b=>b.setButtonText('选择'+op.name)
          .onClick(()=>op.id==='smart-merge'?
            new MergeStartModal(this.app,this.p,item.path,async()=>{
              this.close();if(this.afterSuccess)await this.afterSuccess();
            }).open():
            new ConflictResolveConfirmModal(this.app,this.p,item,op,
              async()=>{this.close();if(this.afterSuccess)await this.afterSuccess();}).open()));
    }
    new Setting(e).setName('暂不处理').setDesc('不修改任何本地文件或云端内容包。')
      .addButton(b=>b.setButtonText('取消').onClick(()=>this.close()));
  }
  onClose(){this.contentEl.empty();}
}
class ConflictResolveConfirmModal extends Modal{
  constructor(app,p,item,option,afterSuccess){
    super(app);this.p=p;this.item=item;this.option=option;this.afterSuccess=afterSuccess;
    this.working=false;
  }
  onOpen(){
    this.modalEl.addClass('vr2-panel');
    const e=this.contentEl,item=this.item,op=this.option;
    e.empty();e.createEl('h3',{text:'二次确认：'+op.name});
    e.createEl('p',{text:`文件：${item.path}`});
    e.createEl('p',{text:`当前 B：${item.localHash}`});
    e.createEl('p',{text:`共享 A：${item.version.sha256}`});
    e.createEl('p',{cls:'vr2-warning',text:op.desc});
    e.createEl('p',{cls:'vr2-help',text:'如文件已变化、共享版本已更新、出现版本分叉或自动同步被开启，插件会拒绝执行。恢复原文件前必须留有本地安全备份。'});
    new Setting(e).setName('不修改').addButton(b=>b.setButtonText('返回').onClick(()=>this.close()));
    new Setting(e).setName('确认处理').addButton(b=>b.setButtonText('确认：'+op.name).setWarning().onClick(async()=>{
      if(this.working)return;
      this.working=true;
      try{
        const result=await this.p.run(()=>
          this.p.engine.resolveConflict(item.path,op.id,item.localHash,
            item.version.versionId,item.version.packSha256),null);
        if(!result)return;
        const suffix=result.copyPath?`另外生成：${result.copyPath}。`:'';
        notify(`冲突处理成功：${op.name}。${suffix}已保存 B 端安全备份。`);
        this.close();
        if(this.afterSuccess)await this.afterSuccess();
      }finally{this.working=false;}
    }));
  }
  onClose(){this.contentEl.empty();}
}
class MergeStartModal extends Modal{
  constructor(app,p,path,afterSuccess=null){
    super(app);this.p=p;this.path=path;this.afterSuccess=afterSuccess;this.busy=false;
  }
  onOpen(){
    this.modalEl.addClass('vr2-panel');
    const e=this.contentEl;e.createEl('h3',{text:'创建智能合并草稿'});
    e.createEl('p',{text:`原文件：${this.path}`});
    e.createEl('p',{cls:'vr2-warning',
      text:'会把独立修改的完整原始版本先写入不可变内容 ZIP，保留来源；草稿仅保存到本机「Vault Relay 合并草稿」文件夹，不会作为正式版本上传。同步必须 OFF。'});
    e.createEl('p',{cls:'vr2-help',
      text:'两种内容在一篇 Markdown 中以蓝色与橙色来源标记出现。用户实际修改草稿后，标题中的「智能合并」自动去除；全部解决后需点击「确认发布统一版本」。'});
    new Setting(e).setName('取消').addButton(b=>b.setButtonText('不修改').onClick(()=>this.close()));
    new Setting(e).setName('开始合并').addButton(b=>b.setButtonText('生成智能合并草稿').setCta().onClick(async()=>{
      if(this.busy)return;this.busy=true;
      try{
        const draft=await this.p.run(()=>this.p.engine.beginSmartMerge(this.path));
        if(!draft)return;
        notify(`合并草稿已生成：${draft.draftPath}。${draft.remainingHeads?'还有 '+draft.remainingHeads+' 个分支需在下一轮合并。':''}请在 Obsidian 中编辑。`);
        this.close();
        if(this.afterSuccess)await this.afterSuccess();
        new MergeDraftsModal(this.app,this.p).open();
      }finally{this.busy=false;}
    }));
  }
  onClose(){this.contentEl.empty();}
}
class MergeFinishModal extends Modal{
  constructor(app,p,path,onSuccess=null){super(app);this.p=p;this.path=path;this.onSuccess=onSuccess;}
  onOpen(){
    this.modalEl.addClass('vr2-panel');
    const e=this.contentEl;e.createEl('h3',{text:'确认发布智能合并结果'});
    e.createEl('p',{text:`正式文件：${this.path}`});
    e.createEl('p',{cls:'vr2-warning',
      text:'确认之前请逐段检查并移除所有未解决的蓝色/橙色来源标记。插件将校验原始两个分支未变化、备份当前正式文件，然后发布引用两个父版本的统一 ZIP。'});
    new Setting(e).setName('取消').addButton(b=>b.setButtonText('继续编辑').onClick(()=>this.close()));
    new Setting(e).setName('人工确认完成').addButton(b=>b.setButtonText('确认合并并发布').setWarning().onClick(async()=>{
      const result=await this.p.run(()=>this.p.engine.finishSmartMerge(this.path));
      if(!result)return;
      notify(`智能合并完成：${this.path}。两个原版本仍保留在历史 ZIP 中。`);
      this.close();
      if(this.onSuccess)await this.onSuccess();
    }));
  }
  onClose(){this.contentEl.empty();}
}
class MergeDraftsModal extends Modal{
  constructor(app,p){super(app);this.p=p;}
  onOpen(){this.modalEl.addClass('vr2-history');this.render();}
  render(){
    const e=this.contentEl,s=this.p.engine.state;e.empty();
    e.createEl('h3',{text:'智能合并草稿'});
    e.createEl('p',{cls:'vr2-help',text:'草稿在知识库「Vault Relay 合并草稿」文件夹中；未人工确认前不参与上传或下载。'});
    const drafts=Object.values(s.drafts||{});
    if(!drafts.length)e.createEl('p',{cls:'vr2-summary',text:'目前没有待确认的合并草稿。'});
    for(const d of drafts){
      new Setting(e).setName(d.originalPath)
        .setDesc(`${d.edited?'已编辑，仍待确认':'尚未真正修改'} | ${d.draftPath}`)
        .addButton(b=>b.setButtonText('打开草稿').onClick(async()=>{
          const f=this.app.vault.getAbstractFileByPath?.(d.draftPath);
          if(!f){notify('文件索引尚未找到草稿，请在左侧文件树打开：'+d.draftPath);return;}
          try{await this.app.workspace.getLeaf(true).openFile(f);}catch(err){notify('打开失败：'+err.message);}
        }))
        .addButton(b=>b.setButtonText('检查并发布').onClick(async()=>{
          try{await this.p.engine.noteDraftModification(d.draftPath);}
          catch(err){notify('检查草稿失败：'+err.message);return;}
          new MergeFinishModal(this.app,this.p,d.originalPath,()=>this.render()).open();
        }));
    }
    new Setting(e).setName('刷新草稿状态').addButton(b=>b.setButtonText('刷新').onClick(()=>this.render()));
  }
  onClose(){this.contentEl.empty();}
}
class HistoryModal extends Modal{
  constructor(app,p,query=''){
    super(app);this.p=p;this.catalog=null;this.query=query;this.mode='files';this.plan=null;
  }
  async onOpen(){
    this.modalEl.addClass('vr2-history');
    this.contentEl.createEl('h3',{text:'历史版本与冲突'});
    await this.refresh();
  }
  async refresh(){
    const e=this.contentEl;e.empty();e.createEl('p',{text:'正在验证历史 ZIP 与本机文件…'});
    try{
      this.plan=await this.p.engine.latestPlan();
      this.catalog=this.plan.catalog;
      this.render();
    }catch(err){e.empty();e.createEl('p',{cls:'vr2-warning',text:'检查失败：'+err.message});}
  }
  render(){
    const e=this.contentEl;e.empty();
    e.createEl('h3',{text:'历史版本与冲突管理'});
    e.createEl('p',{cls:'vr2-help',text:'所有筛选、刷新和比较均只读；修改正式文件必须二次确认。历史 ZIP 永不自动清除。'});
    new Setting(e).setName('搜索路径、版本、设备名称或设备 ID')
      .addText(t=>t.setValue(this.query).onChange(v=>{this.query=v;this.paintResults();}));
    new Setting(e).setName('查看方式')
      .addDropdown(d=>d.addOptions({
        conflicts:'只看冲突',equivalent:'只看等效格式',same:'只看已一致',
        files:'全部历史版本',packs:'按内容 ZIP 包'
      }).setValue(this.mode).onChange(v=>{this.mode=v;this.paintResults();}));
    new Setting(e).setName('重新校验').setDesc('扫描本机和已下载完成的内容 ZIP，更新统计。')
      .addButton(b=>b.setButtonText('刷新结果').onClick(()=>this.refresh()));
    const c=this.plan.counts;
    e.createEl('p',{cls:'vr2-summary',text:`已一致 ${c.same}（等效 ${c.equivalent}） | 真正冲突 ${c.conflict} | 版本分叉 ${c.fork} | 缺失待下载 ${c.create} | 已校验 ZIP ${this.catalog.count}`});
    this.results=e.createDiv({cls:'vr2-scroll vr2-history-list'});
    this.paintResults();
  }
  paintResults(){
    if(!this.results||!this.catalog||!this.plan)return;
    const e=this.results,term=this.query.toLowerCase().trim();
    e.empty();
    const match=(text)=>!term||text.toLowerCase().includes(term);
    let total=0;
    if(this.mode==='packs'){
      for(const pack of this.catalog.packages.slice().reverse()){
        if(!match(`${pack.name} ${pack.originDeviceId}`))continue;
        total++;
        if(total>3000)break;
        new Setting(e).setName(`${pack.createdAtUtc} · ${deviceLabel(this.p,pack.originDeviceId)}`)
          .setDesc(`${pack.name} · ${pack.entryCount} 条版本 · 已校验`)
          .addButton(b=>b.setButtonText('展开').onClick(()=>{
            this.mode='files';this.query=pack.packId;this.render();
          }));
      }
    }else if(this.mode==='files'){
      const records=Object.values(this.catalog.byPath).flat()
        .sort((a,b)=>b.createdAtUtc.localeCompare(a.createdAtUtc));
      for(const v of records){
        if(!match(`${v.path} ${v.originDeviceId} ${v.originName||''} ${v.packId} ${v.versionId}`))continue;
        total++;
        if(total>3000)break;
        new Setting(e).setName(v.path)
          .setDesc(`${v.eventAtUtc} · ${deviceLabel(this.p,v.originDeviceId,v.originName)} · ${v.size} bytes · SHA ${v.sha256?.slice(0,12)||'删除版本'}`)
          .addButton(b=>b.setButtonText('查看差异').onClick(()=>new HistoryCompareModal(this.app,this.p,v).open()));
      }
    }else{
      const filtered=this.plan.items.filter(x=>
        this.mode==='conflicts'?['conflict','fork','local-error'].includes(x.status):
        this.mode==='equivalent'?x.status==='equivalent':
        ['same','equivalent'].includes(x.status));
      for(const item of filtered){
        const who=item.version?.originName||item.version?.originDeviceId||item.versions?.map(v=>v.originName||v.originDeviceId).join('、')||'';
        if(!match(item.path+' '+who))continue;
        total++;
        const status=item.status==='equivalent'?'内容等效，仅格式不同':
          item.status==='fork'?'多端版本分叉':
          item.status==='conflict'?'正文差异':
          item.status==='same'?'字节一致':'异常';
        const setting=new Setting(e).setName(item.path).setDesc(status+(who?' · '+who:''));
        if(item.version)setting.addButton(b=>b.setButtonText('查看差异')
          .onClick(()=>new HistoryCompareModal(this.app,this.p,item.version,()=>this.refresh()).open()));
        else if(item.versions?.length)
          setting.addButton(b=>b.setButtonText('查看两个来源').onClick(()=>{
            this.mode='files';this.query=item.path;this.render();
          }));
        if(['conflict','fork'].includes(item.status)&&/\.md$/i.test(item.path))
          setting.addButton(b=>b.setButtonText('智能合并')
            .onClick(()=>new MergeStartModal(this.app,this.p,item.path,()=>this.refresh()).open()));
      }
    }
    if(!total)e.createEl('p',{text:'没有符合条件的记录。'});
    if(total>3000)e.createEl('p',{text:'记录较多，请输入关键字缩小范围。'});
    for(const w of this.catalog.warnings.slice(0,8))
      e.createEl('p',{cls:'vr2-warning',text:`ZIP 异常 ${w.file}: ${w.error}`});
  }
  onClose(){this.contentEl.empty();}
}
class FormatRestoreConfirmModal extends Modal{
  constructor(app,p,version,expectedCurrentSha,afterSuccess){
    super(app);this.p=p;this.version=version;this.expectedCurrentSha=expectedCurrentSha;
    this.afterSuccess=afterSuccess;
  }
  onOpen(){
    this.modalEl.addClass('vr2-panel');
    const e=this.contentEl;
    e.createEl('h3',{text:'确认恢复历史原始字节'});
    e.createEl('p',{text:`文件：${this.version.path}`});
    e.createEl('p',{text:`历史版本 SHA-256：${this.version.sha256}`});
    e.createEl('p',{text:`当前本机 SHA-256：${this.expectedCurrentSha}`});
    e.createEl('p',{cls:'vr2-warning',text:'只允许在自动同步 OFF 时恢复最新、无分叉且已经校验的 Markdown 版本。恢复前会备份当前本机文件；如果文件已发生变化、正文不一致或历史包失效，将拒绝操作。'});
    new Setting(e).setName('取消').addButton(b=>b.setButtonText('不修改').onClick(()=>this.close()));
    new Setting(e).setName('先备份本机文件，再恢复历史原始字节')
      .addButton(b=>b.setButtonText('确认恢复').setWarning().onClick(async()=>{
        const result=await this.p.run(
          ()=>this.p.engine.restoreFormatOnly(this.version,this.expectedCurrentSha),null);
        if(!result)return;
        notify('已恢复历史原始字节；本机原文件备份在插件 v2-safety-backups 文件夹。');
        this.close();
        if(this.afterSuccess)await this.afterSuccess();
      }));
  }
  onClose(){this.contentEl.empty();}
}
class HistoryCompareModal extends Modal{
  constructor(app,p,version,onRestored=null){super(app);this.p=p;this.version=version;this.onlyChanges=true;this.onRestored=onRestored;}
  async onOpen(){
    this.modalEl.addClass('vr2-history');const e=this.contentEl;
    e.createEl('h3',{text:'历史版本与本机现版本对比'});
    try{this.result=await this.p.engine.historicalComparison(this.version);this.render();}
    catch(err){e.createEl('p',{cls:'vr2-warning',text:'历史版本无法核验：'+err.message});}
  }
  render(){
    const e=this.contentEl,r=this.result,v=this.version;e.empty();e.createEl('h3',{text:v.path});
    e.createEl('p',{text:`历史版本：${v.eventAtUtc} | ${v.originDeviceId} | ${v.versionId}`});
    e.createEl('p',{text:`历史 SHA：${v.sha256||'删除墓碑'}`});
    e.createEl('p',{text:`本机当前 SHA：${r.currentHash||'本机不存在'} | ${r.currentSize??0} bytes | ${r.status}`});
    if(r.formatAnalysis){
      const a=r.formatAnalysis;
      if(a.kind==='format-only'){
        e.createEl('p',{cls:'vr2-summary',text:'已确认：正文完全相同，仅 CRLF/LF 换行或 UTF-8 BOM 格式不同；原始字节及 SHA-256 仍不一致。'});
        e.createEl('p',{text:`历史：${a.historical.bytes} 字节，CRLF ${a.historical.crlf}，LF ${a.historical.lf}，BOM ${a.historical.bom?'有':'无'}`});
        e.createEl('p',{text:`本机：${a.current.bytes} 字节，CRLF ${a.current.crlf}，LF ${a.current.lf}，BOM ${a.current.bom?'有':'无'}`});
        e.createEl('p',{cls:'vr2-help',
          text:'根据两级 SHA 规则，等效内容已经算一致：不上传、不下载，也不修改本机原始字节。'});
      }else if(a.kind==='text-different'){
        e.createEl('p',{cls:'vr2-warning',text:'检测到真实正文差异：不能使用格式修复功能。请人工核对文本差异。'});
      }else if(a.kind==='unavailable'){
        e.createEl('p',{cls:'vr2-help',text:'格式分析不可用：'+a.reason});
      }
    }
    if(!r.diff||r.diff.error){e.createEl('p',{text:'二进制附件、缺失正文、删除墓碑或大文件：仅展示已校验的元数据差异。'});return;}
    new Setting(e).setName('只显示变更行').addToggle(t=>t.setValue(this.onlyChanges).onChange(v=>{this.onlyChanges=v;this.render();}));
    const grid=e.createDiv({cls:'vr2-diff'});let visible=0;
    for(const row of r.diff){
      if(this.onlyChanges&&row.type==='equal')continue;
      if(++visible>500){grid.createEl('p',{text:'差异最多显示 500 行，原文件没有被修改。'});break;}
      grid.createEl('div',{cls:'vr2-diff-'+row.type,text:`${row.type==='add'?'+':row.type==='remove'?'-':' '} ${row.text}`});
    }
    if(!visible)grid.createEl('p',{text:'文本内容一致。'});
  }
  onClose(){this.contentEl.empty();}
}
module.exports=class VaultRelay extends Plugin{
  async onload(){
    let raw;try{raw=await this.loadData();}catch(e){this.locked=true;notify('Stored plugin data cannot be read. Sync is locked; do not overwrite state.');return;}
    if(raw!==null&&raw!==undefined&&(typeof raw!=='object'||Array.isArray(raw))){this.locked=true;notify('Invalid plugin data; sync locked.');return;}
    this.data=raw||{};
    // Preserve all old data fields for rollback; explicitly disable deprecated senders and auto-cleanup.
    if(this.data.autoPolicy)this.data.autoPolicy.autoCleanup=false;
    if(this.data.relayConfig)this.data.relayConfig.enabled=false;
    if(this.data.autoSync)this.data.autoSync.enabled=false;
    const oldId=C.DEVICE.test(this.data.deviceId||'')?this.data.deviceId:null;
    if(!this.data.v2){
      this.data.v2=emptyState(oldId||`vr-${uid()}`,`vg-${uid()}`);
      if(typeof this.data.relayConfig?.folder==='string')this.data.v2.shareRoot=this.data.relayConfig.folder;
      this.data.v2.syncEnabled=false;
    }
    // Upgrade safety: prevent old ON state from immediately publishing format-only edits.
    if(!this.data.v2.alpha2Reviewed){
      this.data.v2.syncEnabled=false;
      this.data.v2.alpha2Reviewed=true;
    }
    // alpha.3 UI upgrade: review the new conflict list before enabling transfer.
    if(!this.data.v2.alpha3Reviewed){
      this.data.v2.syncEnabled=false;
      this.data.v2.alpha3Reviewed=true;
    }
    // First production-line upgrade always pauses outgoing work for review.
    if(!this.data.v2.release1Reviewed){
      this.data.v2.syncEnabled=false;
      this.data.v2.release1Reviewed=true;
    }
    if(!this.data.v2.release11Reviewed){
      this.data.v2.syncEnabled=false;
      this.data.v2.release11Reviewed=true;
    }
    this.data.v2.groupName ||= '';
    if(this.data.v2.machineName&&this.data.v2.machineName!==vrOs.hostname()){
      this.data.v2.syncEnabled=false;
      this.data.v2.machineChanged=true;
    }
    if(!this.data.v2.displayName)this.data.v2.displayName=vrOs.hostname()||'我的电脑';
    // 尚无记录 auto-start based on alpha.8.5 flags. New version stores its own explicit ON decision.
    const adapter=this.app.vault.adapter;
    const base=adapter.getBasePath?.()||adapter.basePath;
    if(!base){this.locked=true;notify('Desktop Vault path unavailable. Sync locked.');return;}
    this.engine=new V2Engine({vaultPath:base,state:this.data.v2,zip:VRI_ZIP,persist:()=>this.persist()});
    this.job=Promise.resolve();this.changeTimer=null;
    this.addRibbonIcon('archive-restore','Vault Relay 知识库同步',()=>new HomeModal(this.app,this).open());
    this.addCommand({id:'vaultrelay-v2-panel',name:'Vault Relay v2: backup, download, history',callback:()=>new HomeModal(this.app,this).open()});
    this.addCommand({id:'vaultrelay-v2-backup',name:'Vault Relay v2: backup to Baidu folder',callback:()=>new BackupModal(this.app,this).open()});
    this.addCommand({id:'vaultrelay-v2-download',name:'Vault Relay v2: download current files',callback:()=>new DownloadModal(this.app,this).open()});
    this.addCommand({id:'vaultrelay-v2-history',name:'Vault Relay v2: view historical versions',callback:()=>new HistoryModal(this.app,this).open()});
    this.addCommand({id:'vaultrelay-v2-conflicts',name:'Vault Relay v2: show outstanding conflicts',
      callback:()=>new DownloadModal(this.app,this).open()});
    this.addCommand({id:'vaultrelay-v2-stop',name:'Vault Relay v2: turn automatic synchronization OFF',callback:async()=>{
      this.engine.state.syncEnabled=false;await this.persist();notify('自动同步总开关 OFF');
    }});
    this.addCommand({id:'vaultrelay-upload',name:'Vault Relay：上传文件',callback:()=>new BackupModal(this.app,this).open()});
    this.addCommand({id:'vaultrelay-export',name:'Vault Relay：导出本地知识库 ZIP',callback:()=>new OfflineZipModal(this.app,this).open()});
    this.addCommand({id:'vaultrelay-setup',name:'Vault Relay：首次设置向导',callback:()=>new SetupWizardModal(this.app,this).open()});
    this.addCommand({id:'vaultrelay-merge-drafts',name:'Vault Relay：智能合并草稿',callback:()=>new MergeDraftsModal(this.app,this).open()});
    await this.persist();
    // OFF implies no automatic remote reads/writes, even during startup.
    if(this.engine.state.syncEnabled){
      try{await this.engine.reconcileSelf();}catch(e){console.warn('Self catalog reconciliation postponed',e);}
    }
    this.registerInterval(setInterval(()=>{if(this.engine.state.syncEnabled)this.run(()=>this.engine.tick(),null,true);},60000));
    this.registerEvent(this.app.vault.on('modify',f=>this.changed(f)));
    this.registerEvent(this.app.vault.on('create',f=>this.changed(f)));
    this.registerEvent(this.app.vault.on('delete',f=>this.changed(f)));
    this.registerEvent(this.app.vault.on('rename',f=>this.changed(f)));
    if(typeof window!=='undefined')this.registerDomEvent(window,'beforeunload',()=>this.exitFlush());
  }
  async persist(){await this.saveData(this.data);}
  changed(file){
    if(this.locked||!file?.path||file.path.startsWith('.obsidian/'))return;
    if(file.path.startsWith('Vault Relay 合并草稿/')){
      this.run(()=>this.engine.noteDraftModification(file.path,async(oldPath,newPath)=>{
        const present=this.app.vault.getAbstractFileByPath?.(oldPath);
        if(present&&typeof this.app.vault.rename==='function')
          await this.app.vault.rename(present,newPath);
        else vrFs.renameSync(vrPath.join(this.engine.vaultPath,...oldPath.split('/')),
          vrPath.join(this.engine.vaultPath,...newPath.split('/')));
      }),null,true);
      return;
    }
    if(this.changeTimer)clearTimeout(this.changeTimer);
    this.changeTimer=setTimeout(()=>{
      this.changeTimer=null;this.run(async()=>{
        const q=this.engine.pendingPlan();this.engine.schedulePending(q);await this.persist();return q;
      },null,true);
    },2000);
  }
  run(task,message,silent=false){
    if(this.locked)return Promise.resolve(false);
    const action=this.job.then(task);
    this.job=action.catch(err=>{console.warn('Vault Relay action:',err);if(!silent)notify('Vault Relay: '+String(err.message||err));});
    return action.then(result=>{if(message&&!silent)notify(message);return result;}).catch(()=>false);
  }
  exitFlush(){
    if(this.exitTriggered||!this.engine?.state.syncEnabled)return;
    this.exitTriggered=true;
    try{this.engine.writeInfoSync(true);}catch(err){console.warn('Exit info publication failed',err);}
    if(this.engine.state.exitUploadContent){
      // Asynchronous ZIP creation cannot be guaranteed during process exit.
      this.run(()=>this.engine.safeUpload({allowFirstJoinBranches:false,allowDeletes:false}),null,true).catch(err=>console.warn('Exit content best-effort failed',err));
    }
  }
  onunload(){
    if(this.changeTimer)clearTimeout(this.changeTimer);
    this.exitFlush();
  }
};


module.exports.__ui={
  home:HomeModal,upload:BackupModal,download:DownloadModal,
  history:HistoryModal,conflicts:DownloadModal,merge:MergeDraftsModal,
  setup:SetupWizardModal
};

return module.exports;
}

function loadNativeMobile(){
const module={exports:{}};
/* Vault Relay 4.0 · mobile core */
/* JSZip v3.10.1: MIT/GPL dual license, see THIRD_PARTY_LICENSES.md */
const VRI_ZIP = (function(){const module={exports:{}};const exports=module.exports;
const setImmediate=typeof globalThis.setImmediate==='function'?globalThis.setImmediate.bind(globalThis):(fn,...args)=>setTimeout(()=>fn(...args),0);
/*!

JSZip v3.10.1 - A JavaScript class for generating and reading zip files
<http://stuartk.com/jszip>

(c) 2009-2016 Stuart Knightley <stuart [at] stuartk.com>
Dual licenced under the MIT license or GPLv3. See https://raw.github.com/Stuk/jszip/main/LICENSE.markdown.

JSZip uses the library pako released under the MIT license :
https://github.com/nodeca/pako/blob/main/LICENSE
*/

!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{("undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:this).JSZip=e()}}(function(){return function s(a,o,h){function u(r,e){if(!o[r]){if(!a[r]){var t="function"==typeof require&&require;if(!e&&t)return t(r,!0);if(l)return l(r,!0);var n=new Error("Cannot find module '"+r+"'");throw n.code="MODULE_NOT_FOUND",n}var i=o[r]={exports:{}};a[r][0].call(i.exports,function(e){var t=a[r][1][e];return u(t||e)},i,i.exports,s,a,o,h)}return o[r].exports}for(var l="function"==typeof require&&require,e=0;e<h.length;e++)u(h[e]);return u}({1:[function(e,t,r){"use strict";var d=e("./utils"),c=e("./support"),p="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";r.encode=function(e){for(var t,r,n,i,s,a,o,h=[],u=0,l=e.length,f=l,c="string"!==d.getTypeOf(e);u<e.length;)f=l-u,n=c?(t=e[u++],r=u<l?e[u++]:0,u<l?e[u++]:0):(t=e.charCodeAt(u++),r=u<l?e.charCodeAt(u++):0,u<l?e.charCodeAt(u++):0),i=t>>2,s=(3&t)<<4|r>>4,a=1<f?(15&r)<<2|n>>6:64,o=2<f?63&n:64,h.push(p.charAt(i)+p.charAt(s)+p.charAt(a)+p.charAt(o));return h.join("")},r.decode=function(e){var t,r,n,i,s,a,o=0,h=0,u="data:";if(e.substr(0,u.length)===u)throw new Error("Invalid base64 input, it looks like a data url.");var l,f=3*(e=e.replace(/[^A-Za-z0-9+/=]/g,"")).length/4;if(e.charAt(e.length-1)===p.charAt(64)&&f--,e.charAt(e.length-2)===p.charAt(64)&&f--,f%1!=0)throw new Error("Invalid base64 input, bad content length.");for(l=c.uint8array?new Uint8Array(0|f):new Array(0|f);o<e.length;)t=p.indexOf(e.charAt(o++))<<2|(i=p.indexOf(e.charAt(o++)))>>4,r=(15&i)<<4|(s=p.indexOf(e.charAt(o++)))>>2,n=(3&s)<<6|(a=p.indexOf(e.charAt(o++))),l[h++]=t,64!==s&&(l[h++]=r),64!==a&&(l[h++]=n);return l}},{"./support":30,"./utils":32}],2:[function(e,t,r){"use strict";var n=e("./external"),i=e("./stream/DataWorker"),s=e("./stream/Crc32Probe"),a=e("./stream/DataLengthProbe");function o(e,t,r,n,i){this.compressedSize=e,this.uncompressedSize=t,this.crc32=r,this.compression=n,this.compressedContent=i}o.prototype={getContentWorker:function(){var e=new i(n.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new a("data_length")),t=this;return e.on("end",function(){if(this.streamInfo.data_length!==t.uncompressedSize)throw new Error("Bug : uncompressed data size mismatch")}),e},getCompressedWorker:function(){return new i(n.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize",this.compressedSize).withStreamInfo("uncompressedSize",this.uncompressedSize).withStreamInfo("crc32",this.crc32).withStreamInfo("compression",this.compression)}},o.createWorkerFrom=function(e,t,r){return e.pipe(new s).pipe(new a("uncompressedSize")).pipe(t.compressWorker(r)).pipe(new a("compressedSize")).withStreamInfo("compression",t)},t.exports=o},{"./external":6,"./stream/Crc32Probe":25,"./stream/DataLengthProbe":26,"./stream/DataWorker":27}],3:[function(e,t,r){"use strict";var n=e("./stream/GenericWorker");r.STORE={magic:"\0\0",compressWorker:function(){return new n("STORE compression")},uncompressWorker:function(){return new n("STORE decompression")}},r.DEFLATE=e("./flate")},{"./flate":7,"./stream/GenericWorker":28}],4:[function(e,t,r){"use strict";var n=e("./utils");var o=function(){for(var e,t=[],r=0;r<256;r++){e=r;for(var n=0;n<8;n++)e=1&e?3988292384^e>>>1:e>>>1;t[r]=e}return t}();t.exports=function(e,t){return void 0!==e&&e.length?"string"!==n.getTypeOf(e)?function(e,t,r,n){var i=o,s=n+r;e^=-1;for(var a=n;a<s;a++)e=e>>>8^i[255&(e^t[a])];return-1^e}(0|t,e,e.length,0):function(e,t,r,n){var i=o,s=n+r;e^=-1;for(var a=n;a<s;a++)e=e>>>8^i[255&(e^t.charCodeAt(a))];return-1^e}(0|t,e,e.length,0):0}},{"./utils":32}],5:[function(e,t,r){"use strict";r.base64=!1,r.binary=!1,r.dir=!1,r.createFolders=!0,r.date=null,r.compression=null,r.compressionOptions=null,r.comment=null,r.unixPermissions=null,r.dosPermissions=null},{}],6:[function(e,t,r){"use strict";var n=null;n="undefined"!=typeof Promise?Promise:e("lie"),t.exports={Promise:n}},{lie:37}],7:[function(e,t,r){"use strict";var n="undefined"!=typeof Uint8Array&&"undefined"!=typeof Uint16Array&&"undefined"!=typeof Uint32Array,i=e("pako"),s=e("./utils"),a=e("./stream/GenericWorker"),o=n?"uint8array":"array";function h(e,t){a.call(this,"FlateWorker/"+e),this._pako=null,this._pakoAction=e,this._pakoOptions=t,this.meta={}}r.magic="\b\0",s.inherits(h,a),h.prototype.processChunk=function(e){this.meta=e.meta,null===this._pako&&this._createPako(),this._pako.push(s.transformTo(o,e.data),!1)},h.prototype.flush=function(){a.prototype.flush.call(this),null===this._pako&&this._createPako(),this._pako.push([],!0)},h.prototype.cleanUp=function(){a.prototype.cleanUp.call(this),this._pako=null},h.prototype._createPako=function(){this._pako=new i[this._pakoAction]({raw:!0,level:this._pakoOptions.level||-1});var t=this;this._pako.onData=function(e){t.push({data:e,meta:t.meta})}},r.compressWorker=function(e){return new h("Deflate",e)},r.uncompressWorker=function(){return new h("Inflate",{})}},{"./stream/GenericWorker":28,"./utils":32,pako:38}],8:[function(e,t,r){"use strict";function A(e,t){var r,n="";for(r=0;r<t;r++)n+=String.fromCharCode(255&e),e>>>=8;return n}function n(e,t,r,n,i,s){var a,o,h=e.file,u=e.compression,l=s!==O.utf8encode,f=I.transformTo("string",s(h.name)),c=I.transformTo("string",O.utf8encode(h.name)),d=h.comment,p=I.transformTo("string",s(d)),m=I.transformTo("string",O.utf8encode(d)),_=c.length!==h.name.length,g=m.length!==d.length,b="",v="",y="",w=h.dir,k=h.date,x={crc32:0,compressedSize:0,uncompressedSize:0};t&&!r||(x.crc32=e.crc32,x.compressedSize=e.compressedSize,x.uncompressedSize=e.uncompressedSize);var S=0;t&&(S|=8),l||!_&&!g||(S|=2048);var z=0,C=0;w&&(z|=16),"UNIX"===i?(C=798,z|=function(e,t){var r=e;return e||(r=t?16893:33204),(65535&r)<<16}(h.unixPermissions,w)):(C=20,z|=function(e){return 63&(e||0)}(h.dosPermissions)),a=k.getUTCHours(),a<<=6,a|=k.getUTCMinutes(),a<<=5,a|=k.getUTCSeconds()/2,o=k.getUTCFullYear()-1980,o<<=4,o|=k.getUTCMonth()+1,o<<=5,o|=k.getUTCDate(),_&&(v=A(1,1)+A(B(f),4)+c,b+="up"+A(v.length,2)+v),g&&(y=A(1,1)+A(B(p),4)+m,b+="uc"+A(y.length,2)+y);var E="";return E+="\n\0",E+=A(S,2),E+=u.magic,E+=A(a,2),E+=A(o,2),E+=A(x.crc32,4),E+=A(x.compressedSize,4),E+=A(x.uncompressedSize,4),E+=A(f.length,2),E+=A(b.length,2),{fileRecord:R.LOCAL_FILE_HEADER+E+f+b,dirRecord:R.CENTRAL_FILE_HEADER+A(C,2)+E+A(p.length,2)+"\0\0\0\0"+A(z,4)+A(n,4)+f+b+p}}var I=e("../utils"),i=e("../stream/GenericWorker"),O=e("../utf8"),B=e("../crc32"),R=e("../signature");function s(e,t,r,n){i.call(this,"ZipFileWorker"),this.bytesWritten=0,this.zipComment=t,this.zipPlatform=r,this.encodeFileName=n,this.streamFiles=e,this.accumulate=!1,this.contentBuffer=[],this.dirRecords=[],this.currentSourceOffset=0,this.entriesCount=0,this.currentFile=null,this._sources=[]}I.inherits(s,i),s.prototype.push=function(e){var t=e.meta.percent||0,r=this.entriesCount,n=this._sources.length;this.accumulate?this.contentBuffer.push(e):(this.bytesWritten+=e.data.length,i.prototype.push.call(this,{data:e.data,meta:{currentFile:this.currentFile,percent:r?(t+100*(r-n-1))/r:100}}))},s.prototype.openedSource=function(e){this.currentSourceOffset=this.bytesWritten,this.currentFile=e.file.name;var t=this.streamFiles&&!e.file.dir;if(t){var r=n(e,t,!1,this.currentSourceOffset,this.zipPlatform,this.encodeFileName);this.push({data:r.fileRecord,meta:{percent:0}})}else this.accumulate=!0},s.prototype.closedSource=function(e){this.accumulate=!1;var t=this.streamFiles&&!e.file.dir,r=n(e,t,!0,this.currentSourceOffset,this.zipPlatform,this.encodeFileName);if(this.dirRecords.push(r.dirRecord),t)this.push({data:function(e){return R.DATA_DESCRIPTOR+A(e.crc32,4)+A(e.compressedSize,4)+A(e.uncompressedSize,4)}(e),meta:{percent:100}});else for(this.push({data:r.fileRecord,meta:{percent:0}});this.contentBuffer.length;)this.push(this.contentBuffer.shift());this.currentFile=null},s.prototype.flush=function(){for(var e=this.bytesWritten,t=0;t<this.dirRecords.length;t++)this.push({data:this.dirRecords[t],meta:{percent:100}});var r=this.bytesWritten-e,n=function(e,t,r,n,i){var s=I.transformTo("string",i(n));return R.CENTRAL_DIRECTORY_END+"\0\0\0\0"+A(e,2)+A(e,2)+A(t,4)+A(r,4)+A(s.length,2)+s}(this.dirRecords.length,r,e,this.zipComment,this.encodeFileName);this.push({data:n,meta:{percent:100}})},s.prototype.prepareNextSource=function(){this.previous=this._sources.shift(),this.openedSource(this.previous.streamInfo),this.isPaused?this.previous.pause():this.previous.resume()},s.prototype.registerPrevious=function(e){this._sources.push(e);var t=this;return e.on("data",function(e){t.processChunk(e)}),e.on("end",function(){t.closedSource(t.previous.streamInfo),t._sources.length?t.prepareNextSource():t.end()}),e.on("error",function(e){t.error(e)}),this},s.prototype.resume=function(){return!!i.prototype.resume.call(this)&&(!this.previous&&this._sources.length?(this.prepareNextSource(),!0):this.previous||this._sources.length||this.generatedError?void 0:(this.end(),!0))},s.prototype.error=function(e){var t=this._sources;if(!i.prototype.error.call(this,e))return!1;for(var r=0;r<t.length;r++)try{t[r].error(e)}catch(e){}return!0},s.prototype.lock=function(){i.prototype.lock.call(this);for(var e=this._sources,t=0;t<e.length;t++)e[t].lock()},t.exports=s},{"../crc32":4,"../signature":23,"../stream/GenericWorker":28,"../utf8":31,"../utils":32}],9:[function(e,t,r){"use strict";var u=e("../compressions"),n=e("./ZipFileWorker");r.generateWorker=function(e,a,t){var o=new n(a.streamFiles,t,a.platform,a.encodeFileName),h=0;try{e.forEach(function(e,t){h++;var r=function(e,t){var r=e||t,n=u[r];if(!n)throw new Error(r+" is not a valid compression method !");return n}(t.options.compression,a.compression),n=t.options.compressionOptions||a.compressionOptions||{},i=t.dir,s=t.date;t._compressWorker(r,n).withStreamInfo("file",{name:e,dir:i,date:s,comment:t.comment||"",unixPermissions:t.unixPermissions,dosPermissions:t.dosPermissions}).pipe(o)}),o.entriesCount=h}catch(e){o.error(e)}return o}},{"../compressions":3,"./ZipFileWorker":8}],10:[function(e,t,r){"use strict";function n(){if(!(this instanceof n))return new n;if(arguments.length)throw new Error("The constructor with parameters has been removed in JSZip 3.0, please check the upgrade guide.");this.files=Object.create(null),this.comment=null,this.root="",this.clone=function(){var e=new n;for(var t in this)"function"!=typeof this[t]&&(e[t]=this[t]);return e}}(n.prototype=e("./object")).loadAsync=e("./load"),n.support=e("./support"),n.defaults=e("./defaults"),n.version="3.10.1",n.loadAsync=function(e,t){return(new n).loadAsync(e,t)},n.external=e("./external"),t.exports=n},{"./defaults":5,"./external":6,"./load":11,"./object":15,"./support":30}],11:[function(e,t,r){"use strict";var u=e("./utils"),i=e("./external"),n=e("./utf8"),s=e("./zipEntries"),a=e("./stream/Crc32Probe"),l=e("./nodejsUtils");function f(n){return new i.Promise(function(e,t){var r=n.decompressed.getContentWorker().pipe(new a);r.on("error",function(e){t(e)}).on("end",function(){r.streamInfo.crc32!==n.decompressed.crc32?t(new Error("Corrupted zip : CRC32 mismatch")):e()}).resume()})}t.exports=function(e,o){var h=this;return o=u.extend(o||{},{base64:!1,checkCRC32:!1,optimizedBinaryString:!1,createFolders:!1,decodeFileName:n.utf8decode}),l.isNode&&l.isStream(e)?i.Promise.reject(new Error("JSZip can't accept a stream when loading a zip file.")):u.prepareContent("the loaded zip file",e,!0,o.optimizedBinaryString,o.base64).then(function(e){var t=new s(o);return t.load(e),t}).then(function(e){var t=[i.Promise.resolve(e)],r=e.files;if(o.checkCRC32)for(var n=0;n<r.length;n++)t.push(f(r[n]));return i.Promise.all(t)}).then(function(e){for(var t=e.shift(),r=t.files,n=0;n<r.length;n++){var i=r[n],s=i.fileNameStr,a=u.resolve(i.fileNameStr);h.file(a,i.decompressed,{binary:!0,optimizedBinaryString:!0,date:i.date,dir:i.dir,comment:i.fileCommentStr.length?i.fileCommentStr:null,unixPermissions:i.unixPermissions,dosPermissions:i.dosPermissions,createFolders:o.createFolders}),i.dir||(h.file(a).unsafeOriginalName=s)}return t.zipComment.length&&(h.comment=t.zipComment),h})}},{"./external":6,"./nodejsUtils":14,"./stream/Crc32Probe":25,"./utf8":31,"./utils":32,"./zipEntries":33}],12:[function(e,t,r){"use strict";var n=e("../utils"),i=e("../stream/GenericWorker");function s(e,t){i.call(this,"Nodejs stream input adapter for "+e),this._upstreamEnded=!1,this._bindStream(t)}n.inherits(s,i),s.prototype._bindStream=function(e){var t=this;(this._stream=e).pause(),e.on("data",function(e){t.push({data:e,meta:{percent:0}})}).on("error",function(e){t.isPaused?this.generatedError=e:t.error(e)}).on("end",function(){t.isPaused?t._upstreamEnded=!0:t.end()})},s.prototype.pause=function(){return!!i.prototype.pause.call(this)&&(this._stream.pause(),!0)},s.prototype.resume=function(){return!!i.prototype.resume.call(this)&&(this._upstreamEnded?this.end():this._stream.resume(),!0)},t.exports=s},{"../stream/GenericWorker":28,"../utils":32}],13:[function(e,t,r){"use strict";var i=e("readable-stream").Readable;function n(e,t,r){i.call(this,t),this._helper=e;var n=this;e.on("data",function(e,t){n.push(e)||n._helper.pause(),r&&r(t)}).on("error",function(e){n.emit("error",e)}).on("end",function(){n.push(null)})}e("../utils").inherits(n,i),n.prototype._read=function(){this._helper.resume()},t.exports=n},{"../utils":32,"readable-stream":16}],14:[function(e,t,r){"use strict";t.exports={isNode:"undefined"!=typeof Buffer,newBufferFrom:function(e,t){if(Buffer.from&&Buffer.from!==Uint8Array.from)return Buffer.from(e,t);if("number"==typeof e)throw new Error('The "data" argument must not be a number');return new Buffer(e,t)},allocBuffer:function(e){if(Buffer.alloc)return Buffer.alloc(e);var t=new Buffer(e);return t.fill(0),t},isBuffer:function(e){return Buffer.isBuffer(e)},isStream:function(e){return e&&"function"==typeof e.on&&"function"==typeof e.pause&&"function"==typeof e.resume}}},{}],15:[function(e,t,r){"use strict";function s(e,t,r){var n,i=u.getTypeOf(t),s=u.extend(r||{},f);s.date=s.date||new Date,null!==s.compression&&(s.compression=s.compression.toUpperCase()),"string"==typeof s.unixPermissions&&(s.unixPermissions=parseInt(s.unixPermissions,8)),s.unixPermissions&&16384&s.unixPermissions&&(s.dir=!0),s.dosPermissions&&16&s.dosPermissions&&(s.dir=!0),s.dir&&(e=g(e)),s.createFolders&&(n=_(e))&&b.call(this,n,!0);var a="string"===i&&!1===s.binary&&!1===s.base64;r&&void 0!==r.binary||(s.binary=!a),(t instanceof c&&0===t.uncompressedSize||s.dir||!t||0===t.length)&&(s.base64=!1,s.binary=!0,t="",s.compression="STORE",i="string");var o=null;o=t instanceof c||t instanceof l?t:p.isNode&&p.isStream(t)?new m(e,t):u.prepareContent(e,t,s.binary,s.optimizedBinaryString,s.base64);var h=new d(e,o,s);this.files[e]=h}var i=e("./utf8"),u=e("./utils"),l=e("./stream/GenericWorker"),a=e("./stream/StreamHelper"),f=e("./defaults"),c=e("./compressedObject"),d=e("./zipObject"),o=e("./generate"),p=e("./nodejsUtils"),m=e("./nodejs/NodejsStreamInputAdapter"),_=function(e){"/"===e.slice(-1)&&(e=e.substring(0,e.length-1));var t=e.lastIndexOf("/");return 0<t?e.substring(0,t):""},g=function(e){return"/"!==e.slice(-1)&&(e+="/"),e},b=function(e,t){return t=void 0!==t?t:f.createFolders,e=g(e),this.files[e]||s.call(this,e,null,{dir:!0,createFolders:t}),this.files[e]};function h(e){return"[object RegExp]"===Object.prototype.toString.call(e)}var n={load:function(){throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")},forEach:function(e){var t,r,n;for(t in this.files)n=this.files[t],(r=t.slice(this.root.length,t.length))&&t.slice(0,this.root.length)===this.root&&e(r,n)},filter:function(r){var n=[];return this.forEach(function(e,t){r(e,t)&&n.push(t)}),n},file:function(e,t,r){if(1!==arguments.length)return e=this.root+e,s.call(this,e,t,r),this;if(h(e)){var n=e;return this.filter(function(e,t){return!t.dir&&n.test(e)})}var i=this.files[this.root+e];return i&&!i.dir?i:null},folder:function(r){if(!r)return this;if(h(r))return this.filter(function(e,t){return t.dir&&r.test(e)});var e=this.root+r,t=b.call(this,e),n=this.clone();return n.root=t.name,n},remove:function(r){r=this.root+r;var e=this.files[r];if(e||("/"!==r.slice(-1)&&(r+="/"),e=this.files[r]),e&&!e.dir)delete this.files[r];else for(var t=this.filter(function(e,t){return t.name.slice(0,r.length)===r}),n=0;n<t.length;n++)delete this.files[t[n].name];return this},generate:function(){throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")},generateInternalStream:function(e){var t,r={};try{if((r=u.extend(e||{},{streamFiles:!1,compression:"STORE",compressionOptions:null,type:"",platform:"DOS",comment:null,mimeType:"application/zip",encodeFileName:i.utf8encode})).type=r.type.toLowerCase(),r.compression=r.compression.toUpperCase(),"binarystring"===r.type&&(r.type="string"),!r.type)throw new Error("No output type specified.");u.checkSupport(r.type),"darwin"!==r.platform&&"freebsd"!==r.platform&&"linux"!==r.platform&&"sunos"!==r.platform||(r.platform="UNIX"),"win32"===r.platform&&(r.platform="DOS");var n=r.comment||this.comment||"";t=o.generateWorker(this,r,n)}catch(e){(t=new l("error")).error(e)}return new a(t,r.type||"string",r.mimeType)},generateAsync:function(e,t){return this.generateInternalStream(e).accumulate(t)},generateNodeStream:function(e,t){return(e=e||{}).type||(e.type="nodebuffer"),this.generateInternalStream(e).toNodejsStream(t)}};t.exports=n},{"./compressedObject":2,"./defaults":5,"./generate":9,"./nodejs/NodejsStreamInputAdapter":12,"./nodejsUtils":14,"./stream/GenericWorker":28,"./stream/StreamHelper":29,"./utf8":31,"./utils":32,"./zipObject":35}],16:[function(e,t,r){"use strict";t.exports=e("stream")},{stream:void 0}],17:[function(e,t,r){"use strict";var n=e("./DataReader");function i(e){n.call(this,e);for(var t=0;t<this.data.length;t++)e[t]=255&e[t]}e("../utils").inherits(i,n),i.prototype.byteAt=function(e){return this.data[this.zero+e]},i.prototype.lastIndexOfSignature=function(e){for(var t=e.charCodeAt(0),r=e.charCodeAt(1),n=e.charCodeAt(2),i=e.charCodeAt(3),s=this.length-4;0<=s;--s)if(this.data[s]===t&&this.data[s+1]===r&&this.data[s+2]===n&&this.data[s+3]===i)return s-this.zero;return-1},i.prototype.readAndCheckSignature=function(e){var t=e.charCodeAt(0),r=e.charCodeAt(1),n=e.charCodeAt(2),i=e.charCodeAt(3),s=this.readData(4);return t===s[0]&&r===s[1]&&n===s[2]&&i===s[3]},i.prototype.readData=function(e){if(this.checkOffset(e),0===e)return[];var t=this.data.slice(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./DataReader":18}],18:[function(e,t,r){"use strict";var n=e("../utils");function i(e){this.data=e,this.length=e.length,this.index=0,this.zero=0}i.prototype={checkOffset:function(e){this.checkIndex(this.index+e)},checkIndex:function(e){if(this.length<this.zero+e||e<0)throw new Error("End of data reached (data length = "+this.length+", asked index = "+e+"). Corrupted zip ?")},setIndex:function(e){this.checkIndex(e),this.index=e},skip:function(e){this.setIndex(this.index+e)},byteAt:function(){},readInt:function(e){var t,r=0;for(this.checkOffset(e),t=this.index+e-1;t>=this.index;t--)r=(r<<8)+this.byteAt(t);return this.index+=e,r},readString:function(e){return n.transformTo("string",this.readData(e))},readData:function(){},lastIndexOfSignature:function(){},readAndCheckSignature:function(){},readDate:function(){var e=this.readInt(4);return new Date(Date.UTC(1980+(e>>25&127),(e>>21&15)-1,e>>16&31,e>>11&31,e>>5&63,(31&e)<<1))}},t.exports=i},{"../utils":32}],19:[function(e,t,r){"use strict";var n=e("./Uint8ArrayReader");function i(e){n.call(this,e)}e("../utils").inherits(i,n),i.prototype.readData=function(e){this.checkOffset(e);var t=this.data.slice(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./Uint8ArrayReader":21}],20:[function(e,t,r){"use strict";var n=e("./DataReader");function i(e){n.call(this,e)}e("../utils").inherits(i,n),i.prototype.byteAt=function(e){return this.data.charCodeAt(this.zero+e)},i.prototype.lastIndexOfSignature=function(e){return this.data.lastIndexOf(e)-this.zero},i.prototype.readAndCheckSignature=function(e){return e===this.readData(4)},i.prototype.readData=function(e){this.checkOffset(e);var t=this.data.slice(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./DataReader":18}],21:[function(e,t,r){"use strict";var n=e("./ArrayReader");function i(e){n.call(this,e)}e("../utils").inherits(i,n),i.prototype.readData=function(e){if(this.checkOffset(e),0===e)return new Uint8Array(0);var t=this.data.subarray(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./ArrayReader":17}],22:[function(e,t,r){"use strict";var n=e("../utils"),i=e("../support"),s=e("./ArrayReader"),a=e("./StringReader"),o=e("./NodeBufferReader"),h=e("./Uint8ArrayReader");t.exports=function(e){var t=n.getTypeOf(e);return n.checkSupport(t),"string"!==t||i.uint8array?"nodebuffer"===t?new o(e):i.uint8array?new h(n.transformTo("uint8array",e)):new s(n.transformTo("array",e)):new a(e)}},{"../support":30,"../utils":32,"./ArrayReader":17,"./NodeBufferReader":19,"./StringReader":20,"./Uint8ArrayReader":21}],23:[function(e,t,r){"use strict";r.LOCAL_FILE_HEADER="PK",r.CENTRAL_FILE_HEADER="PK",r.CENTRAL_DIRECTORY_END="PK",r.ZIP64_CENTRAL_DIRECTORY_LOCATOR="PK",r.ZIP64_CENTRAL_DIRECTORY_END="PK",r.DATA_DESCRIPTOR="PK\b"},{}],24:[function(e,t,r){"use strict";var n=e("./GenericWorker"),i=e("../utils");function s(e){n.call(this,"ConvertWorker to "+e),this.destType=e}i.inherits(s,n),s.prototype.processChunk=function(e){this.push({data:i.transformTo(this.destType,e.data),meta:e.meta})},t.exports=s},{"../utils":32,"./GenericWorker":28}],25:[function(e,t,r){"use strict";var n=e("./GenericWorker"),i=e("../crc32");function s(){n.call(this,"Crc32Probe"),this.withStreamInfo("crc32",0)}e("../utils").inherits(s,n),s.prototype.processChunk=function(e){this.streamInfo.crc32=i(e.data,this.streamInfo.crc32||0),this.push(e)},t.exports=s},{"../crc32":4,"../utils":32,"./GenericWorker":28}],26:[function(e,t,r){"use strict";var n=e("../utils"),i=e("./GenericWorker");function s(e){i.call(this,"DataLengthProbe for "+e),this.propName=e,this.withStreamInfo(e,0)}n.inherits(s,i),s.prototype.processChunk=function(e){if(e){var t=this.streamInfo[this.propName]||0;this.streamInfo[this.propName]=t+e.data.length}i.prototype.processChunk.call(this,e)},t.exports=s},{"../utils":32,"./GenericWorker":28}],27:[function(e,t,r){"use strict";var n=e("../utils"),i=e("./GenericWorker");function s(e){i.call(this,"DataWorker");var t=this;this.dataIsReady=!1,this.index=0,this.max=0,this.data=null,this.type="",this._tickScheduled=!1,e.then(function(e){t.dataIsReady=!0,t.data=e,t.max=e&&e.length||0,t.type=n.getTypeOf(e),t.isPaused||t._tickAndRepeat()},function(e){t.error(e)})}n.inherits(s,i),s.prototype.cleanUp=function(){i.prototype.cleanUp.call(this),this.data=null},s.prototype.resume=function(){return!!i.prototype.resume.call(this)&&(!this._tickScheduled&&this.dataIsReady&&(this._tickScheduled=!0,n.delay(this._tickAndRepeat,[],this)),!0)},s.prototype._tickAndRepeat=function(){this._tickScheduled=!1,this.isPaused||this.isFinished||(this._tick(),this.isFinished||(n.delay(this._tickAndRepeat,[],this),this._tickScheduled=!0))},s.prototype._tick=function(){if(this.isPaused||this.isFinished)return!1;var e=null,t=Math.min(this.max,this.index+16384);if(this.index>=this.max)return this.end();switch(this.type){case"string":e=this.data.substring(this.index,t);break;case"uint8array":e=this.data.subarray(this.index,t);break;case"array":case"nodebuffer":e=this.data.slice(this.index,t)}return this.index=t,this.push({data:e,meta:{percent:this.max?this.index/this.max*100:0}})},t.exports=s},{"../utils":32,"./GenericWorker":28}],28:[function(e,t,r){"use strict";function n(e){this.name=e||"default",this.streamInfo={},this.generatedError=null,this.extraStreamInfo={},this.isPaused=!0,this.isFinished=!1,this.isLocked=!1,this._listeners={data:[],end:[],error:[]},this.previous=null}n.prototype={push:function(e){this.emit("data",e)},end:function(){if(this.isFinished)return!1;this.flush();try{this.emit("end"),this.cleanUp(),this.isFinished=!0}catch(e){this.emit("error",e)}return!0},error:function(e){return!this.isFinished&&(this.isPaused?this.generatedError=e:(this.isFinished=!0,this.emit("error",e),this.previous&&this.previous.error(e),this.cleanUp()),!0)},on:function(e,t){return this._listeners[e].push(t),this},cleanUp:function(){this.streamInfo=this.generatedError=this.extraStreamInfo=null,this._listeners=[]},emit:function(e,t){if(this._listeners[e])for(var r=0;r<this._listeners[e].length;r++)this._listeners[e][r].call(this,t)},pipe:function(e){return e.registerPrevious(this)},registerPrevious:function(e){if(this.isLocked)throw new Error("The stream '"+this+"' has already been used.");this.streamInfo=e.streamInfo,this.mergeStreamInfo(),this.previous=e;var t=this;return e.on("data",function(e){t.processChunk(e)}),e.on("end",function(){t.end()}),e.on("error",function(e){t.error(e)}),this},pause:function(){return!this.isPaused&&!this.isFinished&&(this.isPaused=!0,this.previous&&this.previous.pause(),!0)},resume:function(){if(!this.isPaused||this.isFinished)return!1;var e=this.isPaused=!1;return this.generatedError&&(this.error(this.generatedError),e=!0),this.previous&&this.previous.resume(),!e},flush:function(){},processChunk:function(e){this.push(e)},withStreamInfo:function(e,t){return this.extraStreamInfo[e]=t,this.mergeStreamInfo(),this},mergeStreamInfo:function(){for(var e in this.extraStreamInfo)Object.prototype.hasOwnProperty.call(this.extraStreamInfo,e)&&(this.streamInfo[e]=this.extraStreamInfo[e])},lock:function(){if(this.isLocked)throw new Error("The stream '"+this+"' has already been used.");this.isLocked=!0,this.previous&&this.previous.lock()},toString:function(){var e="Worker "+this.name;return this.previous?this.previous+" -> "+e:e}},t.exports=n},{}],29:[function(e,t,r){"use strict";var h=e("../utils"),i=e("./ConvertWorker"),s=e("./GenericWorker"),u=e("../base64"),n=e("../support"),a=e("../external"),o=null;if(n.nodestream)try{o=e("../nodejs/NodejsStreamOutputAdapter")}catch(e){}function l(e,o){return new a.Promise(function(t,r){var n=[],i=e._internalType,s=e._outputType,a=e._mimeType;e.on("data",function(e,t){n.push(e),o&&o(t)}).on("error",function(e){n=[],r(e)}).on("end",function(){try{var e=function(e,t,r){switch(e){case"blob":return h.newBlob(h.transformTo("arraybuffer",t),r);case"base64":return u.encode(t);default:return h.transformTo(e,t)}}(s,function(e,t){var r,n=0,i=null,s=0;for(r=0;r<t.length;r++)s+=t[r].length;switch(e){case"string":return t.join("");case"array":return Array.prototype.concat.apply([],t);case"uint8array":for(i=new Uint8Array(s),r=0;r<t.length;r++)i.set(t[r],n),n+=t[r].length;return i;case"nodebuffer":return Buffer.concat(t);default:throw new Error("concat : unsupported type '"+e+"'")}}(i,n),a);t(e)}catch(e){r(e)}n=[]}).resume()})}function f(e,t,r){var n=t;switch(t){case"blob":case"arraybuffer":n="uint8array";break;case"base64":n="string"}try{this._internalType=n,this._outputType=t,this._mimeType=r,h.checkSupport(n),this._worker=e.pipe(new i(n)),e.lock()}catch(e){this._worker=new s("error"),this._worker.error(e)}}f.prototype={accumulate:function(e){return l(this,e)},on:function(e,t){var r=this;return"data"===e?this._worker.on(e,function(e){t.call(r,e.data,e.meta)}):this._worker.on(e,function(){h.delay(t,arguments,r)}),this},resume:function(){return h.delay(this._worker.resume,[],this._worker),this},pause:function(){return this._worker.pause(),this},toNodejsStream:function(e){if(h.checkSupport("nodestream"),"nodebuffer"!==this._outputType)throw new Error(this._outputType+" is not supported by this method");return new o(this,{objectMode:"nodebuffer"!==this._outputType},e)}},t.exports=f},{"../base64":1,"../external":6,"../nodejs/NodejsStreamOutputAdapter":13,"../support":30,"../utils":32,"./ConvertWorker":24,"./GenericWorker":28}],30:[function(e,t,r){"use strict";if(r.base64=!0,r.array=!0,r.string=!0,r.arraybuffer="undefined"!=typeof ArrayBuffer&&"undefined"!=typeof Uint8Array,r.nodebuffer="undefined"!=typeof Buffer,r.uint8array="undefined"!=typeof Uint8Array,"undefined"==typeof ArrayBuffer)r.blob=!1;else{var n=new ArrayBuffer(0);try{r.blob=0===new Blob([n],{type:"application/zip"}).size}catch(e){try{var i=new(self.BlobBuilder||self.WebKitBlobBuilder||self.MozBlobBuilder||self.MSBlobBuilder);i.append(n),r.blob=0===i.getBlob("application/zip").size}catch(e){r.blob=!1}}}try{r.nodestream=!!e("readable-stream").Readable}catch(e){r.nodestream=!1}},{"readable-stream":16}],31:[function(e,t,s){"use strict";for(var o=e("./utils"),h=e("./support"),r=e("./nodejsUtils"),n=e("./stream/GenericWorker"),u=new Array(256),i=0;i<256;i++)u[i]=252<=i?6:248<=i?5:240<=i?4:224<=i?3:192<=i?2:1;u[254]=u[254]=1;function a(){n.call(this,"utf-8 decode"),this.leftOver=null}function l(){n.call(this,"utf-8 encode")}s.utf8encode=function(e){return h.nodebuffer?r.newBufferFrom(e,"utf-8"):function(e){var t,r,n,i,s,a=e.length,o=0;for(i=0;i<a;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),o+=r<128?1:r<2048?2:r<65536?3:4;for(t=h.uint8array?new Uint8Array(o):new Array(o),i=s=0;s<o;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),r<128?t[s++]=r:(r<2048?t[s++]=192|r>>>6:(r<65536?t[s++]=224|r>>>12:(t[s++]=240|r>>>18,t[s++]=128|r>>>12&63),t[s++]=128|r>>>6&63),t[s++]=128|63&r);return t}(e)},s.utf8decode=function(e){return h.nodebuffer?o.transformTo("nodebuffer",e).toString("utf-8"):function(e){var t,r,n,i,s=e.length,a=new Array(2*s);for(t=r=0;t<s;)if((n=e[t++])<128)a[r++]=n;else if(4<(i=u[n]))a[r++]=65533,t+=i-1;else{for(n&=2===i?31:3===i?15:7;1<i&&t<s;)n=n<<6|63&e[t++],i--;1<i?a[r++]=65533:n<65536?a[r++]=n:(n-=65536,a[r++]=55296|n>>10&1023,a[r++]=56320|1023&n)}return a.length!==r&&(a.subarray?a=a.subarray(0,r):a.length=r),o.applyFromCharCode(a)}(e=o.transformTo(h.uint8array?"uint8array":"array",e))},o.inherits(a,n),a.prototype.processChunk=function(e){var t=o.transformTo(h.uint8array?"uint8array":"array",e.data);if(this.leftOver&&this.leftOver.length){if(h.uint8array){var r=t;(t=new Uint8Array(r.length+this.leftOver.length)).set(this.leftOver,0),t.set(r,this.leftOver.length)}else t=this.leftOver.concat(t);this.leftOver=null}var n=function(e,t){var r;for((t=t||e.length)>e.length&&(t=e.length),r=t-1;0<=r&&128==(192&e[r]);)r--;return r<0?t:0===r?t:r+u[e[r]]>t?r:t}(t),i=t;n!==t.length&&(h.uint8array?(i=t.subarray(0,n),this.leftOver=t.subarray(n,t.length)):(i=t.slice(0,n),this.leftOver=t.slice(n,t.length))),this.push({data:s.utf8decode(i),meta:e.meta})},a.prototype.flush=function(){this.leftOver&&this.leftOver.length&&(this.push({data:s.utf8decode(this.leftOver),meta:{}}),this.leftOver=null)},s.Utf8DecodeWorker=a,o.inherits(l,n),l.prototype.processChunk=function(e){this.push({data:s.utf8encode(e.data),meta:e.meta})},s.Utf8EncodeWorker=l},{"./nodejsUtils":14,"./stream/GenericWorker":28,"./support":30,"./utils":32}],32:[function(e,t,a){"use strict";var o=e("./support"),h=e("./base64"),r=e("./nodejsUtils"),u=e("./external");function n(e){return e}function l(e,t){for(var r=0;r<e.length;++r)t[r]=255&e.charCodeAt(r);return t}e("setimmediate"),a.newBlob=function(t,r){a.checkSupport("blob");try{return new Blob([t],{type:r})}catch(e){try{var n=new(self.BlobBuilder||self.WebKitBlobBuilder||self.MozBlobBuilder||self.MSBlobBuilder);return n.append(t),n.getBlob(r)}catch(e){throw new Error("Bug : can't construct the Blob.")}}};var i={stringifyByChunk:function(e,t,r){var n=[],i=0,s=e.length;if(s<=r)return String.fromCharCode.apply(null,e);for(;i<s;)"array"===t||"nodebuffer"===t?n.push(String.fromCharCode.apply(null,e.slice(i,Math.min(i+r,s)))):n.push(String.fromCharCode.apply(null,e.subarray(i,Math.min(i+r,s)))),i+=r;return n.join("")},stringifyByChar:function(e){for(var t="",r=0;r<e.length;r++)t+=String.fromCharCode(e[r]);return t},applyCanBeUsed:{uint8array:function(){try{return o.uint8array&&1===String.fromCharCode.apply(null,new Uint8Array(1)).length}catch(e){return!1}}(),nodebuffer:function(){try{return o.nodebuffer&&1===String.fromCharCode.apply(null,r.allocBuffer(1)).length}catch(e){return!1}}()}};function s(e){var t=65536,r=a.getTypeOf(e),n=!0;if("uint8array"===r?n=i.applyCanBeUsed.uint8array:"nodebuffer"===r&&(n=i.applyCanBeUsed.nodebuffer),n)for(;1<t;)try{return i.stringifyByChunk(e,r,t)}catch(e){t=Math.floor(t/2)}return i.stringifyByChar(e)}function f(e,t){for(var r=0;r<e.length;r++)t[r]=e[r];return t}a.applyFromCharCode=s;var c={};c.string={string:n,array:function(e){return l(e,new Array(e.length))},arraybuffer:function(e){return c.string.uint8array(e).buffer},uint8array:function(e){return l(e,new Uint8Array(e.length))},nodebuffer:function(e){return l(e,r.allocBuffer(e.length))}},c.array={string:s,array:n,arraybuffer:function(e){return new Uint8Array(e).buffer},uint8array:function(e){return new Uint8Array(e)},nodebuffer:function(e){return r.newBufferFrom(e)}},c.arraybuffer={string:function(e){return s(new Uint8Array(e))},array:function(e){return f(new Uint8Array(e),new Array(e.byteLength))},arraybuffer:n,uint8array:function(e){return new Uint8Array(e)},nodebuffer:function(e){return r.newBufferFrom(new Uint8Array(e))}},c.uint8array={string:s,array:function(e){return f(e,new Array(e.length))},arraybuffer:function(e){return e.buffer},uint8array:n,nodebuffer:function(e){return r.newBufferFrom(e)}},c.nodebuffer={string:s,array:function(e){return f(e,new Array(e.length))},arraybuffer:function(e){return c.nodebuffer.uint8array(e).buffer},uint8array:function(e){return f(e,new Uint8Array(e.length))},nodebuffer:n},a.transformTo=function(e,t){if(t=t||"",!e)return t;a.checkSupport(e);var r=a.getTypeOf(t);return c[r][e](t)},a.resolve=function(e){for(var t=e.split("/"),r=[],n=0;n<t.length;n++){var i=t[n];"."===i||""===i&&0!==n&&n!==t.length-1||(".."===i?r.pop():r.push(i))}return r.join("/")},a.getTypeOf=function(e){return"string"==typeof e?"string":"[object Array]"===Object.prototype.toString.call(e)?"array":o.nodebuffer&&r.isBuffer(e)?"nodebuffer":o.uint8array&&e instanceof Uint8Array?"uint8array":o.arraybuffer&&e instanceof ArrayBuffer?"arraybuffer":void 0},a.checkSupport=function(e){if(!o[e.toLowerCase()])throw new Error(e+" is not supported by this platform")},a.MAX_VALUE_16BITS=65535,a.MAX_VALUE_32BITS=-1,a.pretty=function(e){var t,r,n="";for(r=0;r<(e||"").length;r++)n+="\\x"+((t=e.charCodeAt(r))<16?"0":"")+t.toString(16).toUpperCase();return n},a.delay=function(e,t,r){setImmediate(function(){e.apply(r||null,t||[])})},a.inherits=function(e,t){function r(){}r.prototype=t.prototype,e.prototype=new r},a.extend=function(){var e,t,r={};for(e=0;e<arguments.length;e++)for(t in arguments[e])Object.prototype.hasOwnProperty.call(arguments[e],t)&&void 0===r[t]&&(r[t]=arguments[e][t]);return r},a.prepareContent=function(r,e,n,i,s){return u.Promise.resolve(e).then(function(n){return o.blob&&(n instanceof Blob||-1!==["[object File]","[object Blob]"].indexOf(Object.prototype.toString.call(n)))&&"undefined"!=typeof FileReader?new u.Promise(function(t,r){var e=new FileReader;e.onload=function(e){t(e.target.result)},e.onerror=function(e){r(e.target.error)},e.readAsArrayBuffer(n)}):n}).then(function(e){var t=a.getTypeOf(e);return t?("arraybuffer"===t?e=a.transformTo("uint8array",e):"string"===t&&(s?e=h.decode(e):n&&!0!==i&&(e=function(e){return l(e,o.uint8array?new Uint8Array(e.length):new Array(e.length))}(e))),e):u.Promise.reject(new Error("Can't read the data of '"+r+"'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?"))})}},{"./base64":1,"./external":6,"./nodejsUtils":14,"./support":30,setimmediate:54}],33:[function(e,t,r){"use strict";var n=e("./reader/readerFor"),i=e("./utils"),s=e("./signature"),a=e("./zipEntry"),o=e("./support");function h(e){this.files=[],this.loadOptions=e}h.prototype={checkSignature:function(e){if(!this.reader.readAndCheckSignature(e)){this.reader.index-=4;var t=this.reader.readString(4);throw new Error("Corrupted zip or bug: unexpected signature ("+i.pretty(t)+", expected "+i.pretty(e)+")")}},isSignature:function(e,t){var r=this.reader.index;this.reader.setIndex(e);var n=this.reader.readString(4)===t;return this.reader.setIndex(r),n},readBlockEndOfCentral:function(){this.diskNumber=this.reader.readInt(2),this.diskWithCentralDirStart=this.reader.readInt(2),this.centralDirRecordsOnThisDisk=this.reader.readInt(2),this.centralDirRecords=this.reader.readInt(2),this.centralDirSize=this.reader.readInt(4),this.centralDirOffset=this.reader.readInt(4),this.zipCommentLength=this.reader.readInt(2);var e=this.reader.readData(this.zipCommentLength),t=o.uint8array?"uint8array":"array",r=i.transformTo(t,e);this.zipComment=this.loadOptions.decodeFileName(r)},readBlockZip64EndOfCentral:function(){this.zip64EndOfCentralSize=this.reader.readInt(8),this.reader.skip(4),this.diskNumber=this.reader.readInt(4),this.diskWithCentralDirStart=this.reader.readInt(4),this.centralDirRecordsOnThisDisk=this.reader.readInt(8),this.centralDirRecords=this.reader.readInt(8),this.centralDirSize=this.reader.readInt(8),this.centralDirOffset=this.reader.readInt(8),this.zip64ExtensibleData={};for(var e,t,r,n=this.zip64EndOfCentralSize-44;0<n;)e=this.reader.readInt(2),t=this.reader.readInt(4),r=this.reader.readData(t),this.zip64ExtensibleData[e]={id:e,length:t,value:r}},readBlockZip64EndOfCentralLocator:function(){if(this.diskWithZip64CentralDirStart=this.reader.readInt(4),this.relativeOffsetEndOfZip64CentralDir=this.reader.readInt(8),this.disksCount=this.reader.readInt(4),1<this.disksCount)throw new Error("Multi-volumes zip are not supported")},readLocalFiles:function(){var e,t;for(e=0;e<this.files.length;e++)t=this.files[e],this.reader.setIndex(t.localHeaderOffset),this.checkSignature(s.LOCAL_FILE_HEADER),t.readLocalPart(this.reader),t.handleUTF8(),t.processAttributes()},readCentralDir:function(){var e;for(this.reader.setIndex(this.centralDirOffset);this.reader.readAndCheckSignature(s.CENTRAL_FILE_HEADER);)(e=new a({zip64:this.zip64},this.loadOptions)).readCentralPart(this.reader),this.files.push(e);if(this.centralDirRecords!==this.files.length&&0!==this.centralDirRecords&&0===this.files.length)throw new Error("Corrupted zip or bug: expected "+this.centralDirRecords+" records in central dir, got "+this.files.length)},readEndOfCentral:function(){var e=this.reader.lastIndexOfSignature(s.CENTRAL_DIRECTORY_END);if(e<0)throw!this.isSignature(0,s.LOCAL_FILE_HEADER)?new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html"):new Error("Corrupted zip: can't find end of central directory");this.reader.setIndex(e);var t=e;if(this.checkSignature(s.CENTRAL_DIRECTORY_END),this.readBlockEndOfCentral(),this.diskNumber===i.MAX_VALUE_16BITS||this.diskWithCentralDirStart===i.MAX_VALUE_16BITS||this.centralDirRecordsOnThisDisk===i.MAX_VALUE_16BITS||this.centralDirRecords===i.MAX_VALUE_16BITS||this.centralDirSize===i.MAX_VALUE_32BITS||this.centralDirOffset===i.MAX_VALUE_32BITS){if(this.zip64=!0,(e=this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR))<0)throw new Error("Corrupted zip: can't find the ZIP64 end of central directory locator");if(this.reader.setIndex(e),this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR),this.readBlockZip64EndOfCentralLocator(),!this.isSignature(this.relativeOffsetEndOfZip64CentralDir,s.ZIP64_CENTRAL_DIRECTORY_END)&&(this.relativeOffsetEndOfZip64CentralDir=this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_END),this.relativeOffsetEndOfZip64CentralDir<0))throw new Error("Corrupted zip: can't find the ZIP64 end of central directory");this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir),this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_END),this.readBlockZip64EndOfCentral()}var r=this.centralDirOffset+this.centralDirSize;this.zip64&&(r+=20,r+=12+this.zip64EndOfCentralSize);var n=t-r;if(0<n)this.isSignature(t,s.CENTRAL_FILE_HEADER)||(this.reader.zero=n);else if(n<0)throw new Error("Corrupted zip: missing "+Math.abs(n)+" bytes.")},prepareReader:function(e){this.reader=n(e)},load:function(e){this.prepareReader(e),this.readEndOfCentral(),this.readCentralDir(),this.readLocalFiles()}},t.exports=h},{"./reader/readerFor":22,"./signature":23,"./support":30,"./utils":32,"./zipEntry":34}],34:[function(e,t,r){"use strict";var n=e("./reader/readerFor"),s=e("./utils"),i=e("./compressedObject"),a=e("./crc32"),o=e("./utf8"),h=e("./compressions"),u=e("./support");function l(e,t){this.options=e,this.loadOptions=t}l.prototype={isEncrypted:function(){return 1==(1&this.bitFlag)},useUTF8:function(){return 2048==(2048&this.bitFlag)},readLocalPart:function(e){var t,r;if(e.skip(22),this.fileNameLength=e.readInt(2),r=e.readInt(2),this.fileName=e.readData(this.fileNameLength),e.skip(r),-1===this.compressedSize||-1===this.uncompressedSize)throw new Error("Bug or corrupted zip : didn't get enough information from the central directory (compressedSize === -1 || uncompressedSize === -1)");if(null===(t=function(e){for(var t in h)if(Object.prototype.hasOwnProperty.call(h,t)&&h[t].magic===e)return h[t];return null}(this.compressionMethod)))throw new Error("Corrupted zip : compression "+s.pretty(this.compressionMethod)+" unknown (inner file : "+s.transformTo("string",this.fileName)+")");this.decompressed=new i(this.compressedSize,this.uncompressedSize,this.crc32,t,e.readData(this.compressedSize))},readCentralPart:function(e){this.versionMadeBy=e.readInt(2),e.skip(2),this.bitFlag=e.readInt(2),this.compressionMethod=e.readString(2),this.date=e.readDate(),this.crc32=e.readInt(4),this.compressedSize=e.readInt(4),this.uncompressedSize=e.readInt(4);var t=e.readInt(2);if(this.extraFieldsLength=e.readInt(2),this.fileCommentLength=e.readInt(2),this.diskNumberStart=e.readInt(2),this.internalFileAttributes=e.readInt(2),this.externalFileAttributes=e.readInt(4),this.localHeaderOffset=e.readInt(4),this.isEncrypted())throw new Error("Encrypted zip are not supported");e.skip(t),this.readExtraFields(e),this.parseZIP64ExtraField(e),this.fileComment=e.readData(this.fileCommentLength)},processAttributes:function(){this.unixPermissions=null,this.dosPermissions=null;var e=this.versionMadeBy>>8;this.dir=!!(16&this.externalFileAttributes),0==e&&(this.dosPermissions=63&this.externalFileAttributes),3==e&&(this.unixPermissions=this.externalFileAttributes>>16&65535),this.dir||"/"!==this.fileNameStr.slice(-1)||(this.dir=!0)},parseZIP64ExtraField:function(){if(this.extraFields[1]){var e=n(this.extraFields[1].value);this.uncompressedSize===s.MAX_VALUE_32BITS&&(this.uncompressedSize=e.readInt(8)),this.compressedSize===s.MAX_VALUE_32BITS&&(this.compressedSize=e.readInt(8)),this.localHeaderOffset===s.MAX_VALUE_32BITS&&(this.localHeaderOffset=e.readInt(8)),this.diskNumberStart===s.MAX_VALUE_32BITS&&(this.diskNumberStart=e.readInt(4))}},readExtraFields:function(e){var t,r,n,i=e.index+this.extraFieldsLength;for(this.extraFields||(this.extraFields={});e.index+4<i;)t=e.readInt(2),r=e.readInt(2),n=e.readData(r),this.extraFields[t]={id:t,length:r,value:n};e.setIndex(i)},handleUTF8:function(){var e=u.uint8array?"uint8array":"array";if(this.useUTF8())this.fileNameStr=o.utf8decode(this.fileName),this.fileCommentStr=o.utf8decode(this.fileComment);else{var t=this.findExtraFieldUnicodePath();if(null!==t)this.fileNameStr=t;else{var r=s.transformTo(e,this.fileName);this.fileNameStr=this.loadOptions.decodeFileName(r)}var n=this.findExtraFieldUnicodeComment();if(null!==n)this.fileCommentStr=n;else{var i=s.transformTo(e,this.fileComment);this.fileCommentStr=this.loadOptions.decodeFileName(i)}}},findExtraFieldUnicodePath:function(){var e=this.extraFields[28789];if(e){var t=n(e.value);return 1!==t.readInt(1)?null:a(this.fileName)!==t.readInt(4)?null:o.utf8decode(t.readData(e.length-5))}return null},findExtraFieldUnicodeComment:function(){var e=this.extraFields[25461];if(e){var t=n(e.value);return 1!==t.readInt(1)?null:a(this.fileComment)!==t.readInt(4)?null:o.utf8decode(t.readData(e.length-5))}return null}},t.exports=l},{"./compressedObject":2,"./compressions":3,"./crc32":4,"./reader/readerFor":22,"./support":30,"./utf8":31,"./utils":32}],35:[function(e,t,r){"use strict";function n(e,t,r){this.name=e,this.dir=r.dir,this.date=r.date,this.comment=r.comment,this.unixPermissions=r.unixPermissions,this.dosPermissions=r.dosPermissions,this._data=t,this._dataBinary=r.binary,this.options={compression:r.compression,compressionOptions:r.compressionOptions}}var s=e("./stream/StreamHelper"),i=e("./stream/DataWorker"),a=e("./utf8"),o=e("./compressedObject"),h=e("./stream/GenericWorker");n.prototype={internalStream:function(e){var t=null,r="string";try{if(!e)throw new Error("No output type specified.");var n="string"===(r=e.toLowerCase())||"text"===r;"binarystring"!==r&&"text"!==r||(r="string"),t=this._decompressWorker();var i=!this._dataBinary;i&&!n&&(t=t.pipe(new a.Utf8EncodeWorker)),!i&&n&&(t=t.pipe(new a.Utf8DecodeWorker))}catch(e){(t=new h("error")).error(e)}return new s(t,r,"")},async:function(e,t){return this.internalStream(e).accumulate(t)},nodeStream:function(e,t){return this.internalStream(e||"nodebuffer").toNodejsStream(t)},_compressWorker:function(e,t){if(this._data instanceof o&&this._data.compression.magic===e.magic)return this._data.getCompressedWorker();var r=this._decompressWorker();return this._dataBinary||(r=r.pipe(new a.Utf8EncodeWorker)),o.createWorkerFrom(r,e,t)},_decompressWorker:function(){return this._data instanceof o?this._data.getContentWorker():this._data instanceof h?this._data:new i(this._data)}};for(var u=["asText","asBinary","asNodeBuffer","asUint8Array","asArrayBuffer"],l=function(){throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")},f=0;f<u.length;f++)n.prototype[u[f]]=l;t.exports=n},{"./compressedObject":2,"./stream/DataWorker":27,"./stream/GenericWorker":28,"./stream/StreamHelper":29,"./utf8":31}],36:[function(e,l,t){(function(t){"use strict";var r,n,e=t.MutationObserver||t.WebKitMutationObserver;if(e){var i=0,s=new e(u),a=t.document.createTextNode("");s.observe(a,{characterData:!0}),r=function(){a.data=i=++i%2}}else if(t.setImmediate||void 0===t.MessageChannel)r="document"in t&&"onreadystatechange"in t.document.createElement("script")?function(){var e=t.document.createElement("script");e.onreadystatechange=function(){u(),e.onreadystatechange=null,e.parentNode.removeChild(e),e=null},t.document.documentElement.appendChild(e)}:function(){setTimeout(u,0)};else{var o=new t.MessageChannel;o.port1.onmessage=u,r=function(){o.port2.postMessage(0)}}var h=[];function u(){var e,t;n=!0;for(var r=h.length;r;){for(t=h,h=[],e=-1;++e<r;)t[e]();r=h.length}n=!1}l.exports=function(e){1!==h.push(e)||n||r()}}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{}],37:[function(e,t,r){"use strict";var i=e("immediate");function u(){}var l={},s=["REJECTED"],a=["FULFILLED"],n=["PENDING"];function o(e){if("function"!=typeof e)throw new TypeError("resolver must be a function");this.state=n,this.queue=[],this.outcome=void 0,e!==u&&d(this,e)}function h(e,t,r){this.promise=e,"function"==typeof t&&(this.onFulfilled=t,this.callFulfilled=this.otherCallFulfilled),"function"==typeof r&&(this.onRejected=r,this.callRejected=this.otherCallRejected)}function f(t,r,n){i(function(){var e;try{e=r(n)}catch(e){return l.reject(t,e)}e===t?l.reject(t,new TypeError("Cannot resolve promise with itself")):l.resolve(t,e)})}function c(e){var t=e&&e.then;if(e&&("object"==typeof e||"function"==typeof e)&&"function"==typeof t)return function(){t.apply(e,arguments)}}function d(t,e){var r=!1;function n(e){r||(r=!0,l.reject(t,e))}function i(e){r||(r=!0,l.resolve(t,e))}var s=p(function(){e(i,n)});"error"===s.status&&n(s.value)}function p(e,t){var r={};try{r.value=e(t),r.status="success"}catch(e){r.status="error",r.value=e}return r}(t.exports=o).prototype.finally=function(t){if("function"!=typeof t)return this;var r=this.constructor;return this.then(function(e){return r.resolve(t()).then(function(){return e})},function(e){return r.resolve(t()).then(function(){throw e})})},o.prototype.catch=function(e){return this.then(null,e)},o.prototype.then=function(e,t){if("function"!=typeof e&&this.state===a||"function"!=typeof t&&this.state===s)return this;var r=new this.constructor(u);this.state!==n?f(r,this.state===a?e:t,this.outcome):this.queue.push(new h(r,e,t));return r},h.prototype.callFulfilled=function(e){l.resolve(this.promise,e)},h.prototype.otherCallFulfilled=function(e){f(this.promise,this.onFulfilled,e)},h.prototype.callRejected=function(e){l.reject(this.promise,e)},h.prototype.otherCallRejected=function(e){f(this.promise,this.onRejected,e)},l.resolve=function(e,t){var r=p(c,t);if("error"===r.status)return l.reject(e,r.value);var n=r.value;if(n)d(e,n);else{e.state=a,e.outcome=t;for(var i=-1,s=e.queue.length;++i<s;)e.queue[i].callFulfilled(t)}return e},l.reject=function(e,t){e.state=s,e.outcome=t;for(var r=-1,n=e.queue.length;++r<n;)e.queue[r].callRejected(t);return e},o.resolve=function(e){if(e instanceof this)return e;return l.resolve(new this(u),e)},o.reject=function(e){var t=new this(u);return l.reject(t,e)},o.all=function(e){var r=this;if("[object Array]"!==Object.prototype.toString.call(e))return this.reject(new TypeError("must be an array"));var n=e.length,i=!1;if(!n)return this.resolve([]);var s=new Array(n),a=0,t=-1,o=new this(u);for(;++t<n;)h(e[t],t);return o;function h(e,t){r.resolve(e).then(function(e){s[t]=e,++a!==n||i||(i=!0,l.resolve(o,s))},function(e){i||(i=!0,l.reject(o,e))})}},o.race=function(e){var t=this;if("[object Array]"!==Object.prototype.toString.call(e))return this.reject(new TypeError("must be an array"));var r=e.length,n=!1;if(!r)return this.resolve([]);var i=-1,s=new this(u);for(;++i<r;)a=e[i],t.resolve(a).then(function(e){n||(n=!0,l.resolve(s,e))},function(e){n||(n=!0,l.reject(s,e))});var a;return s}},{immediate:36}],38:[function(e,t,r){"use strict";var n={};(0,e("./lib/utils/common").assign)(n,e("./lib/deflate"),e("./lib/inflate"),e("./lib/zlib/constants")),t.exports=n},{"./lib/deflate":39,"./lib/inflate":40,"./lib/utils/common":41,"./lib/zlib/constants":44}],39:[function(e,t,r){"use strict";var a=e("./zlib/deflate"),o=e("./utils/common"),h=e("./utils/strings"),i=e("./zlib/messages"),s=e("./zlib/zstream"),u=Object.prototype.toString,l=0,f=-1,c=0,d=8;function p(e){if(!(this instanceof p))return new p(e);this.options=o.assign({level:f,method:d,chunkSize:16384,windowBits:15,memLevel:8,strategy:c,to:""},e||{});var t=this.options;t.raw&&0<t.windowBits?t.windowBits=-t.windowBits:t.gzip&&0<t.windowBits&&t.windowBits<16&&(t.windowBits+=16),this.err=0,this.msg="",this.ended=!1,this.chunks=[],this.strm=new s,this.strm.avail_out=0;var r=a.deflateInit2(this.strm,t.level,t.method,t.windowBits,t.memLevel,t.strategy);if(r!==l)throw new Error(i[r]);if(t.header&&a.deflateSetHeader(this.strm,t.header),t.dictionary){var n;if(n="string"==typeof t.dictionary?h.string2buf(t.dictionary):"[object ArrayBuffer]"===u.call(t.dictionary)?new Uint8Array(t.dictionary):t.dictionary,(r=a.deflateSetDictionary(this.strm,n))!==l)throw new Error(i[r]);this._dict_set=!0}}function n(e,t){var r=new p(t);if(r.push(e,!0),r.err)throw r.msg||i[r.err];return r.result}p.prototype.push=function(e,t){var r,n,i=this.strm,s=this.options.chunkSize;if(this.ended)return!1;n=t===~~t?t:!0===t?4:0,"string"==typeof e?i.input=h.string2buf(e):"[object ArrayBuffer]"===u.call(e)?i.input=new Uint8Array(e):i.input=e,i.next_in=0,i.avail_in=i.input.length;do{if(0===i.avail_out&&(i.output=new o.Buf8(s),i.next_out=0,i.avail_out=s),1!==(r=a.deflate(i,n))&&r!==l)return this.onEnd(r),!(this.ended=!0);0!==i.avail_out&&(0!==i.avail_in||4!==n&&2!==n)||("string"===this.options.to?this.onData(h.buf2binstring(o.shrinkBuf(i.output,i.next_out))):this.onData(o.shrinkBuf(i.output,i.next_out)))}while((0<i.avail_in||0===i.avail_out)&&1!==r);return 4===n?(r=a.deflateEnd(this.strm),this.onEnd(r),this.ended=!0,r===l):2!==n||(this.onEnd(l),!(i.avail_out=0))},p.prototype.onData=function(e){this.chunks.push(e)},p.prototype.onEnd=function(e){e===l&&("string"===this.options.to?this.result=this.chunks.join(""):this.result=o.flattenChunks(this.chunks)),this.chunks=[],this.err=e,this.msg=this.strm.msg},r.Deflate=p,r.deflate=n,r.deflateRaw=function(e,t){return(t=t||{}).raw=!0,n(e,t)},r.gzip=function(e,t){return(t=t||{}).gzip=!0,n(e,t)}},{"./utils/common":41,"./utils/strings":42,"./zlib/deflate":46,"./zlib/messages":51,"./zlib/zstream":53}],40:[function(e,t,r){"use strict";var c=e("./zlib/inflate"),d=e("./utils/common"),p=e("./utils/strings"),m=e("./zlib/constants"),n=e("./zlib/messages"),i=e("./zlib/zstream"),s=e("./zlib/gzheader"),_=Object.prototype.toString;function a(e){if(!(this instanceof a))return new a(e);this.options=d.assign({chunkSize:16384,windowBits:0,to:""},e||{});var t=this.options;t.raw&&0<=t.windowBits&&t.windowBits<16&&(t.windowBits=-t.windowBits,0===t.windowBits&&(t.windowBits=-15)),!(0<=t.windowBits&&t.windowBits<16)||e&&e.windowBits||(t.windowBits+=32),15<t.windowBits&&t.windowBits<48&&0==(15&t.windowBits)&&(t.windowBits|=15),this.err=0,this.msg="",this.ended=!1,this.chunks=[],this.strm=new i,this.strm.avail_out=0;var r=c.inflateInit2(this.strm,t.windowBits);if(r!==m.Z_OK)throw new Error(n[r]);this.header=new s,c.inflateGetHeader(this.strm,this.header)}function o(e,t){var r=new a(t);if(r.push(e,!0),r.err)throw r.msg||n[r.err];return r.result}a.prototype.push=function(e,t){var r,n,i,s,a,o,h=this.strm,u=this.options.chunkSize,l=this.options.dictionary,f=!1;if(this.ended)return!1;n=t===~~t?t:!0===t?m.Z_FINISH:m.Z_NO_FLUSH,"string"==typeof e?h.input=p.binstring2buf(e):"[object ArrayBuffer]"===_.call(e)?h.input=new Uint8Array(e):h.input=e,h.next_in=0,h.avail_in=h.input.length;do{if(0===h.avail_out&&(h.output=new d.Buf8(u),h.next_out=0,h.avail_out=u),(r=c.inflate(h,m.Z_NO_FLUSH))===m.Z_NEED_DICT&&l&&(o="string"==typeof l?p.string2buf(l):"[object ArrayBuffer]"===_.call(l)?new Uint8Array(l):l,r=c.inflateSetDictionary(this.strm,o)),r===m.Z_BUF_ERROR&&!0===f&&(r=m.Z_OK,f=!1),r!==m.Z_STREAM_END&&r!==m.Z_OK)return this.onEnd(r),!(this.ended=!0);h.next_out&&(0!==h.avail_out&&r!==m.Z_STREAM_END&&(0!==h.avail_in||n!==m.Z_FINISH&&n!==m.Z_SYNC_FLUSH)||("string"===this.options.to?(i=p.utf8border(h.output,h.next_out),s=h.next_out-i,a=p.buf2string(h.output,i),h.next_out=s,h.avail_out=u-s,s&&d.arraySet(h.output,h.output,i,s,0),this.onData(a)):this.onData(d.shrinkBuf(h.output,h.next_out)))),0===h.avail_in&&0===h.avail_out&&(f=!0)}while((0<h.avail_in||0===h.avail_out)&&r!==m.Z_STREAM_END);return r===m.Z_STREAM_END&&(n=m.Z_FINISH),n===m.Z_FINISH?(r=c.inflateEnd(this.strm),this.onEnd(r),this.ended=!0,r===m.Z_OK):n!==m.Z_SYNC_FLUSH||(this.onEnd(m.Z_OK),!(h.avail_out=0))},a.prototype.onData=function(e){this.chunks.push(e)},a.prototype.onEnd=function(e){e===m.Z_OK&&("string"===this.options.to?this.result=this.chunks.join(""):this.result=d.flattenChunks(this.chunks)),this.chunks=[],this.err=e,this.msg=this.strm.msg},r.Inflate=a,r.inflate=o,r.inflateRaw=function(e,t){return(t=t||{}).raw=!0,o(e,t)},r.ungzip=o},{"./utils/common":41,"./utils/strings":42,"./zlib/constants":44,"./zlib/gzheader":47,"./zlib/inflate":49,"./zlib/messages":51,"./zlib/zstream":53}],41:[function(e,t,r){"use strict";var n="undefined"!=typeof Uint8Array&&"undefined"!=typeof Uint16Array&&"undefined"!=typeof Int32Array;r.assign=function(e){for(var t=Array.prototype.slice.call(arguments,1);t.length;){var r=t.shift();if(r){if("object"!=typeof r)throw new TypeError(r+"must be non-object");for(var n in r)r.hasOwnProperty(n)&&(e[n]=r[n])}}return e},r.shrinkBuf=function(e,t){return e.length===t?e:e.subarray?e.subarray(0,t):(e.length=t,e)};var i={arraySet:function(e,t,r,n,i){if(t.subarray&&e.subarray)e.set(t.subarray(r,r+n),i);else for(var s=0;s<n;s++)e[i+s]=t[r+s]},flattenChunks:function(e){var t,r,n,i,s,a;for(t=n=0,r=e.length;t<r;t++)n+=e[t].length;for(a=new Uint8Array(n),t=i=0,r=e.length;t<r;t++)s=e[t],a.set(s,i),i+=s.length;return a}},s={arraySet:function(e,t,r,n,i){for(var s=0;s<n;s++)e[i+s]=t[r+s]},flattenChunks:function(e){return[].concat.apply([],e)}};r.setTyped=function(e){e?(r.Buf8=Uint8Array,r.Buf16=Uint16Array,r.Buf32=Int32Array,r.assign(r,i)):(r.Buf8=Array,r.Buf16=Array,r.Buf32=Array,r.assign(r,s))},r.setTyped(n)},{}],42:[function(e,t,r){"use strict";var h=e("./common"),i=!0,s=!0;try{String.fromCharCode.apply(null,[0])}catch(e){i=!1}try{String.fromCharCode.apply(null,new Uint8Array(1))}catch(e){s=!1}for(var u=new h.Buf8(256),n=0;n<256;n++)u[n]=252<=n?6:248<=n?5:240<=n?4:224<=n?3:192<=n?2:1;function l(e,t){if(t<65537&&(e.subarray&&s||!e.subarray&&i))return String.fromCharCode.apply(null,h.shrinkBuf(e,t));for(var r="",n=0;n<t;n++)r+=String.fromCharCode(e[n]);return r}u[254]=u[254]=1,r.string2buf=function(e){var t,r,n,i,s,a=e.length,o=0;for(i=0;i<a;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),o+=r<128?1:r<2048?2:r<65536?3:4;for(t=new h.Buf8(o),i=s=0;s<o;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),r<128?t[s++]=r:(r<2048?t[s++]=192|r>>>6:(r<65536?t[s++]=224|r>>>12:(t[s++]=240|r>>>18,t[s++]=128|r>>>12&63),t[s++]=128|r>>>6&63),t[s++]=128|63&r);return t},r.buf2binstring=function(e){return l(e,e.length)},r.binstring2buf=function(e){for(var t=new h.Buf8(e.length),r=0,n=t.length;r<n;r++)t[r]=e.charCodeAt(r);return t},r.buf2string=function(e,t){var r,n,i,s,a=t||e.length,o=new Array(2*a);for(r=n=0;r<a;)if((i=e[r++])<128)o[n++]=i;else if(4<(s=u[i]))o[n++]=65533,r+=s-1;else{for(i&=2===s?31:3===s?15:7;1<s&&r<a;)i=i<<6|63&e[r++],s--;1<s?o[n++]=65533:i<65536?o[n++]=i:(i-=65536,o[n++]=55296|i>>10&1023,o[n++]=56320|1023&i)}return l(o,n)},r.utf8border=function(e,t){var r;for((t=t||e.length)>e.length&&(t=e.length),r=t-1;0<=r&&128==(192&e[r]);)r--;return r<0?t:0===r?t:r+u[e[r]]>t?r:t}},{"./common":41}],43:[function(e,t,r){"use strict";t.exports=function(e,t,r,n){for(var i=65535&e|0,s=e>>>16&65535|0,a=0;0!==r;){for(r-=a=2e3<r?2e3:r;s=s+(i=i+t[n++]|0)|0,--a;);i%=65521,s%=65521}return i|s<<16|0}},{}],44:[function(e,t,r){"use strict";t.exports={Z_NO_FLUSH:0,Z_PARTIAL_FLUSH:1,Z_SYNC_FLUSH:2,Z_FULL_FLUSH:3,Z_FINISH:4,Z_BLOCK:5,Z_TREES:6,Z_OK:0,Z_STREAM_END:1,Z_NEED_DICT:2,Z_ERRNO:-1,Z_STREAM_ERROR:-2,Z_DATA_ERROR:-3,Z_BUF_ERROR:-5,Z_NO_COMPRESSION:0,Z_BEST_SPEED:1,Z_BEST_COMPRESSION:9,Z_DEFAULT_COMPRESSION:-1,Z_FILTERED:1,Z_HUFFMAN_ONLY:2,Z_RLE:3,Z_FIXED:4,Z_DEFAULT_STRATEGY:0,Z_BINARY:0,Z_TEXT:1,Z_UNKNOWN:2,Z_DEFLATED:8}},{}],45:[function(e,t,r){"use strict";var o=function(){for(var e,t=[],r=0;r<256;r++){e=r;for(var n=0;n<8;n++)e=1&e?3988292384^e>>>1:e>>>1;t[r]=e}return t}();t.exports=function(e,t,r,n){var i=o,s=n+r;e^=-1;for(var a=n;a<s;a++)e=e>>>8^i[255&(e^t[a])];return-1^e}},{}],46:[function(e,t,r){"use strict";var h,c=e("../utils/common"),u=e("./trees"),d=e("./adler32"),p=e("./crc32"),n=e("./messages"),l=0,f=4,m=0,_=-2,g=-1,b=4,i=2,v=8,y=9,s=286,a=30,o=19,w=2*s+1,k=15,x=3,S=258,z=S+x+1,C=42,E=113,A=1,I=2,O=3,B=4;function R(e,t){return e.msg=n[t],t}function T(e){return(e<<1)-(4<e?9:0)}function D(e){for(var t=e.length;0<=--t;)e[t]=0}function F(e){var t=e.state,r=t.pending;r>e.avail_out&&(r=e.avail_out),0!==r&&(c.arraySet(e.output,t.pending_buf,t.pending_out,r,e.next_out),e.next_out+=r,t.pending_out+=r,e.total_out+=r,e.avail_out-=r,t.pending-=r,0===t.pending&&(t.pending_out=0))}function N(e,t){u._tr_flush_block(e,0<=e.block_start?e.block_start:-1,e.strstart-e.block_start,t),e.block_start=e.strstart,F(e.strm)}function U(e,t){e.pending_buf[e.pending++]=t}function P(e,t){e.pending_buf[e.pending++]=t>>>8&255,e.pending_buf[e.pending++]=255&t}function L(e,t){var r,n,i=e.max_chain_length,s=e.strstart,a=e.prev_length,o=e.nice_match,h=e.strstart>e.w_size-z?e.strstart-(e.w_size-z):0,u=e.window,l=e.w_mask,f=e.prev,c=e.strstart+S,d=u[s+a-1],p=u[s+a];e.prev_length>=e.good_match&&(i>>=2),o>e.lookahead&&(o=e.lookahead);do{if(u[(r=t)+a]===p&&u[r+a-1]===d&&u[r]===u[s]&&u[++r]===u[s+1]){s+=2,r++;do{}while(u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&s<c);if(n=S-(c-s),s=c-S,a<n){if(e.match_start=t,o<=(a=n))break;d=u[s+a-1],p=u[s+a]}}}while((t=f[t&l])>h&&0!=--i);return a<=e.lookahead?a:e.lookahead}function j(e){var t,r,n,i,s,a,o,h,u,l,f=e.w_size;do{if(i=e.window_size-e.lookahead-e.strstart,e.strstart>=f+(f-z)){for(c.arraySet(e.window,e.window,f,f,0),e.match_start-=f,e.strstart-=f,e.block_start-=f,t=r=e.hash_size;n=e.head[--t],e.head[t]=f<=n?n-f:0,--r;);for(t=r=f;n=e.prev[--t],e.prev[t]=f<=n?n-f:0,--r;);i+=f}if(0===e.strm.avail_in)break;if(a=e.strm,o=e.window,h=e.strstart+e.lookahead,u=i,l=void 0,l=a.avail_in,u<l&&(l=u),r=0===l?0:(a.avail_in-=l,c.arraySet(o,a.input,a.next_in,l,h),1===a.state.wrap?a.adler=d(a.adler,o,l,h):2===a.state.wrap&&(a.adler=p(a.adler,o,l,h)),a.next_in+=l,a.total_in+=l,l),e.lookahead+=r,e.lookahead+e.insert>=x)for(s=e.strstart-e.insert,e.ins_h=e.window[s],e.ins_h=(e.ins_h<<e.hash_shift^e.window[s+1])&e.hash_mask;e.insert&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[s+x-1])&e.hash_mask,e.prev[s&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=s,s++,e.insert--,!(e.lookahead+e.insert<x)););}while(e.lookahead<z&&0!==e.strm.avail_in)}function Z(e,t){for(var r,n;;){if(e.lookahead<z){if(j(e),e.lookahead<z&&t===l)return A;if(0===e.lookahead)break}if(r=0,e.lookahead>=x&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart),0!==r&&e.strstart-r<=e.w_size-z&&(e.match_length=L(e,r)),e.match_length>=x)if(n=u._tr_tally(e,e.strstart-e.match_start,e.match_length-x),e.lookahead-=e.match_length,e.match_length<=e.max_lazy_match&&e.lookahead>=x){for(e.match_length--;e.strstart++,e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart,0!=--e.match_length;);e.strstart++}else e.strstart+=e.match_length,e.match_length=0,e.ins_h=e.window[e.strstart],e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+1])&e.hash_mask;else n=u._tr_tally(e,0,e.window[e.strstart]),e.lookahead--,e.strstart++;if(n&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=e.strstart<x-1?e.strstart:x-1,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}function W(e,t){for(var r,n,i;;){if(e.lookahead<z){if(j(e),e.lookahead<z&&t===l)return A;if(0===e.lookahead)break}if(r=0,e.lookahead>=x&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart),e.prev_length=e.match_length,e.prev_match=e.match_start,e.match_length=x-1,0!==r&&e.prev_length<e.max_lazy_match&&e.strstart-r<=e.w_size-z&&(e.match_length=L(e,r),e.match_length<=5&&(1===e.strategy||e.match_length===x&&4096<e.strstart-e.match_start)&&(e.match_length=x-1)),e.prev_length>=x&&e.match_length<=e.prev_length){for(i=e.strstart+e.lookahead-x,n=u._tr_tally(e,e.strstart-1-e.prev_match,e.prev_length-x),e.lookahead-=e.prev_length-1,e.prev_length-=2;++e.strstart<=i&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart),0!=--e.prev_length;);if(e.match_available=0,e.match_length=x-1,e.strstart++,n&&(N(e,!1),0===e.strm.avail_out))return A}else if(e.match_available){if((n=u._tr_tally(e,0,e.window[e.strstart-1]))&&N(e,!1),e.strstart++,e.lookahead--,0===e.strm.avail_out)return A}else e.match_available=1,e.strstart++,e.lookahead--}return e.match_available&&(n=u._tr_tally(e,0,e.window[e.strstart-1]),e.match_available=0),e.insert=e.strstart<x-1?e.strstart:x-1,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}function M(e,t,r,n,i){this.good_length=e,this.max_lazy=t,this.nice_length=r,this.max_chain=n,this.func=i}function H(){this.strm=null,this.status=0,this.pending_buf=null,this.pending_buf_size=0,this.pending_out=0,this.pending=0,this.wrap=0,this.gzhead=null,this.gzindex=0,this.method=v,this.last_flush=-1,this.w_size=0,this.w_bits=0,this.w_mask=0,this.window=null,this.window_size=0,this.prev=null,this.head=null,this.ins_h=0,this.hash_size=0,this.hash_bits=0,this.hash_mask=0,this.hash_shift=0,this.block_start=0,this.match_length=0,this.prev_match=0,this.match_available=0,this.strstart=0,this.match_start=0,this.lookahead=0,this.prev_length=0,this.max_chain_length=0,this.max_lazy_match=0,this.level=0,this.strategy=0,this.good_match=0,this.nice_match=0,this.dyn_ltree=new c.Buf16(2*w),this.dyn_dtree=new c.Buf16(2*(2*a+1)),this.bl_tree=new c.Buf16(2*(2*o+1)),D(this.dyn_ltree),D(this.dyn_dtree),D(this.bl_tree),this.l_desc=null,this.d_desc=null,this.bl_desc=null,this.bl_count=new c.Buf16(k+1),this.heap=new c.Buf16(2*s+1),D(this.heap),this.heap_len=0,this.heap_max=0,this.depth=new c.Buf16(2*s+1),D(this.depth),this.l_buf=0,this.lit_bufsize=0,this.last_lit=0,this.d_buf=0,this.opt_len=0,this.static_len=0,this.matches=0,this.insert=0,this.bi_buf=0,this.bi_valid=0}function G(e){var t;return e&&e.state?(e.total_in=e.total_out=0,e.data_type=i,(t=e.state).pending=0,t.pending_out=0,t.wrap<0&&(t.wrap=-t.wrap),t.status=t.wrap?C:E,e.adler=2===t.wrap?0:1,t.last_flush=l,u._tr_init(t),m):R(e,_)}function K(e){var t=G(e);return t===m&&function(e){e.window_size=2*e.w_size,D(e.head),e.max_lazy_match=h[e.level].max_lazy,e.good_match=h[e.level].good_length,e.nice_match=h[e.level].nice_length,e.max_chain_length=h[e.level].max_chain,e.strstart=0,e.block_start=0,e.lookahead=0,e.insert=0,e.match_length=e.prev_length=x-1,e.match_available=0,e.ins_h=0}(e.state),t}function Y(e,t,r,n,i,s){if(!e)return _;var a=1;if(t===g&&(t=6),n<0?(a=0,n=-n):15<n&&(a=2,n-=16),i<1||y<i||r!==v||n<8||15<n||t<0||9<t||s<0||b<s)return R(e,_);8===n&&(n=9);var o=new H;return(e.state=o).strm=e,o.wrap=a,o.gzhead=null,o.w_bits=n,o.w_size=1<<o.w_bits,o.w_mask=o.w_size-1,o.hash_bits=i+7,o.hash_size=1<<o.hash_bits,o.hash_mask=o.hash_size-1,o.hash_shift=~~((o.hash_bits+x-1)/x),o.window=new c.Buf8(2*o.w_size),o.head=new c.Buf16(o.hash_size),o.prev=new c.Buf16(o.w_size),o.lit_bufsize=1<<i+6,o.pending_buf_size=4*o.lit_bufsize,o.pending_buf=new c.Buf8(o.pending_buf_size),o.d_buf=1*o.lit_bufsize,o.l_buf=3*o.lit_bufsize,o.level=t,o.strategy=s,o.method=r,K(e)}h=[new M(0,0,0,0,function(e,t){var r=65535;for(r>e.pending_buf_size-5&&(r=e.pending_buf_size-5);;){if(e.lookahead<=1){if(j(e),0===e.lookahead&&t===l)return A;if(0===e.lookahead)break}e.strstart+=e.lookahead,e.lookahead=0;var n=e.block_start+r;if((0===e.strstart||e.strstart>=n)&&(e.lookahead=e.strstart-n,e.strstart=n,N(e,!1),0===e.strm.avail_out))return A;if(e.strstart-e.block_start>=e.w_size-z&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=0,t===f?(N(e,!0),0===e.strm.avail_out?O:B):(e.strstart>e.block_start&&(N(e,!1),e.strm.avail_out),A)}),new M(4,4,8,4,Z),new M(4,5,16,8,Z),new M(4,6,32,32,Z),new M(4,4,16,16,W),new M(8,16,32,32,W),new M(8,16,128,128,W),new M(8,32,128,256,W),new M(32,128,258,1024,W),new M(32,258,258,4096,W)],r.deflateInit=function(e,t){return Y(e,t,v,15,8,0)},r.deflateInit2=Y,r.deflateReset=K,r.deflateResetKeep=G,r.deflateSetHeader=function(e,t){return e&&e.state?2!==e.state.wrap?_:(e.state.gzhead=t,m):_},r.deflate=function(e,t){var r,n,i,s;if(!e||!e.state||5<t||t<0)return e?R(e,_):_;if(n=e.state,!e.output||!e.input&&0!==e.avail_in||666===n.status&&t!==f)return R(e,0===e.avail_out?-5:_);if(n.strm=e,r=n.last_flush,n.last_flush=t,n.status===C)if(2===n.wrap)e.adler=0,U(n,31),U(n,139),U(n,8),n.gzhead?(U(n,(n.gzhead.text?1:0)+(n.gzhead.hcrc?2:0)+(n.gzhead.extra?4:0)+(n.gzhead.name?8:0)+(n.gzhead.comment?16:0)),U(n,255&n.gzhead.time),U(n,n.gzhead.time>>8&255),U(n,n.gzhead.time>>16&255),U(n,n.gzhead.time>>24&255),U(n,9===n.level?2:2<=n.strategy||n.level<2?4:0),U(n,255&n.gzhead.os),n.gzhead.extra&&n.gzhead.extra.length&&(U(n,255&n.gzhead.extra.length),U(n,n.gzhead.extra.length>>8&255)),n.gzhead.hcrc&&(e.adler=p(e.adler,n.pending_buf,n.pending,0)),n.gzindex=0,n.status=69):(U(n,0),U(n,0),U(n,0),U(n,0),U(n,0),U(n,9===n.level?2:2<=n.strategy||n.level<2?4:0),U(n,3),n.status=E);else{var a=v+(n.w_bits-8<<4)<<8;a|=(2<=n.strategy||n.level<2?0:n.level<6?1:6===n.level?2:3)<<6,0!==n.strstart&&(a|=32),a+=31-a%31,n.status=E,P(n,a),0!==n.strstart&&(P(n,e.adler>>>16),P(n,65535&e.adler)),e.adler=1}if(69===n.status)if(n.gzhead.extra){for(i=n.pending;n.gzindex<(65535&n.gzhead.extra.length)&&(n.pending!==n.pending_buf_size||(n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),F(e),i=n.pending,n.pending!==n.pending_buf_size));)U(n,255&n.gzhead.extra[n.gzindex]),n.gzindex++;n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),n.gzindex===n.gzhead.extra.length&&(n.gzindex=0,n.status=73)}else n.status=73;if(73===n.status)if(n.gzhead.name){i=n.pending;do{if(n.pending===n.pending_buf_size&&(n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),F(e),i=n.pending,n.pending===n.pending_buf_size)){s=1;break}s=n.gzindex<n.gzhead.name.length?255&n.gzhead.name.charCodeAt(n.gzindex++):0,U(n,s)}while(0!==s);n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),0===s&&(n.gzindex=0,n.status=91)}else n.status=91;if(91===n.status)if(n.gzhead.comment){i=n.pending;do{if(n.pending===n.pending_buf_size&&(n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),F(e),i=n.pending,n.pending===n.pending_buf_size)){s=1;break}s=n.gzindex<n.gzhead.comment.length?255&n.gzhead.comment.charCodeAt(n.gzindex++):0,U(n,s)}while(0!==s);n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),0===s&&(n.status=103)}else n.status=103;if(103===n.status&&(n.gzhead.hcrc?(n.pending+2>n.pending_buf_size&&F(e),n.pending+2<=n.pending_buf_size&&(U(n,255&e.adler),U(n,e.adler>>8&255),e.adler=0,n.status=E)):n.status=E),0!==n.pending){if(F(e),0===e.avail_out)return n.last_flush=-1,m}else if(0===e.avail_in&&T(t)<=T(r)&&t!==f)return R(e,-5);if(666===n.status&&0!==e.avail_in)return R(e,-5);if(0!==e.avail_in||0!==n.lookahead||t!==l&&666!==n.status){var o=2===n.strategy?function(e,t){for(var r;;){if(0===e.lookahead&&(j(e),0===e.lookahead)){if(t===l)return A;break}if(e.match_length=0,r=u._tr_tally(e,0,e.window[e.strstart]),e.lookahead--,e.strstart++,r&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=0,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}(n,t):3===n.strategy?function(e,t){for(var r,n,i,s,a=e.window;;){if(e.lookahead<=S){if(j(e),e.lookahead<=S&&t===l)return A;if(0===e.lookahead)break}if(e.match_length=0,e.lookahead>=x&&0<e.strstart&&(n=a[i=e.strstart-1])===a[++i]&&n===a[++i]&&n===a[++i]){s=e.strstart+S;do{}while(n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&i<s);e.match_length=S-(s-i),e.match_length>e.lookahead&&(e.match_length=e.lookahead)}if(e.match_length>=x?(r=u._tr_tally(e,1,e.match_length-x),e.lookahead-=e.match_length,e.strstart+=e.match_length,e.match_length=0):(r=u._tr_tally(e,0,e.window[e.strstart]),e.lookahead--,e.strstart++),r&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=0,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}(n,t):h[n.level].func(n,t);if(o!==O&&o!==B||(n.status=666),o===A||o===O)return 0===e.avail_out&&(n.last_flush=-1),m;if(o===I&&(1===t?u._tr_align(n):5!==t&&(u._tr_stored_block(n,0,0,!1),3===t&&(D(n.head),0===n.lookahead&&(n.strstart=0,n.block_start=0,n.insert=0))),F(e),0===e.avail_out))return n.last_flush=-1,m}return t!==f?m:n.wrap<=0?1:(2===n.wrap?(U(n,255&e.adler),U(n,e.adler>>8&255),U(n,e.adler>>16&255),U(n,e.adler>>24&255),U(n,255&e.total_in),U(n,e.total_in>>8&255),U(n,e.total_in>>16&255),U(n,e.total_in>>24&255)):(P(n,e.adler>>>16),P(n,65535&e.adler)),F(e),0<n.wrap&&(n.wrap=-n.wrap),0!==n.pending?m:1)},r.deflateEnd=function(e){var t;return e&&e.state?(t=e.state.status)!==C&&69!==t&&73!==t&&91!==t&&103!==t&&t!==E&&666!==t?R(e,_):(e.state=null,t===E?R(e,-3):m):_},r.deflateSetDictionary=function(e,t){var r,n,i,s,a,o,h,u,l=t.length;if(!e||!e.state)return _;if(2===(s=(r=e.state).wrap)||1===s&&r.status!==C||r.lookahead)return _;for(1===s&&(e.adler=d(e.adler,t,l,0)),r.wrap=0,l>=r.w_size&&(0===s&&(D(r.head),r.strstart=0,r.block_start=0,r.insert=0),u=new c.Buf8(r.w_size),c.arraySet(u,t,l-r.w_size,r.w_size,0),t=u,l=r.w_size),a=e.avail_in,o=e.next_in,h=e.input,e.avail_in=l,e.next_in=0,e.input=t,j(r);r.lookahead>=x;){for(n=r.strstart,i=r.lookahead-(x-1);r.ins_h=(r.ins_h<<r.hash_shift^r.window[n+x-1])&r.hash_mask,r.prev[n&r.w_mask]=r.head[r.ins_h],r.head[r.ins_h]=n,n++,--i;);r.strstart=n,r.lookahead=x-1,j(r)}return r.strstart+=r.lookahead,r.block_start=r.strstart,r.insert=r.lookahead,r.lookahead=0,r.match_length=r.prev_length=x-1,r.match_available=0,e.next_in=o,e.input=h,e.avail_in=a,r.wrap=s,m},r.deflateInfo="pako deflate (from Nodeca project)"},{"../utils/common":41,"./adler32":43,"./crc32":45,"./messages":51,"./trees":52}],47:[function(e,t,r){"use strict";t.exports=function(){this.text=0,this.time=0,this.xflags=0,this.os=0,this.extra=null,this.extra_len=0,this.name="",this.comment="",this.hcrc=0,this.done=!1}},{}],48:[function(e,t,r){"use strict";t.exports=function(e,t){var r,n,i,s,a,o,h,u,l,f,c,d,p,m,_,g,b,v,y,w,k,x,S,z,C;r=e.state,n=e.next_in,z=e.input,i=n+(e.avail_in-5),s=e.next_out,C=e.output,a=s-(t-e.avail_out),o=s+(e.avail_out-257),h=r.dmax,u=r.wsize,l=r.whave,f=r.wnext,c=r.window,d=r.hold,p=r.bits,m=r.lencode,_=r.distcode,g=(1<<r.lenbits)-1,b=(1<<r.distbits)-1;e:do{p<15&&(d+=z[n++]<<p,p+=8,d+=z[n++]<<p,p+=8),v=m[d&g];t:for(;;){if(d>>>=y=v>>>24,p-=y,0===(y=v>>>16&255))C[s++]=65535&v;else{if(!(16&y)){if(0==(64&y)){v=m[(65535&v)+(d&(1<<y)-1)];continue t}if(32&y){r.mode=12;break e}e.msg="invalid literal/length code",r.mode=30;break e}w=65535&v,(y&=15)&&(p<y&&(d+=z[n++]<<p,p+=8),w+=d&(1<<y)-1,d>>>=y,p-=y),p<15&&(d+=z[n++]<<p,p+=8,d+=z[n++]<<p,p+=8),v=_[d&b];r:for(;;){if(d>>>=y=v>>>24,p-=y,!(16&(y=v>>>16&255))){if(0==(64&y)){v=_[(65535&v)+(d&(1<<y)-1)];continue r}e.msg="invalid distance code",r.mode=30;break e}if(k=65535&v,p<(y&=15)&&(d+=z[n++]<<p,(p+=8)<y&&(d+=z[n++]<<p,p+=8)),h<(k+=d&(1<<y)-1)){e.msg="invalid distance too far back",r.mode=30;break e}if(d>>>=y,p-=y,(y=s-a)<k){if(l<(y=k-y)&&r.sane){e.msg="invalid distance too far back",r.mode=30;break e}if(S=c,(x=0)===f){if(x+=u-y,y<w){for(w-=y;C[s++]=c[x++],--y;);x=s-k,S=C}}else if(f<y){if(x+=u+f-y,(y-=f)<w){for(w-=y;C[s++]=c[x++],--y;);if(x=0,f<w){for(w-=y=f;C[s++]=c[x++],--y;);x=s-k,S=C}}}else if(x+=f-y,y<w){for(w-=y;C[s++]=c[x++],--y;);x=s-k,S=C}for(;2<w;)C[s++]=S[x++],C[s++]=S[x++],C[s++]=S[x++],w-=3;w&&(C[s++]=S[x++],1<w&&(C[s++]=S[x++]))}else{for(x=s-k;C[s++]=C[x++],C[s++]=C[x++],C[s++]=C[x++],2<(w-=3););w&&(C[s++]=C[x++],1<w&&(C[s++]=C[x++]))}break}}break}}while(n<i&&s<o);n-=w=p>>3,d&=(1<<(p-=w<<3))-1,e.next_in=n,e.next_out=s,e.avail_in=n<i?i-n+5:5-(n-i),e.avail_out=s<o?o-s+257:257-(s-o),r.hold=d,r.bits=p}},{}],49:[function(e,t,r){"use strict";var I=e("../utils/common"),O=e("./adler32"),B=e("./crc32"),R=e("./inffast"),T=e("./inftrees"),D=1,F=2,N=0,U=-2,P=1,n=852,i=592;function L(e){return(e>>>24&255)+(e>>>8&65280)+((65280&e)<<8)+((255&e)<<24)}function s(){this.mode=0,this.last=!1,this.wrap=0,this.havedict=!1,this.flags=0,this.dmax=0,this.check=0,this.total=0,this.head=null,this.wbits=0,this.wsize=0,this.whave=0,this.wnext=0,this.window=null,this.hold=0,this.bits=0,this.length=0,this.offset=0,this.extra=0,this.lencode=null,this.distcode=null,this.lenbits=0,this.distbits=0,this.ncode=0,this.nlen=0,this.ndist=0,this.have=0,this.next=null,this.lens=new I.Buf16(320),this.work=new I.Buf16(288),this.lendyn=null,this.distdyn=null,this.sane=0,this.back=0,this.was=0}function a(e){var t;return e&&e.state?(t=e.state,e.total_in=e.total_out=t.total=0,e.msg="",t.wrap&&(e.adler=1&t.wrap),t.mode=P,t.last=0,t.havedict=0,t.dmax=32768,t.head=null,t.hold=0,t.bits=0,t.lencode=t.lendyn=new I.Buf32(n),t.distcode=t.distdyn=new I.Buf32(i),t.sane=1,t.back=-1,N):U}function o(e){var t;return e&&e.state?((t=e.state).wsize=0,t.whave=0,t.wnext=0,a(e)):U}function h(e,t){var r,n;return e&&e.state?(n=e.state,t<0?(r=0,t=-t):(r=1+(t>>4),t<48&&(t&=15)),t&&(t<8||15<t)?U:(null!==n.window&&n.wbits!==t&&(n.window=null),n.wrap=r,n.wbits=t,o(e))):U}function u(e,t){var r,n;return e?(n=new s,(e.state=n).window=null,(r=h(e,t))!==N&&(e.state=null),r):U}var l,f,c=!0;function j(e){if(c){var t;for(l=new I.Buf32(512),f=new I.Buf32(32),t=0;t<144;)e.lens[t++]=8;for(;t<256;)e.lens[t++]=9;for(;t<280;)e.lens[t++]=7;for(;t<288;)e.lens[t++]=8;for(T(D,e.lens,0,288,l,0,e.work,{bits:9}),t=0;t<32;)e.lens[t++]=5;T(F,e.lens,0,32,f,0,e.work,{bits:5}),c=!1}e.lencode=l,e.lenbits=9,e.distcode=f,e.distbits=5}function Z(e,t,r,n){var i,s=e.state;return null===s.window&&(s.wsize=1<<s.wbits,s.wnext=0,s.whave=0,s.window=new I.Buf8(s.wsize)),n>=s.wsize?(I.arraySet(s.window,t,r-s.wsize,s.wsize,0),s.wnext=0,s.whave=s.wsize):(n<(i=s.wsize-s.wnext)&&(i=n),I.arraySet(s.window,t,r-n,i,s.wnext),(n-=i)?(I.arraySet(s.window,t,r-n,n,0),s.wnext=n,s.whave=s.wsize):(s.wnext+=i,s.wnext===s.wsize&&(s.wnext=0),s.whave<s.wsize&&(s.whave+=i))),0}r.inflateReset=o,r.inflateReset2=h,r.inflateResetKeep=a,r.inflateInit=function(e){return u(e,15)},r.inflateInit2=u,r.inflate=function(e,t){var r,n,i,s,a,o,h,u,l,f,c,d,p,m,_,g,b,v,y,w,k,x,S,z,C=0,E=new I.Buf8(4),A=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];if(!e||!e.state||!e.output||!e.input&&0!==e.avail_in)return U;12===(r=e.state).mode&&(r.mode=13),a=e.next_out,i=e.output,h=e.avail_out,s=e.next_in,n=e.input,o=e.avail_in,u=r.hold,l=r.bits,f=o,c=h,x=N;e:for(;;)switch(r.mode){case P:if(0===r.wrap){r.mode=13;break}for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(2&r.wrap&&35615===u){E[r.check=0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0),l=u=0,r.mode=2;break}if(r.flags=0,r.head&&(r.head.done=!1),!(1&r.wrap)||(((255&u)<<8)+(u>>8))%31){e.msg="incorrect header check",r.mode=30;break}if(8!=(15&u)){e.msg="unknown compression method",r.mode=30;break}if(l-=4,k=8+(15&(u>>>=4)),0===r.wbits)r.wbits=k;else if(k>r.wbits){e.msg="invalid window size",r.mode=30;break}r.dmax=1<<k,e.adler=r.check=1,r.mode=512&u?10:12,l=u=0;break;case 2:for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(r.flags=u,8!=(255&r.flags)){e.msg="unknown compression method",r.mode=30;break}if(57344&r.flags){e.msg="unknown header flags set",r.mode=30;break}r.head&&(r.head.text=u>>8&1),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0)),l=u=0,r.mode=3;case 3:for(;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.head&&(r.head.time=u),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,E[2]=u>>>16&255,E[3]=u>>>24&255,r.check=B(r.check,E,4,0)),l=u=0,r.mode=4;case 4:for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.head&&(r.head.xflags=255&u,r.head.os=u>>8),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0)),l=u=0,r.mode=5;case 5:if(1024&r.flags){for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.length=u,r.head&&(r.head.extra_len=u),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0)),l=u=0}else r.head&&(r.head.extra=null);r.mode=6;case 6:if(1024&r.flags&&(o<(d=r.length)&&(d=o),d&&(r.head&&(k=r.head.extra_len-r.length,r.head.extra||(r.head.extra=new Array(r.head.extra_len)),I.arraySet(r.head.extra,n,s,d,k)),512&r.flags&&(r.check=B(r.check,n,d,s)),o-=d,s+=d,r.length-=d),r.length))break e;r.length=0,r.mode=7;case 7:if(2048&r.flags){if(0===o)break e;for(d=0;k=n[s+d++],r.head&&k&&r.length<65536&&(r.head.name+=String.fromCharCode(k)),k&&d<o;);if(512&r.flags&&(r.check=B(r.check,n,d,s)),o-=d,s+=d,k)break e}else r.head&&(r.head.name=null);r.length=0,r.mode=8;case 8:if(4096&r.flags){if(0===o)break e;for(d=0;k=n[s+d++],r.head&&k&&r.length<65536&&(r.head.comment+=String.fromCharCode(k)),k&&d<o;);if(512&r.flags&&(r.check=B(r.check,n,d,s)),o-=d,s+=d,k)break e}else r.head&&(r.head.comment=null);r.mode=9;case 9:if(512&r.flags){for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(u!==(65535&r.check)){e.msg="header crc mismatch",r.mode=30;break}l=u=0}r.head&&(r.head.hcrc=r.flags>>9&1,r.head.done=!0),e.adler=r.check=0,r.mode=12;break;case 10:for(;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}e.adler=r.check=L(u),l=u=0,r.mode=11;case 11:if(0===r.havedict)return e.next_out=a,e.avail_out=h,e.next_in=s,e.avail_in=o,r.hold=u,r.bits=l,2;e.adler=r.check=1,r.mode=12;case 12:if(5===t||6===t)break e;case 13:if(r.last){u>>>=7&l,l-=7&l,r.mode=27;break}for(;l<3;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}switch(r.last=1&u,l-=1,3&(u>>>=1)){case 0:r.mode=14;break;case 1:if(j(r),r.mode=20,6!==t)break;u>>>=2,l-=2;break e;case 2:r.mode=17;break;case 3:e.msg="invalid block type",r.mode=30}u>>>=2,l-=2;break;case 14:for(u>>>=7&l,l-=7&l;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if((65535&u)!=(u>>>16^65535)){e.msg="invalid stored block lengths",r.mode=30;break}if(r.length=65535&u,l=u=0,r.mode=15,6===t)break e;case 15:r.mode=16;case 16:if(d=r.length){if(o<d&&(d=o),h<d&&(d=h),0===d)break e;I.arraySet(i,n,s,d,a),o-=d,s+=d,h-=d,a+=d,r.length-=d;break}r.mode=12;break;case 17:for(;l<14;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(r.nlen=257+(31&u),u>>>=5,l-=5,r.ndist=1+(31&u),u>>>=5,l-=5,r.ncode=4+(15&u),u>>>=4,l-=4,286<r.nlen||30<r.ndist){e.msg="too many length or distance symbols",r.mode=30;break}r.have=0,r.mode=18;case 18:for(;r.have<r.ncode;){for(;l<3;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.lens[A[r.have++]]=7&u,u>>>=3,l-=3}for(;r.have<19;)r.lens[A[r.have++]]=0;if(r.lencode=r.lendyn,r.lenbits=7,S={bits:r.lenbits},x=T(0,r.lens,0,19,r.lencode,0,r.work,S),r.lenbits=S.bits,x){e.msg="invalid code lengths set",r.mode=30;break}r.have=0,r.mode=19;case 19:for(;r.have<r.nlen+r.ndist;){for(;g=(C=r.lencode[u&(1<<r.lenbits)-1])>>>16&255,b=65535&C,!((_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(b<16)u>>>=_,l-=_,r.lens[r.have++]=b;else{if(16===b){for(z=_+2;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(u>>>=_,l-=_,0===r.have){e.msg="invalid bit length repeat",r.mode=30;break}k=r.lens[r.have-1],d=3+(3&u),u>>>=2,l-=2}else if(17===b){for(z=_+3;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}l-=_,k=0,d=3+(7&(u>>>=_)),u>>>=3,l-=3}else{for(z=_+7;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}l-=_,k=0,d=11+(127&(u>>>=_)),u>>>=7,l-=7}if(r.have+d>r.nlen+r.ndist){e.msg="invalid bit length repeat",r.mode=30;break}for(;d--;)r.lens[r.have++]=k}}if(30===r.mode)break;if(0===r.lens[256]){e.msg="invalid code -- missing end-of-block",r.mode=30;break}if(r.lenbits=9,S={bits:r.lenbits},x=T(D,r.lens,0,r.nlen,r.lencode,0,r.work,S),r.lenbits=S.bits,x){e.msg="invalid literal/lengths set",r.mode=30;break}if(r.distbits=6,r.distcode=r.distdyn,S={bits:r.distbits},x=T(F,r.lens,r.nlen,r.ndist,r.distcode,0,r.work,S),r.distbits=S.bits,x){e.msg="invalid distances set",r.mode=30;break}if(r.mode=20,6===t)break e;case 20:r.mode=21;case 21:if(6<=o&&258<=h){e.next_out=a,e.avail_out=h,e.next_in=s,e.avail_in=o,r.hold=u,r.bits=l,R(e,c),a=e.next_out,i=e.output,h=e.avail_out,s=e.next_in,n=e.input,o=e.avail_in,u=r.hold,l=r.bits,12===r.mode&&(r.back=-1);break}for(r.back=0;g=(C=r.lencode[u&(1<<r.lenbits)-1])>>>16&255,b=65535&C,!((_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(g&&0==(240&g)){for(v=_,y=g,w=b;g=(C=r.lencode[w+((u&(1<<v+y)-1)>>v)])>>>16&255,b=65535&C,!(v+(_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}u>>>=v,l-=v,r.back+=v}if(u>>>=_,l-=_,r.back+=_,r.length=b,0===g){r.mode=26;break}if(32&g){r.back=-1,r.mode=12;break}if(64&g){e.msg="invalid literal/length code",r.mode=30;break}r.extra=15&g,r.mode=22;case 22:if(r.extra){for(z=r.extra;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.length+=u&(1<<r.extra)-1,u>>>=r.extra,l-=r.extra,r.back+=r.extra}r.was=r.length,r.mode=23;case 23:for(;g=(C=r.distcode[u&(1<<r.distbits)-1])>>>16&255,b=65535&C,!((_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(0==(240&g)){for(v=_,y=g,w=b;g=(C=r.distcode[w+((u&(1<<v+y)-1)>>v)])>>>16&255,b=65535&C,!(v+(_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}u>>>=v,l-=v,r.back+=v}if(u>>>=_,l-=_,r.back+=_,64&g){e.msg="invalid distance code",r.mode=30;break}r.offset=b,r.extra=15&g,r.mode=24;case 24:if(r.extra){for(z=r.extra;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.offset+=u&(1<<r.extra)-1,u>>>=r.extra,l-=r.extra,r.back+=r.extra}if(r.offset>r.dmax){e.msg="invalid distance too far back",r.mode=30;break}r.mode=25;case 25:if(0===h)break e;if(d=c-h,r.offset>d){if((d=r.offset-d)>r.whave&&r.sane){e.msg="invalid distance too far back",r.mode=30;break}p=d>r.wnext?(d-=r.wnext,r.wsize-d):r.wnext-d,d>r.length&&(d=r.length),m=r.window}else m=i,p=a-r.offset,d=r.length;for(h<d&&(d=h),h-=d,r.length-=d;i[a++]=m[p++],--d;);0===r.length&&(r.mode=21);break;case 26:if(0===h)break e;i[a++]=r.length,h--,r.mode=21;break;case 27:if(r.wrap){for(;l<32;){if(0===o)break e;o--,u|=n[s++]<<l,l+=8}if(c-=h,e.total_out+=c,r.total+=c,c&&(e.adler=r.check=r.flags?B(r.check,i,c,a-c):O(r.check,i,c,a-c)),c=h,(r.flags?u:L(u))!==r.check){e.msg="incorrect data check",r.mode=30;break}l=u=0}r.mode=28;case 28:if(r.wrap&&r.flags){for(;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(u!==(4294967295&r.total)){e.msg="incorrect length check",r.mode=30;break}l=u=0}r.mode=29;case 29:x=1;break e;case 30:x=-3;break e;case 31:return-4;case 32:default:return U}return e.next_out=a,e.avail_out=h,e.next_in=s,e.avail_in=o,r.hold=u,r.bits=l,(r.wsize||c!==e.avail_out&&r.mode<30&&(r.mode<27||4!==t))&&Z(e,e.output,e.next_out,c-e.avail_out)?(r.mode=31,-4):(f-=e.avail_in,c-=e.avail_out,e.total_in+=f,e.total_out+=c,r.total+=c,r.wrap&&c&&(e.adler=r.check=r.flags?B(r.check,i,c,e.next_out-c):O(r.check,i,c,e.next_out-c)),e.data_type=r.bits+(r.last?64:0)+(12===r.mode?128:0)+(20===r.mode||15===r.mode?256:0),(0==f&&0===c||4===t)&&x===N&&(x=-5),x)},r.inflateEnd=function(e){if(!e||!e.state)return U;var t=e.state;return t.window&&(t.window=null),e.state=null,N},r.inflateGetHeader=function(e,t){var r;return e&&e.state?0==(2&(r=e.state).wrap)?U:((r.head=t).done=!1,N):U},r.inflateSetDictionary=function(e,t){var r,n=t.length;return e&&e.state?0!==(r=e.state).wrap&&11!==r.mode?U:11===r.mode&&O(1,t,n,0)!==r.check?-3:Z(e,t,n,n)?(r.mode=31,-4):(r.havedict=1,N):U},r.inflateInfo="pako inflate (from Nodeca project)"},{"../utils/common":41,"./adler32":43,"./crc32":45,"./inffast":48,"./inftrees":50}],50:[function(e,t,r){"use strict";var D=e("../utils/common"),F=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258,0,0],N=[16,16,16,16,16,16,16,16,17,17,17,17,18,18,18,18,19,19,19,19,20,20,20,20,21,21,21,21,16,72,78],U=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577,0,0],P=[16,16,16,16,17,17,18,18,19,19,20,20,21,21,22,22,23,23,24,24,25,25,26,26,27,27,28,28,29,29,64,64];t.exports=function(e,t,r,n,i,s,a,o){var h,u,l,f,c,d,p,m,_,g=o.bits,b=0,v=0,y=0,w=0,k=0,x=0,S=0,z=0,C=0,E=0,A=null,I=0,O=new D.Buf16(16),B=new D.Buf16(16),R=null,T=0;for(b=0;b<=15;b++)O[b]=0;for(v=0;v<n;v++)O[t[r+v]]++;for(k=g,w=15;1<=w&&0===O[w];w--);if(w<k&&(k=w),0===w)return i[s++]=20971520,i[s++]=20971520,o.bits=1,0;for(y=1;y<w&&0===O[y];y++);for(k<y&&(k=y),b=z=1;b<=15;b++)if(z<<=1,(z-=O[b])<0)return-1;if(0<z&&(0===e||1!==w))return-1;for(B[1]=0,b=1;b<15;b++)B[b+1]=B[b]+O[b];for(v=0;v<n;v++)0!==t[r+v]&&(a[B[t[r+v]]++]=v);if(d=0===e?(A=R=a,19):1===e?(A=F,I-=257,R=N,T-=257,256):(A=U,R=P,-1),b=y,c=s,S=v=E=0,l=-1,f=(C=1<<(x=k))-1,1===e&&852<C||2===e&&592<C)return 1;for(;;){for(p=b-S,_=a[v]<d?(m=0,a[v]):a[v]>d?(m=R[T+a[v]],A[I+a[v]]):(m=96,0),h=1<<b-S,y=u=1<<x;i[c+(E>>S)+(u-=h)]=p<<24|m<<16|_|0,0!==u;);for(h=1<<b-1;E&h;)h>>=1;if(0!==h?(E&=h-1,E+=h):E=0,v++,0==--O[b]){if(b===w)break;b=t[r+a[v]]}if(k<b&&(E&f)!==l){for(0===S&&(S=k),c+=y,z=1<<(x=b-S);x+S<w&&!((z-=O[x+S])<=0);)x++,z<<=1;if(C+=1<<x,1===e&&852<C||2===e&&592<C)return 1;i[l=E&f]=k<<24|x<<16|c-s|0}}return 0!==E&&(i[c+E]=b-S<<24|64<<16|0),o.bits=k,0}},{"../utils/common":41}],51:[function(e,t,r){"use strict";t.exports={2:"need dictionary",1:"stream end",0:"","-1":"file error","-2":"stream error","-3":"data error","-4":"insufficient memory","-5":"buffer error","-6":"incompatible version"}},{}],52:[function(e,t,r){"use strict";var i=e("../utils/common"),o=0,h=1;function n(e){for(var t=e.length;0<=--t;)e[t]=0}var s=0,a=29,u=256,l=u+1+a,f=30,c=19,_=2*l+1,g=15,d=16,p=7,m=256,b=16,v=17,y=18,w=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],k=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13],x=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,3,7],S=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],z=new Array(2*(l+2));n(z);var C=new Array(2*f);n(C);var E=new Array(512);n(E);var A=new Array(256);n(A);var I=new Array(a);n(I);var O,B,R,T=new Array(f);function D(e,t,r,n,i){this.static_tree=e,this.extra_bits=t,this.extra_base=r,this.elems=n,this.max_length=i,this.has_stree=e&&e.length}function F(e,t){this.dyn_tree=e,this.max_code=0,this.stat_desc=t}function N(e){return e<256?E[e]:E[256+(e>>>7)]}function U(e,t){e.pending_buf[e.pending++]=255&t,e.pending_buf[e.pending++]=t>>>8&255}function P(e,t,r){e.bi_valid>d-r?(e.bi_buf|=t<<e.bi_valid&65535,U(e,e.bi_buf),e.bi_buf=t>>d-e.bi_valid,e.bi_valid+=r-d):(e.bi_buf|=t<<e.bi_valid&65535,e.bi_valid+=r)}function L(e,t,r){P(e,r[2*t],r[2*t+1])}function j(e,t){for(var r=0;r|=1&e,e>>>=1,r<<=1,0<--t;);return r>>>1}function Z(e,t,r){var n,i,s=new Array(g+1),a=0;for(n=1;n<=g;n++)s[n]=a=a+r[n-1]<<1;for(i=0;i<=t;i++){var o=e[2*i+1];0!==o&&(e[2*i]=j(s[o]++,o))}}function W(e){var t;for(t=0;t<l;t++)e.dyn_ltree[2*t]=0;for(t=0;t<f;t++)e.dyn_dtree[2*t]=0;for(t=0;t<c;t++)e.bl_tree[2*t]=0;e.dyn_ltree[2*m]=1,e.opt_len=e.static_len=0,e.last_lit=e.matches=0}function M(e){8<e.bi_valid?U(e,e.bi_buf):0<e.bi_valid&&(e.pending_buf[e.pending++]=e.bi_buf),e.bi_buf=0,e.bi_valid=0}function H(e,t,r,n){var i=2*t,s=2*r;return e[i]<e[s]||e[i]===e[s]&&n[t]<=n[r]}function G(e,t,r){for(var n=e.heap[r],i=r<<1;i<=e.heap_len&&(i<e.heap_len&&H(t,e.heap[i+1],e.heap[i],e.depth)&&i++,!H(t,n,e.heap[i],e.depth));)e.heap[r]=e.heap[i],r=i,i<<=1;e.heap[r]=n}function K(e,t,r){var n,i,s,a,o=0;if(0!==e.last_lit)for(;n=e.pending_buf[e.d_buf+2*o]<<8|e.pending_buf[e.d_buf+2*o+1],i=e.pending_buf[e.l_buf+o],o++,0===n?L(e,i,t):(L(e,(s=A[i])+u+1,t),0!==(a=w[s])&&P(e,i-=I[s],a),L(e,s=N(--n),r),0!==(a=k[s])&&P(e,n-=T[s],a)),o<e.last_lit;);L(e,m,t)}function Y(e,t){var r,n,i,s=t.dyn_tree,a=t.stat_desc.static_tree,o=t.stat_desc.has_stree,h=t.stat_desc.elems,u=-1;for(e.heap_len=0,e.heap_max=_,r=0;r<h;r++)0!==s[2*r]?(e.heap[++e.heap_len]=u=r,e.depth[r]=0):s[2*r+1]=0;for(;e.heap_len<2;)s[2*(i=e.heap[++e.heap_len]=u<2?++u:0)]=1,e.depth[i]=0,e.opt_len--,o&&(e.static_len-=a[2*i+1]);for(t.max_code=u,r=e.heap_len>>1;1<=r;r--)G(e,s,r);for(i=h;r=e.heap[1],e.heap[1]=e.heap[e.heap_len--],G(e,s,1),n=e.heap[1],e.heap[--e.heap_max]=r,e.heap[--e.heap_max]=n,s[2*i]=s[2*r]+s[2*n],e.depth[i]=(e.depth[r]>=e.depth[n]?e.depth[r]:e.depth[n])+1,s[2*r+1]=s[2*n+1]=i,e.heap[1]=i++,G(e,s,1),2<=e.heap_len;);e.heap[--e.heap_max]=e.heap[1],function(e,t){var r,n,i,s,a,o,h=t.dyn_tree,u=t.max_code,l=t.stat_desc.static_tree,f=t.stat_desc.has_stree,c=t.stat_desc.extra_bits,d=t.stat_desc.extra_base,p=t.stat_desc.max_length,m=0;for(s=0;s<=g;s++)e.bl_count[s]=0;for(h[2*e.heap[e.heap_max]+1]=0,r=e.heap_max+1;r<_;r++)p<(s=h[2*h[2*(n=e.heap[r])+1]+1]+1)&&(s=p,m++),h[2*n+1]=s,u<n||(e.bl_count[s]++,a=0,d<=n&&(a=c[n-d]),o=h[2*n],e.opt_len+=o*(s+a),f&&(e.static_len+=o*(l[2*n+1]+a)));if(0!==m){do{for(s=p-1;0===e.bl_count[s];)s--;e.bl_count[s]--,e.bl_count[s+1]+=2,e.bl_count[p]--,m-=2}while(0<m);for(s=p;0!==s;s--)for(n=e.bl_count[s];0!==n;)u<(i=e.heap[--r])||(h[2*i+1]!==s&&(e.opt_len+=(s-h[2*i+1])*h[2*i],h[2*i+1]=s),n--)}}(e,t),Z(s,u,e.bl_count)}function X(e,t,r){var n,i,s=-1,a=t[1],o=0,h=7,u=4;for(0===a&&(h=138,u=3),t[2*(r+1)+1]=65535,n=0;n<=r;n++)i=a,a=t[2*(n+1)+1],++o<h&&i===a||(o<u?e.bl_tree[2*i]+=o:0!==i?(i!==s&&e.bl_tree[2*i]++,e.bl_tree[2*b]++):o<=10?e.bl_tree[2*v]++:e.bl_tree[2*y]++,s=i,u=(o=0)===a?(h=138,3):i===a?(h=6,3):(h=7,4))}function V(e,t,r){var n,i,s=-1,a=t[1],o=0,h=7,u=4;for(0===a&&(h=138,u=3),n=0;n<=r;n++)if(i=a,a=t[2*(n+1)+1],!(++o<h&&i===a)){if(o<u)for(;L(e,i,e.bl_tree),0!=--o;);else 0!==i?(i!==s&&(L(e,i,e.bl_tree),o--),L(e,b,e.bl_tree),P(e,o-3,2)):o<=10?(L(e,v,e.bl_tree),P(e,o-3,3)):(L(e,y,e.bl_tree),P(e,o-11,7));s=i,u=(o=0)===a?(h=138,3):i===a?(h=6,3):(h=7,4)}}n(T);var q=!1;function J(e,t,r,n){P(e,(s<<1)+(n?1:0),3),function(e,t,r,n){M(e),n&&(U(e,r),U(e,~r)),i.arraySet(e.pending_buf,e.window,t,r,e.pending),e.pending+=r}(e,t,r,!0)}r._tr_init=function(e){q||(function(){var e,t,r,n,i,s=new Array(g+1);for(n=r=0;n<a-1;n++)for(I[n]=r,e=0;e<1<<w[n];e++)A[r++]=n;for(A[r-1]=n,n=i=0;n<16;n++)for(T[n]=i,e=0;e<1<<k[n];e++)E[i++]=n;for(i>>=7;n<f;n++)for(T[n]=i<<7,e=0;e<1<<k[n]-7;e++)E[256+i++]=n;for(t=0;t<=g;t++)s[t]=0;for(e=0;e<=143;)z[2*e+1]=8,e++,s[8]++;for(;e<=255;)z[2*e+1]=9,e++,s[9]++;for(;e<=279;)z[2*e+1]=7,e++,s[7]++;for(;e<=287;)z[2*e+1]=8,e++,s[8]++;for(Z(z,l+1,s),e=0;e<f;e++)C[2*e+1]=5,C[2*e]=j(e,5);O=new D(z,w,u+1,l,g),B=new D(C,k,0,f,g),R=new D(new Array(0),x,0,c,p)}(),q=!0),e.l_desc=new F(e.dyn_ltree,O),e.d_desc=new F(e.dyn_dtree,B),e.bl_desc=new F(e.bl_tree,R),e.bi_buf=0,e.bi_valid=0,W(e)},r._tr_stored_block=J,r._tr_flush_block=function(e,t,r,n){var i,s,a=0;0<e.level?(2===e.strm.data_type&&(e.strm.data_type=function(e){var t,r=4093624447;for(t=0;t<=31;t++,r>>>=1)if(1&r&&0!==e.dyn_ltree[2*t])return o;if(0!==e.dyn_ltree[18]||0!==e.dyn_ltree[20]||0!==e.dyn_ltree[26])return h;for(t=32;t<u;t++)if(0!==e.dyn_ltree[2*t])return h;return o}(e)),Y(e,e.l_desc),Y(e,e.d_desc),a=function(e){var t;for(X(e,e.dyn_ltree,e.l_desc.max_code),X(e,e.dyn_dtree,e.d_desc.max_code),Y(e,e.bl_desc),t=c-1;3<=t&&0===e.bl_tree[2*S[t]+1];t--);return e.opt_len+=3*(t+1)+5+5+4,t}(e),i=e.opt_len+3+7>>>3,(s=e.static_len+3+7>>>3)<=i&&(i=s)):i=s=r+5,r+4<=i&&-1!==t?J(e,t,r,n):4===e.strategy||s===i?(P(e,2+(n?1:0),3),K(e,z,C)):(P(e,4+(n?1:0),3),function(e,t,r,n){var i;for(P(e,t-257,5),P(e,r-1,5),P(e,n-4,4),i=0;i<n;i++)P(e,e.bl_tree[2*S[i]+1],3);V(e,e.dyn_ltree,t-1),V(e,e.dyn_dtree,r-1)}(e,e.l_desc.max_code+1,e.d_desc.max_code+1,a+1),K(e,e.dyn_ltree,e.dyn_dtree)),W(e),n&&M(e)},r._tr_tally=function(e,t,r){return e.pending_buf[e.d_buf+2*e.last_lit]=t>>>8&255,e.pending_buf[e.d_buf+2*e.last_lit+1]=255&t,e.pending_buf[e.l_buf+e.last_lit]=255&r,e.last_lit++,0===t?e.dyn_ltree[2*r]++:(e.matches++,t--,e.dyn_ltree[2*(A[r]+u+1)]++,e.dyn_dtree[2*N(t)]++),e.last_lit===e.lit_bufsize-1},r._tr_align=function(e){P(e,2,3),L(e,m,z),function(e){16===e.bi_valid?(U(e,e.bi_buf),e.bi_buf=0,e.bi_valid=0):8<=e.bi_valid&&(e.pending_buf[e.pending++]=255&e.bi_buf,e.bi_buf>>=8,e.bi_valid-=8)}(e)}},{"../utils/common":41}],53:[function(e,t,r){"use strict";t.exports=function(){this.input=null,this.next_in=0,this.avail_in=0,this.total_in=0,this.output=null,this.next_out=0,this.avail_out=0,this.total_out=0,this.msg="",this.state=null,this.data_type=2,this.adler=0}},{}],54:[function(e,t,r){(function(e){!function(r,n){"use strict";if(!r.setImmediate){var i,s,t,a,o=1,h={},u=!1,l=r.document,e=Object.getPrototypeOf&&Object.getPrototypeOf(r);e=e&&e.setTimeout?e:r,i="[object process]"==={}.toString.call(r.process)?function(e){process.nextTick(function(){c(e)})}:function(){if(r.postMessage&&!r.importScripts){var e=!0,t=r.onmessage;return r.onmessage=function(){e=!1},r.postMessage("","*"),r.onmessage=t,e}}()?(a="setImmediate$"+Math.random()+"$",r.addEventListener?r.addEventListener("message",d,!1):r.attachEvent("onmessage",d),function(e){r.postMessage(a+e,"*")}):r.MessageChannel?((t=new MessageChannel).port1.onmessage=function(e){c(e.data)},function(e){t.port2.postMessage(e)}):l&&"onreadystatechange"in l.createElement("script")?(s=l.documentElement,function(e){var t=l.createElement("script");t.onreadystatechange=function(){c(e),t.onreadystatechange=null,s.removeChild(t),t=null},s.appendChild(t)}):function(e){setTimeout(c,0,e)},e.setImmediate=function(e){"function"!=typeof e&&(e=new Function(""+e));for(var t=new Array(arguments.length-1),r=0;r<t.length;r++)t[r]=arguments[r+1];var n={callback:e,args:t};return h[o]=n,i(o),o++},e.clearImmediate=f}function f(e){delete h[e]}function c(e){if(u)setTimeout(c,0,e);else{var t=h[e];if(t){u=!0;try{!function(e){var t=e.callback,r=e.args;switch(r.length){case 0:t();break;case 1:t(r[0]);break;case 2:t(r[0],r[1]);break;case 3:t(r[0],r[1],r[2]);break;default:t.apply(n,r)}}(t)}finally{f(e),u=!1}}}}function d(e){e.source===r&&"string"==typeof e.data&&0===e.data.indexOf(a)&&c(+e.data.slice(a.length))}}("undefined"==typeof self?void 0===e?this:e:self)}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{}]},{},[10])(10)});
return module.exports;})();

const VRMobileCore=(()=>{const module={exports:{}};
'use strict';
// Browser/Capacitor safe protocol core. Shared validation and DAG rules with Windows.
const HASH=/^[a-f0-9]{64}$/;
const GROUP=/^vg-[a-z0-9]{16,40}$/;
const DEVICE=/^vr-[a-z0-9]{16,64}$/;
const PACK=/^[a-f0-9]{24,64}$/;
const MAX_ENTRIES=60;
const MAX_FILE=128*1024*1024;
const MAX_PACK=160*1024*1024;
const MAX_MANIFEST=1024*1024;
function check(ok,message){if(!ok)throw Error(message);}
// V4.0.12: two exact root directories and every descendant stay OUT of
// formal-note synchronization, on both case-sensitive and Windows vaults.
// This never deletes/moves files or changes the user's version history.
function isSyncExcludedPath(p){
  if(typeof p!=='string')return false;
  const first=p.split('/')[0].toLowerCase();
  return first==='.obsidian'||first==='vaultrelay-transfer';
}
function safePath(p){
  check(typeof p==='string'&&p.length>0&&p.length<=1024,'Invalid file path');
  check(!/[\\:\u0000-\u001f]/.test(p)&&!p.startsWith('/')&&!p.endsWith('/'),'Unsafe file path');
  const seg=p.split('/');
  check(seg.every(s=>s&&s!=='.'&&s!=='..'&&s!=='__proto__'&&s!=='constructor'&&s!=='prototype'),'Unsafe path segments');
  check(!isSyncExcludedPath(p),'Excluded sync working directory');
  // Preserve older internal/unsafe exclusions; no new rules for ordinary folders.
  check(!['.trash','.vault-relay-merge-drafts','Vault Relay 合并草稿','VaultRelay'].includes(seg[0]),'Excluded private directory');
  return p;
}
function validId(id,re,label){check(typeof id==='string'&&re.test(id),`Invalid ${label}`);return id;}
function validHash(h,label){check(typeof h==='string'&&HASH.test(h),`Invalid ${label}`);return h;}
function manifest(raw,group){
  check(raw&&typeof raw==='object'&&!Array.isArray(raw),'Invalid manifest');
  check(raw.format==='vaultrelay.content.v2','Unsupported pack format');
  validId(raw.vaultGroupId,GROUP,'group');
  if(group)check(raw.vaultGroupId===group,'Wrong Vault group');
  validId(raw.originDeviceId,DEVICE,'origin device');
  if(raw.originName!==undefined)
    check(typeof raw.originName==='string'&&raw.originName.length<=80 &&
      !/[\u0000-\u001f]/.test(raw.originName),'Invalid origin name');
  validId(raw.packId,PACK,'pack ID');
  check(Number.isSafeInteger(raw.originSeq)&&raw.originSeq>0,'Invalid sequence');
  check(typeof raw.createdAtUtc==='string'&&!Number.isNaN(Date.parse(raw.createdAtUtc)),'Invalid pack time');
  check(Array.isArray(raw.entries)&&raw.entries.length>0&&raw.entries.length<=MAX_ENTRIES,'Invalid entry count');
  const paths=new Set(),versions=new Set(),payloads=new Set();
  let total=0;
  for(let i=0;i<raw.entries.length;i++){
    const e=raw.entries[i];
    check(e&&typeof e==='object'&&!Array.isArray(e),'Invalid version entry');
    safePath(e.path);check(!paths.has(e.path),'Duplicate file path');paths.add(e.path);
    check(typeof e.versionId==='string'&&e.versionId===`${raw.packId}:${String(i+1).padStart(4,'0')}`,'Invalid version ID');
    check(!versions.has(e.versionId),'Duplicate version ID');versions.add(e.versionId);
    check(e.parentVersionId===null||(typeof e.parentVersionId==='string'&&/^[a-f0-9]{24,64}:[0-9]{4}$/.test(e.parentVersionId)),'Invalid parent version');
    check(e.parentVersionId!==e.versionId,'Cyclic self-parent');
    if(e.mergeParents!==undefined){
      check(Array.isArray(e.mergeParents)&&e.mergeParents.length<=24,'Invalid merge parents');
      check(new Set(e.mergeParents).size===e.mergeParents.length,'Duplicate merge parents');
      for(const id of e.mergeParents)
        check(typeof id==='string'&&/^[a-f0-9]{24,64}:[0-9]{4}$/.test(id)&&
          id!==e.versionId&&id!==e.parentVersionId,'Invalid merge parent ID');
    }
    check(e.op==='upsert'||e.op==='delete','Invalid operation');
    check(typeof e.eventAtUtc==='string'&&!Number.isNaN(Date.parse(e.eventAtUtc)),'Invalid event time');
    check(e.baseSha256===null||(typeof e.baseSha256==='string'&&HASH.test(e.baseSha256)),'Invalid base hash');
    if(e.op==='upsert'){
      validHash(e.sha256,'entry hash');
      check(Number.isSafeInteger(e.size)&&e.size>=0&&e.size<=MAX_FILE,'Oversized file');
      check(e.payload===`files/${String(i+1).padStart(4,'0')}.bin`,'Unexpected ZIP payload');
      check(!payloads.has(e.payload),'Duplicate ZIP payload');payloads.add(e.payload);
      total+=e.size;
    }else{
      check(e.sha256===null&&e.size===0&&e.payload===null,'Invalid deletion tombstone');
    }
  }
  check(total<=MAX_PACK,'Uncompressed package too large');
  return raw;
}
function parentsOf(v){
  return [v.parentVersionId,...(Array.isArray(v.mergeParents)?v.mergeParents:[])].filter(Boolean);
}
function heads(list){
  const unique=new Map(),warnings=[];
  for(const v of list){
    const old=unique.get(v.versionId);
    if(old){
      if(old.sha256!==v.sha256||old.op!==v.op||old.parentVersionId!==v.parentVersionId||
         JSON.stringify(old.mergeParents||[])!==JSON.stringify(v.mergeParents||[]))
        warnings.push('Duplicate version ID with different content');
    }else unique.set(v.versionId,v);
  }
  const ids=new Set(unique.keys()),consumed=new Set();
  for(const v of unique.values())for(const id of parentsOf(v))if(ids.has(id))consumed.add(id);
  const live=[...unique.values()].filter(v=>!consumed.has(v.versionId));
  const variants=new Set(live.map(v=>v.op+':'+(v.sha256||'')));
  return {head:live.length&&variants.size===1?live.slice().sort((a,b)=>a.versionId.localeCompare(b.versionId))[0]:null,
    fork:variants.size>1||(list.length>0&&live.length===0),heads:live,warnings,
    missingParents:[...new Set([...unique.values()].flatMap(v=>parentsOf(v)).filter(x=>!ids.has(x)))],
    unresolved:live.length>1};
}
function isAncestor(versionId,head,versions){
  if(!versionId||!head)return false;
  const byId=new Map(versions.map(v=>[v.versionId,v]));
  const todo=[head.versionId],seen=new Set();
  while(todo.length){
    const cur=todo.pop();
    if(cur===versionId)return true;
    if(seen.has(cur))continue;
    seen.add(cur);
    const v=byId.get(cur);
    if(v)todo.push(...parentsOf(v));
  }
  return false;
}

function bytes(v){return v instanceof Uint8Array?v:new Uint8Array(v instanceof ArrayBuffer?v:v.buffer,v.byteOffset||0,v.byteLength);}
function hex(v){return [...bytes(v)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function uid(){
  if(!globalThis.crypto||typeof globalThis.crypto.getRandomValues!=='function')throw Error('当前系统缺少安全随机数接口');
  const r=new Uint8Array(16);globalThis.crypto.getRandomValues(r);return hex(r);
}
async function sha(v){
  if(!globalThis.crypto?.subtle)throw Error('当前 Obsidian 环境无法进行 SHA-256 校验');
  const x=bytes(v),copy=new Uint8Array(x.length);copy.set(x);
  return hex(await globalThis.crypto.subtle.digest('SHA-256',copy.buffer));
}
async function equivalentSha(v,path,limit=16*1024*1024){
  const x=bytes(v);
  if(!/\.md$/i.test(path)||x.byteLength>limit)return null;
  try{
    const bom=x.length>=3&&x[0]===239&&x[1]===187&&x[2]===191;
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bom?x.subarray(3):x);
    if(text.includes('\0'))return null;
    return await sha(new TextEncoder().encode(text.replace(/\r\n/g,'\n')));
  }catch(_){return null;}
}
function stamp(){return new Date().toISOString().replace(/[-:]/g,'').replace('.','');}
function obj(){return Object.create(null);}
module.exports={isSyncExcludedPath,safePath,validId,manifest,heads,isAncestor,parentsOf,
  HASH,GROUP,DEVICE,PACK,MAX_ENTRIES,MAX_FILE,MAX_PACK,MAX_MANIFEST,
  bytes,hex,uid,sha,equivalentSha,stamp,obj};

return module.exports;})();
const VRMobileEngine=(()=>{const module={exports:{}};
'use strict';
const M=VRMobileCore;
const TRANSFER='VaultRelay-Transfer';
const LIMIT_ZIP=64*1024*1024;
const LIMIT_UNCOMPRESSED=100*1024*1024;
const PACKAGE_NAME=/^\d{8}T\d{9}Z__vr-[a-z0-9]{16,64}__\d{6,12}__[a-f0-9]{8}\.zip$/;
function utc(){return new Date().toISOString();}
function unique(items){return [...new Set(items)];}
function bytesAB(v){const b=M.bytes(v);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}
function planSignature(plan){return JSON.stringify(plan.items.map(x=>[x.path,x.status,x.localHash||null,x.version?.versionId||null,x.version?.sha256||null,x.version?.packSha256||null,x.heads||null]));}
class MobileEngine{
  constructor({vault,adapter,state,zip,persist}){
    this.vault=vault;this.adapter=adapter;this.state=state;this.zip=zip;
    this.persist=persist||(async()=>{});
    M.validId(state.groupId,M.GROUP,'group');
    M.validId(state.deviceId,M.DEVICE,'device');
    state.known||={};state.acks||={};state.publishedAckIds||={};
    state.receivedAcks||={};state.devices||={};state.errors||=[];
    state.localDraftPacks ||= {}; // V4.0.14 local-only withdrawal provenance.
    state.schedule||={};
    this.busy=false;
  }
  paths(){
    return {root:TRANSFER,inbox:`${TRANSFER}/inbox/content`,
      outbox:`${TRANSFER}/outbox/content`,
      ack:`${TRANSFER}/outbox/ack/${this.state.deviceId}`,
      info:`${TRANSFER}/outbox/info/${this.state.deviceId}`,
      backup:`${TRANSFER}/backups`};
  }
  async mk(dir){
    const seg=dir.split('/');let cur='';
    for(const part of seg){cur=cur?cur+'/'+part:part;
      if(!await this.adapter.exists(cur))await this.adapter.mkdir(cur);
    }
  }
  async mkVault(dir){
    const seg=dir.split('/');let cur='';
    for(const part of seg){
      cur=cur?cur+'/'+part:part;
      if(!await this.adapter.exists(cur))await this.vault.createFolder(cur);
    }
  }
  async initFolders(){
    const p=this.paths();
    for(const path of [p.inbox,p.outbox,p.ack,p.info,p.backup])await this.mk(path);
    return p;
  }
  async list(dir){
    if(!await this.adapter.exists(dir))return [];
    return (await this.adapter.list(dir)).files.sort();
  }
  async checkedPack(raw,{filename}={}){
    const buf=M.bytes(raw);
    if(!buf.length||buf.length>LIMIT_ZIP)throw Error('ZIP 为空或超过 移动端 64 MiB 安全读取限制');
    const z=await this.zip.loadAsync(buf,{checkCRC32:false});
    const meta=z.file('manifest.json');
    if(!meta||meta._data?.uncompressedSize>M.MAX_MANIFEST)throw Error('无效的 ZIP manifest.json');
    const manifest=M.manifest(JSON.parse(await meta.async('string')),this.state.groupId);
    if(filename){
      if(!PACKAGE_NAME.test(filename))throw Error('ZIP 文件名不是 Vault Relay 正式内容包');
      const parts=filename.match(/__([^_]+)__(\d+)__([a-f0-9]{8})\.zip$/);
      if(!parts||parts[1]!==manifest.originDeviceId||Number(parts[2])!==manifest.originSeq||
         parts[3]!==manifest.packId.slice(0,8))throw Error('文件名与包内的设备、序号或 Pack ID 不一致');
    }
    const allowed=new Set(['manifest.json','files/']);
    let total=0;
    for(const e of manifest.entries)if(e.op==='upsert'){
      allowed.add(e.payload);
      const entry=z.file(e.payload);
      if(!entry||entry._data?.uncompressedSize!==e.size)throw Error('ZIP 文件大小与 manifest 不一致');
      total+=e.size;
    }
    if(total>LIMIT_UNCOMPRESSED)throw Error('ZIP 内容超过 移动端 100 MiB 内存保护限制');
    if(Object.keys(z.files).some(k=>!allowed.has(k)))throw Error('ZIP 有意料之外的内部路径');
    for(const e of manifest.entries)if(e.op==='upsert'){
      const payload=await z.file(e.payload).async('uint8array');
      if(payload.length!==e.size||await M.sha(payload)!==e.sha256)
        throw Error('ZIP 内文件的 SHA-256 校验失败：'+e.path);
    }
    return {manifest,zip:z,sha256:await M.sha(buf),bytes:buf.length};
  }
  async importFiles(files){
    await this.initFolders();
    const done=[],errors=[];
    for(const f of files){
      try{
        if(!PACKAGE_NAME.test(f.name))throw Error('不是 Vault Relay 正式 ZIP 文件名');
        if(f.size>LIMIT_ZIP)throw Error('文件超过 移动端 64 MiB 安全限制');
        const raw=M.bytes(await f.arrayBuffer());
        const pack=await this.checkedPack(raw,{filename:f.name});
        const target=this.paths().inbox+'/'+f.name;
        if(await this.adapter.exists(target)){
          const old=await this.adapter.readBinary(target);
          if(await M.sha(old)!==pack.sha256)throw Error('已有同名文件，但内容不同：拒绝覆盖');
          done.push({name:f.name,already:true});continue;
        }
        await this.adapter.writeBinary(target,bytesAB(raw));
        const copied=await this.checkedPack(await this.adapter.readBinary(target),{filename:f.name});
        if(copied.sha256!==pack.sha256)throw Error('导入后校验失败，请不要确认下载');
        done.push({name:f.name,already:false});
      }catch(err){errors.push({name:f.name||'未命名',error:String(err.message||err)});}
    }
    await this.persist();return {done,errors};
  }
  async scanCatalog(){
    const c={packages:[],byPath:M.obj(),warnings:[],count:0};
    for(const dir of [this.paths().inbox,this.paths().outbox]){
      for(const file of await this.list(dir)){
        const name=file.slice(dir.length+1);
        if(!name.endsWith('.zip'))continue;
        try{
          if(!PACKAGE_NAME.test(name))throw Error('不支持的同步 ZIP 文件名');
          const stat=await this.adapter.stat(file);
          if(stat?.size>LIMIT_ZIP)throw Error('ZIP 过大（移动端限制 64 MiB）');
          const rec=await this.checkedPack(await this.adapter.readBinary(file),{filename:name});
          c.packages.push({name,path:file,packId:rec.manifest.packId,
            originDeviceId:rec.manifest.originDeviceId,originSeq:rec.manifest.originSeq,
            createdAtUtc:rec.manifest.createdAtUtc,sha256:rec.sha256});
          c.count++;
          for(const e of rec.manifest.entries){
            if(M.isSyncExcludedPath(e.path))continue;
            (c.byPath[e.path] ||= []).push({...e,
            packId:rec.manifest.packId,packName:name,packPath:file,packSha256:rec.sha256,
            originDeviceId:rec.manifest.originDeviceId,
            originName:rec.manifest.originName||rec.manifest.originDeviceId,
            createdAtUtc:rec.manifest.createdAtUtc});
          }
        }catch(err){c.warnings.push({file,error:String(err.message||err)});}
      }
    }
    return c;
  }
  async scanVault(){
    const map=M.obj(),errors=[];
    for(const f of this.vault.getFiles()){
      if(!f||M.isSyncExcludedPath(f.path))continue;
      try{M.safePath(f.path);}catch(_){continue;}
      if(f.stat?.size>M.MAX_FILE){errors.push({path:f.path,error:'文件超过 128 MiB'});continue;}
      try{
        const raw=await this.vault.readBinary(f);
        map[f.path]={sha256:await M.sha(raw),size:M.bytes(raw).length,mtime:f.stat?.mtime||Date.now()};
      }catch(err){errors.push({path:f.path,error:String(err.message||err)});}
    }
    return {files:map,errors};
  }
  async payload(version){
    const pack=await this.checkedPack(await this.adapter.readBinary(version.packPath));
    if(pack.sha256!==version.packSha256)throw Error('内容包在预览之后已改变');
    const e=pack.manifest.entries.find(x=>x.versionId===version.versionId);
    if(!e||e.sha256!==version.sha256||e.path!==version.path||e.op!=='upsert')throw Error('历史内容包版本不一致');
    const raw=await pack.zip.file(e.payload).async('uint8array');
    if(await M.sha(raw)!==e.sha256)throw Error('历史内容损坏');
    return raw;
  }
  async latestPlan(){
    const catalog=await this.scanCatalog();
    const {files:local,errors}=await this.scanVault();
    const items=[];
    for(const [path,versions] of Object.entries(catalog.byPath).sort((a,b)=>a[0].localeCompare(b[0]))){
      if(M.isSyncExcludedPath(path))continue;
      const h=M.heads(versions);
      if(h.warnings.length)catalog.warnings.push(...h.warnings.map(error=>({file:path,error})));
      let head=h.head,equalHeads=false;
      if(h.heads.length>1&&!h.warnings.length&&!h.missingParents.length&&
         h.heads.every(v=>v.op==='upsert')){
        const sorted=[...h.heads].sort((a,b)=>a.versionId.localeCompare(b.versionId));
        if(sorted.every(v=>v.sha256===sorted[0].sha256)){head=sorted[0];equalHeads=true;}
        else if(/\.md$/i.test(path)&&sorted.every(v=>v.size<=16*1024*1024)){
          try{
            const hashes=await Promise.all(sorted.map(async v=>M.equivalentSha(await this.payload(v),path)));
            if(hashes[0]&&hashes.every(x=>x===hashes[0])){head=sorted[0];equalHeads=true;}
          }catch(_){}
        }
      }
      if((h.fork&&!equalHeads)||h.warnings.length||h.missingParents.length){
        items.push({path,status:'fork',heads:h.heads.map(x=>x.versionId),
          localHash:local[path]?.sha256||null,versions:h.heads,missingParents:h.missingParents});
        continue;
      }
      head ||=h.head;
      if(!head)continue;
      const here=local[path]?.sha256||null,known=this.state.known[path];
      let status='same',equalHash=null;
      if(errors.some(e=>e.path===path))status='local-error';
      else if(head.op==='delete'){
        const recovery=this.state.authorizedRestores?.[path];
        const keep=this.state.deletionDecisions?.[path];
        status=!here?'absent':
          (recovery?.parentVersionId===head.versionId &&
           recovery?.sha256===here && known?.op==='delete' &&
           known.versionId===head.versionId)?'local-update':
          (keep?.versionId===head.versionId && keep?.localSha256===here &&
           known?.op==='upsert' && known.versionId===head.parentVersionId)?'delete-kept':
          (known?.op==='upsert'&&known.sha256===here&&
           known.versionId===head.parentVersionId)?'delete-review':'conflict';
      }
      else if(!here){
        status=known?.op==='upsert'
          ? (known.versionId===head.versionId?'local-deleted':'conflict')
          : 'create';
      }
      else if(here===head.sha256)status='same';
      else {
        if(/\.md$/i.test(path)&&head.size<=16*1024*1024&&local[path]?.size<=16*1024*1024){
          try{
            const entry=this.vault.getAbstractFileByPath(path);
            if(entry){
              const localEq=await M.equivalentSha(await this.vault.readBinary(entry),path);
              const remoteEq=await M.equivalentSha(await this.payload(head),path);
              if(localEq&&localEq===remoteEq){status='equivalent';equalHash=remoteEq;}
            }
          }catch(_){}
        }
        if(status!=='equivalent'){
          const knownSame=known?.sha256===here||
            (known?.equivalentSha&&
              await M.equivalentSha(await this.vault.readBinary(this.vault.getAbstractFileByPath(path)),path)===known.equivalentSha);
          const currentHead=known?.versionId===head.versionId||
            (equalHeads&&h.heads.some(x=>x.versionId===known?.versionId));
          status=knownSame&&M.isAncestor(known?.versionId,head,versions)&&!currentHead?'safe-update':
            currentHead?'local-update':'conflict';
        }
      }
      items.push({path,status,localHash:here,version:head,
        equivalentHash:equalHash,equivalentHeadIds:equalHeads?h.heads.map(x=>x.versionId):null});
    }
    const counts=Object.fromEntries(['create','safe-update','same','equivalent','local-update','local-deleted',
      'delete-review','delete-kept','conflict','fork','absent','local-error'].map(k=>[k,items.filter(x=>x.status===k).length]));
    counts.byteSame=counts.same;
    counts.same+=counts.equivalent;
    return {catalog,local,items,errors,counts,signature:planSignature({items})};
  }
  async ack(v,outcome,localHash,equalHash){
    if(v.originDeviceId===this.state.deviceId)return;
    const key=this.state.groupId+'|'+v.originDeviceId+'|'+v.versionId+'|'+(v.sha256||'delete');
    const ackId=await M.sha(new TextEncoder().encode(key+'|'+outcome+'|'+this.state.deviceId));
    this.state.acks[ackId]={format:'vaultrelay.ack.v2',ackId,vaultGroupId:this.state.groupId,
      fromDeviceId:this.state.deviceId,toDeviceId:v.originDeviceId,packId:v.packId,
      versionId:v.versionId,path:v.path,contentSha256:v.sha256,outcome,
      equivalentSha256:outcome==='equivalent'?equalHash:null,
      localOriginalSha256:outcome==='equivalent'?localHash:null,createdAtUtc:utc()};
  }
  async flushAck(){
    await this.initFolders();
    const queued=Object.values(this.state.acks).filter(x=>!this.state.publishedAckIds[x.ackId]);
    let written=0;
    for(let i=0;i<queued.length;i+=80){
      const batch=queued.slice(i,i+80);
      const batchId=await M.sha(new TextEncoder().encode(this.state.deviceId+'|'+batch.map(x=>x.ackId).sort().join('|')));
      const dir=this.paths().ack,filename=`ackbatch-${batchId}.json`;
      const target=dir+'/'+filename;
      const doc={format:'vaultrelay.ack-batch.v2',vaultGroupId:this.state.groupId,
        originDeviceId:this.state.deviceId,batchId,createdAtUtc:utc(),entries:batch};
      const bytes=new TextEncoder().encode(JSON.stringify(doc));
      if(await this.adapter.exists(target)){
        if(await M.sha(await this.adapter.readBinary(target))!==await M.sha(bytes))
          throw Error('ACK 同名文件已存在且内容不同，停止覆盖');
      }else await this.adapter.writeBinary(target,bytesAB(bytes));
      for(const a of batch)this.state.publishedAckIds[a.ackId]=batchId;
      written++;
    }
    await this.persist();return written;
  }
  async publishInfo(){
    await this.initFolders();
    const entries=Object.entries(this.state.known).sort((a,b)=>a[0].localeCompare(b[0]));
    const versionsHash=await M.sha(new TextEncoder().encode(JSON.stringify(
      entries.map(([p,v])=>[p,v.sha256,v.versionId,v.op]))));
    const seq=(this.state.messageSeq||0)+1;
    const infoId=`${this.state.deviceId}-${String(seq).padStart(8,'0')}-${M.uid().slice(0,8)}`;
    const body={format:'vaultrelay.info.v2',vaultGroupId:this.state.groupId,
      originDeviceId:this.state.deviceId,infoId,
      deviceName:this.state.displayName||this.state.deviceId,createdAtUtc:utc(),
      lastContentAt:this.state.lastOperation?.at||0,
      knownVersionCount:entries.length,knownVersionsSha256:versionsHash,
      pendingAckCount:Object.keys(this.state.acks).length};
    const name=this.paths().info+'/'+infoId+'.json';
    if(await this.adapter.exists(name))throw Error('Info 同名文件重复，拒绝覆盖');
    await this.adapter.writeBinary(name,bytesAB(new TextEncoder().encode(JSON.stringify(body))));
    this.state.messageSeq=seq;await this.persist();return name;
  }
  async safeApply(preview,{allowDeletes=false,deleteOnly=false}={}){
    if(this.busy)throw Error('已有同步操作正在执行');
    this.busy=true;
    try{
      const fresh=await this.latestPlan();
      if(fresh.catalog.warnings.length||fresh.errors.length)throw Error('存在异常或不可读文件，已阻止下载');
      if(fresh.signature!==preview.signature)throw Error('数据已变化，请重新预览后操作');
      const changed=[],errors=[];
      let created=0,updated=0,equivalent=0,deleted=0,acknowledgedDeletes=0;
      for(const item of fresh.items){
        const v=item.version;
        if(M.isSyncExcludedPath(item.path)||M.isSyncExcludedPath(v?.path))continue;
        if(!v)continue;
        if(deleteOnly&&!['delete-review','absent'].includes(item.status))continue;
        try{
          if((item.status==='delete-review'||item.status==='absent') && v.op==='delete'){
            if(item.status==='delete-review'){
              if(!allowDeletes)continue; // Physical deletion ALWAYS requires opt-in.
              const original=this.vault.getAbstractFileByPath(item.path);
              if(!original||original.children)throw Error('删除前目标已变化，停止');
              const originalBytes=M.bytes(await this.vault.readBinary(original));
              if(await M.sha(originalBytes)!==item.localHash)
                throw Error('删除前 SHA 不一致，停止');
              // Save verified private backup before removing a formal note.
              const backup=`${this.paths().backup}/${M.stamp()}-${M.uid()}/${item.path}`;
              await this.mk(backup.split('/').slice(0,-1).join('/'));
              if(await this.adapter.exists(backup))throw Error('安全备份路径已存在');
              await this.adapter.writeBinary(backup,bytesAB(originalBytes));
              if(await M.sha(await this.adapter.readBinary(backup))!==item.localHash)
                throw Error('安全备份 SHA 检查失败');
              const still=this.vault.getAbstractFileByPath(item.path);
              if(!still||await M.sha(await this.vault.readBinary(still))!==item.localHash)
                throw Error('删除前本机文件发生变化');
              if(typeof this.vault.delete==='function')
                await this.vault.delete(still); // Keep Obsidian metadata/cache in sync.
              else await this.adapter.remove(item.path); // Offline adapter harness.
              if(await this.adapter.exists(item.path))throw Error('删除后文件仍存在');
              deleted++;
              changed.push({path:item.path,action:'delete',backup});
            }else{
              // A device that never received the old file can accept its
              // deletion head without restoring a now-obsolete payload.
              if(await this.adapter.exists(item.path))
                throw Error('文件新出现，删除状态待重新核对');
              acknowledgedDeletes++;
            }
            this.state.known[item.path]={op:'delete',sha256:null,
              versionId:v.versionId,at:v.eventAtUtc};
            await this.ack(v,item.status==='absent'?'same':'applied',item.localHash,null);
            await this.persist();
            continue;
          }
          if(item.status==='same'||item.status==='equivalent'){
            this.state.known[item.path]={op:v.op,sha256:v.sha256,versionId:v.versionId,at:v.eventAtUtc,
              localSha:item.localHash,equivalentSha:item.status==='equivalent'?item.equivalentHash:null,
              equivalentHeads:item.equivalentHeadIds};
            if(item.status==='equivalent')equivalent++;
            await this.ack(v,item.status==='equivalent'?'equivalent':'same',item.localHash,item.equivalentHash);
            continue;
          }
          if(item.status!=='create'&&item.status!=='safe-update')continue;
          const current=this.vault.getAbstractFileByPath(item.path);
          const currentSha=current?await M.sha(await this.vault.readBinary(current)):null;
          if(currentSha!==item.localHash)throw Error('写入之前本机笔记已变化，跳过');
          const bytes=await this.payload(v);
          const parent=item.path.split('/').slice(0,-1).join('/');
          if(parent)await this.mkVault(parent);
          let versionBackup=null;
          if(item.status==='safe-update'){
            const old=await this.vault.readBinary(current);
            const dest=`${this.paths().backup}/${M.stamp()}-${M.uid()}/${item.path}`;
            await this.mk(dest.split('/').slice(0,-1).join('/'));
            await this.adapter.writeBinary(dest,bytesAB(old));
            if(await M.sha(await this.adapter.readBinary(dest))!==item.localHash)
              throw Error('安全更新备份 SHA 校验失败');
            versionBackup=dest;
            await this.vault.modifyBinary(current,bytesAB(bytes));
            updated++;
          }else{
            if(await this.adapter.exists(item.path))throw Error('文件刚刚被创建，拒绝覆盖');
            await this.vault.createBinary(item.path,bytesAB(bytes));
            created++;
          }
          if(await M.sha(await this.adapter.readBinary(item.path))!==v.sha256)
            throw Error('文件写入后 SHA-256 校验失败');
          this.state.known[item.path]={op:v.op,sha256:v.sha256,
            equivalentSha:await M.equivalentSha(bytes,item.path),
            versionId:v.versionId,at:v.eventAtUtc};
          await this.ack(v,'applied',null,null);
          changed.push({path:item.path,action:item.status,backup:versionBackup});
          await this.persist();
        }catch(err){errors.push({path:item.path,error:String(err.message||err)});}
      }
      // ACKs are delivery receipts, not forged by the sender.
      let ackFiles=0;
      try{ackFiles=await this.flushAck();}catch(err){errors.push({path:'ACK',error:String(err.message||err)});}
      this.state.lastOperation={kind:'android-download',at:Date.now(),
        created,updated,deleted,acknowledgedDeletes,errors:errors.length};
      try{await this.publishInfo();}catch(err){errors.push({path:'info',error:String(err.message||err)});}
      await this.persist();
      return {created,updated,deleted,acknowledgedDeletes,equivalent,changed,errors,ackFiles};
    }finally{this.busy=false;}
  }
  async previewUpload(){
    const plan=await this.latestPlan();
    const byPath=M.obj();
    for(const i of plan.items)byPath[i.path]=i;
    const local=await this.scanVault();
    const ready=[],blocked=[],unchanged=[],deletions=[];
    for(const item of plan.items){
      if(item.status!=='local-deleted'||M.isSyncExcludedPath(item.path))continue;
      const known=this.state.known[item.path],head=item.version;
      if(!known || known.op!=='upsert'||!head||
         known.versionId!==head.versionId || head.op!=='upsert')continue;
      deletions.push({path:item.path,op:'delete',size:0,sha256:null,
        parentVersionId:known.versionId,baseSha256:known.sha256});
    }
    for(const [path,f] of Object.entries(local.files).sort((a,b)=>a[0].localeCompare(b[0]))){
      if(M.isSyncExcludedPath(path))continue;
      const remote=byPath[path],known=this.state.known[path];
      if(!remote){
        if(known){ // Outbox package may have been moved away after a previous export.
          if(known.sha256===f.sha256){unchanged.push(path);continue;}
          blocked.push({path,reason:'已记录旧版本，但本机交换区缺少历史 ZIP；先导入群组历史'});
          continue;
        }
        ready.push({path,...f,parentVersionId:null,baseSha256:null});
        continue;
      }
      if(['same','equivalent'].includes(remote.status)){unchanged.push(path);continue;}
      if(remote.status==='local-update'&&known?.versionId===remote.version?.versionId){
        if(known.op==='delete'){
          const authority=this.state.authorizedRestores?.[path];
          if(authority?.parentVersionId!==known.versionId||authority.sha256!==f.sha256){
            blocked.push({path,reason:'恢复版本缺少本机明确授权或文件已变化'});continue;
          }
        }
        ready.push({path,...f,parentVersionId:known.versionId,baseSha256:known.sha256});continue;
      }
      blocked.push({path,reason:`状态 ${remote.status}：禁止自动发布，以免覆盖分叉历史`});
    }
    deletions.sort((a,b)=>a.path.localeCompare(b.path));
    return {ready,blocked,unchanged,deletions,errors:local.errors,
      catalogWarnings:plan.catalog.warnings,catalogCount:plan.catalog.count,
      fingerprint:JSON.stringify({
        upserts:ready.map(x=>[x.path,x.sha256,x.parentVersionId]),
        deletes:deletions.map(x=>[x.path,x.parentVersionId,x.baseSha256])
      })};
  }
  async safeExport(preview,{allowInitial=false,allowDeletes=false,selectedPaths=null,republishSame=false}={}){
    if(this.busy)throw Error('已有同步操作正在执行');
    this.busy=true;
    try{
      const fresh=await this.previewUpload();
      if(fresh.fingerprint!==preview.fingerprint)throw Error('本机文件或历史发生变化，请重新预览');
      if(fresh.errors.length||fresh.catalogWarnings.length)throw Error('存在异常文件或损坏 ZIP，已停止上传');
      if(!fresh.catalogCount&&!Object.keys(this.state.known).length&&!allowInitial)
        throw Error('尚未导入任何群组历史：如果是首次创建新群组，需要在界面明确确认初次发布；加入已有群组请先导入历史 ZIP');
      await this.initFolders();
      const groups=[];let g=[],size=0;
      let approved=[...fresh.ready.map(x=>({...x,op:'upsert'})),
        ...(allowDeletes?fresh.deletions:[])];
      if(selectedPaths!==null){
        if(!Array.isArray(selectedPaths)||selectedPaths.length<1||selectedPaths.length>25||allowDeletes)
          throw Error('选择性增量只允许 1–25 个明确选中的新增或重新发布文件，不允许隐式删除');
        const selected=new Set(selectedPaths);
        if(selected.size!==selectedPaths.length)throw Error('选择性路径重复');
        const byReady=new Map(fresh.ready.map(x=>[x.path,x]));
        const byPlan=new Map((await this.latestPlan()).items.map(x=>[x.path,x]));
        const scanned=await this.scanVault();
        approved=[];
        for(const path of selectedPaths){
          if(M.isSyncExcludedPath(path))throw Error('内部目录不可导出');
          M.safePath(path);
          const ready=byReady.get(path);
          if(ready){approved.push({...ready,op:'upsert'});continue;}
          if(!republishSame)throw Error('当前没有待发布的本机更改：'+path);
          const item=byPlan.get(path),known=this.state.known[path],f=scanned.files[path];
          if(!item||item.status!=='same'||item.version?.op!=='upsert'||
             !known||known.op!=='upsert'||known.versionId!==item.version.versionId||
             !f||f.sha256!==item.version.sha256||known.sha256!==f.sha256)
            throw Error('已知版本或 SHA 不一致，无法重新发布：'+path);
          approved.push({path,size:f.size,sha256:f.sha256,
            parentVersionId:known.versionId,baseSha256:known.sha256,op:'upsert'});
        }
      }
      // All snapshot candidates (including deletions) are checked immediately
      // before writing immutable content packs.
      for(const x of approved){
        if(M.isSyncExcludedPath(x.path))throw Error('内部目录禁止生成删除版本');
        M.safePath(x.path);
        if(x.op==='upsert'&&x.size>32*1024*1024)
          throw Error('移动端单文件最多导出 32 MiB：'+x.path);
        if(g.length&&(g.length>=30||size+x.size>8*1024*1024)){groups.push(g);g=[];size=0;}
        g.push(x);size+=x.size;
      }
      if(g.length)groups.push(g);
      const files=[];
      for(const group of groups){
        const packId=M.uid(),seq=(this.state.seq||0)+1,zip=new this.zip(),entries=[];
        for(const x of group){
          const n=String(entries.length+1).padStart(4,'0');
          const e={path:x.path,versionId:`${packId}:${n}`,parentVersionId:x.parentVersionId,
            mergeParents:[],op:x.op,eventAtUtc:utc(),baseSha256:x.baseSha256,
            sha256:null,size:0,payload:null};
          if(x.op==='delete'){
            // Explicit confirmation plus race check: never invent deletion for
            // a newly recreated file or for a changed known-version head.
            if(this.vault.getAbstractFileByPath(x.path)||
               await this.adapter.exists(x.path))throw Error('文件已重新出现，停止删除发布：'+x.path);
            const known=this.state.known[x.path];
            if(!known||known.op!=='upsert'||known.versionId!==x.parentVersionId||
               known.sha256!==x.baseSha256)
              throw Error('删除候选历史已变化，请重新预览：'+x.path);
          }else{
            const file=this.vault.getAbstractFileByPath(x.path);
            if(!file)throw Error('文件已经不存在：'+x.path);
            const raw=M.bytes(await this.vault.readBinary(file));
            if(await M.sha(raw)!==x.sha256)throw Error('文件已变化，停止打包：'+x.path);
            e.sha256=x.sha256;e.size=raw.length;e.payload=`files/${n}.bin`;
            zip.file(e.payload,raw,{binary:true,compression:'DEFLATE',compressionOptions:{level:3}});
          }
          entries.push(e);
        }
        const manifest={format:'vaultrelay.content.v2',vaultGroupId:this.state.groupId,
          packId,originDeviceId:this.state.deviceId,originName:this.state.displayName||this.state.deviceId,
          originSeq:seq,createdAtUtc:utc(),entries};
        M.manifest(manifest,this.state.groupId);
        zip.file('manifest.json',JSON.stringify(manifest,null,2));
        const data=M.bytes(await zip.generateAsync({type:'uint8array',compression:'DEFLATE',
          compressionOptions:{level:3}}));
        const name=`${M.stamp()}__${this.state.deviceId}__${String(seq).padStart(8,'0')}__${packId.slice(0,8)}.zip`;
        await this.checkedPack(data,{filename:name});
        const out=this.paths().outbox+'/'+name;
        if(await this.adapter.exists(out))throw Error('同名 ZIP 已存在，拒绝覆盖');
        await this.adapter.writeBinary(out,bytesAB(data));
        const check=await this.checkedPack(await this.adapter.readBinary(out),{filename:name});
        if(check.manifest.packId!==packId)throw Error('生成的 ZIP 验证失败');
        // The exact pre-export known state is kept for a manual, guarded
        // withdrawal before a locally generated pack is handed to Baidu.
        // Historical pre-4.0.14 packs do NOT receive this trusted marker.
        const rollbackEntries=entries.map(e=>({
          path:e.path,versionId:e.versionId,
          previous:this.state.known[e.path]?
            JSON.parse(JSON.stringify(this.state.known[e.path])):null
        }));
        this.state.localDraftPacks[name]={
          packId,sha256:check.sha256,createdAtUtc:manifest.createdAtUtc,
          status:'local',entries:rollbackEntries
        };
        this.state.seq=seq;
        for(const e of entries){
          let equivalentSha=null;
          if(e.op==='upsert'){
            const f=this.vault.getAbstractFileByPath(e.path);
            equivalentSha=await M.equivalentSha(await this.vault.readBinary(f),e.path);
          }
          this.state.known[e.path]={op:e.op,sha256:e.sha256,versionId:e.versionId,
            equivalentSha,at:e.eventAtUtc};
          if(this.state.authorizedRestores?.[e.path])delete this.state.authorizedRestores[e.path];
        }
        this.state.lastOperation={kind:'android-export',at:Date.now(),zip:name};
        await this.persist();
        files.push({name,path:out,count:entries.length,size:data.length,
          deleted:entries.filter(e=>e.op==='delete').length});
      }
      if(files.length)await this.publishInfo();
      return {files,deleted:files.reduce((sum,f)=>sum+(f.deleted||0),0),
        skippedDeletes:allowDeletes?0:fresh.deletions.length,
        skipped:fresh.unchanged.length,blocked:fresh.blocked};
    }finally{this.busy=false;}
  }
}
module.exports={MobileEngine,TRANSFER,LIMIT_ZIP};

return module.exports;})();
'use strict';
const {Plugin,Modal,Notice,Setting,Platform}=require('obsidian');
const {MobileEngine,TRANSFER}=VRMobileEngine;
const M=VRMobileCore;
function notice(v){new Notice(v,7000);}
function text(e,body,cls='vr2-help'){e.createEl('p',{cls,text:body});}
async function copy(v){
  try{await navigator.clipboard.writeText(v);notice('已复制');}
  catch(_){notice('复制不可用，请长按选择文字复制');}
}
function summary(x){return Object.entries(x||{}).map(([k,v])=>k+': '+v).join(' | ');}
function infoLabel(s){return `${s.groupName||'未命名知识库'} · 网盘GroupID：${s.groupId}`;}
class HomeModal extends Modal{
  constructor(app,p){super(app);this.p=p;this.expanded=null;this.report=null;}
  async onOpen(){
    this.modalEl.addClass('vr2-panel');
    if(!this.p.engine.state.setupComplete){this.close();new WizardModal(this.app,this.p).open();return;}
    this.render();
  }
  render(){
    const e=this.contentEl,p=this.p,s=p.engine.state;
    e.empty();e.createEl('h2',{text:'Vault Relay · V5.2.3 移动端'});
    text(e,infoLabel(s),'vr2-summary');
    text(e,'移动端尚未连接百度网盘自动同步目录。请先从百度网盘下载正式内容 ZIP，再手动导入；生成的 ZIP 也需要在百度网盘 App 中手动上传。','vr2-warning');
    new Setting(e).setName('设置与连接检查')
      .addButton(b=>b.setButtonText('向导与设置').onClick(()=>{
        this.expanded='setup';this.render();new WizardModal(this.app,p).open();
      }))
      .addButton(b=>b.setButtonText('检查本地交换区').onClick(async()=>{
        this.expanded='check';this.report='正在校验内容 ZIP…';this.render();
        await p.run(async()=>{
          const catalog=await p.engine.scanCatalog();
          this.report=`当前群组：${s.groupId}\n有效内容 ZIP：${catalog.count}\n异常 ZIP：${catalog.warnings.length}\n交换区：${TRANSFER}\n注意：这不是百度云端连接状态。`+
            (catalog.warnings.length?'\n'+catalog.warnings.slice(0,4).map(x=>x.file+': '+x.error).join('\n'):'');
          this.render();
        });
      }));
    if(this.expanded==='setup')e.createDiv({cls:'vr2-inline',text:'此向导只绑定当前 Obsidian 知识库的网盘GroupID、群组名称和手机 Device ID。配置更改在弹窗中完成。'});
    else if(this.expanded==='check')e.createDiv({cls:'vr2-inline',text:this.report||'尚未检查'});
    new Setting(e).setName('自动同步：OFF').setDesc('移动端目前仅支持手动文件中转；不会在后台自动读取百度云盘，也不会自动覆盖笔记。');
    new Setting(e).setName('① 导入群组 ZIP').setDesc('从系统文件选择器选择百度网盘下载的 Vault Relay 正式内容 ZIP。')
      .addButton(b=>b.setButtonText('选择 ZIP 文件').setCta().onClick(()=>this.pickZip()));
    new Setting(e).setName('② 下载文件').setDesc('先校验 ZIP 和本地笔记，预览新增、等效与冲突；需要二次确认才会写入。')
      .addButton(b=>b.setButtonText('核对并下载').onClick(()=>new DownloadModal(this.app,p).open()));
    new Setting(e).setName('③ 上传文件').setDesc('为本机新增、已确认的独立修改生成 Windows 兼容的正式 ZIP；生成后手动上传到百度网盘。')
      .addButton(b=>b.setButtonText('预览并生成 ZIP').onClick(()=>new UploadModal(this.app,p).open()));
    new Setting(e).setName('④ 历史与冲突').setDesc('只读查看已导入版本。移动端暂不执行智能合并或覆盖冲突。')
      .addButton(b=>b.setButtonText('查看历史与冲突').onClick(()=>new HistoryModal(this.app,p).open()));
    const gid=new Setting(e).setName('网盘GroupID').setDesc(s.groupId);
    gid.addButton(b=>b.setButtonText('复制').onClick(()=>copy(s.groupId)));
    let gn=s.groupName||'';
    new Setting(e).setName('群组名称').setDesc('本知识库的显示名称，不改变网盘GroupID')
      .addText(t=>t.setValue(gn).setPlaceholder('例如：物理知识库').onChange(v=>{gn=v;}))
      .addButton(b=>b.setButtonText('保存').onClick(()=>p.run(async()=>{
        if(gn.trim().length>80)throw Error('名称不能超过 80 字');
        s.groupName=gn.trim();await p.persist();this.render();
      },'群组名称已保存')));
    new Setting(e).setName('本机 Device ID').setDesc(s.deviceId)
      .addButton(b=>b.setButtonText('复制').onClick(()=>copy(s.deviceId)));
    text(e,`手机内交换目录：${TRANSFER}/inbox/content（接收）和 ${TRANSFER}/outbox/content（发送）。请勿把交换区当作普通知识库笔记上传。`);
  }
  pickZip(){
    const input=document.createElement('input');
    input.type='file';input.accept='.zip,application/zip';input.multiple=true;
    input.addEventListener('change',async()=>{
      const files=[...(input.files||[])];
      if(!files.length)return;
      await this.p.run(async()=>{
        const r=await this.p.engine.importFiles(files);
        this.report=`已成功导入 ${r.done.length} 个，失败 ${r.errors.length} 个。\n`+
          r.done.map(x=>(x.already?'已存在':'已导入')+'：'+x.name).join('\n')+
          (r.errors.length?'\n'+r.errors.map(x=>x.name+'：'+x.error).join('\n'):'');
        this.expanded='check';this.render();
        notice(`ZIP 导入完成：${r.done.length} 成功，${r.errors.length} 失败`);
      });
    },{once:true});
    input.click();
  }
  onClose(){this.contentEl.empty();}
}
class WizardModal extends Modal{
  constructor(app,p){
    super(app);this.p=p;const s=p.engine.state;
    this.group=s.groupId;this.groupName=s.groupName||'';this.name=s.displayName||(Platform.isIosApp?'苹果设备':'Android 手机');
  }
  onOpen(){this.modalEl.addClass('vr2-panel');this.render();}
  render(){
    const e=this.contentEl,s=this.p.engine.state;e.empty();
    e.createEl('h2',{text:'当前知识库 · 移动端配置'});
    text(e,'已有 Windows 知识库时，请从 Windows 的 Vault Relay 复制同一个「网盘GroupID」。本手机拥有单独的 Device ID。');
    new Setting(e).setName('网盘GroupID').setDesc('使用已存在的 vg-… ID；新群组也可以用当前生成的 ID。')
      .addText(t=>t.setValue(this.group).onChange(v=>{this.group=v.trim();}));
    new Setting(e).setName('群组名称').setDesc('例如：E生学物理；仅用于显示')
      .addText(t=>t.setValue(this.groupName).onChange(v=>{this.groupName=v;}));
    new Setting(e).setName('手机设备名称')
      .addText(t=>t.setValue(this.name).onChange(v=>{this.name=v;}));
    new Setting(e).setName('手机 Device ID').setDesc(s.deviceId);
    new Setting(e).setName('只有复制了其他手机的插件配置，才更换 Device ID')
      .addButton(b=>b.setButtonText('生成新手机身份').setWarning().onClick(async()=>{
        if(!confirm('确认这是一台新的独立设备？这会生成新 Device ID，但不会删除本地文件或云端历史。'))return;
        s.deviceId='vr-'+M.uid();s.seq=0;s.messageSeq=0;s.acks={};s.publishedAckIds={};
        s.known={};s.initialReviewComplete=false;s.syncEnabled=false;
        this.p.engine=new MobileEngine({vault:this.p.app.vault,adapter:this.p.app.vault.adapter,
          state:s,zip:VRI_ZIP,persist:()=>this.p.persist()});
        await this.p.persist();this.render();
      }));
    new Setting(e).setName('保存当前知识库配置')
      .setDesc('没有正式 ZIP 时不会自动下载或上传任何文件；保存后自动同步仍然 OFF。')
      .addButton(b=>b.setButtonText('保存设置').setCta().onClick(()=>this.p.run(async()=>{
        M.validId(this.group,M.GROUP,'网盘GroupID');
        if(!this.name.trim()||this.name.length>80)throw Error('设备名称需 1-80 个字');
        if(this.groupName.length>80)throw Error('群组名称最多 80 字');
        if(s.groupId!==this.group){
          if(Object.keys(s.known||{}).length||await this.p.engine.scanCatalog().then(c=>c.count))
            throw Error('已有同步历史：不能在同一知识库直接切换到别的网盘GroupID。请创建独立知识库。');
          s.groupId=this.group;
        }
        s.groupName=this.groupName.trim();s.displayName=this.name.trim();s.setupComplete=true;s.syncEnabled=false;
        await this.p.persist();await this.p.engine.initFolders();
        this.close();new HomeModal(this.app,this.p).open();
      },'配置已保存')));
  }
  onClose(){this.contentEl.empty();}
}
class DownloadModal extends Modal{
  constructor(app,p){
    super(app);
    this.p=p;this.view='create';this.plan=null;this.last=null;
    this.details=null;this.detailHeading=null;
    this.visibleLimit=180;this.searchQuery='';
  }
  async onOpen(){
    this.modalEl.addClass('vr2-panel');
    this.modalEl.addClass('vr2-audit-panel');
    await this.refresh();
  }
  async refresh(){
    const e=this.contentEl;e.empty();
    e.createEl('h3',{text:'正在校验内容 ZIP 与本机笔记…'});
    await this.p.run(async()=>{
      const currentPlan=await this.p.engine.latestPlan();
      const review=typeof this.p.v525FilterReviewPlan==='function'
        ? await this.p.v525FilterReviewPlan(currentPlan):{plan:currentPlan,shown:[]};
      this.plan=review.plan;
      this.render();
      // Commit only after the audit UI has rendered its read-only first display.
      if(review.shown?.length&&typeof this.p.v525CommitDeletedShown==='function')
        await this.p.v525CommitDeletedShown(review.shown);
    });
  }
  changeView(view){
    this.view=view;
    // Only repaint the detail list: rebuilding the entire modal would
    // reset the mobile scroll position and make the filter look inert.
    this.paintDetails();
  }
  paintDetails(){
    if(!this.plan||!this.details||!this.detailHeading)return;
    const q=this.plan,detail=this.details;
    const labels={
      create:'待新增', 'safe-update':'安全更新',same:'内容相同',
      equivalent:'内容等效',conflict:'冲突',fork:'版本分叉',
      'delete-review':'待审核删除','delete-kept':'保留本机（拒绝删除）','local-update':'本机更新',
      'local-deleted':'本机已删除（待确认发布）',
      'local-error':'本机错误',absent:'已不存在'
    };
    const statusMatches=q.items.filter(x=>this.view==='all' ||
      (this.view==='conflict'
        ? ['conflict','fork','local-error','delete-review'].includes(x.status)
        : x.status===this.view));
    const query=(this.searchQuery||'').trim().toLocaleLowerCase();
    const matching=query?
      statusMatches.filter(x=>String(x.path||'').toLocaleLowerCase().includes(query)):
      statusMatches;
    const headings={
      create:'待新增文件明细',
      'local-deleted':'本机已删除的文件明细',
      'delete-review':'来自其他设备的删除版本',
      equivalent:'等效文件明细',
      conflict:'冲突与异常文件明细',
      all:'全部版本检查明细'
    };
    this.detailHeading.textContent=(headings[this.view]||'文件明细')+
      '（'+matching.length+(query?' / 共 '+statusMatches.length:'')+'）';
    detail.empty();
    if(!matching.length){
      detail.createEl('p',{text:query?'没有匹配的文件，请修改搜索词。':'当前没有此类文件。',
        cls:'vr2-review-empty'});
      return;
    }
    for(const item of matching.slice(0,this.visibleLimit)){
      const line=detail.createDiv({cls:'vr2-review-item'});
      const fileButton=line.createEl('button',{
        text:item.path,cls:'vr2-review-path-button'
      });
      fileButton.title='点击文件名查看完整内容和差异（只读）';
      fileButton.addEventListener('click',()=>this.p.openReviewFile(item));
      const origin=item.version?.originDeviceId?
        '来源设备：'+item.version.originDeviceId+' · ':'';
      line.createEl('p',{
        text:'状态：'+(labels[item.status]||item.status)+' · '+origin+
          (item.version?.eventAtUtc?'版本时间：'+item.version.eventAtUtc:
           item.version?.versionId?'版本：'+item.version.versionId:'本机版本检查'),
        cls:'vr2-review-meta'
      });
      // V4.0.12: remove the old nested <details> expander that jumps the
      // Android audit panel to its beginning. Version ID, SHA and reasons
      // remain accessible in the full-screen viewer via the file-name button.
    }
    if(matching.length>this.visibleLimit){
      const more=detail.createEl('button',{
        text:'继续显示剩余文件（当前 '+this.visibleLimit+' / '+matching.length+'）',
        cls:'vr2-review-showmore'
      });
      more.addEventListener('click',()=>{
        this.visibleLimit+=180;this.paintDetails();
      });
    }
  }
  render(){
    const e=this.contentEl,q=this.plan;if(!q)return;e.empty();
    e.createEl('h2',{text:'移动端 · 写入前核对版本'});
    text(e,summary(q.counts),'vr2-summary');
    if(q.catalog.warnings.length||q.errors.length){
      text(e,`异常 ZIP ${q.catalog.warnings.length}、本机读取错误 ${q.errors.length}。在修复前禁止确认下载。`,'vr2-warning');
      for(const x of [...q.catalog.warnings,...q.errors].slice(0,12))
        text(e,(x.file||x.path||'')+': '+(x.error||'异常'),'vr2-warning');
    }
    // Put preview/confirm action ABOVE the potentially long results.
    new Setting(e).setName('重新检查')
      .addButton(b=>b.setButtonText('刷新').onClick(()=>this.refresh()));
    if(this.last){
      const box=e.createDiv({cls:'vr2-inline'});
      box.createEl('h4',{text:`本次应用：新增 ${this.last.created}，更新 ${this.last.updated}，错误 ${this.last.errors.length}`});
      for(const x of this.last.changed)box.createEl('p',{text:`[${x.action}] ${x.path}`});
      for(const x of this.last.errors)box.createEl('p',{text:`[失败] ${x.path}：${x.error}`});
    }
    const safe=q.items.filter(x=>['create','safe-update'].includes(x.status));
    text(e,`仅确认 ${safe.length} 项安全写入：缺失文件直接新增，安全更新先保留备份；冲突、删除墓碑和分叉均不覆盖。`,'vr2-help');
    new Setting(e).setName('确认安全下载')
      .addButton(b=>b.setButtonText(`预览确认 (${safe.length})`).setCta()
        .setDisabled(!safe.length||q.catalog.warnings.length>0||q.errors.length>0)
        .onClick(()=>new ConfirmDownloadModal(this.app,this.p,q,async r=>{
          this.last=r;await this.refresh();
        }).open()));
    const delItems=q.items.filter(x=>x.status==='delete-review');
    const historicalAbsent=q.items.filter(x=>x.status==='absent');
    if(delItems.length||historicalAbsent.length)new Setting(e).setName('审核其他设备发布的删除版本')
      .setDesc(`需要删除本机文件 ${q.counts['delete-review']||0} 项；本机原本就没有文件 ${q.counts.absent||0} 项。默认绝不删除，需另行确认。`)
      .addButton(b=>b.setButtonText(`审核删除版本预览 (${delItems.length})`)
        .setDisabled(!delItems.length||q.catalog.warnings.length>0||q.errors.length>0)
        .onClick(()=>new ConfirmDeleteReviewModal(this.app,this.p,q,async r=>{
          this.last=r;await this.refresh();
        }).open()));
    if(q.counts['delete-kept'])text(e,`已明确选择保留本机文件 ${q.counts['delete-kept']} 项；不列入删除执行数量。`, 'vr2-help');
    if(q.counts['local-deleted'])text(e,
      `另有 ${q.counts['local-deleted']} 项是本机曾同步、后来已删除的文件。不会重新恢复；如要通知其他设备，请到「上传增量包」明确确认发布删除版本。`,
      'vr2-warning');

    // All filters and per-file details stay BELOW the confirm action.
    e.createEl('h3',{text:'版本检查文件明细'});
    new Setting(e).setName('过滤检查结果')
      .addButton(b=>b.setButtonText(`待新增 (${q.counts.create})`)
        .onClick(()=>this.changeView('create')))
      .addButton(b=>b.setButtonText(`等效 (${q.counts.equivalent})`)
        .onClick(()=>this.changeView('equivalent')))
      .addButton(b=>b.setButtonText(`冲突 (${q.counts.conflict+q.counts.fork})`)
        .onClick(()=>this.changeView('conflict')))
      .addButton(b=>b.setButtonText(`本机已删除 (${q.counts['local-deleted']||0})`)
        .onClick(()=>this.changeView('local-deleted')))
      .addButton(b=>b.setButtonText(`全部 (${q.items.length})`)
        .onClick(()=>this.changeView('all')));
    const searchBox=e.createDiv({cls:'vr2-review-search-area'});
    searchBox.createEl('label',{text:'搜索文件名或相对路径',cls:'vr2-review-search-label'});
    const search=searchBox.createEl('input',{cls:'vr2-review-search'});
    search.type='search';
    search.placeholder='例如 VR-REVIEW-TEST-003.md 或 学习/';
    search.value=this.searchQuery||'';
    search.setAttribute?.('aria-label','搜索待审核文件名');
    search.addEventListener('input',()=>{
      this.searchQuery=String(search.value||'');
      this.visibleLimit=180;
      this.paintDetails();
    });
    e.createEl('p',{text:'点击任一文件名打开大屏只读查看器；审核前不会写入正式笔记。',
      cls:'vr2-review-meta'});
    this.detailHeading=e.createEl('p',{cls:'vr2-review-heading',text:''});
    this.details=e.createDiv({cls:'vr2-review-list'});
    this.paintDetails();
  }
  onClose(){this.contentEl.empty();this.details=null;this.detailHeading=null;}
}
class ConfirmDownloadModal extends Modal{
  constructor(app,p,plan,onDone){super(app);this.p=p;this.plan=plan;this.onDone=onDone;}
  onOpen(){
    this.modalEl.addClass('vr2-panel');
    const e=this.contentEl;e.empty();e.createEl('h2',{text:'请确认写入到当前移动端知识库'});
    const safe=this.plan.items.filter(x=>['create','safe-update'].includes(x.status));
    text(e,`待新增 ${safe.filter(x=>x.status==='create').length}，安全更新 ${safe.filter(x=>x.status==='safe-update').length}。`);
    const div=e.createDiv({cls:'vr2-scroll'});
    for(const x of safe.slice(0,150))div.createEl('p',{text:`[${x.status}] ${x.path}`});
    new Setting(e).addButton(b=>b.setButtonText('取消').onClick(()=>this.close()))
      .addButton(b=>b.setButtonText('确认仅写入安全文件').setCta().onClick(async()=>{
        const r=await this.p.run(()=>this.p.engine.safeApply(this.plan));
        if(r){
          try{await this.p.registerUndoFromNative(r,this.plan,'安全下载');}
          catch(err){notice('文件操作已结束，但可回退记录保存失败：'+String(err.message||err));}
          this.close();await this.onDone(r);
          notice(`新增 ${r.created}，更新 ${r.updated}，错误 ${r.errors.length}`);
        }
      }));
  }
  onClose(){this.contentEl.empty();}
}
class ConfirmDeleteReviewModal extends Modal{
  constructor(app,p,plan,done){super(app);this.p=p;this.plan=plan;this.done=done;}
  onOpen(){
    this.modalEl.addClass('vr2-panel');
    const e=this.contentEl;e.empty();
    e.createEl('h2',{text:'人工审核来自其他设备的删除版本'});
    const affected=this.plan.items.filter(x=>x.status==='delete-review');
    const noFile=[]; // Already absent is historical information, not an executable deletion.
    text(e,`将删除本机现有文件 ${affected.length} 个；其余 ${noFile.length} 个仅确认删除版本而不会创建或删除文件。`,
      'vr2-warning');
    text(e,'仅在你确认其他设备的删除意图后继续。删除本机正式文件前先创建 SHA 校验的本机安全备份；若文件变化则拒绝删除。');
    const list=e.createDiv({cls:'vr2-scroll'});
    for(const item of [...affected,...noFile].slice(0,150))
      list.createEl('p',{text:`[${item.status}] ${item.path}`});
    if(affected.length>150)text(e,'只显示前150项，实际操作会重新核对完整清单。');
    new Setting(e).addButton(b=>b.setButtonText('取消').onClick(()=>this.close()))
      .addButton(b=>b.setButtonText('明确确认删除/接受已删除版本')
        .setCta().onClick(async()=>{
          const r=await this.p.run(()=>this.p.engine.safeApply(this.plan,
            {allowDeletes:true,deleteOnly:true}));
          if(r){
            try{await this.p.registerUndoFromNative(r,this.plan,'人工确认删除');}
            catch(err){notice('文件已处理，但可回退记录保存失败：'+String(err.message||err));}
            this.close();await this.done(r);
            notice(`确认删除 ${r.deleted}，已不存在 ${r.acknowledgedDeletes}，错误 ${r.errors.length}`);
          }
        }));
  }
  onClose(){this.contentEl.empty();}
}
class UploadModal extends Modal{
  constructor(app,p){super(app);this.p=p;this.plan=null;this.last=null;this.allowInitial=false;this.allowDeletes=false;}
  async onOpen(){this.modalEl.addClass('vr2-panel');await this.refresh();}
  async refresh(){
    const e=this.contentEl;e.empty();e.createEl('h3',{text:'正在扫描待发送文件…'});
    await this.p.run(async()=>{this.plan=await this.p.engine.previewUpload();this.render();});
  }
  render(){
    const e=this.contentEl,p=this.plan;if(!p)return;e.empty();
    e.createEl('h2',{text:'移动端 · 生成手动上传 ZIP'});
    text(e,`待新增/修改 ${p.ready.length}；本机已删除待确认 ${p.deletions.length}；跳过相同 ${p.unchanged.length}；暂缓冲突 ${p.blocked.length}`,'vr2-summary');
    if(p.errors.length||p.catalogWarnings.length)
      text(e,`读取错误 ${p.errors.length}，异常 ZIP ${p.catalogWarnings.length}；已阻止生成`,'vr2-warning');
    for(const x of p.blocked.slice(0,40))text(e,`[暂缓] ${x.path} — ${x.reason}`,'vr2-warning');
    if(!p.catalogCount&&!Object.keys(this.p.engine.state.known).length){
      new Setting(e).setName('初次发布全新群组').setDesc('⚠️ 只有你确认这个网盘GroupID是全新空群组时才能开启。若加入已有群组，请先从 Windows 导入完整历史 ZIP。')
        .addToggle(t=>t.setValue(this.allowInitial).onChange(v=>{this.allowInitial=v;this.render();}));
    }
    if(p.deletions.length)new Setting(e).setName('同时发布本机删除版本')
      .setDesc('默认关闭。旧内容版本不直接清除；发布 delete 墓碑会通知其他设备在人工确认后删除。状态不明的历史包按可能已上传处理。')
      .addToggle(t=>t.setValue(this.allowDeletes).onChange(v=>{
        this.allowDeletes=!!v;this.render();
      }));
    const list=e.createDiv({cls:'vr2-scroll'});
    for(const x of p.ready.slice(0,120))list.createEl('p',{text:`[待发送新增/修改] ${x.path}`});
    for(const x of p.deletions.slice(0,120))
      list.createEl('p',{text:`[已删除 · ${this.allowDeletes?'确认发布':'默认不发布'}] ${x.path}`});
    if(p.ready.length>120||p.deletions.length>120)
      text(e,'每类最多显示前120条；生成ZIP会完整处理本次已授权候选。');
    new Setting(e).setName('重新扫描').addButton(b=>b.setButtonText('刷新').onClick(()=>this.refresh()));
    if(this.last){
      const box=e.createDiv({cls:'vr2-inline'});
      box.createEl('h4',{text:`本机已生成 ${this.last.files.length} 个内容 ZIP；云端上传状态未知`});
      for(const file of this.last.files){
        const setting=new Setting(box).setName(file.name).setDesc(`路径：${file.path} · ${file.count} 个文件`);
        setting.addButton(b=>b.setButtonText('尝试系统分享').onClick(()=>this.p.run(async()=>{
          if(!navigator.share||typeof File==='undefined')throw Error('此手机无法调用系统分享，请用文件管理器上传交换区中的 ZIP');
          const raw=await this.p.engine.adapter.readBinary(file.path);
          const shared=new File([raw],file.name,{type:'application/zip'});
          if(navigator.canShare&&!navigator.canShare({files:[shared]}))throw Error('当前系统不支持分享 ZIP 文件');
          await navigator.share({files:[shared],title:'Vault Relay 正式内容 ZIP'});
        })));
      }
    }
    text(e,'确认生成会先创建本机原生内容 ZIP，再安全封装外层增量 ZIP。两者都只是本机准备，不代表已经上传百度网盘。若确定从未上传、分享且包仍受本机控制，可在主控制台高级操作中单独申请撤销；状态不明必须保留历史。');
    const authorized=p.ready.length+(this.allowDeletes?p.deletions.length:0);
    new Setting(e).setName('生成正式内容 ZIP')
      .addButton(b=>b.setButtonText(`确认生成 (${authorized})`).setCta()
        .setDisabled(!authorized||p.errors.length>0||p.catalogWarnings.length>0||
          (!p.catalogCount&&!Object.keys(this.p.engine.state.known).length&&!this.allowInitial))
        .onClick(()=>new ConfirmExportModal(this.app,this.p,p,this.allowInitial,this.allowDeletes,
          async r=>{this.last=r;await this.refresh();}).open()));
  }
  onClose(){this.contentEl.empty();}
}
class ConfirmExportModal extends Modal{
  constructor(app,p,plan,allowInitial,allowDeletes,done){
    super(app);this.p=p;this.plan=plan;this.allowInitial=allowInitial;
    this.allowDeletes=!!allowDeletes;this.done=done;
  }
  onOpen(){
    this.modalEl.addClass('vr2-panel');
    const e=this.contentEl;e.empty();e.createEl('h2',{text:'确认生成 ZIP（本地操作）'});
    text(e,`将打包新增/修改 ${this.plan.ready.length} 个，发布已删除文件的 delete 版本 ${this.allowDeletes?this.plan.deletions.length:0} 个；不自动上传百度云端，也不会删除本机其他正式笔记。`,
      'vr2-warning');
    if(this.allowDeletes){
      const list=e.createDiv({cls:'vr2-scroll'});
      for(const item of this.plan.deletions.slice(0,120))
        list.createEl('p',{text:'[发布删除版本] '+item.path});
    }
    new Setting(e).addButton(b=>b.setButtonText('取消').onClick(()=>this.close()))
      .addButton(b=>b.setButtonText('确认生成').setCta().onClick(async()=>{
        const r=await this.p.run(()=>this.p.engine.safeExport(this.plan,{
          allowInitial:this.allowInitial,allowDeletes:this.allowDeletes
        }));
        if(r){
          try{
            await this.p.finalizeConfirmedUpload(r);
            notice('已准备增量 ZIP（可含 ACK），无新增内容时单独准备 JSON；请在百度网盘手动上传');
          }catch(err){
            await this.p.log('自动封装/准备未完成',String(err.message||err)+
              '；核心 ZIP 已保留，请在高级操作重试②③');
            notice('核心 ZIP 已生成，但外层封装或 ACK 准备失败；请查看日志');
          }
          this.close();await this.done(r);
        }
      }));
  }
  onClose(){this.contentEl.empty();}
}
class WithdrawDraftModal extends Modal{
  constructor(app,p){super(app);this.p=p;this.certified=false;this.preview=null;this.last=null;}
  async onOpen(){
    this.modalEl.addClass('vr2-panel');
    await this.refresh();
  }
  async refresh(){
    const e=this.contentEl;e.empty();e.createEl('h2',{text:'只撤销确定未上传的本机草稿'});
    try{
      this.preview=await this.p.previewLocalWithdrawals();
      this.render();
    }catch(err){
      this.preview=null;
      text(e,'检查失败：'+String(err.message||err),'vr2-warning');
    }
  }
  render(){
    const e=this.contentEl,p=this.preview;if(!p)return;e.empty();
    e.createEl('h2',{text:'只撤销确定未上传的本机草稿'});
    text(e,'只有 V4.0.14 本机创建并可校验的包可在这里撤销。旧版本包、Windows 百度同步盘、已观察到 ACK、内容包已离开本机发送区或来源状态不明的包，全部禁止撤销。','vr2-warning');
    text(e,'程序无法读取百度网盘真实上传状态。只有你亲自确认从未通过百度网盘、系统分享、文件管理器或其他渠道发送过相应内容 ZIP 和外层 ZIP，才可继续。否则请使用「发布删除版本」。','vr2-warning');
    if(this.last)text(e,'已撤销本机待发送包：'+this.last.withdrawn+
      '。旧字节已转移到不参与同步的隔离区；请重新执行上传预览并生成新的版本。','vr2-summary');
    new Setting(e).setName('确认所有外部副本均未传播')
      .setDesc('必须检查百度网盘、已发送/分享的文件以及其他设备。此确认是撤销操作的必要前提，不代表程序能自动验证云端。')
      .addToggle(t=>t.setValue(this.certified).onChange(v=>{
        this.certified=!!v;this.render();
      }));
    if(!p.eligible.length)text(e,'当前没有可证明仍受本机控制的新增草稿；老历史包只能使用删除版本处理。');
    for(const item of p.eligible.slice(-20)){
      const lines=e.createDiv({cls:'vr2-inline'});
      lines.createEl('h4',{text:item.name});
      text(lines,`原生内容 ${item.entryCount} 项；本机已缺失 ${item.missing.length} 项；外层待发 ZIP ${item.envelopes.length} 个。`);
      for(const path of item.missing.slice(0,15))text(lines,'[已缺失] '+path);
      new Setting(lines).setName('撤下这份待发送包')
        .setDesc('原包将移至本机隔离区，不会直接删除历史字节；其他仍存在的文件需要重新打包。')
        .addButton(b=>b.setButtonText('明确撤销未发送包')
          .setDisabled(!this.certified).onClick(async()=>{
            const result=await this.p.run(()=>this.p.withdrawLocalDraft(item.name,
              {certifiedNoExternalCopies:true}));
            if(result){
              this.last=result;
              this.certified=false;
              await this.refresh();
            }
          }));
    }
    for(const item of p.blocked.slice(0,12))
      text(e,`[禁止撤销] ${item.name}：${item.reason}`,'vr2-warning');
    new Setting(e).addButton(b=>b.setButtonText('刷新检查').onClick(()=>this.refresh()));
  }
  onClose(){this.contentEl.empty();}
}
class HistoryModal extends Modal{
  constructor(app,p){super(app);this.p=p;}
  async onOpen(){
    this.modalEl.addClass('vr2-panel');
    await this.p.run(async()=>{
      const plan=await this.p.engine.latestPlan(),e=this.contentEl;e.empty();
      e.createEl('h2',{text:'移动端 · 历史与冲突（只读）'});
      text(e,`已导入内容 ZIP ${plan.catalog.count}；异常 ${plan.catalog.warnings.length}；冲突 ${plan.counts.conflict}；分叉 ${plan.counts.fork}`);
      const special=plan.items.filter(x=>['conflict','fork','local-error','delete-review'].includes(x.status));
      for(const x of special.slice(0,120))text(e,`[${x.status}] ${x.path}`,'vr2-warning');
      if(!special.length)text(e,'未发现需要人工处理的冲突。');
      text(e,'移动端暂不支持智能合并。发生冲突时请保留两侧原件，在 Windows 版使用历史与冲突功能处理。');
      for(const f of plan.catalog.packages.slice(-100))
        text(e,`${f.createdAtUtc} · ${f.originDeviceId} · ${f.name}`);
    });
  }
  onClose(){this.contentEl.empty();}
}
module.exports=class VaultRelayAndroid extends Plugin{
  async onload(){
    if(Platform?.isDesktopApp){notice('本包是 V4.0 移动端。Windows 请安装 Windows 正式包。');return;}
    const raw=await this.loadData();
    if(raw!=null&&(typeof raw!=='object'||Array.isArray(raw))){
      notice('插件配置异常：为保护数据已停止启动');return;
    }
    this.data=raw||{};
    if(!this.data.v2)this.data.v2={schema:2,groupId:'vg-'+M.uid(),deviceId:'vr-'+M.uid(),known:{},
      seq:0,displayName:(Platform.isIosApp?'苹果设备':'Android 手机'),groupName:'',syncEnabled:false,setupComplete:false};
    const s=this.data.v2;
    // A vault copied from Windows to Android must not impersonate the Windows device.
    if(!s.mobileActivated){
      s.deviceId='vr-'+M.uid();s.seq=0;s.messageSeq=0;s.mobileActivated=true;
      s.setupComplete=false;s.syncEnabled=false;s.acks={};s.publishedAckIds={};
    }
    s.syncEnabled=false;
    s.groupName ||= '';s.displayName ||= (Platform.isIosApp?'苹果设备':'Android 手机');
    try{M.validId(s.deviceId,M.DEVICE,'Device ID');M.validId(s.groupId,M.GROUP,'网盘GroupID');}
    catch(err){notice('身份校验失败；插件未启用：'+err.message);return;}
    this.engine=new MobileEngine({vault:this.app.vault,adapter:this.app.vault.adapter,
      state:s,zip:VRI_ZIP,persist:()=>this.persist()});
    this.job=Promise.resolve();await this.persist();
    this.addRibbonIcon('folder-sync','Vault Relay Android',()=>new HomeModal(this.app,this).open());
    this.addCommand({id:'vaultrelay-mobile-home',name:'Vault Relay：移动端 手动中转主界面',callback:()=>new HomeModal(this.app,this).open()});
    this.addCommand({id:'vaultrelay-mobile-import',name:'Vault Relay：移动端 导入正式 ZIP',callback:()=>new HomeModal(this.app,this).open()});
    this.addCommand({id:'vaultrelay-mobile-download',name:'Vault Relay：移动端 安全下载预览',callback:()=>new DownloadModal(this.app,this).open()});
    this.addCommand({id:'vaultrelay-mobile-upload',name:'Vault Relay：移动端 生成上传 ZIP',callback:()=>new UploadModal(this.app,this).open()});
  }
  async persist(){await this.saveData(this.data);}
  run(fn,success){
    const task=this.job.then(fn);
    this.job=task.catch(err=>{console.error('Vault Relay Android:',err);notice('操作失败：'+String(err.message||err));});
    return task.then(result=>{if(success)notice(success);return result;}).catch(()=>false);
  }
};


module.exports.__ui={
  home:HomeModal,upload:UploadModal,download:DownloadModal,
  withdraw:WithdrawDraftModal,
  history:HistoryModal,conflicts:HistoryModal,setup:WizardModal
};

return module.exports;
}

/* V5.1.1 read-only vault inventory and explicitly selected ordinary-file export.
 * The inventory never contains note bodies. The peer's JSON is an untrusted
 * snapshot, not proof of upload, authorship or freshness. */
function createVaultComparison(JSZip,tools){
  'use strict';
  const FORMAT='vaultrelay.vault-inventory.v1';
  const MAX_FILES=15000, MAX_JSON=8*1024*1024, MAX_HASH_FILE=64*1024*1024;
  const MAX_EXPORT_FILES=120, MAX_EXPORT_TOTAL=90*1024*1024;
  const utf8=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
  const bytes=x=>x instanceof Uint8Array?x:
    x instanceof ArrayBuffer?new Uint8Array(x):new Uint8Array(x);
  const hash=x=>tools.sha256(bytes(x));
  const excluded=p=>/^(?:\.obsidian|vaultrelay-transfer)(?:\/|$)/i.test(p);
  const allowed=p=>tools.safeRel(p)&&!excluded(p);
  function fail(m){throw Error(m);}
  function validGroup(x){return tools.validGroup(x);}
  function validDevice(x){return /^vr-[a-z0-9]{16,64}$/.test(String(x||''));}
  function checkRecord(f){
    return f && typeof f==='object'&&!Array.isArray(f)&&allowed(f.path)&&
      Number.isSafeInteger(f.size)&&f.size>=0 && f.size<=Number.MAX_SAFE_INTEGER &&
      /^[a-f0-9]{64}$/.test(f.sha256||'') &&
      (f.mtimeMs===null || Number.isSafeInteger(f.mtimeMs)&&f.mtimeMs>=0) &&
      (f.versionId===null||typeof f.versionId==='string'&&f.versionId.length<=128) &&
      [null,'upsert','delete'].includes(f.knownOp);
  }
  function validate(doc,group){
    if(!doc||typeof doc!=='object'||Array.isArray(doc)||
       doc.format!==FORMAT||doc.schema!==1||!validGroup(doc.groupId)||
       (group&&doc.groupId!==group)||!validDevice(doc.deviceId)||
       typeof doc.vaultName!=='string'||doc.vaultName.length>140||
       typeof doc.createdAt!=='string'||!Number.isFinite(Date.parse(doc.createdAt))||
       !Array.isArray(doc.files)||doc.files.length>MAX_FILES||
       !Array.isArray(doc.errors)||doc.errors.length>MAX_FILES||
       !Number.isSafeInteger(doc.fileCount)||doc.fileCount!==doc.files.length||
       !Number.isSafeInteger(doc.totalBytes)||doc.totalBytes<0||
       !/^[a-f0-9]{64}$/.test(doc.contentFingerprint||''))
      fail('知识库信息清单格式、设备身份或 GroupID 不合法');
    const seen=new Set();let total=0,prev='';
    for(const f of doc.files){
      if(!checkRecord(f))fail('知识库清单包含不安全或无效文件记录');
      const key=f.path.normalize('NFC').toLowerCase();
      if(seen.has(key)||prev && f.path.localeCompare(prev,'en')<0)
        fail('知识库清单文件路径重复、大小写冲突或顺序异常');
      seen.add(key);prev=f.path;total+=f.size;
      if(!Number.isSafeInteger(total))fail('知识库清单总大小溢出');
    }
    if(total!==doc.totalBytes)fail('知识库清单文件大小汇总不匹配');
    for(const err of doc.errors){
      if(!err||typeof err.path!=='string'||!allowed(err.path)||
         typeof err.reason!=='string'||err.reason.length>240)
        fail('知识库清单异常文件信息不合法');
    }
    return doc;
  }
  async function fingerprint(files){
    return hash(utf8.encode(JSON.stringify(files.map(f=>[f.path,f.size,f.sha256]))));
  }
  async function snapshot(context){
    const {app,plugin}=context;
    if(!validGroup(plugin.data?.groupId)||!validDevice(plugin.engine?.state?.deviceId))
      fail('请先在本机创建或加入群组，确认 GroupID 与 DeviceID');
    if(typeof app.vault.getFiles!=='function')fail('当前 Obsidian 无法读取正式知识库文件列表');
    const inventory=app.vault.getFiles().filter(f=>f&&typeof f.path==='string'&&allowed(f.path));
    if(inventory.length>MAX_FILES)fail('正式知识库文件超过 '+MAX_FILES+' 个；请减少后再导出');
    const records=[],errors=[],seen=new Set();
    for(const f of inventory){
      const path=f.path,key=path.normalize('NFC').toLowerCase();
      if(seen.has(key)){errors.push({path,reason:'存在大小写相同的路径，未参与比对'});continue;}
      seen.add(key);
      try{
        const st=f.stat||await app.vault.adapter.stat(path);
        if(!st||!Number.isSafeInteger(st.size)||st.size<0||st.size>MAX_HASH_FILE)
          throw Error('文件大小不可读取或超过 64 MiB 的比对上限');
        const body=bytes(await app.vault.adapter.readBinary(path));
        if(body.length!==st.size)throw Error('读取期间文件大小变化');
        const h=await hash(body);
        const checked=await app.vault.adapter.stat(path);
        if(checked && Number.isSafeInteger(checked.size)&&checked.size!==body.length)
          throw Error('计算 SHA 期间文件发生变化');
        const known=plugin.engine?.state?.known?.[path]||null;
        records.push({path,size:body.length,mtimeMs:Number.isFinite(st.mtime)?Math.max(0,Math.round(st.mtime)):null,
          sha256:h,versionId:typeof known?.versionId==='string'?known.versionId.slice(0,128):null,
          knownOp:['upsert','delete'].includes(known?.op)?known.op:null});
      }catch(e){errors.push({path,reason:String(e.message||e).slice(0,220)});}
    }
    records.sort((a,b)=>a.path.localeCompare(b.path,'en'));
    let total=0;for(const f of records)total+=f.size;
    const doc={format:FORMAT,schema:1,createdAt:new Date().toISOString(),
      groupId:plugin.data.groupId,deviceId:plugin.engine.state.deviceId,
      vaultName:String(app.vault.getName()||'Vault').slice(0,140),
      scope:{recursiveExclusions:['.obsidian/','VaultRelay-Transfer/'],notesAndAttachments:true},
      fileCount:records.length,totalBytes:total,contentFingerprint:await fingerprint(records),
      files:records,errors};
    const encoded=utf8.encode(JSON.stringify(doc,null,2));
    if(encoded.length>MAX_JSON)fail('知识库信息清单超过 8 MiB，请缩小知识库后重试');
    return {doc,bytes:encoded};
  }
  async function parse(source,group){
    const raw=bytes(source);
    if(raw.length<64||raw.length>MAX_JSON)fail('知识库信息清单大小不合法或超过 8 MiB');
    let doc;
    try{doc=JSON.parse(decoder.decode(raw));}catch(_){fail('知识库信息清单不是合法 UTF-8 JSON');}
    validate(doc,group);
    if(await fingerprint(doc.files)!==doc.contentFingerprint)
      fail('知识库清单内容指纹不匹配：文件条目可能被更改');
    return doc;
  }
  function compare(local,remote){
    validate(local);validate(remote,local.groupId);
    const m=new Map(local.files.map(f=>[f.path,f]));
    const r=new Map(remote.files.map(f=>[f.path,f]));
    const paths=[...new Set([...m.keys(),...r.keys()])].sort((a,b)=>a.localeCompare(b,'en'));
    const totals={same:0,different:0,localOnly:0,remoteOnly:0,versionOnly:0};
    const rows=paths.map(path=>{
      const here=m.get(path)||null,there=r.get(path)||null;
      const status=!there?'local-only':!here?'remote-only':
        here.sha256===there.sha256?'same':'different';
      if(status==='same'){
        totals.same++;
        if(here.versionId!==there.versionId)totals.versionOnly++;
      }else if(status==='different')totals.different++;
      else if(status==='local-only')totals.localOnly++;
      else totals.remoteOnly++;
      return {path,status,local:here,remote:there};
    });
    return {local,remote,rows,totals,
      incomplete:!!(local.errors.length||remote.errors.length),
      comparedAt:new Date().toISOString()};
  }
  function selectable(report,paths){
    if(!report||!Array.isArray(report.rows)||!Array.isArray(paths)||
       !paths.length||paths.length>MAX_EXPORT_FILES)fail('请选择 1–120 个本机存在的差异文件');
    const byPath=new Map(report.rows.map(r=>[r.path,r]));
    const picked=[],seen=new Set();
    for(const path of paths){
      if(!allowed(path)||seen.has(path.toLowerCase()))fail('选择的文件路径重复或不安全');
      seen.add(path.toLowerCase());
      const row=byPath.get(path);
      if(!row||!row.local||!['different','local-only'].includes(row.status))
        fail('仅允许选择本机存在、确有差异的文件：'+path);
      picked.push(row);
    }
    return picked;
  }
  async function exportOrdinary(report,selected,context){
    const {app,plugin}=context;
    if(report.local.groupId!==plugin.data.groupId||
       report.local.deviceId!==plugin.engine?.state?.deviceId)fail('比对结果已与本机身份不符');
    const picked=selectable(report,selected),z=new JSZip();let total=0;
    for(const row of picked){
      const path=row.path;
      if(!await app.vault.adapter.exists(path))fail('选择的笔记已经不存在：'+path);
      const data=bytes(await app.vault.adapter.readBinary(path));
      if(data.length!==row.local.size||await hash(data)!==row.local.sha256)
        fail('导出前正式文件发生变化，请重新比对：'+path);
      if(data.length>32*1024*1024)fail('单文件超过 32 MiB 导出上限：'+path);
      total+=data.length;
      if(total>MAX_EXPORT_TOTAL)fail('所选文件合计超过 90 MiB，请分批选择');
      z.file(path,data,{binary:true,createFolders:false,compression:'DEFLATE',compressionOptions:{level:3}});
    }
    const packed=bytes(await z.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:3}}));
    if(packed.length>75*1024*1024)fail('普通文件 ZIP 超过 75 MiB，未保存');
    return {bytes:packed,files:picked.length,paths:picked.map(r=>r.path)};
  }
  return {FORMAT,excluded,allowed,snapshot,parse,compare,selectable,exportOrdinary};
}

const Bridge=loadBridge();
const Zip=loadZip();
const ImportManager=loadImport().createImportInspector(Zip,Bridge.__testing);
const Lifecycle=loadLifecycle().createLifecycle(Zip,Bridge.__testing);
const VaultComparison=createVaultComparison(Zip,Bridge.__testing);
const Panel=loadPanel().createUnifiedPanel();
const Plugin=loadUnified().createUnifiedPlugin(Bridge,loadWindows().createDesktopAgent,
  Zip,ImportManager,Lifecycle,Panel);
Plugin.__testing={tools:Bridge.__testing,zip:Zip,importer:ImportManager,
  lifecycle:Lifecycle,panel:Panel,comparison:VaultComparison,createDesktopAgent:loadWindows().createDesktopAgent};


const Native = require('obsidian').Platform.isDesktopApp ? loadNativeWindows() : loadNativeMobile();
const NativeUi = Native.__ui;
const UnifiedBase = Plugin;
const OBS = require('obsidian');

// V5.2.9 safe-local lifecycle modules, inlined for portable Obsidian install.
const V525 = (()=>{
  const factories=Object.create(null), cache=Object.create(null);
factories["path-guard"]=function(module,exports,require){
'use strict';

const OUTGOING = 'VaultRelay-Transfer/outgoing/';
const TEMPORARY = 'VaultRelay-Transfer/temporary/';
const MANAGED_DOWNLOADS = 'VaultRelay-Transfer/downloads-managed/';
const QUARANTINE = 'VaultRelay-Transfer/quarantine/';
const LEDGER = '.obsidian/plugins/vault-relay-v4/v525-cleanup-ledger.json';
const ALLOWED = [OUTGOING, TEMPORARY, MANAGED_DOWNLOADS];

function assertSafeRelative(p) {
  if (typeof p !== 'string' || !p || p.length > 512 ||
      p.startsWith('/') || p.startsWith('\\') || /^[a-zA-Z]:/.test(p) ||
      p.includes('\\') || p.includes('\0') || /[\x00-\x1f\x7f]/.test(p)) {
    throw new Error('UNSAFE_RELATIVE_PATH');
  }
  const parts = p.split('/');
  if (parts.some(s => !s || s === '.' || s === '..')) throw new Error('UNSAFE_RELATIVE_PATH');
  return p;
}
function assertOwnedArtifact(p) {
  assertSafeRelative(p);
  if (!ALLOWED.some(root => p.startsWith(root)) || !(p.endsWith('.zip') || p.endsWith('.json'))) {
    throw new Error('NOT_PLUGIN_OWNED_ARTIFACT_PATH');
  }
  return p;
}
function assertQuarantine(p) {
  assertSafeRelative(p);
  if (!p.startsWith(QUARANTINE)) throw new Error('NOT_QUARANTINE_PATH');
  return p;
}
module.exports = { OUTGOING, TEMPORARY, MANAGED_DOWNLOADS, QUARANTINE, LEDGER,
  assertSafeRelative, assertOwnedArtifact, assertQuarantine };

};
factories["ack-clearance"]=function(module,exports,require){
'use strict';

// Pure evaluator. Inputs must come from the already-verified V5.2.4 core ledger;
// NEVER treat arbitrary downloaded ACK JSON as verified evidence.
const SHA256_RE = /^[a-f0-9]{64}$/i;
const OK_OUTCOMES = new Set(['applied', 'same']);
const MODES = new Set(['any', 'all', 'manual']);

function denied(code, detail, extra = {}) {
  return { eligible: false, code, detail, satisfiedBy: [], ...extra };
}

function validId(x) { return typeof x === 'string' && x.trim().length > 0; }
function sameSHA(a, b) { return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase(); }

/**
 * @param {object} packet Immutable packet metadata stored at packet creation:
 *  {packetId,zipSha256,vaultGroupId,senderDeviceId,
 *   versions:[{packId,versionId,contentSha256}],
 *   policy:{mode, expectedDeviceIds, sealedAtUtc}}
 * @param {object[]} verifiedAckRows Output of V5.2.4's VERIFIED ACK ledger only.
 *   Each row must have verifiedByCore===true and native ACK v2 fields.
 * @param {object} context Verified publication/retention dependencies from core.
 */
function evaluatePacketClearance(packet, verifiedAckRows, context) {
  if (!packet || !validId(packet.packetId) || !SHA256_RE.test(packet.zipSha256 || '') ||
      !validId(packet.vaultGroupId) || !validId(packet.senderDeviceId)) {
    return denied('PACKET_INVALID', 'Packet identity/hash/group/sender missing');
  }
  if (!Array.isArray(packet.versions) || packet.versions.length === 0 ||
      !packet.versions.every(v => v && validId(v.packId) && validId(v.versionId) &&
        (v.contentSha256 == null || SHA256_RE.test(v.contentSha256)))) {
    return denied('VERSIONS_UNVERIFIED', 'Full immutable content-version mapping is required');
  }
  const unique = new Set(packet.versions.map(v => v.versionId));
  if (unique.size !== packet.versions.length) return denied('VERSIONS_DUPLICATED', 'Duplicate version IDs');
  const policy = packet.policy;
  if (!policy || !MODES.has(policy.mode) || !validId(policy.sealedAtUtc) ||
      !Array.isArray(policy.expectedDeviceIds)) {
    return denied('POLICY_NOT_FROZEN', 'Missing creation-time ACK strategy snapshot');
  }
  if (policy.mode === 'manual') return denied('MANUAL_ONLY', 'Manual cleanup strategy prohibits automatic qualification');
  const fixedTargets = [...new Set(policy.expectedDeviceIds)];
  // The creation-time `any` mode deliberately requires no prefilled device IDs.
  // Derive candidates from *verified* ACK receipts, never from an untrusted ZIP.
  // Only `all` requires a frozen, nonempty recipient list.
  if ((policy.mode === 'all' && !fixedTargets.length) ||
      fixedTargets.some(x => !validId(x) || x === packet.senderDeviceId)) {
    return denied('TARGETS_UNVERIFIED', 'Strict mode requires an explicit, frozen receiver list');
  }
  if (!context || context.evidenceTrusted !== true || context.coreLedgerDurable !== true) {
    return denied('UNTRUSTED_LEDGER', 'Require a verified and durable ACK ledger supplied by the installed core');
  }
  if (context.publicationConfirmed !== true ||
      !['manual-cloud-check', 'provider-confirmed'].includes(context.publicationEvidence)) {
    return denied('PUBLICATION_UNVERIFIED', 'A local sync-folder copy is not proof of cloud publication');
  }
  if (context.activeTransfer !== false || context.unresolvedConflict !== false ||
      context.rollbackDependency !== false || context.unresolvedReceiverDependency !== false) {
    return denied('TASK_DEPENDENCIES', 'Active transfer, conflict, rollback, or pending receiver dependency');
  }
  if (!Array.isArray(verifiedAckRows)) {
    return denied('ACK_LEDGER_MISSING', 'Verified ACK rows unavailable');
  }

  const observedTargets = verifiedAckRows.filter(row => row && row.verifiedByCore === true &&
    validId(row.fromDeviceId) && row.fromDeviceId !== packet.senderDeviceId &&
    row.toDeviceId === packet.senderDeviceId && row.vaultGroupId === packet.vaultGroupId)
    .map(row => row.fromDeviceId);
  const targets = policy.mode === 'any' && fixedTargets.length === 0 ?
    [...new Set(observedTargets)] : fixedTargets;
  if (!targets.length) return denied('TARGETS_UNVERIFIED', 'No verified receiver ACK candidate');
  const matched = new Map();
  for (const deviceId of targets) matched.set(deviceId, new Set());
  for (const row of verifiedAckRows) {
    if (!row || row.verifiedByCore !== true || !OK_OUTCOMES.has(row.outcome)) continue;
    if (!matched.has(row.fromDeviceId) || row.toDeviceId !== packet.senderDeviceId ||
        row.vaultGroupId !== packet.vaultGroupId) continue;
    for (const version of packet.versions) {
      if (row.packId !== version.packId || row.versionId !== version.versionId) continue;
      if (version.path != null && row.path !== version.path) continue;
      if (version.contentSha256 != null && !sameSHA(row.contentSha256, version.contentSha256)) continue;
      if (version.contentSha256 == null && row.contentSha256 != null) continue;
      matched.get(row.fromDeviceId).add(version.versionId);
    }
  }
  const satisfiedBy = targets.filter(id => matched.get(id).size === packet.versions.length);
  const complete = policy.mode === 'any' ? satisfiedBy.length >= 1 : satisfiedBy.length === targets.length;
  const missingByDevice = {};
  for (const id of targets) {
    missingByDevice[id] = packet.versions.filter(v => !matched.get(id).has(v.versionId)).map(v => v.versionId);
  }
  if (!complete) return denied('INCOMPLETE_ACK', 'Some required device/version ACKs are missing', { satisfiedBy, missingByDevice });
  return { eligible: true, code: 'QUALIFIED', detail: 'ACK completeness and local dependencies verified',
    satisfiedBy, missingByDevice, packetId: packet.packetId, policyMode: policy.mode };
}

module.exports = { evaluatePacketClearance };

};
factories["quarantine"]=function(module,exports,require){
'use strict';

const { evaluatePacketClearance } = require("ack-clearance");
const { QUARANTINE, assertOwnedArtifact, assertQuarantine } = require("path-guard");

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const SHA_RE = /^[0-9a-f]{64}$/i;
const STATE = 'vaultrelay-cleanup-ledger.v1';

function requireFunction(o, k) {
  if (!o || typeof o[k] !== 'function') throw new Error('REQUIRED_' + k);
}
function checkHash(expected) {
  if (typeof expected !== 'string' || !SHA_RE.test(expected)) throw new Error('SHA256_REQUIRED');
  return expected.toLowerCase();
}
function assertRecordId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{12,80}$/.test(id)) throw new Error('INVALID_RECORD_ID');
}
function immutableCopy(v) { return JSON.parse(JSON.stringify(v)); }

/**
 * Guarded, fail-closed vault-relative staging helper. It is NOT directly wired into V5.2.4.
 * Every platform integration MUST supply a real physical-path checker that rejects
 * symlink/reparse redirection and any Baidu/local cloud sync directory.
 */
class SafeQuarantine {
  constructor({ files, ledger, physicalGuard, core, hashBytes, newId, now = () => Date.now(),
    allowPermanentDelete = false } = {}) {
    for (const [o, keys] of [
      [files, ['exists', 'readBinary', 'rename', 'ensureDir', 'remove']],
      [ledger, ['load', 'persist']],
      [physicalGuard, ['confirmSafe']],
      [core, ['getVerifiedPacketContext', 'assertNotBusy']],
    ]) for (const key of keys) requireFunction(o, key);
    if (typeof hashBytes !== 'function' || typeof newId !== 'function' || typeof now !== 'function') {
      throw new Error('REQUIRED_CRYPTO_TIME_PROVIDERS');
    }
    this.files = files;
    this.ledger = ledger;
    this.physicalGuard = physicalGuard;
    this.core = core;
    this.hashBytes = hashBytes;
    this.newId = newId;
    this.now = now;
    this.allowPermanentDelete = allowPermanentDelete;
    this.busy = false;
  }

  async _exclusive(fn) {
    if (this.busy) throw new Error('CLEANUP_OPERATION_IN_PROGRESS');
    this.busy = true;
    try { return await fn(); } finally { this.busy = false; }
  }
  async _ledger() {
    const current = await this.ledger.load();
    if (current == null) return { schema: STATE, records: {} };
    if (current.schema !== STATE || !current.records || typeof current.records !== 'object' ||
      Array.isArray(current.records)) throw new Error('INVALID_PERSISTED_LEDGER');
    return immutableCopy(current);
  }
  async _commit(doc) {
    // Integration MUST use a durable atomic writer. Never delete the old ledger first.
    await this.ledger.persist(immutableCopy(doc));
  }
  async _physicalSafe(paths, operation) {
    const ok = await this.physicalGuard.confirmSafe({ paths, operation });
    if (ok !== true) throw new Error('PHYSICAL_PATH_UNVERIFIED');
  }
  async _packetAllowed(packetId, sourcePath, originalSha) {
    const ctx = await this.core.getVerifiedPacketContext(packetId);
    if (!ctx || !ctx.packet || ctx.packet.packetId !== packetId ||
        ctx.artifactPath !== sourcePath ||
        ctx.packet.zipSha256.toLowerCase() !== originalSha.toLowerCase()) {
      throw new Error('PACKET_PROVENANCE_UNVERIFIED');
    }
    const result = evaluatePacketClearance(ctx.packet, ctx.verifiedAckRows, ctx.context);
    if (!result.eligible) throw new Error('ACK_NOT_CLEARED:' + result.code);
    if (await this.core.assertNotBusy(packetId) !== true) throw new Error('TASK_BUSY');
    const snapshot = { packetId: ctx.packet.packetId, zipSha256: ctx.packet.zipSha256,
      vaultGroupId: ctx.packet.vaultGroupId, senderDeviceId: ctx.packet.senderDeviceId,
      versions: ctx.packet.versions.map(v => ({ packId: v.packId, versionId: v.versionId, path: v.path || null,
        contentSha256: v.contentSha256 ?? null })).sort((a,b) => a.versionId.localeCompare(b.versionId)),
      policy: { mode: ctx.packet.policy.mode, sealedAtUtc: ctx.packet.policy.sealedAtUtc,
        expectedDeviceIds: [...ctx.packet.policy.expectedDeviceIds].sort() } };
    const fingerprint = checkHash(await this.hashBytes(new TextEncoder().encode(JSON.stringify(snapshot))));
    return { ...result, fingerprint };
  }
  async _sha(path) {
    const raw = await this.files.readBinary(path);
    const sha = await this.hashBytes(raw);
    return checkHash(sha);
  }

  async preview() {
    const doc = await this._ledger();
    return Object.values(doc.records).map(item => immutableCopy(item));
  }

  async quarantineZip({ packetId, sourcePath, expectedSha256 } = {}) {
    return this._exclusive(async () => {
      if (!packetId || typeof packetId !== 'string') throw new Error('PACKET_ID_REQUIRED');
      assertOwnedArtifact(sourcePath);
      if (!sourcePath.endsWith('.zip')) throw new Error('ONLY_ZIP_SUPPORTED_IN_THIS_CANDIDATE');
      const sha = checkHash(expectedSha256);
      const doc = await this._ledger();
      if (Object.values(doc.records).some(r => r.originalPath === sourcePath &&
          ['move-intent', 'quarantined', 'restore-intent', 'purge-intent'].includes(r.status))) {
        throw new Error('FILE_ALREADY_MANAGED');
      }
      const clearance = await this._packetAllowed(packetId, sourcePath, sha);
      if (!(await this.files.exists(sourcePath))) throw new Error('SOURCE_NOT_FOUND');
      if ((await this._sha(sourcePath)) !== sha) throw new Error('SOURCE_SHA_MISMATCH');
      let id = this.newId();
      assertRecordId(id);
      if (doc.records[id]) throw new Error('DUPLICATE_RECORD_ID');
      const dest = QUARANTINE + id + '--' + sourcePath.split('/').pop();
      assertQuarantine(dest);
      await this._physicalSafe([sourcePath, dest], 'quarantine');
      if (await this.files.exists(dest)) throw new Error('QUARANTINE_COLLISION');
      const at = this.now();
      if (!Number.isFinite(at) || at <= 0) throw new Error('INVALID_CLOCK');
      const record = {
        id, packetId, originalPath: sourcePath, quarantinePath: dest,
        sha256: sha, packetFingerprint: clearance.fingerprint, status: 'move-intent',
        quarantineAtUtc: new Date(at).toISOString(),
        purgeNotBeforeUtc: new Date(at + RETENTION_MS).toISOString(),
        retentionDays: 30
      };
      doc.records[id] = record;
      await this._commit(doc); // durable intent BEFORE file movement
      await this.files.ensureDir(QUARANTINE.slice(0, -1));
      await this.files.rename(sourcePath, dest);
      if ((await this._sha(dest)) !== sha) {
        throw new Error('QUARANTINE_SHA_MISMATCH_INSPECT_INTENT');
      }
      record.status = 'quarantined';
      await this._commit(doc);
      return immutableCopy(record);
    });
  }

  async restore(id) {
    return this._exclusive(async () => {
      assertRecordId(id);
      const doc = await this._ledger();
      const item = doc.records[id];
      if (!item || item.status !== 'quarantined') throw new Error('NOT_RESTORABLE');
      assertOwnedArtifact(item.originalPath);
      assertQuarantine(item.quarantinePath);
      await this._physicalSafe([item.quarantinePath, item.originalPath], 'restore');
      if (await this.core.assertNotBusy(item.packetId) !== true) throw new Error('TASK_BUSY');
      if (await this.files.exists(item.originalPath)) throw new Error('RESTORE_WOULD_OVERWRITE');
      if (!(await this.files.exists(item.quarantinePath))) throw new Error('QUARANTINE_MISSING');
      if ((await this._sha(item.quarantinePath)) !== checkHash(item.sha256)) throw new Error('QUARANTINE_SHA_MISMATCH');
      item.status = 'restore-intent';
      await this._commit(doc);
      await this.files.rename(item.quarantinePath, item.originalPath);
      if ((await this._sha(item.originalPath)) !== checkHash(item.sha256)) {
        throw new Error('RESTORED_SHA_MISMATCH_INSPECT_INTENT');
      }
      item.status = 'restored';
      item.restoredAtUtc = new Date(this.now()).toISOString();
      await this._commit(doc);
      return immutableCopy(item);
    });
  }

  async purgeExpired({ explicitApproval = false } = {}) {
    // Candidate version NEVER purges automatically. Both opt-in and rechecks required.
    if (!this.allowPermanentDelete || explicitApproval !== true) {
      throw new Error('PERMANENT_DELETE_DISABLED');
    }
    return this._exclusive(async () => {
      const doc = await this._ledger();
      const purged = [], blocked = [];
      for (const item of Object.values(doc.records)) {
        if (item.status !== 'quarantined') continue;
        const quarantinedAt = Date.parse(item.quarantineAtUtc);
        const earliest = Date.parse(item.purgeNotBeforeUtc);
        const current = this.now();
        // Corrupt or shortened timestamps must NEVER make a file eligible early.
        if (!Number.isFinite(current) || !Number.isFinite(quarantinedAt) ||
            !Number.isFinite(earliest) || earliest < quarantinedAt + RETENTION_MS ||
            current < earliest || current < quarantinedAt + RETENTION_MS) {
          blocked.push({id:item.id,reason:'RETENTION_DATE_UNVERIFIED_OR_NOT_EXPIRED'});
          continue;
        }
        try {
          assertQuarantine(item.quarantinePath);
          assertOwnedArtifact(item.originalPath);
          await this._physicalSafe([item.quarantinePath, item.originalPath], 'purge');
          const clearance = await this._packetAllowed(item.packetId, item.originalPath, checkHash(item.sha256));
          if (!item.packetFingerprint || clearance.fingerprint !== item.packetFingerprint) {
            throw new Error('IMMUTABLE_PACKET_POLICY_CHANGED');
          }
          if (await this.files.exists(item.originalPath)) throw new Error('ORIGINAL_EXISTS_REVIEW_REQUIRED');
          if (!(await this.files.exists(item.quarantinePath))) throw new Error('QUARANTINE_MISSING');
          if ((await this._sha(item.quarantinePath)) !== checkHash(item.sha256)) {
            throw new Error('QUARANTINE_SHA_MISMATCH');
          }
          item.status = 'purge-intent';
          await this._commit(doc);
          await this.files.remove(item.quarantinePath);
          item.status = 'purged';
          item.purgedAtUtc = new Date(this.now()).toISOString();
          await this._commit(doc);
          purged.push(item.id);
        } catch (err) {
          blocked.push({ id: item.id, reason: String(err.message || err) });
        }
      }
      return { purged, blocked };
    });
  }

  // Read-only crash recovery report: never guess whether a partially moved file can be deleted.
  async inspectIntents() {
    const doc = await this._ledger();
    const result = [];
    for (const item of Object.values(doc.records)) {
      if (!['move-intent', 'restore-intent', 'purge-intent'].includes(item.status)) continue;
      result.push({ id: item.id, status: item.status,
        originalExists: await this.files.exists(item.originalPath),
        quarantinedExists: await this.files.exists(item.quarantinePath),
        instruction: 'Manual reconciliation after hash and physical-path checks; no automatic delete.' });
    }
    return result;
  }
}

module.exports = { SafeQuarantine, RETENTION_MS };

};
factories["review-gate"]=function(module,exports,require){
'use strict';

// Store must be persistent and independent of the last-150 operation log cap.
// Each review event must be given a stable, immutable key by the sync core.
class ReviewNotificationGate {
  constructor(store, operationLog) {
    if (!store || typeof store.load !== 'function' || typeof store.persist !== 'function' ||
        !operationLog || typeof operationLog.appendOnce !== 'function') throw new Error('REVIEW_DEPENDENCIES_REQUIRED');
    this.store = store;
    this.operationLog = operationLog;
    this.opening = new Set();
  }
  async _state() {
    const s = await this.store.load() || {};
    return { schema: 'vaultrelay-review-gate.v1', shownEvents: s.shownEvents || {}, openedTransfers: s.openedTransfers || {} };
  }
  async presentLocalDeletedOnce(deletedEvents) {
    if (!Array.isArray(deletedEvents)) throw new Error('EVENT_LIST_REQUIRED');
    const state = await this._state();
    const rows = [];
    for (const event of deletedEvents) {
      if (!event || typeof event.stableKey !== 'string' || !event.stableKey ||
          event.status !== 'local-deleted') throw new Error('STABLE_DELETION_EVENT_REQUIRED');
      if (!state.shownEvents[event.stableKey] && !rows.some(r => r.stableKey === event.stableKey)) rows.push(event);
    }
    return rows;
  }
  async commitShownLocalDeleted(deletedEvents) {
    const fresh = await this.presentLocalDeletedOnce(deletedEvents);
    const state = await this._state();
    // Append to idempotent persistent audit BEFORE suppressing future prompts.
    for (const e of fresh) {
      await this.operationLog.appendOnce({ id: 'review-local-deleted:' + e.stableKey,
        type: 'local-deleted-observed', eventKey: e.stableKey,
        message: 'Read-only review: local deletion record was displayed once; no file was deleted.' });
      state.shownEvents[e.stableKey] = new Date().toISOString();
    }
    if (fresh.length) await this.store.persist(state);
    return fresh.length;
  }
  // Historical conflicts and local deletion tombstones NEVER re-trigger auto-review.
  async shouldAutoOpen({ transferId, newlyReceived, newActionableEvents }) {
    if (typeof transferId !== 'string' || !transferId) return false;
    if (newlyReceived !== true || !Array.isArray(newActionableEvents) ||
        newActionableEvents.length === 0) return false;
    const state = await this._state();
    return !state.openedTransfers[transferId] && newActionableEvents.some(e =>
      e && typeof e.stableKey === 'string' && e.stableKey &&
      ['pending-create', 'pending-update', 'new-conflict', 'new-fork'].includes(e.status));
  }
  // Single-flight helper for the actual auto-review trigger; a timer/foreground
  // event cannot open the same transfer twice while the first modal is opening.
  async openAutoReviewOnce(input, openModal) {
    const id = input && input.transferId;
    if (typeof openModal !== 'function' || typeof id !== 'string' || !id) return false;
    if (this.opening.has(id)) return false;
    this.opening.add(id);
    try {
      if (!(await this.shouldAutoOpen(input))) return false;
      const opened = await openModal();
      if (opened !== true) return false;
      await this.markAutoOpened(id);
      return true;
    } finally { this.opening.delete(id); }
  }
  // Call only after review modal was actually shown, not after a routine scan.
  async markAutoOpened(transferId) {
    if (typeof transferId !== 'string' || !transferId) throw new Error('TRANSFER_ID_REQUIRED');
    const state = await this._state();
    if (state.openedTransfers[transferId]) return false;
    state.openedTransfers[transferId] = new Date().toISOString();
    await this.store.persist(state);
    return true;
  }
}
module.exports = { ReviewNotificationGate };

};
factories["console-refresh"]=function(module,exports,require){
'use strict';

// Publish only after state and operation journal have been saved successfully.
class ConsoleRefreshHub {
  constructor() { this.revision = 0; this.subscribers = new Set(); }
  subscribe(renderFromPersistedState) {
    if (typeof renderFromPersistedState !== 'function') throw new Error('RENDER_CALLBACK_REQUIRED');
    this.subscribers.add(renderFromPersistedState);
    return () => this.subscribers.delete(renderFromPersistedState);
  }
  publishSavedOperation(kind, details = {}) {
    if (!['zip-created', 'zip-published', 'ack-accepted', 'ack-published',
      'quarantine-staged', 'quarantine-restored', 'quarantine-purged', 'settings-saved'].includes(kind)) {
      throw new Error('UNKNOWN_COMMITTED_OPERATION');
    }
    this.revision++;
    const event = { kind, revision: this.revision, details };
    const errors = [];
    for (const fn of [...this.subscribers]) {
      try { fn(event); } catch (err) { errors.push(String(err)); }
    }
    return { event, renderErrors: errors }; // UI failures cannot rewrite a committed transaction.
  }
}
module.exports = { ConsoleRefreshHub };

};
factories["v525-live"]=function(module,exports,require){
'use strict';
/* Vault Relay V5.2.9 live integration.  No automatic deletion, ever. */
const { SafeQuarantine } = require("quarantine");
const { evaluatePacketClearance } = require("ack-clearance");
const { ReviewNotificationGate } = require("review-gate");
const { ConsoleRefreshHub } = require("console-refresh");
const { assertOwnedArtifact, assertQuarantine } = require("path-guard");
const RX_SHA = /^[0-9a-f]{64}$/i;
const RX_ID = /^vr-[a-z0-9]{16,64}$/;
const MS_DAY = 86400000;
const clone = value => JSON.parse(JSON.stringify(value));

class V525LiveService {
  constructor(plugin, { Platform, Bridge, Lifecycle, Zip }) {
    this.p=plugin; this.platform=Platform; this.tools=Bridge.__testing; this.lifecycle=Lifecycle;this.zip=Zip;
    this.refresh=new ConsoleRefreshHub();
    this.reviewGate=new ReviewNotificationGate({
      load:async()=>this.p.data.v525ReviewState||null,
      persist:async doc=>{this.p.data.v525ReviewState=clone(doc);await this.p.persistTransport();}
    }, {
      appendOnce:async event=>{
        const seen=this.p.data.v525AuditEntries ||= {};
        if(seen[event.id])return;
        seen[event.id]={atUtc:new Date().toISOString(),type:event.type,eventKey:event.eventKey};
        await this.p.log('本机历史删除记录 · 首次提示',
          '已展示一次只读删除事件（'+event.eventKey+'）；后续只在操作记录中保留。未删除正式笔记或版本墓碑');
      }
    });
    const a=this.p.app.vault.adapter;
    const qFiles={
      exists:path=>a.exists(path),
      readBinary:async path=>new Uint8Array(await a.readBinary(path)),
      rename:(oldPath,newPath)=>a.rename(oldPath,newPath),
      ensureDir:path=>this.tools.ensureVaultFolder(a,path),
      remove:path=>a.remove(path)
    };
    this.quarantine=new SafeQuarantine({
      files:qFiles,
      ledger:{
        load:async()=>this.p.data.v525CleanupLedger || null,
        persist:async doc=>{this.p.data.v525CleanupLedger=clone(doc);await this.p.persistTransport();}
      },
      physicalGuard:{confirmSafe:input=>this.physicalPathsSafe(input)},
      core:{
        getVerifiedPacketContext:id=>this.packetContext(id),
        assertNotBusy:async id=>this.isIdle(id)
      },
      hashBytes:bytes=>this.tools.sha256(bytes),
      newId:()=>this.tools.randomHex(32),
      now:()=>Date.now(),
      allowPermanentDelete:false
    });
  }
  record(id){return (this.p.data.bundleRecords||[]).find(x=>x && x.id===id)||null;}
  isIdle(id){
    if(this.p.data.desktopTransportEnabled===true||this.p._mobileScanPromise||
       this.p._mobileSourcePromise||this.p._v525StageBusy)return false;
    const rec=this.record(id);
    return !!rec && rec.stored?.kind==='vault' && !['deleted','cleaned'].includes(rec.status);
  }
  physicalPathsSafe({paths,operation}) {
    if(!this.platform.isDesktopApp || !['quarantine','restore','purge'].includes(operation) ||
       !Array.isArray(paths)||paths.length!==2) return false;
    // No Node/Electron path APIs on Android or iPadOS. Fail CLOSED there.
    let fs,path;
    try{fs=require('node:fs');path=require('node:path');}catch(_){return false;}
    const root=this.p.app.vault.adapter?.getBasePath?.() || this.p.app.vault.adapter?.basePath;
    if(typeof root!=='string'||!path.isAbsolute(root))return false;
    const base=path.resolve(root);
    const inside=(parent,target)=>target===parent || target.startsWith(parent+path.sep);
    // Reject junctions, symlinks and reparse points in all existing segments.
    try{
      const baseStat=fs.lstatSync(base);
      if(!baseStat.isDirectory() || baseStat.isSymbolicLink())return false;
      const cloudDirs=[this.p.data.windowsCloudDir,this.p.data.windowsCloudActiveRoot]
        .filter(x=>typeof x==='string'&&path.isAbsolute(x))
        .map(x=>path.resolve(x));
      if(cloudDirs.some(x=>inside(base,x)||inside(x,base)))return false;
      for(const rel of paths){
        if(rel.startsWith('VaultRelay-Transfer/quarantine/'))assertQuarantine(rel);
        else assertOwnedArtifact(rel);
        const actual=path.resolve(base,...rel.split('/'));
        if(!inside(base,actual))return false;
        if(cloudDirs.some(cloud=>inside(cloud,actual)||inside(actual,cloud)))return false;
        let cur=base;
        const pieces=rel.split('/');
        for(let i=0;i<pieces.length;i++){
          cur=path.join(cur,pieces[i]);
          let stat;
          try{stat=fs.lstatSync(cur);}catch(e){if(e.code==='ENOENT')continue;return false;}
          if(stat.isSymbolicLink())return false;
          if(i<pieces.length-1 && !stat.isDirectory())return false;
          if(i===pieces.length-1 && !stat.isFile())return false;
          // realpath is a second check for Windows junction aliasing.
          if(!inside(base,fs.realpathSync(cur)))return false;
        }
      }
      return true;
    }catch(_){return false;}
  }
  async checkedAckRows(){
    const p=this.p,s=p.engine?.state;
    if(!s || s.groupId!==p.data.groupId || !s.receivedAcks ||
        typeof s.receivedAcks!=='object')return [];
    const rows=[];
    for(const entry of Object.values(s.receivedAcks)){
      if(!entry || entry.format!=='vaultrelay.ack.v2' ||
         entry.vaultGroupId!==p.data.groupId || entry.toDeviceId!==s.deviceId ||
         !RX_ID.test(entry.fromDeviceId||'') ||
         !['applied','same'].includes(entry.outcome) ||
         !RX_SHA.test(entry.ackId||''))continue;
      const basis=s.groupId+'|'+s.deviceId+'|'+entry.versionId+'|'+
        (entry.contentSha256||'delete')+'|'+entry.outcome+'|'+entry.fromDeviceId;
      if(await this.tools.sha256(new TextEncoder().encode(basis))!==entry.ackId)continue;
      rows.push({...entry,verifiedByCore:true});
    }
    return rows;
  }
  async packetContext(id){
    const p=this.p,rec=this.record(id),s=p.engine?.state;
    if(!rec || rec.stored?.kind!=='vault' ||
       !/^VaultRelay-Transfer\/(?:outgoing|temporary)\/[^/]+\.zip$/i.test(rec.stored?.path||'') ||
       !RX_SHA.test(rec.sha256||'') || !rec.eligible || !s ||
       s.groupId!==p.data.groupId || rec.groupId!==s.groupId ||
       rec.senderId!==s.deviceId || !Array.isArray(rec.versions) ||
       rec.versions.length===0 || !rec.versions.every(v=>v && typeof v.path==='string'&&v.path) ||
       !['any','all','manual'].includes(rec.ackPolicy))return null;
    const versions=rec.versions.map(v=>({
      packId:v.packId,versionId:v.versionId,path:v.path,contentSha256:v.contentSha256??null
    }));
    const published=rec.v525CloudVerified?.zipSha256===rec.sha256 &&
      rec.v525CloudVerified?.groupId===rec.groupId;
    const planned=await this.packetDependencies(rec);
    const packet={packetId:rec.id,zipSha256:rec.sha256,vaultGroupId:rec.groupId,
      senderDeviceId:rec.senderId,versions,
      policy:{mode:rec.ackPolicy,expectedDeviceIds:rec.recipients||[],
        sealedAtUtc:new Date(rec.createdAt).toISOString()}};
    return {artifactPath:rec.stored.path,packet,verifiedAckRows:await this.checkedAckRows(),
      context:{evidenceTrusted:true,coreLedgerDurable:!!p.data.v2?.receivedAcks,
        publicationConfirmed:published,publicationEvidence:published?'manual-cloud-check':null,
        activeTransfer:!this.isIdle(id),
        unresolvedConflict:planned.conflict,rollbackDependency:planned.rollback,
        unresolvedReceiverDependency:planned.unknown}};
  }
  async packetDependencies(rec){
    const affected=new Set(rec.versions.map(x=>x.path));
    const undo=(this.p.data.undoOperations||[]).some(tx=>tx.status==='available'&&
      (tx.items||[]).some(item=>affected.has(item.path)));
    try{
      const plan=await this.p.engine.latestPlan();
      if(!plan || !Array.isArray(plan.items))return {conflict:true,rollback:undo,unknown:true};
      const conflict=plan.items.some(x=>affected.has(x.path)&&
        ['conflict','fork','local-error','delete-review','local-update'].includes(x.status));
      return {conflict,rollback:undo,unknown:false};
    }catch(_){return {conflict:true,rollback:undo,unknown:true};}
  }
  async preview(){
    const records=await this.quarantine.preview();
    const managed=new Set(records.filter(x=>['move-intent','quarantined','restore-intent','purge-intent'].includes(x.status))
      .map(x=>x.packetId));
    const outgoing=[];
    for(const rec of (this.p.data.bundleRecords||[]).slice(-250).reverse()){
      if(!rec||!rec.name || !['pending','cloud-confirmed'].includes(rec.status))continue;
      const cloud=rec.stored?.kind==='cloud';
      const rel=rec.stored?.path||'(未知路径)';
      let eligible=false,code='NOT_VERIFIED',reason='仍需验证 ACK、发布状态与本地依赖';
      if(cloud){code='CLOUD_SYNC_PROTECTED';reason='百度本地同步盘：禁止清理（可能影响云端备份）';}
      else if(managed.has(rec.id)){code='ALREADY_QUARANTINED';reason='已有隔离或事务记录；请查看下方记录';}
      else if(rec.stored?.kind!=='vault'){code='NOT_VAULT_OWNED';reason='不是插件自有知识库副本，禁止隔离';}
      else if(!rec.v525CloudVerified){code='PUBLICATION_UNVERIFIED';reason='云端发布尚未由用户核实；ACK 不证明云端有备份';}
      else {
        try{
          const ctx=await this.packetContext(rec.id);
          if(!ctx)throw Error('缺少不可变的原始版本/策略映射');
          const result=evaluatePacketClearance(ctx.packet,ctx.verifiedAckRows,ctx.context);
          eligible=result.eligible;code=result.code;
          reason=eligible?'满足完整 ACK，已确认云端发布；可手动移入30天隔离区':
            '尚不能隔离：'+result.code;
        }catch(e){reason='安全复核未通过：'+String(e.message||e);}
      }
      outgoing.push({id:rec.id,kind:'outgoing',path:rel,name:rec.name,
        eligible,code,reason,cloud,
        canConfirm:rec.stored?.kind==='vault'&&!managed.has(rec.id)&&
          !rec.v525CloudVerified?.zipSha256});
    }
    const inbound=(this.p.data.inboundRecords||[]).slice(-75).reverse().map(rec=>({
      id:rec.bundleId||rec.sha256,kind:'download',name:rec.name||'',path:rec.path||'',eligible:false,
      code:'DOWNLOAD_CLEANUP_DISABLED',
      reason:rec.kind==='cloud'?'百度同步目录入站原件保护，不删除':
        rec.kind==='external'?'系统公共下载原件归其他应用管理，禁止删除':
        '移动端临时下载副本清理尚需独立 ACK 回传实机确认；本测试版保留文件'}));
    return {outgoing,inbound,records,blocked:[...outgoing,...inbound].filter(x=>!x.eligible),
      eligible:outgoing.filter(x=>x.eligible),retentionDays:30,automaticPurge:false,
      incidents:await this.quarantine.inspectIntents()};
  }
  async confirmCloudPublication(packetId){
    const rec=this.record(packetId);
    if(!this.platform.isDesktopApp || !rec||rec.stored?.kind!=='vault'||!RX_SHA.test(rec.sha256||''))
      throw Error('仅允许在 Windows 对知识库内的待发送 ZIP 手工核实云端备份');
    const rel=rec.stored.path;assertOwnedArtifact(rel);
    const bytes=new Uint8Array(await this.p.app.vault.adapter.readBinary(rel));
    if(await this.tools.sha256(bytes)!==rec.sha256)throw Error('本地待发送 ZIP 的 SHA 已改变');
    rec.v525CloudVerified={atUtc:new Date().toISOString(),zipSha256:rec.sha256,
      groupId:rec.groupId,by:'user-manual-confirmation'};
    await this.p.persistTransport();
    await this.p.log('V5.2.9 云端备份人工确认','用户确认已在百度网盘云端核对本包：'+rec.name+
      '；仅作为资格证据，不代表插件已验证服务器内容');
  }
  async stage(packetId){
    const rec=this.record(packetId);
    if(!this.platform.isDesktopApp||!rec||rec.stored?.kind!=='vault')
      throw Error('本版本仅允许 Windows 中插件自有 outgoing/temporary ZIP 进入隔离');
    const result=await this.quarantine.quarantineZip({packetId,
      sourcePath:rec.stored.path,expectedSha256:rec.sha256});
    await this.p.log('V5.2.9 安全隔离','已进入30天隔离：'+result.originalPath+' → '+result.quarantinePath+
      '；到期日 '+result.purgeNotBeforeUtc+'；期间可恢复，未删除云端任何文件');
    return result;
  }
  async restore(id){
    const result=await this.quarantine.restore(id);
    await this.p.log('V5.2.9 隔离恢复','恢复 '+result.originalPath+'；SHA 复核通过');
    return result;
  }
  async deletedPresentation(plan){
    if(!plan || !Array.isArray(plan.items))return {plan,shown:[]};
    const raw=plan.items.filter(x=>x?.status==='local-deleted');
    if(!raw.length)return {plan,shown:[]};
    const all=[];
    for(const item of raw){
      const known=this.p.engine?.state?.known?.[item.path];
      const versionId=item.version?.versionId||known?.versionId;
      // If identity is not stable, keep the row; never suppress uncertain events.
      if(typeof item.path!=='string'||!versionId)continue;
      all.push({stableKey:this.p.data.groupId+'|'+item.path+'|'+versionId,
        status:'local-deleted',path:item.path});
    }
    const shown=await this.reviewGate.presentLocalDeletedOnce(all);
    const visible=new Set(shown.map(e=>e.stableKey));
    const excluded=new Set(all.filter(e=>!visible.has(e.stableKey)).map(e=>e.path));
    const filtered=plan.items.filter(x=>x.status!=='local-deleted'||!excluded.has(x.path));
    const count=filtered.filter(x=>x.status==='local-deleted').length;
    return {plan:{...plan,items:filtered,counts:{...plan.counts,
      'local-deleted':count}},shown};
  }
  async confirmDeletedShown(shown){
    if(Array.isArray(shown)&&shown.length)
      await this.reviewGate.commitShownLocalDeleted(shown);
  }
  // Parse only the validated transport contents. Source ZIP paths are
  // authoritative for whether the *new* receipt caused an actionable change.
  async pathsInVerifiedReport(report){
    const paths=new Set();
    if(!report||!Array.isArray(report.contents)||!this.zip?.loadAsync)return [];
    for(const content of report.contents){
      if(!/^content\/[^/]+\.zip$/i.test(content?.path||''))continue;
      try{
        const archive=await this.zip.loadAsync(content.data,{checkCRC32:true});
        const entry=archive.file('manifest.json');if(!entry)continue;
        const mf=JSON.parse(await entry.async('text'));
        if(mf.format!=='vaultrelay.content.v2'||
           mf.vaultGroupId!==this.p.data.groupId||
           !Array.isArray(mf.entries)||mf.entries.length>60)continue;
        for(const e of mf.entries){
          if(['upsert','delete'].includes(e?.op) && this.tools.safeRel(e?.path))
            paths.add(e.path);
        }
      }catch(_){ /* Incomplete/unparseable content never triggers an auto-modal. */ }
    }
    return [...paths].slice(0,500);
  }
  async autoReviewAllowed(transferId,plan,receivedPaths){
    if(!transferId||!plan||!Array.isArray(receivedPaths)||!receivedPaths.length)return false;
    const latestPaths=new Set(receivedPaths);
    const mapped=(plan.items||[]).filter(x=>latestPaths.has(x.path)&&[
      'create','safe-update','conflict','fork','delete-review'].includes(x.status)).map(x=>({
      stableKey:x.path+'|'+(x.version?.versionId||x.version?.packId||'new'),
      status:['create','safe-update'].includes(x.status)?'pending-create':'new-conflict'
    }));
    return this.reviewGate.shouldAutoOpen({transferId,newlyReceived:true,
      newActionableEvents:mapped});
  }
  async markAutoReviewOpened(transferId){
    await this.reviewGate.markAutoOpened(transferId);
    if(this.p.data.v525PendingAutoReview?.id===transferId){
      this.p.data.v525PendingAutoReview=null;await this.p.persistTransport();
    }
  }
}
module.exports={V525LiveService};

};
  function req(name){
    if(!Object.prototype.hasOwnProperty.call(factories,name))return require(name);
    if(cache[name])return cache[name].exports;
    const module={exports:{}};cache[name]=module;
    factories[name](module,module.exports,req);return module.exports;
  }
  return req('v525-live');
})();


/*
 * V4.0.14 manual-only provenance diagnostics.
 * Build a JSON view from already verified content manifests and a read-only
 * latestPlan(). Never call safeApply(), safeExport(), backup() or cleanups.
 * It is evidence about stored history, NOT proof of a Baidu upload or deletion.
 */
function v413SourceTrace(plan,engine,redact){
  const byPath=plan?.catalog?.byPath||{};
  const state=engine?.state||{};
  const paths=typeof engine?.paths==='function'?engine.paths():{};
  let contentRoot='';
  try{if(typeof engine?.dirs==='function')contentRoot=engine.dirs(false).content;}
  catch(_){/* An unbound desktop root must not break diagnostic export. */}
  const slash=p=>String(p||'').replace(/\\/g,'/').replace(/\/+$/,'');
  const locationOf=v=>{
    const file=slash(v?.packPath);
    for(const [location,root] of [
      ['inbox',paths?.inbox],
      ['outbox',paths?.outbox],
      ['windows-content',contentRoot]
    ]){
      const dir=slash(root);
      if(dir && file.startsWith(dir+'/'))return location;
    }
    return 'unknown';
  };
  const devicePlatform=v=>{
    const label=String(v?.originName||'');
    if(/ipad(?:os)?/i.test(label))return 'iPadOS';
    if(/android/i.test(label))return 'Android';
    if(/windows/i.test(label))return 'Windows';
    return 'unknown';
  };
  const statusReason=(item,known)=>{
    switch(item.status){
      case 'local-deleted':
        return '本机已知历史头版本为 upsert，但当前文件缺失；已从待新增/自动恢复中移出，等待人工确认发布删除版本或有条件撤销未共享草稿。';
      case 'create':
        return known?.op==='upsert'
          ? '历史最新版本为 upsert、本机文件不存在；本机仍保存旧版本记录。无法仅凭缺失判断是主动删除还是尚未接收。'
          : '历史最新版本为 upsert、本机文件不存在；可能是外部新文件，也可能是此前删除的旧文件。';
      case 'safe-update':return '本机内容匹配已知旧版本，历史存在后继版本；候选为安全更新，仍须人工确认。';
      case 'same':return '本机文件字节 SHA 与当前历史版本一致。';
      case 'equivalent':return '本机 Markdown 与接收版本仅有允许的换行/BOM 等效差异。';
      case 'local-update':return '本机文件不同于历史头，但已知版本关系表明这是本机编辑；不应直接覆盖。';
      case 'delete-review':return '历史最新版本为 delete，本机文件还存在；需要人工审核删除。';
      case 'absent':return '历史最新版本为 delete，本机也没有该文件。';
      case 'conflict':return '本机与历史内容不同，无法证明可自动安全合并。';
      case 'fork':return '历史有分叉或版本链缺失，不应自动写入。';
      case 'local-error':return '本机文件不可正常读取，不能安全比较。';
      default:return '版本计划给出的只读状态；不能据此推断用户是否删除文件。';
    }
  };
  const priority={'local-deleted':0,create:1,'safe-update':2,'delete-review':3,
    conflict:3,fork:4,'local-error':5,'local-update':6,
    same:7,equivalent:8,absent:9};
  const planItems=Array.isArray(plan?.items)?plan.items:[];
  const internalPath=p=>/^(?:\.obsidian|VaultRelay-Transfer)(?:\/|$)/i.test(String(p||''));
  const eligible=planItems.filter(x=>x&&typeof x.path==='string'&&!internalPath(x.path));
  eligible.sort((a,b)=>(priority[a.status]??15)-(priority[b.status]??15)||
    a.path.localeCompare(b.path));
  const maxRows=400,maxSourceVersions=12;
  const rows=eligible.slice(0,maxRows).map(item=>{
    const path=item.path,known=state.known?.[path]||null;
    const versions=Array.isArray(byPath[path])?byPath[path]:[];
    const ordered=versions.slice().sort((a,b)=>
      String(b.eventAtUtc||b.createdAtUtc||'').localeCompare(
        String(a.eventAtUtc||a.createdAtUtc||'')) ||
      String(b.versionId||'').localeCompare(String(a.versionId||'')));
    const localHas=plan.local?Object.prototype.hasOwnProperty.call(plan.local,path):
      item.localHash!=null;
    const originHist={inbox:0,outbox:0,'windows-content':0,unknown:0};
    for(const version of versions)originHist[locationOf(version)]++;
    const latest=item.version||null;
    const sourceVersions=ordered.slice(0,maxSourceVersions).map(v=>{
      const fromId=String(v.originDeviceId||'');
      const originRole=fromId&&state.deviceId
        ?(fromId===state.deviceId?'self':'another-device'):'unknown';
      const archive=String(v.packName||slash(v.packPath).split('/').pop()||'');
      return {
        versionId:String(v.versionId||''),
        operation:v.op==='delete'?'delete':v.op==='upsert'?'upsert':'unknown',
        eventAtUtc:String(v.eventAtUtc||''),
        packCreatedAtUtc:String(v.createdAtUtc||''),
        archiveName:redact(archive).slice(0,260),
        storage:locationOf(v),
        originRole,originPlatform:devicePlatform(v),
        sha256Prefix:typeof v.sha256==='string'?v.sha256.slice(0,16):null,
        chosenHead:!!latest&&latest.versionId===v.versionId,
        matchesKnownVersion:!!known&&known.versionId===v.versionId
      };
    });
    const currentRole=latest?.originDeviceId&&state.deviceId
      ?(latest.originDeviceId===state.deviceId?'self':'another-device'):'unknown';
    const evidence=[
      item.localHash==null?'local-hash-unavailable':'local-hash-present',
      known?'has-known-version':'no-known-version',
      latest?.op==='upsert'?'latest-upsert':latest?.op==='delete'?'latest-delete':'no-unique-latest'
    ];
    if(item.status==='local-deleted')
      evidence.push('recognized-local-deletion-requires-user-action');
    if(item.status==='create'&&currentRole==='self')
      evidence.push('local-outbound-version-may-need-deletion-review');
    return {
      relativePath:redact(path),
      reviewStatus:String(item.status||'unknown'),
      reason:statusReason(item,known),
      localExists:item.status==='local-error'?'unreadable':localHas,
      localSha256Prefix:typeof item.localHash==='string'?item.localHash.slice(0,16):null,
      lastKnown:known?{
        operation:known.op||'unknown',
        versionId:String(known.versionId||''),
        sha256Prefix:typeof known.sha256==='string'?known.sha256.slice(0,16):null,
        matchesCandidate:!!latest&&known.versionId===latest.versionId
      }:null,
      selectedHead:latest?{
        versionId:String(latest.versionId||''),
        operation:String(latest.op||'unknown'),
        originRole:currentRole,
        originPlatform:devicePlatform(latest),
        eventAtUtc:String(latest.eventAtUtc||'')
      }:null,
      versionCount:versions.length,
      sourceLocationCounts:originHist,
      sourceVersions,
      truncatedSources:Math.max(0,versions.length-sourceVersions.length),
      evidence
    };
  });
  return {
    status:'ok',schema:1,mode:'manual-export-read-only',
    relativePathsIncluded:true,
    summary:{
      planItems:eligible.length,
      includedRows:rows.length,
      truncatedRows:Math.max(0,eligible.length-rows.length),
      maxRows,maxSourceVersions,
      contentPackageCount:plan?.catalog?.count||0,
      catalogWarningsCount:plan?.catalog?.warnings?.length||0,
      reviewCounts:plan?.counts||{}
    },
    catalogWarnings:(plan?.catalog?.warnings||[]).slice(0,15)
      .map(x=>({file:redact(x.file||''),error:redact(x.error||'')})),
    rows,
    interpretation:[
      'inbox/outbox 只是本机交换目录；不证明对应内容包曾上传到百度网盘。',
      'create 只说明最新历史版本为 upsert 且本机无文件，不证明用户一定删除过。',
      '同一路径可以有多个历史版本，sourceVersions 按时间倒序，可能存在多个物理副本。',
      '相对文件路径会出现在本报告中；对外分享前可检查是否含私人名称。',
      '诊断不改变正式笔记、不修改版本历史、不生成删除墓碑。'
    ]
  };
}

class VaultRelayV4 extends UnifiedBase {
  async onload(){
    // Transport settings and directory registration first; native state is
    // then loaded into this same plugin's data.json (one plugin, one state).
    await UnifiedBase.prototype.onload.call(this);
    this._v525=new V525.V525LiveService(this,{Platform:OBS.Platform,Bridge,Lifecycle,Zip});
    VR527UI.observe(this);
    this.assertVault();
    this._vrRuntimeErrors=[];
    if(typeof window!=='undefined' && typeof this.registerDomEvent==='function'){
      const record=(value)=>{
        const message=String(value||'');
        if(!/vault.?relay|vault-relay-v4/i.test(message))return;
        this._vrRuntimeErrors.unshift({time:new Date().toISOString(),
          message:message.slice(0,1800)});
        this._vrRuntimeErrors.length=Math.min(this._vrRuntimeErrors.length,40);
      };
      this.registerDomEvent(window,'error',ev=>
        record(String(ev.message||'')+' '+String(ev.filename||'')+' '+
          String(ev.error?.stack||'')));
      this.registerDomEvent(window,'unhandledrejection',ev=>
        record(String(ev.reason?.stack||ev.reason||'')));
    }
    // Per-device download source: never rewrite identities, cloud binding or old ledgers.
    if(typeof this.data.mobileSourcePath!=='string')
      this.data.mobileSourcePath=OBS.Platform.isAndroidApp?
        '/storage/emulated/0/Download/BaiduNetdisk/':'';
    if(!this.data.mobileSourceLedger ||
       typeof this.data.mobileSourceLedger!=='object' ||
       Array.isArray(this.data.mobileSourceLedger))
      this.data.mobileSourceLedger={};
    // V4.0.7 might have cached a valid legacy Windows envelope as rejected,
    // before we distinguished transport IDs from native/core device IDs.
    // Retry existing rejected external-source signatures exactly once after
    // this upgrade; preserve history and all successful/received records.
    if(!OBS.Platform.isDesktopApp && !this.data.transportIdCompat408Retried){
      for(const record of Object.values(this.data.mobileSourceLedger)){
        if(record && record.status==='rejected')record.status='retry';
      }
      this.data.transportIdCompat408Retried=true;
      await this.persistTransport();
    }
    this.persist=async()=>this.saveData(this.data);
    this.run=(task,...args)=>Native.prototype.run.call(this,async()=>{
      try{return await task();}
      catch(error){
        try{await this.log('核心操作未完成',String(error.message||error));}catch(_){}
        throw error;
      }
    },...args);
    if(OBS.Platform.isDesktopApp){
      this.changed=(...args)=>Native.prototype.changed.call(this,...args);
      this.exitFlush=(...args)=>Native.prototype.exitFlush.call(this,...args);
    }
    // A fresh installation has a permanent Device ID but no GroupID.
    // Do not even initialise the native group engine until a user creates or joins.
    if(!this.data.groupId && this.data.v2?.groupId)
      this.data.groupId=this.data.v2.groupId; // Preserve existing v4 installations.
    if(!this.data.groupId){
      this.data.desktopTransportEnabled=false;
      await this.persistTransport();
      await this.log('等待群组配置','本机 Device ID 已保存；请创建群组或粘贴已有 GroupID');
      return;
    }
    await this.activateNativeEngine();
    if(OBS.Platform.isDesktopApp && this.engine?.state?.syncEnabled){
      this.engine.state.syncEnabled=false;
      await this.persistTransport();
      await this.log('方案 A 写入保护',
        'V4.0.10 已暂停 Windows 旧版正式笔记自动应用；自动 ZIP/ACK 运输开关与历史配置保留不变。正式内容必须在审核窗口人工确认');
    }
  }
  // V5.2.9 replaces the legacy 7-day and mirrored-cloud cleanup entrypoints.
  // Never call the legacy destructive helpers, even from hourly/background scans.
  async safeCleanup({automatic=false}={}){
    if(!automatic)await this.log('V5.2.9 清理保护',
      '旧版立即删除流程已禁止。请使用30天隔离预览；同步盘与云端永不自动清理');
    return {sending:0,downloads:0,acks:0,cloud:0};
  }
  async cleanupAckConfirmed(){return {deleted:0,pending:(this.data.bundleRecords||[]).length,blocked:0};}
  async removeVerifiedAckCopies(){return 0;}
  async deleteVerifiedCloudCopies(){throw Error('V5.2.9 禁止删除百度本地同步盘与云端文件');}
  async checkTemporary(deleteConfirmed=false,silent=false){
    if(deleteConfirmed)throw Error('V5.2.9 禁止旧版立即删除；请使用30天隔离');
    return UnifiedBase.prototype.checkTemporary.call(this,false,silent);
  }
  async log(kind,message){
    await UnifiedBase.prototype.log.call(this,kind,message);
    if(this._v525)this._v525.refresh.publishSavedOperation(
      /ZIP|增量包/.test(kind)?'zip-created':'settings-saved',{kind});
  }
  async inspectCleanup(){
    const report=await this.v525CleanupPreview();
    return {...report,rows:[...report.outgoing,...report.inbound]};
  }
  async v525CleanupPreview(){return this._v525.preview();}
  async v525ConfirmCloudPublication(id){return this._v525.confirmCloudPublication(id);}
  async v525Stage(id){return this._v525.stage(id);}
  async v525Restore(id){return this._v525.restore(id);}
  async v525FilterReviewPlan(plan){return this._v525.deletedPresentation(plan);}
  async v525CommitDeletedShown(events){return this._v525.confirmDeletedShown(events);}

  async v520RebindMovedVault(){
    if(!OBS.Platform.isDesktopApp||!this.data?.v2?.shareRoot)return {changed:false};
    const fs=require('node:fs'),path=require('node:path');
    const base=this.app.vault?.adapter?.getBasePath?.()||this.app.vault?.adapter?.basePath;
    if(!base)throw Error('无法取得当前 Windows 知识库绝对路径');
    const vault=path.resolve(base),old=path.resolve(this.data.v2.shareRoot);
    const now=path.join(vault,'VaultRelay-Transfer','engine');
    if(old===now)return {changed:false};
    // Custom/external share roots are not relocated by guessing their purpose.
    if(path.basename(old)!=='engine'||path.basename(path.dirname(old))!=='VaultRelay-Transfer')
      return {changed:false,external:true};
    const oldVault=path.dirname(path.dirname(old));
    if(oldVault===vault)return {changed:false};
    if(fs.existsSync(old))throw Error('旧知识库交换区仍存在：'+old+
      '。疑似知识库复制而非移动；为防 Device ID 重复，已拒绝自动重绑定。');
    if(this.data.v2.groupId!==this.data.groupId)
      throw Error('移动后 GroupID 不一致，拒绝自动重绑定');
    const group=this.data.groupId;
    if(!/^vg-[a-z0-9]{16,40}$/.test(group))throw Error('移动后 GroupID 格式无效');
    const pieces=[vault,path.join(vault,'VaultRelay-Transfer'),now,
      path.join(now,'VaultRelay'),path.join(now,'VaultRelay',group),
      ...['content','info','ack'].map(part=>path.join(now,'VaultRelay',group,part))];
    for(const dir of pieces){
      const st=fs.lstatSync(dir,{throwIfNoEntry:false});
      if(!st||!st.isDirectory()||st.isSymbolicLink())
        throw Error('知识库移动后的内部交换目录缺失或不安全：'+dir);
    }
    const rebase=path.join(now,'VaultRelay',group);
    const oldLegacy=path.join(old,'VaultRelay',group);
    if(this.data.windowsLegacyDir && path.resolve(this.data.windowsLegacyDir)!==oldLegacy)
      throw Error('旧版同步核心交换路径不是标准内部路径，拒绝自动重绑定');
    // Only the canonical vault-internal paths change. The Baidu cloud mirror,
    // immutable version history, GroupID and DeviceID remain untouched.
    this.data.v2.shareRoot=now;
    this.data.windowsLegacyDir=rebase;
    this.data.vaultMoveNotice='已从失效旧目录重新定位至当前知识库；外部百度同步目录不变';
    await this.persistTransport();
    await this.log('知识库移动 · 安全重绑定','同步核心交换区已重新定位到当前知识库；'+
      'GroupID、DeviceID、known/ACK 和百度网盘外部位置均未重置');
    return {changed:true};
  }
  async activateNativeEngine(){
    if(this.engine?.state)return;
    if(!/^vg-[a-z0-9]{16,40}$/.test(this.data.groupId||''))
      throw Error('只有创建或加入群组后才允许初始化同步核心');
    // Brand-new V4 installations reuse exactly one persisted author/device ID
    // in both the transport envelope and the native v1.1 protocol.
    if(!this.data.v2) {
      this.data.v2={
        schema:2,deviceId:this.data.deviceId,groupId:this.data.groupId,
        known:{},processed:{},seenInfo:{},seenAck:{},acks:{},
        publishedAckIds:{},receivedAcks:{},devices:{},drafts:{},
        seq:0,messageSeq:0,shareRoot:'',syncEnabled:false,
        groupName:this.data.groupName||this.app.vault.getName(),
        displayName:this.data.displayName||'',
        setupComplete:false,mobileActivated:true
      };
      await this.persistTransport();
    }
    await this.v520RebindMovedVault();
    const oldAddCommand=this.addCommand,oldAddRibbon=this.addRibbonIcon;
    this.addCommand=function(){return null;};
    this.addRibbonIcon=function(){return null;};
    try{await Native.prototype.onload.call(this);}
    finally{this.addCommand=oldAddCommand;this.addRibbonIcon=oldAddRibbon;}
    if(!this.engine?.state)throw Error('同步核心初始化失败');
    await this.setupNative();
    // One-time V4.0.3 migration: upgrade an already configured Windows mirror
    // with an identity marker; never require folder name = GroupID.
    if(OBS.Platform.isDesktopApp && this.data.windowsCloudDir){
      try{
        if(!this.data.windowsCloudActiveRoot)
          await this.bindWindowsSpace(this.data.windowsCloudDir);
        else this.cloudConfig(); // Marker must still be present and correct.
      }catch(e){
        this.data.desktopTransportEnabled=false;
        await this.log('Windows 同步空间待验证',String(e.message||e)+
          '。已暂停自动运输；请在设置中重新指定实际同步文件夹');
      }
    }
    // Periodic safe housekeeping: never erase unacknowledged ZIP or outgoing ACK.
    this.registerInterval(setInterval(()=>{
      this.safeCleanup({automatic:true}).catch(e=>console.warn('Vault Relay safe housekeeping:',e));
    },3600000));
    if(!OBS.Platform.isDesktopApp)this.setupMobileInboxObserver();
  }

  setupMobileInboxObserver(){
    if(OBS.Platform.isDesktopApp || this._mobileInboxObserverReady)return;
    this._mobileInboxObserverReady=true;
    const schedule=reason=>{
      if(typeof document!=='undefined' && document.visibilityState==='hidden')return;
      if(this._mobileScanTimer)clearTimeout(this._mobileScanTimer);
      this._mobileScanTimer=setTimeout(()=>{
        this._mobileScanTimer=null;
        this.scanMobileReception({reason,notify:false})
          .then(()=>{if(this._vrReviewPending)this.scheduleReadOnlyReview();})
          .catch(e=>this.log('移动端自动扫描失败',String(e.message||e))
            .catch(()=>console.warn('Vault Relay mobile scan:',e)));
      },650);
    };
    // DOM focus and visibility are standard WebView events, unlike a guessed
    // Obsidian application 'resume' event. Either may be missed by an OS;
    // visible-only periodic polling and an explicit scan are conservative backups.
    if(typeof document!=='undefined')this.registerDomEvent(document,
      'visibilitychange',()=>{if(document.visibilityState==='visible')schedule('return');});
    if(typeof window!=='undefined'){
      this.registerDomEvent(window,'focus',()=>schedule('return'));
      this.registerDomEvent(window,'pageshow',()=>schedule('return'));
    }
    this.registerInterval(setInterval(()=>{
      if(typeof document!=='undefined' && document.visibilityState==='hidden')return;
      this.scanMobileReception({reason:'periodic',notify:false})
        .then(()=>{if(this._vrReviewPending)this.scheduleReadOnlyReview();})
        .catch(e=>console.warn('Vault Relay mobile inbox:',e));
    },18000));
    if(typeof this.register==='function')this.register(()=>{
      if(this._mobileScanTimer)clearTimeout(this._mobileScanTimer);
    });
    // Includes files left behind by a previously interrupted receive.
    this.scanMobileReception({reason:'startup',notify:false})
      .catch(e=>console.warn('Vault Relay mobile inbox startup:',e));
  }


  // V4.0.7: best-effort public Android Downloads probe. This uses only a File
  // API ALREADY EXPOSED by the Obsidian host; it neither installs a native
  // plugin nor requests broad storage permissions. Scoped storage may deny it.
  normalizeMobileSourcePath(value){
    const raw=String(value||'').trim();
    if(!raw)return '';
    if(raw.length>800 || /[\x00-\x1f\\?#]/.test(raw) ||
       /(?:^|\/)\.{1,2}(?:\/|$)/.test(raw) ||
       /%2e|%2f|%5c/i.test(raw))throw Error('目录路径含有非法字符或上级跳转');
    const url=raw.startsWith('/')?'file://'+raw:raw;
    if(!url.startsWith('file:///'))throw Error('只接受 Android 公共存储的绝对路径');
    let parsed;
    try{parsed=new URL(url);}catch(_){throw Error('下载目录路径格式无效');}
    if(parsed.hostname || parsed.search || parsed.hash ||
       !/^\/(?:storage\/(?:emulated\/[0-9]+|[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4})|sdcard)(?:\/|$)/.test(parsed.pathname) ||
       /\/Android\/(?:data|obb)(?:\/|$)/i.test(parsed.pathname))
      throw Error('只接受当前 Android 可读取的共享存储路径，不允许进入 Android/data/obb');
    return parsed.href.endsWith('/')?parsed.href:parsed.href+'/';
  }
  async setMobileSourcePath(value){
      if(OBS.Platform.isDesktopApp)throw Error('此项仅供移动端使用');
      const path=this.normalizeMobileSourcePath(value);
      this.data.mobileSourcePath=path;
      this.data.mobileLastSource=null;
      await this.persistTransport();
      await this.log('本机下载源目录已更新',path||'已关闭自动扫描外部下载目录');
      return;
  }
  // A historical "restored" marker alone does not prove core exchange files
  // still exist. Cleaned receipts are final, but a restored receipt must have
  // an exact set of SHA-verified inbox payloads before it may be skipped.
  async mobileReceiptIntact(sha){
    const rec=(this.data.inboundRecords||[]).find(x=>x.sha256===sha);
    if(!rec)return false;
    if(['cleaned','staging-cleaned'].includes(rec.status))return true;
    if(rec.status!=='restored' || !Array.isArray(rec.files) ||
       !rec.files.length || !rec.fileHashes ||
       typeof rec.fileHashes!=='object')return false;
    const adapter=this.app.vault.adapter;
    for(const rolePath of rec.files){
      if(!Bridge.__testing.safeEntry(rolePath) ||
         !/^(?:content|info|ack)\//.test(rolePath) ||
         !/^[a-f0-9]{64}$/.test(rec.fileHashes[rolePath]||''))return false;
      const path='VaultRelay-Transfer/inbox/'+rolePath;
      if(!await adapter.exists(path))return false;
      const raw=new Uint8Array(await adapter.readBinary(path));
      if(await Bridge.__testing.sha256(raw)!==rec.fileHashes[rolePath])
        return false;
      if(rolePath.startsWith('ack/')){
        // Mixed bundles retain their original, validated ACK bytes in inbox.
        // Check both SHA and the canonical device/batch path before deduping.
        try{
          const name=rolePath.split('/').pop();
          const ack=await Bridge.__testing.validateRawAck(raw,name,this.data.groupId);
          if(rolePath!=='ack/'+ack.device+'/'+ack.canonicalName)return false;
        }catch(_){return false;}
      }
    }
    return true;
  }

  async mobileSourceMaySkip(past,name){
    if(!past || !past.sha256)return false;
    if(['outgoing','irrelevant'].includes(past.status))return true;
    // Do not repeatedly report the same corrupt ZIP SHA at every app resume.
    // A changed filename/SHA is a new candidate; manual picker is always usable.
    if(past.status==='rejected')return true;
    if(!['copied','received','direct'].includes(past.status))return false;
    if(/\.json$/i.test(name)){
      const record=this.data.mobileInboxLedger?.['VaultRelay-Transfer/temporary/'+name];
      if(record && record.sha256===past.sha256 &&
         ['received','outgoing','irrelevant'].includes(record.status))return true;
    }else if(await this.mobileReceiptIntact(past.sha256))return true;
    const path='VaultRelay-Transfer/temporary/'+name;
    if(!await this.app.vault.adapter.exists(path))return false;
    const bytes=new Uint8Array(await this.app.vault.adapter.readBinary(path));
    return await Bridge.__testing.sha256(bytes)===past.sha256;
  }

  async readMobileSourceBlob(blob){
    let data;
    if(blob && typeof blob.arrayBuffer==='function'){
      data=await blob.arrayBuffer();
    }else if(typeof FileReader!=='undefined'){
      data=await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(reader.result);
        reader.onerror=()=>reject(reader.error||Error('文件读取失败'));
        reader.readAsArrayBuffer(blob);
      });
    }else throw Error('宿主不支持读取系统选中的文件');
    return new Uint8Array(data);
  }
  mobileFileFromBytes(name,bytes){
    const raw=Bridge.__testing.buffer(bytes);
    return {name,size:bytes.byteLength,arrayBuffer:async()=>raw};
  }
  async validateMobileInput(file,bytes,{stageFirst=false}={}){
    if(!file || !/^[^\/\\:\x00-\x1f]{1,155}$/.test(file.name||'') ||
       file.name.startsWith('.') || /[. ]$/.test(file.name))
      throw Error('非法文件名');
    const isZip=/\.zip$/i.test(file.name);
    if(!isZip && !Bridge.__testing.validAckName(file.name))
      throw Error('不是合法的增量 ZIP 或独立 ACK 文件名');
    if(bytes.length<(isZip?22:10) ||
       bytes.length>(isZip?Bridge.__testing.MAX_BUNDLE_BYTES:1024*1024))
      throw Error('ZIP/ACK 文件大小不符合安全限制');
    const sha=await Bridge.__testing.sha256(bytes);
    if((this.data.bundleRecords||[]).some(x=>x.name===file.name && x.sha256!==sha))
      throw Error('与本机发送文件重名且内容不同，拒绝导入');
    if((this.data.inboundRecords||[]).some(x=>x.name===file.name && x.sha256!==sha))
      throw Error('与已经接收的 ZIP 重名且 SHA 不同，拒绝导入');
    if(isZip){
      const report=await ImportManager.inspect(file,
        {app:this.app,plugin:this,desktop:false});
      if(report.kind!=='incremental' ||
         report.contents.some(x=>!/^(content|info|ack)\//.test(x.path)))
        throw Error('非合法增量 ZIP，或混入了未校验的交换内容');
      if(!Bridge.__testing.validTransportDeviceId(report.transportDeviceId))
        throw Error('ZIP 来源 DeviceID 无效');
      if(report.transportDeviceId===this.engine.state.deviceId)
        return {status:'outgoing',sha};
      if(!stageFirst && await this.mobileReceiptIntact(sha))
        return {status:'received',sha};
    }else{
      const ack=await Bridge.__testing.validateRawAck(bytes,file.name,this.data.groupId);
      if(ack.device===this.engine.state.deviceId)return {status:'outgoing',sha};
      if(!ack.entries.some(x=>x.toDeviceId===this.engine.state.deviceId))
        return {status:'irrelevant',sha};
    }
    return {status:'incoming',sha};
  }
  async copyMobileInputToTemporary(file,bytes,sha){
    const target='VaultRelay-Transfer/temporary/'+file.name;
    const adapter=this.app.vault.adapter;
    await this.ensureLayout();
    if(await adapter.exists(target)){
      const old=new Uint8Array(await adapter.readBinary(target));
      if(await Bridge.__testing.sha256(old)!==sha)
        throw Error('temporary 同名不同内容，禁止覆盖');
      return {path:target,created:false};
    }
    await adapter.writeBinary(target,Bridge.__testing.buffer(bytes));
    const check=new Uint8Array(await adapter.readBinary(target));
    if(await Bridge.__testing.sha256(check)!==sha)
      throw Error('temporary 复制后 SHA 回读失败；不删除源文件');
    return {path:target,created:true};
  }
  async importMobileChosenFiles(chosen){
    if(OBS.Platform.isDesktopApp)throw Error('此入口只用于移动端');
    this.assertGroup();
    if(!this.engine?.state)throw Error('同步核心尚未就绪');
    const files=Array.from(chosen||[]);
    if(!files.length)return {copied:0,direct:0,skipped:0,errors:0};
    if(files.length>24)throw Error('一次最多选择 24 个文件');
    const result={copied:0,direct:0,skipped:0,errors:0,paths:[]};
    let total=0;
    for(const file of files){
      try{
        if(!Number.isSafeInteger(file.size) || file.size<0 ||
           file.size>Bridge.__testing.MAX_BUNDLE_BYTES)
          throw Error('文件大小未知或超过安全上限');
        total+=file.size;
        if(total>100*1024*1024)throw Error('本批读取总量超过 100 MB');
        const bytes=await this.readMobileSourceBlob(file);
        if(bytes.length!==file.size)
          throw Error('文件选择后大小发生变化；请完成下载后再选取');
        const snapshot=this.mobileFileFromBytes(file.name,bytes);
        // Validate format and device identity BEFORE writing any untrusted bytes,
        // but do NOT let a historical receipt pre-empt the copy stage.
        const check=await this.validateMobileInput(snapshot,bytes,{stageFirst:true});
        if(check.status!=='incoming'){result.skipped++;continue;}
        const saved=await this.copyMobileInputToTemporary(snapshot,bytes,check.sha);
        result.paths.push(saved.path);
        result.copied++;
        await this.log('文件选择器 · 安全转入',file.name+
          (saved.created?' 已安全复制':' 已有相同 SHA 的安全副本')+
          '到 temporary；下载原件未删除');
      }catch(e){
        result.errors++;
        await this.log('文件选择器 · 转入失败',
          String(file.name||'未知文件')+'：'+String(e.message||e)+
          '；未尝试就地解包，下载原件保留');
      }
    }
    // The only ingestion and ZIP/ACK handling entry point for BOTH routes.
    const after=await this.scanMobileTemporary({
      reason:'file-picker',notify:false,verifiedPaths:result.paths});
    result.zip=after.zip;result.ack=after.ack;
    await this.log('手动选取文件处理完成',
      '复制/核对 temporary '+result.copied+'、跳过 '+result.skipped+
      '、转入失败 '+result.errors+
      '；统一 temporary 新接收 ZIP '+after.zip+'、ACK '+after.ack+
      '；正式笔记仍需人工确认');
    new OBS.Notice('系统选文件：转入 '+result.copied+'，失败 '+
      result.errors+'；新接收 ZIP '+after.zip+
      '。若有新内容将自动打开只读版本审核。',6500);
    return result;
  }
  mobileCapacitorFilesystem(){
    const host=globalThis?.Capacitor ||
      (typeof window!=='undefined'?window.Capacitor:null);
    const fs=host?.Plugins?.Filesystem;
    return fs && typeof fs.readdir==='function' &&
      typeof fs.stat==='function' && typeof fs.readFile==='function'?fs:null;
  }
  mobileCapPathOptions(directory,name=null){
    const uri=this.normalizeMobileSourcePath(directory);
    const raw=decodeURIComponent(new URL(uri).pathname).replace(/\/$/,'');
    const encoded=name===null?'':encodeURIComponent(name);
    const unescaped=name===null?'':name;
    const base=uri.replace(/\/$/,'');
    const list=[
      {path:base+(name===null?'':'/'+encoded),directory:null},
      {path:raw+(name===null?'':'/'+encoded),directory:null},
      {path:base+(name===null?'':'/'+unescaped)},
      {path:raw+(name===null?'':'/'+unescaped)}
    ];
    return list;
  }
  async mobileCapCall(fs,method,options){
    let timer;
    try{
      return await Promise.race([
        Promise.resolve().then(()=>fs[method](options)),
        new Promise((_,reject)=>{timer=setTimeout(()=>
          reject(Error('Android '+method+' 接口超时')),10000);})
      ]);
    }finally{if(timer)clearTimeout(timer);}
  }
  async mobileCapTry(fs,method,opts,validator){
    let last=null;
    for(const options of opts){
      try{
        const answer=await this.mobileCapCall(fs,method,options);
        if(!validator || validator(answer))return answer;
        last=Error('Android '+method+' 返回了无效数据');
      }catch(e){last=e;}
    }
    throw last||Error('Android '+method+' 无可用路径调用');
  }
  async mobileCapStat(fs,directory,name){
    const opts=this.mobileCapPathOptions(directory,name);
    const st=await this.mobileCapTry(fs,'stat',opts,x=>
      x&&Number.isSafeInteger(x.size)&&x.size>=0);
    const m=st.mtime??st.lastModified;
    const mtime=Number.isFinite(m)?m:
      typeof m==='string'&&Number.isFinite(Date.parse(m))?Date.parse(m):null;
    return {size:st.size,mtime};
  }
  async mobileCapRead(fs,directory,name,size){
    const max=Math.min(24*1024*1024,Bridge.__testing.MAX_BUNDLE_BYTES);
    if(!Number.isSafeInteger(size)||size<1||size>max)
      throw Error('Android 原生自动读取单文件上限为 24 MiB');
    const attempts=this.mobileCapPathOptions(directory,name);
    let last;
    for(const opts of attempts){
      try{
        const result=await this.mobileCapCall(fs,'readFile',opts);
        const data=result?.data;
        let bytes;
        if(data&&typeof data.arrayBuffer==='function'){
          if(data.size>max)throw Error('Android Blob 大小超出上限');
          bytes=new Uint8Array(await data.arrayBuffer());
        }else{
          if(typeof data!=='string')throw Error('Android 原生读取未返回 base64');
          const start=data.startsWith('data:')?data.indexOf(',')+1:0;
          if(start<0)throw Error('Android data URI 不完整');
          const base64=data.slice(start).replace(/\s/g,'');
          if(base64.length>Math.ceil(max*4/3)+8 ||
             !/^[A-Za-z0-9+/]*={0,2}$/.test(base64))
            throw Error('Android 原生文件返回无效或过大的 base64');
          if(typeof atob!=='function')throw Error('WebView 不提供 base64 解码接口');
          const decoded=atob(base64);
          if(decoded.length>max)throw Error('Android 文件解码后超过 24 MiB');
          bytes=new Uint8Array(decoded.length);
          for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);
        }
        if(bytes.length!==size)
          throw Error('Android 下载文件在读取中大小变化，拒绝复制');
        return Bridge.__testing.buffer(bytes);
      }catch(e){last=e;}
    }
    throw last||Error('Capacitor Filesystem.readFile 失败');
  }
  async getMobileDownloadEntries(path){
    // Prefer Capacitor: it has been verified on Redmi K60 to list and read
    // the Baidu download directory with no system file picker.
    const fs=this.mobileCapacitorFilesystem();
    if(fs){
      const opts=this.mobileCapPathOptions(path);
      let listing;
      try{
        listing=await this.mobileCapTry(fs,'readdir',opts,x=>
          x&&Array.isArray(x.files));
      }catch(capErr){
        if(typeof window==='undefined' ||
           typeof window.resolveLocalFileSystemURL!=='function')throw capErr;
        // Fall back to the existing Cordova entry layer if another Android
        // host has it. Nothing is opened by the user in this path.
        await this.log('Capacitor 下载目录不可用',
          String(capErr.message||capErr)+'；尝试已存在的 Cordova 接口');
      }
      if(listing){
        if(listing.files.length>1600)throw Error('目录超过 1600 项，本轮扫描无法覆盖此目录，请手动选择文件');
        const output=[],started=Date.now();let unknownCount=0;
        // Bound native bridge metadata calls on older Capacitor releases
        // whose directory listing supplies only filenames, not file types.
        for(let offset=0;offset<listing.files.length;offset+=8){
          if(Date.now()-started>4500)
            throw Error('目录类型识别耗时过长，未完成覆盖；请缩小扫描范围或使用系统选文件');
          const chunk=await Promise.all(listing.files.slice(offset,offset+8).map(async x=>{
          const name=typeof x==='string'?x:x?.name;
          let type=typeof x==='string'?'unknown':String(x?.type||'unknown');
          if(typeof name!=='string'||name.length>155 ||
             !/^[^\/\\:\x00-\x1f]{1,155}$/.test(name) ||
             name.startsWith('.') || /[. ]$/.test(name) ||
             /%2f|%5c|%2e/i.test(name))return null;
          if(type==='unknown' && typeof fs.stat==='function'){
            unknownCount++;
            if(unknownCount>240)
              throw Error('无类型目录项超过 240 个，本轮停止以避免手机卡顿');
            try{
              const st=await this.mobileCapTry(fs,'stat',
                this.mobileCapPathOptions(path,name),v=>v&&typeof v.type==='string');
              type=String(st.type||'unknown');
            }catch(_){/* Treat an unresolved unknown as a file, not an assumed directory. */}
          }
          const directory=/directory/i.test(type);
          const unknownType=!/^(?:file|directory)$/i.test(type);
          return {
            name,isFile:!directory,isDirectory:directory,unknownType,
            file:(resolve,reject)=>{
              this.mobileCapStat(fs,path,name).then(stat=>{
                resolve({
                  name,size:stat.size,lastModified:stat.mtime,
                  arrayBuffer:()=>this.mobileCapRead(fs,path,name,stat.size)
                });
              }).catch(reject);
            }
          };
          }));
          output.push(...chunk.filter(Boolean));
          if(offset%64===0)await new Promise(resolve=>setTimeout(resolve,0));
        }
        return output;
      }
    }
    if(typeof window==='undefined' ||
       typeof window.resolveLocalFileSystemURL!=='function')
      throw Error('Obsidian 未提供 Capacitor Filesystem 或 Cordova 目录读取接口');
    const dir=await new Promise((resolve,reject)=>
      window.resolveLocalFileSystemURL(path,resolve,reject));
    if(!dir?.isDirectory || typeof dir.createReader!=='function')
      throw Error('设置的下载路径不是可读取的文件夹');
    const reader=dir.createReader(),rows=[];
    for(let page=0;page<20;page++){
      const chunk=await new Promise((resolve,reject)=>
        reader.readEntries(resolve,reject));
      if(!chunk?.length)return rows;
      rows.push(...chunk);
      if(rows.length>1600)throw Error('目录超过 1600 项，本轮扫描无法覆盖此目录');
    }
    throw Error('下载目录条目过多，停止自动读取');
  }
  async readMobileDownloadEntry(entry){
    const first=await new Promise((resolve,reject)=>entry.file(resolve,reject));
    const getTime=f=>{
      const m=f?.lastModifiedDate instanceof Date?
        f.lastModifiedDate.getTime():f?.lastModified;
      return Number.isFinite(m)?m:null;
    };
    if(!first || !Number.isSafeInteger(first.size))
      throw Error('无法取得源文件大小');
    if(getTime(first)!==null && Date.now()-getTime(first)<4500)
      return {pending:true};
    // Re-stat after a short common stability interval in caller.
    return {file:first,size:first.size,mtime:getTime(first)};
  }
  mobileDownloadLooksLikeExchange(name){
    if(/\.json$/i.test(name))return Bridge.__testing.validAckName(name);
    return /^VR-[A-Z][a-z]{1,2}[0-9][A-Z][a-z]{1,2}[0-9]-\d{12}-[0-9]{2}[a-f0-9]{12}\.zip$/i.test(name) ||
      /^VR-[A-Z][a-z]{1,2}[0-9][A-Z][a-z]{1,2}[0-9][0-9]{14}[a-f0-9]{8,24}\.zip$/i.test(name) ||
      /^.{1,100}_\d{8}T\d{6}Z_(?:Windows|Android|iOS)_[0-9a-f]{10}\.zip$/i.test(name);
  }
  async scanMobileDownloadSource({reason='manual'}={}){
    if(!OBS.Platform.isAndroidApp)
      return {state:'not-applicable',copied:0,direct:0,paths:[]};
    if(this._mobileSourcePromise)return this._mobileSourcePromise;
    const full=['review','manual','full'].includes(reason);
    const task=async()=>{
      const result={state:'ok',scope:full?'all-accessible':'priority',
        copied:0,direct:0,skipped:0,errors:0,pending:0,paths:[],detail:'',
        scannedDirs:0,unreadableDirs:0,pendingDirs:0,candidateFiles:0};
      const hasApi=!!this.mobileCapacitorFilesystem() ||
        typeof window!=='undefined' && typeof window.resolveLocalFileSystemURL==='function';
      if(!hasApi){result.state='no-native-api';result.detail='宿主未提供目录读取接口';return result;}
      const ledger=this.data.mobileSourceLedger ||= {};
      const seen=new Set(),queue=[];
      const add=(path,depth=0)=>{
        try{
          const normalized=this.normalizeMobileSourcePath(path);
          if(!normalized||seen.has(normalized))return;
          seen.add(normalized);queue.push({path:normalized,depth});
        }catch(_){}
      };
      // Priority order is intentional: previous successful folders first,
      // configured folders next, then broad shared-storage roots.
      for(const dir of (this.data.mobileRecentDirs||[]).slice(0,24))add(dir);
      add(this.data.mobileSourcePath||'/storage/emulated/0/Download/BaiduNetdisk/');
      for(const dir of (this.data.mobileExtraSources||[]).slice(0,20))add(dir);
      if(full)for(const dir of (this.data.mobilePendingScanDirs||[]).slice(0,500)){
        if(typeof dir==='string')add(dir);
        else if(dir && typeof dir==='object')add(dir.path,Math.min(9,Math.max(0,Number(dir.depth)||0)));
      }
      for(const dir of ['/storage/emulated/0/Download/BaiduNetdisk/',
        '/storage/emulated/0/Download/','/storage/emulated/0/Documents/'])add(dir);
      if(full){
        // Some Android hosts grant access to the entire public shared volume;
        // others permit only Download or the user-selected file. Both outcomes
        // are shown. Never claim that a denied root was scanned.
        add('/storage/emulated/0/');
      }
      if(!queue.length){result.state='not-configured';return result;}
      const candidates=[],dirCap=full?600:16,entryCap=full?12000:1000;
      const started=Date.now(),maxMs=full?14000:2800,seenItems=new Set();
      let listed=0;
      this._mobileScanCancelled=false;
      // Iterate native directories in small chunks. On Android scoped storage
      // inaccessible roots/subdirectories are reported, never bypassed.
      while(queue.length && result.scannedDirs<dirCap && listed<entryCap &&
            Date.now()-started<maxMs && !this._mobileScanCancelled){
        const current=queue.shift();
        let entries;
        try{entries=await this.getMobileDownloadEntries(current.path);}
        catch(err){
          result.unreadableDirs++;
          if(result.unreadableDirs<=4)result.detail+=
            (result.detail?'；':'')+current.path+': '+String(err.message||err).slice(0,85);
          continue;
        }
        result.scannedDirs++;
        listed+=entries.length;
        // A host that omits native entry types may hide subdirectories.
        // Mark coverage partial even if matching filenames were processed.
        if(entries.some(e=>e?.unknownType)){
          result.unreadableDirs++;
          result.detail+=(result.detail?'；':'')+current.path+
            '：系统未报告部分目录项的类型，子目录覆盖不完整';
        }
        for(const entry of entries){
          if(!entry?.name)continue;
          if(entry.isDirectory && current.depth<(full?9:1)){
            // Do not inspect hidden OS/application-specific subtrees, or the
            // app's private Android/data/obb directories.
            if(/^(?:\.obsidian|VaultRelay-Transfer|\.|lost\+found)$/i.test(entry.name))continue;
            if(/\/Android\/$/i.test(current.path)&&/^(?:data|obb)$/i.test(entry.name))continue;
            add(current.path+encodeURIComponent(entry.name)+'/',current.depth+1);
          }else if(entry.isFile && this.mobileDownloadLooksLikeExchange(entry.name)){
            const key=current.path+encodeURIComponent(entry.name);
            if(seenItems.has(key))continue;
            seenItems.add(key);
            candidates.push({entry,key,dir:current.path});
          }
        }
        if(result.scannedDirs%8===0)await new Promise(resolve=>setTimeout(resolve,0));
      }
      result.candidateFiles=candidates.length;
      result.pendingDirs=queue.length;
      if(full){
        this.data.mobilePendingScanDirs=queue.slice(0,500).map(x=>({path:x.path,depth:x.depth}));
      }
      if(result.pendingDirs||result.unreadableDirs||this._mobileScanCancelled)
        result.state=result.scannedDirs?'partial':result.unreadableDirs?'access-denied':'partial';
      const jobs=[];let bytesBudget=0;
      // No file contents read just for discovery. Only candidate ZIP/ACKs that
      // are new/changed by size+mtime are opened, and still require CRC/SHA.
      for(const row of candidates){
        try{
          const meta=await this.readMobileDownloadEntry(row.entry);
          if(meta.pending){result.pending++;continue;}
          const max=/\.zip$/i.test(row.entry.name)?
            Math.min(24*1024*1024,Bridge.__testing.MAX_BUNDLE_BYTES):1024*1024;
          if(meta.size<10||meta.size>max){result.errors++;continue;}
          const past=ledger[row.key];
          if(past && past.size===meta.size && past.mtime!==null &&
             meta.mtime!==null && past.mtime===meta.mtime &&
             await this.mobileSourceMaySkip(past,row.entry.name)){
            result.skipped++;continue;
          }
          jobs.push({...row,meta});
        }catch(err){result.errors++;}
      }
      jobs.sort((a,b)=>(b.meta.mtime||0)-(a.meta.mtime||0));
      const ready=[];
      for(const job of jobs){
        if(ready.length>=(full?24:8)||bytesBudget+job.meta.size>100*1024*1024){
          result.pending++;continue;
        }
        ready.push(job);bytesBudget+=job.meta.size;
      }
      if(ready.length)await new Promise(resolve=>setTimeout(resolve,1100));
      for(const {entry,meta,key,dir} of ready){
        if(this._mobileScanCancelled){result.state='partial';break;}
        let hashed='';
        try{
          const second=await this.readMobileDownloadEntry(entry);
          if(second.pending || second.size!==meta.size ||
             (second.mtime!==null && meta.mtime!==null && second.mtime!==meta.mtime)){
            result.pending++;continue;
          }
          const bytes=await this.readMobileSourceBlob(second.file);
          const last=await this.readMobileDownloadEntry(entry);
          if(last.pending || last.size!==meta.size || bytes.length!==meta.size ||
             (last.mtime!==null && meta.mtime!==null && last.mtime!==meta.mtime)){
            result.pending++;continue;
          }
          const sha=await Bridge.__testing.sha256(bytes);hashed=sha;
          const past=ledger[key];
          if(past?.sha256===sha && await this.mobileSourceMaySkip(past,entry.name)){
            result.skipped++;continue;
          }
          if(past?.sha256 && past.sha256!==sha &&
             ['copied','direct','received'].includes(past.status))
            throw Error('下载源同名文件的 SHA 已改变，拒绝覆盖旧接收记录');
          const chosen=this.mobileFileFromBytes(entry.name,bytes);
          const check=await this.validateMobileInput(chosen,bytes,{stageFirst:true});
          if(check.status!=='incoming'){
            ledger[key]={sha256:sha,status:check.status,size:meta.size,
              mtime:meta.mtime,at:Date.now()};result.skipped++;continue;
          }
          const stored=await this.copyMobileInputToTemporary(chosen,bytes,sha);
          result.paths.push(stored.path);result.copied++;
          ledger[key]={sha256:sha,status:'copied',size:meta.size,
            mtime:meta.mtime,at:Date.now()};
          this.data.mobileRecentDirs=[dir,...(this.data.mobileRecentDirs||[]).filter(x=>x!==dir)].slice(0,24);
          await this.log('Android 多目录安全转入',dir+entry.name+
            ' → '+stored.path+'；已回读校验 SHA，原下载文件保留');
        }catch(err){
          result.errors++;
          if(hashed)ledger[key]={sha256:hashed,status:'rejected',size:meta.size,
            mtime:meta.mtime,at:Date.now()};
          await this.log('Android 多目录文件拒绝',dir+entry.name+': '+
            String(err.message||err).slice(0,160)+'；正式笔记未改动');
        }
      }
      // A skipped or still-downloading candidate also means the pass has
      // NOT completed fully, even if every directory was listed.
      if(result.pending||result.errors)result.state='partial';
      if(Object.keys(ledger).length>3000){
        // Never discard an existing signature merely because its source
        // directory was not reached on a partial scan. Bound with oldest
        // entries first; keep the latest 3000 for stale file protection.
        const ordered=Object.entries(ledger).sort((a,b)=>(a[1]?.at||0)-(b[1]?.at||0));
        for(const [key] of ordered.slice(0,ordered.length-3000))delete ledger[key];
      }
      this.data.mobileLastSource={at:Date.now(),state:result.state,
        scope:result.scope,scannedDirs:result.scannedDirs,
        unreadableDirs:result.unreadableDirs,pendingDirs:result.pendingDirs,
        candidateFiles:result.candidateFiles,detail:result.detail,
        copied:result.copied,skipped:result.skipped,errors:result.errors,
        pending:result.pending};
      await this.persistTransport();
      return result;
    };
    this._mobileSourcePromise=task();
    try{return await this._mobileSourcePromise;}
    finally{this._mobileSourcePromise=null;}
  }
  cancelMobileDownloadScan(){this._mobileScanCancelled=true;}
  async recheckAckStatus(){
    if(!this.engine)throw Error('请先创建或加入群组');
    if(!OBS.Platform.isDesktopApp){
      const count=Object.keys(this.engine.state?.acks||{}).length;
      await this.log('手机 ACK 状态核对','本机已生成 '+count+' 条反馈；是否已被 Windows 接收，必须在 Windows 核对');
      return {localOnly:true,generated:count};
    }
    // Safe receive-only scan works while outbound transport is paused.
    if(this.agent?.receiveOnly)await this.agent.receiveOnly();
    const before=Object.keys(this.engine.state?.receivedAcks||{}).length;
    await this.engine.receiveAck();
    const after=Object.keys(this.engine.state?.receivedAcks||{}).length;
    await this.safeCleanup({automatic:true});
    await this.log('Windows ACK 状态核对','本次新增登记 '+Math.max(0,after-before)+
      ' 条；累计已接收 '+after+' 条。未满足清理条件的包继续保留；未写入正式笔记');
    return {accepted:Math.max(0,after-before),received:after};
  }

  async reviewMobileScanResult(received){
    if(!received || !(received.source?.copied||received.local?.zip))return null;
    // A scan is a receipt event, not an explicit request to inspect history.
    // Use the same durable transfer gate as foreground/periodic reception.
    return this.showReviewAfterReceive({reason:'automatic'});
  }

  async scanMobileReception({reason='manual',notify=true}={}){
    if(OBS.Platform.isDesktopApp)throw Error('Windows 接收流程保持原配置');
    const awaiting=!!this._mobileAwaitingDownloadAt &&
      Date.now()-this._mobileAwaitingDownloadAt<6*3600000;
    const source=await this.scanMobileDownloadSource({reason});
    const local=await this.scanMobileTemporary({
      reason,notify:false,verifiedPaths:source.paths||[]});
    const missing=['no-native-api','access-denied','source-error','not-configured','partial']
      .includes(source.state);
    const details='可访问目录扫描 '+source.scannedDirs+' 个、未授权/不可读 '+
      source.unreadableDirs+' 个、剩余待查 '+source.pendingDirs+' 个；新复制 '+
      source.copied+'、失败 '+source.errors+'；覆盖状态 '+source.state;
    const combined=details+'；'+local.summary;
    if(notify && (reason==='manual'||local.zip||local.ack||source.errors)){
      new OBS.Notice(combined+(missing?
        '。可使用「从系统文件夹选择增量包」兜底。':''),8000);
    }
    // Foreground and periodic scans are intentionally silent. Valid new
    // content triggers an independent read-only version review. No auto apply.
    
    return {source,local,summary:combined};
  }

  async scanMobileTemporary({reason='manual',notify=true,verifiedPaths=[]}={}){
    if(OBS.Platform.isDesktopApp)throw Error('Windows 请使用本机同步盘自动扫描');
    this.assertGroup();
    if(!this.engine?.state)throw Error('同步核心尚未就绪，暂不读取下载文件');
    if(this._mobileScanPromise){
      const result=await this._mobileScanPromise;
      if(reason==='manual' && notify)new OBS.Notice(result.summary,8000);
      return result;
    }
    const run=async()=>{
      await this.ensureLayout();
      const prefix='VaultRelay-Transfer/temporary/';
      const adapter=this.app.vault.adapter;
      const listing=await adapter.list('VaultRelay-Transfer/temporary');
      const all=(listing.files||[]).filter(x=>typeof x==='string'&&x.startsWith(prefix)&&
        !x.slice(prefix.length).includes('/'));
      if(all.length>600)throw Error('temporary 文件超过 600 个，已停止自动扫描；请检查临时区');
      const ledger=this.data.mobileInboxLedger;
      const summary={zip:0,ack:0,skipped:0,errors:0,pending:0,scanned:0,reason};
      const v525ReceivedHashes=[];
      const v525ReceivedPaths=new Set();
      const makeSummary=()=>`新接收 ZIP ${summary.zip}、ACK ${summary.ack}、跳过已处理 ${summary.skipped}、异常 ${summary.errors}`+
        (summary.pending?`、尚未写完/待稳定 ${summary.pending}`:'')+
        '。已收新文件时自动只读核对；正式笔记仍需人工确认写入';
      const snapshots=[];
      let newErrors=0, scanBytes=0;
      // ZIP filenames are a transport container, not a note or arbitrary JSON.
      for(const path of all){
        const name=path.slice(prefix.length);
        if(!/\.(?:zip|json)$/i.test(name))continue;
        if(!/^[^\/\\:\x00-\x1f]{1,155}$/.test(name) ||
           name.startsWith('.') || /[. ]$/.test(name)){
          summary.errors++;newErrors++;
          await this.log('移动端文件名拒绝',path.slice(0,180));continue;
        }
        if(/\.json$/i.test(name) && !Bridge.__testing.validAckName(name)){
          summary.skipped++;continue;
        }
        const st=await adapter.stat(path);
        if(!st || !Number.isSafeInteger(st.size) || st.size<0){
          summary.pending++;continue;
        }
        const mtime=Number.isFinite(st.mtime)?st.mtime:null;
        const stored=ledger[path];
        if(stored && stored.size===st.size && stored.mtime===mtime &&
           (['outgoing','irrelevant'].includes(stored.status) ||
             stored.status==='received' &&
             (/\.json$/i.test(name) ||
              await this.mobileReceiptIntact(stored.sha256)))){
          summary.skipped++;continue;
        }
        if(stored && stored.size===st.size && stored.mtime===mtime &&
           stored.status==='rejected' && Date.now()-stored.at<60000){
          summary.errors++;continue;
        }
        const max=/\.zip$/i.test(name)?Bridge.__testing.MAX_BUNDLE_BYTES:1024*1024;
        const min=/\.zip$/i.test(name)?22:10;
        if(st.size>max){
          summary.errors++;
          if(!stored || stored.size!==st.size || stored.mtime!==mtime){
            newErrors++;
            ledger[path]={status:'rejected',size:st.size,mtime,sha256:'',at:Date.now(),
              detail:'文件体积超过安全上限'};
            await this.log('移动端入站拒绝',name+'：文件体积超过安全上限');
          }
          continue;
        }
        if(st.size<min ||
           (mtime!==null && Date.now()-mtime<4500 && !verifiedPaths.includes(path))){
          summary.pending++;continue;
        }
        // Bound memory and work on mobile. Remaining files are handled on
        // the next foreground/periodic pass after completed ones enter ledger.
        if(snapshots.length>=12 || scanBytes+st.size>100*1024*1024){
          summary.pending++;continue;
        }
        scanBytes+=st.size;
        snapshots.push({path,name,size:st.size,mtime});
      }
      // One stability window for every candidate, not one sleep per file.
      if(snapshots.length)await new Promise(resolve=>setTimeout(resolve,1100));
      const unchanged=(st,orig)=>!!st && st.size===orig.size &&
        (!Number.isFinite(st.mtime) && orig.mtime===null || st.mtime===orig.mtime);
      for(const item of snapshots){
        const st=await adapter.stat(item.path);
        if(!unchanged(st,item)){summary.pending++;continue;}
        let bytes;
        try{bytes=new Uint8Array(await adapter.readBinary(item.path));}
        catch(_){summary.pending++;continue;}
        if(bytes.length!==item.size || !unchanged(await adapter.stat(item.path),item)){
          summary.pending++;continue;
        }
        summary.scanned++;
        const sha=await Bridge.__testing.sha256(bytes);
        const previous=ledger[item.path];
        if(previous && previous.sha256===sha &&
           (['outgoing','irrelevant'].includes(previous.status) ||
            previous.status==='received' &&
            (/\.json$/i.test(item.name) || await this.mobileReceiptIntact(sha)))){
          summary.skipped++;continue;
        }
        if(previous && previous.sha256 && previous.sha256!==sha &&
           ['received','outgoing'].includes(previous.status)){
          summary.errors++;
          if(previous.changedSha!==sha){
            newErrors++;
            previous.changedSha=sha;
            await this.log('移动端同名文件变化',item.name+
              '：已处理/本机发出的文件被替换，拒绝把新字节当作原文件');
          }
          continue;
        }
        const mark=(status,detail='')=>{
          ledger[item.path]={status,sha256:sha,size:item.size,mtime:item.mtime,
            at:Date.now(),detail:String(detail).slice(0,250)};
        };
        const file={name:item.name,size:item.size,
          arrayBuffer:async()=>Bridge.__testing.buffer(bytes)};
        try{
          if(/\.zip$/i.test(item.name)){
            const original=(this.data.bundleRecords||[]).find(x=>
              x.stored?.path===item.path && x.name===item.name);
            if(original){
              if(original.sha256!==sha)throw Error('本机待发 ZIP 的 SHA 被改变');
              mark('outgoing','本机待上传 ZIP');summary.skipped++;continue;
            }
            // Reuse the existing independent ZIP inspector's GroupID, CRC,
            // SHA, safe-path and manifest checks. No note writes are made.
            const report=await ImportManager.inspect(file,
              {app:this.app,plugin:this,desktop:false});
            if(report.kind!=='incremental')throw Error('不是合法的外层增量 ZIP');
            if(report.contents.some(x=>!/^(content|info|ack)\//.test(x.path)))
              throw Error('外层增量 ZIP 包含不受支持的交换路径');
            if(!Bridge.__testing.validTransportDeviceId(report.transportDeviceId))
              throw Error('ZIP 缺少合法来源 DeviceID');
            if(report.transportDeviceId===this.engine.state.deviceId){
              mark('outgoing','来源为本机 DeviceID');summary.skipped++;continue;
            }
            const existing=(this.data.inboundRecords||[]).find(x=>x.sha256===sha);
            if(existing && await this.mobileReceiptIntact(sha)){
              mark('received','历史接收记录及交换文件 SHA 均已核对');summary.skipped++;continue;
            }
            const reviewed=await this.storeDownloadedZip(file);
            await this.applyDownloaded(reviewed);
            mark('received','合法 ZIP 已恢复到同步核心交换区');summary.zip++;
            v525ReceivedHashes.push(sha);
            for(const notePath of await this._v525.pathsInVerifiedReport(reviewed.report))
              v525ReceivedPaths.add(notePath);
          }else{
            const ack=await Bridge.__testing.validateRawAck(bytes,item.name,this.data.groupId);
            if(ack.device===this.engine.state.deviceId){
              mark('outgoing','本机独立 ACK');summary.skipped++;continue;
            }
            if(!ack.entries.some(x=>x.toDeviceId===this.engine.state.deviceId)){
              mark('irrelevant','ACK 接收设备不是本机');summary.skipped++;continue;
            }
            await this.importRawAckFile(file);
            mark('received','合法独立 ACK 已由同步核心核对');summary.ack++;
          }
        }catch(e){
          const detail=String(e.message||e).slice(0,280);
          summary.errors++;newErrors++;
          mark('rejected',detail);
          await this.log('移动端入站拒绝',item.name+' · '+detail+
            '；原件保留，未触碰正式笔记');
        }
      }
      summary.summary=makeSummary();
      // Bound the durable ledger by pruning only paths no longer present. An
      // existing path is never forgotten simply because many scans occurred.
      if(Object.keys(ledger).length>1200){
        const present=new Set(all);
        for(const [path] of Object.entries(ledger)){
          if(!present.has(path))delete ledger[path];
        }
      }
      const important=summary.zip+summary.ack+newErrors>0 ||
        reason==='manual' || (summary.pending>0 && reason!=='periodic');
      if(important){
        this.data.mobileLastScan={time:Date.now(),summary:summary.summary};
        await this.log('移动端 temporary 安全扫描',summary.summary+
          '；扫描原因 '+reason+'，未执行任何正式笔记写入');
      }else if(summary.scanned || summary.skipped){
        await this.persistTransport(); // Save outgoing/duplicate signatures.
      }
      const awaiting=!!this._mobileAwaitingDownloadAt &&
        Date.now()-this._mobileAwaitingDownloadAt<6*3600000;
      if(reason==='return')this._mobileAwaitingDownloadAt=0;
      if(summary.zip>0&&v525ReceivedHashes.length){
        const unique=[...new Set(v525ReceivedHashes)].sort().join('|');
        const fingerprint=await Bridge.__testing.sha256(new TextEncoder().encode(unique));
        this.data.v525PendingAutoReview={id:'new-zip-'+fingerprint,
          receivedAtUtc:new Date().toISOString(),zipCount:summary.zip,
          paths:[...v525ReceivedPaths].slice(0,500)};
        await this.persistTransport();
        this._vrReviewPending=true;
        this.scheduleReadOnlyReview();
      }
      if(notify && reason==='manual'){
        new OBS.Notice(summary.summary,6500);
      }
      return summary;
    };
    this._mobileScanPromise=run();
    try{return await this._mobileScanPromise;}
    finally{this._mobileScanPromise=null;}
  }

  async createGroup(cloudParent=''){
    if(this.engine?.state || this.data.groupId)throw Error('已经绑定群组；不能覆盖现有群组与版本历史');
    this.data.cloudParentHint=String(cloudParent||'').trim().slice(0,500);
    this.data.groupId='vg-'+Bridge.__testing.randomHex(32);
    await this.persistTransport();
    await this.activateNativeEngine();
    await this.log('新群组已创建','GroupID '+this.data.groupId+
      '。云端文件夹可任意命名（例如 test1）；GroupID 只用来标识逻辑空间');
    return this.data.groupId;
  }
  async joinGroup(groupId){
    if(this.engine?.state || this.data.groupId)throw Error('已经绑定群组；不能覆盖现有群组与版本历史');
    const id=String(groupId||'').trim();
    if(!/^vg-[a-z0-9]{16,40}$/.test(id))throw Error('请输入完整有效的 GroupID');
    this.data.groupId=id;
    await this.persistTransport();
    await this.activateNativeEngine();
    await this.log('已加入群组','本机 Device ID 保持不变；GroupID '+id);
    return id;
  }
  getLegacy(){return this.engine?{engine:this.engine,data:this.data}:null;}
  currentLegacyGroup(){return this.engine?.state?.groupId||'';}
  async setupNative(){
    const s=this.engine.state;
    const saved=String(this.data.groupId||'');
    if(saved && saved!==s.groupId){
      if(Object.keys(s.known||{}).length)throw Error('当前设备已有历史，GroupID 不一致，拒绝切换');
      await this._applyCoreGroup(saved);
    }
    this.data.groupId=s.groupId;
    this.data.groupName ||= this.app.vault.getName();
    s.groupName=this.data.groupName;
    if(this.data.displayName)s.displayName=this.data.displayName;
    else this.data.displayName=s.displayName||this.app.vault.getName();
    s.setupComplete=true;
    if(OBS.Platform.isDesktopApp){
      const fs=require('node:fs'),path=require('node:path');
      const base=this.app.vault.adapter?.getBasePath?.()||this.app.vault.adapter?.basePath;
      if(!base)throw Error('桌面知识库根目录不可用');
      const allowed=path.resolve(base,'VaultRelay-Transfer','engine');
      // Refuse symbolic links in either component before mkdir.
      for(const part of [path.resolve(base,'VaultRelay-Transfer'),allowed]){
        if(fs.existsSync(part)){
          const st=fs.lstatSync(part);
          if(st.isSymbolicLink()||!st.isDirectory())throw Error('内部交换目录有符号链接或非目录项');
        }else fs.mkdirSync(part);
      }
      this.engine.state.shareRoot=allowed;
      if(this.vaultIsCorrect())this.data.windowsLegacyDir=this.engine.dirs(true).root;
    }else{
      s.syncEnabled=false;
      if(this.vaultIsCorrect())await this.engine.initFolders();
    }
    await this.persistTransport();
    await this.log('V4 同步引擎已就绪',
      'GroupID '+s.groupId+' · Device ID '+s.deviceId+' · '+
      (OBS.Platform.isDesktopApp?'Windows 自动功能可在控制台开启':'移动端手动同步'));
  }
  async _applyCoreGroup(value){
    if(!/^vg-[a-z0-9]{16,40}$/.test(value))throw Error('GroupID 格式无效');
    const s=this.engine.state;
    if(s.groupId===value)return;
    if(Object.keys(s.known||{}).length || Object.keys(s.acks||{}).length ||
       Object.keys(s.receivedAcks||{}).length)throw Error('本机已有同步历史，不能直接切换 GroupID');
    if(OBS.Platform.isDesktopApp)this.engine.setGroup(value);
    else {
      s.groupId=value;s.seq=0;s.messageSeq=0;
      for(const key of ['processed','seenInfo','seenAck','acks','publishedAckIds','receivedAcks'])s[key]={};
    }
  }
  async saveGroupShare(raw,rawCode=''){
    if(!OBS.Platform.isAndroidApp && !OBS.Platform.isIosApp)
      throw Error('群组分享链接只供移动端手动收发使用');
    const pasted=String(raw||'').trim();
    // Baidu often copies a combined text that includes the URL and the code.
    // Extract the official HTTPS link, never store extra page/share prose.
    const found=pasted.match(/https:\/\/pan\.baidu\.com\/s\/[^\s，。；、<>]+/);
    if(!found)throw Error('请粘贴完整的百度网盘群组分享链接（https://pan.baidu.com/s/...）');
    const url=found[0].replace(/[)\]】）。，；、]+$/g,'');
    let parsed;
    try{parsed=new URL(url);}
    catch(_){throw Error('百度网盘分享链接不是有效网址');}
    if(parsed.protocol!=='https:'||parsed.hostname!=='pan.baidu.com'||
       !/^\/s\/[A-Za-z0-9_-]+\/?$/.test(parsed.pathname)||
       parsed.username||parsed.password)
      throw Error('只接受百度网盘官方 HTTPS 群组分享链接');
    const fromMessage=pasted.match(/(?:提取码|访问码|分享密码|密码)\s*[:：]?\s*([A-Za-z0-9]{4})/i);
    const fromQuery=parsed.searchParams.get('pwd')||'';
    const code=String(rawCode||'').trim() || fromMessage?.[1] || fromQuery || '';
    if(code&&!/^[A-Za-z0-9]{4}$/.test(code))
      throw Error('百度网盘分享提取码应为 4 位字母或数字');
    this.data.shareUrl=url;
    this.data.shareCode=code;
    await this.persistTransport();
    await this.log('群组分享链接已保存','已更新当前设备的群组分享网址'+
      (code?'与提取码':'')+'；后续无需重复设置，除非网盘分享地址变化');
    return {url,code};
  }
  async updateSetting(key,value){
    if(key==='mobileSourcePath')return this.setMobileSourcePath(value);
    if(key==='mobileExtraSources'){
      if(OBS.Platform.isDesktopApp)throw Error('此设置仅供移动设备使用');
      const dirs=String(value||'').split(/[\n;,]+/).map(x=>x.trim()).filter(Boolean);
      if(dirs.length>20)throw Error('最多补充 20 个扫描目录');
      const normalized=[...new Set(dirs.map(x=>this.normalizeMobileSourcePath(x)))];
      this.data.mobileExtraSources=normalized;
      await this.persistTransport();
      await this.log('补充扫描目录已保存',normalized.length+' 个优先路径；系统可访问范围仍会遍历');
      return;
    }
    const val=String(value||'').trim();
    if(key==='groupId'){
      throw Error('请使用创建群组或加入群组入口设置 GroupID，避免意外更换身份');
    }else if(key==='groupShortName'||key==='deviceShortName'){
      if(!/^[A-Za-z]{2,3}[0-9]$/.test(val))
        throw Error('简称必须为 2–3 位英文字母加末尾 1 位数字，例如 Tes1 / Win1');
      this.data[key]=Bridge.__testing.shortName(val);
      if(key==='groupShortName'){
        this.data.groupShort=this.data.groupShortName;
        delete this.data.v526AliasConflict;
      }else{
        this.data.deviceShort=this.data.deviceShortName;
      }
    }else if(key==='displayName'){
      if(val.length>80)throw Error('设备名称不超过80字符');
      this.data.displayName=val;if(this.engine?.state)this.engine.state.displayName=val;
    }else if(key==='groupName'){
      if(val.length>80)throw Error('群组名称不超过80字符');
      this.data.groupName=val;if(this.engine?.state)this.engine.state.groupName=val;
    }else if(key==='windowsCloudDir'){
      // This is a transport location, not an alias of GroupID.
      // Space identity is verified via VaultRelay-Space.json.
      if(!val)throw Error('请指定已经由百度网盘同步的完整本地文件夹路径');
      await this.bindWindowsSpace(val);
      return;
    }else if(key==='shareUrl'){
      if(!val){
        this.data.shareUrl='';
        await this.persistTransport();
        return;
      }
      await this.saveGroupShare(val,this.data.shareCode||'');
      return;
    }else if(key==='shareCode'){
      if(val&&!/^[A-Za-z0-9]{4}$/.test(val))
        throw Error('提取码应是 4 位字母或数字');
      this.data.shareCode=val;
    }else if(key==='ackRecipientIds'){
      this.validateAckRecipients(val);
      const ids=this.validateAckRecipients(val);
      if(ids.includes(this.engine?.state?.deviceId||this.data.deviceId))
        throw Error('不能填写本机 Device ID');
      this.data[key]=val;
    }else if(key==='ackCleanupPolicy'){
      if(!['any','all','manual'].includes(val))throw Error('ACK 清理策略无效');
      this.data.ackCleanupPolicy=val;
    }else throw Error('此设置不可修改');
    await this.persistTransport();
  }
  // V4.0.10: after the NATIVE upload modal's explicit confirmation only.
  // Never bypass previewUpload()/safeUpload() or the mobile safeExport() guard.
  async finalizeConfirmedUpload(nativeResult=null){
    this.assertGroup();
    if(!nativeResult || typeof nativeResult!=='object')
      throw Error('同步核心没有返回本次确认的上传结果；禁止从历史 outbox 猜测增量范围');
    let sourceNames=null;
    if(nativeResult){
      const names=OBS.Platform.isDesktopApp?
        [...(nativeResult.packages||[]),
          ...(nativeResult.branchResults||[]).map(x=>x?.pack).filter(Boolean)]:
        (nativeResult.files||[]).map(x=>x?.name).filter(Boolean);
      if(!names.every(x=>/^[^\/]+\.zip$/i.test(x)))
        throw Error('核心返回了不安全的本次内容包名称');
      sourceNames=names.map(name=>'content/'+name);
      await this.log('本次原生内容包范围',sourceNames.length?
        sourceNames.join('；'):'本次未产生正文内容包，不重复封装历史 content');
    }
    const packageResult=await this.createIncremental({sourceNames});
    const latest=(this.data.bundleRecords||[]).slice().reverse()
      .find(x=>x.stored?.path===this.data.latest);
    const includeLatest=!!(!packageResult.empty&&!packageResult.complete) ||
      latest?.status==='pending';
    let prepared={zip:null,acks:[]};
    try{
      prepared=await this.prepareTransferUpload({includeLatest});
    }catch(err){
      if(!/没有需要上传的增量 ZIP 或独立 ACK/.test(String(err.message||err)))
        throw err;
      await this.log('本次没有待传变化','核心扫描已完成，未发现新的 content/info 或独立 ACK；没有创建空 ZIP');
    }
    await this.log('上传增量包流程完成',
      '已完成核心人工确认后的封装与发送区准备；'+
      (prepared.zip?'有增量 ZIP；':'没有新的增量 ZIP；')+
      '独立 ACK '+(prepared.acks?.length||0)+' 个。云端上传状态仍须确认');
    return {packageResult,prepared};
  }

  openReviewFile(item){
    if(!this.engine || !item?.path)throw Error('当前没有有效审核文件');
    const Review=Panel.ReviewModal;
    if(typeof Review!=='function')throw Error('文件查看器尚未就绪');
    new Review(this.app,this,item).open();
  }

  async showReviewAfterReceive({reason='manual-review',forceOpen=false}={}){
    this.assertGroup();
    const automatic=reason==='automatic'&&!forceOpen;
    const v525TransferId=automatic?this.data.v525PendingAutoReview?.id:null;
    if(automatic&&!v525TransferId){this._vrReviewPending=false;return null;}
    if(automatic && this._vrAutoReviewOpening)return null;
    if(automatic)this._vrAutoReviewOpening=true;
    try{
      // When manually entering the review, discover new downloads across all
      // OS-readable shared directories first; never apply formal notes here.
      if(!OBS.Platform.isDesktopApp && reason==='manual-review'){
        if(OBS.Platform.isAndroidApp)
          new OBS.Notice('正在搜索系统允许访问的存储目录，并执行增量文件检查…',4500);
        const check=await this.scanMobileReception({reason:'review',notify:false});
        if(OBS.Platform.isAndroidApp && check.source?.state==='partial')
          new OBS.Notice('本轮已扫描 '+(check.source.scannedDirs||0)+
            ' 个目录，仍有不可读或待处理项；可再次扫描或手动选择 ZIP/ACK',8000);
      }
      // Windows ZIP/ACK transport is independent from formal note application.
      if(OBS.Platform.isDesktopApp && this.data.desktopTransportEnabled && this.agent)
        await this.agent.tick();
      const plan=await this.engine.latestPlan(); // READ-ONLY
      // Do not reopen for historical conflicts, scans or old deletion tombstones.
      if(automatic&&!await this._v525.autoReviewAllowed(v525TransferId,plan,
        this.data.v525PendingAutoReview?.paths||[])){
        if(this.data.v525PendingAutoReview?.id===v525TransferId){
          this.data.v525PendingAutoReview=null;await this.persistTransport();
        }
        this._vrReviewPending=false;
        return plan;
      }
      const counts=plan.counts||{};
      const pending=(counts.create||0)+(counts['safe-update']||0);
      const conflicts=(counts.conflict||0)+(counts.fork||0)+
        (counts['local-error']||0)+(counts['delete-review']||0);
      const localDeleted=counts['local-deleted']||0;
      this.data.lastReadOnlyReview={at:Date.now(),pending,conflicts,
        localDeleted,same:counts.same||0,reason};
      await this.log('自动版本核对（只读）',
        `待安全写入 ${pending}，本机已删除待处理 ${localDeleted}，冲突/分叉/异常 ${conflicts}，内容一致 ${counts.same||0}；正式笔记没有被应用`);

      if(automatic && pending===0 && conflicts===0){
        // No inbound work remains; do not keep re-opening on local deletions.
        if(this.data.v525PendingAutoReview?.id===v525TransferId){
          this.data.v525PendingAutoReview=null;await this.persistTransport();
        }
        this._vrReviewPending=false;
        return plan;
      }
      // On background receipt, remember the request and retry on focus /
      // visibilitychange / periodic scan. Never instantiate an invisible modal.
      if(automatic &&
        (typeof document!=='undefined'&&document.visibilityState==='hidden')){
        this._vrReviewPending=true;
        return plan;
      }
      // Obsidian exposes workspace.getLeavesOfType on the real mobile app.
      // During startup and in offline protocol tests, defer rather than
      // attempting to open a fake modal whose DOM is not ready.
      if(automatic && typeof this.app?.workspace?.getLeavesOfType!=='function'){
        this._vrReviewPending=true;
        return plan;
      }
      // Android may resume with the original control console above the
      // read-only review in the Modal stack. Close the console first, then
      // refresh/open the review, so the user can actually see it.
      if(automatic && this._vrControlPanel){
        if(this._vrControlPanel.active){
          this._vrReviewPending=true;
          return plan;
        }
        try{this._vrControlPanel.close();}catch(_){}
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      const existing=this._vrReviewModal;
      if(existing){
        const connected=existing.modalEl?.isConnected;
        if(automatic && connected===true){
          if(typeof existing.refresh==='function')await existing.refresh();
          await this._v525.markAutoReviewOpened(v525TransferId);
          this._vrReviewPending=false;
          await this.log('只读审核窗口',
            '已刷新当前打开的审核窗口；仍需人工确认写入');
          return plan;
        }
        // A manual request must be able to RAISE the modal, even if an older
        // connected modal got hidden behind the main console. Do not leave
        // the user with an invisible refreshed dialog.
        try{existing.close();}catch(_){}
        this._vrReviewModal=null;
      }
      const opened=this.openCoreUi('download');
      if(!opened){
        this._vrReviewPending=true;
        if(!automatic)new OBS.Notice('只读审核窗口尚未就绪，请稍后重试',6000);
        return plan;
      }
      // The modal is open, not the note. It has no apply action without
      // the user deliberately pressing the independent confirmation button.
      if(automatic && this._vrReviewModal?.modalEl?.isConnected===false){
        this._vrReviewPending=true;
        await this.log('自动审核窗口待前台',
          '尝试打开后窗口尚未附着到界面；恢复前台或点「查看待审核文件」可继续');
        return plan;
      }
      if(automatic)await this._v525.markAutoReviewOpened(v525TransferId);
      this._vrReviewPending=false;
      await this.log('只读审核窗口',
        (automatic?'自动':'人工')+'打开审核窗口；待安全写入 '+
        pending+'，冲突/异常 '+conflicts+'；尚未写入正式笔记');
      return plan;
    }finally{
      if(automatic)this._vrAutoReviewOpening=false;
    }
  }

  scheduleReadOnlyReview(){
    if(!this.engine || !this.data.v525PendingAutoReview)return;
    this._vrReviewPending=true;
    if(this._vrReviewTimer||this._vrAutoReviewOpening)return;
    this._vrReviewTimer=setTimeout(()=>{
      this._vrReviewTimer=null;
      if(typeof document!=='undefined'&&document.visibilityState==='hidden')
        return; // pending stays set; focus/periodic scan retries.
      this.showReviewAfterReceive({reason:'automatic'}).catch(err=>{
        this._vrReviewPending=true;
        this.log('自动审核窗口打开失败',String(err.message||err)+
          '；可使用主控制台「查看待审核文件」')
          .catch(()=>{});
      });
    },950);
  }


  // V4.0.14: An unshared, locally generated draft may be withdrawn only after
  // the user explicitly certifies no copy was handed to Baidu or other devices.
  // Any historical/unknown/Windows/cloud-bound package is INELIGIBLE.
  async previewLocalWithdrawals(){
    if(OBS.Platform.isDesktopApp)
      return {eligible:[],blocked:[],note:'Windows 已写入百度本地同步目录，不能证明未传播；使用删除版本'};
    if(!this.engine?.state)throw Error('尚未加入有效同步群组');
    const adapter=this.app.vault.adapter;
    const state=this.engine.state;
    const drafts=Object.entries(state.localDraftPacks||{});
    const eligible=[],blocked=[];
    const catalog=await this.engine.scanCatalog();
    if(catalog.warnings.length)
      return {eligible,blocked:[{name:'历史版本核对',reason:'历史 ZIP 异常；全部撤销暂缓'}],
        note:'存在历史读取异常，禁止撤销任何活动内容包'};
    const recent=drafts.slice(-100);
    for(const [name,draft] of recent){
      if(!draft || draft.status!=='local')continue;
      const deny=reason=>blocked.push({name,reason});
      if(!/^\d{8}T\d{9}Z__vr-[a-z0-9]{16,64}__\d{6,12}__[a-f0-9]{8}\.zip$/.test(name)){
        deny('本机草稿名称不符合原生内容包格式');continue;
      }
      const inner=this.engine.paths().outbox+'/'+name;
      if(!await adapter.exists(inner)){deny('原始本机内容包已不在 outbox');continue;}
      let bytes,verified;
      try{
        bytes=new Uint8Array(await adapter.readBinary(inner));
        verified=await this.engine.checkedPack(bytes,{filename:name});
      }catch(e){deny('内容包校验失败：'+String(e.message||e));continue;}
      if(!draft.sha256||draft.sha256!==verified.sha256||
         draft.packId!==verified.manifest.packId||
         verified.manifest.originDeviceId!==state.deviceId){
        deny('内容包 SHA、PackID 或来源设备与建包快照不同');continue;
      }
      const entries=verified.manifest.entries;
      const isAncestorUsed=entries.some(entry=>
        (catalog.byPath[entry.path]||[]).some(v=>
          v.versionId!==entry.versionId &&
          (v.parentVersionId===entry.versionId ||
           (v.mergeParents||[]).includes(entry.versionId))));
      if(isAncestorUsed){
        deny('另一个仍活跃的历史包已经引用此版本作为父版本');continue;
      }
      if(entries.length!==draft.entries?.length||
         entries.some((e,i)=>e.path!==draft.entries[i]?.path ||
           e.versionId!==draft.entries[i]?.versionId ||
           state.known[e.path]?.versionId!==e.versionId)){
        deny('本机已知版本或草稿路径已变化');continue;
      }
      const versions=new Set(entries.map(e=>e.versionId));
      if(Object.values(state.receivedAcks||{}).some(a=>versions.has(a?.versionId))){
        deny('已观察到其他设备的 ACK，禁止撤销');continue;
      }
      if((this.data.inboundRecords||[]).some(rec=>
        (rec.files||[]).some(f=>f.endsWith('/'+name)))){
        deny('本机已见到相同内容包的入站记录，无法证明未传播');continue;
      }
      const envelopes=(this.data.bundleRecords||[]).filter(rec=>
        (rec.versions||[]).some(v=>v.packId===draft.packId));
      if(envelopes.some(rec=>rec.status!=='pending'||
         rec.stored?.kind!=='vault' ||
         !String(rec.stored?.path||'').startsWith('VaultRelay-Transfer/temporary/')||
         (rec.versions||[]).some(v=>v.packId!==draft.packId))){
        deny('外层包已发布/状态不明，或混有其他内容包，不能单独撤销');continue;
      }
      let safe=true;
      for(const rec of envelopes){
        try{
          if(!await adapter.exists(rec.stored.path))throw Error('外层增量 ZIP 已离开 temporary');
          const envBytes=new Uint8Array(await adapter.readBinary(rec.stored.path));
          if(await Bridge.__testing.sha256(envBytes)!==rec.sha256)
            throw Error('外层包 SHA 与待发送记录不符');
        }catch(e){deny(String(e.message||e));safe=false;break;}
      }
      if(!safe)continue;
      eligible.push({name,packId:draft.packId,entryCount:entries.length,
        missing:entries.filter(e=>!this.app.vault.getAbstractFileByPath(e.path))
          .map(e=>e.path),outboxPath:inner,
        envelopes:envelopes.map(r=>({name:r.name,path:r.stored.path,recordId:r.id}))});
    }
    return {eligible,blocked,note:
      '必须由用户亲自确认所有这些 ZIP 均从未上传、转发或被其他设备复制；插件无法探测百度网盘外部副本。'};
  }

  async withdrawLocalDraft(packName,{certifiedNoExternalCopies=false}={}){
    if(!certifiedNoExternalCopies)
      throw Error('必须先明确确认未上传、未分享且不存在外部副本；状态不明请发布删除版本');
    if(OBS.Platform.isDesktopApp)throw Error('Windows 同步盘中的包不得执行本机撤销');
    if(this._vrWithdrawalBusy||this.engine?.busy)throw Error('另一项同步操作正在进行');
    this._vrWithdrawalBusy=true;
    try{
      const preview=await this.previewLocalWithdrawals();
      const chosen=preview.eligible.find(x=>x.name===packName);
      if(!chosen)throw Error('草稿已变化或不符合本机撤销条件，请重新检查');
      const state=this.engine.state;
      const record=state.localDraftPacks[packName];
      const adapter=this.app.vault.adapter;
      const sources=[chosen.outboxPath,...chosen.envelopes.map(x=>x.path)];
      const originals=[];
      for(const path of sources){
        if(!await adapter.exists(path))throw Error('待撤销包已不在原位置：'+path);
        const bytes=new Uint8Array(await adapter.readBinary(path));
        originals.push({path,bytes,sha256:await Bridge.__testing.sha256(bytes)});
      }
      if(originals[0].sha256!==record.sha256)throw Error('内容包 SHA 已变化');
      for(let i=0;i<chosen.envelopes.length;i++){
        const rec=(this.data.bundleRecords||[]).find(x=>x.id===chosen.envelopes[i].recordId);
        if(!rec||rec.sha256!==originals[i+1].sha256||rec.status!=='pending')
          throw Error('待发送记录已变化，拒绝撤销');
      }
      const quarantine='VaultRelay-Transfer/quarantine/unshared-'+
        Bridge.__testing.timestamp()+'-'+Bridge.__testing.randomHex(6);
      // Full bytes are copied and SHA-verified before changing ANY active file.
      await Bridge.__testing.ensureVaultFolder(adapter,quarantine);
      const quarantined=[];
      for(let i=0;i<originals.length;i++){
        const a=originals[i];
        const dest=quarantine+'/'+(i===0?'native-content-':'outer-envelope-')+
          String(i).padStart(2,'0')+'.zip';
        if(await adapter.exists(dest))throw Error('隔离目标已存在，拒绝覆盖');
        await adapter.writeBinary(dest,a.bytes.buffer.slice(
          a.bytes.byteOffset,a.bytes.byteOffset+a.bytes.byteLength));
        const again=new Uint8Array(await adapter.readBinary(dest));
        if(await Bridge.__testing.sha256(again)!==a.sha256)
          throw Error('隔离副本 SHA 校验失败，原待发送包未移除');
        quarantined.push(dest);
      }
      // Stop publishing the envelope FIRST, then remove the native content
      // source from active outbox. Originals survive in excluded quarantine.
      for(const a of originals.slice(1))await adapter.remove(a.path);
      await adapter.remove(originals[0].path);
      if(await adapter.exists(originals[0].path))throw Error('内容包仍在 outbox');
      for(const e of record.entries){
        if(state.known[e.path]?.versionId!==e.versionId)
          throw Error('撤销中版本状态发生变化，请停止操作并检查隔离副本');
        if(e.previous)state.known[e.path]=e.previous;
        else delete state.known[e.path];
      }
      record.status='withdrawn-local-user-certified';
      record.withdrawnAtUtc=new Date().toISOString();
      record.quarantine=quarantined;
      for(const env of chosen.envelopes){
        const rec=(this.data.bundleRecords||[]).find(x=>x.id===env.recordId);
        if(rec){
          rec.status='withdrawn-local-user-certified';
          rec.withdrawnAt=Date.now();rec.quarantine=quarantine;
          if(this.data.latest===env.path)this.data.latest='';
        }
      }
      this.data.latestFingerprint='';
      await this.persistTransport();
      await this.log('人工撤回确定未发送的增量草稿',
        `已从主动发送区撤下 ${packName} 和外层包 ${chosen.envelopes.length} 个；`+
        `全量安全隔离到 ${quarantine}；未改变正式笔记。请重新预览并生成只包含仍存在文件的增量包。`);
      return {withdrawn:packName,removedActivePackages:sources.length,
        quarantine,deletedFromVault:0,repackRequired:true};
    }finally{this._vrWithdrawalBusy=false;}
  }

  async exportRuntimeDiagnostics(){
    await this.ensureLayout();
    const hide=(input)=>String(input??'')
      .replace(/https:\/\/pan\.baidu\.com\/s\/\S+/gi,'[百度网盘分享链接已隐藏]')
      .replace(/(^|[^a-z0-9])vg-[a-z0-9]{16,40}(?=$|[^a-z0-9])/gi,'$1[GroupID已隐藏]')
      .replace(/(^|[^a-z0-9])vr-(?:unified-)?[a-z0-9]{16,64}(?=$|[^a-z0-9])/gi,'$1[DeviceID已隐藏]')
      .replace(/[A-Za-z]:\\[^\r\n，;；]+/g,'[Windows本地路径]')
      .replace(/\/storage\/emulated\/0\/[^\r\n，;；]+/g,'[Android本地路径]')
      .replace(/(?:提取码|访问码|分享密码)\s*[:：=]\s*[a-z0-9]{4}/gi,'[提取码已隐藏]');
    // An on-demand catalog/read-only plan only: never publish, ACK or apply.
    // A corrupt/locked catalog should not prevent exporting the basic log.
    let sourceAnalysis={status:'not-ready',reason:'同步核心尚未就绪'};
    if(this.engine?.state && typeof this.engine.latestPlan==='function'){
      try{
        const provenancePlan=await this.engine.latestPlan();
        sourceAnalysis=v413SourceTrace(provenancePlan,this.engine,hide);
      }catch(err){
        sourceAnalysis={status:'error',reason:hide(String(err?.message||err)).slice(0,800),
          note:'逐文件版本来源扫描失败，基本运行日志仍可导出；未做任何正式笔记写入'};
      }
    }
    const scan=this.data.mobileLastScan||null;
    const source=this.data.mobileLastSource||null;
    const report={
      kind:'vault-relay-v4-runtime-diagnostics',schema:2,
      createdAt:new Date().toISOString(),
      version:this.manifest?.version||'4.0.14',
      platform:OBS.Platform.isDesktopApp?'Windows':OBS.Platform.isAndroidApp?'Android':'iPadOS',
      vaultName:hide(this.app.vault.getName()),
      engineReady:!!this.engine?.state,
      windowsAutoTransfer:!!this.data.desktopTransportEnabled,
      windowsCoreAutoSync:!!this.engine?.state?.syncEnabled,
      androidCapacitorFilesystem:!OBS.Platform.isDesktopApp &&
        typeof this.mobileCapacitorFilesystem==='function'?
        !!this.mobileCapacitorFilesystem():null,
      lastSource:source?{state:source.state,copied:source.copied,
        skipped:source.skipped,errors:source.errors,pending:source.pending,
        detail:hide(source.detail||'')}:null,
      lastScan:scan?{time:scan.time,summary:hide(scan.summary)}:null,
      lastReadOnlyReview:this.data.lastReadOnlyReview||null,
      sourceAnalysis,
      counters:{
        outgoingBundles:(this.data.bundleRecords||[]).length,
        incomingBundles:(this.data.inboundRecords||[]).length,
        recentOperations:(this.data.history||[]).length,
        runtimeErrors:(this._vrRuntimeErrors||[]).length
      },
      runtimeErrors:(this._vrRuntimeErrors||[]).slice(0,40)
        .map(x=>({time:x.time,message:hide(x.message)})),
      recentOperations:(this.data.history||[]).slice(0,150).map(x=>({
        time:x.time,kind:hide(x.kind),message:hide(x.message)
      })),
      omissions:'不包含笔记正文、原始同步 ZIP、分享链接、提取码、完整设备身份或本机绝对路径；版本来源部分包含知识库相对文件路径'
    };
    const dest='VaultRelay-Transfer/diagnostics';
    const adapter=this.app.vault.adapter;
    await Bridge.__testing.ensureVaultFolder(adapter,dest);
    const file=dest+'/VR-DIAGNOSTICS-'+Bridge.__testing.timestamp()+'-'+
      Bridge.__testing.randomHex(6)+'.json';
    const raw=new TextEncoder().encode(JSON.stringify(report,null,2));
    if(await adapter.exists(file))throw Error('诊断文件名已存在，拒绝覆盖');
    await adapter.writeBinary(file,raw.buffer.slice(raw.byteOffset,
      raw.byteOffset+raw.byteLength));
    const again=new Uint8Array(await adapter.readBinary(file));
    if(await Bridge.__testing.sha256(again)!==await Bridge.__testing.sha256(raw))
      throw Error('诊断文件写入后 SHA 核对失败');
    this.data.latestDiagnosticPath=file;
    await this.persistTransport();
    await this.log('导出运行诊断',file+'；'+raw.length+' 字节；已脱敏且不含笔记正文');
    return {path:file,bytes:raw.length,content:raw};
  }

  // V5.0.0: explicit, transaction-based restoration. These methods never
  // erase historical content ZIPs, DELETE heads, or received ACKs.
  v5SafePath(path){
    if(typeof path!=='string'||!path||path.length>1024||
       path.startsWith('/')||path.endsWith('/')||/[\\:\x00-\x1f]/.test(path))
      throw Error('文件路径不合法');
    const bits=path.split('/');
    if(bits.some(x=>!x||x==='.'||x==='..'||x==='__proto__'||
       x==='constructor'||x==='prototype'||/[. ]$/.test(x)))
      throw Error('文件路径包含危险目录段');
    if(['.obsidian','vaultrelay-transfer'].includes(bits[0].toLowerCase()))
      throw Error('插件内部路径不能作为正式笔记');
    if(bits.some(x=>x.length>255))throw Error('文件名过长');
    return path;
  }
  v5ToArray(raw){return raw instanceof Uint8Array?raw:new Uint8Array(raw);}
  v5Buffer(raw){const b=this.v5ToArray(raw);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}
  async v5Hash(raw){return Bridge.__testing.sha256(this.v5ToArray(raw));}
  async v5Read(path){return this.v5ToArray(await this.app.vault.adapter.readBinary(path));}
  async v5EnsureFolder(relative){
    const parts=relative.split('/');
    let prefix='';
    for(const part of parts){
      prefix=prefix?prefix+'/'+part:part;
      const existing=this.app.vault.getAbstractFileByPath(prefix);
      if(existing){if(!existing.children)throw Error('目标目录是文件：'+prefix);continue;}
      if(await this.app.vault.adapter.exists(prefix)){
        // Existing adapter path omitted from Obsidian index: inspect using native
        // read-only directory interface before accepting it as a directory.
        const entry=await this.app.vault.adapter.list(prefix).catch(()=>null);
        if(!entry)throw Error('目标目录不是可访问的真实文件夹：'+prefix);
      }else{
        await this.app.vault.createFolder(prefix);
      }
    }
  }
  async v5StorePrivate(path,bytes){
    const b=this.v5ToArray(bytes),expected=await this.v5Hash(b);
    const parent=path.split('/').slice(0,-1).join('/');
    if(!path.startsWith('VaultRelay-Transfer/'))throw Error('只可写入隔离工作区');
    await Bridge.__testing.ensureVaultFolder(this.app.vault.adapter,parent);
    if(await this.app.vault.adapter.exists(path))throw Error('隔离备份名已存在，拒绝覆盖');
    await this.app.vault.adapter.writeBinary(path,this.v5Buffer(b));
    if(await this.v5Hash(await this.v5Read(path))!==expected)
      throw Error('隔离备份写入后 SHA 校验失败');
    return {path,sha256:expected};
  }
  async registerUndoFromNative(result,plan,kind){
    if(!result)return null;
    const produced=OBS.Platform.isDesktopApp?(result.undoRecords||[]):(result.changed||[]);
    const actions=[];
    const basedir='VaultRelay-Transfer/backups/V5-journal-'+Bridge.__testing.timestamp()+
      '-'+Bridge.__testing.randomHex(10);
    for(const input of produced){
      if(!['delete','create','safe-update'].includes(input.action))continue;
      const path=this.v5SafePath(input.path);
      const entry=plan?.items?.find(x=>x.path===path);
      if(!entry||!entry.version)continue;
      let beforeSha=input.beforeSha!==undefined?input.beforeSha:entry.localHash;
      let afterSha=input.afterSha!==undefined?input.afterSha:
        input.action==='delete'?null:entry.version.sha256;
      const knownVersionId=input.afterVersionId||entry.version.versionId;
      let backed=null;
      if(input.action!=='create'){
        let raw;
        if(OBS.Platform.isDesktopApp){
          const absolute=String(input.backupAbsolutePath||'');
          const fs=require('node:fs'),nodepath=require('node:path');
          const vaultRoot=this.app.vault.adapter.getBasePath?.();
          if(!vaultRoot)throw Error('Windows 知识库路径不可用');
          const allowed=nodepath.resolve(vaultRoot,'.obsidian','plugins','vault-relay-info-lab','v2-safety-backups');
          const normalized=nodepath.resolve(absolute);
          if(!normalized.startsWith(allowed+nodepath.sep) || !fs.existsSync(normalized) ||
             fs.lstatSync(normalized).isSymbolicLink())throw Error('Windows 历史备份来源无效');
          raw=new Uint8Array(fs.readFileSync(normalized));
        }else{
          if(typeof input.backup!=='string'||!input.backup.startsWith('VaultRelay-Transfer/backups/'))
            throw Error('Android 删除/更新的备份来源无效');
          raw=await this.v5Read(input.backup);
        }
        if(await this.v5Hash(raw)!==beforeSha)throw Error('历史备份 SHA 不一致：'+path);
        backed=(await this.v5StorePrivate(basedir+'/'+path,raw)).path;
      }
      actions.push({path,action:input.action,beforeSha,afterSha,
        afterVersionId:knownVersionId,backupPath:backed});
    }
    if(!actions.length)return null;
    this.data.undoOperations=Array.isArray(this.data.undoOperations)?this.data.undoOperations:[];
    const id='undo-'+Bridge.__testing.timestamp()+'-'+Bridge.__testing.randomHex(8);
    this.data.undoOperations.unshift({id,kind,createdAt:new Date().toISOString(),
      groupId:this.data.groupId,deviceId:this.engine?.state?.deviceId,items:actions,
      status:'available'});
    this.data.undoOperations=this.data.undoOperations.slice(0,100);
    await this.persistTransport();
    await this.log('可回退操作',id+' · '+kind+' · '+actions.map(x=>x.path).join('、'));
    return id;
  }
  async previewUndo(id){
    const tx=(this.data.undoOperations||[]).find(x=>x.id===id);
    if(!tx||tx.status!=='available')throw Error('回退记录不存在或已执行');
    if(tx.groupId!==this.data.groupId||tx.deviceId!==this.engine?.state?.deviceId)
      throw Error('回退记录身份不属于当前设备/知识库');
    const plan=await this.engine.latestPlan();
    if(plan.catalog?.warnings?.length||plan.errors?.length)
      throw Error('版本目录存在异常，请先修复后再回退');
    const reviewed=[];
    for(const a of tx.items){
      const path=this.v5SafePath(a.path),existing=this.app.vault.getAbstractFileByPath(path);
      if(existing?.children)throw Error('目标已变为文件夹：'+path);
      const current=existing?await this.v5Hash(await this.v5Read(path)):null;
      if(current!==a.afterSha)throw Error('操作后文件已变化，禁止直接回退：'+path);
      const known=this.engine.state.known?.[path];
      const head=plan.items?.find(x=>x.path===path)?.version;
      if((known?.versionId||null)!==(a.afterVersionId||null)||
         (a.afterVersionId && (!head||head.versionId!==a.afterVersionId))||
         (head&&!a.afterVersionId))
        throw Error('同步版本已发生变化，请先处理冲突：'+path);
      let backup=null;
      if(a.action!=='create'){
        if(!a.backupPath?.startsWith('VaultRelay-Transfer/backups/'))
          throw Error('回退的历史备份来源不可信');
        backup=await this.v5Read(a.backupPath);
        if(await this.v5Hash(backup)!==a.beforeSha)
          throw Error('安全备份 SHA 校验失败：'+path);
      }
      reviewed.push({path,action:a.action,currentSha:current,
        restoreSha:a.beforeSha,backupBytes:backup,afterVersionId:a.afterVersionId});
    }
    return {tx,reviewed};
  }
  async executeUndo(id,{mode='restore'}={}){
    if(!['restore','extract'].includes(mode))throw Error('不支持的回退方式');
    const verified=await this.previewUndo(id);
    const {tx,reviewed}=verified;
    if(mode==='extract'){
      const prefix='VaultRelay-Transfer/recovered/'+Bridge.__testing.timestamp()+
        '-'+Bridge.__testing.randomHex(10);
      let count=0;
      for(const r of reviewed){
        if(!r.backupBytes)continue; // An originally created file has no older content.
        await this.v5StorePrivate(prefix+'/'+r.path,r.backupBytes);count++;
      }
      await this.log('只提取历史副本',tx.id+' · '+count+' 项 · '+prefix);
      return {mode,files:count,path:prefix};
    }
    // Formal restoration never changes any old ZIP or ACK. The resulting
    // local change must be manually published as a new upsert/delete version.
    await this.log('回退审核已通过',tx.id+'；校验 '+reviewed.length+
      ' 个正式文件及其 SHA/版本关系，开始逐项处理；历史 ZIP 与 ACK 不会改动');
    let updated=0;
    for(const r of reviewed){
      // Re-check immediately before each mutation, including required known head.
      const now=this.app.vault.getAbstractFileByPath(r.path);
      const current=now?await this.v5Hash(await this.v5Read(r.path)):null;
      const fresh=await this.engine.latestPlan();
      const head=fresh.items?.find(x=>x.path===r.path)?.version;
      if(fresh.catalog?.warnings?.length || current!==r.currentSha ||
         (this.engine.state.known?.[r.path]?.versionId||null)!==(r.afterVersionId||null)||
         (r.afterVersionId && (!head||head.versionId!==r.afterVersionId))||
         (head&&!r.afterVersionId))
        throw Error('回退时文件或同步版本发生变化，已停止：'+r.path);
      if(r.action==='delete'){
        if(now||await this.app.vault.adapter.exists(r.path))throw Error('删除的笔记重新出现，停止回退');
        const parent=r.path.split('/').slice(0,-1).join('/');
        if(parent)await this.v5EnsureFolder(parent);
        await this.app.vault.createBinary(r.path,this.v5Buffer(r.backupBytes));
      }else if(r.action==='safe-update'){
        if(!now)throw Error('更新后文件已不存在');
        const currentBytes=await this.v5Read(r.path);
        await this.v5StorePrivate('VaultRelay-Transfer/backups/V5-pre-undo-'+
          Bridge.__testing.timestamp()+'-'+Bridge.__testing.randomHex(8)+'/'+r.path,currentBytes);
        await this.app.vault.modifyBinary(now,this.v5Buffer(r.backupBytes));
      }else if(r.action==='create'){
        if(!now)throw Error('此前新增文件现在不存在');
        const currentBytes=await this.v5Read(r.path);
        await this.v5StorePrivate('VaultRelay-Transfer/backups/V5-pre-undo-'+
          Bridge.__testing.timestamp()+'-'+Bridge.__testing.randomHex(8)+'/'+r.path,currentBytes);
        await this.app.vault.delete(now);
      }
      const expected=r.action==='create'?null:r.restoreSha;
      const actual=await this.app.vault.adapter.exists(r.path)?await this.v5Hash(await this.v5Read(r.path)):null;
      if(actual!==expected)throw Error('回退完成后校验失败：'+r.path);
      if(r.action==='delete'){
        this.engine.state.authorizedRestores ||= {};
        this.engine.state.authorizedRestores[r.path]={parentVersionId:r.afterVersionId,
          sha256:r.restoreSha,createdAt:new Date().toISOString(),reason:'manual-undo'};
      }
      updated++;
      await this.log('回退项完成',tx.id+' · '+r.path+' · '+r.action+
        '；恢复后 SHA/不存在状态已复核');
      await this.persistTransport();
    }
    tx.status='restored';tx.restoredAt=new Date().toISOString();
    await this.persistTransport();
    await this.log('人工确认回退',tx.id+' · 已恢复 '+updated+' 项；尚未上传百度网盘');
    return {mode,files:updated};
  }
  async previewMarkdownFiles(files,folder=''){
    if(!this.engine?.state||!this.data.groupId)throw Error('请先加入同步群组');
    if(!Array.isArray(files)||!files.length||files.length>80)throw Error('请选择 1–80 个 Markdown 文件');
    const prefix=String(folder||'').trim().replace(/\/$/,'');
    if(prefix)this.v5SafePath(prefix+'/check.md');
    const plan=await this.engine.latestPlan();
    if(plan.catalog?.warnings?.length||plan.errors?.length)
      throw Error('版本目录存在异常，暂时禁止普通 Markdown 导入');
    const items=[],seen=new Set();let total=0;
    for(const file of files){
      const name=String(file?.name||'');
      if(!/\.md$/i.test(name)||name.includes('/')||name.includes('\\'))
        throw Error('仅支持文件名完整的普通 .md 文件');
      const path=this.v5SafePath(prefix?prefix+'/'+name:name);
      if(seen.has(path.toLowerCase()))throw Error('选中的文件存在同名/大小写冲突：'+path);
      seen.add(path.toLowerCase());
      if(!Number.isSafeInteger(file.size)||file.size>8*1024*1024)
        throw Error('单个 Markdown 最大 8 MiB：'+name);
      const bytes=this.v5ToArray(await file.arrayBuffer());
      total+=bytes.length;if(total>25*1024*1024)throw Error('本次 Markdown 总量不能超过 25 MiB');
      const hash=await this.v5Hash(bytes);
      const current=await this.app.vault.adapter.exists(path)?await this.v5Hash(await this.v5Read(path)):null;
      const known=this.engine.state.known?.[path];
      const matching=plan.items?.find(x=>x.path===path);
      let status;
      if(current!==null)status=current===hash?'same':'conflict';
      else if(matching){
        if(matching.version?.op==='delete' && matching.status==='absent' &&
           known?.op==='delete' && known?.versionId===matching.version.versionId)
          status='restore';
        else status='conflict';
      }else if(known)status='conflict';
      else status='create';
      items.push({path,name,sha256:hash,size:bytes.length,sourceBytes:bytes,
        status,expectedLocalSha:current,
        parentDeleteVersionId:status==='restore'?known.versionId:null});
    }
    return {createdAt:new Date().toISOString(),groupId:this.data.groupId,
      deviceId:this.engine.state.deviceId,folder:prefix,items};
  }
  async applyMarkdownPreview(preview){
    if(!preview?.items?.length||preview.groupId!==this.data.groupId||
       preview.deviceId!==this.engine?.state?.deviceId)
      throw Error('导入预览不属于当前群组或设备');
    const actionable=preview.items.filter(x=>['create','restore'].includes(x.status));
    if(!actionable.length)return {created:0,restored:0};
    const plan=await this.engine.latestPlan();
    if(plan.catalog?.warnings?.length||plan.errors?.length)
      throw Error('版本目录有异常，停止导入');
    for(const item of actionable){
      const path=this.v5SafePath(item.path),present=this.app.vault.getAbstractFileByPath(path);
      if(present||await this.app.vault.adapter.exists(path))throw Error('预览后目标文件已经存在：'+path);
      if(await this.v5Hash(item.sourceBytes)!==item.sha256)throw Error('文件源内容与预览不一致');
      const head=plan.items?.find(x=>x.path===path);
      const known=this.engine.state.known?.[path];
      if(item.status==='restore'){
        if(!head||head.status!=='absent'||head.version?.op!=='delete'||
          head.version.versionId!==item.parentDeleteVersionId||
          known?.op!=='delete'||known.versionId!==item.parentDeleteVersionId)
          throw Error('待恢复笔记的删除历史已经变化：'+path);
      }else if(head||known)throw Error('新增笔记的共享历史已经变化：'+path);
    }
    const journal=[];let created=0,restored=0;
    for(const item of actionable){
      const parent=item.path.split('/').slice(0,-1).join('/');
      if(parent)await this.v5EnsureFolder(parent);
      if(this.app.vault.getAbstractFileByPath(item.path)||await this.app.vault.adapter.exists(item.path))
        throw Error('写入时文件已经存在：'+item.path);
      await this.app.vault.createBinary(item.path,this.v5Buffer(item.sourceBytes));
      if(await this.v5Hash(await this.v5Read(item.path))!==item.sha256)
        throw Error('Markdown 写入后 SHA 检查失败：'+item.path);
      if(item.status==='restore'){
        this.engine.state.authorizedRestores ||= {};
        this.engine.state.authorizedRestores[item.path]={
          parentVersionId:item.parentDeleteVersionId,sha256:item.sha256,
          createdAt:new Date().toISOString(),reason:'explicit-markdown-import'};
        restored++;
      }else created++;
      journal.push({path:item.path,action:'create',beforeSha:null,afterSha:item.sha256,
        afterVersionId:this.engine.state.known?.[item.path]?.versionId||null,backupPath:null});
      await this.persistTransport();
    }
    this.data.undoOperations=Array.isArray(this.data.undoOperations)?this.data.undoOperations:[];
    this.data.undoOperations.unshift({id:'undo-'+Bridge.__testing.timestamp()+'-'+Bridge.__testing.randomHex(8),
      kind:'普通 Markdown 人工导入',createdAt:new Date().toISOString(),
      groupId:this.data.groupId,deviceId:this.engine.state.deviceId,
      items:journal,status:'available'});
    this.data.undoOperations=this.data.undoOperations.slice(0,100);
    await this.persistTransport();
    await this.log('普通 Markdown 人工导入','新增 '+created+' 项，主动恢复已删除 '+restored+' 项；尚未发布新同步版本');
    return {created,restored};
  }
  async keepDeletionItems(items){
    if(!Array.isArray(items)||!items.length||items.length>100)
      throw Error('没有选择要保留的笔记');
    const plan=await this.engine.latestPlan();
    if(plan.catalog?.warnings?.length||plan.errors?.length)throw Error('版本目录异常，已停止');
    const accepted=[];
    for(const requested of items){
      const path=this.v5SafePath(requested.path);
      const current=plan.items?.find(x=>x.path===path);
      if(!current||current.status!=='delete-review'||
         current.version?.versionId!==requested.versionId ||
         current.localHash!==requested.localHash)
        throw Error('删除候选发生变化，请重新预览：'+path);
      accepted.push({path,versionId:current.version.versionId,localSha256:current.localHash});
    }
    this.engine.state.deletionDecisions ||= {};
    for(const x of accepted)this.engine.state.deletionDecisions[x.path]={
      versionId:x.versionId,localSha256:x.localSha256,
      decision:'keep',at:new Date().toISOString()};
    await this.persistTransport();
    await this.log('拒绝删除并保留本机文件',accepted.map(x=>x.path).join('、'));
    return accepted.length;
  }

  // V5.1.1: Comparison never reads remote note bodies and never writes notes.
  // Persist imported snapshots only in the two recursively excluded roots.
  async exportVaultInventory(){
    const snap=await VaultComparison.snapshot({app:this.app,plugin:this});
    const name='VaultRelay-Inventory-'+Bridge.__testing.timestamp()+'-'+Bridge.__testing.randomHex(8)+'.json';
    const dest='VaultRelay-Transfer/comparisons/'+name;
    await this.v5StorePrivate(dest,snap.bytes);
    await this.log('知识库比对 · 导出信息','已生成 '+snap.doc.fileCount+' 个文件的只读 SHA 清单；异常 '+snap.doc.errors.length+'；'+dest);
    return {path:dest,content:snap.bytes,files:snap.doc.fileCount,errors:snap.doc.errors.length};
  }
  async importVaultInventoryFile(file){
    if(!file||typeof file.name!=='string'||!/\.json$/i.test(file.name)||
       !Number.isSafeInteger(file.size)||file.size<64||file.size>8*1024*1024)
      throw Error('请选择不超过 8 MiB 的知识库信息 JSON 清单');
    const raw=this.v5ToArray(await file.arrayBuffer());
    if(raw.length!==file.size)throw Error('清单文件读取中发生变化，请重新选择');
    const info=await VaultComparison.parse(raw,this.data.groupId);
    if(info.deviceId===this.engine?.state?.deviceId)
      throw Error('所选清单来自本机 DeviceID；请选择另一台设备的清单');
    const digest=await this.v5Hash(raw);
    const path='VaultRelay-Transfer/comparisons/remote-'+Bridge.__testing.timestamp()+'-'+
      Bridge.__testing.randomHex(10)+'.json';
    await this.v5StorePrivate(path,raw);
    this.data.vaultComparisonRemote={path,sha256:digest,deviceId:info.deviceId,
      name:info.vaultName,createdAt:info.createdAt,files:info.fileCount};
    await this.persistTransport();
    await this.log('知识库比对 · 导入对端清单','来源 '+info.vaultName+'；文件 '+info.fileCount+
      '；清单 SHA '+digest.slice(0,16)+'…；未触碰正式笔记');
    return {name:info.vaultName,files:info.fileCount,createdAt:info.createdAt,errors:info.errors.length};
  }
  async compareVaultInventory(){
    this.assertGroup();
    const saved=this.data.vaultComparisonRemote;
    if(!saved?.path?.startsWith('VaultRelay-Transfer/comparisons/'))
      throw Error('请先导入对端知识库信息清单');
    const raw=await this.v5Read(saved.path);
    if(await this.v5Hash(raw)!==saved.sha256)
      throw Error('对端清单在保存后发生变化，请重新导入');
    const remote=await VaultComparison.parse(raw,this.data.groupId);
    if(remote.deviceId===this.engine?.state?.deviceId)throw Error('不能将本机清单与自己比较');
    const local=(await VaultComparison.snapshot({app:this.app,plugin:this})).doc;
    const report=VaultComparison.compare(local,remote);
    await this.log('知识库比对 · 只读完成',
      '一致 '+report.totals.same+'；同路径不同内容 '+report.totals.different+
      '；仅本机 '+report.totals.localOnly+'；仅对端 '+report.totals.remoteOnly+
      (report.incomplete?'；存在未参与比较的异常文件':'')+'；没有修改笔记');
    return report;
  }
  async exportComparedOrdinary(report,paths){
    const exported=await VaultComparison.exportOrdinary(report,paths,{app:this.app,plugin:this});
    const name='VaultRelay-Selected-'+Bridge.__testing.timestamp()+'-'+
      Bridge.__testing.randomHex(8)+'.zip';
    const path='VaultRelay-Transfer/exports/'+name;
    await this.v5StorePrivate(path,exported.bytes);
    await this.log('知识库比对 · 导出所选普通文件','选择 '+exported.files+' 项；'+path+
      '。普通 ZIP 不是同步核心版本包，正式导入仍需人工预览');
    return {path,content:exported.bytes,files:exported.files,paths:exported.paths};
  }
  async exportComparedIncremental(report,paths){
    this.assertGroup();
    if(report.local.groupId!==this.data.groupId ||
       report.local.deviceId!==this.engine?.state?.deviceId)
      throw Error('比对结果身份不匹配');
    const rows=VaultComparison.selectable(report,paths);
    if(rows.length>25)throw Error('选择性增量每次最多 25 个文件');
    const nativePlan=await this.engine.latestPlan();
    if(nativePlan.catalog?.warnings?.length||nativePlan.errors?.length)
      throw Error('同步历史存在异常，停止发布选择性增量');
    const byPath=new Map(nativePlan.items.map(x=>[x.path,x]));
    let total=0;
    const parts=[];
    for(const row of rows){
      if(!await this.app.vault.adapter.exists(row.path))throw Error('正式文件已不存在：'+row.path);
      const current=await this.v5Read(row.path);
      if(current.length!==row.local.size||await this.v5Hash(current)!==row.local.sha256)
        throw Error('文件在比对后已修改，必须重新比对：'+row.path);
      total+=current.length;
      if(current.length>8*1024*1024 || total>20*1024*1024)
        throw Error('增量选择上限：每文件 8 MiB、合计 20 MiB，请缩小选择');
      const entry=byPath.get(row.path)||null;
      const known=this.engine.state.known?.[row.path]||null;
      const head=entry?.version||null;
      const status=entry?.status||'untracked';
      if(status==='untracked'){
        if(known)throw Error('已知旧版本但交换区缺少历史，不能重新发布：'+row.path);
      }else if(status==='same'){
        if(!head || head.op!=='upsert' || !known ||
           known.versionId!==head.versionId || head.sha256!==row.local.sha256)
          throw Error('文件的已知版本与共享头不同，请先处理：'+row.path);
      }else if(status==='local-update'){
        if(!head||!known||known.versionId!==head.versionId)
          throw Error('本机更改没有可靠父版本：'+row.path);
        if(head.op==='delete'){
          const auth=this.engine.state.authorizedRestores?.[row.path];
          if(auth?.parentVersionId!==head.versionId||auth.sha256!==row.local.sha256)
            throw Error('删除后恢复尚未明确授权：'+row.path);
        }
      }else{
        throw Error('文件状态 '+status+' 不允许直接发布；先处理冲突/删除：'+row.path);
      }
      parts.push({path:row.path,bytes:current,
        parentVersionId:head?.versionId||null,baseSha256:head?.sha256||null});
    }
    let generated=[];
    // New native versions are authored only following explicit user preview
    // and confirmation. Every selected path must occur in the new immutable
    // native package, and nothing else may enter the selected outer envelope.
    if(OBS.Platform.isDesktopApp){
      const native=await this.engine.publishVersions(parts.map(x=>({...x,
        bytes:Buffer.from(x.bytes)})),{kind:'selected-vault-comparison-export'});
      generated=[{name:native.pack,path:this.engine.dirs(false).content+'/'+native.pack}];
      this.engine.writeInfoSync(true,true);
      await this.engine.persist();
    }else{
      const preview=await this.engine.previewUpload();
      const native=await this.engine.safeExport(preview,{allowInitial:true,allowDeletes:false,
        selectedPaths:paths,republishSame:true});
      generated=native.files||[];
    }
    if(!generated.length)throw Error('本机未生成原生内容版本；未生成外层增量包');
    const transferSources=[],nativePaths=new Set();
    try{
      for(const pack of generated){
        const name=pack.name||String(pack.path||'').split('/').pop();
        if(!/^\d{8}T\d{9}Z__vr-[a-z0-9]{16,64}__\d{6,12}__[a-f0-9]{8}\.zip$/.test(name))
          throw Error('原生内容包文件名不合法');
        let data,manifest;
        if(OBS.Platform.isDesktopApp){
          const nodeFs=require('node:fs'),nodePath=require('node:path');
          const nativePath=nodePath.join(this.engine.dirs(false).content,name);
          const verified=await this.engine.readPack(nativePath,true);
          data=new Uint8Array(nodeFs.readFileSync(nativePath));manifest=verified.manifest;
        }else{
          data=await this.v5Read(pack.path);
          const verified=await this.engine.checkedPack(data,{filename:name});
          manifest=verified.manifest;
        }
        for(const entry of manifest.entries){
          if(entry.op!=='upsert'||!paths.includes(entry.path)||nativePaths.has(entry.path))
            throw Error('新包含未选中的文件或重复版本，停止外层封装');
          nativePaths.add(entry.path);
        }
        if(data.length>Bridge.__testing.MAX_ITEM_BYTES)throw Error('原生内容包过大');
        transferSources.push({name:'content/'+name,bytes:data,sha256:await this.v5Hash(data)});
      }
      if(nativePaths.size!==rows.length)throw Error('选择性增量封装前路径不完整');
      const notePackages=transferSources.length;
      const pendingAcks=await this.pendingNativeAckEntries();
      if(transferSources.length+pendingAcks.length>Bridge.__testing.MAX_FILES ||
         transferSources.reduce((n,x)=>n+x.bytes.length,0)+
         pendingAcks.reduce((n,x)=>n+x.bytes.length,0)>Bridge.__testing.MAX_BUNDLE_BYTES-100000)
        throw Error('选择性增量与 ACK 超过单包大小或数量上限，未生成不完整混合 ZIP');
      transferSources.push(...pendingAcks);
      const mf={format:'vault-relay-transport-envelope',schema:1,
        bundleId:'br-'+Bridge.__testing.timestamp()+'-'+Bridge.__testing.randomHex(12),
        groupId:this.data.groupId,vaultName:this.app.vault.getName(),
        groupName:this.data.groupName||this.app.vault.getName(),
        transportDeviceId:this.data.deviceId,nativeSenderDeviceId:this.engine.state.deviceId,
        platform:OBS.Platform.isIosApp?'iOS':OBS.Platform.isAndroidApp?'Android':'Windows',
        createdAt:new Date().toISOString(),files:transferSources.map(x=>({
          path:x.name,bytes:x.bytes.length,sha256:x.sha256}))};
      const zip=Bridge.__testing.zipEncode([
        {name:'manifest.json',data:new TextEncoder().encode(JSON.stringify(mf,null,2))},
        ...transferSources.map(x=>({name:x.name,data:x.bytes}))]);
      if(zip.length>Bridge.__testing.MAX_BUNDLE_BYTES)throw Error('选择性增量超出外层 ZIP 大小上限');
      const filename=Bridge.__testing.namedZip(
        this.data.groupShortName,
        this.data.deviceShortName);
      const saved=await this.writeOutgoing(filename,zip);
      const sha=await this.v5Hash(zip);
      const record=await Lifecycle.collect(this,transferSources,mf,filename,sha,
        {kind:saved.kind,path:saved.path});
      record.sourceFingerprint='selected-'+sha;
      this.data.ackTransportLedger ||= {};
      for(const item of pendingAcks)
        this.data.ackTransportLedger[item.name]={mode:'bundle',sha256:item.sha256,
          bundleName:filename,at:Date.now()};
      this.data.latest=saved.path;
      this.data.latestFingerprint=record.sourceFingerprint;
      if(OBS.Platform.isDesktopApp){
        this.data.desktopLedger ||= {};
        this.data.desktopLedger.lastPublishedSha ||= {};
        for(const s of transferSources)this.data.desktopLedger.lastPublishedSha[s.name]=s.sha256;
      }
      await this.persistTransport();
      await this.log('知识库比对 · 选择性增量已准备','选择 '+rows.length+' 项，原生内容 ZIP '+
        notePackages+' 个、合包 ACK '+pendingAcks.length+' 个；'+saved.path+'。'+
        (saved.queued?'Windows 自动收发暂停，仅保留本地队列；':'')+
        'Windows 云端上传状态仍需确认；移动端需手动上传。');
      return {path:saved.path,content:zip,files:rows.length,paths,incremental:true};
    }catch(e){
      await this.log('选择性增量封装未完成','原生新版本可能已经保存在 outbox；'+
        String(e.message||e)+'。不得再次盲目发布；先检查本机日志与输出包。');
      throw e;
    }
  }

  openPreparedFileLocation(raw){
    const relative=String(raw||'');
    const safeRel=/^VaultRelay-Transfer\/(?:[a-zA-Z0-9._-]+\/)*[^\/]+$/;
    const desktop=OBS.Platform.isDesktopApp;
    let absolute='';
    if(desktop){
      const fs=require('node:fs'),path=require('node:path');
      const base=this.app.vault.adapter?.getBasePath?.()||this.app.vault.adapter?.basePath;
      if(!base)throw Error('当前知识库根目录不可用');
      const vault=path.resolve(base);
      if(safeRel.test(relative) && relative.split('/').every(x=>x!=='.'&&x!=='..')){
        absolute=path.resolve(vault,...relative.split('/'));
        if(!absolute.startsWith(vault+path.sep))throw Error('文件越过知识库边界');
      }else if(path.isAbsolute(relative)){
        // Selected incremental packages can be written directly to the external
        // Baidu mirror. Only allow an exact child of the verified active mirror.
        const cloud=this.cloudConfig().cloud;
        absolute=path.resolve(relative);
        if(path.dirname(absolute)!==cloud || !/\.zip$/i.test(path.basename(absolute)))
          throw Error('不允许打开未经核实的外部目录');
      }else throw Error('导出路径不符合安全白名单');
      if(!fs.existsSync(absolute)||!fs.lstatSync(absolute).isFile()||fs.lstatSync(absolute).isSymbolicLink())
        throw Error('文件不存在、不是普通文件或属于不允许的链接：'+absolute);
      // Do not follow symlinks from a supposedly vault-internal export to an
      // unrelated path. A file picker should only ever open the original export.
      const canonicalFile=fs.realpathSync(absolute);
      if(safeRel.test(relative)){
        const canonicalVault=fs.realpathSync(vault);
        const nested=path.relative(canonicalVault,canonicalFile);
        if(!nested||nested.startsWith('..'+path.sep)||path.isAbsolute(nested)||
           nested.split(path.sep)[0]!=='VaultRelay-Transfer')
          throw Error('导出文件链接越过当前知识库范围，拒绝定位');
      }else{
        const canonicalCloud=fs.realpathSync(this.cloudConfig().cloud);
        if(path.dirname(canonicalFile)!==canonicalCloud)
          throw Error('导出文件链接越过已绑定的百度同步目录，拒绝定位');
      }
      try{
        const electron=require('electron');
        if(typeof electron?.shell?.showItemInFolder==='function'){
          electron.shell.showItemInFolder(absolute);return true;
        }
        if(typeof electron?.shell?.openPath==='function'){
          void electron.shell.openPath(path.dirname(absolute));return true;
        }
      }catch(_){/* Some Obsidian runtime builds do not expose Electron. */}
      // Do not claim that a folder opened if the host does not expose it.
      try{
        if(navigator?.clipboard?.writeText){
          void navigator.clipboard.writeText(absolute).catch(()=>{});
          new OBS.Notice('系统未提供文件夹定位接口；已尝试复制绝对路径：'+absolute,11000);
        }else new OBS.Notice('请在文件管理器打开：'+absolute,11000);
      }catch(_){new OBS.Notice('请在文件管理器打开：'+absolute,11000);}
      return false;
    }
    if(!safeRel.test(relative)||relative.split('/').some(x=>x==='..'))
      throw Error('移动端导出文件路径不安全');
    // Mobile Obsidian cannot reliably open arbitrary file-manager folders;
    // offer the real vault-relative path instead of a decorative no-op.
    try{
      if(typeof navigator!=='undefined'&&navigator.clipboard?.writeText){
        void navigator.clipboard.writeText(relative).catch(()=>{});
        new OBS.Notice('系统无法直接定位知识库文件夹；已尝试复制相对路径：'+relative,11000);
      }else new OBS.Notice('请在系统文件管理器中打开当前知识库下的 '+relative,11000);
    }catch(_){new OBS.Notice('文件位置：'+relative,11000);}
    return false;
  }
  openCoreUi(action){
    if(action==='setup'){new OBS.Notice('请在 V5 控制台的「设置与连接检查」修改群组及设备名称',6000);return true;}
    if(action==='merge'&&!OBS.Platform.isDesktopApp){new OBS.Notice('移动端可查看冲突；智能合并在 Windows 上操作',6000);return false;}
    const Type=NativeUi[action]||NativeUi.home;
    if(!Type){new OBS.Notice('当前平台没有此功能',6000);return false;}
    const instance=new Type(this.app,this);
    if(action==='download'){
      this._vrReviewModal=instance;
      const previousClose=instance.onClose?.bind(instance);
      instance.onClose=()=>{
        if(this._vrReviewModal===instance)this._vrReviewModal=null;
        if(previousClose)previousClose();
      };
    }
    try{
      instance.open();
      return true;
    }catch(err){
      if(this._vrReviewModal===instance)this._vrReviewModal=null;
      throw err;
    }
  }
  async scanOutbox(includeAck=false){
    if(!OBS.Platform.isDesktopApp)return UnifiedBase.prototype.scanOutbox.call(this,includeAck);
    const rows=[];
    const prefix=this.engine.dirs(true).root;
    await Bridge.__testing.scanWindowsFolder(prefix,rows);
    return rows.filter(x=>includeAck?x.rolePath.startsWith('ack/'):
      /^(content|info)\/.+/.test(x.rolePath));
  }
  async importRawAckFile(file,options={}){
    const result=await UnifiedBase.prototype.importRawAckFile.call(this,file,options);
    if(OBS.Platform.isDesktopApp){
      await this.engine.receiveAck();
    }else{
      await this.acceptMobileAck(file);
    }
    await this.safeCleanup({automatic:true});
    return result;
  }
  async acceptMobileAck(file){
    const bytes=new Uint8Array(await file.arrayBuffer());
    const ack=await Bridge.__testing.validateRawAck(bytes,file.name,this.data.groupId);
    const doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    const entries=doc.format==='vaultrelay.ack-batch.v2'?doc.entries:[doc];
    const s=this.engine.state;
    let accepted=0;
    for(const item of entries){
      if(item.toDeviceId!==s.deviceId)continue;
      if(!['applied','same','equivalent','conflict','rejected'].includes(item.outcome))continue;
      const own=s.known?.[item.path];
      if(!own||own.versionId!==item.versionId||own.sha256!==item.contentSha256)continue;
      const basis=s.groupId+'|'+s.deviceId+'|'+item.versionId+'|'+(item.contentSha256||'delete')+'|'+item.outcome+'|'+item.fromDeviceId;
      const expected=await Bridge.__testing.sha256(new TextEncoder().encode(basis));
      if(item.ackId!==expected)continue;
      const key=item.fromDeviceId+'|'+item.ackId;
      if(!s.receivedAcks[key]){s.receivedAcks[key]=item;accepted++;}
    }
    await this.persistTransport();
    await this.log('独立 ACK 已核对',accepted+' 条反馈与本机版本完全匹配');
  }
  async runCoreOnce(){
    // Scheme A: the former one-click apply helper is now read-only.
    await this.showReviewAfterReceive({reason:'manual-review'});
    return {manualReview:true};
  }
  async monitorCore(){
    if(!this.engine?.state?.syncEnabled)return;
    await this.engine.tick();
    await this.safeCleanup({automatic:true});
  }
  async toggleCoreAuto(){
    throw Error('V4.0.10 方案 A 已暂停正式笔记自动应用。请通过下载审核窗口人工确认写入；Windows ZIP/ACK 自动运输仍可独立开启');
  }
  async onunload(){
    this._vr527TextObserver?.disconnect();
    if(this._vrReviewTimer)clearTimeout(this._vrReviewTimer);
    if(this.engine && typeof Native.prototype.onunload==='function')Native.prototype.onunload.call(this);
  }
}
module.exports=VaultRelayV4;
module.exports.__testing={...UnifiedBase.__testing,
  Native, NativeUi, createNative:()=>Native};
module.exports.__testing.ui527=VR527UI;

