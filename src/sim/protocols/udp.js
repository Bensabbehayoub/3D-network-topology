// Pôle sim : UDP. Un hôte envoie des datagrammes à un service UDP d'un serveur (par défaut le
// port 514, journalisation syslog), puis un datagramme vers un port fermé.
// UDP n'établit pas de connexion et n'accuse pas réception : l'émetteur n'apprend rien de ce qui
// arrive, sauf l'erreur ICMP « port inaccessible » renvoyée par la pile du destinataire.
//
// Paramètres (scenario.params) :
//   source      id de l'hôte émetteur
//   target      id du serveur, ou targetIp
//   port        port de destination (514 par défaut) ; le serveur doit le déclarer dans "services"
//   count       nombre de datagrammes (3 par défaut)
//   interval    ms simulées entre deux datagrammes (600 par défaut)
//   closedPort  port fermé visé par un dernier datagramme (aucun si absent)
//
// Étapes standard : udp-start, udp-send[-<n>], udp-delivered[-<n>], udp-port-closed[-<eq>]
// (pile), udp-icmp-received, udp-summary.

import { describeHeaders } from '../protocol.js';
import { primaryIp } from '../net.js';
import { explainOnce, sendUdp } from '../stack.js';

export const DEFAULTS = Object.freeze({ port: 514, count: 3, interval: 600 });

function settings(ctx) {
  const { params } = ctx;
  const positive = (value, fallback) => (Number.isInteger(value) && value > 0 ? value : fallback);
  return {
    source: params.source,
    target: params.target ?? null,
    targetIp: params.targetIp ?? primaryIp(ctx.device(params.target)),
    port: positive(params.port, DEFAULTS.port),
    count: positive(params.count, DEFAULTS.count),
    interval: positive(params.interval, DEFAULTS.interval),
    closedPort: positive(params.closedPort, null),
  };
}

function finishIfDone(ctx, state) {
  if (state.delivered + state.errors === state.expected) explainOnce(ctx, ['udp-summary']);
}

export default {
  name: 'udp',

  start(ctx) {
    const config = settings(ctx);
    const state = { ...config, delivered: 0, errors: 0, expected: config.count + (config.closedPort ? 1 : 0) };
    ctx.memory(config.source).udp = state;
    explainOnce(ctx, ['udp-start']);
    for (let sequence = 1; sequence <= config.count + (config.closedPort ? 1 : 0); sequence += 1) {
      const closed = sequence > config.count;
      ctx.schedule((sequence - 1) * config.interval, () => {
        const step = explainOnce(ctx, closed ? ['udp-send-closed', 'udp-send'] : [`udp-send-${sequence}`, 'udp-send']);
        sendUdp(ctx, config.source, {
          protocol: 'udp',
          type: 'datagram',
          dst: config.targetIp,
          dstPort: closed ? config.closedPort : config.port,
          data: { sequence, message: closed ? 'datagramme vers un port fermé' : `mesure n°${sequence}` },
        }, { step });
      });
    }
  },

  onReceive(device, packet, ctx) {
    if (packet.protocol === 'udp' && packet.type === 'datagram') {
      // Côté serveur : le service reçoit le datagramme. Aucun accusé de réception n'est renvoyé.
      const sequence = packet.data?.sequence;
      explainOnce(ctx, [`udp-delivered-${sequence}`, 'udp-delivered']);
      const state = ctx.memory(ctx.params.source).udp;
      if (state) {
        state.delivered += 1;
        finishIfDone(ctx, state);
      }
      return;
    }
    if (packet.protocol === 'icmp' && packet.type === 'unreachable') {
      const state = ctx.memory(device.id).udp;
      if (!state) return;
      state.errors += 1;
      explainOnce(ctx, ['udp-icmp-received']);
      finishIfDone(ctx, state);
    }
  },

  describe(packet) {
    const fields = describeHeaders(packet);
    if (packet.protocol === 'udp' && packet.data) {
      fields.push({ layer: 'Données', field: 'Contenu', value: String(packet.data.message ?? '') });
    }
    return fields;
  },
};
