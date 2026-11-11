# HTTP — HyperText Transfer Protocol

| Responsable | Sprint | Couche | Fichiers |
| --- | --- | --- | --- |
| Ramy | S5 | Couche 7 (application), sur TCP port 80 | `src/sim/protocols/http.js`, `scenarios/http.json`, `tests/http.test.js` |

> Statut : **fiche de conception (S1)**. Elle décrit ce que le scénario montrera ; la section « Implémentation » sera complétée quand le protocole sera codé.

## Rôle

HTTP permet à un navigateur de demander une ressource (une page web) à un serveur. Afficher une page enchaîne trois protocoles : DNS pour trouver l'adresse, TCP pour ouvrir la connexion, puis la requête et la réponse HTTP.

## Messages simulés

| Message | Sens | Contenu essentiel |
| --- | --- | --- |
| (DNS) Requête / réponse | Client ↔ serveur DNS | Adresse du serveur web |
| (TCP) SYN, SYN-ACK, ACK | Client ↔ serveur web | Ouverture de la connexion |
| GET /index.html | Client → serveur | Requête HTTP |
| 200 OK | Serveur → client | Réponse avec la page |

## Scénario pédagogique

`scenarios/http.json` : PC, serveur DNS, serveur web. `http.js` réutilise `dns.js` et `tcp.js` par import, sans modifier leurs fichiers.

## Champs affichés par l'inspecteur

Ports TCP, méthode, chemin, code de statut, quelques en-têtes.

## Simplifications pédagogiques

Le projet simule les échanges pour l'apprentissage, sans reproduire une pile réseau complète (cahier §2.2).

- HTTP/1.1 sans chiffrement (HTTPS et TLS : extension F09).
- Une seule requête GET, contenu de page abrégé.
- Pas d'en-têtes de cache ni de cookies.

## Implémentation

À compléter en S5 : fonctions `start` et `onReceive`, étapes du scénario, et test de la séquence de messages. Contrat à respecter : [`../simulation/contrats.md`](../simulation/contrats.md#3-interface-protocole).
