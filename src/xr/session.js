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

/**
 * Options de session : SESSION_OPTIONS, plus les fonctionnalités demandées par le rendu
 * (« webgpu » : voie native de la VR en WebGPU, voir src/render/renderers.js).
 * @param {string[]} [extra] app.render.xrSessionFeatures()
 */
export function sessionOptions(extra = []) {
  const optionalFeatures = [...new Set([...SESSION_OPTIONS.optionalFeatures, ...(Array.isArray(extra) ? extra : [])])];
  return { optionalFeatures };
}

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
 * Rendu 100 % WebGPU : on ne teste pas WebGL (le tester créerait un contexte WebGL).
 * @returns {Promise<{ secureContext: boolean, webxr: boolean, immersiveVR: boolean,
 *   immersiveAR: boolean, webgpu: boolean, xrGPUBinding: boolean }>}
 */
export async function detectCapabilities(env = globalThis) {
  const navigator = env.navigator ?? {};
  const xr = navigator.xr;
  const webxr = Boolean(xr && typeof xr.isSessionSupported === 'function');

  return {
    secureContext: env.isSecureContext === true,
    webxr,
    immersiveVR: webxr ? await supports(xr, 'immersive-vr') : false,
    immersiveAR: webxr ? await supports(xr, 'immersive-ar') : false,
    webgpu: Boolean(navigator.gpu),
    // API WebXR/WebGPU du navigateur ; le pont de l'émulateur (src/render/xrBridge.js) n'est pas compté.
    xrGPUBinding: typeof env.XRGPUBinding === 'function' && env.XRGPUBinding.isTopologyBridge !== true,
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

/**
 * Lignes du détail technique (une par capacité testée).
 * @param {object} caps résultat de detectCapabilities
 * @param {{ classic: string | null, xr: { backend: string, path: string } | null } | null} [rendering]
 *   rendu réellement utilisé (app.render.getRenderingInfo()), absent si la scène n'est pas chargée
 */
export function capabilityRows(caps, rendering = null) {
  const yes = (value, onText = 'détecté', offText = 'non détecté') => (value ? onText : offText);
  return [
    { label: 'Contexte sécurisé (HTTPS)', ok: caps.secureContext, value: yes(caps.secureContext, 'oui', 'non') },
    { label: 'WebXR Device API (navigator.xr)', ok: caps.webxr, value: yes(caps.webxr, 'détectée', 'non détectée') },
    { label: 'Session immersive-vr', ok: caps.immersiveVR, value: yes(caps.immersiveVR, 'prise en charge', 'non prise en charge') },
    { label: 'Session immersive-ar (option F10)', ok: caps.immersiveAR, value: yes(caps.immersiveAR, 'prise en charge', 'non prise en charge') },
    { label: 'WebGPU (navigator.gpu)', ok: caps.webgpu, value: yes(caps.webgpu, 'détecté', 'non détecté : WebGPU requis') },
    { label: 'XRGPUBinding (WebXR + WebGPU)', ok: true, value: caps.xrGPUBinding ? 'fourni par le navigateur' : 'fourni par le pont de l\'émulateur' },
    { label: 'Rendu en mode classique', ok: Boolean(rendering?.classic), value: classicRenderingText(rendering) },
    { label: 'Rendu en VR', ok: caps.immersiveVR && Boolean(rendering?.classic), value: xrRenderingText(rendering) },
  ];
}

function classicRenderingText(rendering) {
  if (!rendering?.classic) return 'scène 3D indisponible (WebGPU requis)';
  return `${rendering.classic} (WebGPURenderer)`;
}

function xrRenderingText(rendering) {
  if (!rendering?.classic) return 'indisponible (WebGPU requis)';
  if (rendering.xr) return `${rendering.xr.backend} — ${rendering.xr.path === 'natif' ? 'XRGPUBinding du navigateur' : 'pont WebGPU de l\'émulateur'}`;
  return 'WebGPU (WebGPURenderer), aucun contexte WebGL';
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
    for (const row of capabilityRows(caps, app?.render?.getRenderingInfo?.() ?? null)) {
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
      session = await env.navigator.xr.requestSession('immersive-vr', sessionOptions(app.render.xrSessionFeatures?.()));
      session.addEventListener('end', () => {
        session = null;
        // Sortie par le bouton, par le casque ou par l'émulateur : on démonte l'interface VR.
        try {
          hooks.onSessionEnd?.();
        } catch (error) {
          console.error('Interface VR non démontée :', error);
        }
        render();
        // Le pôle render apprend la fin de session par un écouteur posé après celui-ci : on
        // redessine une fois de plus, ensuite, pour que le détail n'affiche plus le rendu VR.
        setTimeout(render, 0);
      });
      render();
      await app.render.startXR(session);
      render(); // le détail affiche maintenant le rendu choisi pour la VR
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
