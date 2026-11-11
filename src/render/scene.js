import * as THREE from '../../vendor/three/build/three.module.js';
import { OrbitControls } from '../../vendor/three/examples/jsm/controls/OrbitControls.js';
import { createDeviceFactory, createGenerationTracker } from './factory.js';
import { createLinkLayer } from './links.js';
import { createLabelLayer } from './labels.js';
import { normalizePickRay } from './picking.js';
import { normalizeTopology } from './topology.js';

const VALID_HIGHLIGHTS=new Set(['selected','active','error','normal']);

export function resolveDeviceId(object,boundary=null){
 for(let current=object;current&&current!==boundary;current=current.parent)if(current.userData?.deviceId)return current.userData.deviceId;
 return null;
}

/** Internal testable picker used by the public scene handle. Intersections are nearest-first. */
export function pickDeviceFromObjects(raycaster,objects,origin,direction,boundary=null){
 const ray=normalizePickRay(origin,direction);for(const object of objects)object.updateWorldMatrix(true,true);
 raycaster.set(new THREE.Vector3(ray.origin.x,ray.origin.y,ray.origin.z),new THREE.Vector3(ray.direction.x,ray.direction.y,ray.direction.z));
 for(const hit of raycaster.intersectObjects(objects,true)){
  if(hit.object.userData?.isHighlight)continue;const id=resolveDeviceId(hit.object,boundary);if(id)return id;
 }
 return null;
}

/** Initializes an independent renderer. GLBs upgrade immediate fallbacks asynchronously. */
export function initScene(container,{onDeviceClick=()=>{},background=0x0b1323}={}) {
 if(!container || typeof container.appendChild!=='function')throw new TypeError('A DOM container is required');
 const scene = new THREE.Scene(); scene.background=new THREE.Color(background);
 const camera=new THREE.PerspectiveCamera(48,1,0.1,1000); camera.position.set(10,12,17);
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.domElement.style.display='block';renderer.domElement.style.width='100%';renderer.domElement.style.height='100%';
 renderer.domElement.style.touchAction='none';container.appendChild(renderer.domElement);
 // WebXR : la même scène sert au mode classique et à la VR (docs/decision-renderer.md).
 renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local-floor');
 const controls=new OrbitControls(camera,renderer.domElement);
 controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=3;controls.maxDistance=80;
 controls.maxPolarAngle=Math.PI*.49;
 scene.add(new THREE.HemisphereLight(0xdceaff,0x17233d,2.25));
 const key=new THREE.DirectionalLight(0xffffff,2);key.position.set(8,15,10);scene.add(key);
 // world regroupe sol et topologie : en VR on le réduit et on le place devant l'utilisateur.
 const world=new THREE.Group();world.name='World';scene.add(world);
 const floor=new THREE.GridHelper(40,40,0x42617c,0x203247);floor.position.y=-0.06;world.add(floor);
 const content=new THREE.Group();content.name='Topology';world.add(content);
 const VR_SCALE=.18,VR_OFFSET=new THREE.Vector3(0,1,-1.4);
 const onXRStart=()=>{world.scale.setScalar(VR_SCALE);world.position.copy(VR_OFFSET);floor.visible=false;};
 const onXREnd=()=>{world.scale.setScalar(1);world.position.set(0,0,0);floor.visible=true;resize();};
 renderer.xr.addEventListener('sessionstart',onXRStart);renderer.xr.addEventListener('sessionend',onXREnd);
 const factory=createDeviceFactory(),generations=createGenerationTracker(),deviceMeshes=new Map(),highlightModes=new Map();
 let model={devices:[],links:[]},linkLayer=null,labelLayer=null,disposed=false,ready=Promise.resolve([]);
 const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
 let downPoint=null;
 const resize=()=>{if(disposed)return;const width=Math.max(container.clientWidth||640,1),height=Math.max(container.clientHeight||420,1);camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height,false);};
 const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;observer?.observe(container);window.addEventListener('resize',resize);resize();
 const clearTopology=()=>{
  generations.next();linkLayer?.dispose();labelLayer?.dispose();linkLayer=null;labelLayer=null;
  for(const root of deviceMeshes.values()){factory.setHighlight(root,'normal');content.remove(root);}deviceMeshes.clear();highlightModes.clear();
  for(const child of [...content.children])content.remove(child);
 };
 const refreshLayers=()=>{linkLayer?.refresh();labelLayer?.refresh();};
 const replaceDevice=(device,next,token)=>{
  if(!next||disposed||!generations.isCurrent(token))return false;const previous=deviceMeshes.get(device.id);if(previous){factory.setHighlight(previous,'normal');content.remove(previous);}
  const mode=highlightModes.get(device.id);if(mode)factory.setHighlight(next,mode);deviceMeshes.set(device.id,next);content.add(next);refreshLayers();return true;
 };
 // setAnimationLoop is required for immersive sessions and also drives the desktop view.
 const frame=()=>{if(disposed)return;if(!renderer.xr.isPresenting)controls.update();renderer.render(scene,camera);};renderer.setAnimationLoop(frame);
 const click=e=>{
  if(disposed||!downPoint||Math.hypot(e.clientX-downPoint.x,e.clientY-downPoint.y)>6)return;const rect=renderer.domElement.getBoundingClientRect();if(!rect.width||!rect.height)return;
  pointer.set(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointer,camera);
  const hit=raycaster.intersectObjects([...deviceMeshes.values()],true).find(item=>!item.object.userData?.isHighlight);const id=hit&&resolveDeviceId(hit.object,content);if(id)onDeviceClick(id,model.devices.find(device=>device.id===id));
 };
 const down=e=>{downPoint={x:e.clientX,y:e.clientY};};renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',click);

 return {
  loadTopology(data){
   if(disposed)throw new Error('Renderer disposed');const next=normalizeTopology(data);clearTopology();model=next;const token=generations.current;
   for(const device of next.devices){const root=factory.createFallback(device);deviceMeshes.set(device.id,root);content.add(root);}
   linkLayer=createLinkLayer(next.links,deviceMeshes);labelLayer=createLabelLayer(next.devices,deviceMeshes);content.add(linkLayer.group,labelLayer.group);
   const pending=next.devices.map(device=>factory.loadModel(device).then(root=>replaceDevice(device,root,token)));ready=Promise.allSettled(pending);return {devices:next.devices.length,links:next.links.length};
  },
  whenReady(){return ready;},
  pickDevice(origin,direction){if(disposed)throw new Error('Renderer disposed');return pickDeviceFromObjects(raycaster,[...deviceMeshes.values()],origin,direction,content);},
  highlightDevice(id,mode='selected'){if(disposed)throw new Error('Renderer disposed');if(!VALID_HIGHLIGHTS.has(mode))throw new TypeError(`Invalid highlight mode ${mode}`);const root=deviceMeshes.get(id);if(!root)return false;factory.setHighlight(root,mode);if(mode==='normal')highlightModes.delete(id);else highlightModes.set(id,mode);return true;},
  getDevice(id){return model.devices.find(device=>device.id===id)||null;},
  listDevices(){return model.devices.map(device=>({...device,position:{...device.position}}));},
  focusDevice(id){const root=deviceMeshes.get(id);if(!root)return false;controls.target.copy(root.position);controls.update();return true;},
  resetView(){camera.position.set(10,12,17);controls.target.set(0,0,0);controls.update();},
  resize,
  /** Démarre l'affichage dans une session WebXR déjà ouverte (pôle xr). */
  startXR(session){if(disposed)throw new Error('Renderer disposed');return renderer.xr.setSession(session);},
  isPresenting(){return renderer.xr.isPresenting;},
  renderer,
  world,
  dispose(){if(disposed)return;disposed=true;generations.dispose();renderer.setAnimationLoop(null);renderer.xr.removeEventListener('sessionstart',onXRStart);renderer.xr.removeEventListener('sessionend',onXREnd);observer?.disconnect();window.removeEventListener('resize',resize);renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',click);controls.dispose();linkLayer?.dispose();labelLayer?.dispose();for(const root of deviceMeshes.values())factory.setHighlight(root,'normal');deviceMeshes.clear();content.clear();factory.dispose();floor.geometry.dispose();(Array.isArray(floor.material)?floor.material:[floor.material]).forEach(material=>material.dispose());renderer.dispose();renderer.domElement.remove();},
 };
}
