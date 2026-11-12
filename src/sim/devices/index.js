// Pôle sim : comportements d'équipements par type de scénario, donnés au moteur
// (createSimulation({ devices: DEVICE_BEHAVIOURS })). Un serveur se comporte comme un hôte.
import host from './host.js';
import router from './router.js';
import switchBehaviour from './switch.js';

export const DEVICE_BEHAVIOURS = Object.freeze({
  host,
  server: host,
  switch: switchBehaviour,
  router,
});
