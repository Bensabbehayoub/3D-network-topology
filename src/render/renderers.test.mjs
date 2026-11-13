// Tests du renderer (src/render/renderers.js) : rendu 100 % WebGPU, sans navigateur.
// La création réelle est vérifiée dans Chrome (docs/decision-renderer.md).
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { assertWebGPU, BACKEND, extraSessionFeatures, isWebGPU, WEBGPU_REQUIRED_MESSAGE, WebGPUUnavailableError, webgpuMissingReason } from './renderers.js';

const root = new URL('../../', import.meta.url);

test('le seul backend est WebGPU ; le repli WebGL de WebGPURenderer est refusé', () => {
  assert.equal(BACKEND, 'WebGPU');
  assert.equal(isWebGPU({ backend: { isWebGPUBackend: true } }), true);
  assert.equal(isWebGPU({ backend: { isWebGLBackend: true } }), false, 'repli WebGL 2 de WebGPURenderer');
  assert.equal(isWebGPU(undefined), false);
});

test('sans WebGPU : raison précise, erreur dédiée et message « WebGPU requis » en français', async () => {
  assert.equal(webgpuMissingReason({ gpu: true, adapter: true }), null);
  assert.equal(webgpuMissingReason({ gpu: false, adapter: false }), 'navigator.gpu absent');
  assert.match(webgpuMissingReason({ gpu: true, adapter: false }), /adaptateur/);
  await assert.rejects(assertWebGPU({ navigator: {} }), (error) => error instanceof WebGPUUnavailableError && error.detail === 'navigator.gpu absent');
  await assert.rejects(assertWebGPU({ navigator: { gpu: { requestAdapter: async () => null } } }), WebGPUUnavailableError);
  await assert.rejects(assertWebGPU({ navigator: { gpu: { requestAdapter: async () => { throw new Error('bloqué'); } } } }), WebGPUUnavailableError);
  await assertWebGPU({ navigator: { gpu: { requestAdapter: async () => ({}) } } });
  assert.match(WEBGPU_REQUIRED_MESSAGE, /nécessite WebGPU/);
  assert.equal(new WebGPUUnavailableError('x').name, 'WebGPUUnavailableError');
});

test('la session VR demande toujours « webgpu »', () => {
  assert.deepEqual(extraSessionFeatures(), ['webgpu']);
});

test('Three.js r187 embarqué : build WebGPU seulement, sans import « three » ni URL externe', async () => {
  const read = (path) => readFile(new URL(`vendor/three/${path}`, root), 'utf8');
  assert.equal((await read('VERSION.txt')).trim(), 'three 0.187.0');
  const webgpu = await import('../../vendor/three/build/three.webgpu.js');
  assert.equal(webgpu.REVISION, '187');
  assert.equal(typeof webgpu.WebGPURenderer, 'function');
  assert.equal('WebGLRenderer' in webgpu, false, 'le build WebGPU ne contient pas WebGLRenderer');
  assert.deepEqual((await readdir(new URL('vendor/three/build/', root))).sort(), ['three.core.js', 'three.tsl.js', 'three.webgpu.js']);
  for (const addon of ['examples/jsm/controls/OrbitControls.js', 'examples/jsm/loaders/GLTFLoader.js',
    'examples/jsm/utils/BufferGeometryUtils.js', 'examples/jsm/utils/SkeletonUtils.js']) {
    const code = await read(addon);
    assert.doesNotMatch(code, /from\s+['"]three['"]/, addon);
    assert.match(code, /from '\.\.\/\.\.\/\.\.\/build\/three\.webgpu\.js'/, addon);
    assert.doesNotMatch(code, /^\s*import[^;]*https?:\/\//m, addon);
  }
});

/** Fichiers JavaScript chargés par le navigateur (hors tests, hors outils de vérification, hors Three.js). */
async function appSources() {
  const files = ['main.js', 'simulation.js', 'sw.js'];
  const walk = async (dir) => {
    for (const entry of await readdir(new URL(dir, root), { withFileTypes: true })) {
      const path = `${dir}${entry.name}`;
      if (entry.isDirectory()) await walk(`${path}/`);
      else if (/\.m?js$/.test(entry.name) && !/\.test\.m?js$|smoke/.test(entry.name)) files.push(path);
    }
  };
  await walk('src/');
  return files;
}

test('zéro WebGL : aucun fichier de l\'application ne crée de contexte WebGL ni ne charge WebGLRenderer', async () => {
  const offenders = [];
  for (const path of await appSources()) {
    const code = (await readFile(new URL(path, root), 'utf8')).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    if (/getContext\(\s*['"](?:webgl|webgl2|experimental-webgl)['"]/.test(code)) offenders.push(`${path} : getContext('webgl…')`);
    if (/\bWebGLRenderer\b|three\.module\.js|forceWebGL/.test(code)) offenders.push(`${path} : WebGLRenderer, three.module.js ou forceWebGL`);
  }
  assert.deepEqual(offenders, []);
});
