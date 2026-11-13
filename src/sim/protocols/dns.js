// Pôle sim : DNS. Un hôte traduit des noms en adresses IP en interrogeant son serveur DNS
// (champ "dns" de l'hôte, ou adresse reçue par DHCP) sur le port UDP 53. Le serveur répond avec
// ses enregistrements A (champ "records") ou « NXDOMAIN » (nom inexistant). Le client garde les
// réponses en cache pendant leur TTL : une seconde demande du même nom ne produit aucun paquet.
//
// resolveName() et handleDns() sont exportées pour les protocoles qui ont besoin d'un nom
// (HTTP en 4c) : leur onReceive transmet les paquets « dns » à handleDns.
//
// Paramètres (scenario.params) :
//   client    id de l'hôte qui résout
//   names     noms à résoudre, dans l'ordre (ex. ["www.ecole.test", "www.ecole.test", "inconnu.ecole.test"])
//   interval  ms simulées entre deux résolutions (5000 par défaut)
//   timeout   ms simulées d'attente d'une réponse (10000 par défaut : durées ralenties)
//
// Étapes standard (n = rang du nom, à partir de 1) : dns-start, dns-query[-<n>],
// dns-answer[-<eq>], dns-answer-nxdomain, dns-response[-<n>], dns-cache-hit[-<n>],
// dns-nxdomain[-<n>], dns-timeout, dns-no-server, dns-summary.

import { describeHeaders } from '../protocol.js';
import { explainOnce, runtimeDevice, sendUdp } from '../stack.js';

export const DNS_PORT = 53;
export const DEFAULTS = Object.freeze({ interval: 5000, timeout: 10000, ttl: 300 });

function clientMemory(ctx, deviceId) {
  const memory = ctx.memory(deviceId);
  memory.dnsClient ??= { nextId: 0x2a00, cache: new Map(), pending: new Map() };
  return memory.dnsClient;
}

/** Cache DNS d'un hôte : Map nom → { ip, expires } (ms simulées). */
export function dnsCache(ctx, deviceId) {
  return clientMemory(ctx, deviceId).cache;
}

/**
 * Traduit un nom en adresse IP pour l'hôte `deviceId` : cache, sinon requête au serveur DNS.
 * @param {{ onResolved(ip: string, info: { cached: boolean }): void, onFailed(reason: string): void,
 *   step?: string | null, timeout?: number }} handlers
 */
export function resolveName(ctx, deviceId, name, { onResolved, onFailed, step = null, timeout = DEFAULTS.timeout }) {
  const memory = clientMemory(ctx, deviceId);
  const key = name.toLowerCase();
  const cached = memory.cache.get(key);
  if (cached && cached.expires > ctx.now()) {
    onResolved(cached.ip, { cached: true });
    return;
  }
  const server = runtimeDevice(ctx, ctx.device(deviceId)).dns;
  if (!server) {
    onFailed('aucun serveur DNS configuré');
    return;
  }
  const id = memory.nextId;
  memory.nextId += 1;
  const cancel = ctx.schedule(timeout, () => {
    memory.pending.delete(id);
    onFailed('pas de réponse du serveur DNS');
  });
  memory.pending.set(id, { name: key, onResolved, onFailed, cancel });
  sendUdp(ctx, deviceId, {
    protocol: 'dns',
    type: 'query',
    dst: server,
    dstPort: DNS_PORT,
    data: { id, question: { name: key, type: 'A' } },
  }, { step });
}

/**
 * Traite un paquet DNS reçu : question pour un serveur qui a des enregistrements, réponse
 * attendue par un client. Renvoie true si le paquet a été traité.
 */
export function handleDns(ctx, device, packet) {
  if (packet.protocol !== 'dns') return false;
  const data = packet.data ?? {};
  if (packet.type === 'query' && Array.isArray(device.records)) {
    const name = String(data.question?.name ?? '').toLowerCase();
    const answers = device.records
      .filter((record) => record.name.toLowerCase() === name && record.type === (data.question?.type ?? 'A'))
      .map((record) => ({ name, type: record.type, ttl: record.ttl ?? DEFAULTS.ttl, value: record.value }));
    const rcode = answers.length ? 'NOERROR' : 'NXDOMAIN';
    const step = explainOnce(ctx, rcode === 'NXDOMAIN'
      ? [`dns-answer-nxdomain-${device.id}`, 'dns-answer-nxdomain', `dns-answer-${device.id}`, 'dns-answer']
      : [`dns-answer-${device.id}`, 'dns-answer']);
    sendUdp(ctx, device.id, {
      protocol: 'dns',
      type: 'response',
      src: packet.ip.dst,
      dst: packet.ip.src,
      srcPort: DNS_PORT,
      dstPort: packet.transport.src,
      data: { id: data.id, question: data.question, answers, rcode },
    }, { step });
    return true;
  }
  if (packet.type === 'response') {
    const memory = clientMemory(ctx, device.id);
    const pending = memory.pending.get(data.id);
    if (!pending) return true; // réponse en retard ou inattendue : ignorée
    memory.pending.delete(data.id);
    pending.cancel();
    const answer = (data.answers ?? []).find((item) => item.type === 'A');
    if (data.rcode === 'NOERROR' && answer) {
      memory.cache.set(pending.name, { ip: answer.value, expires: ctx.now() + answer.ttl * 1000 });
      pending.onResolved(answer.value, { cached: false });
    } else {
      pending.onFailed(data.rcode === 'NXDOMAIN' ? 'nom inexistant (NXDOMAIN)' : `réponse ${data.rcode ?? 'vide'}`);
    }
    return true;
  }
  return false;
}

export default {
  name: 'dns',

  start(ctx) {
    const { params } = ctx;
    const names = Array.isArray(params.names) ? params.names : [];
    const interval = Number.isFinite(params.interval) && params.interval > 0 ? params.interval : DEFAULTS.interval;
    const timeout = Number.isFinite(params.timeout) && params.timeout > 0 ? params.timeout : DEFAULTS.timeout;
    const results = [];
    ctx.memory(params.client).dnsResults = results;
    explainOnce(ctx, ['dns-start']);
    const done = () => {
      if (results.length === names.length) explainOnce(ctx, ['dns-summary']);
    };
    names.forEach((name, index) => {
      const n = index + 1;
      ctx.schedule(index * interval, () => {
        const before = dnsCache(ctx, params.client).get(name.toLowerCase());
        const fromCache = Boolean(before && before.expires > ctx.now());
        const step = fromCache ? null : explainOnce(ctx, [`dns-query-${n}`, 'dns-query']);
        resolveName(ctx, params.client, name, {
          step,
          timeout,
          onResolved(ip, { cached }) {
            results.push({ name, ip, cached });
            explainOnce(ctx, cached ? [`dns-cache-hit-${n}`, 'dns-cache-hit'] : [`dns-response-${n}`, 'dns-response']);
            done();
          },
          onFailed(reason) {
            results.push({ name, ip: null, reason });
            explainOnce(ctx, reason.includes('NXDOMAIN')
              ? [`dns-nxdomain-${n}`, 'dns-nxdomain']
              : reason.startsWith('aucun') ? ['dns-no-server'] : [`dns-timeout-${n}`, 'dns-timeout']);
            done();
          },
        });
      });
    });
  },

  onReceive(device, packet, ctx) {
    handleDns(ctx, device, packet);
  },

  describe(packet) {
    const data = packet.data ?? {};
    const fields = [
      ...describeHeaders(packet),
      { layer: 'DNS', field: 'Identifiant', value: `0x${Number(data.id ?? 0).toString(16)}` },
      { layer: 'DNS', field: 'Question', value: `${data.question?.name ?? ''} (${data.question?.type ?? 'A'})` },
    ];
    if (packet.type === 'response') {
      fields.push({ layer: 'DNS', field: 'Code de réponse', value: String(data.rcode ?? '') });
      for (const answer of data.answers ?? []) {
        fields.push({ layer: 'DNS', field: 'Réponse', value: `${answer.name} ${answer.type} ${answer.value} (TTL ${answer.ttl} s)` });
      }
    }
    return fields;
  },
};
