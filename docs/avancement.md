# Avancement de la refonte

Fichier de reprise : une nouvelle conversation doit pouvoir continuer le travail à partir d'ici.
Mis à jour à la fin de chaque phase. Branche de travail : `feature/refonte-prof`.

## Règles de travail

- Aucun `git add`, `commit`, `push`, `merge` ni `rebase` par l'assistant : Ramy commite après chaque phase.
- Pour chaque phase : plan court → accord → code + tests → `node --test` → vérification dans le
  navigateur → résumé des fichiers + message de commit → arrêt. Jamais deux phases à la suite.
- Modules ES natifs, aucun bundler, aucun CDN, aucune URL externe à l'exécution, chemins relatifs
  (site servi sous `/3D-network-topology/`). Bibliothèques copiées dans `vendor/`.
- Aucune dépendance npm à l'exécution ; dépendance de développement seulement avec accord.
- Logique pure séparée du DOM et de Three.js, testée sous Node. Suite toujours à 0 échec.
- Valeurs des scénarios ou de l'utilisateur écrites avec `textContent`, jamais `innerHTML`.
- Interface en français, responsive (cibles ≥ 44 px), accessible (ARIA, clavier).
- Tout changement de contrat est reporté dans `docs/simulation/contrats.md` et dans les tests.
- Modèles d'équipements du catalogue : génériques et fictifs, valeurs réalistes.
- La répartition par membre (CODEOWNERS) est suspendue pendant la refonte.

## État des lieux (12 novembre 2026, avant la phase 1)

Tests : `node --test` → 188 tests, 177 réussis, 11 « à faire » (protocoles et équipements non écrits), 0 échec.

| Domaine | État |
| --- | --- |
| Moteur (`src/sim/`) | Contrôleur, file d'évènements, bus, états, validation des scénarios : faits et testés. `app.sim` est encore le **faux moteur** (`mock.js`, protocole « demo »). |
| Protocoles (`src/sim/protocols/`) | **Vides** (9 lignes chacun) : ARP, ICMP, UDP, DNS, DHCP, TCP, HTTP. Pas de routage. |
| Équipements (`src/sim/devices/`) | **Vides** : `host.js`, `switch.js`, `router.js`. |
| Scénarios | `arp.json` complet ; les sept autres sont des ébauches de 6 lignes. |
| Rendu (`src/render/`) | Three.js **r180**, `WebGLRenderer`. Topologie, liens, étiquettes, modèles GLB, surbrillance, lancer de rayon (`picking.js`), animation des paquets. |
| Interface (`src/ui/`) | Commandes, sélection, fiche d'équipement : faites et testées. `scenarioPicker.js` et `explanations.js` : gabarits S1 sans logique. `install.js` : vide. Pas d'inspecteur de paquet ni de journal. |
| XR (`src/xr/`) | Détection WebXR, statut, entrée et sortie de session `immersive-vr`. `vrPanel.js` et `controllers.js` : vides. |
| PWA | `manifest.json` sans icône ; `sw.js` ne met rien en cache ; `tools/build-precache.js` génère `precache-manifest.js` (non versionné) mais rien ne le lit. |
| CI | Tests, génération du précache, déploiement GitHub Pages. Pas de vérification après déploiement. |
| Documentation | README et architecture décrivent l'état S1 ; `decision-renderer.md` se contredit sur la version (r187 annoncée, r180 embarquée). |

## Phases

| N° | Phase | Statut |
| --- | --- | --- |
| 1 | PWA complète (icônes, précache, hors ligne, bouton Installer) | ✅ Terminé (12 nov), à commiter par Ramy |
| 2 | Three.js r187, WebGPU, boucle d'animation WebXR unique | À faire (la boucle unique et `app.sim.tick` sont déjà faits en phase 3) |
| 3 | Session immersive complète (panneau VR, manettes, fiches en VR) | ✅ Terminé (12 nov), à commiter par Ramy |
| 4 | Moteur réel, équipements et protocoles | À faire |
| 5 | Caractéristiques des équipements, débit et bande passante | À faire |
| 6 | Diagnostic et recommandations | À faire |
| 7 | Éditeur de topologie et choix du protocole | À faire |
| 8 | CI/CD et TLS | À faire |
| 9 | Documentation et finition | À faire |

Ordre suivi : 1, 3, puis 2, puis 4 à 9. La phase 3 a été faite avant la phase 2 parce que la
session VR fonctionne déjà avec le rendu actuel (r180, WebGL), alors que la phase 2 (WebGPU)
comporte un risque connu. La phase 1 est fusionnée dans `main` (pull request #15, fusion normale).

## Décisions

| Date | Décision | Raison |
| --- | --- | --- |
| 12 nov | `docs/avancement.md` est le fichier de reprise entre conversations. | Demande de Ramy. |
| 12 nov | `precache-manifest.js` reste généré (non versionné). Sans lui, `sw.js` s'installe sans cache. | Personne ne maintient la liste à la main ; le développement local n'est pas gêné par un cache. |
| 12 nov | Stratégie unique « cache d'abord » ; une nouvelle version prend la main à l'activation (`skipWaiting`, `clients.claim`) et supprime les anciens caches. Pas de bandeau « nouvelle version ». | Simplicité ; la version du cache change dès qu'un fichier change. |
| 12 nov | Icônes dessinées par `tools/build-icons.js` (PNG écrit avec `zlib` de Node), versionnées dans `assets/icons/`. | Aucune dépendance, aucune ressource tierce à attribuer. |
| 12 nov | Horloge du moteur pilotée par la boucle de rendu (`app.sim.tick(delta)`), avec relais interne si personne ne l'appelle pendant 250 ms. | En VR, le `requestAnimationFrame` de la fenêtre est suspendu : sans cela la simulation se figeait. |
| 12 nov | Panneaux VR dessinés sur des canvas 2D appliqués à des plans (pas de bibliothèque de texte 3D). Ils réutilisent `controlsView` et `describeSelection` du pôle ui. | Aucune dépendance ; mêmes règles et mêmes données qu'en 2D. |
| 12 nov | Visée à la manette avec tolérance (`pickDeviceHit(…, { tolerance: 0.7 })`) : l'étiquette d'un équipement est aussi une cible. | Routeur et switch sont plats, donc difficiles à toucher exactement avec un rayon. |
| 12 nov | Gâchette dans le vide : la sélection est gardée. | Éviter de perdre la fiche sur un tir manqué. |
| 12 nov | Essais VR automatisés avec la bibliothèque IWER 2.8 (Meta) injectée dans Chrome piloté, depuis un dossier temporaire hors dépôt. | L'extension Immersive Web Emulator ne se charge pas dans un Chrome sans interface ; IWER est son moteur. |
| 12 nov | Le bouton « Installer » est visible tant que l'application n'est pas installée. Sans invite du navigateur, le clic explique comment installer. | « Message clair si l'installation est indisponible » sans encombrer l'en-tête. |

## Journal des phases

### Phase 1 — PWA complète (12 novembre)

- Tests : 213 tests, 202 réussis, 11 « à faire », 0 échec.
- Fichiers : `manifest.json`, `sw.js`, `src/ui/install.js` (+ test), `src/ui/index.js` (+ test),
  `index.html`, `styles.css`, `tools/build-icons.js` (+ test), `assets/icons/*.png`,
  `tests/sw.test.js`, `tests/platform.test.js`, `tools/build-precache.js` (+ test),
  `.github/workflows/ci.yml` (commentaire), `docs/simulation/contrats.md` (§6 API du pôle ui).
- Vérifié dans Chrome piloté, site servi sous `/3D-network-topology/` : Service Worker actif,
  68 fichiers en cache, aucune erreur d'installabilité, rechargement et lecture de la simulation
  avec le serveur arrêté, badge « Hors ligne », aucun débordement à 390 et 340 px.
- Reste à vérifier à la main : l'invite d'installation de Chrome (impossible sans interface).
- Pour tester le hors ligne en local : `node tools/build-precache.js` avant de servir le dossier,
  puis supprimer `precache-manifest.js` (sinon le cache masque les modifications suivantes).

### Phase 3 — Session immersive complète (12 novembre)

- Tests : 243 tests, 232 réussis, 11 « à faire », 0 échec.
- Moteur : `app.sim.tick(deltaMs)` (`src/sim/commands.js`, `simulation.js`, `tests/commands.test.js`).
- Rendu : boucle unique `setAnimationLoop((time, xrFrame) => …)`, `onFrame`, `pickDeviceHit`,
  `getVRAnchor`, placement VR (`src/render/scene.js`, `index.js`, `mock.js`, `picking.js`,
  `vrLayout.js`, `vrLayout.test.mjs`).
- XR : `src/xr/panelLayout.js` (pur), `canvasPanel.js`, `vrPanel.js`, `infoPanels.js`,
  `controllers.js`, `vrRig.js`, `session.js` (crochets d'entrée et de sortie), `index.js`, `vr.test.js`.
- Documentation : `docs/simulation/contrats.md` (§4 `tick`, §7 API du rendu), `docs/architecture.md` (§6).
- Vérifié dans Chrome piloté avec IWER (profil Meta Quest 3) : entrée en VR, gâchette sur Lecture,
  Vitesse +, Pause, Pas à pas, Réinitialiser ; le temps simulé avance pendant la session ;
  sélection du routeur et de PC 1 à la manette (fiche à jour en VR et en 2D) ; paquet animé visible ;
  deux entrées et sorties de suite ; console vide.
- Non vérifié : un vrai casque, et l'extension Immersive Web Emulator elle-même (à faire par Ramy).
- Limite connue : les explications viennent du faux moteur (trois étapes de démonstration) jusqu'à la phase 4.
- README non mis à jour pour la VR : prévu en phase 9.
