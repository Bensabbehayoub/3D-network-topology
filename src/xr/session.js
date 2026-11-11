// Ayoub : détection de la WebXR Device API et statut affiché dans #xr-slot.
// Ayoub (S4) : le bouton « Entrer en VR » et la session immersive-vr s'ajouteront ici.

/** Résultats possibles de la détection. */
export const XR_STATUS = Object.freeze({
  VR: 'vr', // navigator.xr présent et session immersive-vr prise en charge
  API_ONLY: 'api-only', // navigator.xr présent, mais pas de VR immersive (aucun casque ni émulateur)
  ABSENT: 'absent', // aucune WebXR Device API
});

const TEXTS = {
  [XR_STATUS.VR]: {
    label: 'WebXR : détectée',
    detail: 'La WebXR Device API est disponible et la VR immersive est prise en charge.',
  },
  [XR_STATUS.API_ONLY]: {
    label: 'WebXR : détectée',
    detail:
      "La WebXR Device API est disponible, mais aucun casque VR n'est prêt. " +
      'Sur ordinateur, installez Immersive Web Emulator.',
  },
  [XR_STATUS.ABSENT]: {
    label: 'WebXR : non détectée',
    detail: "Ce navigateur ne fournit pas la WebXR Device API : l'application reste en mode 2D.",
  },
};

const INSECURE_DETAIL =
  'WebXR exige une page sécurisée (HTTPS ou localhost) : ouvrez la version GitHub Pages.';

/**
 * Détecte la WebXR Device API.
 * @param {object} [nav] objet navigator (injectable pour les tests)
 * @param {{ secure?: boolean }} [options] secure : la page est-elle un contexte sécurisé ?
 * @returns {Promise<{ status: string, api: boolean, immersiveVr: boolean, secure: boolean,
 *   label: string, detail: string }>}
 */
export async function detectXR(nav = globalThis.navigator, { secure = globalThis.isSecureContext !== false } = {}) {
  const api = Boolean(nav?.xr && typeof nav.xr.isSessionSupported === 'function');
  let immersiveVr = false;
  if (api) {
    try {
      immersiveVr = (await nav.xr.isSessionSupported('immersive-vr')) === true;
    } catch {
      // Refus du navigateur (politique de permissions…) : on considère la VR indisponible.
      immersiveVr = false;
    }
  }

  const status = !api ? XR_STATUS.ABSENT : immersiveVr ? XR_STATUS.VR : XR_STATUS.API_ONLY;
  const { label, detail } = TEXTS[status];
  return {
    status,
    api,
    immersiveVr,
    secure,
    label,
    detail: status === XR_STATUS.ABSENT && !secure ? INSECURE_DETAIL : detail,
  };
}

/**
 * Affiche le résultat de la détection dans son conteneur (#xr-slot).
 * Les textes sont des constantes du module : aucune donnée extérieure n'est injectée.
 * @param {{ innerHTML: string, dataset?: object }} container
 * @param {Awaited<ReturnType<typeof detectXR>>} result
 */
export function renderStatus(container, result) {
  const detected = result.status !== XR_STATUS.ABSENT;
  const color = detected ? 'var(--accent)' : 'var(--danger)';
  if (container.dataset) container.dataset.xrStatus = result.status;
  container.innerHTML =
    `<span class="xr-status" role="status" title="${result.detail}" ` +
    `style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;` +
    `border:1px solid ${color};border-radius:999px;font-size:.85rem;white-space:nowrap">` +
    `<span aria-hidden="true" style="width:8px;height:8px;border-radius:50%;background:${color}"></span>` +
    `${result.label}<span class="sr-only"> — ${result.detail}</span></span>`;
}

/**
 * Détecte WebXR, affiche le statut, puis le met à jour si un casque est branché ou retiré.
 * @param {object} container élément #xr-slot
 * @param {object} [nav]
 */
export async function mountStatus(container, nav = globalThis.navigator) {
  let result = await detectXR(nav);
  renderStatus(container, result);
  nav?.xr?.addEventListener?.('devicechange', async () => {
    result = await detectXR(nav);
    renderStatus(container, result);
  });
  return { getStatus: () => result };
}
