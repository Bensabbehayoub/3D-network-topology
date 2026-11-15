// Ramy : explication de l'étape en cours et journal des messages échangés (phase 4d).
//
// - Explication : la description du scénario au chargement, puis le titre et le texte de chaque
//   étape publiée par le moteur (TOPICS.STEP), avec son instant.
// - Journal : une ligne par envoi ou perte de paquet (TOPICS.NETWORK), pastille de la couleur du
//   protocole (app.render.packetStyle, la même que dans la scène). Chaque ligne est un bouton :
//   il sélectionne le paquet, que l'inspecteur détaille. Vidé à chaque réinitialisation.
//
// Les textes viennent des scénarios : écrits avec textContent, jamais innerHTML.
//
// Découpage pour les tests sous Node (pas de DOM) :
//   explanationView()   ce que dit le bloc d'explication (pur)
//   createLogModel()    lignes du journal tenues à jour depuis le bus, sans DOM
//   mount()             affichage

import { TOPICS } from '../../simulation.js';
import { formatTime } from './controls.js';
import { logEntry } from './packets.js';

export const HINT = 'Lancez la simulation : chaque étape sera expliquée ici.';
export const EMPTY_LOG = 'Aucun message pour l\'instant.';
/** Nombre maximal de lignes gardées dans le journal (les plus anciennes sont retirées). */
export const MAX_LOG_ENTRIES = 400;

/**
 * Bloc d'explication (fonction pure).
 * @param {object | null} scenario scénario chargé
 * @param {{ time: number, title: string, text: string } | null} step dernière étape publiée
 * @returns {{ heading: string, title: string, text: string, time: string | null, hint: boolean }}
 */
export function explanationView(scenario, step) {
  const heading = scenario?.title ? String(scenario.title) : 'Aucun scénario';
  if (!step) {
    return { heading, title: 'Présentation', text: scenario?.description ? String(scenario.description) : HINT, time: null, hint: true };
  }
  return { heading, title: String(step.title ?? ''), text: String(step.text ?? ''), time: formatTime(step.time), hint: false };
}

/**
 * Journal tenu à jour depuis le bus du moteur.
 * @param {object} sim app.sim
 * @param {{ onAdd?(entry): void, onClear?(): void }} [hooks]
 */
export function createLogModel(sim, { onAdd = () => {}, onClear = () => {} } = {}) {
  let entries = [];
  const scenario = () => sim?.getScenario?.() ?? null;
  const add = (event) => {
    const entry = logEntry(event, scenario());
    if (!entry) return;
    entries.push(entry);
    if (entries.length > MAX_LOG_ENTRIES) entries = entries.slice(-MAX_LOG_ENTRIES);
    onAdd(entry);
  };
  const clear = () => {
    entries = [];
    onClear();
  };
  for (const event of sim?.getHistory?.() ?? []) add(event);
  const offs = typeof sim?.on === 'function'
    ? [sim.on(TOPICS.NETWORK, add), sim.on(TOPICS.RESET, clear)]
    : [];
  return {
    entries: () => [...entries],
    dispose: () => offs.forEach((off) => off?.()),
  };
}

const TEMPLATE = `
  <div class="explanation" data-role="explanation">
    <p class="explanation-scenario" data-role="heading"></p>
    <h3 class="explanation-title"><span data-role="title"></span> <span class="explanation-time" data-role="time"></span></h3>
    <p class="explanation-text" data-role="text"></p>
  </div>
  <h3 class="log-title">Journal des messages</h3>
  <p class="placeholder" data-role="log-empty"></p>
  <ol class="log" data-role="log" aria-label="Journal des messages : choisir un message pour l'inspecter"></ol>
`;

/**
 * @param {object} container élément #explanations (sous Node : un faux conteneur { innerHTML })
 * @param {object} app objet partagé (app.sim, app.render)
 * @param {{ packets?: ReturnType<import('./packets.js').createPacketSelection> }} [services]
 * @returns {{ getView(): object, getLog(): object[], dispose(): void }}
 */
export function mount(container, app, { packets } = {}) {
  container.innerHTML = TEMPLATE;
  const sim = app?.sim;
  const hasDom = typeof container.querySelector === 'function';
  const find = (selector) => (hasDom ? container.querySelector(selector) : null);
  const parts = {
    heading: find('[data-role="heading"]'),
    title: find('[data-role="title"]'),
    time: find('[data-role="time"]'),
    text: find('[data-role="text"]'),
    log: find('[data-role="log"]'),
    empty: find('[data-role="log-empty"]'),
  };
  const doc = container.ownerDocument ?? globalThis.document;
  let step = null;

  const renderExplanation = () => {
    const view = explanationView(sim?.getScenario?.() ?? null, step);
    if (parts.heading) parts.heading.textContent = view.heading;
    if (parts.title) parts.title.textContent = view.title;
    if (parts.time) parts.time.textContent = view.time ? `(${view.time})` : '';
    if (parts.text) {
      parts.text.textContent = view.text;
      parts.text.classList?.toggle('placeholder', view.hint);
    }
    return view;
  };

  const markSelected = () => {
    const selected = packets?.get?.() ?? null;
    for (const button of parts.log?.querySelectorAll('button[data-event]') ?? []) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.event) === selected));
    }
  };

  const renderRow = (entry) => {
    if (!parts.log || !doc) return;
    const el = (tag, className, content) => {
      const node = doc.createElement(tag);
      if (className) node.className = className;
      if (content !== undefined) node.textContent = content;
      return node;
    };
    const item = el('li', `log-row log-${entry.kind}`);
    const button = el('button', 'log-entry');
    button.type = 'button';
    button.dataset.event = String(entry.eventId);
    button.setAttribute('aria-pressed', 'false');
    const dot = el('span', `log-dot${entry.broadcast ? ' log-dot-broadcast' : ''}`);
    dot.setAttribute('aria-hidden', 'true');
    const color = app?.render?.packetStyle?.(entry.protocol, entry.broadcast)?.color;
    if (color) dot.style.setProperty('--dot', color);
    button.append(
      el('span', 'log-time', entry.time),
      dot,
      el('span', 'log-label', entry.broadcast ? `${entry.label} (diffusion)` : entry.label),
      el('span', 'log-route', entry.reason ? `${entry.route} : ${entry.reason}` : entry.route),
    );
    item.append(button);
    // Le journal défile seul (l'explication reste visible) ; automatiquement seulement si l'on
    // était déjà en bas, pour ne pas gêner la lecture d'une ligne plus ancienne.
    const scroller = parts.log;
    const atBottom = !scroller.scrollHeight || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 60;
    parts.log.append(item);
    while (parts.log.children.length > MAX_LOG_ENTRIES) parts.log.firstElementChild.remove();
    if (atBottom) scroller.scrollTop = scroller.scrollHeight;
    if (parts.empty) parts.empty.hidden = true;
  };

  const clearRows = () => {
    parts.log?.replaceChildren();
    if (parts.empty) {
      parts.empty.textContent = EMPTY_LOG;
      parts.empty.hidden = false;
    }
  };

  clearRows();
  const log = createLogModel(sim, { onAdd: renderRow, onClear: clearRows });
  const offs = [];
  if (typeof sim?.on === 'function') {
    offs.push(
      sim.on(TOPICS.STEP, (next) => { step = next; renderExplanation(); }),
      sim.on(TOPICS.RESET, () => { step = null; renderExplanation(); }),
      sim.on(TOPICS.SCENARIO, () => { step = null; renderExplanation(); }),
    );
  }
  if (packets?.onChange) offs.push(packets.onChange(markSelected));
  const onClick = (event) => {
    const button = event.target?.closest?.('button[data-event]');
    if (button) packets?.select?.(Number(button.dataset.event));
  };
  parts.log?.addEventListener('click', onClick);
  renderExplanation();

  return {
    getView: () => explanationView(sim?.getScenario?.() ?? null, step),
    getLog: () => log.entries(),
    dispose() {
      parts.log?.removeEventListener('click', onClick);
      offs.forEach((off) => off?.());
      log.dispose();
    },
  };
}
