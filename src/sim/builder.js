// Pôle sim (phase 7) : construction d'une topologie, pour l'éditeur du mode « Construire ».
//
// Fonctions PURES : chaque opération prend un scénario et renvoie un nouveau scénario (jamais de
// modification sur place), ou une erreur en français. Le résultat reste un scénario valide
// (validateScenario), chargeable par le moteur.
//
//   newTopology()                                   topologie vide
//   fromScenario(scenario)                          copie modifiable d'un scénario fourni
//   addDevice(s, { model, position })               → { scenario, id }
//   moveDevice(s, id, position) / renameDevice(s, id, label) / removeDevice(s, id)
//   freePorts(s, id)                                interfaces sans câble
//   connect(s, { a, b, cable })                     → { scenario, id }   a, b : 'équipement:interface'
//   disconnect(s, linkId)
// Les erreurs sont levées en BuilderError (message prêt à afficher).

import { CABLES, MODELS, modelPorts } from './catalog.js';
import { parseEndpoint } from './scenario.js';

export class BuilderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BuilderError';
  }
}

/** Libellés et préfixes d'identifiants par type d'équipement. */
export const TYPE_NAMING = Object.freeze({
  host: { label: 'PC', prefix: 'pc', interface: (i) => `eth${i}` },
  server: { label: 'Serveur', prefix: 'srv', interface: (i) => `eth${i}` },
  switch: { label: 'Switch', prefix: 'sw', interface: (i) => `p${i + 1}` },
  router: { label: 'Routeur', prefix: 'r', interface: (i) => `g${i}` },
});

export const MAX_LABEL = 30;
const INTRO_STEP = Object.freeze({
  id: 'aucun',
  title: 'Topologie en construction',
  text: 'Ajoutez des équipements, reliez-les, puis choisissez le protocole à jouer.',
});

const copy = (scenario) => structuredClone(scenario);

/** Topologie vide, prête pour l'éditeur (protocole « aucun » tant qu'aucun n'est choisi). */
export function newTopology({ title = 'Ma topologie' } = {}) {
  return {
    schema: 1,
    id: 'perso',
    title,
    protocol: 'aucun',
    description: 'Topologie construite dans l\'éditeur.',
    params: {},
    devices: [],
    links: [],
    steps: [{ ...INTRO_STEP }],
  };
}

/** Copie modifiable d'un scénario fourni : même réseau, protocole remis à « aucun ». */
export function fromScenario(scenario) {
  const result = copy(scenario);
  result.id = 'perso';
  result.title = `${scenario.title} (copie)`;
  result.protocol = 'aucun';
  result.params = {};
  result.steps = [{ ...INTRO_STEP }];
  return result;
}

function deviceOrThrow(scenario, id) {
  const device = scenario.devices.find((candidate) => candidate.id === id);
  if (!device) throw new BuilderError(`Équipement « ${id} » introuvable.`);
  return device;
}

/** Prochain numéro libre pour un préfixe : pc1, pc2… et « PC 1 », « PC 2 »… */
function nextNumber(scenario, type) {
  const { prefix, label } = TYPE_NAMING[type];
  const used = new Set();
  for (const device of scenario.devices) {
    const fromId = new RegExp(`^${prefix}(\\d+)$`).exec(device.id);
    if (fromId) used.add(Number(fromId[1]));
    const fromLabel = new RegExp(`^${label} (\\d+)$`).exec(device.label ?? '');
    if (fromLabel) used.add(Number(fromLabel[1]));
  }
  let n = 1;
  while (used.has(n) || scenario.devices.some((device) => device.id === `${prefix}${n}`)) n += 1;
  return n;
}

/** Adresses MAC libres, de la forme 02:00:00:00:xx:yy (adresses « administrées localement »). */
function macAllocator(scenario) {
  const used = new Set(scenario.devices.flatMap((device) => device.interfaces.map((itf) => itf.mac?.toLowerCase()).filter(Boolean)));
  let counter = 0x100;
  return () => {
    let mac;
    do {
      counter += 1;
      mac = `02:00:00:00:${((counter >> 8) & 0xff).toString(16).padStart(2, '0')}:${(counter & 0xff).toString(16).padStart(2, '0')}`;
    } while (used.has(mac));
    used.add(mac);
    return mac;
  };
}

/**
 * Ajoute un équipement d'un modèle du catalogue, avec toutes les interfaces du modèle.
 * @param {{ model: string, position?: [number, number, number], label?: string }} options
 * @returns {{ scenario: object, id: string }}
 */
export function addDevice(scenario, { model, position = [0, 0, 0], label }) {
  const definition = MODELS[model];
  if (!definition) throw new BuilderError(`Modèle « ${model} » inconnu.`);
  const result = copy(scenario);
  const type = definition.type;
  const naming = TYPE_NAMING[type];
  const n = nextNumber(result, type);
  const id = `${naming.prefix}${n}`;
  const nextMac = macAllocator(result);
  const interfaces = modelPorts(definition).map((port, i) => {
    const itf = { name: naming.interface(i) };
    if (type !== 'switch') itf.mac = nextMac(); // un port de switch n'a pas d'adresse MAC propre
    return itf;
  });
  const device = { id, type, label: label ?? `${naming.label} ${n}`, model, position: position.map((value) => Number(value) || 0), interfaces };
  result.devices.push(device);
  return { scenario: result, id };
}

export function moveDevice(scenario, id, position) {
  const result = copy(scenario);
  const device = deviceOrThrow(result, id);
  if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite)) throw new BuilderError('Position invalide.');
  device.position = [...position];
  return result;
}

export function renameDevice(scenario, id, label) {
  const name = String(label ?? '').trim();
  if (!name) throw new BuilderError('Le nom ne peut pas être vide.');
  if (name.length > MAX_LABEL) throw new BuilderError(`Le nom ne doit pas dépasser ${MAX_LABEL} caractères.`);
  const result = copy(scenario);
  const device = deviceOrThrow(result, id);
  if (result.devices.some((other) => other !== device && (other.label ?? other.id) === name)) {
    throw new BuilderError(`Un autre équipement s'appelle déjà « ${name} ».`);
  }
  device.label = name;
  return result;
}

/** Retire un équipement et ses câbles. */
export function removeDevice(scenario, id) {
  const result = copy(scenario);
  deviceOrThrow(result, id);
  result.devices = result.devices.filter((device) => device.id !== id);
  result.links = result.links.filter((link) => parseEndpoint(link.a)?.device !== id && parseEndpoint(link.b)?.device !== id);
  return result;
}

const endpointsOf = (scenario) => new Set(scenario.links.flatMap((link) => [link.a, link.b]));

/** Interfaces libres (sans câble) d'un équipement, dans l'ordre. */
export function freePorts(scenario, id) {
  const device = deviceOrThrow(scenario, id);
  const used = endpointsOf(scenario);
  return device.interfaces.filter((itf) => !used.has(`${id}:${itf.name}`)).map((itf) => itf.name);
}

/** Prochain identifiant de lien libre : l1, l2… */
function nextLinkId(scenario) {
  let n = 1;
  while (scenario.links.some((link) => link.id === `l${n}`)) n += 1;
  return `l${n}`;
}

/**
 * Relie deux ports libres.
 * @param {{ a: string, b: string, cable?: string }} options a et b : 'équipement:interface'
 * @returns {{ scenario: object, id: string }}
 */
export function connect(scenario, { a, b, cable = 'cuivre-cat6' }) {
  const ends = [parseEndpoint(a), parseEndpoint(b)];
  if (ends.some((end) => !end)) throw new BuilderError('Choisissez un port à chaque bout du câble.');
  if (ends[0].device === ends[1].device) throw new BuilderError('Un câble relie deux équipements différents.');
  for (const end of ends) {
    const device = deviceOrThrow(scenario, end.device);
    if (!device.interfaces.some((itf) => itf.name === end.interface)) throw new BuilderError(`${device.label ?? device.id} n'a pas de port « ${end.interface} ».`);
  }
  const used = endpointsOf(scenario);
  for (const end of ends) {
    if (used.has(`${end.device}:${end.interface}`)) {
      const device = deviceOrThrow(scenario, end.device);
      throw new BuilderError(`Le port ${end.interface} de ${device.label ?? device.id} est déjà relié.`);
    }
  }
  if (!CABLES[cable]) throw new BuilderError(`Câble « ${cable} » inconnu.`);
  const result = copy(scenario);
  const id = nextLinkId(result);
  result.links.push({ id, a, b, cable });
  return { scenario: result, id };
}

export function disconnect(scenario, linkId) {
  if (!scenario.links.some((link) => link.id === linkId)) throw new BuilderError(`Câble « ${linkId} » introuvable.`);
  const result = copy(scenario);
  result.links = result.links.filter((link) => link.id !== linkId);
  return result;
}

/** Modèles du catalogue groupés par type, pour la palette : [{ type, label, models: [{ id, name, reference }] }]. */
export function palette() {
  return Object.entries(TYPE_NAMING).map(([type, naming]) => ({
    type,
    label: naming.label,
    models: Object.entries(MODELS).filter(([, model]) => model.type === type).map(([id, model]) => ({ id, name: model.name, reference: model.reference })),
  }));
}
