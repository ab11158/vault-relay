const {spawnSync}=require('node:child_process');const path=require('node:path');
const cases=['test-flow','verify-ui','verify-history','verify-discard','verify-dbox','verify-inbox-errors','verify-v70','verify-v71','verify-v71-history','verify-v71-failures','verify-v72','verify-v73','verify-baidu-batch','verify-v761','verify-v79-return','verify-v710-download-review','verify-v711-desktop-review','verify-private-note-delete','verify-v712-current-state'];
for(const test of cases){console.log('Checking '+test);const result=spawnSync(process.execPath,[path.join(__dirname,test+'.cjs')],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
console.log('PASS all regression suites');
