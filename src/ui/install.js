// Ramy : installation de la PWA et indicateur « hors ligne », dans #install-slot.
//
// - Bouton « Installer » : masqué quand l'application est déjà installée (fenêtre autonome).
//   Si le navigateur a proposé l'installation (évènement beforeinstallprompt, Chrome et Edge),
//   le clic ouvre l'invite du navigateur. Sinon, le clic explique comment installer à la main,
//   ou pourquoi ce n'est pas possible ici.
// - Badge « Hors ligne » : suit les évènements online / offline de la fenêtre.
//
// Découpage pour les tests sous Node (pas de DOM) :
//   installView()             ce qu'il faut afficher pour un état donné (pur)
//   manualInstallHint()       explication adaptée au navigateur (pur)
//   createInstallController() écoute la fenêtre et tient l'état, sans DOM
//   mount()                   écrit le bouton et le badge, et les relie au contrôleur

/** Durée d'affichage d'un message avant qu'il ne se referme tout seul (ms). */
export const MESSAGE_DURATION = 9000;

export const MESSAGES = Object.freeze({
  accepted: 'Installation lancée : l\'application va s\'ouvrir dans sa propre fenêtre.',
  dismissed: 'Installation annulée. Vous pouvez la relancer plus tard avec ce bouton ou depuis le menu du navigateur.',
  installed: 'Application installée. Elle fonctionne aussi hors ligne.',
  failed: 'L\'installation n\'a pas pu démarrer. Essayez depuis le menu du navigateur.',
  insecure: 'L\'installation exige HTTPS (ou localhost). Ouvrez le site en https://.',
  ios: 'Sur iPhone ou iPad : bouton Partager, puis « Sur l\'écran d\'accueil ».',
  manual: 'Ce navigateur ne propose pas l\'installation directe. Cherchez « Installer » ou « Ajouter à l\'écran d\'accueil » dans son menu. Chrome et Edge la proposent en un clic.',
  pending: 'Le navigateur n\'a pas encore proposé l\'installation. Rechargez la page, ou utilisez « Installer » dans son menu.',
});

/** L'application tourne-t-elle déjà comme application installée ? */
export function isStandalone(env) {
  try {
    if (env?.navigator?.standalone === true) return true; // Safari iOS
    return ['standalone', 'fullscreen', 'minimal-ui']
      .some((mode) => env?.matchMedia?.(`(display-mode: ${mode})`)?.matches === true);
  } catch {
    return false;
  }
}

/** Explication quand le navigateur n'a pas proposé d'invite d'installation. */
export function manualInstallHint(env) {
  if (env?.isSecureContext === false) return MESSAGES.insecure;
  const agent = String(env?.navigator?.userAgent ?? '');
  const touchMac = /Macintosh/.test(agent) && Number(env?.navigator?.maxTouchPoints) > 1; // iPad récent
  if (/iPhone|iPad|iPod/.test(agent) || touchMac) return MESSAGES.ios;
  // Chrome et Edge émettent beforeinstallprompt : s'il n'est pas (encore) venu, on le dit.
  if (env && 'onbeforeinstallprompt' in env) return MESSAGES.pending;
  return MESSAGES.manual;
}

/**
 * Affichage pour un état donné (fonction pure).
 * @param {{ installed: boolean, canPrompt: boolean, offline: boolean, message: string | null }} state
 */
export function installView(state) {
  return {
    showButton: !state.installed,
    buttonTitle: state.canPrompt
      ? 'Installer l\'application sur cet appareil'
      : 'Comment installer l\'application',
    offline: state.offline,
    message: state.message,
  };
}

/**
 * Contrôleur sans DOM.
 * @param {object} [env] fenêtre du navigateur (un faux objet dans les tests)
 * @param {{ onChange?: (view: ReturnType<typeof installView>) => void }} [options]
 */
export function createInstallController(env = globalThis, { onChange } = {}) {
  let deferredPrompt = null; // évènement beforeinstallprompt gardé pour le clic
  const state = {
    installed: isStandalone(env),
    canPrompt: false,
    offline: env?.navigator?.onLine === false,
    message: null,
  };

  const update = (changes) => {
    Object.assign(state, changes);
    onChange?.(installView(state));
  };

  const handlers = {
    beforeinstallprompt(event) {
      event.preventDefault?.(); // pas de mini-bandeau du navigateur : on propose notre bouton
      deferredPrompt = event;
      update({ canPrompt: true, installed: false });
    },
    appinstalled() {
      deferredPrompt = null;
      update({ installed: true, canPrompt: false, message: MESSAGES.installed });
    },
    online: () => update({ offline: false }),
    offline: () => update({ offline: true }),
  };

  const canListen = typeof env?.addEventListener === 'function';
  if (canListen) {
    for (const [type, handler] of Object.entries(handlers)) env.addEventListener(type, handler);
  }

  /**
   * Clic sur « Installer ».
   * @returns {Promise<'accepted' | 'dismissed' | 'failed' | 'unavailable'>}
   */
  async function install() {
    if (!deferredPrompt) {
      update({ message: manualInstallHint(env) });
      return 'unavailable';
    }
    // L'invite ne sert qu'une fois : le navigateur en émettra une nouvelle si besoin.
    const prompt = deferredPrompt;
    deferredPrompt = null;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      const outcome = choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
      update({ canPrompt: false, message: MESSAGES[outcome] });
      return outcome;
    } catch (error) {
      console.error('Installation : invite impossible :', error);
      update({ canPrompt: false, message: MESSAGES.failed });
      return 'failed';
    }
  }

  return {
    getView: () => installView(state),
    install,
    dismissMessage: () => update({ message: null }),
    destroy() {
      if (!canListen || typeof env.removeEventListener !== 'function') return;
      for (const [type, handler] of Object.entries(handlers)) env.removeEventListener(type, handler);
    },
  };
}

const TEMPLATE = `
  <span class="offline-badge" data-role="offline" role="status" hidden>Hors ligne</span>
  <button type="button" class="btn btn-install" data-role="install" aria-describedby="install-message" hidden>⤓ Installer</button>
  <p class="install-message" id="install-message" data-role="message" role="status" hidden></p>
`;

/**
 * @param {object} container élément #install-slot (sous Node : un faux conteneur { innerHTML })
 * @param {object} app objet partagé (non utilisé)
 * @param {{ env?: object }} [services] env : fenêtre à observer (tests)
 * @returns {object} API du module : getView, install, destroy
 */
export function mount(container, app, { env = globalThis } = {}) {
  container.innerHTML = TEMPLATE;

  const hasDom = typeof container.querySelector === 'function';
  const find = (role) => (hasDom ? container.querySelector(`[data-role="${role}"]`) : null);
  const button = find('install');
  const badge = find('offline');
  const message = find('message');
  let timer = null;

  const render = (view) => {
    if (button) {
      button.hidden = !view.showButton;
      button.title = view.buttonTitle;
    }
    if (badge) badge.hidden = !view.offline;
    if (message) {
      message.hidden = !view.message;
      message.textContent = view.message ?? '';
    }
    // Le message se referme tout seul ; un nouveau message relance le délai.
    clearTimeout(timer);
    if (view.message && hasDom) timer = setTimeout(() => controller.dismissMessage(), MESSAGE_DURATION);
  };

  const controller = createInstallController(hasDom ? env : null, { onChange: render });
  render(controller.getView());

  const onClick = () => {
    if (controller.getView().message) controller.dismissMessage(); // second clic : referme
    else controller.install();
  };
  button?.addEventListener?.('click', onClick);

  return {
    getView: controller.getView,
    install: controller.install,
    destroy() {
      clearTimeout(timer);
      button?.removeEventListener?.('click', onClick);
      controller.destroy();
    },
  };
}
