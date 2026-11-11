# DHCP — Dynamic Host Configuration Protocol

| Responsable | Sprint | Couche | Fichiers |
| --- | --- | --- | --- |
| Ramy | S4 | Couche 7 (application), sur UDP ports 67/68 | `src/sim/protocols/dhcp.js`, `scenarios/dhcp.json`, `tests/dhcp.test.js` |

> Statut : **fiche de conception (S1)**. Elle décrit ce que le scénario montrera ; la section « Implémentation » sera complétée quand le protocole sera codé.

## Rôle

DHCP donne automatiquement une configuration IP (adresse, masque, passerelle, DNS) à un PC qui arrive sur le réseau sans adresse. L'échange se fait en quatre messages, appelé DORA.

## Messages simulés

| Message | Sens | Contenu essentiel |
| --- | --- | --- |
| DISCOVER | Client → tous (diffusion) | « Y a-t-il un serveur DHCP ? » |
| OFFER | Serveur → client | Proposition d'une adresse |
| REQUEST | Client → tous (diffusion) | « J'accepte l'offre de ce serveur » |
| ACK | Serveur → client | Bail confirmé : adresse, masque, passerelle, DNS, durée |

## Scénario pédagogique

`scenarios/dhcp.json` : un PC sans adresse (interface sans champ `ip`), un switch et un serveur DHCP avec une plage d'adresses. À la fin, l'inspecteur montre la nouvelle configuration du PC.

## Champs affichés par l'inspecteur

MAC du client, adresses IP source (0.0.0.0) et destination (255.255.255.255), ports 68/67, type de message, adresse proposée.

## Simplifications pédagogiques

Le projet simule les échanges pour l'apprentissage, sans reproduire une pile réseau complète (cahier §2.2).

- Un seul serveur DHCP.
- Pas de renouvellement ni d'expiration du bail.
- Pas de relais DHCP entre réseaux.

## Implémentation

À compléter en S4 : fonctions `start` et `onReceive`, étapes du scénario, et test de la séquence de messages. Contrat à respecter : [`../simulation/contrats.md`](../simulation/contrats.md#3-interface-protocole).
