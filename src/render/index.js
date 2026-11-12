// Pôle render (Aziz) : scène Three.js montée dans #scene.
//
// Appelé par main.js après le pôle sim : la topologie affichée est celle du scénario chargé
// par le moteur (app.sim.getScenario()), puis chaque nouveau scénario (TOPICS.SCENARIO).
// La topologie de secours ne sert que si le pôle sim n'a pas pu se charger.
import { TOPICS } from '../../simulation.js';
import { initScene } from './scene.js';
import { WEBGPU_REQUIRED_MESSAGE } from './renderers.js';
import { packetStyle } from './packetStyles.js';
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

/** Message « WebGPU requis » affiché dans la zone de la scène (texte seulement, jamais de HTML). */
function showWebGPURequired(mount, detail) {
  const box = document.createElement('div');
  box.className = 'webgpu-required';
  box.setAttribute('role', 'alert');
  const title = document.createElement('strong');
  title.textContent = 'WebGPU requis';
  const text = document.createElement('p');
  text.textContent = WEBGPU_REQUIRED_MESSAGE;
  const cause = document.createElement('p');
  cause.className = 'webgpu-required-detail';
  cause.textContent = `Détail : ${detail}.`;
  box.append(title, text, cause);
  mount.append(box);
}

/** Appelé par main.js ; ne modifie aucun fichier partagé. */
export async function init(app = {}) {
  if (typeof document === 'undefined') return {available:false};
  const mount = document.getElementById('scene');
  if (!mount) return {available:false};
  let handle;
  try {
    handle = await initScene(mount, {
      onDeviceClick(id, device) {
        mount.dispatchEvent(new CustomEvent('topology:device-selected', {detail:{id,device}}));
      },
      onPacketClick(eventId, info) {
        mount.dispatchEvent(new CustomEvent('topology:packet-selected', {detail:{eventId, packetId: info.packetId}}));
      }
    });
  } catch (error) {
    // Rendu 100 % WebGPU : sans WebGPU, pas de repli WebGL, un message à la place de la scène.
    if (error?.name !== 'WebGPUUnavailableError') throw error;
    showWebGPURequired(mount, error.detail);
    return {available:false, reason:error.message};
  }

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

  // Boucle d'animation unique : chaque image du rendu fait avancer l'horloge de la simulation,
  // en mode classique comme en session VR (où le requestAnimationFrame de la fenêtre est suspendu).
  if (typeof sim?.tick === 'function') handle.onFrame(({ delta }) => sim.tick(delta));

  const { mountPacketAnimator } = await import('./packetAnimator.js');
  const animator = mountPacketAnimator({ sim: app.sim, render: handle });
  /** Couleur et taille d'un paquet (le journal de l'interface utilise les mêmes couleurs). */
  handle.packetStyle = packetStyle;
  /** Met en avant dans la scène le paquet d'un évènement d'envoi (null : aucun). */
  handle.highlightPacket = (eventId) => { animator?.select(eventId); return Boolean(animator); };

  // On renvoie l'objet lui-même (pas une copie) : les fonctions ajoutées ci-dessus en font partie.
  handle.available = true;
  return handle;
}
