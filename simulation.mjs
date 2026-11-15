// Khalil : façade du moteur de simulation.
//
// Seul point d'import conseillé pour les autres pôles et pour les tests :
//   import { TOPICS, STATUS, COMMANDS, isAllowed } from '../../simulation.mjs';
//
// Elle ne contient aucune logique : elle regroupe les contrats publics de src/sim/.

export { TOPICS, EVENT_TYPES, BROADCAST_MAC, createBus, createEvent, isBroadcast } from './src/sim/events.mjs';
export { STATUS, COMMANDS, isAllowed, nextStatus, allowedCommands } from './src/sim/state.mjs';
export { createSimulation, MIN_SPEED, MAX_SPEED, MAX_FRAME_DELTA, EXTERNAL_TICK_TIMEOUT } from './src/sim/commands.mjs';
export { createMockSimulation, DEMO_SCENARIO, DEMO_PROTOCOL } from './src/sim/mock.mjs';
export { createEngine } from './src/sim/engine.mjs';
export { checkProtocol, loadProtocol, describeHeaders } from './src/sim/protocol.mjs';
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
} from './src/sim/scenario.mjs';
export {
  CABLES, DEFAULT_SPEED, MODELS, SPEEDS, formatNumber, formatSpeed, modelOf, modelPorts, modelSheet, portConnector, portSpeed,
} from './src/sim/catalog.mjs';
export { SLOWDOWN, createTrafficMeter, frameSize, linkBandwidth, transmissionModel, transmissionTime } from './src/sim/traffic.mjs';
export { diagnose, countBySeverity, SEVERITIES, SEVERITY_LABELS, SATURATION } from './src/sim/diagnostics.mjs';
export {
  BuilderError, MAX_LABEL, TYPE_NAMING, addDevice, connect, disconnect, freePorts, fromScenario, moveDevice, newTopology, palette, removeDevice, renameDevice,
} from './src/sim/builder.mjs';
export {
  ROLES, addRecord, addRoute, addService, proposeAddress, proposeGateway, removeRecord, removeRoute, removeService, rolesOf, setAddress, setDns,
  setGateway, setRole,
} from './src/sim/config.mjs';
export { RUNS, assembleRun, defaultValues, runFields, validateRun } from './src/sim/runs.mjs';
