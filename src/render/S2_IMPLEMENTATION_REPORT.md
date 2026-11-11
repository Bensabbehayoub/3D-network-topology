# Sprint 2 rendering implementation

## Delivered features

- Original lightweight GLB assets for PC, router, and Ethernet switch.
- A cached `GLTFLoader` device factory with immediate primitive fallbacks, model normalization, nested selection metadata, isolated highlight halos, cyan selected-material treatment, and shared-resource cleanup.
- Stable-ID cable creation with defensive endpoint resolution and refreshable geometry.
- Canvas-texture billboard labels containing the device name and optional IP address.
- Generation tracking that prevents late model loads from modifying a replaced or disposed topology.
- Preserved Sprint 1 synchronous `loadTopology()` summary and all existing public renderer methods. `pickDevice(origin, direction)` provides side-effect-free world-ray selection, while `whenReady()` remains an additive helper for integrations that need to await GLB upgrades.

## Architecture and lifecycle

`scene.js` owns the scene, camera, controls, renderer, topology groups, and event listeners. `factory.js` owns cached GLB templates, shared fallback resources, and highlight resources. A topology load adds deterministic fallbacks synchronously, creates links and labels, then replaces eligible devices as cached GLBs resolve. Each replacement refreshes cable endpoints and label heights.

Topology replacement disposes link geometries, link material, label textures, and label materials. GLB and fallback geometry/material resources remain shared until renderer disposal, when the factory releases them once. A generation token rejects stale asynchronous results, including results arriving after `dispose()`.

Router, switch, and PC/host use local GLBs. Server intentionally uses a recognizable rack-style primitive. A failed model request leaves the visible fallback in place and does not fail the scene.

## Assets and local loading

| Asset | Size | Characteristics |
| --- | ---: | --- |
| `assets/models/router.glb` | 3,932 bytes | Appliance body, front ports/lights, two antennas |
| `assets/models/switch.glb` | 4,556 bytes | Wide chassis, eight ports, link lights |
| `assets/models/pc.glb` | 3,748 bytes | Monitor, stand, screen, desktop tower |

The assets are original box-based low-poly geometry with embedded buffers and PBR materials, no textures, and no external resources. Reproduce them with:

```powershell
node assets/models/generate-models.mjs
```

The test suite validates the GLB magic, version, declared length, embedded glTF 2.0 JSON, size, mesh/material presence, and parsing through the vendored Three.js 0.180.0 `GLTFLoader`.

Runtime paths use `new URL('../../assets/models/...', import.meta.url)`, so they remain relative to the deployed module under a GitHub Pages repository subpath. `GLTFLoader.js` and `BufferGeometryUtils.js` are vendored locally; there is no CDN dependency.

## Links and labels

Links resolve `from` and `to` through the device map. Each cable is a subtle three-point line raised above the grid and offset toward device edges. Missing endpoints are skipped defensively. The returned link layer exposes its objects and `refresh()` for later highlighting or packet-animation integration, but implements no packet movement.

Labels are Three.js sprites, so they face the camera automatically. Their canvas textures are generated once per topology, never per frame, and are disposed on replacement. Names use prominent light text; optional IP addresses use a secondary cyan monospace line.

## Compatibility and performance

- Preserved: `init`, `initScene`, `loadTopology`, `highlightDevice`, `getDevice`, `listDevices`, `focusDevice`, `resetView`, `resize`, and `dispose`; added `pickDevice` without changing existing contracts.
- Preserved synchronous return value from `loadTopology`: `{devices, links}`.
- Preserved `topology:device-selected`; recursive raycasting and ancestor metadata support nested GLB meshes.
- Preserved the Sprint 1 mock renderer and fallback demo topology.
- Pixel ratio remains capped at 2. Model templates, fallback templates, geometries, and materials are cached/shared. No per-frame loading, texture generation, or topology rebuilding occurs.

## Tests and outcomes

Commands executed:

```powershell
node --test src/render/sprint2.test.mjs
npm test
node src/render/browser-smoke.mjs
git diff --check
```

Final automated result: 56 tests discovered, 42 passed, 0 failed, 14 existing simulation TODOs, and 0 skipped. The renderer tests additionally cover direct and nested world-ray picking, nearest hits, misses, invalid rays, mock parity, side-effect-free browser picking, cyan per-instance highlighting, loaded-model highlighting, and exact material restoration.

The headless Chrome smoke test used the actual application over local HTTP. It confirmed WebGL creation, local fetches for all three model types, device/link counts, native pointer selection (`sw-1`), side-effect-free world-ray picking (`sw`), highlight and focus calls, visible response to native rotation/zoom input, successful reload, and zero console errors. A captured frame was also visually inspected and showed the models, three fallback-demo links, and labels.

## Manual browser validation

Run `node src/render/browser-smoke.mjs` for the automated smoke test. For manual review, serve the repository over HTTP, open `index.html`, then verify orbit drag, wheel/pinch zoom, device selection, highlights driven by the API, label readability at different angles, and responsive layout on the intended phone/tablet hardware.

## Remaining integration assumptions

- `normalizeTopology()` remains the approved Sprint 1 adapter (`devices[]`, `links[]`, and `[x,y,z]` positions). Update only after the shared scenario schema is agreed by the team.
- There is no dedicated server GLB by design; the rack fallback satisfies the current Sprint 2 requirement.
- WebXR device-specific rendering and mobile GPU behavior require team hardware testing; no XR or simulation logic was added here.
