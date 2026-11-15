// Génère les icônes de la PWA dans assets/icons/, sans dépendance (PNG écrit avec zlib de Node).
//
//   node tools/build-icons.js
//
// Les fichiers produits sont versionnés : on ne relance le script que pour changer le dessin.
// Dessin : trois équipements reliés (un petit réseau) sur le fond de l'application (#101418).
// - icônes « any » : carré aux coins arrondis, coins transparents ;
// - icône « maskable » : fond plein jusqu'aux bords, dessin dans la zone sûre (cercle central
//   de 80 % du côté), car le système peut rogner l'icône en cercle ou en carré arrondi.

import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

export const OUTPUT_DIR = 'assets/icons';

/** Icônes à produire. `purpose` est repris tel quel dans manifest.json. */
export const ICONS = Object.freeze([
  { file: 'icon-192.png', size: 192, purpose: 'any' },
  { file: 'icon-512.png', size: 512, purpose: 'any' },
  { file: 'icon-maskable-512.png', size: 512, purpose: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, purpose: 'apple' },
]);

const BACKGROUND = [0x10, 0x14, 0x18];
const LINK = [0x9f, 0xb0, 0xc0];
/** Équipements : position dans un carré unité centré (−0,5 … 0,5), rayon, couleur. */
const NODES = [
  { x: 0, y: -0.27, r: 0.13, color: [0xff, 0xb4, 0x54] }, // routeur
  { x: -0.28, y: 0.22, r: 0.115, color: [0x4e, 0xa8, 0xff] }, // PC
  { x: 0.28, y: 0.22, r: 0.115, color: [0x3d, 0xdc, 0x84] }, // switch
];
const LINKS = [[0, 1], [0, 2], [1, 2]];
const LINK_WIDTH = 0.045;

// --- Encodage PNG (RGBA 8 bits, non entrelacé) ---

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba width × height × 4 octets
 * @returns {Buffer} fichier PNG
 */
export function encodePng(width, height, rgba) {
  if (rgba.length !== width * height * 4) throw new RangeError('encodePng : taille des pixels incohérente');
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA, deflate, filtre standard, non entrelacé
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filtre « aucun » pour la ligne
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Lit la taille d'un PNG (en-tête IHDR). Sert aux tests. */
export function readPngSize(buffer) {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47 || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new TypeError('fichier PNG invalide');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

// --- Dessin (distances signées, bords lissés sur un pixel) ---

const clamp01 = (value) => Math.min(1, Math.max(0, value));

function segmentDistance(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = clamp01(((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

function roundedSquareDistance(px, py, half, radius) {
  const qx = Math.abs(px) - (half - radius);
  const qy = Math.abs(py) - (half - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/**
 * @param {number} size côté en pixels
 * @param {{ maskable?: boolean, opaque?: boolean }} [options] opaque : pas de coins transparents
 *   (iOS remplace la transparence par du noir sur l'écran d'accueil)
 * @returns {Uint8Array} pixels RGBA
 */
export function drawIcon(size, { maskable = false, opaque = false } = {}) {
  const pixels = new Uint8Array(size * size * 4);
  const scale = maskable ? 0.62 : 0.86; // maskable : tout le dessin tient dans la zone sûre
  const fullBleed = maskable || opaque;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Coordonnées du centre du pixel dans le carré unité, puis dans le repère du dessin.
      const ux = (x + 0.5) / size - 0.5;
      const uy = (y + 0.5) / size - 0.5;
      const px = ux / scale;
      const py = uy / scale;
      const edge = 1 / (size * scale); // largeur d'un pixel dans le repère du dessin

      let color = BACKGROUND;
      const blend = (top, coverage) => {
        color = color.map((channel, i) => Math.round(channel + (top[i] - channel) * coverage));
      };
      for (const [from, to] of LINKS) {
        const distance = segmentDistance(px, py, NODES[from], NODES[to]) - LINK_WIDTH / 2;
        blend(LINK, clamp01(0.5 - distance / edge));
      }
      for (const node of NODES) {
        const distance = Math.hypot(px - node.x, py - node.y);
        blend(BACKGROUND, clamp01(0.5 - (distance - node.r - 0.03) / edge)); // liseré sombre
        blend(node.color, clamp01(0.5 - (distance - node.r) / edge));
      }

      const alpha = fullBleed ? 1 : clamp01(0.5 - roundedSquareDistance(ux, uy, 0.5, 0.18) * size);
      pixels.set([...color, Math.round(alpha * 255)], (y * size + x) * 4);
    }
  }
  return pixels;
}

/** @returns {Buffer} le PNG d'une entrée de ICONS */
export function buildIcon({ size, purpose }) {
  const options = { maskable: purpose === 'maskable', opaque: purpose === 'apple' };
  return encodePng(size, size, drawIcon(size, options));
}

// Exécution en ligne de commande (comparaison robuste sous Windows : casse, liens).
const normalize = (path) => {
  let full = resolve(path);
  try {
    full = realpathSync(full);
  } catch {
    // chemin inexistant : on garde la forme résolue
  }
  return process.platform === 'win32' ? full.toLowerCase() : full;
};
if (process.argv[1] && normalize(fileURLToPath(import.meta.url)) === normalize(process.argv[1])) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  await mkdir(join(root, OUTPUT_DIR), { recursive: true });
  for (const icon of ICONS) {
    const png = buildIcon(icon);
    await writeFile(join(root, OUTPUT_DIR, icon.file), png);
    console.log(`${OUTPUT_DIR}/${icon.file} : ${icon.size} × ${icon.size}, ${png.length} octets`);
  }
}
