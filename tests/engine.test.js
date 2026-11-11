// Tests du squelette du moteur : file ordonnée et horloge simulée.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createEngine, MAX_ACTIONS_PER_ADVANCE } from '../src/sim/engine.js';

test('l\'horloge démarre à 0 et la file est vide', () => {
  const engine = createEngine();
  assert.equal(engine.now(), 0);
  assert.equal(engine.hasPending(), false);
  assert.equal(engine.nextTime(), null);
  assert.equal(engine.stepNext(), false);
});

test('les actions sont jouées par instant croissant, puis dans l\'ordre de programmation', () => {
  const engine = createEngine();
  const log = [];
  engine.schedule(300, () => log.push('c@300'));
  engine.schedule(100, () => log.push('a@100'));
  engine.schedule(100, () => log.push('b@100'));
  engine.schedule(200, () => log.push('x@200'));

  engine.advanceTo(1000);
  assert.deepEqual(log, ['a@100', 'b@100', 'x@200', 'c@300']);
  assert.equal(engine.now(), 1000);
});

test('advanceTo s\'arrête à l\'instant demandé et l\'horloge vaut cet instant', () => {
  const engine = createEngine();
  const log = [];
  engine.schedule(100, () => log.push(100));
  engine.schedule(500, () => log.push(500));

  assert.equal(engine.advanceTo(250), 1);
  assert.deepEqual(log, [100]);
  assert.equal(engine.now(), 250);
  assert.equal(engine.nextTime(), 500);
});

test('chaque action voit l\'horloge à son propre instant', () => {
  const engine = createEngine();
  const seen = [];
  engine.schedule(40, () => seen.push(engine.now()));
  engine.schedule(70, () => seen.push(engine.now()));
  engine.advanceTo(100);
  assert.deepEqual(seen, [40, 70]);
});

test('stepNext joue tout un instant, y compris ce qui y est programmé en cours de route', () => {
  const engine = createEngine();
  const log = [];
  engine.schedule(100, () => {
    log.push('a');
    engine.schedule(engine.now(), () => log.push('a-bis'));
    engine.schedule(engine.now() + 50, () => log.push('b'));
  });

  assert.equal(engine.stepNext(), true);
  assert.deepEqual(log, ['a', 'a-bis']);
  assert.equal(engine.now(), 100);

  assert.equal(engine.stepNext(), true);
  assert.deepEqual(log, ['a', 'a-bis', 'b']);
  assert.equal(engine.now(), 150);
  assert.equal(engine.stepNext(), false);
});

test('deux exécutions identiques donnent la même séquence (déterminisme)', () => {
  const runOnce = () => {
    const engine = createEngine();
    const log = [];
    for (const t of [30, 10, 20, 10, 30, 0]) engine.schedule(t, () => log.push(`${t}:${log.length}`));
    while (engine.stepNext());
    return log;
  };
  assert.deepEqual(runOnce(), runOnce());
});

test('on ne peut pas programmer dans le passé', () => {
  const engine = createEngine();
  engine.advanceTo(100);
  assert.throws(() => engine.schedule(50, () => {}), RangeError);
  assert.throws(() => engine.schedule(Number.NaN, () => {}), TypeError);
  assert.throws(() => engine.schedule(200, 'pas une fonction'), TypeError);
});

test('clear remet l\'horloge à 0 et vide la file', () => {
  const engine = createEngine();
  engine.schedule(100, () => {});
  engine.schedule(200, () => {});
  engine.advanceTo(150);
  engine.clear();
  assert.equal(engine.now(), 0);
  assert.equal(engine.pending(), 0);
});

test('une boucle infinie au même instant est arrêtée par le garde-fou', () => {
  const engine = createEngine();
  const again = () => engine.schedule(engine.now(), again);
  engine.schedule(0, again);
  assert.throws(() => engine.stepNext(), new RegExp(String(MAX_ACTIONS_PER_ADVANCE)));
});

// --- S2 : tas binaire et annulation ---

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('ordre identique à un tri de référence sur 2 000 actions aléatoires', () => {
  const rand = random(42);
  const engine = createEngine();
  const expected = [];
  const played = [];
  for (let i = 0; i < 2000; i++) {
    const time = Math.floor(rand() * 500); // beaucoup d'instants égaux : teste le FIFO
    expected.push({ time, i });
    engine.schedule(time, () => played.push(i));
  }
  expected.sort((a, b) => a.time - b.time || a.i - b.i);
  engine.advanceTo(1000);
  assert.deepEqual(played, expected.map((e) => e.i));
});

test('cancel retire une action programmée, une seule fois', () => {
  const engine = createEngine();
  const log = [];
  const a = engine.schedule(100, () => log.push('a'));
  engine.schedule(200, () => log.push('b'));
  assert.equal(engine.pending(), 2);
  assert.equal(engine.cancel(a), true);
  assert.equal(engine.cancel(a), false);
  assert.equal(engine.pending(), 1);
  assert.equal(engine.nextTime(), 200, 'nextTime ignore les actions annulées');
  engine.advanceTo(1000);
  assert.deepEqual(log, ['b']);
});

test('une action peut annuler une temporisation déjà programmée (cas TCP : ACK reçu avant le délai)', () => {
  const engine = createEngine();
  const log = [];
  const timeout = engine.schedule(500, () => log.push('retransmission'));
  engine.schedule(300, () => {
    log.push('ACK reçu');
    engine.cancel(timeout);
  });
  while (engine.stepNext());
  assert.deepEqual(log, ['ACK reçu']);
  assert.equal(engine.now(), 300, 'pas de saut vers l\'instant de l\'action annulée');
});

test('annuler une action déjà jouée ne fait rien', () => {
  const engine = createEngine();
  const id = engine.schedule(10, () => {});
  engine.advanceTo(20);
  assert.equal(engine.cancel(id), false);
  assert.equal(engine.cancel(9999), false);
});

test('stepNext saute les instants dont toutes les actions sont annulées', () => {
  const engine = createEngine();
  const log = [];
  engine.cancel(engine.schedule(100, () => log.push('annulée')));
  engine.schedule(400, () => log.push('jouée'));
  assert.equal(engine.stepNext(), true);
  assert.deepEqual(log, ['jouée']);
  assert.equal(engine.now(), 400);
  assert.equal(engine.stepNext(), false);
});

test('50 000 actions sont jouées en moins d\'une demi-seconde', () => {
  const engine = createEngine();
  const rand = random(7);
  let count = 0;
  const start = performance.now();
  for (let i = 0; i < 50_000; i++) engine.schedule(Math.floor(rand() * 1e6), () => count++);
  engine.advanceTo(1e6);
  const elapsed = performance.now() - start;
  assert.equal(count, 50_000);
  assert.ok(elapsed < 500, `trop lent : ${elapsed.toFixed(0)} ms`);
});
