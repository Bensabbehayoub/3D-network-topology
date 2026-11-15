// Pôle sim : comportement d'un switch (couche 2), appelé par le moteur avant le protocole.
//
// - apprentissage : la MAC source de chaque trame est associée au port d'arrivée (table MAC) ;
// - diffusion ou MAC inconnue : la trame est recopiée sur tous les autres ports reliés (inondation) ;
// - MAC connue : la trame part seulement par le port associé ; si c'est le port d'arrivée,
//   elle est filtrée (le destinataire l'a déjà reçue sur ce segment).
// Le switch ne lit ni IP ni TTL. Il traite toujours la trame : renvoie true.

import { linkAt } from '../scenario.js';
import { BROADCAST_MAC } from '../net.js';
import { explainOnce, netMemory } from '../stack.js';

export default {
  type: 'switch',

  onReceive(device, packet, ctx, meta) {
    if (!packet.eth) return true;
    const table = netMemory(ctx, device.id).macTable;
    const source = packet.eth.src.toLowerCase();
    if (table.get(source) !== meta.interface) {
      table.set(source, meta.interface);
      explainOnce(ctx, [`switch-learn-${device.id}`, 'switch-learn']);
    }

    const destination = packet.eth.dst.toLowerCase();
    const port = destination === BROADCAST_MAC ? null : table.get(destination) ?? null;
    if (port === meta.interface) return true;
    if (port) {
      const step = explainOnce(ctx, [`switch-forward-${device.id}`, `${packet.protocol}-switch-forward`, 'switch-forward']);
      ctx.send(device.id, packet, { interface: port, step });
      return true;
    }
    const step = explainOnce(ctx, [`switch-flood-${device.id}`, `${packet.protocol}-flood`, 'switch-flood']);
    for (const itf of device.interfaces) {
      if (itf.name !== meta.interface && linkAt(ctx.scenario, device.id, itf.name)) {
        ctx.send(device.id, packet, { interface: itf.name, step });
      }
    }
    return true;
  },
};

/** Table MAC d'un switch pendant l'exécution (pour les tests et l'inspecteur) : Map MAC → port. */
export function macTable(ctx, deviceId) {
  return netMemory(ctx, deviceId).macTable;
}
