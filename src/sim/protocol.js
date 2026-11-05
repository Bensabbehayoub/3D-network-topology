// Khalil (S1) : interface qu'un protocole doit fournir, et contexte que le moteur lui donne.
//
// CONTRAT D'ÉQUIPE, figé en S1. Documentation : docs/simulation/contrats.md
//
// Un protocole = un fichier src/sim/protocols/<nom>.js dont l'export par défaut est :
//
//   export default {
//     name: 'icmp',                         // = nom du fichier = champ "protocol" du scénario
//     start(ctx) { ... },                   // appelé au chargement et à chaque réinitialisation
//     onReceive(device, packet, ctx) { ... }, // appelé à chaque réception sur un équipement
//     describe(packet) { return [...]; },   // champs affichés par l'inspecteur
//   };
//
// Le protocole ne connaît ni le temps réel, ni la 3D, ni l'interface : il n'agit que par ctx.
// Il est donc testable sous Node sans navigateur.

/**
 * Contexte donné par le moteur à start() et onReceive().
 *
 * @typedef {object} ProtocolContext
 * @property {object} scenario le scénario chargé (lecture seule)
 * @property {Record<string, any>} params paramètres de lancement (ex. { source: 'pc1', target: 'pc2' }),
 *   fusion de scenario.params et des paramètres passés à load()
 * @property {() => number} now instant simulé courant (ms)
 * @property {(id: string) => object} device l'équipement du scénario (erreur s'il n'existe pas)
 * @property {(deviceId: string) => Record<string, any>} memory mémoire propre à un équipement pour ce
 *   protocole (cache ARP, table de baux DHCP...) ; vidée à chaque réinitialisation
 * @property {(deviceId: string, packet: import('./events.js').Packet,
 *   options?: { interface?: string, step?: string, delay?: number }) => void} send
 *   émet un paquet par une interface de l'équipement (par défaut sa seule interface reliée).
 *   Le moteur publie l'envoi, puis la réception à l'autre bout du lien après sa latence.
 *   `delay` retarde l'émission (ms simulées) ; `step` relie le message à une étape du scénario.
 * @property {(deviceId: string, packet: import('./events.js').Packet, reason: string,
 *   options?: { step?: string }) => void} drop publie la perte d'un paquet sur un équipement
 * @property {(stepId: string) => void} explain affiche l'explication d'une étape (scenario.steps)
 * @property {(delay: number, action: () => void) => void} schedule exécute une action plus tard (ms simulées)
 * @property {() => string} nextPacketId fabrique un id de paquet unique ('p1', 'p2'...)
 */

/**
 * Une ligne de l'inspecteur de paquets.
 * @typedef {{ layer: string, field: string, value: string }} PacketField
 */

const NAME = /^[a-z][a-z0-9-]*$/;

/**
 * Vérifie qu'un objet respecte l'interface protocole.
 * @param {unknown} protocol
 * @returns {string[]} liste des problèmes (vide si conforme)
 */
export function checkProtocol(protocol) {
  const errors = [];
  if (!protocol || typeof protocol !== 'object') return ['le protocole doit être un objet (export default)'];
  if (typeof protocol.name !== 'string' || !NAME.test(protocol.name)) {
    errors.push('name : chaîne en minuscules attendue (ex. "arp")');
  }
  for (const method of ['start', 'onReceive', 'describe']) {
    if (typeof protocol[method] !== 'function') errors.push(`${method} : fonction attendue`);
  }
  return errors;
}

/**
 * Charge dynamiquement src/sim/protocols/<name>.js (aucun registre commun à modifier).
 * @param {string} name valeur du champ "protocol" du scénario
 */
export async function loadProtocol(name) {
  if (typeof name !== 'string' || !NAME.test(name)) throw new Error(`nom de protocole invalide : "${name}"`);
  const module = await import(new URL(`./protocols/${name}.js`, import.meta.url).href);
  const protocol = module.default;
  const errors = checkProtocol(protocol);
  if (errors.length) throw new Error(`protocole "${name}" non conforme : ${errors.join(' ; ')}`);
  if (protocol.name !== name) throw new Error(`protocole "${name}" : name vaut "${protocol.name}"`);
  return protocol;
}

/**
 * Champs communs Ethernet / IP / transport, prêts pour l'inspecteur.
 * Un protocole peut s'en servir dans describe() puis ajouter ses propres champs :
 *
 *   describe(packet) {
 *     return [...describeHeaders(packet), { layer: 'ARP', field: 'Opération', value: 'requête' }];
 *   }
 *
 * @param {import('./events.js').Packet} packet
 * @returns {PacketField[]}
 */
export function describeHeaders(packet) {
  const fields = [
    { layer: 'Paquet', field: 'Protocole', value: packet.protocol.toUpperCase() },
    { layer: 'Paquet', field: 'Type', value: packet.type },
  ];
  if (packet.eth) {
    fields.push(
      { layer: 'Ethernet', field: 'MAC source', value: packet.eth.src },
      { layer: 'Ethernet', field: 'MAC destination', value: packet.eth.dst },
    );
  }
  if (packet.ip) {
    fields.push(
      { layer: 'IP', field: 'IP source', value: packet.ip.src },
      { layer: 'IP', field: 'IP destination', value: packet.ip.dst },
      { layer: 'IP', field: 'TTL', value: String(packet.ip.ttl) },
    );
  }
  if (packet.transport) {
    fields.push(
      { layer: 'Transport', field: 'Port source', value: String(packet.transport.src) },
      { layer: 'Transport', field: 'Port destination', value: String(packet.transport.dst) },
    );
    if (packet.transport.flags?.length) {
      fields.push({ layer: 'Transport', field: 'Indicateurs', value: packet.transport.flags.join(', ') });
    }
  }
  return fields;
}
