import * as THREE from '../../vendor/three/build/three.module.js';
import { OrbitControls } from '../../vendor/three/examples/jsm/controls/OrbitControls.js';
import { normalizeTopology } from './topology.js';

const PALETTE={pc:0x3b82f6,host:0x3b82f6,router:0xffb454,switch:0x10b981,server:0xa78bfa};
const VALID_HIGHLIGHTS=new Set(['selected','active','error','normal']);

/** Initializes an independent 3D renderer in the supplied DOM element.
 * All DOM, GPU, observers, and listeners are owned by the returned handle.
 */
export function initScene(container,{onDeviceClick=()=>{},background=0x0b1323}={}) {
 if(!container || typeof container.appendChild!=='function')throw new TypeError('A DOM container is required');
 const scene = new THREE.Scene(); scene.background=new THREE.Color(background);
 const camera=new THREE.PerspectiveCamera(48,1,0.1,1000); camera.position.set(10,12,17);
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.domElement.style.display='block';renderer.domElement.style.width='100%';renderer.domElement.style.height='100%';
 renderer.domElement.style.touchAction='none';container.appendChild(renderer.domElement);
 const controls=new OrbitControls(camera,renderer.domElement);
 controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=3;controls.maxDistance=80;
 controls.maxPolarAngle=Math.PI*.49;
 scene.add(new THREE.HemisphereLight(0xdceaff,0x17233d,2.25));
 const key=new THREE.DirectionalLight(0xffffff,2);key.position.set(8,15,10);scene.add(key);
 const floor=new THREE.GridHelper(40,40,0x42617c,0x203247);floor.position.y=-0.06;scene.add(floor);
 const content=new THREE.Group();scene.add(content);
 const deviceMeshes=new Map(), edgeMeshes=new Map();
 let model={devices:[],links:[]},disposed=false,raf=0;
 const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
 let downPoint=null;
 const resize=()=>{if(disposed)return;const width=Math.max(container.clientWidth||640,1),height=Math.max(container.clientHeight||420,1);camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height,false);};
 const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;
 observer?.observe(container);window.addEventListener('resize',resize);resize();
 const buildDevice=d=>{
  const geo=d.type==='router'?new THREE.SphereGeometry(.68,24,16):d.type==='switch'?new THREE.BoxGeometry(1.9,.42,1):d.type==='server'?new THREE.BoxGeometry(.95,1.8,.85):new THREE.BoxGeometry(1.25,.85,.7);
  const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:PALETTE[d.type],roughness:.5,metalness:.08,emissive:0x000000}));
  mesh.position.set(d.position.x,d.position.y+.85,d.position.z);mesh.userData.deviceId=d.id;mesh.userData.baseColor=PALETTE[d.type];
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.92,.95,.09,32),new THREE.MeshStandardMaterial({color:0x243a57}));base.position.y=-.55;mesh.add(base);
  content.add(mesh);deviceMeshes.set(d.id,mesh);
 };
 const buildLink=l=>{
   const a=deviceMeshes.get(l.from).position,b=deviceMeshes.get(l.to).position;
   const start=new THREE.Vector3(a.x,.16,a.z),end=new THREE.Vector3(b.x,.16,b.z);
   const curve=new THREE.Line(new THREE.BufferGeometry().setFromPoints([start,end]),new THREE.LineBasicMaterial({color:0x72a3c8}));
   content.add(curve);edgeMeshes.set(l.id,curve);
 };
 const clear=()=>{for(const obj of [...content.children]){content.remove(obj);obj.traverse(child=>{child.geometry?.dispose();const mats=child.material?Array.isArray(child.material)?child.material:[child.material]:[];mats.forEach(m=>m.dispose());});}deviceMeshes.clear();edgeMeshes.clear();};
 const frame=()=>{if(disposed)return;raf=requestAnimationFrame(frame);controls.update();renderer.render(scene,camera);};frame();
 const click=(e)=>{if(disposed||!downPoint||Math.hypot(e.clientX-downPoint.x,e.clientY-downPoint.y)>6)return;
  const rect=renderer.domElement.getBoundingClientRect();if(rect.width===0||rect.height===0)return;
  pointer.set(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1);
  raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects([...deviceMeshes.values()],false);
  if(hits.length){const id=hits[0].object.userData.deviceId;onDeviceClick(id,model.devices.find(d=>d.id===id));}
 };
 const down=e=>{downPoint={x:e.clientX,y:e.clientY};};
 renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',click);
 return {
  loadTopology(data){if(disposed)throw new Error('Renderer disposed');const next=normalizeTopology(data);clear();model=next;for(const d of next.devices)buildDevice(d);for(const l of next.links)buildLink(l);return {devices:next.devices.length,links:next.links.length};},
  highlightDevice(id,mode='selected'){if(!VALID_HIGHLIGHTS.has(mode))throw new TypeError(`Invalid highlight mode ${mode}`);const mesh=deviceMeshes.get(id);if(!mesh)return false;mesh.material.emissive.setHex(mode==='error'?0x8a1b23:mode==='selected'?0x265b8f:mode==='active'?0x19704b:0);return true;},
  getDevice(id){return model.devices.find(d=>d.id===id)||null;},
  listDevices(){return model.devices.map(d=>({...d,position:{...d.position}}));},
  focusDevice(id){const mesh=deviceMeshes.get(id);if(!mesh)return false;controls.target.copy(mesh.position);controls.update();return true;},
  resetView(){camera.position.set(10,12,17);controls.target.set(0,0,0);controls.update();},
  resize,
  dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);observer?.disconnect();window.removeEventListener('resize',resize);renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',click);controls.dispose();clear();floor.geometry.dispose();floor.material.dispose();renderer.dispose();renderer.domElement.remove();},
 };
}
