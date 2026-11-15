// Ramy (phase 6) : panneau « Recommandations » — diagnostic du réseau chargé.
//
// La liste vient de app.sim.diagnose() (src/sim/diagnostics.js) : problèmes triés par gravité,
// avec leur cause et leur correction. Elle est recalculée à chaque changement de scénario et de
// réinitialisation, et une fois par seconde pendant la lecture (le trafic mesuré peut révéler un
// lien saturé). Un clic sur un problème le montre dans la scène : l'équipement est sélectionné
// (sa fiche s'ouvre dans l'inspecteur), le lien est mis en évidence (app.render.highlightLink).
//
// Les textes sont écrits avec textContent. Découpage pour les tests sous Node :
//   recommendationsView()            ce qu'il faut afficher (pur)
//   createRecommendationsController() diagnostic tenu à jour, choix d'un problème, sans DOM
//   mount()                          affichage

import { countBySeverity, SEVERITY_LABELS, TOPICS } from '../../simulation.js';

/** Intervalle minimal (ms réelles) entre deux diagnostics pendant la lecture. */
export const LIVE_REFRESH = 1000;
export const EMPTY_TEXT = 'Aucun problème détecté : la configuration et le trafic de ce réseau sont cohérents.';
export const UNAVAILABLE_TEXT = 'Diagnostic indisponible : le moteur de simulation n\'est pas chargé.';

/**
 * Vue du panneau (fonction pure).
 * @param {object[] | null} findings résultat de app.sim.diagnose(), null s'il est indisponible
 * @param {string | null} [selected] id du problème choisi
 */
export function recommendationsView(findings, selected = null) {
  if (!Array.isArray(findings)) return { available: false, counts: countBySeverity([]), items: [], message: UNAVAILABLE_TEXT, badge: '' };
  const counts = countBySeverity(findings);
  const urgent = counts.critique + counts.avertissement;
  return {
    available: true,
    counts,
    items: findings.map((finding) => ({ ...finding, severityLabel: SEVERITY_LABELS[finding.severity], selected: finding.id === selected })),
    message: findings.length === 0 ? EMPTY_TEXT : null,
    // Pastille de l'onglet : problèmes à corriger (les conseils n'y comptent pas).
    badge: urgent > 0 ? String(urgent) : '',
  };
}

/**
 * @param {object} app app.sim, app.render
 * @param {{ onChange?(view): void, selection?: { select(id): boolean, clear(): boolean } }} [options]
 */
export function createRecommendationsController(app, { onChange = () => {}, selection = null } = {}) {
  const sim = app?.sim;
  let findings = null;
  let selected = null;
  let lastRun = 0;
  const now = () => globalThis.performance?.now?.() ?? Date.now();

  const run = () => {
    lastRun = now();
    try {
      findings = typeof sim?.diagnose === 'function' ? sim.diagnose() : null;
    } catch (error) {
      console.error('Diagnostic en échec :', error);
      findings = null;
    }
    if (selected && !findings?.some((finding) => finding.id === selected)) {
      selected = null;
      app?.render?.highlightLink?.(null);
    }
    onChange(view());
  };
  const view = () => recommendationsView(findings, selected);

  const offs = [];
  if (typeof sim?.on === 'function') {
    offs.push(
      sim.on(TOPICS.SCENARIO, () => { selected = null; app?.render?.highlightLink?.(null); run(); }),
      sim.on(TOPICS.RESET, run),
      sim.on(TOPICS.TICK, () => { if (now() - lastRun >= LIVE_REFRESH) run(); }),
      sim.on(TOPICS.STATE, (state) => { if (state?.status === 'finished' || state?.status === 'paused') run(); }),
    );
  }
  run();

  return {
    getView: view,
    refresh: run,
    /**
     * Choisit un problème et montre son élément dans la scène.
     * @returns {boolean} false si l'id est inconnu
     */
    choose(id) {
      const finding = findings?.find((candidate) => candidate.id === id);
      if (!finding) return false;
      selected = id;
      const { kind, id: targetId } = finding.target;
      if (kind === 'device') {
        app?.render?.highlightLink?.(null);
        selection?.select?.(targetId);
        app?.render?.focusDevice?.(targetId);
      } else {
        selection?.clear?.();
        app?.render?.highlightLink?.(targetId);
      }
      onChange(view());
      return true;
    },
    dispose: () => offs.forEach((off) => off?.()),
  };
}

const TEMPLATE = `
  <p class="recommendations-summary" data-role="summary" aria-live="polite"></p>
  <p class="placeholder" data-role="message" hidden></p>
  <ol class="recommendations" data-role="list" aria-label="Problèmes détectés, du plus grave au moins grave"></ol>
`;

/**
 * @param {object} container élément #recommendations (sous Node : faux conteneur { innerHTML })
 * @param {object} app objet partagé
 * @param {{ selection?: object, badge?: object | null }} [services] sélection d'équipement ; pastille de l'onglet
 */
export function mount(container, app, { selection = null, badge = null } = {}) {
  container.innerHTML = TEMPLATE;
  const hasDom = typeof container.querySelector === 'function';
  const find = (selector) => (hasDom ? container.querySelector(selector) : null);
  const summary = find('[data-role="summary"]');
  const message = find('[data-role="message"]');
  const list = find('[data-role="list"]');
  const doc = container.ownerDocument ?? globalThis.document;
  let signature = '';

  const el = (tag, className, content) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };

  const render = (view) => {
    if (badge) {
      badge.textContent = view.badge;
      badge.hidden = view.badge === '';
      badge.setAttribute?.('aria-label', view.badge ? `${view.badge} problème(s) à corriger` : '');
    }
    if (!list) return;
    const { critique, avertissement, conseil } = view.counts;
    summary.textContent = view.available ? `${critique} critique${critique > 1 ? 's' : ''} · ${avertissement} avertissement${avertissement > 1 ? 's' : ''} · ${conseil} conseil${conseil > 1 ? 's' : ''}` : '';
    message.hidden = !view.message;
    message.textContent = view.message ?? '';
    // Liste reconstruite seulement si elle a changé ; le focus clavier est rendu au même problème.
    const next = view.items.map((item) => `${item.id}|${item.cause}|${item.selected}`).join('¦');
    if (next === signature) return;
    signature = next;
    const focused = doc.activeElement?.dataset?.finding ?? null;
    list.replaceChildren();
    for (const item of view.items) {
      const li = el('li', `recommendation recommendation-${item.severity}`);
      const button = el('button', 'recommendation-target');
      button.type = 'button';
      button.dataset.finding = item.id;
      button.setAttribute('aria-pressed', String(item.selected));
      button.append(
        el('span', `severity severity-${item.severity}`, item.severityLabel),
        el('span', 'recommendation-problem', item.problem),
        el('span', 'recommendation-where', item.target.kind === 'link' ? `Lien ${item.target.label}` : item.target.label),
      );
      li.append(button, el('p', 'recommendation-cause', item.cause));
      const fix = el('p', 'recommendation-fix');
      fix.append(el('strong', '', 'À faire : '), doc.createTextNode(item.recommendation));
      li.append(fix);
      list.append(li);
    }
    if (focused) list.querySelector(`[data-finding="${CSS.escape(focused)}"]`)?.focus();
  };

  const controller = createRecommendationsController(app, { onChange: render, selection });
  const onClick = (event) => {
    const button = event.target?.closest?.('button[data-finding]');
    if (button) controller.choose(button.dataset.finding);
  };
  list?.addEventListener('click', onClick);
  render(controller.getView());

  return {
    getView: controller.getView,
    refresh: controller.refresh,
    choose: controller.choose,
    dispose() {
      list?.removeEventListener('click', onClick);
      controller.dispose();
    },
  };
}
