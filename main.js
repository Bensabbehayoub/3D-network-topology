// Point d'entrée de l'application. Figé après S1 : chaque pôle branche ses
// sous-modules dans son propre index.mjs, jamais ici.
//
// Chaque index.mjs exporte `async function init(app)` et renvoie son API publique,
// rangée dans `app` sous le nom du pôle. L'ordre compte : chaque pôle peut utiliser
// ceux qui le précèdent (ui reçoit app.sim et app.render, xr reçoit les trois).
const MODULES = [
  ['sim', './src/sim/index.mjs'],
  ['render', './src/render/index.mjs'],
  ['ui', './src/ui/index.mjs'],
  ['xr', './src/xr/index.mjs'],
];

const app = {};

for (const [name, path] of MODULES) {
  try {
    const module = await import(path);
    app[name] = await module.init(app);
  } catch (error) {
    // Un pôle en panne ne doit pas emporter les autres : sans XR, le mode 2D reste utilisable.
    console.error(`Module "${name}" non chargé :`, error);
  }
}

if ('serviceWorker' in navigator) {
  // Chemin relatif : GitHub Pages sert le site sous /<nom-du-dépôt>/.
  navigator.serviceWorker.register('./sw.js').catch((error) => {
    console.error('Service Worker non enregistré :', error);
  });
}
