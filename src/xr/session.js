// Pôle xr (Ayoub) : détection de la WebXR Device API, statut affiché dans #xr-slot,
// entrée et sortie de la session immersive-vr.
//
// Sans casque, on teste dans Chrome avec l'extension Immersive Web Emulator (cahier §3.2).
// Si WebXR est absente, le statut l'indique et l'application reste en mode 2D (souris / tactile).
//
// La détection est séparée de l'affichage : detectCapabilities() et describeStatus() sont
// testables sous Node avec un faux environnement (voir session.test.js).

/** Fonctionnalités demandées à l'ouverture de la session (facultatives : la session s'ouvre sans). */
export const SESSION_OPTIONS = Object.freeze({ optionalFeatures: ['local-floor', 'bounded-floor'] });

async function supports(xr, mode) {
  try {
    return Boolean(await xr.isSessionSupported(mode));
  } catch {
    return false; // ex. bloqué par une politique de permissions
  }
}

/**
 * Détecte ce que le navigateur sait faire.
 * @param {object} [env] globalThis par défaut ; un faux objet dans les tests
 * @returns {Promise<{ secureContext: boolean, webxr: boolean, immersiveVR: boolean,
 *   immersiveAR: boolean, webgpu: boolean, webgl2: boolean }>}
 */
export async function detectCapabilities(env = globalThis) {
  const navigator = env.navigator ?? {};
  const xr = navigator.xr;
  const webxr = Boolean(xr && typeof xr.isSessionSupported === 'function');

  let webgl2 = false;
  try {
    webgl2 = Boolean(env.document?.createElement?.('canvas')?.getContext?.('webgl2'));
  } catch {
    webgl2 = false;
  }

  return {
    secureContext: env.isSecureContext === true,
    webxr,
    immersiveVR: webxr ? await supports(xr, 'immersive-vr') : false,
    immersiveAR: webxr ? await supports(xr, 'immersive-ar') : false,
    webgpu: Boolean(navigator.gpu),
    webgl2,
  };
}

/**
 * Statut principal affiché à l'utilisateur.
 * @returns {{ state: 'vr' | 'no-vr' | 'insecure' | 'absent', label: string, hint: string }}
 */
export function describeStatus(caps) {
  if (!caps.secureContext) {
    return {
      state: 'insecure',
      label: 'WebXR non détectée',
      hint: 'WebXR exige HTTPS (ou localhost). Ouvrez le site GitHub Pages en https://. Mode 2D actif.',
    };
  }
  if (!caps.webxr) {
    return {
      state: 'absent',
      label: 'WebXR non détectée',
      hint: 'Ce navigateur ne fournit pas la WebXR Device API. Mode 2D actif. Pour tester la VR : Chrome + extension Immersive Web Emulator.',
    };
  }
  if (!caps.immersiveVR) {
    return {
      state: 'no-vr',
      label: 'WebXR détectée',
      hint: 'L\'API est présente mais aucun casque (réel ou émulé) n\'accepte une session immersive-vr. Activez un appareil dans Immersive Web Emulator.',
    };
  }
  return {
    state: 'vr',
    label: 'WebXR détectée',
    hint: 'Session immersive-vr disponible : cliquez sur « Entrer en VR ».',
  };
}

/** Lignes du détail technique (une par capacité testée). */
export function capabilityRows(caps) {
  const yes = (value, onText = 'détecté', offText = 'non détecté') => (value ? onText : offText);
  return [
    { label: 'Contexte sécurisé (HTTPS)', ok: caps.secureContext, value: yes(caps.secureContext, 'oui', 'non') },
    { label: 'WebXR Device API (navigator.xr)', ok: caps.webxr, value: yes(caps.webxr, 'détectée', 'non détectée') },
    { label: 'Session immersive-vr', ok: caps.immersiveVR, value: yes(caps.immersiveVR, 'prise en charge', 'non prise en charge') },
    { label: 'Session immersive-ar (option F10)', ok: caps.immersiveAR, value: yes(caps.immersiveAR, 'prise en charge', 'non prise en charge') },
    { label: 'WebGL 2 (rendu utilisé)', ok: caps.webgl2, value: yes(caps.webgl2, 'disponible', 'indisponible') },
    { label: 'WebGPU (navigator.gpu)', ok: caps.webgpu, value: caps.webgpu ? 'détecté, non utilisé (voir décision)' : 'non détecté' },
  ];
}

/**
 * Affiche le statut et le bouton VR dans #xr-slot.
 * @param {HTMLElement} container élément #xr-slot
 * @param {object} app objet partagé (app.render.startXR est utilisé pour afficher la scène en VR)
 * @param {object} [env] globalThis par défaut
 * @param {{ onSessionStart?: (session: object) => void, onSessionEnd?: () => void }} [hooks]
 *   appelés quand la scène est affichée dans le casque, puis à la fin de la session (interface VR)
 */
export async function mount(container, app, env = globalThis, hooks = {}) {
  const doc = container.ownerDocument;
  let caps = await detectCapabilities(env);
  let session = null;

  container.textContent = '';
  const wrapper = doc.createElement('div');
  wrapper.className = 'xr-status';

  const details = doc.createElement('details');
  details.className = 'xr-details';
  const summary = doc.createElement('summary');
  summary.className = 'xr-badge';
  const dot = doc.createElement('span');
  dot.className = 'xr-dot';
  dot.setAttribute('aria-hidden', 'true');
  const text = doc.createElement('span');
  summary.append(dot, text);
  const panel = doc.createElement('div');
  panel.className = 'xr-panel';
  const hint = doc.createElement('p');
  hint.className = 'xr-hint';
  const list = doc.createElement('dl');
  list.className = 'xr-list';
  panel.append(hint, list);
  details.append(summary, panel);

  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-primary xr-button';

  wrapper.append(details, button);
  container.append(wrapper);

  const canRender = typeof app?.render?.startXR === 'function';

  function render() {
    const status = describeStatus(caps);
    wrapper.dataset.state = status.state;
    text.textContent = status.label;
    summary.title = status.hint;
    hint.textContent = status.hint;
    list.textContent = '';
    for (const row of capabilityRows(caps)) {
      const dt = doc.createElement('dt');
      dt.textContent = row.label;
      const dd = doc.createElement('dd');
      dd.textContent = row.value;
      dd.dataset.ok = String(row.ok);
      list.append(dt, dd);
    }
    if (session) {
      button.textContent = 'Quitter la VR';
      button.disabled = false;
    } else {
      button.textContent = 'Entrer en VR';
      button.disabled = status.state !== 'vr' || !canRender;
      button.title = !canRender ? 'Scène 3D indisponible' : status.hint;
    }
  }

  async function enter() {
    if (session) return;
    try {
      session = await env.navigator.xr.requestSession('immersive-vr', SESSION_OPTIONS);
      session.addEventListener('end', () => {
        session = null;
        // Sortie par le bouton, par le casque ou par l'émulateur : on démonte l'interface VR.
        try {
          hooks.onSessionEnd?.();
        } catch (error) {
          console.error('Interface VR non démontée :', error);
        }
        render();
      });
      render();
      await app.render.startXR(session);
      if (session) hooks.onSessionStart?.(session);
    } catch (error) {
      console.error('Session VR non ouverte :', error);
      // Session ouverte mais affichage impossible : on la referme pour revenir proprement en 2D.
      const opened = session;
      session = null;
      opened?.end?.().catch?.(() => {});
      render();
    }
  }

  async function exit() {
    await session?.end();
  }

  button.addEventListener('click', () => (session ? exit() : enter()));

  // L'émulateur peut brancher ou débrancher un casque après le chargement.
  env.navigator?.xr?.addEventListener?.('devicechange', async () => {
    caps = await detectCapabilities(env);
    render();
  });

  render();
  return {
    getCapabilities: () => ({ ...caps }),
    getStatus: () => describeStatus(caps),
    isPresenting: () => session !== null,
    enter,
    exit,
  };
}
