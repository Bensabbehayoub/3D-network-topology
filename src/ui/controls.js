// Ramy : barre de commandes de la simulation (lecture, pause, pas à pas, vitesse, réinitialisation).
//
// S2 : chaque bouton appelle une commande de app.sim (patron Command, côté moteur) et n'est
// activé que si app.sim.isAllowed(commande) le permet dans l'état courant (patron State).
// L'affichage est rafraîchi à chaque TOPICS.STATE (état, vitesse) et TOPICS.TICK (temps simulé,
// qui avance pendant la lecture sans changer d'état).
//
// Découpage pour les tests sous Node (pas de DOM) :
//   controlsView()             état d'affichage calculé à partir de getState() et isAllowed() (pur)
//   createControlsController() commandes, abonnements au bus et raccourcis clavier, sans DOM
//   mount()                    écrit la barre dans #controls et la relie au contrôleur

import { COMMANDS, MAX_SPEED, MIN_SPEED, STATUS, TOPICS } from '../../simulation.js';

/** Pas du curseur de vitesse. */
export const SPEED_STEP = 0.25;

/** Méthodes de app.sim dont la barre a besoin : sans elles, tout reste désactivé. */
const REQUIRED_METHODS = ['play', 'pause', 'step', 'setSpeed', 'reset', 'getState', 'isAllowed', 'on'];

/** Libellés affichés pour chaque état du moteur. */
export const STATUS_LABELS = Object.freeze({
  [STATUS.IDLE]: 'Aucun scénario',
  [STATUS.READY]: 'Prêt',
  [STATUS.PLAYING]: 'En lecture',
  [STATUS.PAUSED]: 'En pause',
  [STATUS.FINISHED]: 'Terminé',
});

const UNAVAILABLE = 'unavailable';
const UNAVAILABLE_LABEL = 'Moteur indisponible';

/** Commande du moteur associée à chaque contrôle de la barre. */
const CONTROL_COMMANDS = Object.freeze({
  play: COMMANDS.PLAY,
  pause: COMMANDS.PAUSE,
  step: COMMANDS.STEP,
  speed: COMMANDS.SET_SPEED,
  reset: COMMANDS.RESET,
});

/** Nombre décimal à la française : 0.25 → "0,25", 2 → "2". */
const frenchNumber = (value, digits) => {
  const text = digits === undefined ? String(Number(value.toFixed(2))) : value.toFixed(digits);
  return text.replace('.', ',');
};

/** @returns {boolean} app.sim expose-t-il tout ce dont la barre a besoin ? */
export function isSimUsable(sim) {
  return REQUIRED_METHODS.every((name) => typeof sim?.[name] === 'function');
}

/** Ramène une vitesse dans [MIN_SPEED, MAX_SPEED] ; NaN si la valeur n'est pas un nombre. */
export function clampSpeed(value) {
  const speed = Number(value);
  if (!Number.isFinite(speed)) return Number.NaN;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
}

/** 2 → "×2", 0.25 → "×0,25" */
export function formatSpeed(speed) {
  return Number.isFinite(speed) ? `×${frenchNumber(speed)}` : '×—';
}

/** Temps simulé en ms → "1,2 s" */
export function formatTime(ms) {
  return Number.isFinite(ms) ? `${frenchNumber(ms / 1000, 1)} s` : '— s';
}

/**
 * État d'affichage de la barre (fonction pure).
 * @param {object | null} state valeur de app.sim.getState(), ou null si le moteur est absent
 * @param {(command: string) => boolean} [isAllowed] app.sim.isAllowed
 * @returns {{ status: string, statusLabel: string, time: string, speed: number, speedLabel: string,
 *   error: string | null, enabled: Record<'play'|'pause'|'step'|'speed'|'reset', boolean> }}
 */
export function controlsView(state, isAllowed) {
  const usable = state && typeof state === 'object' && typeof isAllowed === 'function';
  const allowed = (command) => {
    if (!usable) return false;
    try {
      return Boolean(isAllowed(command));
    } catch {
      return false;
    }
  };
  const enabled = {};
  for (const [control, command] of Object.entries(CONTROL_COMMANDS)) enabled[control] = allowed(command);

  if (!usable) {
    return { status: UNAVAILABLE, statusLabel: UNAVAILABLE_LABEL, time: formatTime(Number.NaN),
      speed: 1, speedLabel: formatSpeed(1), error: null, enabled };
  }
  const speed = Number.isFinite(clampSpeed(state.speed)) ? clampSpeed(state.speed) : 1;
  return {
    status: String(state.status),
    statusLabel: STATUS_LABELS[state.status] ?? String(state.status),
    time: formatTime(state.time),
    speed,
    speedLabel: formatSpeed(speed),
    error: state.error ? String(state.error) : null,
    enabled,
  };
}

/** Le focus est-il dans un champ où les touches servent à la saisie ? */
function isEditable(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(String(target.tagName ?? '').toUpperCase());
}

const isSpace = (key) => key === ' ' || key === 'Spacebar';

/**
 * Contrôleur de la barre, sans DOM : commandes, abonnements au bus, raccourcis clavier.
 * @param {object} [app] objet partagé (app.sim peut manquer)
 * @param {{ onChange?: (view: ReturnType<typeof controlsView>) => void }} [options]
 */
export function createControlsController(app, { onChange } = {}) {
  const sim = app?.sim;
  const usable = isSimUsable(sim);

  const compute = () => {
    if (!usable) return controlsView(null);
    try {
      return controlsView(sim.getState(), (command) => sim.isAllowed(command));
    } catch (error) {
      console.error('Commandes : état du moteur illisible :', error);
      return controlsView(null);
    }
  };

  let view = compute();
  const refresh = () => {
    view = compute();
    onChange?.(view);
    return view;
  };

  const unsubscribers = [];
  if (usable) {
    for (const topic of [TOPICS.STATE, TOPICS.TICK]) {
      const off = sim.on(topic, refresh);
      if (typeof off === 'function') unsubscribers.push(off);
    }
  }

  /**
   * Exécute une commande de la barre.
   * @param {'play'|'pause'|'step'|'reset'|'speed'} control
   * @param {number} [value] vitesse demandée (control = 'speed')
   * @returns {boolean} la commande a-t-elle été exécutée ?
   */
  function run(control, value) {
    if (!usable) return false;
    try {
      switch (control) {
        case 'play': return sim.play() === true;
        case 'pause': return sim.pause() === true;
        case 'step': return sim.step() === true;
        case 'reset': return sim.reset() === true;
        case 'speed': {
          const speed = clampSpeed(value);
          return Number.isFinite(speed) ? sim.setSpeed(speed) === true : false;
        }
        default: return false;
      }
    } catch (error) {
      // Une erreur du moteur ne doit pas casser l'interface : on l'affiche dans la console.
      console.error(`Commande "${control}" en échec :`, error);
      refresh();
      return false;
    }
  }

  /** Espace : pause si la lecture est en cours, sinon lecture. */
  function togglePlay() {
    if (view.enabled.pause) return run('pause');
    if (view.enabled.play) return run('play');
    return false;
  }

  /**
   * Raccourcis clavier : Espace = lecture/pause, → = pas à pas, R = réinitialiser.
   * Ignorés sans moteur, dans un champ de saisie, avec Ctrl/Alt/Cmd (Ctrl+R recharge la page)
   * et pour Espace sur un bouton (le navigateur le clique déjà).
   * @param {{ key: string, target?: object, ctrlKey?: boolean, altKey?: boolean, metaKey?: boolean, repeat?: boolean }} event
   * @returns {boolean} la touche est un raccourci de la barre (l'appelant annule alors l'action par défaut)
   */
  function handleKey(event) {
    if (!usable || !event || event.ctrlKey || event.altKey || event.metaKey) return false;
    const { key, target } = event;
    if (isEditable(target)) return false;
    if (isSpace(key)) {
      if (String(target?.tagName ?? '').toUpperCase() === 'BUTTON') return false;
      if (!event.repeat) togglePlay();
      return true;
    }
    if (key === 'ArrowRight') {
      run('step');
      return true;
    }
    if (key === 'r' || key === 'R') {
      if (!event.repeat) run('reset');
      return true;
    }
    return false;
  }

  function destroy() {
    for (const off of unsubscribers.splice(0)) off();
  }

  return { getView: () => view, refresh, run, togglePlay, handleKey, destroy, usable };
}

const TEMPLATE = `
  <div class="controls-buttons">
    <button type="button" class="btn btn-primary" data-command="play" aria-keyshortcuts="Space" title="Lecture (Espace)" disabled>▶ Lecture</button>
    <button type="button" class="btn" data-command="pause" aria-keyshortcuts="Space" title="Pause (Espace)" disabled>⏸ Pause</button>
    <button type="button" class="btn" data-command="step" aria-keyshortcuts="ArrowRight" title="Pas à pas (flèche droite)" disabled>⏭ Pas à pas</button>
    <label class="field speed-field">
      Vitesse
      <input type="range" data-command="speed" min="${MIN_SPEED}" max="${MAX_SPEED}" step="${SPEED_STEP}" value="1" disabled>
      <output class="speed-value" data-role="speed">${formatSpeed(1)}</output>
    </label>
    <button type="button" class="btn" data-command="reset" aria-keyshortcuts="R" title="Réinitialiser (R)" disabled>↺ Réinitialiser</button>
  </div>
  <div class="controls-status">
    <span class="sim-status" data-role="status" data-status="${UNAVAILABLE}" role="status">${UNAVAILABLE_LABEL}</span>
    <span class="sim-time" title="Temps simulé">t = <span data-role="time">${formatTime(Number.NaN)}</span></span>
  </div>
  <p class="controls-error" data-role="error" role="alert" hidden></p>
`;

/**
 * @param {object} container élément #controls (sous Node : un faux conteneur { innerHTML })
 * @param {object} app objet partagé (app.sim)
 * @returns {object} API du module : getView, refresh, run, destroy
 */
export function mount(container, app) {
  container.innerHTML = TEMPLATE;

  // Sous Node (tests) le conteneur n'a pas d'API DOM : la barre est écrite mais non branchée.
  const hasDom = typeof container.querySelector === 'function';
  const find = (selector) => (hasDom ? container.querySelector(selector) : null);
  const buttons = Object.fromEntries(['play', 'pause', 'step', 'reset']
    .map((name) => [name, find(`button[data-command="${name}"]`)]));
  const slider = find('input[data-command="speed"]');
  const speedValue = find('[data-role="speed"]');
  const statusLabel = find('[data-role="status"]');
  const timeLabel = find('[data-role="time"]');
  const errorLabel = find('[data-role="error"]');

  // Valeurs écrites avec textContent : l'erreur vient d'un protocole, donc d'un scénario.
  const render = (view) => {
    for (const [name, button] of Object.entries(buttons)) {
      if (button) button.disabled = !view.enabled[name];
    }
    if (slider) {
      slider.disabled = !view.enabled.speed;
      if (Number(slider.value) !== view.speed) slider.value = String(view.speed);
    }
    if (speedValue) speedValue.textContent = view.speedLabel;
    if (statusLabel) {
      statusLabel.textContent = view.statusLabel;
      statusLabel.dataset.status = view.status;
    }
    if (timeLabel) timeLabel.textContent = view.time;
    if (errorLabel) {
      errorLabel.hidden = !view.error;
      errorLabel.textContent = view.error ? `Erreur de la simulation : ${view.error}` : '';
    }
  };

  const controller = createControlsController(app, { onChange: render });
  render(controller.getView());

  const listeners = [];
  const listen = (target, type, handler) => {
    if (typeof target?.addEventListener !== 'function') return;
    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener(type, handler));
  };

  listen(hasDom ? container : null, 'click', (event) => {
    const button = event.target?.closest?.('button[data-command]');
    if (button && !button.disabled) controller.run(button.dataset.command);
  });
  listen(slider, 'input', () => controller.run('speed', slider.value));

  // Espace sur un bouton de la barre (resté au focus après un clic) doit faire lecture/pause,
  // et non « recliquer » ce bouton : on traite la touche comme hors bouton et on bloque le clic
  // natif, que le navigateur déclenche au relâchement de la touche.
  const isOwnButton = (target) => String(target?.tagName ?? '').toUpperCase() === 'BUTTON'
    && typeof container.contains === 'function' && container.contains(target);
  const doc = container.ownerDocument ?? (hasDom ? globalThis.document : null);
  listen(doc, 'keydown', (event) => {
    if (event.defaultPrevented) return;
    const own = isSpace(event.key) && isOwnButton(event.target);
    const key = {
      key: event.key, ctrlKey: event.ctrlKey, altKey: event.altKey, metaKey: event.metaKey,
      repeat: event.repeat, target: own ? null : event.target,
    };
    if (controller.handleKey(key)) event.preventDefault();
  });
  listen(doc, 'keyup', (event) => {
    if (controller.usable && isSpace(event.key) && isOwnButton(event.target)) event.preventDefault();
  });

  return {
    getView: controller.getView,
    refresh: controller.refresh,
    run: controller.run,
    destroy() {
      for (const off of listeners.splice(0)) off();
      controller.destroy();
    },
  };
}
