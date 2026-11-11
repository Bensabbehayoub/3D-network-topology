# Cahier conceptuel

Assemblé par Ramy ; chaque diagramme est rédigé par son auteur. Version S1 : ce document rassemble ce qui existe et indique quand le reste arrive.

| Livrable (cahier des charges §4) | Auteur | État | Où |
| --- | --- | --- | --- |
| Besoins fonctionnels F01–F10 | Équipe | ✅ S1 | [section 1](#1-besoins) |
| Maquettes de l'interface (PC et mobile) | Ramy | ✅ S1 | [`conception/maquette.svg`](conception/maquette.svg), [`conception/maquette-mobile.svg`](conception/maquette-mobile.svg) |
| Diagramme de cas d'utilisation | Ramy | ✅ S1 | [`conception/cas-utilisation.md`](conception/cas-utilisation.md) |
| Diagramme de déploiement | Ayoub | Version provisoire S1, finale S3 | [`architecture.md` §2](architecture.md#2-diagramme-de-déploiement) |
| Diagramme de séquence du ping | Aziz | S3, finalisé en S6 | `conception/sequence-ping` (à venir) |
| Diagramme de classes | Khalil | S6 | `conception/classes` (à venir) ; structure actuelle dans [`architecture.md` §5](architecture.md#5-patrons-de-conception-cahier-82) |
| Contrats entre modules | Khalil | ✅ S1 | [`simulation/contrats.md`](simulation/contrats.md) |
| Choix du moteur de rendu | Ayoub | ✅ S1 | [`decision-renderer.md`](decision-renderer.md) |

## 1. Besoins

**Utilisateurs.** Primaires : étudiants du cycle ingénieur qui étudient les réseaux. Secondaires : enseignants (cours et TD). Évaluation : superviseur et jury.

**Besoin pédagogique.** Chaque scénario présente le rôle du protocole, les équipements impliqués, la succession des messages et leur interprétation. Le projet simule les échanges pour apprendre ; il ne reproduit pas une pile réseau complète.

**Besoin d'accès.** URL HTTPS sans configuration ; installation PWA facultative ; utilisation hors ligne après un premier chargement ; mode classique (souris, tactile) et mode VR (WebXR, émulable).

| Réf. | Fonctionnalité | Priorité | Cas d'utilisation |
| --- | --- | --- | --- |
| F01 | Charger une topologie JSON et l'explorer en 3D | Essentiel | UC04, UC05, UC06 |
| F02 | Animations et explications étape par étape | Essentiel | UC07, UC10 |
| F03 | ARP, ICMP, DNS, DHCP, TCP, UDP | Prioritaire | UC07, UC08 |
| F04 | HTTP, routage statique (VLAN si le temps le permet) | Progressif | UC07 |
| F05 | Inspection des paquets | Essentiel | UC11 |
| F06 | Lecture, pause, pas à pas, vitesse, réinitialisation | Essentiel | UC09 |
| F07 | Accès par URL, PWA, cache | Essentiel | UC01, UC02, UC03 |
| F08 | Mode classique et VR WebXR | Essentiel | UC04, UC12, UC13 |
| F09 | Extensions (IPv6, TLS, OSPF…) | Extension | UC07 |
| F10 | AR par hit testing | Option | UC14 |

## 2. Cas d'utilisation

![Diagramme de cas d'utilisation](conception/cas-utilisation.svg)

Description des 14 cas et choix de modélisation : [`conception/cas-utilisation.md`](conception/cas-utilisation.md).

## 3. Maquettes

| PC | Mobile |
| --- | --- |
| ![Maquette PC](conception/maquette.svg) | ![Maquette mobile](conception/maquette-mobile.svg) |

## 4. Déploiement

Version provisoire (S1) dans [`architecture.md`](architecture.md#2-diagramme-de-déploiement) : navigateur, Three.js, Service Worker, WebXR Device API (casque réel ou Immersive Web Emulator), dépôt GitHub, GitHub Actions, GitHub Pages en HTTPS.

## 5. Séquence du ping (prévue en S3)

Le diagramme montrera : sélection de deux PC → requête ARP en diffusion → inondation par le switch → réponse ARP → echo request ICMP → traversée du routeur (TTL − 1, ARP vers le saut suivant si besoin) → echo reply. Voir [`protocoles/arp.md`](protocoles/arp.md) et [`protocoles/icmp.md`](protocoles/icmp.md).

## 6. Classes (prévu en S6)

En attendant le diagramme, les modules et patrons utilisés (Observer, Command, State, Strategy, Factory) sont décrits dans [`architecture.md` §5](architecture.md#5-patrons-de-conception-cahier-82).
