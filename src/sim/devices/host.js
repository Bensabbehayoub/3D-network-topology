// Pôle sim : comportement d'un hôte (PC) ou d'un serveur, appelé par le moteur avant le protocole
// du scénario à chaque réception (voir createSimulation, option devices).
//
// - la carte réseau ne garde que les trames pour sa MAC ou la diffusion ;
// - ARP est traité par la pile (stack.js) ;
// - un paquet IP pour une autre adresse est rejeté (un hôte ne route pas) ; la diffusion
//   limitée 255.255.255.255 est acceptée (DHCP) ;
// - UDP/TCP vers un port fermé : rejet, et « port inaccessible » (ICMP) pour UDP en unicast ;
// - un ping reçu reçoit sa réponse de la pile ;
// - le reste (réponse de ping, DNS, DHCP…) remonte au protocole du scénario.
//
// L'équipement est pris tel qu'il est pendant l'exécution (adresse obtenue par DHCP comprise).
// Renvoie true si le paquet est traité ici, false pour le laisser au protocole.

import { ownsIp } from '../net.js';
import {
  acceptsFrame, deliverLocal, explainOnce, handleArp, isPortOpen, LIMITED_BROADCAST, runtimeDevice,
  sendIcmpError, transportOf,
} from '../stack.js';

export default {
  type: 'host',

  onReceive(scenarioDevice, packet, ctx, meta) {
    const device = runtimeDevice(ctx, scenarioDevice);
    if (!acceptsFrame(device, meta.interface, packet)) return true; // trame pour une autre MAC : ignorée
    if (packet.protocol === 'arp') return handleArp(ctx, device, packet, meta);
    if (!packet.ip) return false;
    const broadcast = packet.ip.dst === LIMITED_BROADCAST;
    if (!broadcast && !ownsIp(device, packet.ip.dst)) {
      const step = explainOnce(ctx, [`host-not-for-me-${device.id}`, 'host-not-for-me']);
      ctx.drop(device.id, packet, `paquet pour ${packet.ip.dst} : un hôte ne fait pas suivre les paquets`, { step });
      return true;
    }
    const transport = transportOf(packet);
    if (transport && !isPortOpen(ctx, device, transport, packet.transport.dst)) {
      if (broadcast) return true; // diffusion vers un service absent : ignorée sans bruit
      const step = explainOnce(ctx, [`${transport}-port-closed-${device.id}`, `${transport}-port-closed`]);
      ctx.drop(device.id, packet, `port ${transport.toUpperCase()} ${packet.transport.dst} fermé`, { step });
      if (transport === 'udp') sendIcmpError(ctx, device, packet, meta, 'unreachable', step, 'port');
      return true;
    }
    return deliverLocal(ctx, device, packet);
  },
};
