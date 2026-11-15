// Tests de l'animation des paquets (Ayoub, tâche 26), avec le vrai faux moteur de Khalil
// et une horloge manuelle : aucun navigateur, aucune image réelle.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as THREE from '../vendor/three/build/three.webgpu.js';
import { computeFrame, createPacketAnimator, mountPacketAnimator, packetPosition, PACKET_HEIGHT } from '../src/render/packetAnimator.js';
import { createMockSimulation, DEMO_SCENARIO } from '../src/sim/mock.js';
import { STATUS } from '../simulation.js';

/** Horloge manuelle : frame(ms) joue une image de ms millisecondes réelles. */
function manualScheduler() {
  let onFrame = null;
  return { start(cb) { onFrame = cb; return () => { onFrame = null; }; }, frame(ms) { onFrame?.(ms); } };
}

/** Positions des équipements de la démo, comme les donne le rendu. */
const positions = new Map(DEMO_SCENARIO.devices.map((d) => [d.id, { x: d.position[0], y: d.position[1], z: d.position[2] }]));
const getPosition = (id) => positions.get(id) ?? null;

async function setup() {
  const scheduler = manualScheduler();
  const sim = createMockSimulation({ scheduler });
  await sim.load(DEMO_SCENARIO);
  const parent = new THREE.Group();
  const animator = createPacketAnimator({ sim, parent, getPosition });
  return { sim, scheduler, parent, animator };
}

test('packetPosition : départ, milieu, arrivée, et avancement borné', () => {
  const a = { x: 0, y: 0, z: 0 };
  const b = { x: 4, y: 0, z: -2 };
  assert.deepEqual(packetPosition(a, b, 0), { x: 0, y: PACKET_HEIGHT, z: 0 });
  assert.deepEqual(packetPosition(a, b, 0.5), { x: 2, y: PACKET_HEIGHT, z: -1 });
  assert.deepEqual(packetPosition(a, b, 1), { x: 4, y: PACKET_HEIGHT, z: -2 });
  assert.deepEqual(packetPosition(a, b, 3), packetPosition(a, b, 1));
});

test('computeFrame ignore un équipement absent du rendu', () => {
  const event = { id: 1, source: 'pc1', destination: 'inconnu', packet: { id: 'p1', protocol: 'demo', type: 'request' } };
  assert.deepEqual(computeFrame([{ event, progress: 0.5 }], getPosition), []);
});

test('aucun paquet avant la lecture', async () => {
  const { animator } = await setup();
  assert.equal(animator.count(), 0);
});

test('le paquet avance avec l\'horloge simulée, pas avec les images', async () => {
  const { sim, scheduler, animator } = await setup();
  sim.play();
  scheduler.frame(16); // le moteur démarre : PC 1 envoie vers Switch 1 (latence 400 ms)
  assert.equal(animator.count(), 1);
  const start = animator.getFrame()[0];
  assert.equal(start.packetId, 'p1');

  scheduler.frame(184); // t = 200 ms : moitié du câble pc1 → sw1 (x de -4 à -2)
  const middle = animator.getFrame()[0];
  assert.ok(Math.abs(middle.progress - 0.5) < 0.05, `avancement ${middle.progress}`);
  assert.ok(Math.abs(middle.position.x - -3) < 0.1, `x ${middle.position.x}`);
});

test('la vitesse ×2 fait avancer deux fois plus loin pour la même durée réelle', async () => {
  const slow = await setup();
  slow.sim.play();
  slow.scheduler.frame(100);
  const fast = await setup();
  fast.sim.setSpeed(2);
  fast.sim.play();
  fast.scheduler.frame(100);
  const a = slow.animator.getFrame()[0].progress;
  const b = fast.animator.getFrame()[0].progress;
  assert.ok(Math.abs(b - 2 * a) < 0.02, `x1=${a} x2=${b}`);
});

test('pause : le paquet ne bouge plus, même si des images passent', async () => {
  const { sim, scheduler, animator } = await setup();
  sim.play();
  scheduler.frame(150);
  sim.pause();
  const before = animator.getFrame()[0].position;
  scheduler.frame(500);
  scheduler.frame(500);
  assert.deepEqual(animator.getFrame()[0].position, before);
});

test('pas à pas : le paquet est affiché à l\'instant où le moteur s\'arrête', async () => {
  const { sim, animator } = await setup();
  sim.step(); // t = 0 : envoi pc1 → sw1
  assert.equal(animator.count(), 1);
  assert.equal(animator.getFrame()[0].progress, 0);
  sim.step(); // t = 400 : réception sur sw1, qui renvoie vers r1
  const [item] = animator.getFrame();
  assert.equal(animator.count(), 1);
  assert.equal(item.progress, 0);
  assert.deepEqual(item.position, packetPosition(getPosition('sw1'), getPosition('r1'), 0));
});

test('réinitialiser efface les paquets de la scène', async () => {
  const { sim, scheduler, parent, animator } = await setup();
  sim.play();
  scheduler.frame(100);
  assert.equal(animator.count(), 1);
  sim.reset();
  assert.equal(animator.count(), 0);
  assert.equal(parent.getObjectByName('packets').children.length, 0);
});

test('fin de la démo : plus aucun paquet affiché', async () => {
  const { sim, scheduler, animator } = await setup();
  sim.play();
  for (let i = 0; i < 1000 && sim.getState().status === STATUS.PLAYING; i++) scheduler.frame(50);
  assert.equal(sim.getState().status, STATUS.FINISHED);
  assert.equal(animator.count(), 0);
});

test('mountPacketAnimator ne casse rien si la scène n\'expose pas encore world', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const sim = createMockSimulation({ scheduler: manualScheduler() });
  assert.equal(mountPacketAnimator({ sim, render: { getDevice: () => null } }), null);
  assert.equal(console.warn.mock.callCount(), 1);
});

test('dispose retire le groupe et se désabonne du moteur', async () => {
  const { sim, scheduler, parent, animator } = await setup();
  animator.dispose();
  assert.equal(parent.getObjectByName('packets'), undefined);
  sim.play();
  scheduler.frame(100);
  assert.equal(animator.count(), 0);
});
