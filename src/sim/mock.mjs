// Khalil (S1) : faux moteur (mock) pour que les autres pôles avancent sans attendre ARP/ICMP.
//
// C'est le VRAI contrôleur (commands.js) avec un faux protocole « demo » : même API, mêmes
// évènements sur le bus, même horloge simulée. Il fait faire un aller-retour à un paquet entre
// params.source et params.target (par défaut le premier et le dernier hôte) en suivant le plus
// court chemin, quelle que soit la topologie, et affiche les étapes du scénario dans l'ordre.
//
// Utilisation :
//   import { createMockSimulation, DEMO_SCENARIO } from './mock.js';
//   const sim = createMockSimulation();
//   await sim.load(DEMO_SCENARIO);       // ou n'importe quel scénario valide, ex. scenarios/arp.json
//   sim.on(TOPICS.NETWORK, (event) => console.log(event.type, event.source, '→', event.destination));
//   sim.play();

import { createSimulation } from './commands.js';
import { describeHeaders } from './protocol.js';
import { findDevice, findPath, parseCidr } from './scenario.js';

/** Topologie de démonstration : deux réseaux locaux reliés par un routeur. */
export const DEMO_SCENARIO = Object.freeze({
  schema: 1,
  id: 'demo',
  title: 'Démonstration (faux moteur)',
  protocol: 'demo',
  description: 'Un paquet factice fait un aller-retour entre deux PC de réseaux différents. Sert à développer le rendu et l\'interface avant les vrais protocoles.',
  params: { source: 'pc1', target: 'pc2' },
  devices: [
    { id: 'pc1', type: 'host', label: 'PC 1', position: [-4, 0, 0], gateway: '192.168.1.1',
      interfaces: [{ name: 'eth0', mac: '02:00:00:00:01:01', ip: '192.168.1.10/24' }] },
    { id: 'sw1', type: 'switch', label: 'Switch 1', position: [-2, 0, 0],
      interfaces: [{ name: 'p1' }, { name: 'p2' }] },
    { id: 'r1', type: 'router', label: 'Routeur', position: [0, 0, 0],
      interfaces: [
        { name: 'g0', mac: '02:00:00:00:00:a0', ip: '192.168.1.1/24' },
        { name: 'g1', mac: '02:00:00:00:00:a1', ip: '192.168.2.1/24' },
      ] },
    { id: 'sw2', type: 'switch', label: 'Switch 2', position: [2, 0, 0],
      interfaces: [{ name: 'p1' }, { name: 'p2' }] },
    { id: 'pc2', type: 'host', label: 'PC 2', position: [4, 0, 0], gateway: '192.168.2.1',
      interfaces: [{ name: 'eth0', mac: '02:00:00:00:02:01', ip: '192.168.2.10/24' }] },
  ],
  links: [
    { id: 'l1', a: 'pc1:eth0', b: 'sw1:p1' },
    { id: 'l2', a: 'sw1:p2', b: 'r1:g0' },
    { id: 'l3', a: 'r1:g1', b: 'sw2:p1' },
    { id: 'l4', a: 'sw2:p2', b: 'pc2:eth0' },
  ],
  steps: [
    { id: 'demo-request', title: 'Aller', text: 'PC 1 envoie un paquet de démonstration vers PC 2. Il traverse le switch, puis le routeur qui décrémente le TTL.' },
    { id: 'demo-reply', title: 'Retour', text: 'PC 2 a reçu le paquet et renvoie une réponse vers PC 1 par le même chemin.' },
    { id: 'demo-done', title: 'Terminé', text: 'La réponse est arrivée : fin de la démonstration. Les vrais protocoles remplaceront ce faux moteur.' },
  ],
});

const firstIp = (device) => {
  const cidr = device?.interfaces.find((itf) => itf.ip)?.ip;
  return cidr ? parseCidr(cidr).address : '0.0.0.0';
};
const firstMac = (device) => device?.interfaces.find((itf) => itf.mac)?.mac ?? '00:00:00:00:00:00';

/** Faux protocole : respecte l'interface protocole de protocol.js. */
export const DEMO_PROTOCOL = Object.freeze({
  name: 'demo',

  start(ctx) {
    const { scenario } = ctx;
    const hosts = scenario.devices.filter((device) => device.type === 'host' || device.type === 'server');
    const source = ctx.params.source ?? hosts[0]?.id ?? scenario.devices[0].id;
    const target = ctx.params.target ?? hosts.at(-1)?.id ?? scenario.devices.at(-1).id;
    const path = findPath(scenario, source, target);

    const memory = ctx.memory(source);
    memory.demo = { source, target, path, stepIndex: 0 };
    nextExplanation(ctx, memory.demo);
    if (!path || path.length === 0) return; // rien à envoyer : la démo se termine aussitôt

    const from = findDevice(scenario, source);
    const to = findDevice(scenario, target);
    ctx.send(source, {
      id: ctx.nextPacketId(),
      protocol: 'demo',
      type: 'request',
      eth: { src: firstMac(from), dst: firstMac(to) },
      ip: { src: firstIp(from), dst: firstIp(to), ttl: 64 },
      transport: null,
      data: { message: 'paquet de démonstration' },
    }, { interface: path[0].interface, step: currentStep(ctx, memory.demo) });
  },

  onReceive(device, packet, ctx) {
    const demo = ctx.memory(ctx.params.source ?? findSource(ctx)).demo;
    const { path } = demo;
    const isRequest = packet.type === 'request';
    const destination = isRequest ? demo.target : demo.source;

    if (device.id === destination) {
      nextExplanation(ctx, demo);
      if (!isRequest) return; // retour arrivé : fin
      const reply = {
        ...packet,
        id: ctx.nextPacketId(),
        type: 'reply',
        eth: { src: packet.eth.dst, dst: packet.eth.src },
        ip: { src: packet.ip.dst, dst: packet.ip.src, ttl: 64 },
      };
      const back = path.at(-1);
      ctx.send(device.id, reply, { interface: findInterfaceTowards(ctx, device.id, back.device), step: currentStep(ctx, demo) });
      return;
    }

    // Saut intermédiaire : continuer le long du chemin (à l'aller) ou à rebours (au retour).
    let outInterface;
    if (isRequest) {
      outInterface = path.find((hop) => hop.device === device.id).interface;
    } else {
      const index = path.findIndex((hop) => hop.next === device.id);
      outInterface = findInterfaceTowards(ctx, device.id, path[index].device);
    }
    const forwarded = device.type === 'router'
      ? { ...packet, ip: { ...packet.ip, ttl: packet.ip.ttl - 1 } }
      : packet;
    ctx.send(device.id, forwarded, { interface: outInterface, step: currentStep(ctx, demo) });
  },

  describe(packet) {
    return [...describeHeaders(packet), { layer: 'Démo', field: 'Contenu', value: packet.data?.message ?? '' }];
  },
});

function findSource(ctx) {
  return ctx.scenario.devices.find((device) => device.type === 'host' || device.type === 'server')?.id
    ?? ctx.scenario.devices[0].id;
}

function findInterfaceTowards(ctx, deviceId, neighbourId) {
  const hop = findPath(ctx.scenario, deviceId, neighbourId);
  return hop[0].interface;
}

/** Étape courante (celle déjà affichée), pour relier les messages à leur explication. */
function currentStep(ctx, demo) {
  return ctx.scenario.steps[Math.max(0, demo.stepIndex - 1)]?.id ?? null;
}

function nextExplanation(ctx, demo) {
  const step = ctx.scenario.steps[demo.stepIndex];
  if (step) {
    ctx.explain(step.id);
    demo.stepIndex += 1;
  }
}

/**
 * Faux moteur, même API que createSimulation (voir commands.js).
 * @param {Parameters<typeof createSimulation>[0]} [options]
 */
export function createMockSimulation(options = {}) {
  const sim = createSimulation({ ...options, protocol: DEMO_PROTOCOL });
  return Object.freeze({ ...sim, mock: true });
}
