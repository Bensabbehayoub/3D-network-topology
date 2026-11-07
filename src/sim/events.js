// Khalil (S1) : format d'évènement réseau et bus Observer.
//
// CONTRAT D'ÉQUIPE, figé en S1. Toute modification passe par une pull request relue par les quatre.
// Documentation complète : docs/simulation/contrats.md
//
// Le moteur publie tout ce qui se passe sur un seul bus. Les autres pôles s'abonnent
// (patron Observer) et ne modifient jamais le moteur :
// - render / packetAnimator (Ayoub) : TOPICS.NETWORK, TOPICS.TICK, TOPICS.RESET
// - ui (Ramy) : TOPICS.STATE (boutons), TOPICS.STEP (explications), TOPICS.NETWORK (journal)
// - render (Aziz) : TOPICS.SCENARIO (construire la topologie)

/** Sujets du bus. Toujours utiliser ces constantes, jamais les chaînes à la main. */
export const TOPICS = Object.freeze({
  /** Un scénario vient d'être chargé. Charge utile : { scenario, params }. */
  SCENARIO: 'scenario',
  /** Un évènement réseau (envoi, réception, perte). Charge utile : NetworkEvent. */
  NETWORK: 'network',
  /** Une étape pédagogique commence. Charge utile : { time, step, title, text }. */
  STEP: 'step',
  /** L'horloge simulée a avancé. Charge utile : { time }. */
  TICK: 'tick',
  /** L'état de la simulation a changé. Charge utile : SimulationState (voir commands.js). */
  STATE: 'state',
  /** La simulation repart de zéro : effacer paquets, journal et explications. Charge utile : { time: 0 }. */
  RESET: 'reset',
});

/** Types d'évènements réseau. */
export const EVENT_TYPES = Object.freeze({
  /** Le paquet quitte `source` par le lien `link` ; il arrivera à `arrival`. */
  SEND: 'send',
  /** Le paquet arrive sur `destination`. */
  RECEIVE: 'receive',
  /** Le paquet est perdu ou jeté (TTL nul, pas de route, lien absent...) ; voir `reason`. */
  DROP: 'drop',
});

const TYPES = new Set(Object.values(EVENT_TYPES));

/**
 * Paquet simulé. Seuls `id`, `protocol` et `type` sont obligatoires ; les en-têtes absents
 * valent null (par exemple pas d'en-tête IP pour ARP).
 *
 * @typedef {object} Packet
 * @property {string} id identifiant unique dans la simulation ('p1', 'p2'...)
 * @property {string} protocol nom du protocole ('arp', 'icmp'...) : choisit couleur et describe()
 * @property {string} type type de message propre au protocole ('request', 'reply', 'syn'...)
 * @property {{ src: string, dst: string } | null} [eth] couche 2 : adresses MAC (dst 'ff:ff:ff:ff:ff:ff' = broadcast)
 * @property {{ src: string, dst: string, ttl: number } | null} [ip] couche 3
 * @property {{ src: number, dst: number, flags?: string[] } | null} [transport] couche 4 : ports, indicateurs TCP
 * @property {object} [data] contenu simplifié propre au protocole (lu seulement par son describe())
 */

/**
 * Évènement réseau publié sur TOPICS.NETWORK. Objet gelé : ne jamais le modifier.
 *
 * @typedef {object} NetworkEvent
 * @property {number} id numéro croissant, unique dans une exécution
 * @property {number} time instant simulé, en millisecondes
 * @property {'send'|'receive'|'drop'} type
 * @property {string|null} source équipement émetteur
 * @property {string|null} sourceInterface interface de sortie
 * @property {string|null} destination équipement récepteur (null pour une perte sur place)
 * @property {string|null} destinationInterface interface d'arrivée
 * @property {string|null} link id du lien emprunté
 * @property {number|null} arrival instant d'arrivée prévu (send seulement) : permet d'animer le trajet
 * @property {Packet} packet
 * @property {string|null} step id de l'étape pédagogique (scenario.steps[].id) liée à ce message
 * @property {string|null} reason raison de la perte (drop seulement)
 */

/**
 * Construit un évènement réseau valide et gelé.
 * @param {Partial<NetworkEvent> & { id: number, time: number, type: string, packet: Packet }} fields
 * @returns {Readonly<NetworkEvent>}
 */
export function createEvent(fields) {
  const { id, time, type, packet } = fields;
  if (!Number.isInteger(id)) throw new TypeError('évènement : id entier attendu');
  if (!Number.isFinite(time) || time < 0) throw new TypeError(`évènement ${id} : time doit être un nombre ≥ 0`);
  if (!TYPES.has(type)) throw new TypeError(`évènement ${id} : type inconnu "${type}"`);
  assertPacket(packet);
  if (type === EVENT_TYPES.SEND && !(Number.isFinite(fields.arrival) && fields.arrival >= time)) {
    throw new TypeError(`évènement ${id} : un envoi doit préciser arrival ≥ time`);
  }

  return Object.freeze({
    id,
    time,
    type,
    source: fields.source ?? null,
    sourceInterface: fields.sourceInterface ?? null,
    destination: fields.destination ?? null,
    destinationInterface: fields.destinationInterface ?? null,
    link: fields.link ?? null,
    arrival: type === EVENT_TYPES.SEND ? fields.arrival : null,
    packet,
    step: fields.step ?? null,
    reason: type === EVENT_TYPES.DROP ? (fields.reason ?? 'inconnue') : null,
  });
}

/**
 * Vérifie le minimum exigé d'un paquet.
 * @param {unknown} packet
 */
export function assertPacket(packet) {
  if (!packet || typeof packet !== 'object') throw new TypeError('paquet manquant');
  for (const key of ['id', 'protocol', 'type']) {
    if (typeof packet[key] !== 'string' || packet[key] === '') {
      throw new TypeError(`paquet : champ "${key}" (chaîne non vide) obligatoire`);
    }
  }
}

/** Adresse MAC de diffusion. */
export const BROADCAST_MAC = 'ff:ff:ff:ff:ff:ff';

/**
 * @param {Packet} packet
 * @returns {boolean} vrai si le paquet est diffusé à tout le segment (couleur/aspect différents au rendu)
 */
export function isBroadcast(packet) {
  return packet?.eth?.dst?.toLowerCase() === BROADCAST_MAC;
}

/**
 * Bus d'évènements (patron Observer).
 *
 * - on(topic, listener) renvoie une fonction de désabonnement ;
 * - un abonné qui lève une erreur n'empêche pas les autres d'être prévenus ;
 * - les abonnés sont appelés dans l'ordre d'abonnement, de façon synchrone.
 */
export function createBus() {
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();
  const known = new Set(Object.values(TOPICS));

  function check(topic) {
    if (!known.has(topic)) throw new TypeError(`bus : sujet inconnu "${topic}" (voir TOPICS)`);
  }

  return {
    /**
     * @param {string} topic une valeur de TOPICS
     * @param {(payload: any) => void} listener
     * @returns {() => void} désabonnement
     */
    on(topic, listener) {
      check(topic);
      if (typeof listener !== 'function') throw new TypeError('bus : listener doit être une fonction');
      if (!listeners.has(topic)) listeners.set(topic, new Set());
      listeners.get(topic).add(listener);
      return () => listeners.get(topic)?.delete(listener);
    },

    /** Abonnement à un seul message. */
    once(topic, listener) {
      const off = this.on(topic, (payload) => {
        off();
        listener(payload);
      });
      return off;
    },

    off(topic, listener) {
      listeners.get(topic)?.delete(listener);
    },

    emit(topic, payload) {
      check(topic);
      // Copie : un abonné peut se désabonner pendant l'envoi.
      for (const listener of [...(listeners.get(topic) ?? [])]) {
        try {
          listener(payload);
        } catch (error) {
          console.error(`bus : un abonné à "${topic}" a échoué :`, error);
        }
      }
    },

    /** Nombre d'abonnés (utile aux tests). */
    count(topic) {
      return listeners.get(topic)?.size ?? 0;
    },

    clear() {
      listeners.clear();
    },
  };
}
