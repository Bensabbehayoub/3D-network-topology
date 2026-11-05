// Khalil (S1) : format des fichiers scenarios/<protocole>.json et son validateur.
//
// CONTRAT D'ÉQUIPE, figé en S1. Documentation et exemple commenté : docs/simulation/contrats.md
// Exemple complet : scenarios/arp.json
//
// Chaque scénario contient SA topologie et SES textes d'explication : aucun fichier partagé.
//
// {
//   "schema": 1,
//   "id": "arp",                              // unique ; en général = nom du fichier
//   "title": "ARP : trouver l'adresse MAC d'un voisin",
//   "protocol": "arp",                        // charge src/sim/protocols/arp.js
//   "description": "Rôle du protocole en 2-3 phrases.",
//   "params": { "source": "pc1", "target": "pc2" },   // paramètres de lancement par défaut
//   "devices": [
//     { "id": "pc1", "type": "host", "label": "PC 1", "position": [-2, 0, 0],
//       "interfaces": [{ "name": "eth0", "mac": "02:00:00:00:00:01", "ip": "192.168.1.10/24" }],
//       "gateway": "192.168.1.1" },
//     { "id": "sw1", "type": "switch", "interfaces": [{ "name": "p1" }, { "name": "p2" }] }
//   ],
//   "links": [{ "id": "l1", "a": "pc1:eth0", "b": "sw1:p1", "latency": 400 }],
//   "steps": [{ "id": "arp-request", "title": "Requête ARP", "text": "PC 1 demande à tout le réseau..." }]
// }

export const SCHEMA_VERSION = 1;

/** Types d'équipements reconnus (un modèle 3D par type côté rendu). */
export const DEVICE_TYPES = Object.freeze(['host', 'server', 'switch', 'router']);

/** Latence par défaut d'un lien, en ms simulées (assez longue pour voir le paquet bouger à vitesse 1). */
export const DEFAULT_LATENCY = 400;

const ID = /^[A-Za-z][A-Za-z0-9_-]*$/;
const PROTOCOL = /^[a-z][a-z0-9-]*$/;
const MAC = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i;
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** Types dont chaque interface doit avoir une adresse MAC. */
const NEEDS_MAC = new Set(['host', 'server', 'router']);

export function isMac(value) {
  return typeof value === 'string' && MAC.test(value);
}

export function isIpv4(value) {
  return typeof value === 'string' && IPV4.test(value);
}

/** '192.168.1.10/24' → { address: '192.168.1.10', prefix: 24 } ; null si invalide. */
export function parseCidr(value) {
  if (typeof value !== 'string') return null;
  const [address, prefix, extra] = value.split('/');
  const length = Number(prefix);
  if (extra !== undefined || !isIpv4(address) || !Number.isInteger(length) || length < 0 || length > 32) return null;
  return { address, prefix: length };
}

/** 'pc1:eth0' → { device: 'pc1', interface: 'eth0' } ; null si invalide. */
export function parseEndpoint(value) {
  if (typeof value !== 'string') return null;
  const index = value.indexOf(':');
  if (index <= 0 || index === value.length - 1) return null;
  return { device: value.slice(0, index), interface: value.slice(index + 1) };
}

/**
 * Valide un scénario. Ne lève jamais d'erreur : renvoie la liste des problèmes.
 * @param {unknown} scenario objet issu de JSON.parse
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateScenario(scenario) {
  const errors = [];
  const error = (message) => errors.push(message);

  if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) {
    return { ok: false, errors: ['le scénario doit être un objet JSON'] };
  }

  if (scenario.schema !== SCHEMA_VERSION) error(`schema : ${SCHEMA_VERSION} attendu`);
  if (typeof scenario.id !== 'string' || !ID.test(scenario.id)) error('id : identifiant attendu (lettres, chiffres, - ou _)');
  if (typeof scenario.title !== 'string' || !scenario.title.trim()) error('title : texte non vide attendu');
  if (typeof scenario.protocol !== 'string' || !PROTOCOL.test(scenario.protocol)) {
    error('protocol : nom de protocole en minuscules attendu (ex. "arp")');
  }
  if (scenario.description !== undefined && typeof scenario.description !== 'string') error('description : texte attendu');
  if (scenario.params !== undefined && (typeof scenario.params !== 'object' || scenario.params === null || Array.isArray(scenario.params))) {
    error('params : objet attendu');
  }

  // Équipements et interfaces
  /** @type {Map<string, Set<string>>} interfaces par équipement */
  const interfaces = new Map();
  if (!Array.isArray(scenario.devices) || scenario.devices.length === 0) {
    error('devices : au moins un équipement attendu');
  } else {
    scenario.devices.forEach((device, i) => {
      const where = `devices[${i}]`;
      if (!device || typeof device !== 'object') return error(`${where} : objet attendu`);
      const name = typeof device.id === 'string' ? `${where} (${device.id})` : where;
      if (typeof device.id !== 'string' || !ID.test(device.id)) error(`${where}.id : identifiant attendu`);
      else if (interfaces.has(device.id)) error(`${name} : id en double`);
      if (!DEVICE_TYPES.includes(device.type)) error(`${name}.type : une valeur parmi ${DEVICE_TYPES.join(', ')}`);
      if (device.label !== undefined && typeof device.label !== 'string') error(`${name}.label : texte attendu`);
      if (device.position !== undefined
        && !(Array.isArray(device.position) && device.position.length === 3 && device.position.every(Number.isFinite))) {
        error(`${name}.position : [x, y, z] attendu`);
      }
      if (device.gateway !== undefined && !isIpv4(device.gateway)) error(`${name}.gateway : adresse IPv4 attendue`);

      const names = new Set();
      if (!Array.isArray(device.interfaces) || device.interfaces.length === 0) {
        error(`${name}.interfaces : au moins une interface attendue`);
      } else {
        device.interfaces.forEach((itf, j) => {
          const at = `${name}.interfaces[${j}]`;
          if (!itf || typeof itf.name !== 'string' || !itf.name) return error(`${at}.name : texte attendu`);
          if (names.has(itf.name)) error(`${at} : interface "${itf.name}" en double`);
          names.add(itf.name);
          if (itf.mac !== undefined && !isMac(itf.mac)) error(`${at}.mac : format aa:bb:cc:dd:ee:ff attendu`);
          if (itf.mac === undefined && NEEDS_MAC.has(device.type)) error(`${at}.mac : obligatoire pour un équipement ${device.type}`);
          if (itf.ip !== undefined && !parseCidr(itf.ip)) error(`${at}.ip : format 192.168.1.10/24 attendu`);
        });
      }
      if (typeof device.id === 'string' && !interfaces.has(device.id)) interfaces.set(device.id, names);
    });

    const macs = new Map();
    for (const device of scenario.devices) {
      for (const itf of device?.interfaces ?? []) {
        if (!isMac(itf?.mac)) continue;
        const mac = itf.mac.toLowerCase();
        if (macs.has(mac)) error(`MAC ${itf.mac} utilisée deux fois (${macs.get(mac)} et ${device.id}:${itf.name})`);
        else macs.set(mac, `${device.id}:${itf.name}`);
      }
    }
  }

  // Liens
  if (!Array.isArray(scenario.links)) {
    error('links : tableau attendu (vide si un seul équipement)');
  } else {
    const ids = new Set();
    const used = new Map();
    scenario.links.forEach((link, i) => {
      const where = `links[${i}]${typeof link?.id === 'string' ? ` (${link.id})` : ''}`;
      if (!link || typeof link !== 'object') return error(`${where} : objet attendu`);
      if (typeof link.id !== 'string' || !ID.test(link.id)) error(`${where}.id : identifiant attendu`);
      else if (ids.has(link.id)) error(`${where} : id en double`);
      else ids.add(link.id);
      if (link.latency !== undefined && !(Number.isFinite(link.latency) && link.latency > 0)) {
        error(`${where}.latency : nombre > 0 attendu (ms simulées)`);
      }
      const ends = [];
      for (const side of ['a', 'b']) {
        const end = parseEndpoint(link[side]);
        if (!end) { error(`${where}.${side} : "équipement:interface" attendu`); continue; }
        if (!interfaces.has(end.device)) { error(`${where}.${side} : équipement "${end.device}" inconnu`); continue; }
        if (!interfaces.get(end.device).has(end.interface)) {
          error(`${where}.${side} : interface "${end.interface}" absente de ${end.device}`);
          continue;
        }
        const key = `${end.device}:${end.interface}`;
        if (used.has(key)) error(`${where}.${side} : ${key} déjà relié par ${used.get(key)}`);
        else used.set(key, link.id);
        ends.push(end.device);
      }
      if (ends.length === 2 && ends[0] === ends[1]) error(`${where} : un lien doit relier deux équipements différents`);
    });
  }

  // Étapes pédagogiques
  if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
    error('steps : au moins une étape expliquée attendue');
  } else {
    const ids = new Set();
    scenario.steps.forEach((step, i) => {
      const where = `steps[${i}]${typeof step?.id === 'string' ? ` (${step.id})` : ''}`;
      if (!step || typeof step !== 'object') return error(`${where} : objet attendu`);
      if (typeof step.id !== 'string' || !ID.test(step.id)) error(`${where}.id : identifiant attendu`);
      else if (ids.has(step.id)) error(`${where} : id en double`);
      else ids.add(step.id);
      if (typeof step.title !== 'string' || !step.title.trim()) error(`${where}.title : texte non vide attendu`);
      if (typeof step.text !== 'string' || !step.text.trim()) error(`${where}.text : texte non vide attendu`);
    });
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Lève une erreur lisible si le scénario est invalide ; sinon le renvoie.
 * @template T
 * @param {T} scenario
 * @returns {T}
 */
export function assertScenario(scenario) {
  const { ok, errors } = validateScenario(scenario);
  if (!ok) {
    const name = scenario?.id ?? '?';
    throw new Error(`scénario "${name}" invalide :\n- ${errors.join('\n- ')}`);
  }
  return scenario;
}

/**
 * Télécharge et valide un scénario (navigateur). Chemin relatif : GitHub Pages sert sous /<dépôt>/.
 * @param {string} url ex. './scenarios/arp.json'
 */
export async function fetchScenario(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`scénario ${url} : HTTP ${response.status}`);
  return assertScenario(await response.json());
}

// --- Aides de lecture de topologie (utilisables par tous les pôles) ---

/** @returns {object|undefined} l'équipement d'id donné */
export function findDevice(scenario, id) {
  return scenario.devices.find((device) => device.id === id);
}

/**
 * Lien branché sur une interface, avec l'autre extrémité.
 * @returns {{ link: object, peer: { device: string, interface: string } } | null}
 */
export function linkAt(scenario, deviceId, interfaceName) {
  for (const link of scenario.links) {
    const a = parseEndpoint(link.a);
    const b = parseEndpoint(link.b);
    if (a.device === deviceId && a.interface === interfaceName) return { link, peer: b };
    if (b.device === deviceId && b.interface === interfaceName) return { link, peer: a };
  }
  return null;
}

/** Interfaces reliées d'un équipement, avec leur lien et l'équipement voisin. */
export function neighbours(scenario, deviceId) {
  const device = findDevice(scenario, deviceId);
  if (!device) return [];
  return device.interfaces
    .map((itf) => ({ interface: itf.name, ...linkAt(scenario, deviceId, itf.name) }))
    .filter((entry) => entry.link);
}

/**
 * Plus court chemin (en nombre de liens) entre deux équipements, ou null.
 * Sert au faux moteur et aux tests ; le vrai routage suit les tables des routeurs (S5).
 * @returns {Array<{ device: string, interface: string, link: string, next: string }> | null}
 *   un saut par lien : on sort de `device` par `interface`, on arrive sur `next`.
 */
export function findPath(scenario, from, to) {
  if (from === to) return [];
  const previous = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const current = queue.shift();
    for (const n of neighbours(scenario, current)) {
      if (previous.has(n.peer.device)) continue;
      previous.set(n.peer.device, { device: current, interface: n.interface, link: n.link.id, next: n.peer.device });
      if (n.peer.device === to) {
        const path = [];
        for (let hop = previous.get(to); hop; hop = previous.get(hop.device)) path.unshift(hop);
        return path;
      }
      queue.push(n.peer.device);
    }
  }
  return null;
}
