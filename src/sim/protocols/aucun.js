// Pôle sim (phase 7) : « aucun protocole ». Sert à charger dans le moteur une topologie en cours
// de construction (mode « Construire ») : la scène, les fiches et le diagnostic fonctionnent, mais
// la lecture n'envoie rien. Le protocole à jouer se choisit ensuite (phase 7b).
import { describeHeaders } from '../protocol.js';

export default {
  name: 'aucun',
  start(ctx) {
    if (ctx.scenario.steps.some((step) => step.id === 'aucun')) ctx.explain('aucun');
  },
  onReceive() {},
  describe: (packet) => describeHeaders(packet),
};
