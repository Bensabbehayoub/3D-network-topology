// Pôle sim : adressage IPv4 et tables de routage (fonctions pures, sans ctx ni état).
//
// Utilisé par la pile réseau (stack.js) et par les équipements (devices/*.js) :
// - adresses : conversion, appartenance à un réseau ;
// - interfaces d'un équipement, avec leur réseau ;
// - table de routage d'un équipement : réseaux directement connectés (adresses des interfaces),
//   routes statiques (champ "routes" du scénario), route par défaut (champ "gateway") ;
// - recherche de la route la plus précise (plus long préfixe).

import { BROADCAST_MAC } from './events.js';
import { parseCidr, isIpv4 } from './scenario.js';

export { BROADCAST_MAC };
export const UNKNOWN_MAC = '00:00:00:00:00:00';

/** '192.168.1.10' → entier non signé sur 32 bits. */
export function ipToInt(ip) {
  return ip.split('.').reduce((value, part) => ((value << 8) | Number(part)) >>> 0, 0);
}

/** Entier sur 32 bits → '192.168.1.10'. */
export function intToIp(value) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

/** Masque d'un préfixe : 24 → 0xffffff00. */
export function maskOf(prefix) {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

/** Adresse du réseau : ('192.168.1.10', 24) → '192.168.1.0'. */
export function networkAddress(ip, prefix) {
  return intToIp((ipToInt(ip) & maskOf(prefix)) >>> 0);
}

/** L'adresse `ip` appartient-elle au réseau `network`/`prefix` ? */
export function inNetwork(ip, network, prefix) {
  return ((ipToInt(ip) ^ ipToInt(network)) & maskOf(prefix)) === 0;
}

/**
 * Interfaces adressées d'un équipement.
 * @returns {Array<{ name: string, mac: string | null, ip: string, prefix: number, network: string }>}
 */
export function addressedInterfaces(device) {
  const result = [];
  for (const itf of device?.interfaces ?? []) {
    const cidr = itf.ip ? parseCidr(itf.ip) : null;
    if (!cidr) continue;
    result.push({ name: itf.name, mac: itf.mac ?? null, ip: cidr.address, prefix: cidr.prefix, network: networkAddress(cidr.address, cidr.prefix) });
  }
  return result;
}

/** Interface (adressée) de l'équipement qui porte l'adresse `ip`, ou null. */
export function interfaceWithIp(device, ip) {
  return addressedInterfaces(device).find((itf) => itf.ip === ip) ?? null;
}

/** L'équipement possède-t-il l'adresse `ip` ? */
export function ownsIp(device, ip) {
  return interfaceWithIp(device, ip) !== null;
}

/** Interface par son nom, ou null. */
export function interfaceNamed(device, name) {
  return device?.interfaces?.find((itf) => itf.name === name) ?? null;
}

/** Première adresse IP de l'équipement (sans préfixe), ou null. */
export function primaryIp(device) {
  return addressedInterfaces(device)[0]?.ip ?? null;
}

/** '192.168.3.0/24' → { network, prefix } (adresse ramenée au réseau), ou null. */
export function parseNetwork(value) {
  const cidr = parseCidr(value);
  return cidr ? { network: networkAddress(cidr.address, cidr.prefix), prefix: cidr.prefix } : null;
}

/**
 * Table de routage d'un équipement, dans l'ordre d'affichage :
 * réseaux connectés, routes statiques, route par défaut.
 * @returns {Array<{ network: string, prefix: number, via: string | null, interface: string | null, kind: 'connected' | 'static' | 'default' }>}
 */
export function routingTable(device) {
  const table = addressedInterfaces(device).map((itf) => ({ network: itf.network, prefix: itf.prefix, via: null, interface: itf.name, kind: 'connected' }));
  for (const route of Array.isArray(device?.routes) ? device.routes : []) {
    const target = parseNetwork(route?.network);
    if (!target || !isIpv4(route?.via)) continue;
    table.push({ ...target, via: route.via, interface: null, kind: target.prefix === 0 ? 'default' : 'static' });
  }
  if (isIpv4(device?.gateway) && !table.some((route) => route.prefix === 0)) {
    table.push({ network: '0.0.0.0', prefix: 0, via: device.gateway, interface: null, kind: 'default' });
  }
  return table;
}

/**
 * Route vers `ip` : la plus précise (plus long préfixe). Pour une route par un routeur voisin,
 * l'interface de sortie est celle dont le réseau contient ce voisin.
 * @returns {{ interface: string, nextHop: string, route: object } | null} nextHop = destination
 *   elle-même pour un réseau connecté, sinon l'adresse du routeur suivant ; null sans route
 */
export function lookupRoute(device, ip) {
  if (!isIpv4(ip)) return null;
  const candidates = routingTable(device)
    .filter((route) => inNetwork(ip, route.network, route.prefix))
    .sort((a, b) => b.prefix - a.prefix);
  const connected = addressedInterfaces(device);
  for (const route of candidates) {
    if (route.via === null) return { interface: route.interface, nextHop: ip, route };
    const exit = connected.find((itf) => inNetwork(route.via, itf.network, itf.prefix));
    if (exit) return { interface: exit.name, nextHop: route.via, route };
  }
  return null;
}

/** Texte d'une route pour les explications et l'inspecteur : '192.168.3.0/24 via 10.0.0.2'. */
export function formatRoute(route) {
  const target = `${route.network}/${route.prefix}`;
  return route.via ? `${target} via ${route.via}` : `${target} (connecté, ${route.interface})`;
}
