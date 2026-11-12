// Pôle render (Aziz) : scène Three.js montée dans #scene.
//
// Appelé par main.js après le pôle sim : la topologie affichée est celle du scénario chargé
// par le moteur (app.sim.getScenario()), puis chaque nouveau scénario (TOPICS.SCENARIO).
// La topologie de secours ne sert que si le pôle sim n'a pas pu se charger.
import { TOPICS } from '../../simulation.js';
import { initScene } from './scene.js';
export { initScene } from './scene.js';
export { createMockRenderer } from './mock.js';
export { normalizeTopology } from './topology.js';

const FALLBACK_TOPOLOGY = {
  devices: [
    {id:'pc-1', type:'pc', label:'PC 1', position:[-5,0,-1], ip:'192.168.1.10'},
    {id:'pc-2', type:'pc', label:'PC 2', position:[5,0,-1], ip:'192.168.1.11'},
    {id:'sw-1', type:'switch', label:'Switch 1', position:[0,0,0]},
    {id:'r-1', type:'router', label:'Router 1', position:[0,0,5]}
  ],
  links: [{from:'pc-1',to:'sw-1'},{from:'pc-2',to:'sw-1'},{from:'sw-1',to:'r-1'}]
};

/** Appelé par main.js ; ne modifie aucun fichier partagé. */
export async function init(app = {}) {
  if (typeof document === 'undefined') return {available:false};
  const mount = document.getElementById('scene');
  if (!mount) return {available:false};
  const handle = initScene(mount, {
    onDeviceClick(id, device) {
      mount.dispatchEvent(new CustomEvent('topology:device-selected', {detail:{id,device}}));
    }
  });

  const show = (topology) => {
    try {
      handle.loadTopology(topology);
    } catch (error) {
      console.error('Topologie non affichée :', error);
    }
  };

  const sim = app.sim;
  if (typeof sim?.getScenario === 'function' && typeof sim?.on === 'function') {
    show(sim.getScenario() ?? FALLBACK_TOPOLOGY);
    sim.on(TOPICS.SCENARIO, ({ scenario }) => show(scenario));
  } else {
    show(FALLBACK_TOPOLOGY);
  }

  const { mountPacketAnimator } = await import('./packetAnimator.js');
  mountPacketAnimator({ sim: app.sim, render: handle });

  return {available:true,...handle};
}
