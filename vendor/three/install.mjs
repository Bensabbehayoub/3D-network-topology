// Copie Three.js dans vendor/three/ : aucun CDN à l'exécution, le site fonctionne hors ligne.
//
//   node vendor/three/install.mjs [dossier-du-paquet-three]
//
// Le dossier source est le paquet npm « three » décompressé, par exemple :
//   npm pack three@0.187.0 && tar -xzf three-0.187.0.tgz     → dossier ./package
//   node vendor/three/install.mjs ./package
// Sans argument, le script lit node_modules/three (après `npm install --no-save three@0.187.0`).
// Aucune dépendance n'est ajoutée à package.json.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const VERSION = '0.187.0';

/**
 * Fichiers copiés.
 * - build/three.core.js     : cœur (scène, géométries, matériaux…), importé par three.webgpu.js
 * - build/three.webgpu.js   : WebGPURenderer, seul renderer du projet (rendu 100 % WebGPU, voir
 *                             docs/decision-renderer.md). Le build WebGL (WebGLRenderer) n'est pas copié.
 * - build/three.tsl.js      : langage de nœuds, importé par three.webgpu.js
 * - modules complémentaires : contrôles de caméra, chargeur glTF et leurs utilitaires
 */
export const FILES = Object.freeze([
  'build/three.core.js',
  'build/three.webgpu.js',
  'build/three.tsl.js',
  'examples/jsm/controls/OrbitControls.js',
  'examples/jsm/loaders/GLTFLoader.js',
  'examples/jsm/utils/BufferGeometryUtils.js',
  'examples/jsm/utils/SkeletonUtils.js',
]);

/**
 * Les modules complémentaires importent « three » (nom de paquet, résolu par un bundler ou une
 * import map). On le remplace par le chemin relatif du build WebGPU local : pas d'import map à
 * maintenir, et aucun module ne charge le build WebGL.
 */
export function rewriteBareImport(code) {
  return code.replace(/from\s+['"]three['"]/g, "from '../../../build/three.webgpu.js'");
}

const isAddon = (path) => path.startsWith('examples/');

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = new URL('../../', import.meta.url);
  const source = pathToFileURL(`${resolve(process.argv[2] ?? new URL('node_modules/three/', root).pathname.replace(/^\/([A-Za-z]:)/, '$1'))}/`);
  const destination = new URL('./', import.meta.url);
  const pkg = JSON.parse(await readFile(new URL('package.json', source), 'utf8'));
  if (pkg.version !== VERSION) throw new Error(`Three.js ${VERSION} attendu, ${pkg.version} trouvé dans ${source.pathname}`);

  for (const path of FILES) {
    const target = new URL(path, destination);
    await mkdir(new URL('.', target), { recursive: true });
    const code = await readFile(new URL(path, source), 'utf8');
    await writeFile(target, isAddon(path) ? rewriteBareImport(code) : code);
  }
  await copyFile(new URL('LICENSE', source), new URL('LICENSE', destination));
  await writeFile(new URL('VERSION.txt', destination), `three ${pkg.version}\n`);
  console.log(`Three.js ${pkg.version} copié dans vendor/three/ (${FILES.length} fichiers + LICENSE) ; imports locaux uniquement.`);
}
