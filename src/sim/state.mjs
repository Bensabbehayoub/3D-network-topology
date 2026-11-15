// Khalil (S1) : états de la simulation (patron State) et commandes permises dans chaque état.
//
// CONTRAT D'ÉQUIPE : les boutons de l'interface (Ramy) et du panneau VR (Ayoub) s'activent
// avec isAllowed(command, status) ; ils n'ont pas à recopier ce tableau.

export const STATUS = Object.freeze({
  /** Aucun scénario chargé. */
  IDLE: 'idle',
  /** Scénario chargé, horloge à 0, rien n'a encore été joué. */
  READY: 'ready',
  /** Lecture en cours : l'horloge avance toute seule. */
  PLAYING: 'playing',
  /** Arrêt sur image (après Pause ou Pas à pas). */
  PAUSED: 'paused',
  /** Plus aucun évènement à jouer. */
  FINISHED: 'finished',
});

/** Noms des commandes de l'API (voir commands.js). */
export const COMMANDS = Object.freeze({
  LOAD: 'load',
  PLAY: 'play',
  PAUSE: 'pause',
  STEP: 'step',
  SET_SPEED: 'setSpeed',
  RESET: 'reset',
});

const { IDLE, READY, PLAYING, PAUSED, FINISHED } = STATUS;
const { LOAD, PLAY, PAUSE, STEP, SET_SPEED, RESET } = COMMANDS;

/**
 * Transitions : TABLE[état][commande] = état suivant.
 * Une commande absente est interdite dans cet état.
 * Pas à pas peut aussi mener à FINISHED quand il joue le dernier évènement (décidé par le moteur).
 */
const TABLE = Object.freeze({
  [IDLE]: { [LOAD]: READY, [SET_SPEED]: IDLE },
  [READY]: { [LOAD]: READY, [PLAY]: PLAYING, [STEP]: PAUSED, [SET_SPEED]: READY, [RESET]: READY },
  [PLAYING]: { [LOAD]: READY, [PAUSE]: PAUSED, [SET_SPEED]: PLAYING, [RESET]: READY },
  [PAUSED]: { [LOAD]: READY, [PLAY]: PLAYING, [STEP]: PAUSED, [SET_SPEED]: PAUSED, [RESET]: READY },
  [FINISHED]: { [LOAD]: READY, [SET_SPEED]: FINISHED, [RESET]: READY },
});

/**
 * @param {string} command une valeur de COMMANDS
 * @param {string} status une valeur de STATUS
 * @returns {boolean} la commande est-elle permise dans cet état ?
 */
export function isAllowed(command, status) {
  return Boolean(TABLE[status] && command in TABLE[status]);
}

/**
 * @returns {string} état atteint après la commande
 * @throws si la commande est interdite dans cet état
 */
export function nextStatus(status, command) {
  if (!isAllowed(command, status)) {
    throw new Error(`commande "${command}" impossible dans l'état "${status}"`);
  }
  return TABLE[status][command];
}

/** Commandes permises dans un état (pratique pour activer les boutons d'un coup). */
export function allowedCommands(status) {
  return Object.keys(TABLE[status] ?? {});
}
