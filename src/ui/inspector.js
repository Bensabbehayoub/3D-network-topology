// Ramy : inspecteur.
// S2 (tâche 19) : infos de l'équipement sélectionné (nom, type, interfaces avec IP et MAC,
//      passerelle), mises à jour à chaque changement de la sélection (selection.onChange).
// S3 (tâche 28) : champs du paquet sélectionné, via app.sim.describe(packet), dans la zone
//      [data-role="packet"] gardée pour cela.
//
// Les valeurs viennent des scénarios : elles sont écrites avec textContent, jamais innerHTML.
//
// Découpage pour les tests sous Node (pas de DOM) :
//   findDevice()        cherche l'équipement dans le scénario du moteur, sinon dans la scène 3D
//   deviceInfo()        lignes à afficher pour un équipement (pur)
//   describeSelection() ce que le panneau doit afficher pour un id sélectionné (pur)
//   renderDeviceInfo()  construit les éléments à partir d'un document (vrai ou faux)

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
  return { id, found: true, source: match.source, info: deviceInfo(match.device) };
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

  const { info } = view;
  root.append(el('h3', 'device-title', info.title));

  const props = el('dl', 'device-props');
  for (const { label, value } of info.props) props.append(el('dt', '', label), el('dd', '', value));
  root.append(props);

  if (info.interfaces.length === 0) {
    root.append(el('p', 'placeholder', 'Aucune interface décrite.'));
  } else {
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

  if (view.source === 'render') {
    root.append(el('p', 'device-note', 'Infos partielles : scénario du moteur indisponible.'));
  }
  return root;
}

const TEMPLATE = `
  <section class="inspector-device" data-role="device" aria-label="Équipement sélectionné" aria-live="polite" hidden></section>
  <section class="inspector-packet" data-role="packet" aria-label="Paquet sélectionné">
    <p class="placeholder">Sélectionnez un paquet dans la scène pour afficher ses champs (MAC, IP, TTL, type…).</p>
  </section>
`;

/**
 * @param {object} container élément #inspector (sous Node : un faux conteneur { innerHTML })
 * @param {object} app objet partagé (app.sim, app.render)
 * @param {{ selection?: { onChange(listener): () => void, getSelection(): string | null } }} [services]
 *   services du pôle ui (index.js) ; sans sélection, le panneau garde son message d'attente
 * @returns {object} API du module : getView(), refresh(), destroy()
 */
export function mount(container, app, { selection } = {}) {
  container.innerHTML = TEMPLATE;

  const hasDom = typeof container.querySelector === 'function';
  const slot = hasDom ? container.querySelector('[data-role="device"]') : null;
  const doc = container.ownerDocument ?? globalThis.document;
  let view = null;

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

  return {
    getView: () => view,
    refresh: () => show(canListen ? selection.getSelection?.() ?? null : null),
    destroy: () => off?.(),
  };
}
