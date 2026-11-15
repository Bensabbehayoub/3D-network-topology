// Pôle sim : bibliothèque des scénarios proposés dans l'application.
//
// scenarios/index.json liste, dans l'ordre d'affichage, les identifiants des scénarios terminés :
//   { "scenarios": ["arp", "ping", "routage", "ttl"] }
// Chaque identifiant correspond au fichier scenarios/<id>.json. Un fichier absent de la liste
// est une ébauche : il n'est pas proposé. Un scénario invalide ou introuvable est écarté (avec
// son erreur), sans empêcher les autres de se charger.

import { assertScenario } from './scenario.js';

/** Dossier des scénarios, relatif à ce module : fonctionne sous /3D-network-topology/ comme en local. */
export const SCENARIOS_BASE = new URL('../../scenarios/', import.meta.url);

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} : HTTP ${response.status}`);
  return response.json();
}

/**
 * @param {{ base?: URL, readJson?: (url: URL) => Promise<unknown> }} [options]
 *   readJson : lecture d'un fichier JSON (fetch par défaut ; les tests sous Node lisent le disque)
 */
export function createScenarioLibrary({ base = SCENARIOS_BASE, readJson = fetchJson } = {}) {
  return {
    /**
     * Charge et valide tous les scénarios de l'index.
     * @returns {Promise<{ scenarios: object[], errors: string[] }>}
     */
    async loadAll() {
      const errors = [];
      let ids = [];
      try {
        const index = await readJson(new URL('index.json', base));
        ids = Array.isArray(index?.scenarios) ? index.scenarios.filter((id) => typeof id === 'string') : [];
        if (ids.length === 0) errors.push('scenarios/index.json : liste "scenarios" vide ou absente');
      } catch (error) {
        errors.push(`scenarios/index.json illisible : ${error.message}`);
      }
      const scenarios = [];
      for (const id of ids) {
        try {
          const scenario = assertScenario(await readJson(new URL(`${id}.json`, base)));
          if (scenario.id !== id) throw new Error(`l'id du fichier vaut "${scenario.id}"`);
          scenarios.push(scenario);
        } catch (error) {
          errors.push(`scenarios/${id}.json : ${error.message}`);
        }
      }
      return { scenarios, errors };
    },
  };
}

/** Résumé d'un scénario pour une liste de choix. */
export function summarize(scenario) {
  return Object.freeze({
    id: scenario.id,
    title: scenario.title,
    protocol: scenario.protocol,
    description: scenario.description ?? '',
  });
}
