# DNS — Domain Name System

| Prévu (planning) | Réalisé | Couche | Fichiers |
| --- | --- | --- | --- |
| Aziz, S4 | Refonte, phase 4b | Couche 7 (application), sur UDP port 53 | `src/sim/protocols/dns.js`, `scenarios/dns.json`, `tests/dns.test.js` |

> Statut : **implémenté et testé.** HTTP réutilise `resolveName` avant d'ouvrir sa connexion.

## Rôle

DNS traduit un nom (`www.ecole.test`) en adresse IP. Le client interroge son serveur DNS, qui répond à partir de ses enregistrements ; le client garde la réponse en cache pendant sa durée de vie (TTL).

## Messages simulés

| Message | Sens | Contenu essentiel |
| --- | --- | --- |
| Requête DNS (type A) | Client → serveur DNS (UDP 53) | Identifiant, « Quelle est l'adresse de www.ecole.test ? » |
| Réponse DNS | Serveur DNS → client | Même identifiant, réponse `www.ecole.test = …` (TTL 300 s) ou code NXDOMAIN |

## Scénario pédagogique

`dns.json` : PC 1 sur un réseau, serveur DNS et serveur web sur un autre, reliés par un routeur. Le PC demande trois noms à 7 s d'intervalle : `www.ecole.test`, encore `www.ecole.test`, puis `inconnu.ecole.test`. Séquence relevée (25 envois, 17,2 s) :

1. ARP vers la passerelle, requête DNS, ARP du routeur vers le serveur DNS, réponse.
2. Deuxième demande : **réponse prise dans le cache**, aucun paquet.
3. Troisième demande : requête, réponse **NXDOMAIN** (nom inexistant).

## Champs affichés par l'inspecteur

Ethernet, IP, ports UDP, identifiant de requête, question (nom, type), code de réponse, réponses (adresse, TTL).

## Simplifications pédagogiques

- Résolution directe par un seul serveur, qui fait autorité (pas de récursion racine → TLD → serveur du domaine).
- Enregistrements A seulement.
- Délai d'attente de 10 s simulées (au lieu de 5 s réels) pour tenir compte des durées ralenties.

## Implémentation

- `protocols/dns.js` : `resolveName(ctx, client, name, { onResolved, onFailed })` (cache, requête par `sendUdp`, temporisation), `handleDns(ctx, device, packet)` côté serveur (enregistrements `records` du scénario).
- Configuration : serveur DNS de chaque hôte (`dns`), ou obtenu par DHCP pendant l'exécution.
- Le diagnostic signale un client sans serveur DNS ou un serveur DNS introuvable.
- Tests (`tests/dns.test.js`) : scénario (requête, réponse, cache, NXDOMAIN) ; TTL 0 (pas de cache) ; hôte sans serveur DNS (échec immédiat) ; serveur injoignable (délai écoulé) ; champs de l'inspecteur.
