// Pôle sim : scénario ARP. L'hôte source cherche l'adresse MAC de la cible (ou de sa passerelle
// si la cible est dans un autre réseau). Tout le mécanisme (diffusion, réponse, cache, switch)
// est dans la pile commune (stack.js) et les équipements : ce fichier lance la résolution et
// décrit les trames ARP pour l'inspecteur.
//
// Paramètres (scenario.params) : source (id d'hôte), target (id d'équipement) ou targetIp.

import { describeHeaders } from '../protocol.js';
import { lookupRoute, primaryIp } from '../net.js';
import { explainOnce, resolveMac } from '../stack.js';

const OPERATIONS = { request: 'requête (qui a cette adresse IP ?)', reply: 'réponse (cette IP est à cette MAC)' };

/** Adresse IP visée : params.targetIp, sinon la première adresse de params.target. */
export function targetAddress(ctx) {
  if (ctx.params.targetIp) return ctx.params.targetIp;
  return primaryIp(ctx.device(ctx.params.target));
}

export default {
  name: 'arp',

  start(ctx) {
    const source = ctx.device(ctx.params.source);
    const targetIp = targetAddress(ctx);
    const route = targetIp ? lookupRoute(source, targetIp) : null;
    if (!route) {
      explainOnce(ctx, [`no-route-${source.id}`, 'no-route']);
      return;
    }
    resolveMac(ctx, source, route.interface, route.nextHop, {
      onResolved: () => explainOnce(ctx, ['arp-done']),
      onFailed: () => explainOnce(ctx, ['arp-failed']),
    });
  },

  // Les trames ARP sont traitées par les équipements (stack.handleArp) : rien n'arrive ici.
  onReceive() {},

  describe(packet) {
    const data = packet.data ?? {};
    return [
      ...describeHeaders(packet),
      { layer: 'ARP', field: 'Opération', value: OPERATIONS[data.operation] ?? String(data.operation ?? '') },
      { layer: 'ARP', field: 'MAC émetteur', value: String(data.senderMac ?? '') },
      { layer: 'ARP', field: 'IP émetteur', value: String(data.senderIp ?? '') },
      { layer: 'ARP', field: 'MAC cible', value: String(data.targetMac ?? '') },
      { layer: 'ARP', field: 'IP cible', value: String(data.targetIp ?? '') },
    ];
  },
};
