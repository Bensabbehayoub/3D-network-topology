// Khalil : façade du moteur de simulation.
//
// Seul point d'import conseillé pour les autres pôles et pour les tests :
//   import { TOPICS, STATUS, COMMANDS, isAllowed } from '../../simulation.js';
//
// Elle ne contient aucune logique : elle regroupe les contrats publics de src/sim/.

export { TOPICS, EVENT_TYPES, BROADCAST_MAC, createBus, createEvent, isBroadcast } from './src/sim/events.js';
export { STATUS, COMMANDS, isAllowed, nextStatus, allowedCommands } from './src/sim/state.js';
export { createSimulation, MIN_SPEED, MAX_SPEED } from './src/sim/commands.js';
export { createMockSimulation, DEMO_SCENARIO, DEMO_PROTOCOL } from './src/sim/mock.js';
export { createEngine } from './src/sim/engine.js';
export { checkProtocol, loadProtocol, describeHeaders } from './src/sim/protocol.js';
export {
  SCHEMA_VERSION,
  DEVICE_TYPES,
  DEFAULT_LATENCY,
  validateScenario,
  assertScenario,
  fetchScenario,
  findDevice,
  findPath,
  linkAt,
  neighbours,
  parseCidr,
  parseEndpoint,
} from './src/sim/scenario.js';
