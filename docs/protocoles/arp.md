# ARP — Address Resolution Protocol

| Prévu (planning) | Réalisé | Couche | Fichiers |
| --- | --- | --- | --- |
| Khalil, S3 | Refonte, phase 4a | Couche 2/3 (entre Ethernet et IP) | `src/sim/stack.js` (résolution, cache, file d'attente), `src/sim/protocols/arp.js` (scénario ARP), `src/sim/devices/host.js`, `router.js` (réponses), `scenarios/arp.json`, `tests/arp.test.js` |

> Statut : **implémenté et testé.** ARP est fait par la pile commune : tous les scénarios IP l'utilisent (ping, DNS, HTTP…), pas seulement le scénario ARP.

## Rôle

Pour envoyer une trame sur un réseau local, il faut l'adresse MAC du destinataire. ARP la retrouve à partir de son adresse IP : une question diffusée à tout le segment, une réponse adressée au seul demandeur, puis une mémorisation dans le cache ARP.

## Messages simulés

| Message | Sens | Contenu essentiel |
| --- | --- | --- |
| Requête ARP (who-has) | Demandeur → tous (MAC ff:ff:ff:ff:ff:ff) | « Qui a 192.168.1.20 ? Répondez à 192.168.1.10 » |
| Réponse ARP (is-at) | Cible → demandeur (unicast) | « 192.168.1.20 est à 02:00:00:00:00:02 » |

## Scénario pédagogique

`scenarios/arp.json` : trois PC reliés à un switch. PC 1 résout l'adresse de PC 2. Séquence relevée sur le moteur (5 envois, 1,6 s simulées) :

1. PC 1 → Switch 1 : requête ARP en diffusion ; le switch apprend la MAC de PC 1 et inonde la requête vers PC 2 et PC 3.
2. PC 3 ignore la requête (ce n'est pas son adresse) ; PC 2 répond en unicast et retient au passage la MAC de PC 1.
3. Le switch, qui connaît maintenant PC 1, transmet la réponse par un seul port ; PC 1 met à jour son cache.

ARP est aussi la première étape du ping : voir le [diagramme de séquence](../cahier-conceptuel.md#5-séquence-du-ping), où le routeur fait à son tour un ARP sur le second réseau.

## Champs affichés par l'inspecteur

Ethernet (MAC source et destination), opération (requête ou réponse), adresses MAC et IP de l'émetteur et de la cible.

## Simplifications pédagogiques

- Pas de durée de vie des entrées du cache : elles restent jusqu'à la réinitialisation.
- Pas d'ARP gratuit ni de proxy ARP.
- Délai d'attente de la réponse : 3 s simulées ; sans réponse, les paquets en attente sont perdus (« ARP sans réponse »).

## Implémentation

- `stack.js` : `resolveMac` consulte le cache (`ctx.memory`), sinon diffuse une requête et met en **file d'attente** les paquets IP qui attendent cette adresse ; à la réponse, le cache est rempli et la file envoyée. Délai sans réponse : abandon expliqué (`arp-timeout`).
- `devices/host.js` et `router.js` : répondent pour leur propre adresse (le routeur pour l'adresse de l'interface interrogée) et retiennent le demandeur ; ignorent les requêtes pour une autre adresse.
- `devices/switch.js` : apprentissage des MAC, inondation des diffusions, transmission par un seul port ensuite.
- Étapes expliquées : `arp-cache-miss`, `arp-request`, `arp-reply`, `arp-ignore`, `arp-cache-update`, `arp-timeout`, `arp-done`, `arp-failed` (avec suffixe d'équipement, voir [contrats §3](../simulation/contrats.md#étapes-standard)).
- Tests (`tests/arp.test.js`, et `host.test.js`, `switch.test.js`) : séquence du scénario (requête diffusée, inondation, réponse directe, cache) ; cible absente (abandon après le délai) ; champs de l'inspecteur.
