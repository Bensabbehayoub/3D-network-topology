import * as THREE from '../../vendor/three/build/three.module.js';
import { GLTFLoader } from '../../vendor/three/examples/jsm/loaders/GLTFLoader.js';

export const DEVICE_MODEL_TYPES = Object.freeze({pc:'pc',host:'pc',router:'router',switch:'switch',server:null});
export const MODEL_URLS = Object.freeze({
  pc:new URL('../../assets/models/pc.glb',import.meta.url),
  router:new URL('../../assets/models/router.glb',import.meta.url),
  switch:new URL('../../assets/models/switch.glb',import.meta.url),
});

const TARGET_SIZE={pc:[1.9,2.15,1.2],router:[2.1,1.45,1.35],switch:[3.0,.72,1.15]};
const COLORS={pc:0x3b82f6,host:0x3b82f6,router:0xffa94d,switch:0x10b981,server:0xa78bfa};
const HIGHLIGHTS={selected:0xb5f6ff,active:0x35e89a,error:0xff4d62};

export function createGenerationTracker(){
 let current=0,disposed=false;
 return {next(){return ++current;},isCurrent(token){return !disposed&&token===current;},dispose(){disposed=true;current++;},get current(){return current;}};
}

function markDeviceTree(root,device){
 root.traverse(object=>{object.userData.deviceId=device.id;object.userData.deviceType=device.type;object.userData.deviceRoot=root;});
}

function disposeTree(root,seen={geometries:new Set(),materials:new Set(),textures:new Set()}){
 root.traverse(object=>{
  if(object.geometry&&!seen.geometries.has(object.geometry)){seen.geometries.add(object.geometry);object.geometry.dispose();}
  const materials=object.material?(Array.isArray(object.material)?object.material:[object.material]):[];
  for(const material of materials){
   if(seen.materials.has(material))continue;seen.materials.add(material);
   for(const value of Object.values(material))if(value?.isTexture&&!seen.textures.has(value)){seen.textures.add(value);value.dispose();}
   material.dispose();
  }
 });
 return seen;
}

function primitiveTemplate(type){
 const group=new THREE.Group();group.name=`${type} fallback`;
 const material=new THREE.MeshStandardMaterial({color:COLORS[type],roughness:.5,metalness:.12});
 const dark=new THREE.MeshStandardMaterial({color:0x101827,roughness:.65});
 const add=(geometry,mat,position)=>{const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(...position);group.add(mesh);return mesh;};
 if(type==='switch'){
  add(new THREE.BoxGeometry(2.8,.45,1),material,[0,.25,0]);
  for(let i=0;i<6;i++)add(new THREE.BoxGeometry(.28,.15,.04),dark,[-1.05+i*.42,.24,.52]);
 }else if(type==='router'){
  add(new THREE.BoxGeometry(2,.52,1.25),material,[0,.3,0]);
  add(new THREE.BoxGeometry(.08,1.3,.08),dark,[-.75,.98,-.4]);add(new THREE.BoxGeometry(.08,1.3,.08),dark,[.75,.98,-.4]);
 }else if(type==='server'){
  add(new THREE.BoxGeometry(1.05,1.8,.9),material,[0,.9,0]);
  for(let i=0;i<4;i++)add(new THREE.BoxGeometry(.78,.23,.04),dark,[0,.35+i*.36,.47]);
 }else{
  add(new THREE.BoxGeometry(1.35,.85,.18),material,[-.18,1.3,0]);add(new THREE.BoxGeometry(.12,.55,.12),dark,[-.18,.62,0]);
  add(new THREE.BoxGeometry(.7,.09,.5),dark,[-.18,.35,.08]);add(new THREE.BoxGeometry(.48,1.25,.65),material,[.78,.63,0]);
 }
 return group;
}

/** Creates cached model instances while keeping all shared GPU resources factory-owned. */
export function createDeviceFactory({loader=new GLTFLoader(),modelUrls=MODEL_URLS,onError=(error,device)=>console.warn(`Model unavailable for ${device.id}; using fallback.`,error)}={}){
 const templatePromises=new Map(),fallbackTemplates=new Map(),ownedTemplates=new Set(),selectedRoots=new Set();let disposed=false;
 const haloGeometry=new THREE.RingGeometry(.78,1,32);
 const haloMaterials=Object.fromEntries(Object.entries(HIGHLIGHTS).map(([mode,color])=>[mode,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.78,side:THREE.DoubleSide,depthWrite:false})]));

 function fallbackTemplate(type){
  if(!fallbackTemplates.has(type)){const template=primitiveTemplate(type);fallbackTemplates.set(type,template);ownedTemplates.add(template);}
  return fallbackTemplates.get(type);
 }
 function decorate(device,visual,status){
  const root=new THREE.Group();root.name=`Device ${device.id}`;root.position.set(device.position.x,device.position.y,device.position.z);root.add(visual);
  visual.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(visual);const size=box.getSize(new THREE.Vector3());
  root.userData.modelStatus=status;root.userData.bounds={x:size.x||1,y:size.y||1,z:size.z||1};root.userData.linkHeight=Math.max(.14,Math.min(.4,(size.y||1)*.2));
  const halo=new THREE.Mesh(haloGeometry,haloMaterials.selected);halo.name='Device highlight';halo.rotation.x=-Math.PI/2;halo.position.y=.035;halo.scale.setScalar(Math.max(size.x,size.z,.8)*.66);halo.visible=false;halo.userData.isHighlight=true;root.add(halo);root.userData.highlight=halo;
  markDeviceTree(root,device);return root;
 }
 function createFallback(device){return decorate(device,fallbackTemplate(device.type).clone(true),'fallback');}
 function loadTemplate(modelType){
  if(!templatePromises.has(modelType)){
   const url=modelUrls[modelType];
   const promise=loader.loadAsync(url.href??String(url)).then(gltf=>{
    const scene=gltf?.scene;if(!scene?.isObject3D)throw new Error(`Invalid ${modelType} GLB scene`);
    if(disposed){disposeTree(scene);throw new Error('Factory disposed');}
    ownedTemplates.add(scene);return scene;
   });
   templatePromises.set(modelType,promise);
  }
  return templatePromises.get(modelType);
 }
 async function loadModel(device){
  const modelType=DEVICE_MODEL_TYPES[device.type];if(!modelType||disposed)return null;
  try{
   const template=await loadTemplate(modelType);if(disposed)return null;
   const visual=new THREE.Group(),clone=template.clone(true);visual.add(clone);clone.updateMatrixWorld(true);
   let box=new THREE.Box3().setFromObject(clone),size=box.getSize(new THREE.Vector3());const target=TARGET_SIZE[modelType];
   const scale=Math.min(target[0]/Math.max(size.x,.001),target[1]/Math.max(size.y,.001),target[2]/Math.max(size.z,.001));clone.scale.setScalar(scale);clone.updateMatrixWorld(true);
   box=new THREE.Box3().setFromObject(clone);const center=box.getCenter(new THREE.Vector3());clone.position.x-=center.x;clone.position.z-=center.z;clone.position.y-=box.min.y;clone.updateMatrixWorld(true);
   return decorate(device,visual,'model');
  }catch(error){if(!disposed)onError(error,device);return null;}
 }
 function setHighlight(root,mode='selected'){
  if(!root?.userData?.highlight)return false;const halo=root.userData.highlight;
  if(root.userData.selectedMaterials){
   for(const {object,original,clones} of root.userData.selectedMaterials){object.material=original;for(const material of clones)material.dispose();}
   delete root.userData.selectedMaterials;selectedRoots.delete(root);
  }
  if(mode==='normal'){halo.visible=false;return true;}
  if(mode==='selected'){
   const selectedMaterials=[];root.traverse(object=>{if(!object.material||object.userData?.isHighlight)return;const original=object.material,source=Array.isArray(original)?original:[original],clones=source.map(material=>{const clone=material.clone();if(clone.color)clone.color.lerp(new THREE.Color(0xb5f6ff),.32);if(clone.emissive){clone.emissive.setHex(0x4fdcf2);clone.emissiveIntensity=Math.max(clone.emissiveIntensity??1,.85);}return clone;});object.material=Array.isArray(original)?clones:clones[0];selectedMaterials.push({object,original,clones});});root.userData.selectedMaterials=selectedMaterials;selectedRoots.add(root);
  }
  halo.material=haloMaterials[mode];halo.visible=true;return true;
 }
 function dispose(){
  if(disposed)return;for(const root of [...selectedRoots])setHighlight(root,'normal');disposed=true;const seen={geometries:new Set(),materials:new Set(),textures:new Set()};
  for(const template of ownedTemplates)disposeTree(template,seen);haloGeometry.dispose();Object.values(haloMaterials).forEach(material=>material.dispose());
  ownedTemplates.clear();fallbackTemplates.clear();templatePromises.clear();
 }
 return {createFallback,loadModel,setHighlight,dispose,get disposed(){return disposed;}};
}

export { markDeviceTree, disposeTree };
