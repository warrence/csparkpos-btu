import fs from 'fs';
import path from 'path';
import {version as display, SERVER_URL} from '../src/global';
const root=path.join(__dirname,'..');
const android=fs.readFileSync(path.join(root,'android/app/build.gradle'),'utf8');
const actual={display, packageVersion:require('../package.json').version,
 androidVersion:android.match(/^\s*versionName\s+"([^"]+)"\s*$/m)[1],
 code:Number(android.match(/^\s*versionCode\s+(\d+)\s*$/m)[1])};
function verify(v){if(v.display!=='2.0.8'||v.packageVersion!==v.display||v.androidVersion!==v.display||v.code!==8)throw Error('Release version mismatch');}
test('frozen production display/package/Android versions and endpoint agree',()=>{
 expect(()=>verify(actual)).not.toThrow();expect(SERVER_URL).toBe('https://office.bdap.com.my');
});
test.each(['display','packageVersion','androidVersion','code'])('release gate rejects stale %s',field=>{
 expect(()=>verify({...actual,[field]:field==='code'?7:'2.0.7'})).toThrow('Release version mismatch');
});
