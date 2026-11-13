# HTTP — HyperText Transfer Protocol

| Prévu (planning) | Réalisé | Couche | Fichiers |
| --- | --- | --- | --- |
| Ramy, S5 | Refonte, phase 4c | Couche 7 (application), sur TCP port 80 | `src/sim/protocols/http.js`, `scenarios/http.json`, `tests/http.test.js` |

> Statut : **implémenté et testé.**

## Rôle

HTTP permet à un navigateur de demander une ressource (une page web) à un serveur. Afficher une page enchaîne trois protocoles : DNS pour trouver l'adresse, TCP pour ouvrir la connexion, puis la requête et la réponse HTTP.

## Messages simulés

| Message | Sens | Contenu essentiel |
| --- | --- | --- |
| (DNS) requête / réponse | Client ↔ serveur DNS | Adresse de `www.ecole.test` |
| (TCP) SYN, SYN-ACK, ACK | Client ↔ serveur web | Ouverture de la connexion |
| `GET /` | Client → serveur | Requête HTTP/1.1 |
| `200 OK` | Serveur → client | La page, en trois segments TCP |
| `GET /absent` | Client → serveur | Deuxième requête sur la **même** connexion |
| `404 Not Found` | Serveur → client | Page absente |
| (TCP) FIN, FIN-ACK, ACK | Client ↔ serveur | Fermeture |

## Scénario pédagogique

`http.json` : PC 1 sur un réseau, serveur DNS et serveur web sur un autre, reliés par un routeur. Séquence relevée (94 envois, 22,5 s) : ARP, résolution DNS, ARP du routeur vers le serveur web, poignée de main TCP, `GET /` et sa réponse 200 en trois segments acquittés, puis `GET /absent` → 404 sur la même connexion (HTTP/1.1 persistant), et fermeture. On voit ainsi pourquoi garder la connexion ouverte évite une nouvelle poignée de main.

## Champs affichés par l'inspecteur

Ethernet, IP, ports TCP, séquence et acquittement, méthode, chemin, hôte, code et texte de statut, type et taille du contenu.

## Simplifications pédagogiques

- HTTP/1.1 sans chiffrement : pas de HTTPS ni de TLS dans la simulation (extension F09 non réalisée ; le TLS du site lui-même est expliqué dans [`ci-cd.md`](../ci-cd.md)).
- Pages déclarées dans le scénario (`pages`), contenu abrégé ; pas d'en-têtes de cache ni de cookies.

## Implémentation

- `protocols/http.js` : `parseUrl`, `respond` (200 ou 404 d'après `pages`) ; le client enchaîne `resolveName` (DNS) puis `connect` (TCP), envoie ses requêtes l'une après l'autre sur la même connexion, puis la ferme. Le serveur web passe par `handleTcp`.
- Étapes expliquées : `http-start`, `http-dns`, `http-dns-done`, `http-connect`, `http-request`, `http-response`, `http-received`, `http-not-found`, `http-close`, `http-summary`, et les cas d'échec.
- Tests (`tests/http.test.js`) : scénario (DNS, une seule connexion TCP pour deux requêtes, 200 puis 404) ; nom inconnu (échec DNS, aucune connexion) ; serveur sans service sur le port 80 (RST, connexion refusée) ; adresses et réponses ; champs de l'inspecteur.
