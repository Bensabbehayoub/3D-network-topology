// Tests de l'animation des paquets (Ayoub, tâche 26), avec le vrai faux moteur de Khalil
// et une horloge manuelle : aucun navigateur, aucune image réelle.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as THREE from '../vendor/three/build/three.webgpu.js';
import { cablePath, computeFrame, createPacketAnimator, mountPacketAnimator, packetPosition, pathPoint, PACKET_HEIGHT, PACKET_RADIUS } from '../src/render/packetAnimator.mjs';
import { createLinkLayer } from '../src/render/links.mjs';
import { createMockSimulation, DEMO_SCENARIO } from '../src/sim/mock.mjs';
import { STATUS } from '../simulation.mjs';

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

// --- Paquets sur les câbles : le paquet suit le tracé du câble dessiné par links.mjs ---

/** Scène minimale : un groupe « World » avec les équipements de la démo et leurs vrais câbles. */
function sceneWithCables() {
  const world = new THREE.Group();
  const roots = new Map();
  for (const [id, p] of positions) {
    const root = new THREE.Object3D();
    root.position.set(p.x, p.y, p.z);
    roots.set(id, root);
    world.add(root);
  }
  const links = [
    { id: 'l1', from: 'pc1', to: 'sw1' },
    { id: 'l2', from: 'sw1', to: 'r1' },
    { id: 'l3', from: 'r1', to: 'sw2' },
    { id: 'l4', from: 'sw2', to: 'pc2' },
  ];
  const layer = createLinkLayer(links, roots);
  world.add(layer.group);
  return { world, layer };
}

test("pathPoint : avance à vitesse constante le long d'une ligne brisée", () => {
  const points = [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, { x: 3, y: 0, z: 1 }]; // longueur 3 + 1
  assert.deepEqual(pathPoint(points, 0), { x: 0, y: 0, z: 0 });
  assert.deepEqual(pathPoint(points, 0.5), { x: 2, y: 0, z: 0 });
  assert.deepEqual(pathPoint(points, 0.875), { x: 3, y: 0, z: 0.5 });
  assert.deepEqual(pathPoint(points, 1), { x: 3, y: 0, z: 1 });
  assert.deepEqual(pathPoint(points, 2), pathPoint(points, 1));
});

test("cablePath : retrouve le câble par son id et l'oriente dans le sens du paquet", () => {
  const { world } = sceneWithCables();
  const forward = cablePath(world, { link: 'l1', source: 'pc1', destination: 'sw1' });
  const backward = cablePath(world, { link: 'l1', source: 'sw1', destination: 'pc1' });
  assert.equal(forward.length, 3); // départ, creux du câble, arrivée
  assert.deepEqual(backward, [...forward].reverse());
  assert.ok(forward[0].x < forward[2].x, 'de pc1 (x = -4) vers sw1 (x = -2)');
  assert.ok(forward[1].y <= forward[0].y, 'le milieu du câble est le point le plus bas');
  // Sans id de lien, on le retrouve par ses deux extrémités.
  assert.deepEqual(cablePath(world, { source: 'pc1', destination: 'sw1' }), forward);
  assert.equal(cablePath(world, { source: 'pc1', destination: 'pc2' }), null);
  assert.equal(cablePath(new THREE.Group(), { source: 'pc1', destination: 'sw1' }), null);
});

test('cablePath : même tracé quand le monde est réduit et déplacé (mode VR)', () => {
  const { world } = sceneWithCables();
  const before = cablePath(world, { link: 'l2', source: 'sw1', destination: 'r1' });
  world.scale.setScalar(0.25);
  world.position.set(0, 1, -2);
  const after = cablePath(world, { link: 'l2', source: 'sw1', destination: 'r1' });
  after.forEach((p, i) => {
    for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(p[axis] - before[i][axis]) < 1e-9);
  });
});

test("computeFrame place le paquet sur le câble, pas en l'air", () => {
  const { world } = sceneWithCables();
  const event = { id: 7, link: 'l1', source: 'pc1', destination: 'sw1', packet: { id: 'p1', protocol: 'demo', type: 'request' } };
  const getPath = (e) => cablePath(world, e);
  const path = getPath(event);
  for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    const [item] = computeFrame([{ event, progress }], getPosition, getPath);
    assert.deepEqual(item.position, pathPoint(path, progress));
    assert.ok(item.position.y < PACKET_HEIGHT, `y = ${item.position.y}`);
  }
  // Sans câble dessiné : repli en ligne droite au-dessus des équipements.
  const [fallback] = computeFrame([{ event, progress: 0.5 }], getPosition, () => null);
  assert.deepEqual(fallback.position, packetPosition(getPosition('pc1'), getPosition('sw1'), 0.5));
});

test('mountPacketAnimator : le paquet de la démo suit les câbles de la scène', async () => {
  const { world } = sceneWithCables();
  const scheduler = manualScheduler();
  const sim = createMockSimulation({ scheduler });
  await sim.load(DEMO_SCENARIO);
  const render = { world, getDevice: (id) => (positions.has(id) ? { position: positions.get(id) } : null) };
  const animator = mountPacketAnimator({ sim, render });
  sim.play();
  scheduler.frame(16);
  scheduler.frame(184); // milieu du câble pc1 → sw1
  const [item] = animator.getFrame();
  const path = cablePath(world, { source: 'pc1', destination: 'sw1' });
  const expected = pathPoint(path, item.progress);
  for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(item.position[axis] - expected[axis]) < 1e-9, axis);
  const mesh = world.getObjectByName('packets').children[0];
  assert.ok(Math.abs(mesh.position.y - expected.y) < 1e-9, 'la sphère est sur le câble');
  animator.dispose();
});

test('tous les paquets ont la même taille, diffusion comprise', () => {
  const sim = {
    on: () => () => {},
    getPacketsInFlight: () => [
      { event: { id: 1, source: 'pc1', destination: 'sw1', packet: { id: 'u', protocol: 'icmp', type: 'request', eth: { dst: '02:00:00:00:02:01' } } }, progress: 0.5 },
      { event: { id: 2, source: 'sw1', destination: 'r1', packet: { id: 'b', protocol: 'arp', type: 'request', eth: { dst: 'ff:ff:ff:ff:ff:ff' } } }, progress: 0.5 },
    ],
  };
  const parent = new THREE.Group();
  const animator = createPacketAnimator({ sim, parent, getPosition });
  const [unicast, broadcast] = animator.getFrame();
  assert.equal(unicast.broadcast, false);
  assert.equal(broadcast.broadcast, true);
  const sizes = parent.getObjectByName('packets').children.map((mesh) => mesh.scale.x);
  assert.deepEqual(sizes, [PACKET_RADIUS, PACKET_RADIUS]);
  animator.dispose();
});
