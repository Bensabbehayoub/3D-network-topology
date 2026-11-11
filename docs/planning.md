# Planning et répartition des tâches

Source : tableau de suivi de l'équipe (`Plan_3D_Network_Topology.xlsx`), recopié ici pour que le planning soit consultable dans le dépôt. **Le tableau reste la référence pour les statuts** ; cette page est mise à jour à chaque fin de sprint.

Méthode XP : sprints d'une semaine (lundi → dimanche), planning le lundi, stand-up le mercredi et le vendredi, démo sur GitHub Pages et rétrospective le dimanche. Les points sont des estimations relatives de l'effort.

## Vue d'ensemble

| Sprint | Dates | Phase | Résultat attendu le dimanche | Jalon |
|---|---|---|---|---|
| S1 | 2–8 nov | Fondations et contrats | Le site s'ouvre sur GitHub Pages et affiche une topologie. Les formats communs (contrats) et leurs mocks sont validés par les quatre. Le moteur de rendu est choisi. | — |
| S2 | 9–15 nov | Scène 3D et moteur d'évènements | Un paquet de test traverse le réseau et obéit à Lecture, Pause, Pas à pas, Vitesse et Réinitialiser. | — |
| S3 | 16–22 nov | ARP, ICMP et inspection | On choisit deux PC, on lance un ping, on voit ARP puis ICMP, on met en pause, on avance pas à pas et on inspecte un paquet. | MVP : ping démontrable (22 nov) |
| S4 | 23–29 nov | Catalogue de protocoles | Six protocoles au choix, chacun avec ses explications et ses tests. On entre et on sort de la VR dans l'émulateur. | — |
| S5 | 30 nov–6 déc | VR, PWA et extensions | Les étapes 1 à 6 de la démo du cahier des charges passent (sauf le hors ligne). | Démo complète (6 déc) |
| S6 | 7–13 déc | Stabilisation et hors ligne | Un membre qui n'a pas codé la démo la rejoue entièrement sans aide. Version v1.0-rc taguée. | Gel des fonctionnalités (13 déc) |
| S7 | 14–20 déc | Livraison | Tous les livrables sont remis. Deux répétitions de soutenance à quatre. | v1.0 le 18 déc, remise le 20 déc |

## Charge par membre (points)

| Membre | S1 | S2 | S3 | S4 | S5 | S6 | S7 | Total | Tâches | Terminées |
|---|---|---|---|---|---|---|---|---|---|---|
| Ramy | 7 | 8 | 7 | 7 | 6 | 6 | 4 | **45** | 20 | 4 |
| Aziz | 7 | 8 | 7 | 7 | 6 | 6 | 4 | **45** | 20 | 4 |
| Khalil | 7 | 8 | 7 | 7 | 6 | 6 | 4 | **45** | 19 | 7 |
| Ayoub | 8 | 7 | 7 | 7 | 6 | 6 | 4 | **45** | 20 | 4 |
| **Équipe** | 29 | 31 | 28 | 28 | 24 | 24 | 16 | **180** | 79 | 19 |

## Tâches par sprint

### S1 — Fondations et contrats (2–8 nov)

Objectif : Mettre en place le dépôt et la scène 3D, et se mettre d'accord sur les formats communs pour que chacun puisse ensuite travailler seul.

| N° | Membre | Tâche | Fichiers | Pts | Statut |
|---|---|---|---|---|---|
| 1 | Ramy | Dessiner la maquette de l'interface : où vont les boutons, l'inspecteur et les explications. | `docs/conception/` | 2 | ✅ Terminé |
| 2 | Ramy | Créer la page index.html et la feuille de style, avec des zones vides réservées aux autres (#controls, #inspector, #explanations, #xr-slot, #install-slot). | `index.html`, `styles.css` | 2 | ✅ Terminé |
| 3 | Ramy | Créer ui/index.js, qui démarre tous les modules de l'interface. | `src/ui/index.js` | 1 | ✅ Terminé |
| 4 | Ramy | Dessiner le diagramme de cas d'utilisation. | `docs/conception/` | 2 | ✅ Terminé |
| 5 | Aziz | Créer la scène 3D : caméra, lumière, rotation et zoom à la souris et au doigt. | `src/render/` | 3 | ✅ Terminé |
| 6 | Aziz | Télécharger Three.js (version choisie avec Ayoub) et le placer dans le dépôt pour qu'il marche hors ligne. | `vendor/three/` | 1 | ✅ Terminé |
| 7 | Aziz | Afficher une topologie lue depuis un fichier JSON avec des formes simples (cubes, sphères). | `src/render/` | 2 | ✅ Terminé |
| 8 | Aziz | Écrire l'API de rendu (fonctions que les autres appelleront) et une fausse version (mock) pour tester sans attendre. | `src/render/` | 1 | ✅ Terminé |
| 9 | Khalil | Définir le format des fichiers de scénario JSON : équipements, adresses MAC/IP, liens, étapes et explications. | `src/sim/`, `docs/` | 2 | ✅ Terminé |
| 10 | Khalil | Définir le format d'un évènement réseau (events.js) et les fonctions que chaque protocole doit fournir. | `src/sim/events.js` | 2 | ✅ Terminé |
| 11 | Khalil | Définir les commandes (lecture, pause, pas à pas, vitesse, réinitialisation) et fournir un faux moteur (mock). | `src/sim/` | 1 | ✅ Terminé |
| 12 | Khalil | Créer le squelette du moteur et les premiers tests automatiques. | `simulation.js`, `src/sim/`, `tests/` | 2 | ✅ Terminé |
| 13 | Ayoub | Créer le dépôt GitHub, le fichier CODEOWNERS (qui possède quoi) et protéger la branche main. | `.github/` | 2 | ✅ Terminé |
| 14 | Ayoub | Activer GitHub Pages en HTTPS et la CI qui lance les tests et déploie automatiquement. | `.github/` | 2 | ✅ Terminé |
| 15 | Ayoub | Créer main.js, manifest.json et un premier sw.js minimal. | `main.js`, `manifest.json`, `sw.js` | 1 | ✅ Terminé |
| 16 | Ayoub | Tester WebXR dans l'émulateur pour choisir le moteur de rendu (WebGPU ou WebGL 2). | (test hors dépôt) | 3 | ✅ Terminé |

### S2 — Scène 3D et moteur d'évènements (9–15 nov)

Objectif : Avoir de vrais équipements en 3D et un moteur qui fait avancer la simulation.

| N° | Membre | Tâche | Fichiers | Pts | Statut |
|---|---|---|---|---|---|
| 17 | Ramy | Créer les boutons Lecture, Pause, Pas à pas, Vitesse et Réinitialiser, reliés aux commandes du moteur. | `src/ui/controls.js` | 3 | À faire |
| 18 | Ramy | Permettre de sélectionner un objet 3D au clic ou au toucher (fonction pick). | `src/ui/selection.js` | 3 | À faire |
| 19 | Ramy | Afficher un panneau d'infos (nom, IP, MAC) quand on sélectionne un équipement. | `src/ui/` | 2 | À faire |
| 20 | Aziz | Préparer des modèles 3D légers (routeur, switch, PC) au format GLB. | `assets/models/` | 3 | À faire |
| 21 | Aziz | Créer factory.js, qui place le bon modèle pour chaque équipement du fichier JSON. | `src/render/factory.js` | 2 | À faire |
| 22 | Aziz | Dessiner les câbles entre les équipements et les étiquettes (noms, IP). | `src/render/links.js`, `labels.js` | 3 | À faire |
| 23 | Khalil | Coder le moteur : une liste d'évènements triée par temps et une horloge simulée. | `src/sim/engine.js` | 3 | ✅ Terminé |
| 24 | Khalil | Gérer les états (prêt, lecture, pause, terminé) et les commandes. | `src/sim/state.js`, `commands.js` | 3 | ✅ Terminé |
| 25 | Khalil | Créer le bus d'évènements (Observer) qui prévient l'interface et la 3D, avec ses tests. | `src/sim/`, `tests/` | 2 | ✅ Terminé |
| 26 | Ayoub | Animer les paquets qui avancent sur les câbles au rythme de l'horloge simulée (et non des images). | `src/render/packetAnimator.js` | 5 | À faire |
| 27 | Ayoub | Écrire le script qui génère tout seul la liste des fichiers à mettre en cache, lancé par la CI. | `tools/`, `.github/` | 2 | À faire |

### S3 — ARP, ICMP et inspection (16–22 nov)

Objectif : Faire marcher le premier vrai scénario : le ping. **Jalon : MVP : ping démontrable (22 nov).**

| N° | Membre | Tâche | Fichiers | Pts | Statut |
|---|---|---|---|---|---|
| 28 | Ramy | Créer l'inspecteur : un clic sur un paquet affiche ses champs (MAC, IP, TTL, type). | `src/ui/inspector.js` | 3 | À faire |
| 29 | Ramy | Afficher l'explication de chaque étape du scénario. | `src/ui/explanations.js` | 2 | À faire |
| 30 | Ramy | Afficher le journal des messages échangés. | `src/ui/` | 2 | À faire |
| 31 | Aziz | Coder ICMP : le ping (demande et réponse), avec ses tests. | `protocols/icmp.js`, `tests/icmp.test.js` | 3 | À faire |
| 32 | Aziz | Choisir les couleurs des 9 protocoles et l'aspect d'un paquet broadcast ou unicast. | `src/render/packetStyles.js` | 3 | À faire |
| 33 | Aziz | Faire un premier jet du diagramme de séquence du ping. | `docs/conception/` | 1 | À faire |
| 34 | Khalil | Coder ARP : trouver l'adresse MAC à partir de l'IP (demande en broadcast, réponse, mémoire cache). | `protocols/arp.js` | 3 | À faire |
| 35 | Khalil | Coder le comportement d'un PC et d'un routeur simple qui transmet vers la passerelle. | `devices/host.js`, `router.js` | 3 | À faire |
| 36 | Khalil | Écrire les tests d'ARP. | `tests/arp.test.js` | 1 | À faire |
| 37 | Ayoub | Coder le switch : il apprend les adresses MAC et envoie partout s'il ne connaît pas la destination. | `devices/switch.js` | 3 | À faire |
| 38 | Ayoub | Écrire les tests du switch. | `tests/switch.test.js` | 1 | À faire |
| 39 | Ayoub | Créer le scénario de démonstration ping.json (deux réseaux reliés par un routeur). | `scenarios/ping.json` | 2 | À faire |
| 40 | Ayoub | Dessiner le diagramme de déploiement. | `docs/conception/` | 1 | À faire |

### S4 — Catalogue de protocoles (23–29 nov)

Objectif : Ajouter DHCP, UDP, DNS et TCP, et démarrer le mode VR.

| N° | Membre | Tâche | Fichiers | Pts | Statut |
|---|---|---|---|---|---|
| 41 | Ramy | Coder DHCP : un PC obtient son adresse IP automatiquement (4 messages). | `protocols/dhcp.js` | 3 | À faire |
| 42 | Ramy | Créer le scénario DHCP avec ses tests et ses textes d'explication. | `scenarios/dhcp.json`, `tests/` | 2 | À faire |
| 43 | Ramy | Créer la liste qui permet de choisir le scénario à jouer. | `src/ui/scenarioPicker.js` | 2 | À faire |
| 44 | Aziz | Coder UDP (envoi sans connexion). | `protocols/udp.js` | 2 | À faire |
| 45 | Aziz | Coder DNS : trouver l'adresse IP d'un nom de domaine, en passant par UDP. | `protocols/dns.js` | 3 | À faire |
| 46 | Aziz | Créer les scénarios UDP et DNS avec leurs tests et leurs textes d'explication. | `scenarios/`, `tests/` | 2 | À faire |
| 47 | Khalil | Coder TCP : ouverture de connexion en 3 temps, envoi de données, fermeture. | `protocols/tcp.js` | 5 | À faire |
| 48 | Khalil | Créer le scénario TCP avec ses tests et ses textes d'explication. | `scenarios/tcp.json`, `tests/` | 2 | À faire |
| 49 | Ayoub | Ajouter le bouton « Entrer en VR » et gérer l'entrée et la sortie du mode VR. | `src/xr/session.js` | 3 | À faire |
| 50 | Ayoub | Créer un panneau de contrôle en 3D visible dans la VR (le HTML y disparaît). | `src/xr/vrPanel.js` | 4 | À faire |

### S5 — VR, PWA et extensions (30 nov–6 déc)

Objectif : Terminer la VR et l'installation de l'application, ajouter HTTP et le routage statique. **Jalon : Démo complète (6 déc).**

| N° | Membre | Tâche | Fichiers | Pts | Statut |
|---|---|---|---|---|---|
| 51 | Ramy | Coder HTTP : une page web demandée après DNS et la connexion TCP. | `protocols/http.js` | 3 | À faire |
| 52 | Ramy | Créer le scénario HTTP avec ses tests et ses textes d'explication. | `scenarios/http.json`, `tests/` | 1 | À faire |
| 53 | Ramy | Gérer le bouton « Installer l'application » et le message si l'installation est refusée. | `src/ui/install.js` | 2 | À faire |
| 54 | Aziz | Rendre l'appli fluide sur mobile (réutiliser formes et matériaux, limiter les paquets affichés). | `src/render/` | 3 | À faire |
| 55 | Aziz | Rendre la scène lisible en VR (taille de la scène, taille des étiquettes). | `src/render/` | 3 | À faire |
| 56 | Khalil | Coder le routage statique : tables de routage, TTL qui diminue, réseau à 2 routeurs. | `devices/router.js` | 4 | À faire |
| 57 | Khalil | Créer le scénario de routage avec ses tests et ses textes d'explication. | `scenarios/`, `tests/` | 2 | À faire |
| 58 | Ayoub | Sélectionner les objets avec les manettes VR (en utilisant la fonction pick de Ramy). | `src/xr/controllers.js` | 3 | À faire |
| 59 | Ayoub | Garder le mode normal si la VR n'est pas disponible. | `src/xr/` | 1 | À faire |
| 60 | Ayoub | Préparer les icônes de l'application et vérifier le manifest et le HTTPS. | `assets/icons/`, `manifest.json` | 2 | À faire |

### S6 — Stabilisation et hors ligne (7–13 déc)

Objectif : Tester, corriger, faire marcher l'appli sans internet et écrire la documentation. **Jalon : Gel des fonctionnalités (13 déc).**

| N° | Membre | Tâche | Fichiers | Pts | Statut |
|---|---|---|---|---|---|
| 61 | Ramy | Écrire le manuel utilisateur (navigation, ping, inspection, installation, VR, dépannage). | `docs/manuel.md` | 4 | À faire |
| 62 | Ramy | Assembler le cahier conceptuel (diagrammes de chacun) et écrire le README. | `docs/cahier-conceptuel.md`, `README.md` | 2 | À faire |
| 63 | Aziz | Tester sur PC et sur deux smartphones, corriger les problèmes d'affichage. | `src/render/` | 3 | À faire |
| 64 | Aziz | Finaliser le diagramme de séquence du ping. | `docs/conception/` | 1 | À faire |
| 65 | Aziz | Documenter le rendu 3D et ses protocoles (ICMP, UDP, DNS). | `docs/` | 2 | À faire |
| 66 | Khalil | Finaliser le diagramme de classes. | `docs/conception/` | 2 | À faire |
| 67 | Khalil | Écrire des tests qui vérifient que rien n'a cassé dans le moteur. | `tests/` | 2 | À faire |
| 68 | Khalil | Documenter la simulation et ses protocoles (ARP, TCP, routage). | `docs/` | 2 | À faire |
| 69 | Ayoub | Mettre en cache tous les fichiers et tester l'appli sans internet sur GitHub Pages. | `sw.js` | 3 | À faire |
| 70 | Ayoub | Lancer un audit Lighthouse (qualité PWA) et noter les résultats. | `docs/` | 1 | À faire |
| 71 | Ayoub | Documenter le lancement en local et le déploiement. | `docs/` | 2 | À faire |

### S7 — Livraison (14–20 déc)

Objectif : Produire la vidéo, finir la documentation et préparer la soutenance. Semaine tampon : aucune nouvelle fonctionnalité. **Jalon : v1.0 le 18 déc, remise le 20 déc.**

| N° | Membre | Tâche | Fichiers | Pts | Statut |
|---|---|---|---|---|---|
| 72 | Ramy | Écrire le script de la vidéo et enregistrer la voix off. | (hors dépôt) | 3 | À faire |
| 73 | Ramy | Documenter DHCP et HTTP. | `docs/protocoles/` | 1 | À faire |
| 74 | Aziz | Filmer la démo sur PC, mobile et VR émulée. | (hors dépôt) | 2 | À faire |
| 75 | Aziz | Monter la vidéo (5 minutes maximum). | (hors dépôt) | 2 | À faire |
| 76 | Khalil | Écrire la documentation d'architecture générale. | `docs/architecture.md` | 3 | À faire |
| 77 | Khalil | Optionnel : ajouter IPv6 simplifié (F09), seulement si aucun bug n'est ouvert. | `protocols/ipv6.js` | 1 | À faire |
| 78 | Ayoub | Publier la version finale v1.0 (18 déc). | `.github/` | 1 | À faire |
| 79 | Ayoub | Préparer le poste de soutenance (émulateur testé) et un plan B (vidéo locale si pas de réseau). | (hors dépôt) | 3 | À faire |

## Bilan du sprint S1 et retours du superviseur

**Livré en S1** (pull requests #1 à #3) : maquettes et page de l'interface (Ramy), scène Three.js et API de rendu (Aziz), contrats du moteur, faux moteur et leurs tests automatiques (Khalil), dépôt, CI, GitHub Pages, `main.js`, PWA minimale et choix du renderer (Ayoub).

**Retours du superviseur** (note C--) : README d'une ligne, documentation absente, répartition des tâches invisible, aucun code WebXR actif.

**Actions correctives** (avant la séance suivante) :

| Retour | Correction | Où |
|---|---|---|
| README d'une ligne | README complet : rôles, planning, architecture, lancement, tests VR | [`README.md`](../README.md) |
| Répartition des tâches absente | Cette page, générée depuis le tableau de suivi | `docs/planning.md` |
| Aucun code WebXR | Détection de la WebXR Device API, statut HTML « Détectée / Non détectée », entrée et sortie de session `immersive-vr` | `src/xr/session.js`, `src/render/scene.js` |
| WebGPU absent | Détection de `navigator.gpu` affichée ; choix WebGL 2 justifié | [`decision-renderer.md`](decision-renderer.md) |
| Documentation | Architecture, cahier conceptuel, manuel (version S1), fiche de chaque protocole, index | [`docs/README.md`](README.md) |
| Rendu non relié au moteur | La scène affiche le scénario chargé par le moteur au lieu d'une topologie codée en dur | `src/render/index.js` |
