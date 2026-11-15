// Pôle sim : comportements d'équipements par type de scénario, donnés au moteur
// (createSimulation({ devices: DEVICE_BEHAVIOURS })). Un serveur se comporte comme un hôte.
import host from './host.mjs';
import router from './router.mjs';
import switchBehaviour from './switch.mjs';

export const DEVICE_BEHAVIOURS = Object.freeze({
  host,
  server: host,
  switch: switchBehaviour,
  router,
});
