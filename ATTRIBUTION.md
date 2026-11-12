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

*   **Bibliothèque :** Three.js (`three.module.js`, `three.core.js`)
    *   **Version fixée :** r180 (paquet npm `three@0.180.0`), voir `vendor/three/VERSION.txt`
    *   **Lien CDN de référence :** https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js (référence uniquement ; non utilisé à l'exécution)
    *   **Licence :** MIT, Copyright 2010-2025 Three.js Authors (en-tête conservé dans les fichiers)
    *   **Rôle dans le projet :** moteur de rendu 3D (`WebGLRenderer`, WebGL 2) et intégration WebXR (`renderer.xr`) pour le mode classique et la VR. Choix de WebGL 2 plutôt que WebGPU : `docs/decision-renderer.md`.

*   **Bibliothèque :** OrbitControls (module complémentaire de Three.js, `vendor/three/examples/jsm/controls/OrbitControls.js`)
    *   **Version fixée :** r180 (`three@0.180.0`)
    *   **Lien CDN de référence :** https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js
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
    *   **Source du code original :** dépôt officiel Three.js r180, https://github.com/mrdoob/three.js/blob/r180/examples/jsm/controls/OrbitControls.js
    *   **Auteur :** Three.js Authors (licence MIT)
    *   **Adaptation effectuée :** aucune modification de la logique. Le script `vendor/three/install.mjs` (Mohamed Aziz Saoudi) remplace seulement `from 'three'` par `from '../../../build/three.module.js'`, pour charger Three.js depuis le dépôt sans CDN ni import map.

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

*   À compléter par Rami : déclarer chaque usage d'un assistant IA (composant, usage, vérification) ou indiquer « Aucun usage ».
