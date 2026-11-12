// Pôle sim : pile réseau commune à tous les équipements et à tous les protocoles.
//
// Ce que fait un vrai système d'exploitation sous les applications :
// - ARP : cache par équipement, requête en diffusion, réponse, file d'attente des paquets en
//   attente d'une adresse MAC, abandon après ARP_TIMEOUT ;
// - IP : choix de la route (net.js), adresse source, TTL, en-tête Ethernet vers le prochain saut ;
// - ICMP : réponse automatique aux requêtes d'écho (ping), erreurs « TTL expiré » et
//   « destination inaccessible » renvoyées à l'émetteur.
//
// Explications : la pile signale chaque action avec une liste d'identifiants d'étapes, du plus
// précis au plus général (ex. ['arp-reply-pc2', 'arp-reply']). Seules les étapes présentes dans
// scenario.steps sont affichées, une fois par exécution : c'est le scénario qui choisit ce qu'il
// explique. Liste des identifiants : docs/simulation/contrats.md, section « Étapes standard ».
//
// Tout passe par ctx (moteur à évènements discrets) : déterministe et testable sous Node.

import {
  addressedInterfaces, BROADCAST_MAC, interfaceNamed, lookupRoute, UNKNOWN_MAC,
} from './net.js';

/** Délai d'attente d'une réponse ARP (ms simulées) avant d'abandonner les paquets en attente. */
export const ARP_TIMEOUT = 3000;
/** TTL des paquets IP émis par un équipement. */
export const DEFAULT_TTL = 64;

/** Étapes déjà expliquées, par exécution (un ctx neuf à chaque réinitialisation). */
const explainedByRun = new WeakMap();

/** Premier identifiant de `candidates` présent dans scenario.steps, ou null. */
export function stepFor(ctx, candidates) {
  const steps = ctx.scenario?.steps ?? [];
  for (const id of candidates) {
    if (id && steps.some((step) => step.id === id)) return id;
  }
  return null;
}

/**
 * Explique la première étape de `candidates` présente dans le scénario, si elle ne l'a pas déjà
 * été pendant cette exécution. Renvoie son identifiant (même déjà expliquée) pour y rattacher
 * les messages, ou null si le scénario n'explique pas cette action.
 */
export function explainOnce(ctx, candidates) {
  const id = stepFor(ctx, candidates);
  if (!id) return null;
  let done = explainedByRun.get(ctx);
  if (!done) explainedByRun.set(ctx, (done = new Set()));
  if (!done.has(id)) {
    done.add(id);
    ctx.explain(id);
  }
  return id;
}

/** État réseau d'un équipement pour l'exécution en cours (vidé à chaque réinitialisation). */
export function netMemory(ctx, deviceId) {
  const memory = ctx.memory(deviceId);
  memory.net ??= { arp: new Map(), waiting: new Map(), macTable: new Map() };
  return memory.net;
}

/** Cache ARP d'un équipement : Map adresse IP → adresse MAC. */
export function arpCache(ctx, deviceId) {
  return netMemory(ctx, deviceId).arp;
}

/** La trame est-elle pour cette interface (sa MAC ou la diffusion) ? */
export function acceptsFrame(device, interfaceName, packet) {
  if (!packet.eth) return true;
  const destination = packet.eth.dst.toLowerCase();
  if (destination === BROADCAST_MAC) return true;
  return interfaceNamed(device, interfaceName)?.mac?.toLowerCase() === destination;
}

function addressOn(device, interfaceName) {
  return addressedInterfaces(device).find((itf) => itf.name === interfaceName) ?? null;
}

function arpPacket(ctx, operation, { ethSrc, ethDst, senderMac, senderIp, targetMac, targetIp }) {
  return {
    id: ctx.nextPacketId(),
    protocol: 'arp',
    type: operation,
    eth: { src: ethSrc, dst: ethDst },
    ip: null,
    transport: null,
    data: { operation, senderMac, senderIp, targetMac, targetIp },
  };
}

/**
 * Trouve l'adresse MAC de `ip`, joignable par l'interface `interfaceName` de l'équipement.
 * Cache ARP d'abord ; sinon requête ARP en diffusion, et attente de la réponse.
 * @param {{ onResolved(mac: string): void, onFailed?(): void }} handlers
 */
export function resolveMac(ctx, device, interfaceName, ip, { onResolved, onFailed = () => {} }) {
  const memory = netMemory(ctx, device.id);
  if (memory.arp.has(ip)) {
    onResolved(memory.arp.get(ip));
    return;
  }
  const waiting = memory.waiting.get(ip);
  if (waiting) {
    waiting.handlers.push({ onResolved, onFailed });
    return;
  }
  const own = addressOn(device, interfaceName);
  const entry = { handlers: [{ onResolved, onFailed }], cancel: null };
  memory.waiting.set(ip, entry);
  explainOnce(ctx, [`arp-cache-miss-${device.id}`, 'arp-cache-miss']);
  const step = explainOnce(ctx, [`arp-request-${device.id}`, 'arp-request']);
  ctx.send(device.id, arpPacket(ctx, 'request', {
    ethSrc: own?.mac ?? interfaceNamed(device, interfaceName)?.mac,
    ethDst: BROADCAST_MAC,
    senderMac: own?.mac ?? interfaceNamed(device, interfaceName)?.mac,
    senderIp: own?.ip ?? '0.0.0.0',
    targetMac: UNKNOWN_MAC,
    targetIp: ip,
  }), { interface: interfaceName, step });
  entry.cancel = ctx.schedule(ARP_TIMEOUT, () => {
    memory.waiting.delete(ip);
    explainOnce(ctx, [`arp-timeout-${device.id}`, 'arp-timeout']);
    for (const handler of entry.handlers) handler.onFailed();
  });
}

/** Ajoute l'en-tête Ethernet et émet le paquet par l'interface donnée. */
function transmit(ctx, device, interfaceName, mac, packet, step) {
  const source = interfaceNamed(device, interfaceName)?.mac ?? UNKNOWN_MAC;
  ctx.send(device.id, { ...packet, eth: { src: source, dst: mac } }, { interface: interfaceName, step });
}

/**
 * Émet un paquet IP depuis un équipement : route, adresse source, TTL, résolution ARP du
 * prochain saut, puis envoi. Le paquet attend la réponse ARP si besoin.
 * @param {{ id?: string, protocol: string, type: string, ip: { src?: string, dst: string, ttl?: number },
 *   transport?: object | null, data?: object }} packet
 * @param {{ step?: string | null }} [options] étape à laquelle rattacher le message
 * @returns {object | null} le paquet complet (sans en-tête Ethernet), ou null sans route
 */
export function sendIp(ctx, deviceId, packet, { step = null } = {}) {
  const device = ctx.device(deviceId);
  const route = lookupRoute(device, packet.ip.dst);
  const full = {
    id: packet.id ?? ctx.nextPacketId(),
    protocol: packet.protocol,
    type: packet.type,
    eth: null,
    ip: { src: packet.ip.src ?? null, dst: packet.ip.dst, ttl: packet.ip.ttl ?? DEFAULT_TTL },
    transport: packet.transport ?? null,
    data: packet.data ?? {},
  };
  if (!route) {
    full.ip.src ??= addressedInterfaces(device)[0]?.ip ?? '0.0.0.0';
    const noRoute = explainOnce(ctx, [`no-route-${device.id}`, 'no-route']);
    ctx.drop(deviceId, full, `aucune route vers ${packet.ip.dst}`, { step: noRoute ?? step });
    return null;
  }
  full.ip.src ??= addressOn(device, route.interface)?.ip ?? '0.0.0.0';
  const direct = route.nextHop === packet.ip.dst;
  const routeStep = explainOnce(ctx, direct
    ? [`route-direct-${device.id}`, 'route-direct']
    : [`route-gateway-${device.id}`, 'route-gateway']);
  const linked = step ?? routeStep;
  resolveMac(ctx, device, route.interface, route.nextHop, {
    onResolved: (mac) => transmit(ctx, device, route.interface, mac, full, linked),
    onFailed: () => ctx.drop(deviceId, full, `adresse MAC de ${route.nextHop} introuvable (ARP sans réponse)`, { step: linked }),
  });
  return full;
}

/**
 * Traite une trame ARP reçue (hôte, serveur ou routeur). Renvoie toujours true : ARP ne
 * remonte jamais jusqu'au protocole du scénario.
 */
export function handleArp(ctx, device, packet, meta) {
  const data = packet.data ?? {};
  const own = addressOn(device, meta.interface);
  const memory = netMemory(ctx, device.id);
  if (data.operation === 'request') {
    if (own && data.targetIp === own.ip) {
      memory.arp.set(data.senderIp, data.senderMac); // le demandeur se présente : on le retient
      const step = explainOnce(ctx, [`arp-reply-${device.id}`, 'arp-reply']);
      ctx.send(device.id, arpPacket(ctx, 'reply', {
        ethSrc: own.mac, ethDst: data.senderMac,
        senderMac: own.mac, senderIp: own.ip,
        targetMac: data.senderMac, targetIp: data.senderIp,
      }), { interface: meta.interface, step });
    } else {
      explainOnce(ctx, [`arp-ignore-${device.id}`, 'arp-ignore']);
    }
    return true;
  }
  if (data.operation === 'reply' && own) {
    memory.arp.set(data.senderIp, data.senderMac);
    explainOnce(ctx, [`arp-cache-update-${device.id}`, 'arp-cache-update']);
    const waiting = memory.waiting.get(data.senderIp);
    if (waiting) {
      memory.waiting.delete(data.senderIp);
      waiting.cancel?.();
      for (const handler of waiting.handlers) handler.onResolved(data.senderMac);
    }
  }
  return true;
}

/**
 * Paquet IP arrivé à destination : la pile répond elle-même aux requêtes d'écho (ping).
 * @returns {boolean} true si la pile l'a traité, false s'il est pour le protocole du scénario
 */
export function deliverLocal(ctx, device, packet) {
  if (packet.protocol === 'icmp' && packet.type === 'echo-request') {
    const step = explainOnce(ctx, [`icmp-reply-${device.id}`, 'icmp-reply']);
    sendIp(ctx, device.id, {
      protocol: 'icmp',
      type: 'echo-reply',
      ip: { src: packet.ip.dst, dst: packet.ip.src },
      data: { identifier: packet.data?.identifier ?? 1, sequence: packet.data?.sequence ?? 1 },
    }, { step });
    return true;
  }
  return false;
}

/** Types ICMP d'erreur : on n'en renvoie jamais en réponse à une autre erreur. */
const ICMP_ERRORS = new Set(['time-exceeded', 'unreachable']);

/**
 * Renvoie une erreur ICMP à l'émetteur d'un paquet, depuis l'interface où il est arrivé.
 * @param {'time-exceeded' | 'unreachable'} type
 */
export function sendIcmpError(ctx, device, packet, meta, type, step = null) {
  if (!packet.ip || (packet.protocol === 'icmp' && ICMP_ERRORS.has(packet.type))) return;
  const own = addressOn(device, meta.interface);
  sendIp(ctx, device.id, {
    protocol: 'icmp',
    type,
    ip: { src: own?.ip, dst: packet.ip.src },
    data: { original: { id: packet.id, protocol: packet.protocol, type: packet.type, src: packet.ip.src, dst: packet.ip.dst } },
  }, { step });
}

/**
 * Routeur : fait suivre un paquet IP qui ne lui est pas destiné (TTL − 1, route, ARP du saut suivant).
 */
export function forwardIp(ctx, device, packet, meta) {
  const ttl = packet.ip.ttl - 1;
  if (ttl <= 0) {
    const step = explainOnce(ctx, [`router-ttl-${device.id}`, 'router-ttl']);
    ctx.drop(device.id, packet, 'TTL expiré', { step });
    sendIcmpError(ctx, device, packet, meta, 'time-exceeded', step);
    return;
  }
  const route = lookupRoute(device, packet.ip.dst);
  if (!route) {
    const step = explainOnce(ctx, [`router-no-route-${device.id}`, 'router-no-route']);
    ctx.drop(device.id, packet, `aucune route vers ${packet.ip.dst}`, { step });
    sendIcmpError(ctx, device, packet, meta, 'unreachable', step);
    return;
  }
  const step = explainOnce(ctx, [`router-forward-${device.id}`, 'router-forward']);
  const next = { ...packet, eth: null, ip: { ...packet.ip, ttl } };
  resolveMac(ctx, device, route.interface, route.nextHop, {
    onResolved: (mac) => transmit(ctx, device, route.interface, mac, next, step),
    onFailed: () => ctx.drop(device.id, next, `adresse MAC de ${route.nextHop} introuvable (ARP sans réponse)`, { step }),
  });
}
