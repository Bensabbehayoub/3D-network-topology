// Ramy (phase 4d) : paquets côté interface — sélection d'un paquet, lignes du journal, vue de
// l'inspecteur. Fonctions pures et petit état, sans DOM : testés sous Node.
//
// Un paquet se sélectionne par l'id de son évènement d'envoi (event.id) : depuis le journal
// (explanations.js) ou par un clic sur un paquet en vol dans la scène (évènement
// 'topology:packet-selected' du pôle render). L'inspecteur affiche alors son trajet et ses champs,
// fournis par le protocole lui-même (app.sim.describe(packet)), et la scène le met en avant
// (app.render.highlightPacket).

import { TOPICS } from '../../simulation.js';
import { formatTime } from './controls.js';

export const PACKET_SELECTED_EVENT = 'topology:packet-selected';

/** Types de paquets en français (les autres sont affichés tels quels). */
export const PACKET_TYPE_LABELS = Object.freeze({
  request: 'requête',
  reply: 'réponse',
  response: 'réponse',
  query: 'requête',
  'echo-request': 'requête d\'écho',
  'echo-reply': 'réponse d\'écho',
  'time-exceeded': 'TTL expiré',
  unreachable: 'destination inaccessible',
  datagram: 'datagramme',
  discover: 'DISCOVER',
  offer: 'OFFER',
  ack: 'ACK',
  syn: 'SYN',
  'syn-ack': 'SYN-ACK',
  fin: 'FIN',
  'fin-ack': 'FIN-ACK',
  rst: 'RST',
  data: 'données',
});

/** « ARP requête », « DHCP DISCOVER », « HTTP réponse »… */
export function packetLabel(packet) {
  const protocol = String(packet?.protocol ?? '?').toUpperCase();
  const type = String(packet?.type ?? '');
  // REQUEST de DHCP (et non « requête ») : les quatre messages DHCP gardent leur nom.
  const label = packet?.protocol === 'dhcp' ? type.toUpperCase() : PACKET_TYPE_LABELS[type] ?? type;
  return `${protocol} ${label}`.trim();
}

/** Nom affiché d'un équipement : son libellé dans le scénario, sinon son id. */
export function deviceName(scenario, id) {
  if (!id) return '—';
  const device = scenario?.devices?.find((candidate) => candidate.id === id);
  return device?.label ?? id;
}

/**
 * Ligne du journal pour un évènement réseau (envoi ou perte ; les réceptions ne sont pas listées).
 * @returns {null | { eventId: number, kind: 'send' | 'drop', time: string, label: string, route: string,
 *   protocol: string, broadcast: boolean, reason: string | null }}
 */
export function logEntry(event, scenario) {
  if (!event || (event.type !== 'send' && event.type !== 'drop')) return null;
  const broadcast = event.packet?.eth?.dst?.toLowerCase() === 'ff:ff:ff:ff:ff:ff';
  const from = deviceName(scenario, event.source);
  const route = event.type === 'drop' ? `perdu sur ${from}` : `${from} → ${deviceName(scenario, event.destination)}`;
  return {
    eventId: event.id,
    kind: event.type,
    time: formatTime(event.time),
    label: packetLabel(event.packet),
    route,
    protocol: String(event.packet?.protocol ?? ''),
    broadcast,
    reason: event.type === 'drop' ? event.reason : null,
  };
}

/** Évènement d'id donné dans l'historique du moteur, ou null. */
export function findEvent(sim, eventId) {
  let history = [];
  try {
    history = sim?.getHistory?.() ?? [];
  } catch {
    history = [];
  }
  return history.find((event) => event.id === eventId) ?? null;
}

/**
 * Ce que l'inspecteur affiche pour un paquet sélectionné.
 * @returns {null | { eventId: number, title: string, meta: Array<{ label: string, value: string }>,
 *   layers: Array<{ layer: string, fields: Array<{ field: string, value: string }> }> }}
 */
export function packetView(app, eventId) {
  const sim = app?.sim;
  const event = findEvent(sim, eventId);
  if (!event) return null;
  const scenario = sim.getScenario?.() ?? null;
  const step = scenario?.steps?.find((candidate) => candidate.id === event.step);
  const interfaceOf = (device, name) => (name ? `${deviceName(scenario, device)} (${name})` : deviceName(scenario, device));
  const meta = [{ label: 'Instant', value: formatTime(event.time) }];
  if (event.type === 'drop') {
    meta.push({ label: 'Perdu sur', value: deviceName(scenario, event.source) }, { label: 'Raison', value: String(event.reason ?? '') });
  } else {
    meta.push(
      { label: 'De', value: interfaceOf(event.source, event.sourceInterface) },
      { label: 'Vers', value: interfaceOf(event.destination, event.destinationInterface) },
      { label: 'Câble', value: `${event.link} (arrivée à ${formatTime(event.arrival)})` },
    );
  }
  if (step) meta.push({ label: 'Étape', value: step.title });

  let rows = [];
  try {
    rows = typeof sim.describe === 'function' ? sim.describe(event.packet) : [];
  } catch {
    rows = [];
  }
  const layers = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    let group = layers.find((candidate) => candidate.layer === row.layer);
    if (!group) layers.push((group = { layer: String(row.layer), fields: [] }));
    group.fields.push({ field: String(row.field), value: String(row.value) });
  }
  return { eventId: event.id, title: packetLabel(event.packet), meta, layers };
}

/**
 * Paquet sélectionné (un seul à la fois), effacé à chaque réinitialisation ou nouveau scénario.
 * @param {object} [app] app.sim (abonnement) et app.render (mise en avant dans la scène)
 */
export function createPacketSelection(app = {}) {
  let current = null;
  const listeners = new Set();
  const notify = () => {
    try {
      app.render?.highlightPacket?.(current);
    } catch {
      // la mise en avant est un confort : son échec ne bloque pas la sélection
    }
    for (const listener of [...listeners]) listener(current);
  };
  const offs = [TOPICS.RESET, TOPICS.SCENARIO].map((topic) => (typeof app.sim?.on === 'function'
    ? app.sim.on(topic, () => { if (current !== null) { current = null; notify(); } })
    : () => {}));
  return {
    select(eventId) {
      if (!Number.isInteger(eventId) || !findEvent(app.sim, eventId)) return false;
      if (current !== eventId) {
        current = eventId;
        notify();
      }
      return true;
    },
    clear() {
      if (current === null) return false;
      current = null;
      notify();
      return true;
    },
    get: () => current,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      offs.forEach((off) => off?.());
      listeners.clear();
    },
  };
}
