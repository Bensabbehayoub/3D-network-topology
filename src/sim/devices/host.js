// Pôle sim : comportement d'un hôte (PC) ou d'un serveur, appelé par le moteur avant le protocole
// du scénario à chaque réception (voir createSimulation, option devices).
//
// - la carte réseau ne garde que les trames pour sa MAC ou la diffusion ;
// - ARP est traité par la pile (stack.js) ;
// - un paquet IP pour une autre adresse est rejeté (un hôte ne route pas) ;
// - un ping reçu reçoit sa réponse de la pile ;
// - le reste (réponse de ping, segments UDP/TCP…) remonte au protocole du scénario.
//
// Renvoie true si le paquet est traité ici, false pour le laisser au protocole.

import { ownsIp } from '../net.js';
import { acceptsFrame, deliverLocal, explainOnce, handleArp } from '../stack.js';

export default {
  type: 'host',

  onReceive(device, packet, ctx, meta) {
    if (!acceptsFrame(device, meta.interface, packet)) return true; // trame pour une autre MAC : ignorée
    if (packet.protocol === 'arp') return handleArp(ctx, device, packet, meta);
    if (packet.ip && !ownsIp(device, packet.ip.dst) && packet.ip.dst !== '255.255.255.255') {
      const step = explainOnce(ctx, [`host-not-for-me-${device.id}`, 'host-not-for-me']);
      ctx.drop(device.id, packet, `paquet pour ${packet.ip.dst} : un hôte ne fait pas suivre les paquets`, { step });
      return true;
    }
    if (packet.ip) return deliverLocal(ctx, device, packet);
    return false;
  },
};
