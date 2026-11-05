// Khalil : moteur à évènements discrets. S1 : squelette (file ordonnée + horloge simulée).
//
// Règle d'or (§8.1 du cahier, point de vigilance n°5 du plan) : le moteur ne vit PAS dans la
// boucle de rendu. Il ne connaît ni requestAnimationFrame, ni Three.js, ni le DOM.
// On lui dit seulement « avance jusqu'à t » ou « joue l'instant suivant » : il reste
// déterministe et testable sous Node.
//
// Ordre d'exécution : par instant croissant, puis par ordre de programmation (FIFO) à instant égal.

/** Garde-fou contre un protocole qui se reprogramme sans fin au même instant. */
export const MAX_ACTIONS_PER_ADVANCE = 10_000;

/**
 * @returns {{
 *   now(): number,
 *   schedule(time: number, action: () => void): number,
 *   pending(): number,
 *   hasPending(): boolean,
 *   nextTime(): number | null,
 *   advanceTo(time: number): number,
 *   stepNext(): boolean,
 *   clear(): void,
 * }}
 */
export function createEngine() {
  /** @type {Array<{ time: number, seq: number, action: () => void }>} triée par (time, seq) */
  let queue = [];
  let clock = 0;
  let seq = 0;

  /** Insertion triée (recherche dichotomique) : la file reste petite, c'est suffisant. */
  function insert(item) {
    let low = 0;
    let high = queue.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      const other = queue[mid];
      if (other.time < item.time || (other.time === item.time && other.seq < item.seq)) low = mid + 1;
      else high = mid;
    }
    queue.splice(low, 0, item);
  }

  /** Joue toutes les actions d'instant ≤ limit. */
  function runUntil(limit) {
    let count = 0;
    while (queue.length && queue[0].time <= limit) {
      if (++count > MAX_ACTIONS_PER_ADVANCE) {
        throw new Error(`moteur : plus de ${MAX_ACTIONS_PER_ADVANCE} actions à t=${clock} (boucle infinie ?)`);
      }
      const item = queue.shift();
      clock = item.time;
      item.action();
    }
    return count;
  }

  return {
    /** Instant simulé courant (ms). */
    now: () => clock,

    /**
     * Programme une action à un instant absolu (≥ maintenant).
     * @returns {number} numéro d'ordre de l'action
     */
    schedule(time, action) {
      if (!Number.isFinite(time)) throw new TypeError('moteur : instant non numérique');
      if (time < clock) throw new RangeError(`moteur : impossible de programmer dans le passé (${time} < ${clock})`);
      if (typeof action !== 'function') throw new TypeError('moteur : action doit être une fonction');
      insert({ time, seq: seq++, action });
      return seq - 1;
    },

    pending: () => queue.length,
    hasPending: () => queue.length > 0,
    nextTime: () => (queue.length ? queue[0].time : null),

    /**
     * Avance l'horloge jusqu'à `time` en jouant tout ce qui est prévu d'ici là.
     * Utilisé par la lecture continue (time = maintenant + durée de l'image × vitesse).
     * @returns {number} nombre d'actions jouées
     */
    advanceTo(time) {
      if (!Number.isFinite(time)) throw new TypeError('moteur : instant non numérique');
      const count = runUntil(time);
      clock = Math.max(clock, time);
      return count;
    },

    /**
     * Pas à pas : saute à l'instant du prochain évènement et joue tout ce qui s'y passe
     * (y compris ce que ces actions programment au même instant).
     * @returns {boolean} faux s'il n'y avait plus rien à jouer
     */
    stepNext() {
      if (!queue.length) return false;
      runUntil(queue[0].time);
      return true;
    },

    /** Vide la file et remet l'horloge à 0 (réinitialisation). */
    clear() {
      queue = [];
      clock = 0;
      seq = 0;
    },
  };
}
