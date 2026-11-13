# Routage statique

| Prévu (planning) | Réalisé | Couche | Fichiers |
| --- | --- | --- | --- |
| Khalil, S5 | Refonte, phase 4a | Couche 3 (réseau) | `src/sim/devices/router.js`, `src/sim/net.js` (tables, plus long préfixe), `src/sim/stack.js`, `scenarios/routage.json`, `scenarios/ttl.json`, `tests/routage.test.js`, `tests/router.test.js`, `tests/net.test.js` |

> Statut : **implémenté et testé.** Le routage est un comportement d'équipement : il sert dans tous les scénarios à plusieurs réseaux.

## Rôle

Un routeur relie plusieurs réseaux IP. Pour chaque paquet, il cherche dans sa table de routage la route la plus précise vers la destination, décrémente le TTL et transmet le paquet vers l'interface ou le routeur suivant. Les routes sont saisies à la main (statiques).

## Messages simulés

| Message | Sens | Contenu essentiel |
| --- | --- | --- |
| Paquet IP transmis | Routeur → saut suivant | TTL − 1, nouvelle trame Ethernet (MAC réécrites) |
| ARP vers le saut suivant | Routeur → voisin | Si la MAC du saut suivant est inconnue |
| ICMP Time exceeded | Routeur → source | Si le TTL atteint 0 |
| ICMP Destination unreachable | Routeur → source | Si aucune route ne correspond |

## Scénario pédagogique

`routage.json` : PC 1 (réseau 1) → Routeur 1 → Routeur 2 → serveur (réseau 3), avec un réseau de transit entre les routeurs. Séquence relevée (20 envois, 8 s) : ARP de PC 1 vers sa passerelle ; echo request ; ARP de Routeur 1 vers Routeur 2 ; transmission ; ARP de Routeur 2 vers le serveur ; transmission (TTL 64 → 62) ; la réponse revient par la route retour de chaque routeur.

Variantes testées : sans la route retour sur le Routeur 2, la requête arrive mais la réponse est perdue ; sans route aller sur le Routeur 1, perte et « destination inaccessible ». Le scénario **Diagnostic** contient une route manquante que l'onglet Recommandations signale.

## Champs affichés par l'inspecteur

Ethernet (MAC réécrites à chaque saut), IP source et destination, TTL ; le trajet du message (de quel équipement à quel équipement, sur quel câble).

## Simplifications pédagogiques

- Routes saisies dans le scénario (`routes` de chaque routeur, ou dans l'éditeur) ; pas de RIP ni d'OSPF (extension F09 non réalisée).
- Plus long préfixe, sans métrique ni partage de charge ; route par défaut `0.0.0.0/0` possible.
- Les routeurs ne transmettent jamais une diffusion `255.255.255.255` (pas de relais DHCP).

## Implémentation

- `net.js` : adresses, masques, `routingTable(device)` (réseaux directement connectés + routes statiques), `lookupRoute(device, ip)` (plus long préfixe).
- `devices/router.js` : appelé avant le protocole ; répond à l'ARP et au ping pour ses adresses ; fait suivre les autres paquets (TTL − 1, ARP du saut suivant, nouvel en-tête Ethernet) ; perte et erreur ICMP à TTL 0 ou sans route.
- Côté hôte, `stack.js` décide : même réseau (`route-direct`) ou passerelle (`route-gateway`), sinon `no-route`.
- Le **diagnostic** suit le chemin de chaque paire d'hôtes (`traceRoute`) pour signaler une route manquante, un routeur suivant introuvable ou une boucle de routage.
- Tests : `routage.test.js` (deux routeurs, routes dans les deux sens, TTL 64 → 62, routes manquantes, route par défaut), `router.test.js` (comportement du routeur isolé), `net.test.js` (calculs d'adresses et plus long préfixe).
