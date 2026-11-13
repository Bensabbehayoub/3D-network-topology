// Ramy : inspecteur.
// S2 (tâche 19) : infos de l'équipement sélectionné (nom, type, interfaces avec IP et MAC,
//      passerelle), mises à jour à chaque changement de la sélection (selection.onChange).
// Phase 4d : paquet sélectionné (dans le journal ou dans la scène) : instant, trajet, étape et
//      champs de chaque couche, fournis par son protocole (app.sim.describe, voir packets.js).
//
// Les valeurs viennent des scénarios : elles sont écrites avec textContent, jamais innerHTML.
//
// Découpage pour les tests sous Node (pas de DOM) :
//   findDevice()        cherche l'équipement dans le scénario du moteur, sinon dans la scène 3D
//   deviceInfo()        lignes à afficher pour un équipement (pur)
//   describeSelection() ce que le panneau doit afficher pour un id sélectionné (pur)
//   renderDeviceInfo()  construit les éléments à partir d'un document (vrai ou faux)
//   renderPacketInfo()  idem pour un paquet (vue calculée par packets.js → packetView)

import { packetView } from './packets.js';
import { datasheetView } from './datasheet.js';
import { TOPICS } from '../../simulation.js';

/** Intervalle minimal (ms réelles) entre deux mises à jour des débits de la fiche. */
export const LIVE_REFRESH = 250;

/** Message affiché tant qu'aucun paquet n'est sélectionné. */
export const PACKET_HINT = 'Choisissez un message dans le journal, ou cliquez sur un paquet dans la scène (plus facile en pause), pour voir ses champs : MAC, IP, TTL, ports, données…';

/** Libellés des types d'équipements (format des scénarios, plus « pc » de la scène de secours). */
export const TYPE_LABELS = Object.freeze({
  host: 'Ordinateur',
  pc: 'Ordinateur',
  server: 'Serveur',
  switch: 'Switch',
  router: 'Routeur',
});

/** Valeur affichée quand un champ manque (ex. client DHCP sans adresse, port de switch sans MAC). */
export const MISSING = '—';

const text = (value) => (value === undefined || value === null || value === '' ? MISSING : String(value));

/**
 * Cherche un équipement : d'abord dans le scénario du moteur (toutes les interfaces), sinon
 * dans la scène 3D (forme simplifiée du rendu : une seule IP et une seule MAC, sans passerelle).
 * @returns {{ device: object, source: 'scenario' | 'render' } | null}
 */
export function findDevice(app, id) {
  if (typeof id !== 'string' || id === '') return null;

  let devices = null;
  try {
    devices = app?.sim?.getScenario?.()?.devices ?? null;
  } catch {
    devices = null;
  }
  const fromScenario = Array.isArray(devices) ? devices.find((device) => device?.id === id) : null;
  if (fromScenario) return { device: fromScenario, source: 'scenario' };

  let fromRender = null;
  try {
    fromRender = typeof app?.render?.getDevice === 'function' ? app.render.getDevice(id) : null;
  } catch {
    fromRender = null;
  }
  if (!fromRender) return null;
  const hasAddress = Boolean(fromRender.ip || fromRender.mac);
  return {
    source: 'render',
    device: {
      id: fromRender.id ?? id,
      type: fromRender.type,
      label: fromRender.label,
      interfaces: hasAddress ? [{ name: null, ip: fromRender.ip, mac: fromRender.mac }] : [],
    },
  };
}

/**
 * Lignes d'infos d'un équipement (fonction pure).
 * @param {object} device équipement au format des scénarios
 * @returns {{ id: string, title: string, props: Array<{ label: string, value: string }>,
 *   interfaces: Array<{ name: string, ip: string, mac: string }> }}
 */
export function deviceInfo(device) {
  const id = text(device?.id);
  const title = device?.label ? String(device.label) : id;
  const type = device?.type ? String(device.type) : '';
  const props = [
    { label: 'Type', value: TYPE_LABELS[type] ?? text(type) },
    { label: 'Identifiant', value: id },
  ];
  if (device?.gateway) props.push({ label: 'Passerelle', value: String(device.gateway) });

  const interfaces = (Array.isArray(device?.interfaces) ? device.interfaces : [])
    .filter((itf) => itf && typeof itf === 'object')
    .map((itf) => ({ name: text(itf.name), ip: text(itf.ip), mac: text(itf.mac) }));

  return { id, title, props, interfaces };
}

/**
 * Ce que le panneau affiche pour la sélection courante.
 * @returns {null | { id: string, found: false } | { id: string, found: true, source: string, info: ReturnType<typeof deviceInfo> }}
 */
export function describeSelection(app, id) {
  if (id === null || id === undefined) return null;
  const match = findDevice(app, id);
  if (!match) return { id: String(id), found: false };
  return { id, found: true, source: match.source, info: deviceInfo(match.device), sheet: datasheetView(app, id) };
}

/**
 * Construit le bloc d'infos (textContent uniquement).
 * @param {{ createElement(tag: string): object }} doc document du navigateur, ou faux document en test
 * @param {NonNullable<ReturnType<typeof describeSelection>>} view
 */
export function renderDeviceInfo(doc, view) {
  const el = (tag, className, content) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };

  const root = el('div', 'device-info');
  if (!view.found) {
    root.append(el('p', 'placeholder', `Équipement « ${view.id} » introuvable dans le scénario.`));
    return root;
  }

  const { info, sheet } = view;
  root.append(el('h3', 'device-title', info.title));
  if (sheet?.model) root.append(el('p', 'device-model', `${sheet.model.name} · ${sheet.model.reference}`));

  const props = el('dl', 'device-props');
  for (const { label, value } of info.props) props.append(el('dt', '', label), el('dd', '', value));
  root.append(props);

  if (sheet?.specs?.length) {
    // Repliées par défaut : les ports et les débits en direct restent visibles sans défiler.
    const details = el('details', 'device-specs');
    details.append(el('summary', 'device-section', 'Caractéristiques du modèle'));
    if (sheet.model.description) details.append(el('p', 'device-description', sheet.model.description));
    const specs = el('dl', 'device-props');
    for (const { label, value } of sheet.specs) specs.append(el('dt', '', label), el('dd', '', value));
    details.append(specs);
    root.append(details);
  }

  // Un switch n'a ni IP ni MAC sur ses ports : le tableau des adresses ne lui sert à rien.
  const addressed = info.interfaces.some((itf) => itf.ip !== MISSING || itf.mac !== MISSING);
  if (info.interfaces.length === 0) {
    root.append(el('p', 'placeholder', 'Aucune interface décrite.'));
  } else if (addressed || !sheet) {
    const table = el('table', 'device-interfaces');
    table.append(el('caption', 'sr-only', `Interfaces de ${info.title}`));
    const head = el('thead');
    const headRow = el('tr');
    for (const label of ['Interface', 'Adresse IP', 'Adresse MAC']) {
      const th = el('th', '', label);
      th.setAttribute('scope', 'col');
      headRow.append(th);
    }
    head.append(headRow);
    const body = el('tbody');
    for (const itf of info.interfaces) {
      const row = el('tr');
      row.append(el('td', '', itf.name), el('td', 'mono', itf.ip), el('td', 'mono', itf.mac));
      body.append(row);
    }
    table.append(head, body);
    root.append(table);
  }

  if (sheet) root.append(renderPorts(doc, sheet, info.title));

  if (view.source === 'render') {
    root.append(el('p', 'device-note', 'Infos partielles : scénario du moteur indisponible.'));
  }
  return root;
}

/** Barre d'utilisation : décorative, le pourcentage est écrit à côté. */
function meter(doc, ratio, level) {
  const bar = doc.createElement('span');
  bar.className = `load-bar load-${level}`;
  bar.setAttribute('aria-hidden', 'true');
  const fill = doc.createElement('span');
  fill.className = 'load-fill';
  fill.style?.setProperty?.('--load', `${Math.round(Math.min(1, ratio) * 100)}%`);
  bar.append(fill);
  return bar;
}

/** Tableau des ports et débit global (phase 5), mis à jour pendant la simulation. */
export function renderPorts(doc, sheet, title) {
  const el = (tag, className, content) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const root = el('div', 'device-live');
  root.append(el('h4', 'device-section', 'Ports'));
  const table = el('table', 'device-ports');
  table.append(el('caption', 'sr-only', `Ports de ${title} : vitesse, équipement relié, débit et charge`));
  const headRow = el('tr');
  for (const label of ['Port', 'Vitesse', 'Relié à', 'Débit', 'Charge']) {
    const th = el('th', '', label);
    th.setAttribute('scope', 'col');
    headRow.append(th);
  }
  const head = el('thead');
  head.append(headRow);
  const body = el('tbody');
  for (const port of sheet.ports) {
    const row = el('tr', port.state === 'libre' ? 'port-free' : '');
    const speed = el('td', '', port.speed);
    if (port.negotiated) speed.append(el('span', 'port-negotiated', ` (${port.negotiated} négocié)`));
    const peer = el('td', '', port.peer);
    if (port.cable) peer.append(el('span', 'port-cable', port.cable));
    const rate = el('td', 'port-rate');
    for (const [arrow, label, value] of [['↑', 'émis', port.sent], ['↓', 'reçu', port.received]]) {
      const line = el('span', 'mono');
      const icon = el('span', '', `${arrow} `);
      icon.setAttribute('aria-hidden', 'true');
      line.append(icon, el('span', 'sr-only', `${label} `), el('span', '', value));
      rate.append(line);
    }
    const load = el('td', 'port-load');
    load.append(meter(doc, port.utilization, port.level), el('span', 'load-text', port.percent));
    row.append(el('td', 'mono', port.name), speed, peer, rate, load);
    body.append(row);
  }
  table.append(head, body);
  root.append(table);
  root.append(el('p', 'device-note', 'Débit : ↑ émis par le port, ↓ reçu. Charge : utilisation du lien.'));
  if (sheet.freePorts > 0) root.append(el('p', 'device-note', `${sheet.freePorts} port${sheet.freePorts > 1 ? 's' : ''} libre${sheet.freePorts > 1 ? 's' : ''} au total sur l'équipement.`));

  if (sheet.totals) {
    root.append(el('h4', 'device-section', 'Débit global'));
    const totals = el('dl', 'device-props');
    const load = el('dd', 'port-load');
    load.append(meter(doc, sheet.totals.utilization, sheet.totals.level), el('span', 'load-text', sheet.totals.percent));
    totals.append(
      el('dt', '', 'Débit actuel'), el('dd', 'mono', sheet.totals.current),
      el('dt', '', 'Débit moyen'), el('dd', 'mono', sheet.totals.average),
      el('dt', '', 'Bande passante globale'), el('dd', 'mono', `${sheet.totals.bandwidth} (ports reliés, duplex)`),
      el('dt', '', 'Charge'), load,
    );
    root.append(totals);
  }
  if (sheet.note) root.append(el('p', 'device-note', sheet.note));
  return root;
}

/**
 * Construit le bloc d'un paquet (textContent uniquement).
 * @param {{ createElement(tag: string): object }} doc
 * @param {NonNullable<ReturnType<typeof packetView>>} view
 */
export function renderPacketInfo(doc, view) {
  const el = (tag, className, content) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const root = el('div', 'packet-info');
  root.append(el('h3', 'device-title', view.title));
  const meta = el('dl', 'device-props');
  for (const { label, value } of view.meta) meta.append(el('dt', '', label), el('dd', '', value));
  root.append(meta);
  for (const { layer, fields } of view.layers) {
    const table = el('table', 'packet-layer');
    table.append(el('caption', 'packet-layer-name', layer));
    const body = el('tbody');
    for (const { field, value } of fields) {
      const row = el('tr');
      const th = el('th', '', field);
      th.setAttribute('scope', 'row');
      row.append(th, el('td', 'mono', value));
      body.append(row);
    }
    table.append(body);
    root.append(table);
  }
  return root;
}

const TEMPLATE = `
  <section class="inspector-device" data-role="device" aria-label="Équipement sélectionné" aria-live="polite" hidden></section>
  <section class="inspector-packet" data-role="packet" aria-label="Paquet sélectionné" aria-live="polite">
    <p class="placeholder" data-role="packet-hint"></p>
  </section>
`;

/**
 * @param {object} container élément #inspector (sous Node : un faux conteneur { innerHTML })
 * @param {object} app objet partagé (app.sim, app.render)
 * @param {{ selection?: { onChange(listener): () => void, getSelection(): string | null } }} [services]
 *   services du pôle ui (index.js) ; sans sélection, le panneau garde son message d'attente
 * @returns {object} API du module : getView(), refresh(), destroy()
 */
export function mount(container, app, { selection, packets } = {}) {
  container.innerHTML = TEMPLATE;

  const hasDom = typeof container.querySelector === 'function';
  const slot = hasDom ? container.querySelector('[data-role="device"]') : null;
  const packetSlot = hasDom ? container.querySelector('[data-role="packet"]') : null;
  const doc = container.ownerDocument ?? globalThis.document;
  let view = null;
  let packet = null;

  const showPacket = (eventId) => {
    packet = eventId === null || eventId === undefined ? null : packetView(app, eventId);
    if (!packetSlot) return;
    if (packet) {
      packetSlot.replaceChildren(renderPacketInfo(doc, packet));
      packetSlot.scrollIntoView?.({ block: 'nearest' });
    } else {
      const hint = doc.createElement('p');
      hint.className = 'placeholder';
      hint.textContent = PACKET_HINT;
      packetSlot.replaceChildren(hint);
    }
  };

  const show = (id) => {
    view = describeSelection(app, id);
    if (!slot) return;
    if (view === null) {
      slot.replaceChildren();
      slot.hidden = true;
    } else {
      slot.replaceChildren(renderDeviceInfo(doc, view));
      slot.hidden = false;
    }
  };

  const canListen = typeof selection?.onChange === 'function';
  const off = canListen ? selection.onChange((id) => show(id)) : null;
  show(canListen ? selection.getSelection?.() ?? null : null);

  // Débits en direct : la fiche est recalculée pendant la lecture, au plus toutes les LIVE_REFRESH ms.
  let lastRefresh = 0;
  const live = () => {
    const id = canListen ? selection.getSelection?.() ?? null : null;
    if (id === null) return;
    const now = globalThis.performance?.now?.() ?? Date.now();
    if (now - lastRefresh < LIVE_REFRESH) return;
    lastRefresh = now;
    const scroll = container.scrollTop;
    show(id);
    container.scrollTop = scroll;
  };
  const offLive = typeof app?.sim?.on === 'function'
    ? [app.sim.on(TOPICS.TICK, live), app.sim.on(TOPICS.RESET, () => { lastRefresh = 0; live(); })]
    : [];
  const offPacket = typeof packets?.onChange === 'function' ? packets.onChange((eventId) => showPacket(eventId)) : null;
  showPacket(packets?.get?.() ?? null);

  return {
    getView: () => view,
    getPacketView: () => packet,
    refresh: () => show(canListen ? selection.getSelection?.() ?? null : null),
    destroy: () => {
      off?.();
      offPacket?.();
      offLive.forEach((stop) => stop?.());
    },
  };
}
