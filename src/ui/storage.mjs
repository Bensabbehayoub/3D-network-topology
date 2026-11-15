// Ramy (phase 7c) : enregistrement des topologies construites dans le navigateur, et fichiers JSON.
//
// - Brouillon : la topologie en construction est gardée à chaque modification (clé DRAFT_KEY) et
//   retrouvée au prochain passage en mode Construire, même après un rechargement de la page.
// - Topologies nommées : liste dans LIBRARY_KEY ({ version, items: [{ name, savedAt, scenario }] }).
// - Export : texte JSON au format des scénarios (docs/simulation/contrats.md §1) ; import : le même
//   format, validé, de 1 Mo au plus. Un scénario fourni (scenarios/*.json) s'importe aussi.
//
// Le stockage est injecté (localStorage dans le navigateur, faux stockage dans les tests). Il peut
// être indisponible (navigation privée, stockage plein ou bloqué) : chaque fonction renvoie alors
// un message clair au lieu d'échouer.

import { fromScenario, validateScenario } from '../../simulation.js';

export const DRAFT_KEY = 'topologie3d.brouillon';
export const LIBRARY_KEY = 'topologie3d.topologies';
export const MAX_IMPORT = 1024 * 1024;
export const MAX_NAME = 40;
export const UNAVAILABLE = 'Stockage du navigateur indisponible (navigation privée, stockage plein ou bloqué) : utilisez « Exporter en JSON » pour garder votre topologie.';

const safeStorage = (storage) => {
  try {
    return storage ?? globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** Nom de fichier sans accents ni espaces : « Réseau de l'école » → topologie-reseau-de-l-ecole.json. */
export function fileName(title) {
  const slug = String(title ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `topologie-${slug || 'sans-nom'}.json`;
}

/** Texte JSON d'une topologie, lisible (indenté). */
export function exportJson(scenario) {
  return `${JSON.stringify(scenario, null, 2)}\n`;
}

/**
 * Lit un fichier JSON importé.
 * @returns {{ ok: true, scenario: object } | { ok: false, errors: string[] }}
 */
export function parseImport(text) {
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, errors: ['Le fichier est vide.'] };
  if (text.length > MAX_IMPORT) return { ok: false, errors: ['Le fichier dépasse 1 Mo : ce n\'est pas une topologie.'] };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['Ce fichier n\'est pas du JSON valide.'] };
  }
  const { ok, errors } = validateScenario(data);
  if (!ok) return { ok: false, errors: ['Ce fichier n\'est pas une topologie valide :', ...errors.slice(0, 5), ...(errors.length > 5 ? [`… et ${errors.length - 5} autre(s) erreur(s).`] : [])] };
  return { ok: true, scenario: data.protocol === 'aucun' ? data : fromScenario(data) };
}

/**
 * @param {Storage | null} [storage] localStorage par défaut
 * @param {() => Date} [now]
 */
export function createTopologyStore(storage, now = () => new Date()) {
  const read = (key) => {
    const store = safeStorage(storage);
    if (!store) return { ok: false, error: UNAVAILABLE };
    try {
      return { ok: true, value: store.getItem(key) };
    } catch {
      return { ok: false, error: UNAVAILABLE };
    }
  };
  const write = (key, value) => {
    const store = safeStorage(storage);
    if (!store) return { ok: false, error: UNAVAILABLE };
    try {
      if (value === null) store.removeItem(key);
      else store.setItem(key, value);
      return { ok: true };
    } catch {
      return { ok: false, error: UNAVAILABLE };
    }
  };
  const library = () => {
    const raw = read(LIBRARY_KEY);
    if (!raw.ok) return raw;
    try {
      const data = raw.value ? JSON.parse(raw.value) : { version: 1, items: [] };
      return { ok: true, items: Array.isArray(data?.items) ? data.items.filter((item) => item && typeof item.name === 'string' && item.scenario) : [] };
    } catch {
      return { ok: true, items: [] }; // contenu abîmé : on repart d'une liste vide
    }
  };

  return {
    /** Brouillon enregistré, ou null (absent, abîmé ou stockage indisponible). */
    loadDraft() {
      const raw = read(DRAFT_KEY);
      if (!raw.ok || !raw.value) return null;
      const parsed = parseImport(raw.value);
      return parsed.ok ? parsed.scenario : null;
    },
    saveDraft: (scenario) => write(DRAFT_KEY, JSON.stringify(scenario)),
    clearDraft: () => write(DRAFT_KEY, null),

    /** Topologies enregistrées, de la plus récente à la plus ancienne : [{ name, savedAt, devices }]. */
    list() {
      const result = library();
      if (!result.ok) return result;
      return { ok: true, items: [...result.items].sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)))
        .map((item) => ({ name: item.name, savedAt: item.savedAt, devices: item.scenario.devices?.length ?? 0 })) };
    },
    /** Enregistre (ou remplace) la topologie sous ce nom. */
    save(name, scenario) {
      const clean = String(name ?? '').trim();
      if (!clean) return { ok: false, error: 'Donnez un nom à la topologie.' };
      if (clean.length > MAX_NAME) return { ok: false, error: `Le nom ne doit pas dépasser ${MAX_NAME} caractères.` };
      const result = library();
      if (!result.ok) return result;
      const items = result.items.filter((item) => item.name !== clean);
      items.push({ name: clean, savedAt: now().toISOString(), scenario: { ...scenario, title: clean } });
      const written = write(LIBRARY_KEY, JSON.stringify({ version: 1, items }));
      return written.ok ? { ok: true, replaced: items.length === result.items.length } : written;
    },
    /** Topologie enregistrée sous ce nom, validée. */
    open(name) {
      const result = library();
      if (!result.ok) return result;
      const item = result.items.find((candidate) => candidate.name === name);
      if (!item) return { ok: false, error: `Aucune topologie « ${name} ».` };
      const parsed = parseImport(JSON.stringify(item.scenario));
      return parsed.ok ? { ok: true, scenario: parsed.scenario } : { ok: false, error: `La topologie « ${name} » est abîmée et ne peut pas être ouverte.` };
    },
    remove(name) {
      const result = library();
      if (!result.ok) return result;
      return write(LIBRARY_KEY, JSON.stringify({ version: 1, items: result.items.filter((item) => item.name !== name) }));
    },
  };
}
