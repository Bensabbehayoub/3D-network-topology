# DHCP — Dynamic Host Configuration Protocol

| Prévu (planning) | Réalisé | Couche | Fichiers |
| --- | --- | --- | --- |
| Ramy, S4 | Refonte, phase 4b | Couche 7 (application), sur UDP ports 67/68 | `src/sim/protocols/dhcp.js`, `src/sim/stack.js` (`configureDevice`, `runtimeDevice`), `scenarios/dhcp.json`, `tests/dhcp.test.js` |

> Statut : **implémenté et testé.**

## Rôle

DHCP donne automatiquement une configuration IP (adresse, masque, passerelle, DNS) à un PC qui arrive sur le réseau sans adresse. L'échange se fait en quatre messages, appelé DORA.

## Messages simulés

| Message | Sens | Contenu essentiel |
| --- | --- | --- |
| DISCOVER | Client → tous (diffusion) | « Y a-t-il un serveur DHCP ? » (IP source 0.0.0.0) |
| OFFER | Serveur → client (diffusé) | Adresse proposée, masque, passerelle, DNS, durée du bail |
| REQUEST | Client → tous (diffusion) | « J'accepte l'offre de ce serveur » |
| ACK | Serveur → client (diffusé) | Bail confirmé |

## Scénario pédagogique

`dhcp.json` : deux PC sans adresse, un switch, un serveur DHCP (plage 192.168.1.100 à 192.168.1.110, bail de 24 h) et un routeur. Séquence relevée (52 envois, 14,9 s) : DORA pour PC 1, puis **vérification par un ping** vers la passerelle avec l'adresse obtenue ; 8 s plus tard, la même chose pour PC 2, qui reçoit une adresse différente. La fiche du PC montre ensuite sa nouvelle configuration.

## Champs affichés par l'inspecteur

MAC du client, adresses IP source (0.0.0.0) et destination (255.255.255.255), ports 68/67, type de message, identifiant de transaction, adresse proposée, options (masque, passerelle, DNS, bail).

## Simplifications pédagogiques

- Un seul serveur DHCP, dans le même réseau que les clients (pas de relais DHCP).
- Réponses du serveur diffusées (comme avec le drapeau de diffusion), plus visibles.
- Pas de renouvellement ni d'expiration du bail.
- La configuration obtenue est gardée par la pile pendant l'exécution, jamais écrite dans le scénario : une réinitialisation rejoue l'échange à l'identique.

## Implémentation

- `protocols/dhcp.js` : clients (DISCOVER, REQUEST, vérification), serveur (plage, baux, première adresse libre), explications `dhcp-discover`, `dhcp-offer`, `dhcp-request`, `dhcp-ack`, `dhcp-configured`, `dhcp-verify`, `dhcp-verified`, `dhcp-pool-empty`, `dhcp-summary`.
- `stack.js` : `configureDevice` applique l'adresse obtenue ; `runtimeDevice` la rend visible aux autres protocoles et à la fiche d'équipement.
- Dans l'éditeur, le rôle « serveur DHCP » propose une plage (.100 à .150) ; jouer DHCP sans serveur est refusé avec une explication.
- Tests (`tests/dhcp.test.js`) : DORA pour deux clients, adresses distinctes, ping de vérification ; sans DHCP, pas d'adresse ; plage épuisée ; choix de l'adresse ; champs de l'inspecteur.
