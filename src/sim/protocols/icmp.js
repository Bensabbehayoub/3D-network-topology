// Pôle sim : ping (ICMP). L'hôte source envoie `count` requêtes d'écho à la cible, une par
// `interval` ms simulées. Les réponses viennent de la pile de la cible (stack.deliverLocal) ;
// les routeurs traversés décrémentent le TTL et peuvent renvoyer « TTL expiré » ou
// « destination inaccessible ». Ce fichier gère le côté client : envoi, attente, résultats.
//
// Paramètres (scenario.params) :
//   source    id de l'hôte qui lance le ping (obligatoire)
//   target    id de l'équipement visé, ou targetIp (adresse)
//   count     nombre de requêtes (2 par défaut : la première déclenche ARP, la seconde non)
//   interval  ms simulées entre deux requêtes (1000 par défaut)
//   timeout   ms simulées d'attente d'une réponse (4000 par défaut)
//   ttl       TTL des requêtes (64 par défaut ; une petite valeur montre « TTL expiré »)
//
// Résultats : ctx.memory(source).ping = { sent, replies: [{ sequence, rtt, ttl }], errors, lost }.

import { describeHeaders } from '../protocol.js';
import { primaryIp } from '../net.js';
import { DEFAULT_TTL, explainOnce, sendIp } from '../stack.js';

export const DEFAULTS = Object.freeze({ count: 2, interval: 1000, timeout: 4000 });

const TYPES = {
  'echo-request': 'requête d\'écho (type 8)',
  'echo-reply': 'réponse d\'écho (type 0)',
  'time-exceeded': 'TTL expiré (type 11)',
  unreachable: 'destination inaccessible (type 3)',
};

function settings(ctx) {
  const { params } = ctx;
  const number = (value, fallback) => (Number.isFinite(value) && value > 0 ? value : fallback);
  return {
    source: params.source,
    targetIp: params.targetIp ?? primaryIp(ctx.device(params.target)),
    count: Math.floor(number(params.count, DEFAULTS.count)),
    interval: number(params.interval, DEFAULTS.interval),
    timeout: number(params.timeout, DEFAULTS.timeout),
    ttl: Math.floor(number(params.ttl, DEFAULT_TTL)),
  };
}

function finishIfDone(ctx, state) {
  if (state.answered + state.lost < state.count) return;
  explainOnce(ctx, [state.replies.length === state.count ? 'icmp-summary' : 'icmp-summary-loss', 'icmp-summary']);
}

export default {
  name: 'icmp',

  start(ctx) {
    const config = settings(ctx);
    ctx.device(config.source);
    const state = { ...config, sent: 0, answered: 0, lost: 0, replies: [], errors: [], pending: new Map() };
    ctx.memory(config.source).ping = state;
    explainOnce(ctx, ['icmp-start']);
    for (let sequence = 1; sequence <= config.count; sequence += 1) {
      ctx.schedule((sequence - 1) * config.interval, () => {
        const step = explainOnce(ctx, [`icmp-request-${sequence}`, 'icmp-request']);
        state.sent += 1;
        const sent = sendIp(ctx, config.source, {
          protocol: 'icmp',
          type: 'echo-request',
          ip: { dst: config.targetIp, ttl: config.ttl },
          data: { identifier: 1, sequence },
        }, { step });
        const cancel = ctx.schedule(config.timeout, () => {
          state.pending.delete(sequence);
          state.lost += 1;
          explainOnce(ctx, [`icmp-timeout-${sequence}`, 'icmp-timeout']);
          finishIfDone(ctx, state);
        });
        state.pending.set(sequence, { time: ctx.now(), cancel });
        if (!sent) { // pas de route : la requête est perdue tout de suite
          cancel();
          state.pending.delete(sequence);
          state.lost += 1;
          finishIfDone(ctx, state);
        }
      });
    }
  },

  onReceive(device, packet, ctx) {
    const state = ctx.memory(device.id).ping;
    if (!state || packet.protocol !== 'icmp') return;
    const sequence = packet.type === 'echo-reply' ? packet.data?.sequence : null;
    if (sequence !== null) {
      const pending = state.pending.get(sequence);
      if (!pending) return; // réponse en retard ou en double
      pending.cancel();
      state.pending.delete(sequence);
      state.answered += 1;
      state.replies.push({ sequence, rtt: ctx.now() - pending.time, ttl: packet.ip.ttl });
      explainOnce(ctx, [`icmp-reply-received-${sequence}`, 'icmp-reply-received']);
      finishIfDone(ctx, state);
      return;
    }
    if (packet.type === 'time-exceeded' || packet.type === 'unreachable') {
      state.errors.push({ type: packet.type, from: packet.ip.src });
      // L'erreur répond à la requête la plus ancienne encore en attente.
      const [first] = state.pending.keys();
      if (first !== undefined) {
        state.pending.get(first).cancel();
        state.pending.delete(first);
        state.lost += 1;
      }
      explainOnce(ctx, [packet.type === 'time-exceeded' ? 'icmp-time-exceeded' : 'icmp-unreachable']);
      finishIfDone(ctx, state);
    }
  },

  describe(packet) {
    const data = packet.data ?? {};
    const fields = [...describeHeaders(packet), { layer: 'ICMP', field: 'Type', value: TYPES[packet.type] ?? packet.type }];
    if (data.sequence !== undefined) {
      fields.push({ layer: 'ICMP', field: 'Identifiant', value: String(data.identifier ?? '') });
      fields.push({ layer: 'ICMP', field: 'Séquence', value: String(data.sequence) });
    }
    if (data.original) {
      fields.push({ layer: 'ICMP', field: 'Paquet d\'origine', value: `${data.original.protocol.toUpperCase()} ${data.original.src} → ${data.original.dst}` });
    }
    return fields;
  },
};
