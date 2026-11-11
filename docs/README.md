# Documentation

Point d'entrée de la documentation du projet **3D Network Topology**. Le README du dépôt donne la vue d'ensemble : [`../README.md`](../README.md).

## Organisation du projet

| Document | Contenu | Auteur |
| --- | --- | --- |
| [`planning.md`](planning.md) | Sprints, jalons, 79 tâches (membre, fichiers, points, statut), charge par membre, bilan S1 | Équipe |
| [`architecture.md`](architecture.md) | Principes, déploiement, démarrage, flux d'une simulation, patrons de conception, WebXR, tests | Khalil |
| [`decision-renderer.md`](decision-renderer.md) | Choix WebGL 2 plutôt que WebGPU : essai dans l'émulateur et justification | Ayoub |

## Conception (livrable « cahier conceptuel »)

| Document | Contenu | Auteur |
| --- | --- | --- |
| [`cahier-conceptuel.md`](cahier-conceptuel.md) | Besoins F01–F10 et sommaire de tous les diagrammes | Ramy |
| [`conception/cas-utilisation.md`](conception/cas-utilisation.md) | 14 cas d'utilisation, acteurs, correspondance avec la démo | Ramy |
| [`conception/maquette.svg`](conception/maquette.svg), [`maquette-mobile.svg`](conception/maquette-mobile.svg) | Maquettes PC et mobile | Ramy |
| [`simulation/contrats.md`](simulation/contrats.md) | Contrats entre modules : format de scénario, évènements, interface protocole, API de commandes | Khalil |

## Protocoles

Une fiche par protocole : rôle, messages simulés, scénario, champs inspectés, simplifications.

| Protocole | Responsable | Sprint |
| --- | --- | --- |
| [ARP](protocoles/arp.md) | Khalil | S3 |
| [ICMP (ping)](protocoles/icmp.md) | Aziz | S3 |
| [UDP](protocoles/udp.md) | Aziz | S4 |
| [DNS](protocoles/dns.md) | Aziz | S4 |
| [DHCP](protocoles/dhcp.md) | Ramy | S4 |
| [TCP](protocoles/tcp.md) | Khalil | S4 |
| [HTTP](protocoles/http.md) | Ramy | S5 |
| [Routage statique](protocoles/routage.md) | Khalil | S5 |

## Utilisateurs

| Document | Contenu | Auteur |
| --- | --- | --- |
| [`manuel.md`](manuel.md) | Navigation, statut WebXR, mode VR, dépannage (version S1, complétée chaque sprint) | Ramy |

## Captures

`captures/` : captures d'écran datées par sprint, réutilisées dans le README et la vidéo.
