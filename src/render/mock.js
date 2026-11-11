import {normalizeTopology} from './topology.js';
/** Deterministic, headless API-compatible mock used by team modules and unit tests. */
export function createMockRenderer({onDeviceClick=()=>{}}={}){
 let data={devices:[],links:[]},disposed=false;
 const guard=()=>{if(disposed)throw new Error('Renderer disposed');};
 return {
  loadTopology(t){guard();data=normalizeTopology(t);return {devices:data.devices.length,links:data.links.length};},
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
