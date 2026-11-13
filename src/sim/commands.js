// Khalil (S1) : API de commandes de la simulation (patron Command) et son implémentation.
//
// CONTRAT D'ÉQUIPE, figé en S1. Consommateurs : controls.js (Ramy), vrPanel.js (Ayoub).
// Documentation : docs/simulation/contrats.md
//
// En S1, app.sim est le faux moteur (mock.js) : même API, trafic de démonstration.
// En S2/S3, il sera remplacé par createSimulation() avec les vrais protocoles, sans
// changer une ligne côté interface.
//
// API publique (SimulationAPI) :
//   await load(scenario, params?)   charge un scénario (objet déjà validé ou non) → état ready
//   play() / pause() / step() / reset()
//   setSpeed(speed)                 multiplicateur, borné entre MIN_SPEED et MAX_SPEED
//   getState()                      { status, time, speed, scenarioId, pending, error }
//   getScenario()                   scénario chargé (ou null)
//   describe(packet)                lignes de l'inspecteur (PacketField[]) via le bon protocole
//   getHistory()                    évènements réseau publiés depuis la dernière réinitialisation (S2)
//   getPacketsInFlight()            paquets en cours de trajet et leur avancement 0..1 (S2, animateur)
//   isAllowed(command)              la commande est-elle permise maintenant ? (activer les boutons)
//   tick(realDeltaMs)               avance la lecture d'une image, depuis la boucle de rendu (VR comprise)
//   on(topic, listener) / once(...) abonnement au bus (TOPICS de events.js) → désabonnement
//
// Les commandes renvoient true si elles ont été exécutées, false si l'état ne les permet pas
// (aucune exception : un bouton cliqué au mauvais moment ne doit rien casser).

import { createBus, createEvent, EVENT_TYPES, TOPICS, assertPacket } from './events.js';
import { createEngine } from './engine.js';
import { checkProtocol, describeHeaders, loadProtocol as defaultLoadProtocol } from './protocol.js';
import { assertScenario, DEFAULT_LATENCY, findDevice, linkAt } from './scenario.js';
import { COMMANDS, STATUS, isAllowed, nextStatus } from './state.js';

export { COMMANDS } from './state.js';

export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;
/** Durée réelle maximale prise en compte pour une image (ms) : au-delà, on ne rattrape pas. */
export const MAX_FRAME_DELTA = 100;
/** Sans tick() externe depuis ce délai (ms), l'horloge interne reprend le relais. */
export const EXTERNAL_TICK_TIMEOUT = 250;

/**
 * @typedef {object} SimulationState
 * @property {string} status une valeur de STATUS
 * @property {number} time instant simulé (ms)
 * @property {number} speed vitesse courante
 * @property {string|null} scenarioId
 * @property {number} pending nombre d'actions encore programmées
 * @property {string|null} error message de la dernière erreur d'un protocole (la lecture s'arrête alors)
 */

/**
 * Horloge temps réel par défaut pour la lecture continue : requestAnimationFrame dans le
 * navigateur, setInterval ailleurs. Les tests en injectent une manuelle.
 * @typedef {{ start(onFrame: (realDeltaMs: number) => void): () => void }} Scheduler
 * @type {Scheduler}
 */
export const realTimeScheduler = {
  start(onFrame) {
    const clock = () => globalThis.performance?.now?.() ?? Date.now();
    let last = clock();
    let running = true;
    const tick = () => {
      if (!running) return;
      const current = clock();
      // Onglet en arrière-plan : on ne rattrape pas plusieurs secondes d'un coup.
      const delta = Math.min(current - last, 100);
      last = current;
      onFrame(delta);
      if (running && typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(tick);
    };
    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(tick);
      return () => { running = false; };
    }
    const id = setInterval(tick, 16);
    return () => { running = false; clearInterval(id); };
  },
};

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

/**
 * Crée une simulation.
 * @param {object} [options]
 * @param {object} [options.protocol] protocole injecté (ignore scenario.protocol) : sert au mock et aux tests
 * @param {(name: string) => Promise<object>} [options.loadProtocol] chargeur de protocoles (dynamique par défaut)
 * @param {Scheduler} [options.scheduler] horloge temps réel de la lecture continue
 * @param {Record<string, { onReceive(device, packet, ctx, meta): boolean }>} [options.devices]
 *   comportements d'équipements par type (S3 : switch.js, host.js, router.js). Appelé avant le
 *   protocole à chaque réception ; s'il renvoie true, le paquet est traité et le protocole n'est pas appelé.
 * @param {number} [options.speed] vitesse initiale (1 par défaut)
 * @param {(scenario: object, link: object, packet: object) => { bytes: number, duration: number }} [options.transmission]
 *   taille de la trame et durée d'émission sur le lien (phase 5, voir traffic.js). Sans elle, une
 *   trame part et arrive comme avant (durée nulle, aucune file d'attente).
 */
export function createSimulation(options = {}) {
  const bus = createBus();
  const engine = createEngine();
  const scheduler = options.scheduler ?? realTimeScheduler;
  const loader = options.loadProtocol ?? defaultLoadProtocol;
  const deviceBehaviours = options.devices ?? {};

  /** Protocoles connus, par nom : sert à describe() pour les paquets de tous les protocoles. */
  const protocols = new Map();
  const requested = new Set();
  if (options.protocol) registerProtocol(options.protocol);

  let status = STATUS.IDLE;
  let speed = clampSpeed(options.speed ?? 1);
  let scenario = null;
  let protocol = null;
  let params = {};
  let stopLoop = null;
  let lastError = null;
  let run = null; // état propre à une exécution : recréé à chaque réinitialisation

  function registerProtocol(candidate) {
    const errors = checkProtocol(candidate);
    if (errors.length) throw new Error(`protocole non conforme : ${errors.join(' ; ')}`);
    protocols.set(candidate.name, candidate);
  }

  /** Charge en arrière-plan le protocole d'un paquet inconnu, pour que l'inspecteur le décrive. */
  function ensureProtocol(name) {
    if (protocols.has(name) || requested.has(name)) return;
    requested.add(name);
    Promise.resolve()
      .then(() => loader(name))
      .then((loaded) => { if (loaded && !protocols.has(name)) registerProtocol(loaded); })
      .catch(() => { /* describe() se rabat sur describeHeaders */ });
  }

  function clampSpeed(value) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError('vitesse : nombre > 0 attendu');
    return Math.min(MAX_SPEED, Math.max(MIN_SPEED, value));
  }

  function getState() {
    return {
      status,
      time: engine.now(),
      speed,
      scenarioId: scenario?.id ?? null,
      pending: engine.pending(),
      error: lastError,
    };
  }

  function setStatus(next) {
    status = next;
    bus.emit(TOPICS.STATE, getState());
  }

  function stop() {
    stopLoop?.();
    stopLoop = null;
  }

  /** Joue une portion du moteur ; une erreur de protocole arrête la lecture proprement. */
  function guarded(work) {
    try {
      work();
      return true;
    } catch (error) {
      stop();
      lastError = error?.message ?? String(error);
      console.error('simulation : erreur pendant la lecture :', error);
      setStatus(STATUS.PAUSED);
      return false;
    }
  }

  function afterProgress() {
    bus.emit(TOPICS.TICK, { time: engine.now() });
    if (!engine.hasPending()) {
      stop();
      setStatus(STATUS.FINISHED);
    }
  }

  // --- Contexte donné au protocole (voir ProtocolContext dans protocol.js) ---

  function publish(type, fields) {
    const event = createEvent({ id: ++run.eventId, time: engine.now(), type, ...fields });
    run.history.push(event);
    ensureProtocol(event.packet.protocol);
    bus.emit(TOPICS.NETWORK, event);
    return event;
  }

  function deviceOrThrow(id) {
    const device = findDevice(scenario, id);
    if (!device) throw new Error(`équipement "${id}" absent du scénario`);
    return device;
  }

  function pickInterface(device, name) {
    if (name) {
      if (!device.interfaces.some((itf) => itf.name === name)) {
        throw new Error(`${device.id} : interface "${name}" inconnue`);
      }
      return name;
    }
    const linked = device.interfaces.filter((itf) => linkAt(scenario, device.id, itf.name));
    if (linked.length === 1) return linked[0].name;
    throw new Error(`${device.id} a ${linked.length} interfaces reliées : préciser options.interface dans ctx.send`);
  }

  function receive(deviceId, packet, meta) {
    const device = deviceOrThrow(deviceId);
    const behaviour = deviceBehaviours[device.type];
    if (behaviour?.onReceive?.(device, packet, run.ctx, meta) === true) return;
    protocol.onReceive(device, packet, run.ctx, meta);
  }

  function createContext() {
    const ctx = {
      get scenario() { return scenario; },
      get params() { return params; },
      now: () => engine.now(),
      device: deviceOrThrow,

      memory(deviceId) {
        deviceOrThrow(deviceId);
        if (!run.memory.has(deviceId)) run.memory.set(deviceId, {});
        return run.memory.get(deviceId);
      },

      nextPacketId: () => `p${++run.packetId}`,

      /** @returns {() => boolean} annule l'action si elle n'a pas encore été jouée (temporisations) */
      schedule(delay, action) {
        if (!Number.isFinite(delay) || delay < 0) throw new RangeError('ctx.schedule : délai ≥ 0 attendu');
        if (typeof action !== 'function') throw new TypeError('ctx.schedule : action doit être une fonction');
        const id = engine.schedule(engine.now() + delay, action);
        return () => engine.cancel(id);
      },

      explain(stepId) {
        const step = scenario.steps.find((candidate) => candidate.id === stepId);
        if (!step) throw new Error(`ctx.explain : étape "${stepId}" absente de scenario.steps`);
        bus.emit(TOPICS.STEP, { time: engine.now(), step: step.id, title: step.title, text: step.text });
      },

      send(deviceId, packet, { interface: name, step = null, delay = 0, lost = null } = {}) {
        assertPacket(packet);
        const frozen = deepFreeze(structuredClone(packet));
        const device = deviceOrThrow(deviceId);
        const sourceInterface = pickInterface(device, name);
        ctx.schedule(delay, () => {
          const attached = linkAt(scenario, device.id, sourceInterface);
          if (!attached) {
            publish(EVENT_TYPES.DROP, { source: device.id, sourceInterface, packet: frozen, step, reason: 'interface non reliée' });
            return;
          }
          const { link, peer } = attached;
          const { bytes = null, duration = 0 } = options.transmission?.(scenario, link, frozen) ?? {};
          const common = {
            source: device.id,
            sourceInterface,
            destination: peer.device,
            destinationInterface: peer.interface,
            link: link.id,
            packet: frozen,
            step,
          };
          // Un port n'émet qu'une trame à la fois : la suivante attend la fin de la précédente.
          const port = `${device.id}:${sourceInterface}`;
          const start = Math.max(engine.now(), run.portFree.get(port) ?? 0);
          run.portFree.set(port, start + duration);
          const transmit = () => {
            const transmitted = engine.now() + duration;
            const arrival = transmitted + (link.latency ?? DEFAULT_LATENCY);
            const sent = publish(EVENT_TYPES.SEND, { ...common, arrival, bytes, transmitted });
            run.inFlight.set(sent.id, sent);
            if (lost) {
              // Perte simulée sur le câble : la trame part, puis disparaît à mi-chemin.
              engine.schedule(transmitted + (arrival - transmitted) / 2, () => {
                run.inFlight.delete(sent.id);
                publish(EVENT_TYPES.DROP, { source: device.id, sourceInterface, link: link.id, packet: frozen, step, reason: String(lost) });
              });
              return;
            }
            engine.schedule(arrival, () => {
              run.inFlight.delete(sent.id);
              publish(EVENT_TYPES.RECEIVE, common);
              receive(peer.device, frozen, { interface: peer.interface, link: link.id, from: device.id });
            });
          };
          if (start > engine.now()) engine.schedule(start, transmit);
          else transmit();
        });
      },

      drop(deviceId, packet, reason, { step = null } = {}) {
        assertPacket(packet);
        deviceOrThrow(deviceId);
        publish(EVENT_TYPES.DROP, {
          source: deviceId,
          packet: deepFreeze(structuredClone(packet)),
          step,
          reason: String(reason || 'inconnue'),
        });
      },
    };
    return Object.freeze(ctx);
  }

  /** (Re)démarre une exécution : file vide, horloge à 0, mémoires vides, start() programmé à t=0. */
  function prepareRun() {
    stop();
    engine.clear();
    lastError = null;
    run = { eventId: 0, packetId: 0, memory: new Map(), history: [], inFlight: new Map(), portFree: new Map(), ctx: null };
    run.ctx = createContext();
    engine.schedule(0, () => protocol.start(run.ctx));
    bus.emit(TOPICS.RESET, { time: 0 });
  }

  /** Avance l'horloge simulée de (durée réelle × vitesse), si la lecture est en cours. */
  function advance(realDelta) {
    if (status !== STATUS.PLAYING) return;
    if (guarded(() => engine.advanceTo(engine.now() + realDelta * speed))) afterProgress();
  }

  // Deux sources de temps réel possibles pour la lecture :
  // - externe : la boucle de rendu appelle tick() à chaque image. C'est la seule qui continue
  //   pendant une session WebXR immersive, où le requestAnimationFrame de la fenêtre est suspendu ;
  // - interne (scheduler) : relais quand personne n'appelle tick() (rendu en panne, tests, Node).
  // Tant qu'un tick externe est récent, les images du scheduler sont ignorées : le temps
  // n'avance jamais deux fois pour la même image.
  const wallClock = () => globalThis.performance?.now?.() ?? Date.now();
  let lastExternalTick = Number.NEGATIVE_INFINITY;
  const externalActive = () => wallClock() - lastExternalTick < EXTERNAL_TICK_TIMEOUT;

  function startLoop() {
    stopLoop = scheduler.start((realDelta) => {
      if (!externalActive()) advance(realDelta);
    });
  }

  const api = {
    TOPICS,
    COMMANDS,
    STATUS,

    on: (topic, listener) => bus.on(topic, listener),
    once: (topic, listener) => bus.once(topic, listener),

    getState,
    getScenario: () => scenario,
    isAllowed: (command) => isAllowed(command, status),

    /**
     * @param {object} newScenario objet scénario (voir scenario.js)
     * @param {Record<string, any>} [newParams] remplace une partie de scenario.params (ex. hôtes choisis)
     */
    async load(newScenario, newParams = {}) {
      assertScenario(newScenario);
      let nextProtocol = options.protocol;
      if (!nextProtocol) {
        nextProtocol = protocols.get(newScenario.protocol) ?? await loader(newScenario.protocol);
        registerProtocol(nextProtocol);
      }
      scenario = deepFreeze(structuredClone(newScenario));
      params = Object.freeze({ ...(scenario.params ?? {}), ...newParams });
      protocol = nextProtocol;
      bus.emit(TOPICS.SCENARIO, { scenario, params });
      prepareRun();
      setStatus(nextStatus(status, COMMANDS.LOAD));
      return true;
    },

    play() {
      if (!isAllowed(COMMANDS.PLAY, status)) return false;
      setStatus(nextStatus(status, COMMANDS.PLAY));
      startLoop();
      return true;
    },

    pause() {
      if (!isAllowed(COMMANDS.PAUSE, status)) return false;
      stop();
      setStatus(nextStatus(status, COMMANDS.PAUSE));
      return true;
    },

    step() {
      if (!isAllowed(COMMANDS.STEP, status)) return false;
      const next = nextStatus(status, COMMANDS.STEP);
      if (!guarded(() => engine.stepNext())) return true;
      bus.emit(TOPICS.TICK, { time: engine.now() });
      setStatus(engine.hasPending() ? next : STATUS.FINISHED);
      return true;
    },

    /**
     * Fait avancer la lecture d'une image, depuis la boucle de rendu (renderer.setAnimationLoop).
     * Sans effet hors lecture. Le moteur reste indépendant du nombre d'images par seconde :
     * seul compte le temps réel écoulé, borné pour ne pas rattraper un long gel d'un coup.
     * @param {number} realDeltaMs temps réel écoulé depuis l'image précédente (ms)
     * @returns {boolean} false si la durée est invalide
     */
    tick(realDeltaMs) {
      if (!Number.isFinite(realDeltaMs) || realDeltaMs < 0) return false;
      lastExternalTick = wallClock();
      advance(Math.min(realDeltaMs, MAX_FRAME_DELTA));
      return true;
    },

    setSpeed(value) {
      if (!isAllowed(COMMANDS.SET_SPEED, status)) return false;
      speed = clampSpeed(value);
      setStatus(status);
      return true;
    },

    reset() {
      if (!isAllowed(COMMANDS.RESET, status)) return false;
      prepareRun();
      setStatus(nextStatus(status, COMMANDS.RESET));
      return true;
    },

    /**
     * Évènements réseau publiés depuis la dernière réinitialisation, dans l'ordre.
     * Permet à un module monté en retard (journal, inspecteur) de se remettre à jour.
     * @returns {ReadonlyArray<import('./events.js').NetworkEvent>}
     */
    getHistory() {
      return Object.freeze([...(run?.history ?? [])]);
    },

    /**
     * Paquets en cours de trajet sur un lien à l'instant courant, avec leur avancement.
     * progress = (maintenant − départ) / (arrivée − départ), entre 0 et 1.
     * L'animateur (Ayoub) peut redessiner toute la scène à partir de cette seule fonction,
     * par exemple après une pause, un pas à pas ou un changement de vitesse.
     * @returns {Array<{ event: import('./events.js').NetworkEvent, progress: number }>}
     */
    getPacketsInFlight() {
      if (!run) return [];
      const now = engine.now();
      return [...run.inFlight.values()].map((event) => {
        const span = event.arrival - event.time;
        const progress = span > 0 ? Math.min(1, Math.max(0, (now - event.time) / span)) : 1;
        return { event, progress };
      });
    },

    /**
     * Champs d'un paquet pour l'inspecteur, quel que soit son protocole.
     * @returns {import('./protocol.js').PacketField[]}
     */
    describe(packet) {
      const owner = protocols.get(packet?.protocol);
      if (owner) {
        try {
          const fields = owner.describe(packet);
          if (Array.isArray(fields) && fields.length) return fields;
        } catch (error) {
          console.error(`describe() du protocole "${packet.protocol}" a échoué :`, error);
        }
      }
      return describeHeaders(packet);
    },
  };

  return api;
}
