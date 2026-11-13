# Documentation

Point d'entrée de la documentation du projet **3D Network Topology**. Le README du dépôt donne la vue d'ensemble : [`../README.md`](../README.md).

## Utilisateurs

| Document | Contenu |
| --- | --- |
| [`manuel.md`](manuel.md) | Manuel complet : écran, exploration, scénarios, inspecteur, fiches et débit, recommandations, mode Construire, VR, installation et hors ligne, FAQ |

## Organisation du projet

| Document | Contenu | Auteur |
| --- | --- | --- |
| [`planning.md`](planning.md) | Sprints, jalons, 79 tâches avec leur statut réel (membre ou phase de la refonte, commit), travail ajouté pendant la refonte, bilan S1 | Équipe, statuts mis à jour en 9a |
| [`avancement.md`](avancement.md) | Journal de la refonte : règles, phases, décisions, ce qui a été vérifié et ce qui ne l'a pas été | Refonte |
| [`../ATTRIBUTION.md`](../ATTRIBUTION.md) | Origine des ressources, bibliothèques, outils, usage des assistants IA | Équipe |

## Technique

| Document | Contenu | Auteur |
| --- | --- | --- |
| [`architecture.md`](architecture.md) | Principes, modules et dépendances, déploiement, démarrage, boucle de rendu, pile réseau, éditeur, WebXR, patrons, tests | Khalil (S1), réécrit en 9a |
| [`simulation/contrats.md`](simulation/contrats.md) | Contrats entre pôles : format de scénario, évènements, interface protocole, API `app.sim`, `app.ui`, `app.render` | Khalil (S1), tenu à jour à chaque phase |
| [`decision-renderer.md`](decision-renderer.md) | Rendu 100 % WebGPU (mode classique et VR), pont de l'émulateur : essais et justification | Ayoub (S1), refait en phase 2 |
| [`ci-cd.md`](ci-cd.md) | Pipeline GitHub Actions (tests, déploiement, vérification HTTPS) et TLS de GitHub Pages : valeurs observées, démonstration, limites | Phase 8 |

## Conception (livrable « cahier conceptuel »)

| Document | Contenu | Auteur |
| --- | --- | --- |
| [`cahier-conceptuel.md`](cahier-conceptuel.md) | Besoins et leur état, cas d'utilisation, maquettes et interface réalisée, déploiement, séquence du ping, états de la simulation, diagrammes de classes | Ramy |
| [`conception/cas-utilisation.md`](conception/cas-utilisation.md) | 21 cas d'utilisation, acteurs, correspondance avec la démonstration | Ramy |
| [`conception/maquette.svg`](conception/maquette.svg), [`maquette-mobile.svg`](conception/maquette-mobile.svg) | Maquettes PC et mobile (S1) | Ramy |

## Protocoles

Une fiche par protocole : rôle, messages simulés, scénario et séquence relevée sur le moteur, champs inspectés, simplifications, implémentation et tests. Tous sont **implémentés et testés**.

| Protocole | Prévu (planning) | Réalisé |
| --- | --- | --- |
| [ARP](protocoles/arp.md) | Khalil, S3 | Refonte, phase 4a |
| [ICMP (ping)](protocoles/icmp.md) | Aziz, S3 | Refonte, phase 4a |
| [Routage statique](protocoles/routage.md) | Khalil, S5 | Refonte, phase 4a |
| [UDP](protocoles/udp.md) | Aziz, S4 | Refonte, phase 4b |
| [DNS](protocoles/dns.md) | Aziz, S4 | Refonte, phase 4b |
| [DHCP](protocoles/dhcp.md) | Ramy, S4 | Refonte, phase 4b |
| [TCP](protocoles/tcp.md) | Khalil, S4 | Refonte, phase 4c |
| [HTTP](protocoles/http.md) | Ramy, S5 | Refonte, phase 4c |

## Captures

[`captures/`](captures/) : captures de S1 (`s1-*.jpg`) et captures finales du 13 novembre 2026 (exploration, inspecteur, fiche et débit, recommandations, éditeur, mobile, VR), utilisées dans le README, le manuel et le cahier conceptuel.
