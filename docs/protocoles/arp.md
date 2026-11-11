# ARP — Address Resolution Protocol

| Responsable | Sprint | Couche | Fichiers |
| --- | --- | --- | --- |
| Khalil | S3 | Couche 2/3 (entre Ethernet et IP) | `src/sim/protocols/arp.js`, `scenarios/arp.json`, `tests/arp.test.js` |

> Statut : **fiche de conception (S1)**. Elle décrit ce que le scénario montrera ; la section « Implémentation » sera complétée quand le protocole sera codé.

## Rôle

Pour envoyer une trame sur un réseau local, il faut l'adresse MAC du destinataire. ARP la retrouve à partir de son adresse IP : une question diffusée à tout le segment, une réponse adressée au seul demandeur, puis une mémorisation dans le cache ARP.

## Messages simulés

| Message | Sens | Contenu essentiel |
| --- | --- | --- |
| Requête ARP (who-has) | Demandeur → tous (MAC ff:ff:ff:ff:ff:ff) | « Qui a 192.168.1.20 ? Répondez à 192.168.1.10 » |
| Réponse ARP (is-at) | Cible → demandeur (unicast) | « 192.168.1.20 est à 02:00:00:00:00:02 » |

## Scénario pédagogique

`scenarios/arp.json` (déjà conforme au format) : trois PC reliés à un switch. PC 1 résout l'adresse de PC 2 ; le switch inonde la requête, PC 3 l'ignore, PC 2 répond, PC 1 met à jour son cache. ARP est aussi la première étape du ping (`ping.json`).

## Champs affichés par l'inspecteur

MAC source et destination, IP de l'émetteur et de la cible, opération (requête ou réponse).

## Simplifications pédagogiques

Le projet simule les échanges pour l'apprentissage, sans reproduire une pile réseau complète (cahier §2.2).

- Pas de durée de vie des entrées du cache (elles restent jusqu'à la réinitialisation).
- Pas d'ARP gratuit ni de proxy ARP.
- Le champ « opération » est représenté par le type de paquet `request` / `reply`.

## Implémentation

À compléter en S3 : fonctions `start` et `onReceive`, étapes du scénario, et test de la séquence de messages. Contrat à respecter : [`../simulation/contrats.md`](../simulation/contrats.md#3-interface-protocole).
