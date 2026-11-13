// Ramy (phase 7) : éditeur de topologie du mode « Construire ».
//
// La topologie en construction (le « brouillon ») est un scénario : chaque modification passe par
// les fonctions pures de src/sim/builder.js, puis le brouillon est rechargé dans le moteur
// (app.sim.load). Ainsi la scène 3D, les fiches d'équipement et le diagnostic (onglet
// Recommandations) suivent la construction en direct, sans code de plus.
//
// - Ajouter : choisir un modèle du catalogue, puis toucher le sol de la scène (« Placer dans la
//   scène ») ou « Ajouter au centre » (sans pointeur : clavier, lecteur d'écran).
// - Déplacer : glisser l'équipement dans la scène (évènement topology:device-moved du rendu).
// - Renommer, supprimer : équipement sélectionné (clic dans la scène).
// - Câbles : deux ports libres et un type de câble ; retirer un câble.
// - Repartir d'une topologie vide ou du scénario affiché en mode Explorer.
//
// Découpage pour les tests sous Node : createEditorController() (sans DOM), puis mount().
// Les noms viennent de l'utilisateur ou des scénarios : textContent uniquement.

import {
  addDevice, addRecord, addRoute, addService, assembleRun, BuilderError, CABLES, connect, defaultValues, disconnect, formatSpeed, freePorts,
  fromScenario, linkBandwidth, MAX_LABEL, moveDevice, newTopology, palette, parseEndpoint, proposeAddress, proposeGateway, removeDevice,
  removeRecord, removeRoute, removeService, renameDevice, ROLES, rolesOf, RUNS, runFields, setAddress, setDns, setGateway, setRole,
  TYPE_NAMING, validateRun,
} from '../../simulation.js';

export const DEFAULT_RUN = 'ping';

export const DEFAULT_MODEL = 'pc-1g';
export const DEFAULT_CABLE = 'cuivre-cat6';
export const PLACE_HINT = 'Touchez le sol de la scène à l\'endroit voulu (Échap pour annuler).';

/** Première place libre sur une grille autour du centre (3 unités entre deux équipements). */
export function freeSpot(devices, step = 3) {
  const taken = (x, z) => devices.some((device) => Math.hypot((device.position?.[0] ?? 0) - x, (device.position?.[2] ?? 0) - z) < step * 0.66);
  for (let ring = 0; ring < 20; ring += 1) {
    for (let i = -ring; i <= ring; i += 1) {
      for (const [x, z] of [[i, -ring], [i, ring], [-ring, i], [ring, i]]) {
        if (!taken(x * step, z * step)) return [x * step || 0, 0, z * step || 0]; // || 0 : pas de -0
      }
    }
  }
  return [0, 0, 0];
}

const nameOf = (scenario, id) => scenario?.devices.find((device) => device.id === id)?.label ?? id;

/** Texte d'un câble : « PC 1 (eth0) ↔ Switch 1 (p1) ». */
export function linkLabel(scenario, link) {
  const a = parseEndpoint(link.a);
  const b = parseEndpoint(link.b);
  return `${nameOf(scenario, a?.device)} (${a?.interface}) ↔ ${nameOf(scenario, b?.device)} (${b?.interface})`;
}

/**
 * @param {object} app app.sim (load, getScenario, loadScenario)
 * @param {{ onChange?(view): void, selection?: { getSelection(): string | null, select(id): boolean, clear(): boolean } }} [options]
 */
export function createEditorController(app, { onChange = () => {}, selection = null } = {}) {
  const sim = app?.sim;
  let draft = null;
  let active = false;
  let armed = null; // modèle à placer au prochain toucher du sol
  let error = null;
  let notice = null;
  let returnTo = null; // scénario affiché avant d'entrer en construction
  let launch = false; // « Jouer cette topologie » : en sortant, on charge « Ma topologie »
  let runId = DEFAULT_RUN;
  let runValues = {};

  /** Valeurs du formulaire du protocole : celles saisies, complétées par les valeurs proposées. */
  const currentValues = () => ({ ...(draft ? defaultValues(draft, runId) : {}), ...runValues });

  /** Configuration de l'équipement sélectionné (adresses, passerelle, DNS, routes, rôles, ports). */
  const configOf = (device) => {
    const linked = (itf) => draft.links.some((link) => link.a === `${device.id}:${itf.name}` || link.b === `${device.id}:${itf.name}`);
    const addressable = device.type === 'switch' ? [] : device.interfaces.filter((itf) => linked(itf) || itf.ip);
    return {
      interfaces: addressable.map((itf) => ({ name: itf.name, ip: itf.ip ?? '' })),
      host: device.type === 'host' || device.type === 'server',
      router: device.type === 'router',
      gateway: device.gateway ?? '',
      dns: device.dns ?? '',
      routes: (device.routes ?? []).map((route) => ({ ...route })),
      roles: Object.entries(ROLES).map(([id, role]) => ({ id, label: role.label, active: rolesOf(device).includes(id) })),
      services: (device.services ?? []).map((service) => ({ ...service })),
      records: device.records ? device.records.map((record) => ({ name: record.name, value: record.value })) : null,
    };
  };

  const runView = () => {
    if (!draft) return null;
    const values = currentValues();
    const check = validateRun(draft, runId, values);
    return {
      runs: RUNS.map((run) => ({ id: run.id, label: run.label })),
      runId,
      fields: runFields(draft, runId).map((field) => ({ ...field, value: values[field.key] })),
      errors: check.errors,
      warnings: check.warnings,
    };
  };

  const view = () => {
    const selectedId = selection?.getSelection?.() ?? null;
    const selected = draft?.devices.find((device) => device.id === selectedId) ?? null;
    return {
      active,
      armed,
      error,
      notice,
      title: draft?.title ?? '',
      palette: palette(),
      cables: Object.entries(CABLES).map(([id, cable]) => ({ id, label: `${cable.label} (${formatSpeed(cable.maxSpeed)} max.)` })),
      devices: (draft?.devices ?? []).map((device) => ({ id: device.id, label: device.label ?? device.id, type: device.type, typeLabel: TYPE_NAMING[device.type]?.label ?? device.type, free: freePorts(draft, device.id) })),
      links: (draft?.links ?? []).map((link) => ({
        id: link.id,
        label: linkLabel(draft, link),
        cable: CABLES[link.cable]?.label ?? 'câble non précisé',
        bandwidth: formatSpeed(linkBandwidth(draft, link)),
      })),
      selected: selected ? {
        id: selected.id,
        label: selected.label ?? selected.id,
        typeLabel: TYPE_NAMING[selected.type]?.label ?? selected.type,
        ports: selected.interfaces.map((itf) => {
          const key = `${selected.id}:${itf.name}`;
          const link = draft.links.find((candidate) => candidate.a === key || candidate.b === key);
          const peer = link ? parseEndpoint(link.a === key ? link.b : link.a) : null;
          return { name: itf.name, peer: peer ? `${nameOf(draft, peer.device)} (${peer.interface})` : null };
        }),
        config: configOf(selected),
      } : null,
      run: runView(),
    };
  };
  const notify = () => onChange(view());

  /** Applique une opération de builder.js ; recharge le brouillon dans le moteur. */
  const apply = async (operation, message) => {
    let next;
    try {
      next = operation(draft);
    } catch (cause) {
      if (!(cause instanceof BuilderError)) throw cause;
      error = cause.message;
      notice = null;
      notify();
      return false;
    }
    draft = next.scenario ?? next;
    error = null;
    notice = typeof message === 'function' ? message(next) : message;
    await sim.load(draft);
    notify();
    return next.id ?? true;
  };

  const api = {
    getView: view,
    getDraft: () => draft,
    isActive: () => active,
    /** Entre en mode Construire : brouillon existant, sinon copie du scénario affiché. */
    async enter() {
      if (active) return;
      active = true;
      const current = sim?.getScenario?.() ?? null;
      if (current) returnTo = current.id; // scénario fourni, ou « Ma topologie » déjà jouée
      if (!draft) draft = current ? fromScenario(current) : newTopology();
      error = null;
      notice = null;
      await sim.load(draft);
      notify();
    },
    /**
     * Revient au mode Explorer : « Ma topologie » si l'on vient de demander à la jouer, sinon le
     * scénario affiché avant la construction.
     */
    async leave() {
      if (!active) return;
      active = false;
      armed = null;
      const target = launch ? 'perso' : returnTo;
      launch = false;
      if (target && typeof sim?.loadScenario === 'function') await sim.loadScenario(target);
      notify();
    },
    // --- Configuration (phase 7b) ---
    setAddress: (id, itf, value) => apply((s) => setAddress(s, id, itf, value),
      String(value ?? '').trim() ? 'Adresse enregistrée.' : "Adresse effacée (l'équipement pourra la demander par DHCP)."),
    proposeAddress: (id, itf) => apply((s) => {
      const proposal = proposeAddress(s, id, itf);
      if (!proposal) throw new BuilderError("Pas d'adresse à proposer pour cette interface.");
      return setAddress(s, id, itf, proposal);
    }, 'Adresse proposée enregistrée.'),
    setGateway: (id, ip) => apply((s) => setGateway(s, id, ip), 'Passerelle enregistrée.'),
    proposeGateway: (id) => apply((s) => {
      const proposal = proposeGateway(s, id);
      if (!proposal) throw new BuilderError("Aucun routeur de son réseau n'a d'adresse : configurez d'abord l'interface du routeur reliée à ce réseau.");
      return setGateway(s, id, proposal);
    }, 'Passerelle proposée enregistrée.'),
    setDns: (id, ip) => apply((s) => setDns(s, id, ip), 'Serveur DNS enregistré.'),
    addRoute: (id, network, via) => apply((s) => addRoute(s, id, { network, via }), 'Route ajoutée.'),
    removeRoute: (id, network) => apply((s) => removeRoute(s, id, network), 'Route retirée.'),
    setRole: (id, role, on) => apply((s) => setRole(s, id, role, on), `${ROLES[role]?.label ?? role} ${on ? 'activé' : 'retiré'}.`),
    addService: (id, transport, port) => apply((s) => addService(s, id, { transport, port: Number(port) }), 'Port ouvert.'),
    removeService: (id, transport, port) => apply((s) => removeService(s, id, transport, port), 'Port fermé.'),
    addRecord: (id, name, value) => apply((s) => addRecord(s, id, { name, value }), 'Enregistrement DNS ajouté.'),
    removeRecord: (id, name) => apply((s) => removeRecord(s, id, name), 'Enregistrement DNS retiré.'),
    // --- Protocole à jouer (phase 7b) ---
    chooseRun(id) {
      runId = RUNS.some((run) => run.id === id) ? id : DEFAULT_RUN;
      runValues = {};
      error = null;
      notify();
    },
    setRunValue(key, value) {
      runValues = { ...runValues, [key]: value };
      notify();
    },
    /**
     * Valide le protocole et ses paramètres, puis prépare « Ma topologie » dans la liste des
     * scénarios. Renvoie true si la topologie est prête : l'appelant revient alors en Explorer.
     */
    play() {
      const check = validateRun(draft, runId, currentValues());
      if (check.errors.length) {
        error = check.errors[0];
        notice = null;
        notify();
        return false;
      }
      sim.setCustomScenario(assembleRun(draft, runId, check.params));
      launch = true;
      error = null;
      notice = 'Topologie prête : elle se joue en mode Explorer (« Ma topologie »).';
      notify();
      return true;
    },
    /** Arme le placement : le prochain toucher du sol ajoute ce modèle. */
    arm(model) {
      armed = model ?? null;
      notice = armed ? PLACE_HINT : null;
      error = null;
      notify();
    },
    async place(position) {
      if (!active || !armed) return false;
      const model = armed;
      armed = null;
      const id = await apply((s) => addDevice(s, { model, position }), (r) => `${nameOf(r.scenario, r.id)} ajouté.`);
      if (id) selection?.select?.(id);
      return id;
    },
    async addAtCenter(model = DEFAULT_MODEL) {
      armed = null;
      const id = await apply((s) => addDevice(s, { model, position: freeSpot(s.devices) }), (r) => `${nameOf(r.scenario, r.id)} ajouté.`);
      if (id) selection?.select?.(id);
      return id;
    },
    move: (id, position) => apply((s) => moveDevice(s, id, position), null),
    rename: (id, label) => apply((s) => renameDevice(s, id, label), `Renommé en « ${String(label).trim()} ».`),
    async remove(id) {
      const label = nameOf(draft, id);
      const done = await apply((s) => removeDevice(s, id), `${label} supprimé, avec ses câbles.`);
      if (done) selection?.clear?.();
      return done;
    },
    connect: (a, b, cable = DEFAULT_CABLE) => apply((s) => connect(s, { a, b, cable }), (r) => `Câble posé : ${linkLabel(r.scenario, r.scenario.links.at(-1))}.`),
    disconnect: (linkId) => apply((s) => disconnect(s, linkId), 'Câble retiré.'),
    /** Repart d'une topologie vide, ou d'une copie du scénario affiché avant la construction. */
    async restart(fromCurrent = false) {
      const base = fromCurrent && returnTo && typeof sim?.listScenarios === 'function' ? returnTo : null;
      let next = newTopology();
      if (base) {
        await sim.loadScenario(base);
        next = fromScenario(sim.getScenario());
      }
      selection?.clear?.();
      return apply(() => next, base ? 'Copie du scénario chargée.' : 'Nouvelle topologie vide.');
    },
  };
  return api;
}

const TEMPLATE = `
  <section class="editor-section" aria-labelledby="editor-add">
    <h3 class="editor-heading" id="editor-add">Ajouter un équipement</h3>
    <label class="editor-field">Modèle <select data-role="model"></select></label>
    <div class="editor-actions">
      <button type="button" class="btn" data-action="arm">Placer dans la scène</button>
      <button type="button" class="btn" data-action="center">Ajouter au centre</button>
    </div>
  </section>
  <p class="editor-message" data-role="notice" role="status"></p>
  <p class="editor-error" data-role="error" role="alert" hidden></p>
  <section class="editor-section" aria-labelledby="editor-selected">
    <h3 class="editor-heading" id="editor-selected">Équipement sélectionné</h3>
    <div data-role="selected"></div>
  </section>
  <section class="editor-section" aria-labelledby="editor-connect">
    <h3 class="editor-heading" id="editor-connect">Relier deux ports libres</h3>
    <div class="editor-grid">
      <label class="editor-field">Équipement A <select data-role="a-device"></select></label>
      <label class="editor-field">Port A <select data-role="a-port"></select></label>
      <label class="editor-field">Équipement B <select data-role="b-device"></select></label>
      <label class="editor-field">Port B <select data-role="b-port"></select></label>
    </div>
    <label class="editor-field">Câble <select data-role="cable"></select></label>
    <button type="button" class="btn btn-primary" data-action="connect">Relier</button>
  </section>
  <section class="editor-section" aria-labelledby="editor-links">
    <h3 class="editor-heading" id="editor-links">Câbles</h3>
    <ul class="editor-links" data-role="links"></ul>
  </section>
  <section class="editor-section editor-run" aria-labelledby="editor-run">
    <h3 class="editor-heading" id="editor-run">Jouer cette topologie</h3>
    <label class="editor-field">Protocole <select data-role="run" data-focus="run"></select></label>
    <div data-role="run-fields"></div>
    <ul class="editor-checks" data-role="run-messages" aria-live="polite"></ul>
    <button type="button" class="btn btn-primary" data-action="play" data-focus="play">Jouer cette topologie</button>
  </section>
  <section class="editor-section" aria-labelledby="editor-restart">
    <h3 class="editor-heading" id="editor-restart">Repartir de</h3>
    <div class="editor-actions">
      <button type="button" class="btn" data-action="empty">Topologie vide</button>
      <button type="button" class="btn" data-action="copy">Copie du scénario</button>
    </div>
  </section>
`;

/**
 * @param {object} container élément #editor (sous Node : faux conteneur { innerHTML })
 * @param {object} app objet partagé
 * @param {{ selection?: object }} [services]
 */
export function mount(container, app, { selection = null, mode = null } = {}) {
  container.innerHTML = TEMPLATE;
  const hasDom = typeof container.querySelector === 'function';
  const find = (selector) => (hasDom ? container.querySelector(selector) : null);
  const doc = container.ownerDocument ?? globalThis.document;
  const parts = Object.fromEntries(['model', 'notice', 'error', 'selected', 'a-device', 'a-port', 'b-device', 'b-port', 'cable', 'links']
    .map((role) => [role, find(`[data-role="${role}"]`)]));
  const el = (tag, className, content) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  /** Remplit un <select> en gardant la valeur choisie si elle existe encore. */
  const fill = (select, options, { placeholder = null } = {}) => {
    if (!select) return;
    const previous = select.value;
    select.replaceChildren();
    if (placeholder) {
      const option = el('option', '', placeholder);
      option.value = '';
      select.append(option);
    }
    for (const option of options) {
      if (option.group) {
        const group = el('optgroup');
        group.label = option.group;
        for (const item of option.items) {
          const node = el('option', '', item.label);
          node.value = item.value;
          group.append(node);
        }
        select.append(group);
      } else {
        const node = el('option', '', option.label);
        node.value = option.value;
        select.append(node);
      }
    }
    if ([...select.querySelectorAll('option')].some((option) => option.value === previous)) select.value = previous;
  };

  let current = null;
  /** Petit formulaire « champ + bouton » ; onSubmit reçoit les valeurs des champs. */
  const inlineForm = (fields, buttonLabel, onSubmit, focusKey) => {
    const form = el('form', 'editor-inline');
    const inputs = fields.map(({ label, value = '', placeholder = '', type = 'text', options = null, key }) => {
      const wrap = el('label', 'editor-field', `${label} `);
      let input;
      if (options) {
        input = el('select');
        for (const option of options) {
          const node = el('option', '', option.label);
          node.value = option.value;
          input.append(node);
        }
      } else {
        input = el('input');
        input.type = type;
        input.placeholder = placeholder;
      }
      input.value = value;
      input.dataset.focus = `${focusKey}-${key}`;
      wrap.append(input);
      form.append(wrap);
      return input;
    });
    const submit = el('button', 'btn', buttonLabel);
    submit.type = 'submit';
    submit.dataset.focus = `${focusKey}-submit`;
    form.append(submit);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      onSubmit(inputs.map((input) => input.value));
    });
    return form;
  };
  const smallButton = (label, ariaLabel, onClick, focusKey) => {
    const button = el('button', 'btn btn-small', label);
    button.type = 'button';
    if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
    if (focusKey) button.dataset.focus = focusKey;
    button.addEventListener('click', onClick);
    return button;
  };

  /** Configuration de l'équipement sélectionné (phase 7b). */
  const configBlock = (selected) => {
    const { config } = selected;
    const root = el('div', 'editor-config');
    const sub = (title) => root.appendChild(el('h4', 'editor-subheading', title));
    if (config.interfaces.length) {
      sub('Adresses IP');
      if (config.host) root.append(el('p', 'editor-hint', 'Laissez vide pour un client DHCP. « Proposer » choisit une adresse libre du réseau.'));
      for (const itf of config.interfaces) {
        const form = inlineForm([{ label: itf.name, value: itf.ip, placeholder: '192.168.1.10/24', key: 'ip' }], 'Appliquer',
          ([value]) => controller.setAddress(selected.id, itf.name, value), `ip-${itf.name}`);
        form.append(smallButton('Proposer', `Proposer une adresse pour ${itf.name}`, () => controller.proposeAddress(selected.id, itf.name), `propose-${itf.name}`));
        root.append(form);
      }
    } else if (!config.host && !config.router) {
      root.append(el('p', 'editor-hint', 'Un switch travaille au niveau 2 : il n’a pas d’adresse IP à configurer.'));
    } else {
      root.append(el('p', 'editor-hint', 'Reliez d’abord un câble : on configure les interfaces utilisées.'));
    }
    if (config.host) {
      sub('Passerelle et DNS');
      const gateway = inlineForm([{ label: 'Passerelle', value: config.gateway, placeholder: '192.168.1.1', key: 'gw' }], 'Appliquer',
        ([value]) => controller.setGateway(selected.id, value), 'gateway');
      gateway.append(smallButton('Proposer', 'Proposer la passerelle', () => controller.proposeGateway(selected.id), 'propose-gateway'));
      root.append(gateway, inlineForm([{ label: 'Serveur DNS', value: config.dns, placeholder: '192.168.2.53', key: 'dns' }], 'Appliquer',
        ([value]) => controller.setDns(selected.id, value), 'dns'));
      sub('Rôles de serveur');
      const roles = el('div', 'editor-roles');
      for (const role of config.roles) {
        const label = el('label', 'editor-check');
        const box = el('input');
        box.type = 'checkbox';
        box.checked = role.active;
        box.dataset.focus = `role-${role.id}`;
        box.addEventListener('change', () => controller.setRole(selected.id, role.id, box.checked));
        label.append(box, doc.createTextNode(` ${role.label}`));
        roles.append(label);
      }
      root.append(roles);
      if (config.records) {
        sub('Enregistrements DNS');
        const list = el('ul', 'editor-list');
        for (const record of config.records) {
          const item = el('li', '', `${record.name} → ${record.value} `);
          item.append(smallButton('Retirer', `Retirer ${record.name}`, () => controller.removeRecord(selected.id, record.name)));
          list.append(item);
        }
        root.append(list, inlineForm([{ label: 'Nom', placeholder: 'intranet.ecole.test', key: 'name' }, { label: 'Adresse', placeholder: '192.168.2.80', key: 'value' }],
          'Ajouter', ([name, value]) => controller.addRecord(selected.id, name, value), 'record'));
      }
      sub('Ports ouverts');
      const services = el('ul', 'editor-list');
      if (config.services.length === 0) services.append(el('li', 'editor-port-free', 'Aucun : cet équipement refuse toute connexion entrante.'));
      for (const service of config.services) {
        const item = el('li', '', `${service.transport.toUpperCase()} ${service.port} (${service.name}) `);
        item.append(smallButton('Fermer', `Fermer le port ${service.transport.toUpperCase()} ${service.port}`, () => controller.removeService(selected.id, service.transport, service.port)));
        services.append(item);
      }
      root.append(services, inlineForm([
        { label: 'Transport', key: 'transport', value: 'tcp', options: [{ value: 'tcp', label: 'TCP' }, { value: 'udp', label: 'UDP' }] },
        { label: 'Port', key: 'port', type: 'number', placeholder: '9000' },
      ], 'Ouvrir', ([transport, port]) => controller.addService(selected.id, transport, port), 'service'));
    }
    if (config.router) {
      sub('Routes statiques');
      root.append(el('p', 'editor-hint', 'Les réseaux reliés au routeur sont connus d’office. Ajoutez une route pour les réseaux plus lointains (0.0.0.0/0 : route par défaut).'));
      const list = el('ul', 'editor-list');
      if (config.routes.length === 0) list.append(el('li', 'editor-port-free', 'Aucune route statique.'));
      for (const route of config.routes) {
        const item = el('li', '', `${route.network} via ${route.via} `);
        item.append(smallButton('Retirer', `Retirer la route vers ${route.network}`, () => controller.removeRoute(selected.id, route.network)));
        list.append(item);
      }
      root.append(list, inlineForm([{ label: 'Réseau', placeholder: '192.168.3.0/24', key: 'net' }, { label: 'Via', placeholder: '10.0.0.2', key: 'via' }],
        'Ajouter', ([network, via]) => controller.addRoute(selected.id, network, via), 'route'));
    }
    return root;
  };

  /** Formulaire du protocole à jouer (phase 7b). */
  const renderRun = (run) => {
    const select = find('[data-role="run"]');
    const fieldsBox = find('[data-role="run-fields"]');
    const messages = find('[data-role="run-messages"]');
    const play = find('[data-action="play"]');
    if (!select || !run) return;
    fill(select, run.runs.map((item) => ({ value: item.id, label: item.label })));
    select.value = run.runId;
    fieldsBox.replaceChildren();
    for (const field of run.fields) {
      const key = `run-${field.key}`;
      if (field.kind === 'devices') {
        const set = el('fieldset', 'editor-fieldset');
        set.append(el('legend', '', field.label));
        if (field.options.length === 0) set.append(el('p', 'editor-hint', 'Aucun équipement ne convient.'));
        for (const option of field.options) {
          const label = el('label', 'editor-check');
          const box = el('input');
          box.type = 'checkbox';
          box.value = option.value;
          box.checked = (field.value ?? []).includes(option.value);
          box.dataset.focus = `${key}-${option.value}`;
          box.addEventListener('change', () => {
            const chosen = [...set.querySelectorAll('input:checked')].map((input) => input.value);
            controller.setRunValue(field.key, chosen);
          });
          label.append(box, doc.createTextNode(` ${option.label}`));
          set.append(label);
        }
        fieldsBox.append(set);
        continue;
      }
      if (field.kind === 'bool') {
        const label = el('label', 'editor-check');
        const box = el('input');
        box.type = 'checkbox';
        box.checked = Boolean(field.value);
        box.dataset.focus = key;
        box.addEventListener('change', () => controller.setRunValue(field.key, box.checked));
        label.append(box, doc.createTextNode(` ${field.label}`));
        fieldsBox.append(label);
        continue;
      }
      const label = el('label', 'editor-field', `${field.label} `);
      let input;
      if (field.kind === 'device') {
        input = el('select');
        fill(input, field.options, { placeholder: 'Choisir…' });
        input.value = field.value ?? '';
      } else {
        input = el('input');
        input.type = field.kind === 'number' ? 'number' : 'text';
        if (field.kind === 'number') {
          input.min = String(field.min);
          input.max = String(field.max);
        }
        input.value = field.value ?? '';
      }
      input.dataset.focus = key;
      input.addEventListener('change', () => controller.setRunValue(field.key, field.kind === 'number' ? Number(input.value) : input.value));
      label.append(input);
      if (field.hint) label.append(el('span', 'editor-hint', field.hint));
      fieldsBox.append(label);
    }
    messages.replaceChildren();
    for (const message of run.errors) messages.append(el('li', 'editor-check-error', message));
    for (const message of run.warnings) messages.append(el('li', 'editor-check-warning', message));
    if (!run.errors.length && !run.warnings.length) messages.append(el('li', 'editor-check-ok', 'Tout est prêt.'));
    play.disabled = run.errors.length > 0;
  };

  const render = (view) => {
    current = view;
    if (!hasDom) return;
    const focused = doc.activeElement?.dataset?.focus ?? null;
    fill(parts.model, view.palette.map((group) => ({ group: group.label, items: group.models.map((model) => ({ value: model.id, label: `${model.name} (${model.reference})` })) })));
    parts.notice.textContent = view.notice ?? '';
    parts.error.hidden = !view.error;
    parts.error.textContent = view.error ?? '';

    // Équipement sélectionné : renommer, supprimer, ports.
    const box = parts.selected;
    box.replaceChildren();
    if (!view.selected) {
      box.append(el('p', 'placeholder', view.devices.length ? 'Touchez un équipement dans la scène pour le renommer, le supprimer ou voir ses ports. Glissez-le pour le déplacer.' : 'La topologie est vide : ajoutez un premier équipement.'));
    } else {
      const { selected } = view;
      box.append(el('p', 'editor-selected-name', `${selected.label} · ${selected.typeLabel}`));
      const form = el('form', 'editor-rename');
      const label = el('label', 'editor-field', 'Nom ');
      const input = el('input');
      input.type = 'text';
      input.maxLength = MAX_LABEL;
      input.value = selected.label;
      input.dataset.role = 'rename';
      label.append(input);
      const submit = el('button', 'btn', 'Renommer');
      submit.type = 'submit';
      form.append(label, submit);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        controller.rename(selected.id, input.value);
      });
      const remove = el('button', 'btn btn-danger', `Supprimer ${selected.label}`);
      remove.type = 'button';
      remove.addEventListener('click', () => controller.remove(selected.id));
      const ports = el('ul', 'editor-ports');
      const shown = selected.ports.filter((port) => port.peer).concat(selected.ports.filter((port) => !port.peer).slice(0, 4));
      for (const port of shown) ports.append(el('li', port.peer ? '' : 'editor-port-free', port.peer ? `${port.name} → ${port.peer}` : `${port.name} : libre`));
      const hidden = selected.ports.length - shown.length;
      if (hidden > 0) ports.append(el('li', 'editor-port-free', `… et ${hidden} autre(s) port(s) libre(s)`));
      box.append(form, remove, ports, configBlock(selected));
    }

    // Relier : seuls les équipements qui ont un port libre, puis leurs ports libres.
    const withFree = view.devices.filter((device) => device.free.length > 0).map((device) => ({ value: device.id, label: device.label }));
    for (const side of ['a', 'b']) {
      const deviceSelect = parts[`${side}-device`];
      fill(deviceSelect, withFree, { placeholder: 'Choisir…' });
      const chosen = view.devices.find((device) => device.id === deviceSelect?.value);
      fill(parts[`${side}-port`], (chosen?.free ?? []).map((name) => ({ value: name, label: name })), { placeholder: chosen ? null : '—' });
    }
    fill(parts.cable, view.cables.map((cable) => ({ value: cable.id, label: cable.label })));
    // Câble de catégorie 6 par défaut, tant que l'utilisateur n'en a pas choisi un autre.
    if (parts.cable.dataset.chosen !== 'oui') parts.cable.value = DEFAULT_CABLE;

    parts.links.replaceChildren();
    if (view.links.length === 0) parts.links.append(el('li', 'placeholder', 'Aucun câble.'));
    for (const link of view.links) {
      const item = el('li', 'editor-link');
      item.append(el('span', 'editor-link-label', link.label), el('span', 'editor-link-meta', `${link.cable} · ${link.bandwidth}`));
      const button = el('button', 'btn btn-small', 'Retirer');
      button.type = 'button';
      button.setAttribute('aria-label', `Retirer le câble ${link.label}`);
      button.addEventListener('click', () => controller.disconnect(link.id));
      item.append(button);
      parts.links.append(item);
    }
    renderRun(view.run);
    // Le panneau est reconstruit : le focus clavier revient sur le même champ ou bouton.
    if (focused) container.querySelector(`[data-focus="${focused}"]`)?.focus();
  };

  const controller = createEditorController(app, { onChange: render, selection });
  const offSelection = selection?.onChange?.(() => render(controller.getView()));

  const listeners = [];
  const on = (target, type, handler) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener(type, handler));
  };
  if (hasDom) {
    on(container, 'click', (event) => {
      const action = event.target?.closest?.('[data-action]')?.dataset.action;
      if (action === 'arm') controller.arm(parts.model.value);
      if (action === 'center') controller.addAtCenter(parts.model.value);
      if (action === 'connect') {
        const a = parts['a-device'].value && parts['a-port'].value ? `${parts['a-device'].value}:${parts['a-port'].value}` : '';
        const b = parts['b-device'].value && parts['b-port'].value ? `${parts['b-device'].value}:${parts['b-port'].value}` : '';
        controller.connect(a, b, parts.cable.value);
      }
      if (action === 'empty') controller.restart(false);
      if (action === 'copy') controller.restart(true);
      if (action === 'play' && controller.play()) mode?.set?.('explore');
    });
    // Changer d'équipement A ou B recharge la liste de ses ports libres.
    for (const side of ['a', 'b']) on(parts[`${side}-device`], 'change', () => current && render(current));
    on(parts.cable, 'change', () => { parts.cable.dataset.chosen = 'oui'; });
    on(find('[data-role="run"]'), 'change', (event) => controller.chooseRun(event.target.value));
    const scene = doc.getElementById?.('scene');
    on(scene, 'topology:ground-clicked', (event) => controller.place(event.detail.position));
    on(scene, 'topology:device-moved', (event) => {
      if (controller.isActive()) controller.move(event.detail.id, event.detail.position);
    });
    on(doc, 'keydown', (event) => {
      if (event.key === 'Escape' && controller.getView().armed) controller.arm(null);
    });
  }
  render(controller.getView());

  return {
    ...controller,
    dispose() {
      offSelection?.();
      listeners.forEach((off) => off());
    },
  };
}
