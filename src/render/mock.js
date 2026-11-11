import {normalizeTopology} from './topology.js';
import {normalizePickRay} from './picking.js';
/** Deterministic, headless API-compatible mock used by team modules and unit tests. */
export function createMockRenderer({onDeviceClick=()=>{}}={}){
 let data={devices:[],links:[]},disposed=false;
 const guard=()=>{if(disposed)throw new Error('Renderer disposed');};
 return {
  loadTopology(t){guard();data=normalizeTopology(t);return {devices:data.devices.length,links:data.links.length};},
  pickDevice(origin,direction){guard();const ray=normalizePickRay(origin,direction);let nearest=null;
   for(const device of data.devices){const dx=device.position.x-ray.origin.x,dy=device.position.y-ray.origin.y,dz=device.position.z-ray.origin.z,t=dx*ray.direction.x+dy*ray.direction.y+dz*ray.direction.z;if(t<0)continue;const distanceSquared=dx*dx+dy*dy+dz*dz-t*t;if(distanceSquared<=1&&(!nearest||t<nearest.distance))nearest={id:device.id,distance:t};}
   return nearest?.id??null;
  },
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
