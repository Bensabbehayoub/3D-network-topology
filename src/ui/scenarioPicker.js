// Ramy : choix du scénario à jouer (phase 4).
//
// La liste vient du moteur : app.sim.listScenarios() (scenarios/index.json, scénarios validés).
// Choisir un scénario appelle app.sim.loadScenario(id) : le moteur publie TOPICS.SCENARIO, la
// scène 3D, la barre de commandes et les panneaux (2D et VR) se mettent à jour d'eux-mêmes.
// Le choix suit aussi les chargements faits ailleurs (TOPICS.SCENARIO).
//
// Découpage pour les tests sous Node (pas de DOM) :
//   pickerView()             état d'affichage (pur)
//   createPickerController() choix et abonnement au bus, sans DOM
//   mount()                  liste <select> native (clavier et lecteurs d'écran inclus)
//
// Titres et descriptions viennent des scénarios : écrits avec textContent, jamais innerHTML.

import { TOPICS } from '../../simulation.js';

export const EMPTY_LABEL = 'Aucun scénario disponible';

/** app.sim permet-il de choisir un scénario ? */
export function canPick(sim) {
  return typeof sim?.listScenarios === 'function' && typeof sim?.loadScenario === 'function';
}

/**
 * État d'affichage de la liste (fonction pure).
 * @param {object} sim app.sim
 * @param {{ loading?: boolean, error?: string | null }} [extra]
 * @returns {{ enabled: boolean, options: Array<{ id: string, title: string }>, selected: string | null,
 *   description: string, loading: boolean, error: string | null }}
 */
export function pickerView(sim, { loading = false, error = null } = {}) {
  const list = canPick(sim) ? sim.listScenarios() : [];
  const current = sim?.getScenario?.()?.id ?? null;
  const selected = list.some((item) => item.id === current) ? current : null;
  const description = list.find((item) => item.id === selected)?.description ?? '';
  return {
    enabled: list.length > 0 && !loading,
    options: list.map(({ id, title }) => ({ id, title })),
    selected,
    description,
    loading,
    error,
  };
}

/**
 * @param {object} app objet partagé (app.sim)
 * @param {{ onChange?: (view: ReturnType<typeof pickerView>) => void }} [options]
 */
export function createPickerController(app, { onChange = () => {} } = {}) {
  const sim = app?.sim;
  let loading = false;
  let error = null;
  const view = () => pickerView(sim, { loading, error });
  const notify = () => onChange(view());
  const unsubscribe = typeof sim?.on === 'function' ? sim.on(TOPICS.SCENARIO, notify) : () => {};

  return {
    getView: view,
    /**
     * Charge le scénario choisi.
     * @returns {Promise<boolean>} false si l'id est inconnu ou le chargement a échoué
     */
    async choose(id) {
      if (!canPick(sim) || loading) return false;
      if (sim.getScenario?.()?.id === id) return true;
      loading = true;
      error = null;
      notify();
      try {
        const ok = await sim.loadScenario(id);
        if (!ok) error = 'Scénario inconnu.';
        return Boolean(ok);
      } catch (cause) {
        error = `Chargement impossible : ${cause?.message ?? cause}`;
        return false;
      } finally {
        loading = false;
        notify();
      }
    },
    dispose: unsubscribe,
  };
}

const TEMPLATE = `
  <label class="field">
    <span>Scénario</span>
    <select data-role="scenario" aria-describedby="scenario-description"></select>
  </label>
  <span id="scenario-description" class="sr-only" data-role="description"></span>
  <span class="picker-error" data-role="error" role="alert" hidden></span>
`;

/**
 * @param {{ innerHTML: string, querySelector?: Function }} container élément #scenario-picker
 * @param {object} app objet partagé
 * @returns {{ getView(): object, choose(id: string): Promise<boolean>, dispose(): void }}
 */
export function mount(container, app) {
  container.innerHTML = TEMPLATE;
  const hasDom = typeof container.querySelector === 'function';
  const select = hasDom ? container.querySelector('[data-role="scenario"]') : null;
  const description = hasDom ? container.querySelector('[data-role="description"]') : null;
  const errorLabel = hasDom ? container.querySelector('[data-role="error"]') : null;

  const render = (view) => {
    if (!select) return;
    const doc = select.ownerDocument;
    const ids = view.options.map((option) => option.id).join('|');
    if (select.dataset.ids !== ids) {
      select.textContent = '';
      if (view.options.length === 0) {
        const option = doc.createElement('option');
        option.textContent = EMPTY_LABEL;
        select.append(option);
      }
      for (const item of view.options) {
        const option = doc.createElement('option');
        option.value = item.id;
        option.textContent = item.title;
        select.append(option);
      }
      select.dataset.ids = ids;
    }
    if (view.selected) select.value = view.selected;
    select.disabled = !view.enabled;
    select.setAttribute('aria-busy', String(view.loading));
    select.title = view.description;
    if (description) description.textContent = view.description;
    if (errorLabel) {
      errorLabel.hidden = !view.error;
      errorLabel.textContent = view.error ?? '';
    }
  };

  const controller = createPickerController(app, { onChange: render });
  render(controller.getView());
  const onSelect = () => { controller.choose(select.value); };
  select?.addEventListener('change', onSelect);

  return {
    getView: controller.getView,
    choose: controller.choose,
    dispose() {
      select?.removeEventListener('change', onSelect);
      controller.dispose();
    },
  };
}
