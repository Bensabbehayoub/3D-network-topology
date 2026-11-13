# Cas d'utilisation

Diagramme S1 : [`cas-utilisation.svg`](cas-utilisation.svg) (UC01 à UC14). Cas ajoutés par la refonte (UC15 à UC21) : diagramme Mermaid dans le [cahier conceptuel](../cahier-conceptuel.md#2-cas-dutilisation). Auteur : Ramy (S1), complété en phase 9a.

Les cas UC01 à UC14 couvrent les exigences F01 à F10 du cahier des charges. F09 (extension du catalogue) n'ajoute pas de cas nouveau : ce seraient de nouveaux scénarios dans UC07. F10 (AR) est optionnel. Les cas UC15 à UC21 répondent aux demandes du superviseur pendant la refonte.

## Acteurs

| Acteur | Type | Rôle |
| --- | --- | --- |
| Étudiant | principal | Explore la topologie, lance et pilote les scénarios, inspecte les paquets, construit ses propres réseaux (§2.1, utilisateurs primaires). |
| Enseignant | principal | Hérite de tous les cas de l'Étudiant ; utilise l'application en cours et en TD, prépare des topologies à distribuer en JSON (§2.1, utilisateurs secondaires). |
| Navigateur WebXR | secondaire | Fournit la session `immersive-vr` ; pendant le projet, Chrome avec Immersive Web Emulator (§3.2). |
| Appareil AR | secondaire, optionnel | Appareil compatible avec le hit testing (F10). |
| GitHub Actions | secondaire | Teste, publie le site et vérifie HTTPS et TLS après chaque déploiement et chaque semaine. |

## Cas d'utilisation

| Id | Cas d'utilisation | Paquet | Acteur | Exigences | Priorité | Relations | Réalisé |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UC01 | Ouvrir l'application par URL HTTPS | Accès et PWA | Étudiant | F07 | Essentiel | — | ✅ S1 |
| UC02 | Installer la PWA | Accès et PWA | Étudiant | F07 | Essentiel (facultatif pour l'utilisateur) | «extend» UC01 | ✅ phase 1 |
| UC03 | Utiliser hors ligne après mise en cache | Accès et PWA | Étudiant | F07 | Essentiel | «extend» UC01 | ✅ phase 1 |
| UC04 | Explorer la topologie 3D (souris ou tactile) | Navigation 3D | Étudiant | F01, F08 | Essentiel | — | ✅ S1–S2 |
| UC05 | Sélectionner un équipement ou un paquet (raycasting) | Navigation 3D | — | F01, F05 | Essentiel | «extend» UC04 ; inclus par UC08, UC16 | ✅ S2, paquets en phase 4d |
| UC06 | Choisir un scénario | Simulation | Étudiant | F01, F03 | Essentiel | — | ✅ phase 4a (11 scénarios) |
| UC07 | Lancer la simulation d'un protocole | Simulation | Étudiant | F02, F03, F04, F09 | Prioritaire | «include» UC10 ; inclus par UC19 | ✅ phases 4a à 4c |
| UC08 | Démarrer un ping entre deux hôtes | Simulation | — | F03 | Prioritaire | spécialise UC07 ; «include» UC05 | ✅ phase 4a |
| UC09 | Contrôler la simulation (lecture, pause, pas à pas, vitesse, réinitialisation) | Simulation | Étudiant | F06 | Essentiel | — | ✅ S2, pupitre VR en phase 3 |
| UC10 | Suivre les explications étape par étape et le journal | Pédagogie | — | F02 | Essentiel | inclus par UC07 | ✅ phase 4d |
| UC11 | Inspecter un paquet (MAC, IP, ports, TTL, indicateurs) | Pédagogie | Étudiant | F05 | Essentiel | — | ✅ phase 4d |
| UC12 | Explorer la scène en VR | Mode immersif | Étudiant | F08 | Essentiel | «include» UC13 | ✅ phase 3 |
| UC13 | Entrer et quitter la session `immersive-vr` | Mode immersif | Navigateur WebXR | F08 | Essentiel | inclus par UC12 | ✅ S1, WebGPU en phase 2 |
| UC14 | Poser la topologie en AR par hit testing | Mode immersif | Étudiant, Appareil AR | F10 | Option | — | Non réalisé |
| UC15 | Consulter la fiche d'un équipement (modèle, ports, débit, charge) | Pédagogie | Étudiant | refonte | Demandé | «extend» UC05 | ✅ phase 5 |
| UC16 | Lire les recommandations du diagnostic et voir le problème dans la scène | Pédagogie | Étudiant | refonte | Demandé | «include» UC05 | ✅ phase 6 (2D et VR) |
| UC17 | Construire une topologie (ajouter, déplacer, relier, supprimer) | Construction | Étudiant | refonte | Demandé | — | ✅ phase 7a |
| UC18 | Configurer un équipement (adresses, passerelle, DNS, routes, rôles, ports) | Construction | — | refonte | Demandé | «extend» UC17 | ✅ phase 7b |
| UC19 | Jouer sa topologie avec un protocole | Construction | — | refonte | Demandé | «extend» UC17 ; «include» UC07 | ✅ phase 7b |
| UC20 | Enregistrer, rouvrir, exporter et importer une topologie | Construction | Étudiant | F01, refonte | Demandé | «extend» UC17 | ✅ phase 7c |
| UC21 | Vérifier HTTPS et TLS du site publié | Plateforme | GitHub Actions | F07, refonte | Demandé | — | ✅ phase 8 |

« — » dans la colonne Acteur : le cas n'est pas déclenché directement par un acteur, il est inclus dans un autre cas ou en étend un autre.

## Correspondance avec le plan de démonstration (§3.1)

| Étape de la démonstration | Cas d'utilisation |
| --- | --- |
| 1. Ouvrir l'URL HTTPS sans installation | UC01 (et UC21 pour montrer TLS) |
| 2. Installer la PWA, ou la refuser sans gêne | UC02 |
| 3. Explorer, sélectionner deux hôtes, démarrer un ping | UC04, UC05, UC08 |
| 4. Observer ARP puis ICMP, pause, pas à pas, inspecter, changer de scénario | UC07, UC09, UC10, UC11, UC06 |
| 5. Changer la vitesse, réinitialiser, recharger hors ligne | UC09, UC03 |
| 6. Entrer et sortir d'`immersive-vr`, repli 2D sans XR | UC12, UC13 |
| Ajouts : fiche et débit, recommandations, construction | UC15, UC16, UC17 à UC20 |

## Choix de modélisation

- **Ping (UC08) spécialise « Lancer la simulation » (UC07)** : c'est un scénario parmi d'autres, mis à part parce que le plan de démonstration en fait le scénario de référence.
- **Les explications (UC10) sont incluses dans tout scénario** : le cahier exige que chaque scénario présente le rôle du protocole et la succession des messages (§2.2). Pour une topologie construite (UC19), les explications sont générées à partir de textes génériques.
- **L'inspection (UC11) reste un cas distinct de la sélection (UC05)** : sélectionner un paquet est le moyen, lire ses champs est l'objectif pédagogique (F05). De même, la fiche (UC15) étend la sélection d'un équipement.
- **Configurer (UC18) et jouer (UC19) étendent la construction (UC17)** : on ne peut le faire qu'à partir d'une topologie en cours de construction ; jouer réutilise la simulation (UC07).
- **Le repli 2D sans WebXR** n'est pas un cas d'utilisation (l'utilisateur ne le déclenche pas) : c'est une note sur UC12 et une exigence de comportement (F08, §3.1).
