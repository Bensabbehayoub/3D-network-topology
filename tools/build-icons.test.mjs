// Tests de tools/build-icons.js et des icônes versionnées dans assets/icons/.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';

import { buildIcon, drawIcon, encodePng, ICONS, OUTPUT_DIR, readPngSize } from './build-icons.js';

const repoFile = (path) => readFile(new URL(`../${path}`, import.meta.url));
const pixel = (pixels, size, x, y) => [...pixels.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)];

test('encodePng produit un PNG lisible : signature, taille, pixels retrouvés', () => {
  const rgba = Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 1, 2, 3, 4]);
  const png = encodePng(2, 2, rgba);
  assert.deepEqual(readPngSize(png), { width: 2, height: 2 });

  const idatLength = png.readUInt32BE(33);
  assert.equal(png.toString('ascii', 37, 41), 'IDAT');
  const raw = inflateSync(png.subarray(41, 41 + idatLength));
  assert.deepEqual([...raw], [0, 255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 0, 255, 0, 1, 2, 3, 4]);
  assert.throws(() => encodePng(2, 2, new Uint8Array(3)), RangeError);
  assert.throws(() => readPngSize(Buffer.from('pas un png, vraiment pas du tout')), TypeError);
});

test('icône « any » : coins transparents ; icône « maskable » : fond plein jusqu\'aux bords', () => {
  const size = 64;
  assert.equal(pixel(drawIcon(size), size, 0, 0)[3], 0);
  assert.deepEqual(pixel(drawIcon(size, { maskable: true }), size, 0, 0), [0x10, 0x14, 0x18, 255]);
  assert.equal(pixel(drawIcon(size, { opaque: true }), size, 0, 0)[3], 255);
});

test('icône maskable : tout le dessin tient dans la zone sûre (cercle de 80 % du côté)', () => {
  const size = 128;
  const pixels = drawIcon(size, { maskable: true });
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const outside = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) > 0.4;
      if (outside) assert.deepEqual(pixel(pixels, size, x, y), [0x10, 0x14, 0x18, 255], `pixel ${x},${y} hors zone sûre`);
    }
  }
});

test('le dessin est déterministe', () => {
  assert.deepEqual(drawIcon(48), drawIcon(48));
});

test('les icônes versionnées existent, à la bonne taille', async () => {
  for (const icon of ICONS) {
    const png = await repoFile(`${OUTPUT_DIR}/${icon.file}`);
    assert.deepEqual(readPngSize(png), { width: icon.size, height: icon.size }, icon.file);
    assert.deepEqual(readPngSize(buildIcon(icon)), { width: icon.size, height: icon.size });
  }
});

test('manifest.json : icônes 192 et 512 px, dont une maskable, fichiers présents et tailles exactes', async () => {
  const manifest = JSON.parse(await repoFile('manifest.json'));
  const sizes = manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose}`);
  for (const expected of ['192x192:any', '512x512:any', '512x512:maskable']) {
    assert.ok(sizes.includes(expected), `icône ${expected} absente du manifest`);
  }
  for (const icon of manifest.icons) {
    assert.equal(icon.type, 'image/png');
    const { width, height } = readPngSize(await repoFile(icon.src));
    assert.equal(`${width}x${height}`, icon.sizes, icon.src);
  }
});
