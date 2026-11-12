Three.js 0.187.0 (r187), copié ici pour fonctionner sans CDN et hors ligne. Licence MIT : `LICENSE`.

Mise à jour (aucune dépendance ajoutée au projet) :

    npm pack three@0.187.0
    tar -xzf three-0.187.0.tgz
    node vendor/three/install.mjs ./package

ou, après `npm install --no-save three@0.187.0`, simplement `node vendor/three/install.mjs`.

Le script vérifie la version, copie les fichiers listés dans `FILES` (le build WebGPU `three.webgpu.js`,
le cœur `three.core.js` qu'il importe, `three.tsl.js`, les contrôles de caméra et le chargeur glTF),
remplace l'import `from 'three'` des modules complémentaires par le chemin relatif de `three.webgpu.js`,
puis copie `LICENSE` et écrit `VERSION.txt`. Le build WebGL (`three.module.js`, `WebGLRenderer`) n'est
volontairement pas copié : le rendu est 100 % WebGPU.

Choix du renderer : `docs/decision-renderer.md`. Tests : `node --test src/render/renderers.test.mjs src/render/xrBridge.test.mjs`.
