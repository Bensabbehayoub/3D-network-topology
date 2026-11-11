import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three/build/three.module.js';
import {createDeviceFactory} from './factory.js';
import {createMockRenderer} from './mock.js';
import {pickDeviceFromObjects} from './scene.js';

const raycaster=new THREE.Raycaster();
const box=(id,z,{nested=false}={})=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());mesh.position.z=z;if(!nested)mesh.userData.deviceId=id;if(!nested)return mesh;const root=new THREE.Group();root.userData.deviceId=id;const child=new THREE.Group();child.add(mesh);root.add(child);return root;};

test('picks a direct device mesh',()=>{
 const device=box('direct',4);assert.equal(pickDeviceFromObjects(raycaster,[device],{x:0,y:0,z:0},{x:0,y:0,z:5}),'direct');
});

test('picks a nested mesh through parent device metadata',()=>{
 const device=box('nested',4,{nested:true});assert.equal(pickDeviceFromObjects(raycaster,[device],{x:0,y:0,z:0},{x:0,y:0,z:1}),'nested');
});

test('picking returns the nearest device and ignores non-device geometry',()=>{
 const decoration=box(undefined,1),near=box('near',3),far=box('far',7);delete decoration.userData.deviceId;
 assert.equal(pickDeviceFromObjects(raycaster,[far,decoration,near],{x:0,y:0,z:0},{x:0,y:0,z:1}),'near');
});

test('picking a miss returns null',()=>{
 assert.equal(pickDeviceFromObjects(raycaster,[box('device',4)],{x:5,y:0,z:0},{x:0,y:0,z:1}),null);
});

test('invalid picking rays are rejected',()=>{
 const object=box('device',4);for(const [origin,direction] of [[null,{x:0,y:0,z:1}],[{x:0,y:0,z:0},{x:0,y:0,z:0}],[{x:NaN,y:0,z:0},{x:0,y:0,z:1}],[{x:0,y:0,z:0},{x:0,y:Infinity,z:1}]])assert.throws(()=>pickDeviceFromObjects(raycaster,[object],origin,direction),TypeError);
});

test('mock pickDevice normalizes rays, finds nearest hits, misses, and guards disposal',()=>{
 const renderer=createMockRenderer();renderer.loadTopology({devices:[{id:'near',type:'pc',position:[0,0,3]},{id:'far',type:'router',position:[0,0,8]}],links:[]});
 assert.equal(renderer.pickDevice({x:0,y:0,z:0},{x:0,y:0,z:10}),'near');assert.equal(renderer.pickDevice({x:4,y:0,z:0},{x:0,y:0,z:1}),null);assert.throws(()=>renderer.pickDevice({x:0,y:0,z:0},{x:0,y:0,z:0}),TypeError);renderer.dispose();assert.throws(()=>renderer.pickDevice({x:0,y:0,z:0},{x:0,y:0,z:1}),/disposed/);
});

test('selected highlight is per-instance, cyan-bright, and restores original materials',()=>{
 const factory=createDeviceFactory(),selected=factory.createFallback({id:'a',type:'pc',position:{x:0,y:0,z:0}}),other=factory.createFallback({id:'b',type:'pc',position:{x:3,y:0,z:0}});
 const mesh=selected.children[0].children.find(child=>child.isMesh),otherMesh=other.children[0].children.find(child=>child.isMesh),original=mesh.material;assert.equal(otherMesh.material,original);
 factory.setHighlight(selected,'selected');const highlighted=mesh.material;assert.notEqual(highlighted,original);assert.equal(otherMesh.material,original);assert.equal(highlighted.emissive.getHex(),0x4fdcf2);assert.ok(highlighted.emissiveIntensity>=.85);let released=false;highlighted.addEventListener('dispose',()=>released=true);
 factory.setHighlight(selected,'normal');assert.equal(mesh.material,original);assert.equal(released,true);assert.equal(selected.userData.highlight.visible,false);factory.dispose();
});

test('selected treatment also applies to loaded GLBs and other modes remain available',async()=>{
 const source=new THREE.Group(),material=new THREE.MeshStandardMaterial({color:0x2563eb});source.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material));const factory=createDeviceFactory({loader:{loadAsync:async()=>({scene:source})}}),root=await factory.loadModel({id:'pc',type:'pc',position:{x:0,y:0,z:0}}),mesh=root.children[0].children[0].children[0],original=mesh.material;
 factory.setHighlight(root,'selected');assert.notEqual(mesh.material,original);factory.setHighlight(root,'active');assert.equal(mesh.material,original);assert.equal(root.userData.highlight.visible,true);factory.setHighlight(root,'error');assert.equal(mesh.material,original);factory.setHighlight(root,'normal');assert.equal(root.userData.highlight.visible,false);factory.dispose();
});
