import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import * as THREE from '../../vendor/three/build/three.webgpu.js';
import {GLTFLoader} from '../../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import {createDeviceFactory,createGenerationTracker,DEVICE_MODEL_TYPES,MODEL_URLS} from './factory.js';
import {createLinkLayer,resolveLinkEndpoints} from './links.js';
import {formatDeviceLabel,labelLines} from './labels.js';
import {createMockRenderer} from './mock.js';

const device=(id='pc-1',type='pc',position={x:2,y:0,z:-3})=>({id,type,label:id,ip:null,position});
const template=()=>{const scene=new THREE.Group();scene.add(new THREE.Mesh(new THREE.BoxGeometry(2,1,1),new THREE.MeshStandardMaterial()));return {scene};};

test('device types map to the requested models',()=>{
 assert.deepEqual(DEVICE_MODEL_TYPES,{pc:'pc',host:'pc',router:'router',switch:'switch',server:null});
 assert.match(MODEL_URLS.router.pathname,/assets\/models\/router\.glb$/);assert.match(MODEL_URLS.switch.pathname,/switch\.glb$/);assert.match(MODEL_URLS.pc.pathname,/pc\.glb$/);
});

test('factory returns a positioned fallback with nested selection metadata',()=>{
 const factory=createDeviceFactory();const root=factory.createFallback(device());assert.deepEqual(root.position.toArray(),[2,0,-3]);assert.equal(root.userData.modelStatus,'fallback');
 const nested=root.children[0].children[0];assert.equal(nested.userData.deviceId,'pc-1');assert.equal(nested.userData.deviceRoot,root);factory.dispose();
});

test('factory loads and caches model templates',async()=>{
 let calls=0;const loader={loadAsync:async()=>{calls++;return template();}};const factory=createDeviceFactory({loader});
 const [one,two]=await Promise.all([factory.loadModel(device('a')),factory.loadModel(device('b'))]);assert.equal(calls,1);assert.equal(one.userData.modelStatus,'model');assert.notEqual(one,two);assert.equal(two.position.x,2);factory.dispose();
});

test('failed model load leaves the deterministic primitive fallback usable',async()=>{
 const factory=createDeviceFactory({loader:{loadAsync:async()=>{throw new Error('offline');}},onError:()=>{}});const fallback=factory.createFallback(device());
 assert.equal(await factory.loadModel(device()),null);assert.ok(fallback.children[0].children.some(child=>child.isMesh));factory.dispose();
});

test('server deliberately uses a primitive and performs no asset request',async()=>{
 let called=false;const factory=createDeviceFactory({loader:{loadAsync:async()=>{called=true;return template();}}});const server=device('srv','server');
 assert.equal(await factory.loadModel(server),null);assert.equal(called,false);assert.equal(factory.createFallback(server).userData.modelStatus,'fallback');factory.dispose();
});

test('highlight state is isolated to each device root',()=>{
 const factory=createDeviceFactory(),a=factory.createFallback(device('a')),b=factory.createFallback(device('b'));factory.setHighlight(a,'error');
 assert.equal(a.userData.highlight.visible,true);assert.equal(b.userData.highlight.visible,false);factory.setHighlight(a,'normal');assert.equal(a.userData.highlight.visible,false);factory.dispose();
});

test('factory disposal releases shared fallback geometry',()=>{
 const factory=createDeviceFactory(),root=factory.createFallback(device());const geometry=root.children[0].children.find(child=>child.isMesh).geometry;let released=false;geometry.addEventListener('dispose',()=>released=true);factory.dispose();assert.equal(released,true);
});

test('generation tracker rejects older topology work and work after disposal',()=>{
 const tracker=createGenerationTracker(),first=tracker.next(),second=tracker.next();assert.equal(tracker.isCurrent(first),false);assert.equal(tracker.isCurrent(second),true);tracker.dispose();assert.equal(tracker.isCurrent(second),false);
});

test('disposal during an active model load prevents a late instance',async()=>{
 let resolve;const pending=new Promise(done=>resolve=done),factory=createDeviceFactory({loader:{loadAsync:()=>pending},onError:()=>{}});const loading=factory.loadModel(device());factory.dispose();resolve(template());assert.equal(await loading,null);
});

test('link endpoints resolve by stable ID and missing endpoints are skipped',()=>{
 const a=new THREE.Group(),b=new THREE.Group();a.position.set(0,0,0);b.position.set(4,0,0);a.userData.bounds=b.userData.bounds={x:1,y:1,z:1};const devices=new Map([['a',a],['b',b]]);
 assert.deepEqual(resolveLinkEndpoints({from:'a',to:'b'},devices),{from:a,to:b});assert.equal(resolveLinkEndpoints({from:'a',to:'missing'},devices),null);
 const layer=createLinkLayer([{id:'ok',from:'a',to:'b'},{id:'bad',from:'a',to:'missing'}],devices);assert.equal(layer.objects.size,1);assert.deepEqual(layer.skipped,['bad']);assert.equal(layer.objects.get('ok').geometry.getAttribute('position').count,3);layer.dispose();
});

test('link disposal releases geometry exactly through its owned layer',()=>{
 const a=new THREE.Group(),b=new THREE.Group();b.position.x=3;const devices=new Map([['a',a],['b',b]]),layer=createLinkLayer([{id:'l',from:'a',to:'b'}],devices);let released=false;layer.objects.get('l').geometry.addEventListener('dispose',()=>released=true);layer.dispose();assert.equal(released,true);
});

test('labels include an IP only when one is available',()=>{
 assert.deepEqual(labelLines({id:'p',label:'PC 1',ip:'192.168.1.10'}),['PC 1','192.168.1.10']);assert.equal(formatDeviceLabel({id:'sw',label:'Switch',ip:null}),'Switch');
});

test('repeated mock topology loads replace rather than append state',()=>{
 const renderer=createMockRenderer();renderer.loadTopology({devices:[{id:'a',type:'pc'}],links:[]});renderer.loadTopology({devices:[{id:'b',type:'router'}],links:[]});assert.equal(renderer.getDevice('a'),null);assert.deepEqual(renderer.listDevices().map(item=>item.id),['b']);renderer.dispose();
});

test('GLBs have valid headers, embedded glTF 2 JSON, and load in the vendored loader',async()=>{
 for(const name of ['router','switch','pc']){const path=new URL(`../../assets/models/${name}.glb`,import.meta.url);const bytes=await readFile(path),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);assert.equal(view.getUint32(0,true),0x46546c67);assert.equal(view.getUint32(4,true),2);assert.equal(view.getUint32(8,true),bytes.byteLength);assert.ok((await stat(path)).size<10_000);
  const jsonLength=view.getUint32(12,true),json=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+jsonLength)).trim());assert.equal(json.asset.version,'2.0');assert.ok(json.meshes.length>0);assert.ok(json.materials.length>1);
  const arrayBuffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),gltf=await new GLTFLoader().parseAsync(arrayBuffer,'../../assets/models/');assert.ok(gltf.scene.children.length>0);
 }
});

test('GLTFLoader and dependency resolve only through vendored local imports',async()=>{
 const loader=await readFile(new URL('../../vendor/three/examples/jsm/loaders/GLTFLoader.js',import.meta.url),'utf8');const utility=await readFile(new URL('../../vendor/three/examples/jsm/utils/BufferGeometryUtils.js',import.meta.url),'utf8');
 assert.doesNotMatch(loader,/from ['"]three['"]/);assert.doesNotMatch(utility,/from ['"]three['"]/);assert.match(loader,/\.\.\/utils\/BufferGeometryUtils\.js/);
});

test('scene source preserves every S1 public method and adds readiness inspection',async()=>{
 const source=await readFile(new URL('./scene.js',import.meta.url),'utf8');for(const method of ['loadTopology','pickDevice','highlightDevice','getDevice','listDevices','focusDevice','resetView','resize','dispose'])assert.match(source,new RegExp(`${method}\\s*\\(`));assert.match(source,/whenReady\s*\(/);
});
