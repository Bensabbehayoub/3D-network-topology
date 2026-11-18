# ARP — Address Resolution Protocol

| Prévu (planning) | Réalisé | Couche | Fichiers |
| --- | --- | --- | --- |
| Khalil, S3 | Refonte, phase 4a ; compléments S3 (Khalil) | Couche 2/3 (entre Ethernet et IP) | `src/sim/stack.mjs` (résolution, cache, file d'attente), `src/sim/protocols/arp.mjs` (scénario ARP), `src/sim/devices/host.mjs`, `router.mjs` (réponses), `scenarios/arp.json`, `tests/arp.test.mjs` |

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
- Une seule requête par résolution, sans nouvel essai avant l'abandon (un vrai système en refait généralement deux ou trois).
- Pas d'ARP gratuit ni de proxy ARP.
- Délai d'attente de la réponse : 3 s simulées ; sans réponse, les paquets en attente sont perdus (« ARP sans réponse »).

## Implémentation

- `stack.mjs` : `resolveMac` consulte le cache (`ctx.memory`), sinon diffuse une requête et met en **file d'attente** les paquets IP qui attendent cette adresse ; à la réponse, le cache est rempli et la file envoyée. Délai sans réponse : abandon expliqué (`arp-timeout`).
- `devices/host.mjs` et `router.mjs` : répondent pour leur propre adresse (le routeur pour l'adresse de l'interface interrogée) et retiennent le demandeur ; ignorent les requêtes pour une autre adresse.
- `devices/switch.mjs` : apprentissage des MAC, inondation des diffusions, transmission par un seul port ensuite.
- **Règle de fusion de la RFC 826** (S3) : un équipement qui reçoit une trame ARP dont l'émetteur est **déjà** dans son cache rafraîchit cette entrée, même si la question ne le vise pas. Un émetteur inconnu n'est appris que par la cible de la question.
- **Cache consultable** (S3) : `app.sim.getDeviceTables(id)` renvoie le cache ARP d'un PC ou d'un routeur (`arp`), les adresses dont la réponse est attendue (`pendingArp`) et la table MAC d'un switch (`macTable`). L'inspecteur peut ainsi montrer le cache se remplir pendant la simulation. Voir [contrats §4](../simulation/contrats.md#4-api-de-commandes-et-états).
- Étapes expliquées : `arp-cache-miss`, `arp-request`, `arp-reply`, `arp-ignore`, `arp-cache-update`, `arp-timeout`, `arp-done`, `arp-failed` (avec suffixe d'équipement, voir [contrats §3](../simulation/contrats.md#étapes-standard)).
- Tests (`tests/arp.test.mjs`, et `host.test.mjs`, `switch.test.mjs`) : séquence du scénario (requête diffusée, inondation, réponse directe, cache) ; cible absente (abandon après le délai) ; champs de l'inspecteur.
- Tests ajoutés en S3 (`tests/arp.test.mjs`) :
  - le cache ARP se remplit pendant la lecture et se vide à la réinitialisation ;
  - vers un autre réseau, PC 1 demande la MAC de sa **passerelle**, et le routeur résout le saut suivant sur son interface de sortie ;
  - la diffusion ARP ne traverse jamais le routeur ;
  - à la 2e requête d'écho, tout est en cache : aucune nouvelle requête ARP ;
  - plusieurs paquets en attente de la même adresse ne déclenchent qu'une seule requête ;
  - une réponse arrivée après l'abandon met le cache à jour sans renvoyer le paquet perdu ;
  - règle de fusion de la RFC 826 ;
  - après un ping entre réseaux, PC 1 ne connaît que la MAC du routeur.
