import * as THREE from '../../vendor/three/build/three.webgpu.js';
import { OrbitControls } from '../../vendor/three/examples/jsm/controls/OrbitControls.js';
import { createDeviceFactory, createGenerationTracker } from './factory.js';
import { createLinkLayer } from './links.js';
import { createLabelLayer } from './labels.js';
import { nearestOnRay, normalizePickRay } from './picking.js';
import { BACKEND, createRenderer, extraSessionFeatures } from './renderers.js';
import { prepareXRSession } from './xrBridge.js';
import { normalizeTopology } from './topology.js';
import { frameDelta, topologyBounds, vrPlacement } from './vrLayout.js';

const VALID_HIGHLIGHTS=new Set(['selected','active','error','normal']);

export function resolveDeviceId(object,boundary=null){
 for(let current=object;current&&current!==boundary;current=current.parent)if(current.userData?.deviceId)return current.userData.deviceId;
 return null;
}

/**
 * Lancer de rayon détaillé : équipement le plus proche touché par le rayon, avec le point d'impact.
 * Sert au pôle xr pour arrêter le rayon de la manette sur sa cible.
 * @returns {{ id: string, point: { x: number, y: number, z: number }, distance: number } | null}
 */
export function pickHitFromObjects(raycaster,objects,origin,direction,boundary=null){
 const ray=normalizePickRay(origin,direction);for(const object of objects)object.updateWorldMatrix(true,true);
 raycaster.set(new THREE.Vector3(ray.origin.x,ray.origin.y,ray.origin.z),new THREE.Vector3(ray.direction.x,ray.direction.y,ray.direction.z));
 for(const hit of raycaster.intersectObjects(objects,true)){
  if(hit.object.userData?.isHighlight)continue;const id=resolveDeviceId(hit.object,boundary);
  if(id)return {id,point:{x:hit.point.x,y:hit.point.y,z:hit.point.z},distance:hit.distance};
 }
 return null;
}

/** Internal testable picker used by the public scene handle. Intersections are nearest-first. */
export function pickDeviceFromObjects(raycaster,objects,origin,direction,boundary=null){
 return pickHitFromObjects(raycaster,objects,origin,direction,boundary)?.id??null;
}

/**
 * Crée la scène 3D dans `container` (asynchrone : WebGPURenderer s'initialise avant le premier rendu).
 * Rendu 100 % WebGPU, en mode classique comme en VR (voir renderers.js et xrBridge.js).
 * Lève WebGPUUnavailableError si le navigateur ne fournit pas WebGPU.
 * GLBs upgrade immediate fallbacks asynchronously.
 */
export async function initScene(container,{onDeviceClick=()=>{},onPacketClick=()=>{},background=0x0b1323}={}) {
 if(!container || typeof container.appendChild!=='function')throw new TypeError('A DOM container is required');
 const pixelRatio=Math.min(globalThis.devicePixelRatio||1,2);
 const renderer=await createRenderer({pixelRatio});
 const scene = new THREE.Scene(); scene.background=new THREE.Color(background);
 const camera=new THREE.PerspectiveCamera(48,1,0.1,1000); camera.position.set(10,12,17);
 scene.add(new THREE.HemisphereLight(0xdceaff,0x17233d,2.25));
 const key=new THREE.DirectionalLight(0xffffff,2);key.position.set(8,15,10);scene.add(key);
 // world regroupe sol et topologie : en VR on le réduit et on le place devant l'utilisateur.
 const world=new THREE.Group();world.name='World';scene.add(world);
 const floor=new THREE.GridHelper(40,40,0x42617c,0x203247);floor.position.y=-0.06;world.add(floor);
 const content=new THREE.Group();content.name='Topology';world.add(content);
 const factory=createDeviceFactory(),generations=createGenerationTracker(),deviceMeshes=new Map(),highlightModes=new Map();
 let model={devices:[],links:[]},linkLayer=null,labelLayer=null,disposed=false,ready=Promise.resolve([]);
 const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
 let downPoint=null;

 /** Rendu de la session VR en cours : { backend, path } (voie native ou pont émulateur) ; null hors session. */
 let xrRendering=null;
 const controls=new OrbitControls(camera,renderer.domElement);
 controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=3;controls.maxDistance=80;
 controls.maxPolarAngle=Math.PI*.49;

 // --- VR : la topologie devient une maquette posée devant l'utilisateur (voir vrLayout.js) ---
 let vrAnchor=null,eyeHeightKnown=false;
 // Pendant la session, Three.js recopie la pose du casque dans la caméra : on garde la vue
 // classique (position, orientation, cible des contrôles) pour la rendre à la sortie.
 let savedView=null;
 const saveView=()=>{savedView={position:camera.position.clone(),quaternion:camera.quaternion.clone(),scale:camera.scale.clone(),target:controls.target.clone()};};
 const restoreView=()=>{
  if(!savedView)return;
  camera.position.copy(savedView.position);camera.quaternion.copy(savedView.quaternion);camera.scale.copy(savedView.scale);controls.target.copy(savedView.target);
  camera.updateMatrixWorld(true);savedView=null;controls.update();
 };
 const placeForVR=(eyeHeight)=>{
  const placement=vrPlacement(topologyBounds(model.devices),eyeHeight);
  world.scale.setScalar(placement.scale);world.position.set(placement.position.x,placement.position.y,placement.position.z);vrAnchor=placement.anchor;
 };
 const onXRStart=()=>{eyeHeightKnown=false;placeForVR();floor.visible=false;};
 const onXREnd=()=>{
  vrAnchor=null;xrRendering=null;world.scale.setScalar(1);world.position.set(0,0,0);floor.visible=true;restoreView();lastFrameTime=null;resize();
 };

 const resize=()=>{if(disposed||renderer.xr.isPresenting)return; // en VR, la taille du rendu est celle du casque
  const width=Math.max(container.clientWidth||640,1),height=Math.max(container.clientHeight||420,1);camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height,false);};
 const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;observer?.observe(container);globalThis.addEventListener?.('resize',resize);

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

 // --- Boucle d'animation unique ---
 // renderer.setAnimationLoop appelle `frame` à chaque image : par requestAnimationFrame de la
 // fenêtre en mode classique, par XRSession.requestAnimationFrame pendant une session immersive
 // (celui de la fenêtre est alors suspendu). `time` est l'horodatage de l'image (ms) et
 // `xrFrame` l'objet XRFrame de la session, absent en mode classique.
 // Les abonnés (onFrame) reçoivent la durée écoulée : c'est ainsi que l'horloge de la simulation
 // (app.sim.tick, branché dans index.js) avance aussi en VR, et que le pôle xr lit les poses.
 const frameListeners=new Set();let lastFrameTime=null;
 const frame=(time,xrFrame)=>{
  if(disposed)return;
  const delta=frameDelta(lastFrameTime,time);lastFrameTime=time;
  const presenting=renderer.xr.isPresenting;
  // Espace de référence de la session ('local-floor' : origine au sol, y vers le haut, en mètres).
  const referenceSpace=presenting?renderer.xr.getReferenceSpace():null;
  if(presenting&&xrFrame&&referenceSpace&&!eyeHeightKnown){
   // Pose du casque dans l'espace de référence : sa hauteur règle celle de la maquette
   // (utilisateur debout ou assis). Null tant que le suivi n'a pas démarré : on réessaie.
   const viewerPose=xrFrame.getViewerPose(referenceSpace);
   if(viewerPose){eyeHeightKnown=true;placeForVR(viewerPose.transform.position.y);}
  }
  const info={time,delta,xrFrame:xrFrame??null,referenceSpace,presenting};
  for(const listener of [...frameListeners]){try{listener(info);}catch(error){console.error('Abonné à la boucle de rendu en échec :',error);}}
  if(!presenting)controls.update();
  renderer.render(scene,camera);
 };

 const click=e=>{
  if(disposed||!downPoint||Math.hypot(e.clientX-downPoint.x,e.clientY-downPoint.y)>6)return;const rect=renderer.domElement.getBoundingClientRect();if(!rect.width||!rect.height)return;
  pointer.set(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointer,camera);
  // Un paquet en vol devant un équipement est prioritaire (groupe « packets » de packetAnimator.js).
  const packets=world.getObjectByName('packets');const packetHit=packets?raycaster.intersectObjects(packets.children,false)[0]:null;
  if(Number.isInteger(packetHit?.object.userData?.eventId)){onPacketClick(packetHit.object.userData.eventId,packetHit.object.userData);return;}
  const hit=raycaster.intersectObjects([...deviceMeshes.values()],true).find(item=>!item.object.userData?.isHighlight);const id=hit&&resolveDeviceId(hit.object,content);if(id)onDeviceClick(id,model.devices.find(device=>device.id===id));
 };
 const down=e=>{downPoint={x:e.clientX,y:e.clientY};};

 const canvas=renderer.domElement;
 canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointerup',click);
 renderer.xr.addEventListener('sessionstart',onXRStart);renderer.xr.addEventListener('sessionend',onXREnd);
 container.appendChild(canvas);
 renderer.setAnimationLoop(frame);
 resize();

 return {
  loadTopology(data){
   if(disposed)throw new Error('Renderer disposed');const next=normalizeTopology(data);clearTopology();model=next;const token=generations.current;
   for(const device of next.devices){const root=factory.createFallback(device);deviceMeshes.set(device.id,root);content.add(root);}
   linkLayer=createLinkLayer(next.links,deviceMeshes);labelLayer=createLabelLayer(next.devices,deviceMeshes);content.add(linkLayer.group,labelLayer.group);
   if(renderer.xr.isPresenting){eyeHeightKnown=false;placeForVR();} // nouvelle topologie en VR : on recadre la maquette
   const pending=next.devices.map(device=>factory.loadModel(device).then(root=>replaceDevice(device,root,token)));ready=Promise.allSettled(pending);return {devices:next.devices.length,links:next.links.length};
  },
  whenReady(){return ready;},
  /** Couleur des liens selon leur charge (phase 5) : { idLien: utilisation 0..1 }. */
  setLinkLoads(loads){if(disposed)return false;linkLayer?.setLoads(loads);return Boolean(linkLayer);},
  /** Met un lien en évidence (phase 6, recommandations) ; null : aucun. Renvoie false si le lien est inconnu. */
  highlightLink(id){if(disposed)return false;return linkLayer?.highlight(id??null)??false;},
  pickDevice(origin,direction){if(disposed)throw new Error('Renderer disposed');return pickDeviceFromObjects(raycaster,[...deviceMeshes.values()],origin,direction,content);},
  /**
   * Comme pickDevice, avec le point d'impact et la distance (rayon des manettes VR).
   * options.tolerance (en unités de la topologie) : si le rayon ne touche aucun équipement, on
   * accepte celui dont le centre ou l'étiquette est le plus près du rayon, dans cette limite.
   */
  pickDeviceHit(origin,direction,{tolerance=0}={}){
   if(disposed)throw new Error('Renderer disposed');
   const exact=pickHitFromObjects(raycaster,[...deviceMeshes.values()],origin,direction,content);if(exact||!(tolerance>0))return exact;
   const targets=[],position=new THREE.Vector3();
   for(const [id,root] of deviceMeshes){root.updateWorldMatrix(true,false);root.getWorldPosition(position);position.y+=(root.userData.bounds?.y??1)*world.scale.y/2;targets.push({id,x:position.x,y:position.y,z:position.z});}
   for(const [id,sprite] of labelLayer?.labels??[]){sprite.updateWorldMatrix(true,false);sprite.getWorldPosition(position);targets.push({id,x:position.x,y:position.y,z:position.z});}
   return nearestOnRay(normalizePickRay(origin,direction),targets,tolerance*world.scale.x);
  },
  /**
   * Abonne une fonction à la boucle d'animation (mode classique et VR).
   * listener({ time, delta, xrFrame, referenceSpace, presenting }) ; renvoie le désabonnement.
   */
  onFrame(listener){if(typeof listener!=='function')throw new TypeError('onFrame: function expected');frameListeners.add(listener);return()=>{frameListeners.delete(listener);};},
  /** Centre et taille de la maquette pendant une session VR ({ x, y, z, width, depth } en mètres), sinon null. */
  getVRAnchor(){return vrAnchor?{...vrAnchor}:null;},
  highlightDevice(id,mode='selected'){if(disposed)throw new Error('Renderer disposed');if(!VALID_HIGHLIGHTS.has(mode))throw new TypeError(`Invalid highlight mode ${mode}`);const root=deviceMeshes.get(id);if(!root)return false;factory.setHighlight(root,mode);if(mode==='normal')highlightModes.delete(id);else highlightModes.set(id,mode);return true;},
  getDevice(id){return model.devices.find(device=>device.id===id)||null;},
  listDevices(){return model.devices.map(device=>({...device,position:{...device.position}}));},
  focusDevice(id){const root=deviceMeshes.get(id);if(!root)return false;controls.target.copy(root.position);controls.update();return true;},
  resetView(){camera.position.set(10,12,17);controls.target.set(0,0,0);controls.update();},
  resize,
  /** Fonctionnalités de session à demander en plus : « webgpu » (voie native de la VR en WebGPU). */
  xrSessionFeatures(){return extraSessionFeatures();},
  /**
   * Démarre l'affichage dans une session WebXR déjà ouverte (pôle xr), toujours en WebGPU :
   * XRGPUBinding du navigateur, ou pont de l'émulateur (xrBridge.js). Lève une erreur si le
   * navigateur ne permet pas la VR en WebGPU.
   */
  async startXR(session){
   if(disposed)throw new Error('Renderer disposed');
   const path=prepareXRSession(session);
   saveView();
   xrRendering={backend:BACKEND,path};
   try{await renderer.xr.setSession(session);}
   catch(error){xrRendering=null;restoreView();throw error;}
  },
  isPresenting(){return renderer.xr.isPresenting;},
  /** Le renderer WebGPU de la scène (le même pendant toute la vie de la page). */
  getRenderer(){return renderer;},
  /** Espace de référence de la session VR en cours, sinon null. */
  getReferenceSpace(){return renderer.xr.isPresenting?renderer.xr.getReferenceSpace():null;},
  /**
   * Rendu effectivement utilisé, pour le statut affiché :
   * { classic: 'WebGPU', xr: { backend: 'WebGPU', path: 'natif' | 'pont émulateur' } | null }.
   */
  getRenderingInfo(){return {classic:BACKEND,xr:xrRendering?{...xrRendering}:null};},
  scene,
  camera,
  world,
  dispose(){if(disposed)return;disposed=true;generations.dispose();renderer.setAnimationLoop(null);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointerup',click);renderer.xr.removeEventListener('sessionstart',onXRStart);renderer.xr.removeEventListener('sessionend',onXREnd);frameListeners.clear();observer?.disconnect();globalThis.removeEventListener?.('resize',resize);controls.dispose();linkLayer?.dispose();labelLayer?.dispose();for(const root of deviceMeshes.values())factory.setHighlight(root,'normal');deviceMeshes.clear();content.clear();factory.dispose();floor.geometry.dispose();(Array.isArray(floor.material)?floor.material:[floor.material]).forEach(material=>material.dispose());renderer.dispose();renderer.domElement.remove();},
 };
}
