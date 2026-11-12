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
| 2 | Three.js r187, WebGPU, boucle d'animation WebXR unique | À faire |
| 3 | Session immersive complète (panneau VR, manettes, fiches en VR) | À faire |
| 4 | Moteur réel, équipements et protocoles | À faire |
| 5 | Caractéristiques des équipements, débit et bande passante | À faire |
| 6 | Diagnostic et recommandations | À faire |
| 7 | Éditeur de topologie et choix du protocole | À faire |
| 8 | CI/CD et TLS | À faire |
| 9 | Documentation et finition | À faire |

Priorités données par Ramy : phases 1 et 3 « aujourd'hui ». La phase 3 dépend en partie de la
phase 2 (boucle d'animation en VR) : l'ordre sera confirmé avec lui à la fin de la phase 1.

## Décisions

| Date | Décision | Raison |
| --- | --- | --- |
| 12 nov | `docs/avancement.md` est le fichier de reprise entre conversations. | Demande de Ramy. |
| 12 nov | `precache-manifest.js` reste généré (non versionné). Sans lui, `sw.js` s'installe sans cache. | Personne ne maintient la liste à la main ; le développement local n'est pas gêné par un cache. |
| 12 nov | Stratégie unique « cache d'abord » ; une nouvelle version prend la main à l'activation (`skipWaiting`, `clients.claim`) et supprime les anciens caches. Pas de bandeau « nouvelle version ». | Simplicité ; la version du cache change dès qu'un fichier change. |
| 12 nov | Icônes dessinées par `tools/build-icons.js` (PNG écrit avec `zlib` de Node), versionnées dans `assets/icons/`. | Aucune dépendance, aucune ressource tierce à attribuer. |
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
