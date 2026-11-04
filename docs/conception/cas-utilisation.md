# Cas d'utilisation

Diagramme : [`cas-utilisation.svg`](cas-utilisation.svg). Auteur : Ramy (S1).

Les 14 cas d'utilisation couvrent les exigences F01 à F10 du cahier des charges. Les cas liés à F01–F08 sont obligatoires. F09 (extension du catalogue) n'ajoute pas de cas nouveau : ce sont de nouveaux scénarios dans UC07. F10 (AR) est optionnel.

## Acteurs

| Acteur | Type | Rôle |
| --- | --- | --- |
| Étudiant | principal | Explore la topologie, lance et pilote les scénarios, inspecte les paquets (§2.1, utilisateurs primaires). |
| Enseignant | principal | Hérite de tous les cas de l'Étudiant ; utilise l'application en cours et en TD (§2.1, utilisateurs secondaires). |
| Navigateur WebXR | secondaire | Fournit la session `immersive-vr` ; pendant le projet, Chrome avec Immersive Web Emulator (§3.2). |
| Appareil AR | secondaire, optionnel | Appareil compatible avec le hit testing (F10). |

## Cas d'utilisation

| Id | Cas d'utilisation | Paquet | Acteur | Exigences | Priorité | Relations | Sprint prévu |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UC01 | Ouvrir l'application par URL HTTPS | Accès et PWA | Étudiant | F07 | Essentiel | — | S1 |
| UC02 | Installer la PWA | Accès et PWA | Étudiant | F07 | Essentiel (facultatif pour l'utilisateur) | «extend» UC01 | S5 |
| UC03 | Utiliser hors ligne après mise en cache | Accès et PWA | Étudiant | F07 | Essentiel | «extend» UC01 | S6 |
| UC04 | Explorer la topologie 3D (souris ou tactile) | Navigation 3D | Étudiant | F01, F08 | Essentiel | — | S1–S2 |
| UC05 | Sélectionner un équipement ou un paquet (raycasting) | Navigation 3D | — | F01, F05 | Essentiel | «extend» UC04 ; inclus par UC08 | S2 |
| UC06 | Choisir un scénario | Simulation | Étudiant | F01, F03 | Essentiel | — | S4 |
| UC07 | Lancer la simulation d'un protocole | Simulation | Étudiant | F02, F03, F04, F09 | Prioritaire | «include» UC10 | S3–S5 |
| UC08 | Démarrer un ping entre deux hôtes | Simulation | — | F03 | Prioritaire | spécialise UC07 ; «include» UC05 | S3 |
| UC09 | Contrôler la simulation (lecture, pause, pas à pas, vitesse, réinitialisation) | Simulation | Étudiant | F06 | Essentiel | — | S2 |
| UC10 | Suivre les explications étape par étape et le journal | Pédagogie | — | F02 | Essentiel | inclus par UC07 | S3 |
| UC11 | Inspecter un paquet (MAC, IP, ports, TTL, indicateurs) | Pédagogie | Étudiant | F05 | Essentiel | — | S3 |
| UC12 | Explorer la scène en VR | Mode immersif | Étudiant | F08 | Essentiel | «include» UC13 | S4–S5 |
| UC13 | Entrer et quitter la session `immersive-vr` | Mode immersif | Navigateur WebXR | F08 | Essentiel | inclus par UC12 | S4 |
| UC14 | Poser la topologie en AR par hit testing | Mode immersif | Étudiant, Appareil AR | F10 | Option | — | hors plan (si le temps le permet) |

« — » dans la colonne Acteur : le cas n'est pas déclenché directement par un acteur, il est inclus dans un autre cas ou en étend un autre.

## Correspondance avec le plan de démonstration (§3.1)

| Étape de la démonstration | Cas d'utilisation |
| --- | --- |
| 1. Ouvrir l'URL HTTPS sans installation | UC01 |
| 2. Installer la PWA, ou la refuser sans gêne | UC02 |
| 3. Explorer, sélectionner deux hôtes, démarrer un ping | UC04, UC05, UC08 |
| 4. Observer ARP puis ICMP, pause, pas à pas, inspecter, changer de scénario | UC07, UC09, UC10, UC11, UC06 |
| 5. Changer la vitesse, réinitialiser, recharger hors ligne | UC09, UC03 |
| 6. Entrer et sortir d'`immersive-vr`, repli 2D sans XR | UC12, UC13 |

## Choix de modélisation

- **Ping (UC08) spécialise « Lancer la simulation » (UC07)** : c'est un scénario parmi d'autres, mis à part parce que le plan de démonstration en fait le scénario de référence et qu'il est le seul à exiger de choisir deux hôtes (d'où l'«include» de UC05).
- **Les explications (UC10) sont incluses dans tout scénario** : le cahier exige que chaque scénario présente le rôle du protocole et la succession des messages (§2.2).
- **L'inspection (UC11) reste un cas distinct de la sélection (UC05)** : sélectionner un paquet est le moyen, lire ses champs est l'objectif pédagogique (F05).
- **Le repli 2D sans WebXR** n'est pas un cas d'utilisation (l'utilisateur ne le déclenche pas) : c'est une note sur UC12 et une exigence de comportement (F08, §3.1).
