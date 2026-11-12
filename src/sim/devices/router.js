// Pôle sim : comportement d'un routeur, appelé par le moteur avant le protocole du scénario.
//
// - chaque interface ne garde que les trames pour sa MAC ou la diffusion ;
// - ARP : le routeur répond pour l'adresse de l'interface qui reçoit la question ;
// - paquet IP pour une de ses adresses, ou diffusion limitée 255.255.255.255 (jamais transmise
//   d'un réseau à l'autre) : la pile répond au ping, le reste va au protocole ;
// - sinon il fait suivre le paquet : TTL − 1 (perte et « TTL expiré » renvoyé à l'émetteur à 0),
//   route la plus précise (réseaux connectés, routes statiques "routes", route par défaut),
//   ARP du saut suivant, nouvel en-tête Ethernet. Sans route : perte et « destination inaccessible ».

import { ownsIp } from '../net.js';
import { acceptsFrame, deliverLocal, forwardIp, handleArp, LIMITED_BROADCAST } from '../stack.js';

export default {
  type: 'router',

  onReceive(device, packet, ctx, meta) {
    if (!acceptsFrame(device, meta.interface, packet)) return true;
    if (packet.protocol === 'arp') return handleArp(ctx, device, packet, meta);
    if (!packet.ip) return true; // trame sans IP : un routeur ne la fait pas suivre
    if (packet.ip.dst === LIMITED_BROADCAST || ownsIp(device, packet.ip.dst)) return deliverLocal(ctx, device, packet);
    forwardIp(ctx, device, packet, meta);
    return true;
  },
};
