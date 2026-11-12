import {normalizeTopology} from './topology.js';
import {normalizePickRay} from './picking.js';
import {packetStyle} from './packetStyles.js';
/** Deterministic, headless API-compatible mock used by team modules and unit tests. */
export function createMockRenderer({onDeviceClick=()=>{}}={}){
 let data={devices:[],links:[]},disposed=false;
 const guard=()=>{if(disposed)throw new Error('Renderer disposed');};
 // Chaque équipement est une sphère de rayon 1 : on garde la plus proche sur le rayon.
 const pick=(origin,direction)=>{const ray=normalizePickRay(origin,direction);let nearest=null;
   for(const device of data.devices){const dx=device.position.x-ray.origin.x,dy=device.position.y-ray.origin.y,dz=device.position.z-ray.origin.z,t=dx*ray.direction.x+dy*ray.direction.y+dz*ray.direction.z;if(t<0)continue;const distanceSquared=dx*dx+dy*dy+dz*dz-t*t;if(distanceSquared<=1&&(!nearest||t<nearest.distance))nearest={id:device.id,distance:t,point:{x:ray.origin.x+ray.direction.x*t,y:ray.origin.y+ray.direction.y*t,z:ray.origin.z+ray.direction.z*t}};}
   return nearest;
  };
 const frameListeners=new Set();
 return {
  loadTopology(t){guard();data=normalizeTopology(t);return {devices:data.devices.length,links:data.links.length};},
  pickDevice(origin,direction){guard();return pick(origin,direction)?.id??null;},
  /** Même contrat que la scène : { id, point, distance } ou null. */
  pickDeviceHit(origin,direction,_options){guard();return pick(origin,direction);},
  /** Boucle d'animation simulée : les tests déclenchent une image avec emitFrame(info). */
  onFrame(listener){guard();if(typeof listener!=='function')throw new TypeError('onFrame: function expected');frameListeners.add(listener);return()=>{frameListeners.delete(listener);};},
  emitFrame(info={}){guard();const frame={time:0,delta:0,xrFrame:null,referenceSpace:null,presenting:false,...info};for(const listener of [...frameListeners])listener(frame);return frameListeners.size;},
  getVRAnchor(){guard();return null;},
  /** Mêmes fonctions que la scène réelle ; aucun renderer dans le faux rendu. */
  getRenderer(){guard();return null;},
  getReferenceSpace(){guard();return null;},
  getRenderingInfo(){guard();return {classic:null,xr:null};},
  xrSessionFeatures(){guard();return [];},
  packetStyle(protocol,broadcast=false){return packetStyle(protocol,broadcast);},
  highlightPacket(){guard();return false;},
  setLinkLoads(){guard();return false;},
  highlightDevice(id,mode='selected'){guard();if(!['selected','active','error','normal'].includes(mode))throw new TypeError('Invalid mode');return data.devices.some(d=>d.id===id);},
  getDevice(id){guard();return data.devices.find(d=>d.id===id)||null;},
  listDevices(){guard();return data.devices.map(d=>({...d,position:{...d.position}}));},
  focusDevice(id){guard();return data.devices.some(d=>d.id===id);},
  resetView(){guard();},resize(){guard();},
  startXR(){guard();return Promise.reject(new Error('Pas de WebXR dans le mock de rendu'));},isPresenting(){return false;},
  simulateClick(id){guard();const d=data.devices.find(d=>d.id===id);if(d)onDeviceClick(id,d);return !!d;},
  dispose(){disposed=true;data={devices:[],links:[]};}
 };
}
