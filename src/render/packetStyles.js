// Aziz (S3) : palette pure et reutilisable des paquets.
// Aucun materiau Three.js n'est cree ici : packetAnimator peut mettre les materiaux en cache.

import { isBroadcast } from '../../simulation.js';

/** Les huit categories pedagogiques du projet, plus `demo` actuellement emis par le mock. */
export const PACKET_PROTOCOLS = Object.freeze([
  'arp', 'icmp', 'dhcp', 'udp', 'dns', 'tcp', 'http', 'routing', 'demo',
]);

export const UNKNOWN_PROTOCOL = 'unknown';

const COLORS = Object.freeze({
  arp: 0xffd166,
  icmp: 0x38d9ff,
  dhcp: 0x5be37d,
  udp: 0xff9f43,
  dns: 0xc77dff,
  tcp: 0x4ea8ff,
  http: 0xff5da2,
  routing: 0x2dd4bf,
  demo: 0xe5e7eb,
  [UNKNOWN_PROTOCOL]: 0x9ca3af,
});

const ALIASES = Object.freeze({
  routage: 'routing',
  'static-routing': 'routing',
  'routage-statique': 'routing',
});

function descriptor(protocol, broadcast) {
  return Object.freeze({
    protocol,
    color: COLORS[protocol],
    radius: broadcast ? 0.38 : 0.30,
    opacity: broadcast ? 0.95 : 0.88,
    emissiveIntensity: broadcast ? 0.72 : 0.40,
    halo: broadcast,
    broadcast,
  });
}

function variants(protocol) {
  return Object.freeze({
    unicast: descriptor(protocol, false),
    broadcast: descriptor(protocol, true),
  });
}

export const PACKET_STYLES = Object.freeze(Object.fromEntries(
  [...PACKET_PROTOCOLS, UNKNOWN_PROTOCOL].map((protocol) => [protocol, variants(protocol)]),
));

/** Normalise un nom sans inventer de protocole pour les valeurs inconnues. */
export function normalizeProtocol(value) {
  if (typeof value !== 'string') return UNKNOWN_PROTOCOL;
  const name = value.trim().toLowerCase();
  const canonical = ALIASES[name] ?? name;
  return PACKET_PROTOCOLS.includes(canonical) ? canonical : UNKNOWN_PROTOCOL;
}

/**
 * Retourne toujours l'un des descripteurs immuables mis en cache.
 *
 * Deux formes sont acceptees pour faciliter l'integration :
 *   getPacketStyle('icmp', false)
 *   getPacketStyle(packet) // broadcast derive du contrat Ethernet commun
 */
export function getPacketStyle(protocolOrPacket, broadcast) {
  const packet = protocolOrPacket && typeof protocolOrPacket === 'object' ? protocolOrPacket : null;
  const protocol = normalizeProtocol(packet?.protocol ?? protocolOrPacket);
  const distributed = packet ? isBroadcast(packet) : broadcast === true;
  return PACKET_STYLES[protocol][distributed ? 'broadcast' : 'unicast'];
}

/** API courte attendue par packetAnimator : packetStyles.get(protocol, broadcast). */
export const packetStyles = Object.freeze({
  get: getPacketStyle,
  protocols: PACKET_PROTOCOLS,
  fallback: PACKET_STYLES[UNKNOWN_PROTOCOL],
});

export default packetStyles;
