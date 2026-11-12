# 📄 Fichier d'Attribution et d'Origine des Ressources (ATTRIBUTION.md)

**Projet :** 3D Network Topology
**Équipe :** Ayoub Ben Sabbeh, Khalil Krifa, Mohamed Aziz Saoudi, Rami Driouech
**Version :** 1.0 — Évaluation SUP'COM (2026/2027)
**Dernière mise à jour :** 11 novembre 2026 (fin du sprint S2)

> Ce fichier est tenu à jour à chaque pull request qui ajoute un asset, une bibliothèque, un extrait de code tiers ou du code produit avec un assistant IA. Chaque membre complète les entrées qui le concernent.

---

## 1. Modèles 3D, Textures et Assets Graphiques

**Aucun modèle 3D, texture ou asset graphique externe n'est importé à ce jour** (le dossier `assets/models/` est vide).

*   **Asset :** Équipements de la topologie (PC, switch, routeur, serveur), câbles et sol de la scène 3D
    *   **Source originale :** aucune ; formes générées par le code (`src/render/scene.js`) avec les primitives de Three.js (`BoxGeometry`, `SphereGeometry`, `CylinderGeometry`, `BufferGeometry`, `GridHelper`)
    *   **Auteur / Créateur :** Mohamed Aziz Saoudi (équipe)
    *   **Licence :** code du projet
    *   **Modifications apportées par l'équipe :** sans objet. Les modèles GLB légers prévus en S2 (tâche 20) seront déclarés ici avec leur source et leur licence s'ils proviennent d'une banque externe.

*   **Asset :** Maquettes de l'interface et diagramme de cas d'utilisation (`docs/conception/maquette.svg`, `maquette-mobile.svg`, `cas-utilisation.svg`)
    *   **Source originale :** création de l'équipe
    *   **Auteur / Créateur :** Rami Driouech
    *   **Licence :** documents du projet
    *   **Modifications apportées par l'équipe :** sans objet

*   **Asset :** Captures d'écran (`docs/captures/s1-statut-webxr.jpg`, `s1-vr-emulee.jpg`)
    *   **Source originale :** captures de l'application du projet, prises dans Chrome (sans interface, piloté par un script de test), avec un casque Meta Quest 3 émulé par IWER (voir §2)
    *   **Auteur / Créateur :** équipe (voir §4, entrée « Corrections après la revue S1 »)
    *   **Licence :** documents du projet
    *   **Modifications apportées par l'équipe :** conversion PNG → JPEG (qualité 82) pour alléger le dépôt

*   **Icônes de la PWA** (`assets/icons/`) : pas encore créées (prévues en S5, tâche 60) ; à déclarer ici.

---

## 2. Bibliothèques tierces et Modules externes (Pinnés)

Aucune bibliothèque n'est chargée depuis un CDN à l'exécution : les fichiers sont **copiés dans le dépôt** (`vendor/`), ce qui permet le mode hors ligne de la PWA. La version est figée et vérifiée par `vendor/three/install.mjs`, qui refuse toute autre version.

*   **Bibliothèque :** Three.js (`three.core.js`, `three.webgpu.js`, `three.tsl.js`)
    *   **Version fixée :** r187 (paquet npm `three@0.187.0`), voir `vendor/three/VERSION.txt` ; licence copiée dans `vendor/three/LICENSE`
    *   **Lien CDN de référence :** https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.webgpu.js (référence uniquement ; non utilisé à l'exécution)
    *   **Licence :** MIT, Copyright 2010-2025 Three.js Authors (en-tête conservé dans les fichiers)
    *   **Rôle dans le projet :** moteur de rendu 3D et intégration WebXR (`renderer.xr`). Rendu 100 % WebGPU avec `WebGPURenderer`, en mode classique et en VR ; le build WebGL (`three.module.js`) n'est pas embarqué : voir `docs/decision-renderer.md`.

*   **Bibliothèque :** OrbitControls (module complémentaire de Three.js, `vendor/three/examples/jsm/controls/OrbitControls.js`)
    *   **Version fixée :** r187 (`three@0.187.0`)
    *   **Lien CDN de référence :** https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/controls/OrbitControls.js
    *   **Licence :** MIT (Three.js Authors)
    *   **Rôle dans le projet :** rotation, zoom et déplacement de la caméra à la souris et au toucher. Seul changement : l'import `from 'three'` est réécrit vers le fichier local (voir §3).

**Outils utilisés uniquement pour le développement et les tests (non inclus dans le site) :**

*   **Outil :** Node.js 22, exécuteur de tests intégré `node:test`
    *   **Version fixée :** Node 22 (CI GitHub Actions)
    *   **Rôle :** tests automatiques (`node --test`)

*   **Outil :** Immersive Web Emulator (extension Chrome, Meta)
    *   **Rôle :** émulation d'un casque VR pour tester WebXR sans matériel (cahier des charges §3.2)

*   **Outil :** IWER, Immersive Web Emulation Runtime (`iwer`, licence MIT, Meta), le moteur de l'extension ci-dessus
    *   **Version fixée :** 2.x, installée temporairement hors dépôt
    *   **Rôle :** tests automatisés de l'entrée et de la sortie de session `immersive-vr` dans Chrome piloté par script (Playwright)

*   **Outil :** Mermaid (rendu des diagrammes par GitHub)
    *   **Rôle :** diagrammes de `README.md` et `docs/architecture.md`, écrits en texte et affichés par GitHub. La syntaxe a été validée avec `mermaid@11` hors dépôt.

---

## 3. Extraits de code copiés ou adaptés (StackOverflow, Tutoriels, Dépôts tiers)

*   **Fonction / Fichier :** `vendor/three/examples/jsm/controls/OrbitControls.js` (fichier entier)
    *   **Source du code original :** dépôt officiel Three.js r187, https://github.com/mrdoob/three.js/blob/r187/examples/jsm/controls/OrbitControls.js (de même pour `GLTFLoader.js`, `BufferGeometryUtils.js` et `SkeletonUtils.js`, copiés par `vendor/three/install.mjs`)
    *   **Auteur :** Three.js Authors (licence MIT)
    *   **Adaptation effectuée :** aucune modification de la logique. Le script `vendor/three/install.mjs` (Mohamed Aziz Saoudi) remplace seulement `from 'three'` par `from '../../../build/three.webgpu.js'`, pour charger Three.js depuis le dépôt sans CDN ni import map.

*   **Fonction / Fichier :** `tests/engine.test.js`, fonction `random(seed)` (générateur pseudo-aléatoire des tests du moteur)
    *   **Source du code original :** algorithme « Mulberry32 », https://gist.github.com/tommyettinger/46a874533244883189143505d203312c ; portage JavaScript de référence : https://github.com/bryc/code/blob/master/jshash/PRNGs.md
    *   **Auteur :** Tommy Ettinger (algorithme, 2017, domaine public) ; bryc (portage JavaScript, domaine public)
    *   **Adaptation effectuée :** reprise du portage JavaScript (mêmes constantes et opérations), renommé `random(seed)` et écrit dans le style du projet. Il sert uniquement à générer des séries de test reproductibles (2 000 et 50 000 actions) ; il n'est pas utilisé dans l'application.

*   **Algorithmes classiques réimplémentés, sans copie de code :** tas binaire minimal (`src/sim/engine.js`), parcours en largeur pour le plus court chemin (`findPath` dans `src/sim/scenario.js`), patrons Observer, Command et State (cahier des charges §8.2).

---

## 4. Déclaration de l'usage des Assistants IA (Copilot, ChatGPT, Claude)

### Khalil Krifa — Claude (Anthropic)

Claude a été utilisé comme assistant de développement pour le pôle simulation et pour les corrections faites après la revue S1. Khalil a défini le travail à partir du plan de réalisation et des contrats d'équipe. Il a fait générer le code, les tests et la documentation, puis les a relus, testés, découpés en commits et intégrés par pull request.

*   **Composant ou Shader concerné :** Contrats et squelette du moteur de simulation (S1, tâches 9 à 12) : `simulation.js`, `src/sim/` (événements, protocole, scénario, états, commandes, moteur, faux moteur), `scenarios/arp.json`, tests associés, `docs/simulation/contrats.md`
    *   **Prompt ou usage principal :** génération du code et des tests à partir des spécifications du plan (format des scénarios, format d'évènement, interface protocole, API de commandes) et des fichiers déjà livrés par l'équipe.
    *   **Axe de vérification appliqué par l'étudiant :** suite de tests automatiques (`node --test`, CI GitHub Actions) ; essai du faux moteur sur la topologie de démonstration et sur `arp.json` (TTL décrémenté au routeur, étapes affichées dans l'ordre) ; relecture des contrats avec l'équipe avant la fusion (PR #3).

*   **Composant ou Shader concerné :** Corrections après la revue S1 : détection WebXR et session VR (`src/xr/`), intégration WebXR et liaison au moteur dans le rendu (`src/render/`), styles du statut WebXR, `README.md`, documentation `docs/`, captures
    *   **Prompt ou usage principal :** génération du code et de la documentation répondant aux remarques du superviseur (README, initialisation XR avec statut « Détectée / Non détectée », documentation).
    *   **Axe de vérification appliqué par l'étudiant :** tests automatiques ; tests dans Chrome des trois cas de détection (sans WebXR, WebXR sans casque, casque Meta Quest 3 émulé par IWER) ; entrée et sortie de la session VR, sans erreur dans la console ; affichage PC et mobile ; validation des diagrammes et des liens de la documentation. Les fichiers des autres pôles ont été soumis à l'approbation de leurs propriétaires (CODEOWNERS, PR #5).

*   **Composant ou Shader concerné :** Moteur S2 (tâches 23 à 25) : file d'évènements en tas binaire et annulation (`src/sim/engine.js`), historique, paquets en vol et temporisations annulables (`src/sim/commands.js`), tests et documentation associés
    *   **Prompt ou usage principal :** génération du code et des tests des tâches 23 à 25 du plan.
    *   **Axe de vérification appliqué par l'étudiant :** comparaison de l'ordre du tas avec un tri de référence sur 2 000 actions aléatoires ; test de charge sur 50 000 actions (qui a révélé et fait corriger un défaut du garde-fou anti-boucle) ; vérification de chaque commande dans chacun des 5 états ; vérification que la lecture continue produit la même suite d'évènements que le pas à pas (PR #7).

*   **Composant ou Shader concerné :** ce fichier `ATTRIBUTION.md`
    *   **Prompt ou usage principal :** remplissage du modèle à partir du contenu réel du dépôt.
    *   **Axe de vérification appliqué par l'étudiant :** contrôle de chaque entrée dans le dépôt (version de Three.js, dossier `assets/` vide, recherche de code tiers).

### Ayoub Ben Sabbeh

Claude (Anthropic, via Claude Code dans VS Code) a été utilisé comme assistant de développement pour le pôle plateforme et XR. Ayoub a choisi les tâches à partir du plan de réalisation, a fait générer le code, les tests et les explications, puis les a relus, essayés dans le navigateur, et intégrés par branche et pull request (une tâche par branche). Part estimée de l'IA dans le code de ces entrées : environ 90 %.

*   **Composant ou Shader concerné :** Fichier des propriétaires `.github/CODEOWNERS` (S1, tâche 13) : identifiants GitHub réels de l'équipe et propriétaires des documents de `docs/conception/` et `docs/simulation/`
    *   **Prompt ou usage principal :** remplacement des identifiants provisoires par les comptes GitHub de l'équipe, et attribution de chaque fichier à son auteur selon le plan.
    *   **Axe de vérification appliqué par l'étudiant :** identifiants GitHub fournis par chaque membre ; relecture du fichier ; fusion par pull request (PR #4).

*   **Composant ou Shader concerné :** Animation des paquets le long des câbles (S2, tâche 26) : `src/render/packetAnimator.js`, `tests/packetAnimator.test.js`, et les deux lignes qui la branchent dans `src/render/index.js`
    *   **Prompt ou usage principal :** génération du code qui place chaque paquet en vol entre ses deux équipements à partir de son avancement donné par le moteur (`app.sim.getPacketsInFlight()`), à chaque tic de l'horloge simulée et non à chaque image (point de vigilance n°5 du plan) ; génération des tests avec une horloge manuelle.
    *   **Axe de vérification appliqué par l'étudiant :** 11 tests automatiques (position au milieu du câble à 200 ms pour une latence de 400 ms, vitesse ×2, pause, pas à pas, réinitialisation, fin de la démonstration, désabonnement) ; suite complète `node --test` sans échec ; essai dans Chrome en local : le paquet traverse PC 1 → Switch 1 → Routeur → Switch 2 → PC 2 et obéit aux cinq commandes ; hauteur et taille du paquet corrigées après l'essai, car les équipements le cachaient (PR #10).

*   **Composant ou Shader concerné :** Script de la liste de précache (S2, tâche 27) : `tools/build-precache.js`, `tools/build-precache.test.js`, étape ajoutée dans `.github/workflows/ci.yml`, `precache-manifest.js` ajouté à `.gitignore`
    *   **Prompt ou usage principal :** génération d'un script Node qui parcourt les fichiers du site, écrit `precache-manifest.js` (liste des fichiers et version calculée par empreinte SHA-256) et s'exécute dans la CI avant le déploiement.
    *   **Axe de vérification appliqué par l'étudiant :** 6 tests automatiques (fichiers de test exclus, ordre stable, version qui change quand un fichier change) ; exécution manuelle du script et contrôle de la liste produite (55 fichiers) ; correction de la détection de la ligne de commande sous Windows après un essai qui n'affichait rien.

*   **Composant ou Shader concerné :** ce paragraphe de `ATTRIBUTION.md`
    *   **Prompt ou usage principal :** rédaction de l'entrée à partir des pull requests réellement fusionnées.
    *   **Axe de vérification appliqué par l'étudiant :** contrôle de chaque fichier et numéro de PR cité dans le dépôt.

### Mohamed Aziz Saoudi

*   À compléter par Aziz : déclarer chaque usage d'un assistant IA (composant, usage, vérification) ou indiquer « Aucun usage ».

### Rami Driouech
Claude a été utilisé de deux façons : dans claude.ai pour la planification du projet et les livrables de S1, puis dans Claude Code (VS Code) pour les tâches de S2. Rami a défini chaque tâche à partir du plan de réalisation, du cahier des charges et des contrats d'équipe, a imposé que seuls ses fichiers soient modifiés (CODEOWNERS), puis a relu, testé, commité et intégré le résultat par pull request.

*   **Composant ou Shader concerné :** Plan de réalisation et répartition des tâches : découpage en 7 sprints, répartition sans chevauchement de fichiers, tableau de suivi `Plan_3D_Network_Topology.xlsx` (source de `docs/planning.md`)
    *   **Prompt ou usage principal :** proposition d'un plan sur 7 semaines à partir du cahier des charges, puis d'une nouvelle répartition où chaque fichier n'a qu'un propriétaire, pour éviter les conflits Git et équilibrer la charge (45 points par membre).
    *   **Axe de vérification appliqué par l'étudiant :** relecture critique du plan (chevauchements entre membres repérés puis corrigés) ; validation de la répartition par l'équipe avant le début de S1.

*   **Composant ou Shader concerné :** Livrables S1 (tâches 1 à 4) : maquettes `docs/conception/maquette.svg` et `maquette-mobile.svg`, `index.html` et `styles.css` (points de montage `#scene` et `#scenario-picker`, mise en page responsive), `src/ui/index.js` (`init(app)`) et ses modules, `src/ui/index.test.js`, diagramme `docs/conception/cas-utilisation.svg` et `cas-utilisation.md`
    *   **Prompt ou usage principal :** génération des fichiers à partir du contrat `init(app)` fixé par `main.js`, des points de montage existants et des exigences F01 à F10 du cahier des charges.
    *   **Axe de vérification appliqué par l'étudiant :** tests automatiques (`node --test`, CI) ; affichage vérifié dans le navigateur sur PC et en largeur mobile (sans débordement horizontal ni erreur dans la console) ; contrôle que le diagramme couvre F01 à F10 et le plan de démonstration §3.1 ; vérification avec `git status` qu'aucun fichier hors du pôle ui n'est modifié ; relecture et approbation par le binôme (Aziz) avant la fusion.

*   **Composant ou Shader concerné :** Livrables S2 (tâches 17 à 19) : barre de commandes reliée au moteur (`src/ui/controls.js`), sélection d'un équipement et API `app.ui.select / clear / getSelection / onChange` (`src/ui/selection.js`, `src/ui/keyboard.js`), panneau d'infos de l'équipement (`src/ui/inspector.js`), tests `src/ui/*.test.js`, styles associés
    *   **Prompt ou usage principal :** génération du code et des tests avec Claude Code, à partir des contrats du moteur (`docs/simulation/contrats.md`, §2 et §4) et de l'API de rendu ; consignes : modifier uniquement `src/ui/`, `index.html` et `styles.css`, ne pas refaire le lancer de rayon du pôle render, plan validé avant le code, aucun commit fait par l'assistant.
    *   **Axe de vérification appliqué par l'étudiant :** tests automatiques après chaque tâche ; vérification manuelle dans le navigateur de chaque commande dans chaque état (prêt, lecture, pause, terminé), des raccourcis clavier, de la sélection et de la désélection (Échap), et de la fiche de chaque type d'équipement ; relecture des différences (notamment `index.html`, pour garantir que les points de montage restent intacts) ; un commit par tâche fait par l'étudiant ; approbation du binôme (PR #9) ; vérification sur GitHub Pages après déploiement. Un besoin repéré pendant la tâche 18 (lancer de rayon pour la VR) a été transmis à Aziz au lieu de modifier son code.
