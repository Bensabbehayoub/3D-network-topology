// Tests de la machine à états (prêt, lecture, pause, terminé).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allowedCommands, COMMANDS, isAllowed, nextStatus, STATUS } from '../src/sim/state.js';

const { IDLE, READY, PLAYING, PAUSED, FINISHED } = STATUS;
const { LOAD, PLAY, PAUSE, STEP, SET_SPEED, RESET } = COMMANDS;

test('sans scénario, seuls le chargement et la vitesse sont possibles', () => {
  assert.deepEqual(allowedCommands(IDLE).sort(), [LOAD, SET_SPEED].sort());
  assert.equal(nextStatus(IDLE, LOAD), READY);
});

test('parcours nominal : prêt → lecture → pause → pas à pas → lecture', () => {
  let status = READY;
  status = nextStatus(status, PLAY);
  assert.equal(status, PLAYING);
  status = nextStatus(status, PAUSE);
  assert.equal(status, PAUSED);
  status = nextStatus(status, STEP);
  assert.equal(status, PAUSED);
  status = nextStatus(status, PLAY);
  assert.equal(status, PLAYING);
});

test('pas à pas depuis l\'état prêt met en pause', () => {
  assert.equal(nextStatus(READY, STEP), PAUSED);
});

test('pendant la lecture, pas à pas et lecture sont désactivés', () => {
  assert.equal(isAllowed(STEP, PLAYING), false);
  assert.equal(isAllowed(PLAY, PLAYING), false);
  assert.equal(isAllowed(PAUSE, PLAYING), true);
});

test('une fois terminé, seule la réinitialisation relance', () => {
  assert.equal(isAllowed(PLAY, FINISHED), false);
  assert.equal(isAllowed(STEP, FINISHED), false);
  assert.equal(nextStatus(FINISHED, RESET), READY);
});

test('réinitialiser et charger ramènent toujours à l\'état prêt', () => {
  for (const status of [READY, PLAYING, PAUSED, FINISHED]) {
    assert.equal(nextStatus(status, RESET), READY, `reset depuis ${status}`);
    assert.equal(nextStatus(status, LOAD), READY, `load depuis ${status}`);
  }
});

test('la vitesse se règle dans tous les états sans en changer', () => {
  for (const status of Object.values(STATUS)) assert.equal(nextStatus(status, SET_SPEED), status);
});

test('une commande interdite lève une erreur explicite', () => {
  assert.throws(() => nextStatus(IDLE, PLAY), /"play" impossible dans l'état "idle"/);
  assert.equal(isAllowed('voler', READY), false);
  assert.equal(isAllowed(PLAY, 'inconnu'), false);
});
