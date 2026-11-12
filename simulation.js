// Khalil : façade du moteur de simulation.
//
// Seul point d'import conseillé pour les autres pôles et pour les tests :
//   import { TOPICS, STATUS, COMMANDS, isAllowed } from '../../simulation.js';
//
// Elle ne contient aucune logique : elle regroupe les contrats publics de src/sim/.

export { TOPICS, EVENT_TYPES, BROADCAST_MAC, createBus, createEvent, isBroadcast } from './src/sim/events.js';
export { STATUS, COMMANDS, isAllowed, nextStatus, allowedCommands } from './src/sim/state.js';
export { createSimulation, MIN_SPEED, MAX_SPEED, MAX_FRAME_DELTA, EXTERNAL_TICK_TIMEOUT } from './src/sim/commands.js';
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
export {
  CABLES, DEFAULT_SPEED, MODELS, SPEEDS, formatNumber, formatSpeed, modelOf, modelPorts, modelSheet, portConnector, portSpeed,
} from './src/sim/catalog.js';
export { SLOWDOWN, createTrafficMeter, frameSize, linkBandwidth, transmissionModel, transmissionTime } from './src/sim/traffic.js';
export { diagnose, countBySeverity, SEVERITIES, SEVERITY_LABELS, SATURATION } from './src/sim/diagnostics.js';
export {
  BuilderError, MAX_LABEL, TYPE_NAMING, addDevice, connect, disconnect, freePorts, fromScenario, moveDevice, newTopology, palette, removeDevice, renameDevice,
} from './src/sim/builder.js';
