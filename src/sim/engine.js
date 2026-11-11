// Khalil : moteur à évènements discrets (S1 : squelette ; S2 : tas binaire et annulation).
//
// Règle d'or (§8.1 du cahier, point de vigilance n°5 du plan) : le moteur ne vit PAS dans la
// boucle de rendu. Il ne connaît ni requestAnimationFrame, ni Three.js, ni le DOM.
// On lui dit seulement « avance jusqu'à t » ou « joue l'instant suivant » : il reste
// déterministe et testable sous Node.
//
// Ordre d'exécution : par instant croissant, puis par ordre de programmation (FIFO) à instant égal.
//
// File de priorité : tas binaire minimal sur (time, seq). Insertion et retrait en O(log n).
// Annulation paresseuse : une action annulée reste dans le tas mais est ignorée quand elle sort,
// ce qui garde cancel() en O(1). Sert aux temporisations (retransmission TCP, attente DHCP...).

/** Garde-fou : nombre maximal d'actions jouées à un même instant (protocole qui se reprogramme sans fin). */
export const MAX_ACTIONS_PER_ADVANCE = 10_000;

/** a passe-t-il avant b ? */
const before = (a, b) => a.time < b.time || (a.time === b.time && a.seq < b.seq);

/**
 * @returns {{
 *   now(): number,
 *   schedule(time: number, action: () => void): number,
 *   cancel(id: number): boolean,
 *   pending(): number,
 *   hasPending(): boolean,
 *   nextTime(): number | null,
 *   advanceTo(time: number): number,
 *   stepNext(): boolean,
 *   clear(): void,
 * }}
 */
export function createEngine() {
  /** @type {Array<{ time: number, seq: number, action: () => void }>} tas : heap[0] est le plus tôt */
  let heap = [];
  /** numéros des actions programmées et ni jouées ni annulées */
  let live = new Set();
  let clock = 0;
  let seq = 0;

  function push(item) {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!before(heap[i], heap[parent])) break;
      [heap[i], heap[parent]] = [heap[parent], heap[i]];
      i = parent;
    }
  }

  function pop() {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < heap.length && before(heap[left], heap[smallest])) smallest = left;
        if (right < heap.length && before(heap[right], heap[smallest])) smallest = right;
        if (smallest === i) break;
        [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
        i = smallest;
      }
    }
    return top;
  }

  /** Retire du sommet les actions annulées, pour que heap[0] soit la prochaine vraie action. */
  function skipCancelled() {
    while (heap.length && !live.has(heap[0].seq)) pop();
  }

  /** Joue toutes les actions d'instant ≤ limit. */
  function runUntil(limit) {
    let count = 0;
    let sameInstant = 0; // le garde-fou compte les actions d'un MÊME instant, pas de toute l'avance
    for (skipCancelled(); heap.length && heap[0].time <= limit; skipCancelled()) {
      sameInstant = heap[0].time === clock && count > 0 ? sameInstant + 1 : 1;
      if (sameInstant > MAX_ACTIONS_PER_ADVANCE) {
        throw new Error(`moteur : plus de ${MAX_ACTIONS_PER_ADVANCE} actions à t=${clock} (boucle infinie ?)`);
      }
      count++;
      const item = pop();
      live.delete(item.seq);
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
     * @returns {number} numéro de l'action, à passer à cancel()
     */
    schedule(time, action) {
      if (!Number.isFinite(time)) throw new TypeError('moteur : instant non numérique');
      if (time < clock) throw new RangeError(`moteur : impossible de programmer dans le passé (${time} < ${clock})`);
      if (typeof action !== 'function') throw new TypeError('moteur : action doit être une fonction');
      const id = seq++;
      push({ time, seq: id, action });
      live.add(id);
      return id;
    },

    /**
     * Annule une action pas encore jouée.
     * @returns {boolean} vrai si elle était encore programmée
     */
    cancel(id) {
      return live.delete(id);
    },

    pending: () => live.size,
    hasPending: () => live.size > 0,
    nextTime() {
      skipCancelled();
      return heap.length ? heap[0].time : null;
    },

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
      skipCancelled();
      if (!heap.length) return false;
      runUntil(heap[0].time);
      return true;
    },

    /** Vide la file et remet l'horloge à 0 (réinitialisation). */
    clear() {
      heap = [];
      live = new Set();
      clock = 0;
      seq = 0;
    },
  };
}
