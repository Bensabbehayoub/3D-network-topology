// Pôle sim (phase 7b) : configuration des équipements dans l'éditeur. Fonctions PURES : chaque
// opération renvoie un nouveau scénario, ou lève BuilderError (message en français).
//
// - adresses : setAddress(s, id, interface, '192.168.1.10/24' | null), proposeAddress() ;
// - passerelle et DNS d'un hôte : setGateway(), proposeGateway(), setDns() ;
// - routes statiques d'un routeur : addRoute(), removeRoute() ;
// - ports ouverts : addService(), removeService() ;
// - rôles d'un serveur : setRole(s, id, 'dhcp' | 'dns' | 'web', actif), avec des valeurs proposées
//   (plage DHCP, enregistrements DNS, page d'accueil) ; addRecord(), removeRecord().

import { BuilderError } from './builder.js';
import { segments } from './diagnostics.js';
import { addressedInterfaces, inNetwork, intToIp, ipToInt, maskOf, networkAddress, parseNetwork } from './net.js';
import { isHostname, isIpv4, parseCidr } from './scenario.js';

const copy = (scenario) => structuredClone(scenario);

function deviceOf(scenario, id) {
  const device = scenario.devices.find((candidate) => candidate.id === id);
  if (!device) throw new BuilderError(`Équipement « ${id} » introuvable.`);
  return device;
}
const nameOf = (device) => device.label ?? device.id;

function interfaceOf(device, name) {
  const itf = device.interfaces.find((candidate) => candidate.name === name);
  if (!itf) throw new BuilderError(`${nameOf(device)} n'a pas d'interface « ${name} ».`);
  return itf;
}

/** Adresses IP utilisées dans tout le scénario (sans préfixe). */
function usedAddresses(scenario, except = null) {
  const used = new Set();
  for (const device of scenario.devices) {
    for (const itf of device.interfaces) {
      if (itf === except || !itf.ip) continue;
      const cidr = parseCidr(itf.ip);
      if (cidr) used.add(cidr.address);
    }
  }
  return used;
}

/**
 * Change l'adresse d'une interface. `null` ou '' : plus d'adresse (client DHCP, port non utilisé).
 * Refuse une adresse mal écrite, l'adresse du réseau ou de diffusion, et une adresse déjà prise.
 */
export function setAddress(scenario, id, name, cidr) {
  const result = copy(scenario);
  const device = deviceOf(result, id);
  if (device.type === 'switch') throw new BuilderError('Un switch ne prend pas d\'adresse IP sur ses ports.');
  const itf = interfaceOf(device, name);
  const value = String(cidr ?? '').trim();
  if (!value) {
    delete itf.ip;
    return result;
  }
  const parsed = parseCidr(value.includes('/') ? value : `${value}/24`);
  if (!parsed) throw new BuilderError(`« ${value} » n'est pas une adresse valide : écrivez par exemple 192.168.1.10/24.`);
  if (parsed.prefix < 8 || parsed.prefix > 30) throw new BuilderError('Le préfixe doit être compris entre /8 et /30.');
  const network = networkAddress(parsed.address, parsed.prefix);
  const broadcast = intToIp((ipToInt(network) | (~maskOf(parsed.prefix) >>> 0)) >>> 0);
  if (parsed.address === network) throw new BuilderError(`${parsed.address} est l'adresse du réseau ${network}/${parsed.prefix} : elle ne peut pas être donnée à un équipement.`);
  if (parsed.address === broadcast) throw new BuilderError(`${parsed.address} est l'adresse de diffusion du réseau : elle ne peut pas être donnée à un équipement.`);
  if (usedAddresses(result, itf).has(parsed.address)) throw new BuilderError(`L'adresse ${parsed.address} est déjà utilisée par un autre équipement.`);
  itf.ip = `${parsed.address}/${parsed.prefix}`;
  return result;
}

/** Réseaux /24 privés déjà pris dans le scénario (pour en proposer un nouveau). */
function usedNetworks(scenario) {
  return new Set(scenario.devices.flatMap((device) => addressedInterfaces(device).map((itf) => `${itf.network}/${itf.prefix}`)));
}

/**
 * Adresse proposée pour une interface : dans le réseau déjà utilisé sur son segment (le même
 * switch ou le même câble), sinon dans un nouveau réseau privé 192.168.N.0/24. Un routeur prend
 * de préférence la première adresse (.1), un hôte ou un serveur une adresse à partir de .10.
 * @returns {string | null} adresse au format CIDR, ou null si l'interface ne peut pas en avoir
 */
export function proposeAddress(scenario, id, name) {
  const device = deviceOf(scenario, id);
  if (device.type === 'switch') return null;
  interfaceOf(device, name);
  const segmentOf = segments(scenario);
  const segment = segmentOf(`${id}:${name}`);
  const neighbours = scenario.devices.flatMap((other) => addressedInterfaces(other)
    .filter((itf) => !(other.id === id && itf.name === name) && segmentOf(`${other.id}:${itf.name}`) === segment));
  let network;
  let prefix;
  if (neighbours.length) {
    ({ network, prefix } = neighbours[0]);
  } else {
    const taken = usedNetworks(scenario);
    let n = 1;
    while (taken.has(`192.168.${n}.0/24`) && n < 254) n += 1;
    network = `192.168.${n}.0`;
    prefix = 24;
  }
  const used = usedAddresses(scenario, device.interfaces.find((itf) => itf.name === name));
  const size = 2 ** (32 - prefix);
  const base = ipToInt(network);
  const start = device.type === 'router' ? 1 : Math.min(10, size - 2);
  for (let offset = start; offset < size - 1; offset += 1) {
    const candidate = intToIp((base + offset) >>> 0);
    if (!used.has(candidate)) return `${candidate}/${prefix}`;
  }
  for (let offset = 1; offset < start; offset += 1) {
    const candidate = intToIp((base + offset) >>> 0);
    if (!used.has(candidate)) return `${candidate}/${prefix}`;
  }
  throw new BuilderError(`Plus aucune adresse libre dans le réseau ${network}/${prefix}.`);
}

/** Passerelle proposée pour un hôte : l'adresse du routeur sur son segment, dans son réseau. */
export function proposeGateway(scenario, id) {
  const device = deviceOf(scenario, id);
  const own = addressedInterfaces(device)[0];
  if (!own) return null;
  const segmentOf = segments(scenario);
  const segment = segmentOf(`${id}:${own.name}`);
  for (const other of scenario.devices.filter((candidate) => candidate.type === 'router')) {
    const itf = addressedInterfaces(other).find((candidate) => segmentOf(`${other.id}:${candidate.name}`) === segment && inNetwork(candidate.ip, own.network, own.prefix));
    if (itf) return itf.ip;
  }
  return null;
}

function setHostField(scenario, id, field, value, label) {
  const result = copy(scenario);
  const device = deviceOf(result, id);
  if (device.type === 'switch') throw new BuilderError(`Un switch n'a pas de ${label}.`);
  const text = String(value ?? '').trim();
  if (!text) {
    delete device[field];
    return result;
  }
  if (!isIpv4(text)) throw new BuilderError(`« ${text} » n'est pas une adresse IPv4 (exemple : 192.168.1.1).`);
  device[field] = text;
  return result;
}

export const setGateway = (scenario, id, ip) => setHostField(scenario, id, 'gateway', ip, 'passerelle');
export const setDns = (scenario, id, ip) => setHostField(scenario, id, 'dns', ip, 'serveur DNS');

/** Ajoute une route statique « réseau via routeur suivant » à un routeur. */
export function addRoute(scenario, id, { network, via }) {
  const result = copy(scenario);
  const device = deviceOf(result, id);
  if (device.type !== 'router') throw new BuilderError('Seul un routeur a des routes statiques.');
  const target = parseNetwork(String(network ?? '').trim());
  if (!target) throw new BuilderError('Réseau à joindre : écrivez par exemple 192.168.3.0/24 (ou 0.0.0.0/0 pour une route par défaut).');
  const next = String(via ?? '').trim();
  if (!isIpv4(next)) throw new BuilderError('Routeur suivant : une adresse IPv4 est attendue (exemple : 10.0.0.2).');
  if (!addressedInterfaces(device).some((itf) => inNetwork(next, itf.network, itf.prefix))) {
    throw new BuilderError(`${next} n'est dans aucun réseau directement relié à ${nameOf(device)} : le routeur suivant doit être un voisin.`);
  }
  device.routes = [...(device.routes ?? []).filter((route) => route.network !== `${target.network}/${target.prefix}`), { network: `${target.network}/${target.prefix}`, via: next }];
  return result;
}

export function removeRoute(scenario, id, network) {
  const result = copy(scenario);
  const device = deviceOf(result, id);
  device.routes = (device.routes ?? []).filter((route) => route.network !== network);
  if (device.routes.length === 0) delete device.routes;
  return result;
}

/** Ouvre un port sur un hôte ou un serveur (service). */
export function addService(scenario, id, { transport, port, name }) {
  const result = copy(scenario);
  const device = deviceOf(result, id);
  if (device.type === 'switch' || device.type === 'router') throw new BuilderError('Seuls les PC et les serveurs offrent des services.');
  if (!['udp', 'tcp'].includes(transport)) throw new BuilderError('Transport : UDP ou TCP.');
  const number = Number(port);
  if (!Number.isInteger(number) || number < 1 || number > 65535) throw new BuilderError('Port : un nombre entier de 1 à 65535.');
  device.services = [...(device.services ?? []).filter((service) => !(service.transport === transport && service.port === number)),
    { name: String(name ?? `${transport}-${number}`), transport, port: number }];
  return result;
}

export function removeService(scenario, id, transport, port) {
  const result = copy(scenario);
  const device = deviceOf(result, id);
  device.services = (device.services ?? []).filter((service) => !(service.transport === transport && service.port === port));
  if (device.services.length === 0) delete device.services;
  return result;
}

/** Rôles de serveur : port ouvert et champ de configuration associés. */
export const ROLES = Object.freeze({
  dhcp: { label: 'Serveur DHCP', transport: 'udp', port: 67, field: 'dhcp' },
  dns: { label: 'Serveur DNS', transport: 'udp', port: 53, field: 'records' },
  web: { label: 'Serveur web', transport: 'tcp', port: 80, field: 'pages' },
});

/** Rôles actifs d'un équipement. */
export function rolesOf(device) {
  return Object.entries(ROLES).filter(([, role]) => device[role.field] !== undefined
    && (device.services ?? []).some((service) => service.transport === role.transport && service.port === role.port)).map(([id]) => id);
}

/**
 * Active ou retire un rôle. Valeurs proposées : plage DHCP .100 à .150 du réseau du serveur,
 * passerelle et DNS trouvés dans le réseau ; pour DNS, un enregistrement par serveur web ; pour un
 * serveur web, une page d'accueil.
 */
export function setRole(scenario, id, role, enabled) {
  const definition = ROLES[role];
  if (!definition) throw new BuilderError(`Rôle « ${role} » inconnu.`);
  let result = copy(scenario);
  const device = deviceOf(result, id);
  if (device.type !== 'server' && device.type !== 'host') throw new BuilderError('Un rôle de serveur se donne à un serveur ou à un PC.');
  if (!enabled) {
    delete device[definition.field];
    return removeService(result, id, definition.transport, definition.port);
  }
  const own = addressedInterfaces(device)[0];
  if (!own) throw new BuilderError(`Donnez d'abord une adresse IP fixe à ${nameOf(device)} : un serveur doit être joignable à une adresse connue.`);
  if (role === 'dhcp') {
    const base = ipToInt(own.network);
    const size = 2 ** (32 - own.prefix);
    const first = Math.min(100, Math.max(2, size - 3));
    const last = Math.min(first + 50, size - 2);
    const gateway = proposeGateway(result, id) ?? device.gateway;
    const dnsServer = result.devices.find((other) => other.records && addressedInterfaces(other)[0]);
    device.dhcp = {
      start: intToIp((base + first) >>> 0), end: intToIp((base + last) >>> 0), prefix: own.prefix,
      ...(gateway ? { gateway } : {}),
      ...(dnsServer ? { dns: addressedInterfaces(dnsServer)[0].ip } : {}),
      lease: 86400,
    };
  }
  if (role === 'dns') {
    device.records = result.devices.filter((other) => other.pages && addressedInterfaces(other)[0])
      .map((other, i) => ({ name: i === 0 ? 'www.ecole.test' : `site${i + 1}.ecole.test`, type: 'A', value: addressedInterfaces(other)[0].ip, ttl: 300 }));
  }
  if (role === 'web') device.pages = [{ path: '/', status: 200, type: 'text/html', size: 2400, title: 'Accueil' }];
  result = addService(result, id, { transport: definition.transport, port: definition.port, name: role === 'web' ? 'http' : role });
  return result;
}

/** Ajoute ou remplace un enregistrement A sur un serveur DNS (noms fictifs : domaine .test conseillé). */
export function addRecord(scenario, id, { name, value }) {
  const result = copy(scenario);
  const device = deviceOf(result, id);
  if (!device.records) throw new BuilderError(`Activez d'abord le rôle « Serveur DNS » sur ${nameOf(device)}.`);
  const host = String(name ?? '').trim().toLowerCase();
  if (!isHostname(host)) throw new BuilderError('Nom : un nom de domaine complet, par exemple www.ecole.test.');
  if (!isIpv4(String(value ?? '').trim())) throw new BuilderError('Adresse : une adresse IPv4, par exemple 192.168.2.80.');
  device.records = [...device.records.filter((record) => record.name !== host), { name: host, type: 'A', value: String(value).trim(), ttl: 300 }];
  return result;
}

export function removeRecord(scenario, id, name) {
  const result = copy(scenario);
  const device = deviceOf(result, id);
  if (device.records) device.records = device.records.filter((record) => record.name !== name);
  return result;
}
