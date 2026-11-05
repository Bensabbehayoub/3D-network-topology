// Run from repository root after `npm install --no-save three@0.180.0`.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root = new URL('../../',import.meta.url);
const installed = new URL('node_modules/three/',root);
const destination = new URL('./',import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json',installed),'utf8'));
if (pkg.version !== '0.180.0') throw new Error(`Expected Three.js 0.180.0, received ${pkg.version}`);
for(const path of ['build/three.module.js','build/three.core.js','examples/jsm/controls/OrbitControls.js']) {
 const source = new URL(path,installed), target = new URL(path,destination);
 await mkdir(new URL('.',target),{recursive:true});
 let code=await readFile(source,'utf8');
 // Avoid requiring changes to Ramy's index.html import map.
 if(path.endsWith('OrbitControls.js')) code=code.replace(/from ['"]three['"]/g,"from '../../../build/three.module.js'");
 await writeFile(target,code);
}
await writeFile(new URL('VERSION.txt',destination),`three ${pkg.version}\n`);
console.log('Bundled Three.js 0.180.0; runtime imports are local.');
