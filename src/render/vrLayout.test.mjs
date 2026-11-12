// Tests du placement VR, de la boucle d'animation et du lancer de rayon détaillé.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as THREE from '../../vendor/three/build/three.module.js';
import { createMockSimulation, DEMO_SCENARIO } from '../../simulation.js';
import { createMockRenderer } from './mock.js';
import { pickHitFromObjects } from './scene.js';
import {
  DEFAULT_EYE_HEIGHT, frameDelta, topologyBounds, VR_DISTANCE, VR_EYE_DROP, VR_MAX_SCALE,
  VR_MIN_SCALE, VR_TARGET_SIZE, vrPlacement,
} from './vrLayout.js';

const at = (x, z) => ({ position: { x, y: 0, z } });
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, message ?? `${actual} ≠ ${expected}`);

test('topologyBounds : centre et étendue au sol ; topologie vide tolérée', () => {
  assert.deepEqual(topologyBounds([at(-4, 0), at(4, 2), at(0, -2)]), { centerX: 0, centerZ: 0, width: 8, depth: 4 });
  assert.deepEqual(topologyBounds([]), { centerX: 0, centerZ: 0, width: 0, depth: 0 });
  assert.deepEqual(topologyBounds(undefined), { centerX: 0, centerZ: 0, width: 0, depth: 0 });
});

test('vrPlacement : la maquette tient dans la largeur visée, centrée devant l\'utilisateur, sous ses yeux', () => {
  const bounds = topologyBounds([at(2, 10), at(10, 10)]); // topologie décentrée, 8 de large
  const { scale, position, anchor } = vrPlacement(bounds, 1.6);

  near(anchor.width, VR_TARGET_SIZE);
  assert.equal(anchor.z, -VR_DISTANCE);
  near(anchor.y, 1.6 - VR_EYE_DROP);
  // Le centre de la topologie (6, 0, 10) arrive sur le point d'ancrage.
  near(position.x + 6 * scale, anchor.x);
  near(position.z + 10 * scale, anchor.z);
});

test('vrPlacement : échelle bornée, hauteur adaptée (assis, espace sans sol, pose inconnue)', () => {
  assert.equal(vrPlacement(topologyBounds([at(0, 0)])).scale, VR_MAX_SCALE, 'un seul équipement : pas de zoom excessif');
  assert.equal(vrPlacement(topologyBounds([at(-500, 0), at(500, 0)])).scale, VR_MIN_SCALE);

  const bounds = topologyBounds([at(-4, 0), at(4, 0)]);
  assert.ok(vrPlacement(bounds, 1.15).anchor.y < vrPlacement(bounds, 1.7).anchor.y, 'assis : maquette plus basse');
  near(vrPlacement(bounds, 0).anchor.y, -VR_EYE_DROP, 'espace « local » : origine à la tête');
  assert.equal(vrPlacement(bounds, Number.NaN).anchor.y, vrPlacement(bounds, DEFAULT_EYE_HEIGHT).anchor.y);
});

test('frameDelta : 0 à la première image, jamais négatif', () => {
  assert.equal(frameDelta(null, 1000), 0);
  assert.equal(frameDelta(1000, 1016), 16);
  assert.equal(frameDelta(1000, 990), 0);
  assert.equal(frameDelta(1000, Number.NaN), 0);
});

test('pickHitFromObjects renvoie l\'équipement, le point d\'impact et la distance', () => {
  const group = new THREE.Group();
  group.userData.deviceId = 'pc1';
  group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
  group.position.set(0, 0, -4);

  const hit = pickHitFromObjects(new THREE.Raycaster(), [group], { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
  assert.equal(hit.id, 'pc1');
  assert.ok(Math.abs(hit.distance - 3.5) < 1e-6);
  assert.ok(Math.abs(hit.point.z + 3.5) < 1e-6);
  assert.equal(pickHitFromObjects(new THREE.Raycaster(), [group], { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), null);
});

test('faux rendu : pickDeviceHit, onFrame et getVRAnchor suivent le contrat de la scène', () => {
  const render = createMockRenderer();
  render.loadTopology({ devices: [{ id: 'a', type: 'pc', position: [0, 0, -5] }], links: [] });
  const hit = render.pickDeviceHit({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
  assert.equal(hit.id, 'a');
  assert.equal(hit.distance, 5);
  assert.equal(hit.point.z, -5);
  assert.equal(render.pickDevice({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }), 'a');
  assert.equal(render.getVRAnchor(), null);

  const frames = [];
  const off = render.onFrame((info) => frames.push(info.delta));
  render.emitFrame({ delta: 16 });
  off();
  render.emitFrame({ delta: 16 });
  assert.deepEqual(frames, [16]);
});

test('la boucle de rendu fait avancer la simulation (branchement de src/render/index.js)', async () => {
  const sim = createMockSimulation({ scheduler: { start: () => () => {} } });
  await sim.load(DEMO_SCENARIO);
  const render = createMockRenderer();
  render.onFrame(({ delta }) => sim.tick(delta)); // même branchement que dans index.js

  sim.play();
  render.emitFrame({ delta: 50, presenting: true }); // image d'une session VR
  render.emitFrame({ delta: 50, presenting: true });
  assert.equal(sim.getState().time, 100);
  sim.pause();
  render.emitFrame({ delta: 50 });
  assert.equal(sim.getState().time, 100, 'en pause, le temps simulé ne bouge pas');
});

test('nearestOnRay : cible la plus proche du rayon dans la tolérance, jamais derrière la manette', async () => {
  const { nearestOnRay } = await import('./picking.js');
  const ray = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 } };
  const points = [
    { id: 'loin', x: 0.5, y: 0, z: -3 },
    { id: 'proche', x: 0.1, y: 0, z: -6 },
    { id: 'derriere', x: 0, y: 0, z: 4 },
  ];
  const hit = nearestOnRay(ray, points, 0.6);
  assert.equal(hit.id, 'proche');
  assert.equal(hit.distance, 6);
  assert.deepEqual(hit.point, { x: 0, y: 0, z: -6 });
  assert.equal(nearestOnRay(ray, points, 0.05), null);
  assert.equal(nearestOnRay(ray, [points[2]], 10), null);
});
