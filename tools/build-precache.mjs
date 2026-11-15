// Ayoub (S2) : génère la liste des fichiers à mettre en cache pour le mode hors ligne.
//
//   node tools/build-precache.js            écrit precache-manifest.js à la racine
//
// Lancé par la CI à chaque pull request (vérification) et avant chaque déploiement : personne
// ne maintient la liste à la main, et personne n'édite sw.js pour ajouter un fichier.
// sw.js charge la liste avec importScripts('./precache-manifest.js') et précache chaque fichier.
//
// Le fichier généré n'est pas versionné (.gitignore) : il est recréé à chaque déploiement.

import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const OUTPUT = 'precache-manifest.js';

/** Fichiers isolés nécessaires au démarrage de l'application. */
const ROOT_FILES = ['index.html', 'styles.css', 'main.js', 'simulation.js', 'manifest.json'];

/** Dossiers parcourus récursivement. Docs, tests, outils et CI n'en font pas partie. */
const FOLDERS = ['src', 'scenarios', 'assets', 'vendor/three/build', 'vendor/three/examples'];

/** Types de fichiers utiles au navigateur. */
const EXTENSIONS = new Set([
  '.js', '.mjs', '.json', '.css', '.html',
  '.glb', '.gltf', '.bin',
  '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico',
  '.woff2',
]);

const extension = (name) => (name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '');
const isTest = (name) => /\.test\.(m?js)$/.test(name);
const toUrl = (root, file) => `./${relative(root, file).split(sep).join('/')}`;

async function walk(folder) {
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return []; // dossier pas encore créé
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.isFile() && EXTENSIONS.has(extension(entry.name)) && !isTest(entry.name)) files.push(path);
  }
  return files;
}

/**
 * Liste les fichiers à précacher, en chemins relatifs (le site est servi sous /<nom-du-dépôt>/).
 * @param {string} root racine du dépôt
 * @returns {Promise<string[]>} URL triées, la première est './' (la page d'accueil)
 */
export async function listFiles(root) {
  const files = [];
  for (const name of ROOT_FILES) {
    try {
      await readFile(join(root, name));
      files.push(join(root, name));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  for (const folder of FOLDERS) files.push(...(await walk(join(root, folder))));
  const urls = [...new Set(files.map((file) => toUrl(root, file)))].sort();
  return ['./', ...urls];
}

/**
 * Construit la liste et sa version. La version change dès qu'un fichier listé change,
 * ce qui permet au Service Worker de remplacer l'ancien cache (nom du cache = version).
 * @param {string} root
 * @returns {Promise<{ version: string, files: string[] }>}
 */
export async function buildManifest(root) {
  const files = await listFiles(root);
  const hash = createHash('sha256');
  for (const url of files) {
    if (url === './') continue;
    hash.update(url);
    hash.update(await readFile(join(root, url)));
  }
  return { version: hash.digest('hex').slice(0, 12), files };
}

/** Contenu du fichier généré, chargeable par importScripts() dans le Service Worker. */
export function render({ version, files }) {
  return (
    '// Fichier généré par tools/build-precache.js : ne pas modifier à la main.\n' +
    `self.PRECACHE_MANIFEST = ${JSON.stringify({ version, files }, null, 2)};\n`
  );
}

// Exécution en ligne de commande (comparaison robuste sous Windows : casse, liens, chemin relatif).
const samePath = (a, b) => {
  const norm = (p) => {
    try {
      p = realpathSync(resolve(p));
    } catch {
      p = resolve(p);
    }
    return process.platform === 'win32' ? p.toLowerCase() : p;
  };
  return norm(a) === norm(b);
};
if (process.argv[1] && samePath(fileURLToPath(import.meta.url), process.argv[1])) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = await buildManifest(root);
  await writeFile(join(root, OUTPUT), render(manifest));
  console.log(`${OUTPUT} : ${manifest.files.length} entrées, version ${manifest.version}`);
}
