Three.js S1 proposed pin: 0.180.0 (confirm with Ayoub before merging).

From the repository root, run:

    npm install --no-save three@0.180.0
    node vendor/three/install.mjs

Commit the resulting `vendor/three/build/*.js`,
`vendor/three/examples/jsm/controls/OrbitControls.js`, and VERSION.txt.
The install script rewrites the addon import to use locally committed Three.js,
so the website works on GitHub Pages without a CDN or importmap changes.

Testing:
    node --test src/render/topology.test.mjs

Rendered output is mounted in existing #scene through main.js -> render.init(app).
Ramy-owned index.html and Ayoub-owned main.js are not modified.
The display uses provisional fallback sample data until Khalil's JSON schema is approved.
