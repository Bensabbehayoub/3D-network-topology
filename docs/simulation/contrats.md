# Contrats du pôle simulation (S1)

Auteur : Khalil. Statut : **figés en S1**. Toute modification passe par une pull request relue par les quatre.

Ce document décrit ce que le moteur attend des autres et ce qu'il leur fournit :

1. [Format des scénarios JSON](#1-format-des-scénarios-json) : tous
2. [Évènements réseau et bus](#2-évènements-réseau-et-bus) : Ayoub (animation), Ramy (journal, explications), Aziz (topologie)
3. [Interface protocole](#3-interface-protocole) : auteurs de protocoles (Aziz, Ramy, Khalil)
4. [API de commandes et états](#4-api-de-commandes-et-états) : Ramy (`controls.js`), Ayoub (`vrPanel.js`)
5. [Faux moteur](#5-faux-moteur-mock) : tout le monde, dès maintenant
6. [API du pôle ui](#6-api-du-pôle-ui-appui) : Ayoub (sélection en VR)
7. [API du pôle render](#7-api-du-pôle-render-apprender-utilisée-par-les-autres-pôles) : ui et xr

Tout s'importe depuis la façade `simulation.js` à la racine :

```js
import { TOPICS, STATUS, COMMANDS, isBroadcast, validateScenario } from '../../simulation.js';
```

Dans l'application, l'instance du moteur est `app.sim` (créée par `src/sim/index.js`, appelé en premier par `main.js`).

---

## 1. Format des scénarios JSON

Un fichier `scenarios/<protocole>.json` par scénario. Il contient **sa** topologie et **ses** textes : aucun fichier partagé. Exemple complet et validé : [`scenarios/arp.json`](../../scenarios/arp.json).

```jsonc
{
  "schema": 1,                       // version du format (obligatoire)
  "id": "arp",                       // identifiant unique (obligatoire)
  "title": "ARP : trouver l'adresse MAC d'un voisin",   // affiché dans la liste (obligatoire)
  "protocol": "arp",                 // charge src/sim/protocols/arp.js (obligatoire)
  "description": "Rôle du protocole, 2-3 phrases.",     // facultatif
  "params": { "source": "pc1", "target": "pc2" },        // paramètres par défaut, libres, lus par le protocole
  "devices": [ ... ],                // au moins un
  "links": [ ... ],                  // peut être vide
  "steps": [ ... ]                   // au moins une étape expliquée
}
```

### Équipement

```jsonc
{
  "id": "pc1",                       // lettres, chiffres, - ou _ ; unique
  "type": "host",                    // host | server | switch | router
  "label": "PC 1",                   // facultatif : étiquette 3D
  "position": [-3, 0, 1.5],          // facultatif : [x, y, z] dans la scène
  "interfaces": [
    { "name": "eth0", "mac": "02:00:00:00:00:01", "ip": "192.168.1.10/24" }
  ],
  "gateway": "192.168.1.1"           // facultatif (hôtes)
}
```

- `mac` est obligatoire pour `host`, `server` et `router`, facultatif pour `switch`. Une MAC n'appartient qu'à une interface.
- `ip` est au format CIDR (`adresse/préfixe`). Elle peut manquer (client DHCP avant d'obtenir son adresse).
- `routes` (facultatif, tout équipement, surtout les routeurs) : routes statiques `[{ "network": "192.168.3.0/24", "via": "10.0.0.2" }]`. `via` est l'adresse du routeur suivant, dans un réseau connecté. `"0.0.0.0/0"` est une route par défaut. Le validateur vérifie le format (phase 4).
- `services` (facultatif) : ports ouverts de l'équipement, `[{ "name": "dns", "transport": "udp", "port": 53 }]`. Un datagramme UDP ou un segment TCP vers un port non déclaré est rejeté (en UDP, avec l'erreur ICMP « port inaccessible »). Les ports clients sont ouverts automatiquement à l'envoi (phase 4b).
- `dns` (facultatif, hôtes) : adresse du serveur DNS, ex. `"192.168.2.53"`.
- `records` (facultatif, serveur DNS) : enregistrements `[{ "name": "www.ecole.test", "type": "A", "value": "192.168.2.80", "ttl": 300 }]`. Noms fictifs en `.test` (domaine réservé aux essais).
- `dhcp` (facultatif, serveur DHCP) : `{ "start": "192.168.1.100", "end": "192.168.1.110", "prefix": 24, "gateway": "192.168.1.1", "dns": "…", "lease": 86400 }`. Un client DHCP a une interface **sans** `ip`.
- `pages` (facultatif, serveur web) : `[{ "path": "/", "status": 200, "type": "text/html", "size": 2400, "title": "Accueil" }]`. Un chemin absent donne une réponse 404 (phase 4c).
- D'autres champs propres à un protocole sont permis : le validateur les ignore, le protocole les lit.

### Lien

```jsonc
{ "id": "l1", "a": "pc1:eth0", "b": "sw1:p1", "latency": 400 }
```

- `a` et `b` : `"équipement:interface"`. Une interface n'est reliée qu'une fois ; un lien relie deux équipements différents.
- `latency` : facultatif, en ms simulées (400 par défaut, soit 0,4 s à vitesse 1).
- `bandwidth` (phase 5) : facultatif, 10, 100, 1000 ou 10000 (Mb/s).
- `cable` (phase 5) : facultatif, `cuivre-cat5` (100 Mb/s au plus), `cuivre-cat5e`, `cuivre-cat6` (1 Gb/s), `cuivre-cat6a`, `fibre-mm`, `fibre-sm` (10 Gb/s). Liste et longueurs dans `src/sim/catalog.js`.
- Bande passante **effective** d'un lien : la plus petite de `bandwidth`, des vitesses des deux ports et du câble.

### Modèles d'équipements (phase 5)

- `model` (facultatif) sur un équipement : un identifiant du catalogue `src/sim/catalog.js` (`pc-1g`, `srv-1g`, `srv-10g`, `sw-8fe`, `sw-24g`, `sw-48x`, `rt-4g`, `rt-8x`). Modèles **génériques et fictifs** (références inventées), valeurs réalistes. Le type du modèle doit être celui de l'équipement, et l'équipement ne peut pas avoir plus d'interfaces que le modèle n'a de ports.
- `speed` (facultatif) sur une interface : 10, 100, 1000 ou 10000 (Mb/s). Sans elle : la vitesse du port du modèle (les interfaces suivent l'ordre des ports du modèle), sinon 1 Gb/s.

### Échelle de temps et transmission (phase 5)

1 seconde de simulation (à vitesse ×1) représente **1 milliseconde de réseau** (`SLOWDOWN = 1000`, `src/sim/traffic.js`). Une trame occupe le câble pendant (taille + 20 octets de préambule et d'intervalle) × 8 / bande passante ; un port n'émet qu'une trame à la fois, les suivantes attendent dans sa file. Taille d'une trame : en-têtes réels (Ethernet 18, IP 20, UDP 8, TCP 20) + données, 64 octets au minimum (`frameSize`).

### Étape pédagogique

```jsonc
{ "id": "arp-request", "title": "Requête ARP en diffusion", "text": "PC 1 diffuse la question..." }
```

Le protocole affiche une étape avec `ctx.explain('arp-request')` et y rattache ses messages avec `ctx.send(..., { step: 'arp-request' })`.

### Liste des scénarios proposés

`scenarios/index.json` liste, dans l'ordre d'affichage, les identifiants des scénarios terminés : `{ "scenarios": ["arp", "ping", "routage", "ttl", "udp", "dns", "dhcp", "tcp", "http"] }`. Chaque id correspond au fichier `scenarios/<id>.json`, dont le champ `id` doit être identique. Un fichier absent de la liste est une ébauche : il n'est pas proposé dans l'application. Un scénario invalide est écarté au chargement, avec son erreur dans la console, sans bloquer les autres.

### Vérifier son scénario

```js
import { validateScenario } from './simulation.js';
const { ok, errors } = validateScenario(json);   // errors : messages en français, avec le chemin du champ
```

Chaque auteur ajoute dans son test : `assert.deepEqual(validateScenario(monScenario).errors, [])`.

---

## 2. Évènements réseau et bus

Le moteur publie tout sur un bus (patron Observer). On s'abonne avec `app.sim.on(TOPICS.X, listener)`, qui renvoie la fonction de désabonnement.

| Sujet | Quand | Charge utile | Abonnés prévus |
| --- | --- | --- | --- |
| `TOPICS.SCENARIO` | un scénario est chargé | `{ scenario, params }` | render (construire la scène), ui |
| `TOPICS.RESET` | chargement ou réinitialisation | `{ time: 0 }` | animateur, journal, explications : **tout effacer** (pas la topologie) |
| `TOPICS.NETWORK` | envoi, réception, perte | `NetworkEvent` (ci-dessous) | animateur, journal |
| `TOPICS.STEP` | une étape commence | `{ time, step, title, text }` | explications |
| `TOPICS.TICK` | l'horloge simulée avance | `{ time }` | animateur |
| `TOPICS.STATE` | état ou vitesse changent | `SimulationState` (section 4) | contrôles, panneau VR |

Comme `app.sim` est créé avant les autres pôles, le scénario de départ est déjà chargé quand ils s'initialisent : le lire avec `app.sim.getScenario()`, puis s'abonner pour la suite. Un module qui s'abonne après le début d'une lecture (journal, inspecteur) récupère ce qu'il a manqué avec `app.sim.getHistory()` (S2).

### `NetworkEvent` (objet gelé)

```jsonc
{
  "id": 7,                         // croissant dans une exécution
  "time": 400,                     // ms simulées
  "type": "send",                  // send | receive | drop
  "source": "sw1",  "sourceInterface": "p2",
  "destination": "r1", "destinationInterface": "g0",   // null pour une perte sur place
  "link": "l2",
  "arrival": 800,                  // send seulement : instant d'arrivée prévu
  "packet": { ... },               // Packet (ci-dessous)
  "step": "arp-request",           // étape liée, ou null
  "reason": null,                  // drop seulement : "TTL nul", "interface non reliée"...
  "bytes": 1058,                   // send seulement (phase 5) : taille de la trame en octets, null sans mesure
  "transmitted": 412.6             // send seulement (phase 5) : fin de l'émission (time + durée d'émission)
}
```

Pour animer : à un `send`, faire partir le paquet sur `link` de `source` vers `destination`, et le placer à la fraction `(time_courant - event.time) / (event.arrival - event.time)` du trajet, où `time_courant` vient de `TOPICS.TICK`. Le paquet disparaît au `receive` correspondant (même `packet.id`, même `link`). Ainsi pause, pas à pas et vitesse restent cohérents, puisque tout suit l'horloge simulée.

**Plus simple (S2)** : à chaque `TOPICS.TICK`, appeler `app.sim.getPacketsInFlight()`. Le moteur renvoie la liste `{ event, progress }` des paquets actuellement sur un lien, où `progress` va de 0 (départ) à 1 (arrivée). L'animateur n'a alors aucun état à tenir : il place chaque paquet à `progress` le long de `event.link`, et retire ceux qui ne sont plus dans la liste. Après une réinitialisation, la liste est vide.

```js
app.sim.on(TOPICS.TICK, () => {
  for (const { event, progress } of app.sim.getPacketsInFlight()) {
    placePacket(event.packet.id, event.link, event.source, progress); // fonction de l'animateur
  }
});
```

**Garanties testées** (`tests/mock.test.js`) :
- la lecture continue, quelle que soit la durée des images et la vitesse, produit **exactement** la même suite d'évènements que le pas à pas ;
- ordre des messages au chargement : `SCENARIO`, `RESET`, `STATE` ; à chaque pas : `STEP` et `NETWORK` dans l'ordre où le protocole les produit, puis `TICK`, puis `STATE` ; à la réinitialisation : `RESET`, `STATE`.

### `Packet` (objet gelé)

```jsonc
{
  "id": "p3",                      // obligatoire
  "protocol": "arp",               // obligatoire : couleur (packetStyles) et describe()
  "type": "request",               // obligatoire : request, reply, syn, discover...
  "eth": { "src": "02:00:00:00:00:01", "dst": "ff:ff:ff:ff:ff:ff" },   // couche 2, ou null
  "ip": { "src": "192.168.1.10", "dst": "192.168.1.20", "ttl": 64 },   // couche 3, ou null
  "transport": { "protocol": "tcp", "src": 49152, "dst": 80, "flags": ["SYN"] },  // couche 4, ou null ; protocol : "udp" ou "tcp" (phase 4b)
  "data": { }                      // contenu propre au protocole
}
```

`isBroadcast(packet)` indique une diffusion (MAC `ff:ff:ff:ff:ff:ff`) pour lui donner un autre aspect.

Les paquets et évènements sont **gelés** : pour modifier un paquet (TTL, adresses), le protocole en crée un nouveau (`{ ...packet, ip: { ...packet.ip, ttl: packet.ip.ttl - 1 } }`).

---

## 3. Interface protocole

Fichier `src/sim/protocols/<nom>.js`, export par défaut :

```js
import { describeHeaders } from '../protocol.js';

export default {
  name: 'icmp',                               // = nom du fichier = champ "protocol" du scénario

  start(ctx) {                                // appelé à t = 0, à chaque lecture depuis le début
    ctx.explain('icmp-request');
    ctx.send(ctx.params.source, {
      id: ctx.nextPacketId(), protocol: 'icmp', type: 'echo-request',
      eth: { ... }, ip: { ... }, transport: null, data: { seq: 1 },
    }, { step: 'icmp-request' });
  },

  onReceive(device, packet, ctx, meta) {      // meta = { interface, link, from }
    if (packet.type === 'echo-request' && /* c'est pour moi */ true) { /* répondre */ }
  },

  describe(packet) {                          // lignes de l'inspecteur
    return [...describeHeaders(packet), { layer: 'ICMP', field: 'Séquence', value: String(packet.data.seq) }];
  },
};
```

Aucun registre à modifier : le moteur charge le fichier d'après le champ `protocol` du scénario. Un protocole peut en importer un autre (HTTP importe DNS et TCP).

### Ce que le moteur fournit : `ctx`

| Membre | Rôle |
| --- | --- |
| `ctx.scenario` | scénario chargé (lecture seule) |
| `ctx.params` | `scenario.params` complété par les paramètres passés à `load()` (ex. hôtes choisis par l'utilisateur) |
| `ctx.now()` | instant simulé (ms) |
| `ctx.device(id)` | équipement du scénario (erreur s'il n'existe pas) |
| `ctx.memory(deviceId)` | objet modifiable propre à l'équipement : cache ARP, baux DHCP, état TCP... Vidé à chaque réinitialisation |
| `ctx.send(deviceId, packet, { interface?, step?, delay?, lost? })` | émet par l'interface donnée, ou par la seule interface reliée. La trame attend son tour dans la file du port, part (`send`, avec `bytes` et `transmitted`), puis arrive (`receive`) après sa durée d'émission et la latence du lien, et `onReceive` est appelé sur l'équipement d'en face. `lost` (texte) : perte simulée, la trame part puis disparaît à mi-câble (`drop`) |
| `ctx.drop(deviceId, packet, reason, { step? })` | publie une perte |
| `ctx.explain(stepId)` | publie l'étape `stepId` de `scenario.steps` (erreur si elle n'existe pas) |
| `ctx.schedule(delay, action)` | exécute `action` après `delay` ms simulées (délais de traitement, temporisations). **Renvoie une fonction d'annulation** (S2) : `const cancel = ctx.schedule(3000, retransmettre); … cancel();` quand l'ACK arrive |
| `ctx.nextPacketId()` | `'p1'`, `'p2'`... |

### Règles

- Le protocole n'agit **que** par `ctx` : ni `setTimeout`, ni `Date.now()`, ni DOM, ni Three.js. Il est donc déterministe et testable sous Node.
- `describe(packet)` renvoie un tableau `{ layer, field, value }` de chaînes. L'inspecteur l'affiche sans connaître le protocole, avec `app.sim.describe(packet)`, qui choisit le bon protocole d'après `packet.protocol`.
- Comportements d'équipements (phase 4, `src/sim/devices/`) : `switch.js`, `host.js` (aussi pour `server`) et `router.js` sont appelés **avant** le protocole à chaque réception. S'ils renvoient `true`, le paquet est traité et le protocole n'est pas appelé. Ils traitent tout ce qui ne dépend pas du scénario :
  - **switch** : table MAC apprise, inondation (diffusion ou MAC inconnue), transmission par le seul bon port, filtrage ; renvoie toujours `true` ;
  - **hôte / serveur** : ignore les trames pour une autre MAC ; ARP ; rejette un paquet IP pour une autre adresse (sauf la diffusion `255.255.255.255`) ; rejette UDP/TCP vers un port fermé (ICMP « port inaccessible » en UDP, segment RST en TCP, rien pour une diffusion) ; répond aux pings ; laisse le reste au protocole ;
  - **routeur** : ARP pour l'adresse de l'interface interrogée ; répond aux pings qui lui sont adressés ; ne fait jamais suivre une diffusion `255.255.255.255` ; fait suivre les autres paquets (TTL − 1, route la plus précise, ARP du saut suivant) ; à TTL 0 ou sans route, perte et erreur ICMP (`time-exceeded`, `unreachable`) renvoyée à l'émetteur.
- **Pile commune** (`src/sim/stack.js`, `src/sim/net.js`) à utiliser par les protocoles :
  - `sendIp(ctx, deviceId, { protocol, type, ip: { dst, src?, ttl? }, transport?, data? }, { step?, interface? })` route le paquet, fait l'ARP si besoin, puis l'émet ; vers `255.255.255.255` (diffusion limitée), ni route ni ARP : trame de diffusion sur le réseau local ;
  - `sendUdp(ctx, deviceId, { protocol, type, dst, dstPort, srcPort?, src?, data? }, options)` ouvre le port source (éphémère à partir de 49152 si absent) puis envoie ; `protocol` est le protocole applicatif (`dns`, `dhcp`…) ;
  - `runtimeDevice(ctx, device)` : l'équipement avec la configuration obtenue pendant l'exécution ; `configureDevice(ctx, id, { interface, ip, gateway?, dns? })` l'applique (DHCP). Le scénario n'est jamais modifié ;
  - `isPortOpen`, `openPort`, `resolveMac`, `explainOnce(ctx, [ids])`, `lookupRoute(device, ip)`, `routingTable(device)`, `primaryIp(device)` ;
  - DNS pour les autres protocoles : `resolveName(ctx, deviceId, name, { onResolved(ip, { cached }), onFailed(reason) })` et `handleDns(ctx, device, packet)` dans `protocols/dns.js` ;
  - TCP pour les autres protocoles (`protocols/tcp.js`) : `connect(ctx, clientId, { dstIp, dstPort, protocol?, onEstablished(conn), onMessage(conn, msg), onClosed(conn), onFailed(reason) })` ; `handleTcp(ctx, device, packet, listener)` à appeler depuis `onReceive`, avec `listener = { protocol?, onAccept?, onMessage?, onClosed? }` pour un serveur ; `conn.send({ size, … }, { protocol, type, step? })` découpe le message en segments de 1000 octets (MSS) ; `conn.close()` ferme une fois tout acquitté. Segments : `transport = { protocol: 'tcp', src, dst, flags, seq, ack, window }`, `data = { length, part, parts, message }`. Simplifications : numéros initiaux fixes (1000 client, 5000 serveur), une seule temporisation de retransmission par connexion (RTO, `params.rto`), pas de contrôle de congestion ni de TIME_WAIT. Perte simulée : `params.loseSegment` (numéro du segment de données de `params.loseFrom`, client par défaut).

### Étapes standard

La pile et les équipements annoncent chaque action par une liste d'identifiants d'étapes, du plus précis au plus général. Seule la première présente dans `scenario.steps` est expliquée, **une fois par exécution** ; les messages envoyés y sont rattachés (`event.step`). Le scénario choisit donc ce qu'il explique, sans code. `<eq>` est l'id d'un équipement, `<n>` un numéro de séquence.

| Identifiants | Moment |
| --- | --- |
| `arp-cache-miss[-<eq>]`, `arp-request[-<eq>]` | adresse MAC inconnue, requête ARP diffusée |
| `arp-reply[-<eq>]`, `arp-ignore[-<eq>]` | réponse de la cible ; requête ignorée par un autre équipement |
| `arp-cache-update[-<eq>]`, `arp-timeout[-<eq>]` | réponse reçue et mise en cache ; pas de réponse après 3 s |
| `arp-done`, `arp-failed` | fin du scénario ARP |
| `switch-learn[-<eq>]`, `switch-flood[-<eq>]`, `<protocole>-flood`, `switch-forward[-<eq>]`, `<protocole>-switch-forward` | table MAC, inondation, transmission |
| `route-direct[-<eq>]`, `route-gateway[-<eq>]`, `no-route[-<eq>]` | décision de l'émetteur : même réseau, passerelle, aucune route |
| `host-not-for-me[-<eq>]` | paquet IP rejeté par un hôte |
| `router-forward[-<eq>]`, `router-ttl[-<eq>]`, `router-no-route[-<eq>]` | routeur : transmission, TTL expiré, pas de route |
| `icmp-start`, `icmp-request[-<n>]`, `icmp-reply[-<eq>]`, `icmp-reply-received[-<n>]`, `icmp-timeout[-<n>]`, `icmp-time-exceeded`, `icmp-unreachable`, `icmp-summary`, `icmp-summary-loss` | ping |
| `udp-port-closed[-<eq>]`, `tcp-port-closed[-<eq>]` | port fermé sur le destinataire (pile) |
| `udp-start`, `udp-send[-<n>]`, `udp-send-closed`, `udp-delivered[-<n>]`, `udp-icmp-received`, `udp-summary` | scénario UDP |
| `dns-start`, `dns-query[-<n>]`, `dns-answer[-<eq>]`, `dns-answer-nxdomain[-<eq>]`, `dns-response[-<n>]`, `dns-cache-hit[-<n>]`, `dns-nxdomain[-<n>]`, `dns-timeout[-<n>]`, `dns-no-server`, `dns-summary` | DNS |
| `tcp-start`, `tcp-syn[-<eq>]`, `tcp-syn-ack[-<eq>]`, `tcp-established[-<eq>]`, `tcp-accepted[-<eq>]`, `tcp-data[-<n>]` ou `tcp-data-<client\|server>-<n>`, `tcp-lost[-<n>]`, `tcp-ack[-<eq>]`, `tcp-out-of-order[-<eq>]`, `tcp-dup-ack[-<eq>]`, `tcp-retransmit[-<n>]`, `tcp-cumulative-ack[-<eq>]`, `tcp-delivered[-<eq>]`, `tcp-fin[-<eq>]`, `tcp-fin-ack[-<eq>]`, `tcp-last-ack[-<eq>]`, `tcp-closed[-<eq>]`, `tcp-rst[-<eq>]`, `tcp-connect-closed`, `tcp-refused`, `tcp-failed`, `tcp-summary` | TCP (`<n>` : numéro du segment de données) |
| `http-start`, `http-dns`, `http-dns-done`, `http-dns-failed`, `http-connect`, `http-request[-<n>]`, `http-response[-<code>]`, `http-received[-<n>]`, `http-not-found[-<n>]`, `http-close`, `http-failed`, `http-summary` | HTTP (`<n>` : rang de l'URL) |
| `dhcp-start`, `dhcp-discover[-<eq>]`, `dhcp-offer[-<eq>]`, `dhcp-request[-<eq>]`, `dhcp-ack[-<eq>]`, `dhcp-configured[-<eq>]`, `dhcp-verify[-<eq>]`, `dhcp-verified[-<eq>]`, `dhcp-pool-empty`, `dhcp-summary` | DHCP |
- Chaque protocole a un test de sa séquence de messages (définition de « terminé »). Le test `tests/protocol.test.js` vérifie automatiquement que chaque fichier respecte l'interface.

---

## 4. API de commandes et états

```js
const sim = app.sim;
await sim.load(scenario, { source: 'pc1', target: 'pc3' });  // params facultatifs
sim.play();  sim.pause();  sim.step();  sim.reset();
sim.setSpeed(2);             // borné entre MIN_SPEED (0,25) et MAX_SPEED (4)
sim.getState();              // { status, time, speed, scenarioId, pending, error }
sim.getScenario();
sim.isAllowed('pause');      // activer / désactiver un bouton
sim.describe(packet);        // lignes de l'inspecteur
sim.getHistory();            // évènements réseau depuis la dernière réinitialisation (S2)
sim.getPacketsInFlight();    // [{ event, progress }] : paquets sur les liens maintenant (S2)
sim.on(TOPICS.STATE, (state) => { /* rafraîchir les boutons */ });
sim.tick(deltaMs);           // avance la lecture d'une image, depuis la boucle de rendu (voir ci-dessous)
```

Une commande non permise renvoie `false` sans exception : un clic au mauvais moment ne casse rien.

### États (patron State)

| État | Signification | Commandes permises |
| --- | --- | --- |
| `idle` | aucun scénario | load, setSpeed |
| `ready` | chargé, horloge à 0 | load, play, step, setSpeed, reset |
| `playing` | lecture continue | load, pause, setSpeed, reset |
| `paused` | arrêt sur image | load, play, step, setSpeed, reset |
| `finished` | plus rien à jouer | load, setSpeed, reset |

- **Pas à pas** saute au prochain instant où il se passe quelque chose et joue tout ce qui s'y passe (par exemple une réception et le renvoi qui suit). Il mène à `paused`, ou à `finished` s'il ne reste rien.
- **Lecture** : à chaque image, l'horloge simulée avance de *durée réelle de l'image × vitesse*. Le moteur ne dépend pas du nombre d'images par seconde.
- **Source du temps réel** : la boucle de rendu (`renderer.setAnimationLoop`) appelle `sim.tick(deltaMs)` à chaque image, en mode classique comme en session VR. C'est nécessaire en VR, où le `requestAnimationFrame` de la fenêtre est suspendu. Une durée supérieure à `MAX_FRAME_DELTA` (100 ms) est bornée. Si personne n'appelle `tick()` pendant `EXTERNAL_TICK_TIMEOUT` (250 ms) — rendu en panne, tests sous Node — l'horloge interne du moteur prend le relais : le temps n'avance jamais deux fois pour la même image.
- **Réinitialiser** vide tout et rejoue le scénario depuis t = 0 : même séquence, à l'identique.
- Si un protocole lève une erreur, la lecture passe en `paused` et `getState().error` contient le message ; l'application continue de fonctionner.

---

### Choix du scénario (phase 4)

`app.sim` (créé par `src/sim/index.js`) ajoute à l'API ci-dessus :

| Membre | Rôle |
| --- | --- |
| `listScenarios()` → `[{ id, title, protocol, description }]` | scénarios de `scenarios/index.json`, dans l'ordre |
| `loadScenario(id, params?)` → promesse de booléen | charge le scénario (comme `load`) ; `false` si l'id est inconnu |
| `getTraffic()` (phase 5) | `{ time, links, ports, devices }` : par lien `{ bandwidth, cable, ab, ba, utilization }` (sens a→b et b→a), par port `"équipement:interface"` `{ speed, negotiated, linked, link, peer, tx, rx, utilization }`, par équipement `{ current, average, bandwidth, utilization }`. Chaque mesure `{ current, average, bytes, utilization }` : débit instantané (fenêtre de 1 ms de réseau) et moyen en Mb/s, utilisation de 0 à 1 |
| `timeScale` | 1000 : 1 ms de simulation = 1 µs de réseau |

## 5. Faux moteur (mock)

Depuis la phase 4, `app.sim` est le vrai moteur. Le faux moteur ne sert plus qu'aux tests des autres pôles et de **repli** : si aucun scénario de `scenarios/index.json` ne peut être lu, `init` charge la démonstration (`app.sim.mock === true`, `listScenarios()` ne contient que `demo`).

Le faux moteur (`app.sim.mock === true`) : c'est le vrai contrôleur, mais avec un protocole « demo » qui fait faire un aller-retour à un paquet entre `params.source` et `params.target` sur **n'importe quelle** topologie valide. Les routeurs décrémentent le TTL et les étapes du scénario s'affichent dans l'ordre.

Au démarrage, il charge `DEMO_SCENARIO` (deux réseaux reliés par un routeur, voir `src/sim/mock.js`). On peut lui donner n'importe quel scénario :

```js
const json = await (await fetch('./scenarios/arp.json')).json();
await app.sim.load(json);
app.sim.play();
```

L'API est la même que celle du vrai moteur : les autres pôles n'ont rien eu à modifier au passage de la phase 4.

## 6. API du pôle ui (`app.ui`)

Valeur renvoyée par `init(app)` de `src/ui/index.js`, utilisable par le pôle xr.

| Membre | Rôle |
| --- | --- |
| `mountPoints` | id des points de montage de `index.html` |
| `select(id)` → booléen | sélectionne un équipement (après un lancer de rayon en VR) ; `false` si l'id est inconnu |
| `clear()` → booléen | retire la sélection |
| `getSelection()` | id de l'équipement sélectionné, ou `null` |
| `onChange(listener)` → désabonnement | `listener(id, précédent)` à chaque changement de sélection |
| `modules` | API de chaque module monté : `scenarioPicker`, `controls`, `inspector`, `explanations`, `install` |
| `modules.install` | `getView()` → `{ showButton, buttonTitle, offline, message }`, `install()` → `'accepted' \| 'dismissed' \| 'failed' \| 'unavailable'` |
| `packets` (phase 4d) | paquet sélectionné, désigné par l'id de son évènement d'envoi : `select(eventId)` → booléen (id présent dans `app.sim.getHistory()`), `clear()`, `get()`, `onChange(listener)`. Effacé à chaque réinitialisation et changement de scénario ; met le paquet en avant dans la scène (`app.render.highlightPacket`) |
| `modules.explanations` | `getView()` → `{ heading, title, text, time, hint }` (étape en cours), `getLog()` → lignes du journal `{ eventId, kind, time, label, route, protocol, broadcast, reason }` |
| `modules.inspector` | `getView()` (équipement sélectionné, avec `sheet` : fiche de `src/ui/datasheet.js`, mise à jour en direct), `getPacketView()` → `{ eventId, title, meta, layers }` ou `null` (paquet sélectionné) |

## 7. API du pôle render (`app.render`) utilisée par les autres pôles

| Membre | Rôle |
| --- | --- |
| `loadTopology(scénario)` | construit la scène à partir d'un scénario |
| `getDevice(id)`, `listDevices()` | équipements affichés (forme simplifiée : `id`, `type`, `label`, `ip`, `mac`, `position`) |
| `highlightDevice(id, mode)` | `'selected'`, `'active'`, `'error'` ou `'normal'` |
| `pickDevice(origin, direction)` → id ou `null` | lancer de rayon en coordonnées monde |
| `pickDeviceHit(origin, direction, { tolerance })` → `{ id, point, distance }` ou `null` | idem, avec le point visé. `tolerance` (unités de la topologie) accepte un équipement ou une étiquette proche du rayon : visée à la manette |
| `onFrame(listener)` → désabonnement | `listener({ time, delta, xrFrame, referenceSpace, presenting })` à chaque image de la boucle d'animation unique ; `xrFrame` et `referenceSpace` valent `null` hors session VR |
| `startXR(session)` → promesse, `isPresenting()` | affichage en WebGPU dans une session WebXR ouverte par le pôle xr : `XRGPUBinding` du navigateur, ou pont de l'émulateur (`src/render/xrBridge.js`). La promesse est rejetée si le navigateur ne permet pas la VR en WebGPU |
| `xrSessionFeatures()` | fonctionnalités de session à demander en plus : `['webgpu']` |
| `getRenderer()`, `getReferenceSpace()` | le `WebGPURenderer` de la scène (le même toute la vie de la page) et l'espace de référence de la session (`null` hors VR) |
| `getRenderingInfo()` → `{ classic, xr }` | rendu réellement utilisé : `classic` vaut `'WebGPU'` ; `xr` vaut `{ backend: 'WebGPU', path: 'natif' \| 'pont émulateur' }` pendant une session, sinon `null` |
| `getVRAnchor()` → `{ x, y, z, width, depth }` ou `null` | centre et taille (m) de la maquette pendant une session VR ; les panneaux VR s'y accrochent |
| `packetStyle(protocol, broadcast?)` → `{ color, radius }` | couleur (`'#rrggbb'`) et taille d'un paquet, une couleur par protocole (`src/render/packetStyles.js`) ; le journal de l'interface utilise les mêmes |
| `highlightPacket(eventId)` | met en avant (plus gros) le paquet en vol de cet évènement d'envoi ; `null` : aucun |
| `setLinkLoads({ idLien: utilisation })` (phase 5) | couleur des liens selon leur charge : bleu au repos, vert < 50 %, orange 50 à 80 %, rouge ≥ 80 %. Appelé par le pôle render lui-même 4 fois par seconde d'après `app.sim.getTraffic()` |
| `scene`, `world`, `camera` | objets Three.js : `scene` est dans l'espace de référence WebXR (mètres), `world` porte la topologie mise à l'échelle |

`initScene(container, options)` est **asynchrone** depuis la phase 2 (`WebGPURenderer` s'initialise avant le premier rendu) ; `init(app)` du pôle render l'attend. Sans WebGPU, `initScene` lève `WebGPUUnavailableError` : `init(app)` affiche « WebGPU requis » et renvoie `{ available: false, reason }` (pas de repli WebGL).

Sur `#scene`, le rendu émet `topology:device-selected` (`detail: { id, device }`) à chaque clic ou toucher sur un équipement, et `topology:packet-selected` (`detail: { eventId, packetId }`) sur un paquet en vol (prioritaire sur l'équipement derrière lui).

## Tests

`node --test` lance tous les tests. Ceux du pôle simulation : `tests/engine.test.js`, `events.test.js`, `scenario.test.js`, `state.test.js`, `commands.test.js`, `protocol.test.js`, `mock.test.js`.
