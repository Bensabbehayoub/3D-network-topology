# Planning et répartition des tâches

Source du planning initial : tableau de suivi de l'équipe (`Plan_3D_Network_Topology.xlsx`). **Statuts mis à jour le 13 novembre 2026 d'après l'historique git** de la branche `feature/refonte-prof`.

Méthode XP : sprints d'une semaine (lundi → dimanche), planning le lundi, stand-up le mercredi et le vendredi, démo sur GitHub Pages et rétrospective le dimanche. Les points sont des estimations relatives de l'effort.

## Ce qui s'est passé

- **Sprints S1 et S2 (2–12 novembre)** : chaque membre a travaillé sur son pôle, par pull requests relues (#1 à #14). Les 27 tâches de S1 et S2 sont terminées.
- **Refonte (12–13 novembre), demandée par le superviseur** : rendu 100 % WebGPU, vrai moteur et protocoles, puis fonctionnalités supplémentaires (caractéristiques et débit, diagnostic, éditeur, vérification TLS). Elle a été menée par **Ramy, avec un assistant IA** (Claude Code), en 9 phases, un commit par phase ([`avancement.md`](avancement.md), déclaration dans [`ATTRIBUTION.md`](../ATTRIBUTION.md)). La répartition par fichiers (CODEOWNERS) a été suspendue pendant la refonte.
- Conséquence : la plupart des tâches prévues de S3 à S6 ont été **réalisées pendant la refonte**, et non par le membre à qui elles étaient attribuées. La colonne « Membre prévu » garde le planning d'origine ; la colonne « Statut » dit honnêtement où et quand la tâche a été faite.

| | Tâches | Terminées | Dont pendant la refonte | Restantes |
| --- | --- | --- | --- | --- |
| S1–S2 | 27 | 27 | 0 | 0 |
| S3–S7 | 52 | 43 | 43 | 9 (dont 1 optionnelle) |
| **Total** | **79** | **70** | **43** | **9** |

Phases de la refonte et commits :

| Phase | Contenu | Commit |
| --- | --- | --- |
| 1 | PWA complète : icônes, précache, hors ligne, bouton Installer | `5d30812` |
| 2 | Three.js r187, rendu 100 % WebGPU en 2D et en VR | `ac653fc` |
| 3 | Session VR complète : pupitre, manettes, fiches | `d58dd6d` |
| 4a | Vrai moteur, équipements, ARP, ICMP, routage, choix du scénario | `ffba69f` |
| 4b | UDP, DNS, DHCP | `1151dfd` |
| 4c | TCP, HTTP | `eaa4efc` |
| 4d | Explications, journal, inspecteur de paquets, couleurs | `cafa1d3` |
| 5 | Caractéristiques des équipements, débit, bande passante | `81637a4` |
| 6 | Diagnostic et recommandations (2D et VR) | `137faf9` |
| 7a, 7b, 7c | Éditeur de topologie : construction, configuration, enregistrement | `7b07bf7`, `bd2edf2`, `3acc806` |
| 8 | CI/CD, vérification HTTPS et TLS | `4484f2d` |
| 9a | Documentation finale | (à commiter) |
| 9b | Revue finale, démonstration, performances | à faire |

## Vue d'ensemble

| Sprint | Dates | Phase | Résultat attendu le dimanche | Jalon | État |
|---|---|---|---|---|---|
| S1 | 2–8 nov | Fondations et contrats | Le site s'ouvre sur GitHub Pages et affiche une topologie. Contrats et mocks validés. Moteur de rendu choisi. | — | ✅ |
| S2 | 9–15 nov | Scène 3D et moteur d'évènements | Un paquet de test traverse le réseau et obéit à Lecture, Pause, Pas à pas, Vitesse et Réinitialiser. | — | ✅ |
| S3 | 16–22 nov | ARP, ICMP et inspection | Ping démontrable, pause, pas à pas, inspection d'un paquet. | MVP (22 nov) | ✅ en avance (refonte) |
| S4 | 23–29 nov | Catalogue de protocoles | Six protocoles, explications et tests ; entrée et sortie de VR. | — | ✅ en avance (refonte) |
| S5 | 30 nov–6 déc | VR, PWA et extensions | Étapes 1 à 6 de la démo du cahier des charges. | Démo complète (6 déc) | ✅ en avance (refonte) |
| S6 | 7–13 déc | Stabilisation et hors ligne | Un membre qui n'a pas codé la démo la rejoue sans aide. v1.0-rc. | Gel (13 déc) | Documentation faite ; revue finale en 9b |
| S7 | 14–20 déc | Livraison | Livrables remis, deux répétitions de soutenance. | v1.0 le 18 déc, remise le 20 déc | À faire |

## Charge prévue par membre (points)

| Membre | S1 | S2 | S3 | S4 | S5 | S6 | S7 | Total |
|---|---|---|---|---|---|---|---|---|
| Ramy | 7 | 8 | 7 | 7 | 6 | 6 | 4 | **45** |
| Aziz | 7 | 8 | 7 | 7 | 6 | 6 | 4 | **45** |
| Khalil | 7 | 8 | 7 | 7 | 6 | 6 | 4 | **45** |
| Ayoub | 8 | 7 | 7 | 7 | 6 | 6 | 4 | **45** |
| **Équipe** | 29 | 31 | 28 | 28 | 24 | 24 | 16 | **180** |

## Tâches par sprint

### S1 — Fondations et contrats (2–8 nov)

| N° | Membre prévu | Tâche | Fichiers | Pts | Statut |
|---|---|---|---|---|---|
| 1 | Ramy | Maquette de l'interface | `docs/conception/` | 2 | ✅ Ramy (`b80b74f`) |
| 2 | Ramy | Page `index.html` et feuille de style, zones réservées aux autres pôles | `index.html`, `styles.css` | 2 | ✅ Ramy (`13bb4c4`) |
| 3 | Ramy | `ui/index.js`, qui démarre les modules de l'interface | `src/ui/index.js` | 1 | ✅ Ramy (`17bb913`) |
| 4 | Ramy | Diagramme de cas d'utilisation | `docs/conception/` | 2 | ✅ Ramy (`40e8bfb`) |
| 5 | Aziz | Scène 3D : caméra, lumière, rotation et zoom | `src/render/` | 3 | ✅ Aziz (`4579e33`) |
| 6 | Aziz | Three.js copié dans le dépôt | `vendor/three/` | 1 | ✅ Aziz (`4579e33`) ; passé en r187 en phase 2 |
| 7 | Aziz | Topologie lue depuis un JSON | `src/render/` | 2 | ✅ Aziz (`4579e33`) |
| 8 | Aziz | API de rendu et mock | `src/render/` | 1 | ✅ Aziz (`4579e33`) |
| 9 | Khalil | Format des scénarios JSON | `src/sim/`, `docs/` | 2 | ✅ Khalil (`2df8a5f`) |
| 10 | Khalil | Format d'un évènement réseau et interface protocole | `src/sim/events.js` | 2 | ✅ Khalil (`edff3df`) |
| 11 | Khalil | Commandes et faux moteur | `src/sim/` | 1 | ✅ Khalil (`52a9604`) |
| 12 | Khalil | Squelette du moteur et premiers tests | `simulation.js`, `src/sim/`, `tests/` | 2 | ✅ Khalil (`35c5741`) |
| 13 | Ayoub | Dépôt GitHub, CODEOWNERS, protection de `main` | `.github/` | 2 | ✅ Ayoub (`dd54127`, `be96740`) |
| 14 | Ayoub | GitHub Pages en HTTPS et CI | `.github/` | 2 | ✅ Ayoub (`dd54127`) |
| 15 | Ayoub | `main.js`, `manifest.json`, `sw.js` minimal | `main.js`, `manifest.json`, `sw.js` | 1 | ✅ Ayoub (`dd54127`) |
| 16 | Ayoub | Essai WebXR dans l'émulateur, choix du rendu | (hors dépôt) | 3 | ✅ Ayoub ; décision refaite en phase 2 (100 % WebGPU) |

### S2 — Scène 3D et moteur d'évènements (9–15 nov)

| N° | Membre prévu | Tâche | Fichiers | Pts | Statut |
|---|---|---|---|---|---|
| 17 | Ramy | Barre Lecture, Pause, Pas à pas, Vitesse, Réinitialiser | `src/ui/controls.js` | 3 | ✅ Ramy (`7e66bc9`) |
| 18 | Ramy | Sélection d'un objet 3D au clic ou au toucher | `src/ui/selection.js` | 3 | ✅ Ramy (`12eca33`) |
| 19 | Ramy | Panneau d'infos de l'équipement sélectionné | `src/ui/` | 2 | ✅ Ramy (`d9dea3f`) |
| 20 | Aziz | Modèles 3D légers (routeur, switch, PC) en GLB | `assets/models/` | 3 | ✅ Aziz (`5b23e0d`), générés par script |
| 21 | Aziz | `factory.js` : le bon modèle pour chaque équipement | `src/render/factory.js` | 2 | ✅ Aziz (`5b23e0d`) |
| 22 | Aziz | Câbles et étiquettes | `src/render/links.js`, `labels.js` | 3 | ✅ Aziz (`5b23e0d`) |
| 23 | Khalil | Moteur : file d'évènements et horloge simulée | `src/sim/engine.js` | 3 | ✅ Khalil (`bd2cc37`) |
| 24 | Khalil | États et commandes | `src/sim/state.js`, `commands.js` | 3 | ✅ Khalil (`fb548f2`) |
| 25 | Khalil | Bus d'évènements (Observer) et tests | `src/sim/`, `tests/` | 2 | ✅ Khalil (`624ade8`) |
| 26 | Ayoub | Animation des paquets au rythme de l'horloge simulée | `src/render/packetAnimator.js` | 5 | ✅ Ayoub (`cf10a5a`, `2655360`) |
| 27 | Ayoub | Génération de la liste de précache par la CI | `tools/`, `.github/` | 2 | ✅ Ayoub (`2a8d905`) |

### S3 — ARP, ICMP et inspection (16–22 nov)

| N° | Membre prévu | Tâche | Fichiers | Pts | Statut |
|---|---|---|---|---|---|
| 28 | Ramy | Inspecteur de paquet | `src/ui/inspector.js` | 3 | ✅ Refonte, phase 4d |
| 29 | Ramy | Explication de chaque étape | `src/ui/explanations.js` | 2 | ✅ Refonte, phase 4d |
| 30 | Ramy | Journal des messages | `src/ui/` | 2 | ✅ Refonte, phase 4d |
| 31 | Aziz | ICMP (ping) et tests | `protocols/icmp.js`, `tests/icmp.test.js` | 3 | ✅ Refonte, phase 4a |
| 32 | Aziz | Couleurs des protocoles, aspect broadcast/unicast | `src/render/packetStyles.js` | 3 | ✅ Refonte, phase 4d |
| 33 | Aziz | Premier jet du diagramme de séquence du ping | `docs/` | 1 | ✅ Refonte, phase 9a ([`cahier-conceptuel.md`](cahier-conceptuel.md)) |
| 34 | Khalil | ARP (requête, réponse, cache) | `protocols/arp.js` | 3 | ✅ Refonte, phase 4a |
| 35 | Khalil | Comportement d'un PC et d'un routeur | `devices/host.js`, `router.js` | 3 | ✅ Refonte, phase 4a |
| 36 | Khalil | Tests d'ARP | `tests/arp.test.js` | 1 | ✅ Refonte, phase 4a |
| 37 | Ayoub | Switch : apprentissage MAC, inondation | `devices/switch.js` | 3 | ✅ Refonte, phase 4a |
| 38 | Ayoub | Tests du switch | `tests/switch.test.js` | 1 | ✅ Refonte, phase 4a |
| 39 | Ayoub | Scénario `ping.json` | `scenarios/ping.json` | 2 | ✅ Refonte, phase 4a |
| 40 | Ayoub | Diagramme de déploiement | `docs/` | 1 | ✅ Première version S1 ([`architecture.md`](architecture.md), `07d4cb8`) ; version finale en 9a |

### S4 — Catalogue de protocoles (23–29 nov)

| N° | Membre prévu | Tâche | Fichiers | Pts | Statut |
|---|---|---|---|---|---|
| 41 | Ramy | DHCP (4 messages) | `protocols/dhcp.js` | 3 | ✅ Refonte, phase 4b |
| 42 | Ramy | Scénario DHCP, tests et explications | `scenarios/dhcp.json`, `tests/` | 2 | ✅ Refonte, phase 4b |
| 43 | Ramy | Liste de choix du scénario | `src/ui/scenarioPicker.js` | 2 | ✅ Refonte, phase 4a |
| 44 | Aziz | UDP | `protocols/udp.js` | 2 | ✅ Refonte, phase 4b |
| 45 | Aziz | DNS sur UDP | `protocols/dns.js` | 3 | ✅ Refonte, phase 4b |
| 46 | Aziz | Scénarios UDP et DNS, tests et explications | `scenarios/`, `tests/` | 2 | ✅ Refonte, phase 4b |
| 47 | Khalil | TCP : connexion, données, fermeture | `protocols/tcp.js` | 5 | ✅ Refonte, phase 4c |
| 48 | Khalil | Scénario TCP, tests et explications | `scenarios/tcp.json`, `tests/` | 2 | ✅ Refonte, phase 4c |
| 49 | Ayoub | Bouton « Entrer en VR », entrée et sortie | `src/xr/session.js` | 3 | ✅ Correctif S1 (`5d2f177`), terminé en phase 3 |
| 50 | Ayoub | Panneau de contrôle 3D en VR | `src/xr/vrPanel.js` | 4 | ✅ Refonte, phase 3 |

### S5 — VR, PWA et extensions (30 nov–6 déc)

| N° | Membre prévu | Tâche | Fichiers | Pts | Statut |
|---|---|---|---|---|---|
| 51 | Ramy | HTTP après DNS et TCP | `protocols/http.js` | 3 | ✅ Refonte, phase 4c |
| 52 | Ramy | Scénario HTTP, tests et explications | `scenarios/http.json`, `tests/` | 1 | ✅ Refonte, phase 4c |
| 53 | Ramy | Bouton « Installer l'application » | `src/ui/install.js` | 2 | ✅ Refonte, phase 1 |
| 54 | Aziz | Fluidité sur mobile | `src/render/` | 3 | En partie (géométries partagées, S2) ; mesures en 9b |
| 55 | Aziz | Scène lisible en VR (taille, étiquettes) | `src/render/` | 3 | ✅ Refonte, phase 3 (`vrLayout.js`) |
| 56 | Khalil | Routage statique, TTL, deux routeurs | `devices/router.js` | 4 | ✅ Refonte, phase 4a |
| 57 | Khalil | Scénario de routage, tests et explications | `scenarios/`, `tests/` | 2 | ✅ Refonte, phase 4a (`routage.json`, `ttl.json`) |
| 58 | Ayoub | Sélection aux manettes VR | `src/xr/controllers.js` | 3 | ✅ Lancer de rayon par Aziz (S2, `5b23e0d`), manettes en phase 3 |
| 59 | Ayoub | Mode normal si la VR est indisponible | `src/xr/` | 1 | ✅ Refonte, phases 2 et 3 |
| 60 | Ayoub | Icônes, manifest, HTTPS | `assets/icons/`, `manifest.json` | 2 | ✅ Refonte, phase 1 |

### S6 — Stabilisation et hors ligne (7–13 déc)

| N° | Membre prévu | Tâche | Fichiers | Pts | Statut |
|---|---|---|---|---|---|
| 61 | Ramy | Manuel utilisateur | `docs/manuel.md` | 4 | ✅ Refonte, phase 9a |
| 62 | Ramy | Cahier conceptuel et README | `docs/cahier-conceptuel.md`, `README.md` | 2 | ✅ Refonte, phase 9a |
| 63 | Aziz | Tests sur PC et deux smartphones | `src/render/` | 3 | À faire : émulation mobile en 9b ; vrais téléphones par l'équipe |
| 64 | Aziz | Diagramme de séquence du ping finalisé | `docs/` | 1 | ✅ Refonte, phase 9a |
| 65 | Aziz | Documenter le rendu et ICMP, UDP, DNS | `docs/` | 2 | ✅ Refonte, phase 9a ([`architecture.md`](architecture.md), [`protocoles/`](protocoles/)) |
| 66 | Khalil | Diagramme de classes | `docs/` | 2 | ✅ Refonte, phase 9a |
| 67 | Khalil | Tests de non-régression du moteur | `tests/` | 2 | ✅ Refonte, phases 4 à 8 (393 tests) |
| 68 | Khalil | Documenter la simulation (ARP, TCP, routage) | `docs/` | 2 | ✅ Refonte ([`simulation/contrats.md`](simulation/contrats.md), fiches protocoles) |
| 69 | Ayoub | Tout mettre en cache, tester sans internet sur Pages | `sw.js` | 3 | ✅ En local, phase 1 ; sur GitHub Pages après la fusion dans `main` (9b) |
| 70 | Ayoub | Audit Lighthouse (PWA) | `docs/` | 1 | À faire (9b) |
| 71 | Ayoub | Lancement en local et déploiement | `docs/` | 2 | ✅ Refonte, phase 8 ([`ci-cd.md`](ci-cd.md), README) |

### S7 — Livraison (14–20 déc)

| N° | Membre prévu | Tâche | Fichiers | Pts | Statut |
|---|---|---|---|---|---|
| 72 | Ramy | Script de la vidéo et voix off | (hors dépôt) | 3 | À faire |
| 73 | Ramy | Documenter DHCP et HTTP | `docs/protocoles/` | 1 | ✅ Refonte, phase 9a |
| 74 | Aziz | Filmer la démo sur PC, mobile et VR émulée | (hors dépôt) | 2 | À faire |
| 75 | Aziz | Monter la vidéo (5 minutes maximum) | (hors dépôt) | 2 | À faire |
| 76 | Khalil | Documentation d'architecture | `docs/architecture.md` | 3 | ✅ Refonte, phase 9a |
| 77 | Khalil | Optionnel : IPv6 simplifié (F09) | `protocols/ipv6.js` | 1 | Non réalisé (option) |
| 78 | Ayoub | Publier la version finale v1.0 | `.github/` | 1 | À faire : fusion de `feature/refonte-prof` dans `main`, puis étiquette `v1.0` |
| 79 | Ayoub | Poste de soutenance et plan B | (hors dépôt) | 3 | À faire ; script de démonstration en 9b (`docs/demo.md`) |

## Travail ajouté pendant la refonte

Demandé par le superviseur, absent du planning initial :

| Ajout | Phase | Documentation |
| --- | --- | --- |
| Rendu 100 % WebGPU, y compris en VR (pont pour l'émulateur) | 2 | [`decision-renderer.md`](decision-renderer.md) |
| Catalogue d'équipements, fiches, débit, bande passante, files d'attente | 5 | [`manuel.md`](manuel.md#6-fiche-déquipement-et-débit) |
| Diagnostic (14 règles) et recommandations, en 2D et en VR | 6 | [`manuel.md`](manuel.md#7-recommandations) |
| Éditeur de topologie, configuration, choix du protocole, enregistrement | 7 | [`manuel.md`](manuel.md#8-construire-sa-topologie) |
| Vérification HTTPS et TLS du site publié | 8 | [`ci-cd.md`](ci-cd.md) |

Restent des options non réalisées : **VLAN**, **IPv6** (F09), **TLS dans la simulation**, **OSPF**, **pose en AR** (F10).

## Bilan du sprint S1 et retours du superviseur

**Livré en S1** (pull requests #1 à #3) : maquettes et page de l'interface (Ramy), scène Three.js et API de rendu (Aziz), contrats du moteur, faux moteur et tests (Khalil), dépôt, CI, GitHub Pages, `main.js`, PWA minimale et choix du renderer (Ayoub).

**Retours du superviseur** (note C--) : README d'une ligne, documentation absente, répartition des tâches invisible, aucun code WebXR actif.

| Retour | Correction | Où |
|---|---|---|
| README d'une ligne | README complet, réécrit à la fin de la refonte | [`README.md`](../README.md) |
| Répartition des tâches absente | Cette page | `docs/planning.md` |
| Aucun code WebXR | Détection WebXR, statut « Détectée / Non détectée », session `immersive-vr`, puis session complète (phase 3) | `src/xr/` |
| WebGPU absent | Rendu 100 % WebGPU (phase 2) | [`decision-renderer.md`](decision-renderer.md) |
| Documentation | Architecture, cahier conceptuel, manuel, fiches protocoles, CI/CD | [`docs/README.md`](README.md) |
