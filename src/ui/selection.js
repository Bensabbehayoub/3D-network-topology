// Ramy (S2) : sélection d'un équipement de la topologie.
//
// Pas de lancer de rayon ici : le pôle render (Aziz) le fait déjà au clic ou au toucher et émet
// l'évènement 'topology:device-selected' ({ detail: { id, device } }) sur l'élément #scene.
// Le pôle xr (Ayoub) appelle app.ui.select(id) après son propre lancer de rayon en VR.
//
// Ce module tient l'état « quel équipement est sélectionné » et prévient les abonnés
// (panneau d'infos, tâche 19). La surbrillance passe par app.render.highlightDevice(id, mode).
//
// Découpage pour les tests sous Node (pas de DOM) :
//   createSelection()  état de la sélection et abonnés (pur, aucune dépendance)
//   attachSelection()  branchements : clic dans la scène, touche Échap, changement de scénario

import { TOPICS } from '../../simulation.js';
import { isEditable } from './keyboard.js';

/** Évènement émis par le pôle render sur #scene quand on clique sur un équipement. */
export const DEVICE_SELECTED_EVENT = 'topology:device-selected';

/**
 * Gestionnaire de sélection (un seul équipement à la fois).
 * @param {object} [options]
 * @param {(id: string, mode: 'selected' | 'normal') => unknown} [options.highlight] surbrillance (pôle render)
 * @param {(id: string) => boolean} [options.isKnown] l'équipement existe-t-il ? (refuse les id inconnus)
 */
export function createSelection({ highlight, isKnown = () => true } = {}) {
  let current = null;
  const listeners = new Set();

  // La surbrillance est un confort visuel : son échec ne doit jamais bloquer la sélection.
  const paint = (id, mode) => {
    if (id === null || typeof highlight !== 'function') return;
    try {
      highlight(id, mode);
    } catch (error) {
      console.error(`Surbrillance de "${id}" impossible :`, error);
    }
  };

  const notify = (previous) => {
    for (const listener of [...listeners]) {
      try {
        listener(current, previous);
      } catch (error) {
        console.error('Abonné à la sélection en échec :', error);
      }
    }
  };

  /**
   * Sélectionne un équipement (remplace la sélection précédente).
   * @param {string} id identifiant de l'équipement (scénario)
   * @returns {boolean} false si l'id est invalide ou inconnu
   */
  function select(id) {
    if (typeof id !== 'string' || id.trim() === '') return false;
    let known = false;
    try {
      known = Boolean(isKnown(id));
    } catch {
      known = false;
    }
    if (!known) return false;
    if (id === current) return true;
    const previous = current;
    paint(previous, 'normal');
    current = id;
    paint(current, 'selected');
    notify(previous);
    return true;
  }

  /** @returns {boolean} true si une sélection a été retirée */
  function clear() {
    if (current === null) return false;
    const previous = current;
    paint(previous, 'normal');
    current = null;
    notify(previous);
    return true;
  }

  /**
   * @param {(id: string | null, previous: string | null) => void} listener
   * @returns {() => void} désabonnement
   */
  function onChange(listener) {
    if (typeof listener !== 'function') throw new TypeError('onChange : une fonction est attendue');
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  return { select, clear, getSelection: () => current, onChange };
}

/**
 * L'équipement existe-t-il dans le scénario du moteur ou dans la scène 3D ?
 * Si aucune des deux sources n'est disponible, on ne peut pas vérifier : on accepte.
 */
export function deviceExists(app, id) {
  let devices = null;
  try {
    devices = app?.sim?.getScenario?.()?.devices ?? null;
  } catch {
    devices = null;
  }
  if (Array.isArray(devices) && devices.some((device) => device?.id === id)) return true;

  const getDevice = app?.render?.getDevice;
  if (typeof getDevice === 'function') {
    try {
      if (getDevice.call(app.render, id)) return true;
    } catch {
      // rendu indisponible : on se contente du scénario
    }
  }
  return !Array.isArray(devices) && typeof getDevice !== 'function';
}

/** Surbrillance du pôle render, si elle existe. */
export function renderHighlighter(app) {
  const render = app?.render;
  return typeof render?.highlightDevice === 'function'
    ? (id, mode) => render.highlightDevice(id, mode)
    : undefined;
}

/**
 * Branche la sélection sur la page et sur le moteur.
 * - clic ou toucher sur un équipement : évènement DEVICE_SELECTED_EVENT sur #scene (pôle render) ;
 * - Échap : désélectionne (ignoré dans un champ de saisie) ;
 * - nouveau scénario (TOPICS.SCENARIO) : désélectionne, l'ancien équipement n'existe plus.
 * Chaque branchement est facultatif : sans document, sans #scene ou sans moteur, rien ne casse.
 * @param {object} app objet partagé
 * @param {ReturnType<typeof createSelection>} selection
 * @param {{ root?: object, sceneId?: string }} [options] root : document (ou faux document en test)
 * @returns {() => void} débranche tout
 */
export function attachSelection(app, selection, { root, sceneId = 'scene' } = {}) {
  const cleanups = [];
  const listen = (target, type, handler) => {
    if (typeof target?.addEventListener !== 'function') return;
    target.addEventListener(type, handler);
    cleanups.push(() => target.removeEventListener(type, handler));
  };

  const scene = typeof root?.getElementById === 'function' ? root.getElementById(sceneId) : null;
  listen(scene, DEVICE_SELECTED_EVENT, (event) => {
    selection.select(event?.detail?.id);
  });

  listen(root, 'keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || isEditable(event.target)) return;
    if (selection.clear()) event.preventDefault();
  });

  if (typeof app?.sim?.on === 'function') {
    const off = app.sim.on(TOPICS.SCENARIO, () => selection.clear());
    if (typeof off === 'function') cleanups.push(off);
  }

  return () => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  };
}
