import { initScene } from './scene.js';
export { initScene } from './scene.js';
export { createMockRenderer } from './mock.js';
export { normalizeTopology } from './topology.js';

// Standalone S1 fallback; Khalil's scenario schema is still under review.
const FALLBACK_TOPOLOGY = {
  devices: [
    {id:'pc-1', type:'pc', label:'PC 1', position:[-5,0,-1], ip:'192.168.1.10'},
    {id:'pc-2', type:'pc', label:'PC 2', position:[5,0,-1], ip:'192.168.1.11'},
    {id:'sw-1', type:'switch', label:'Switch 1', position:[0,0,0]},
    {id:'r-1', type:'router', label:'Router 1', position:[0,0,5]}
  ],
  links: [{from:'pc-1',to:'sw-1'},{from:'pc-2',to:'sw-1'},{from:'sw-1',to:'r-1'}]
};

/** Called automatically by Ayoub-owned main.js; does not modify shared files. */
export async function init(app = {}) {
  if (typeof document === 'undefined') return {available:false};
  const mount = document.getElementById('scene');
  if (!mount) return {available:false};
  const handle = initScene(mount, {
    onDeviceClick(id, device) {
      mount.dispatchEvent(new CustomEvent('topology:device-selected', {detail:{id,device}}));
    }
  });
  // S1 placeholder scene until Khalil publishes a shared scenario contract.
  handle.loadTopology(FALLBACK_TOPOLOGY);
  return {available:true,...handle};
}
