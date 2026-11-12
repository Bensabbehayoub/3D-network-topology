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
- D'autres champs propres à un protocole sont permis (ex. `routes` d'un routeur en S5, `pool` d'un serveur DHCP) : le validateur les ignore, le protocole les lit.

### Lien

```jsonc
{ "id": "l1", "a": "pc1:eth0", "b": "sw1:p1", "latency": 400 }
```

- `a` et `b` : `"équipement:interface"`. Une interface n'est reliée qu'une fois ; un lien relie deux équipements différents.
- `latency` : facultatif, en ms simulées (400 par défaut, soit 0,4 s à vitesse 1).

### Étape pédagogique

```jsonc
{ "id": "arp-request", "title": "Requête ARP en diffusion", "text": "PC 1 diffuse la question..." }
```

Le protocole affiche une étape avec `ctx.explain('arp-request')` et y rattache ses messages avec `ctx.send(..., { step: 'arp-request' })`.

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
  "reason": null                   // drop seulement : "TTL nul", "interface non reliée"...
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
  "transport": { "src": 49152, "dst": 80, "flags": ["SYN"] },          // couche 4, ou null
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
| `ctx.send(deviceId, packet, { interface?, step?, delay? })` | émet par l'interface donnée, ou par la seule interface reliée. Publie `send`, puis `receive` après la latence du lien, puis appelle `onReceive` sur l'équipement d'en face |
| `ctx.drop(deviceId, packet, reason, { step? })` | publie une perte |
| `ctx.explain(stepId)` | publie l'étape `stepId` de `scenario.steps` (erreur si elle n'existe pas) |
| `ctx.schedule(delay, action)` | exécute `action` après `delay` ms simulées (délais de traitement, temporisations). **Renvoie une fonction d'annulation** (S2) : `const cancel = ctx.schedule(3000, retransmettre); … cancel();` quand l'ACK arrive |
| `ctx.nextPacketId()` | `'p1'`, `'p2'`... |

### Règles

- Le protocole n'agit **que** par `ctx` : ni `setTimeout`, ni `Date.now()`, ni DOM, ni Three.js. Il est donc déterministe et testable sous Node.
- `describe(packet)` renvoie un tableau `{ layer, field, value }` de chaînes. L'inspecteur l'affiche sans connaître le protocole, avec `app.sim.describe(packet)`, qui choisit le bon protocole d'après `packet.protocol`.
- Comportements d'équipements (S3) : `switch.js`, `host.js` et `router.js` sont appelés **avant** le protocole à chaque réception. S'ils renvoient `true`, le paquet est traité (ex. le switch commute la trame) et le protocole n'est pas appelé.
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

## 5. Faux moteur (mock)

En S1, `app.sim` est un faux moteur (`app.sim.mock === true`) : c'est le vrai contrôleur, mais avec un protocole « demo » qui fait faire un aller-retour à un paquet entre `params.source` et `params.target` sur **n'importe quelle** topologie valide. Les routeurs décrémentent le TTL et les étapes du scénario s'affichent dans l'ordre.

Au démarrage, il charge `DEMO_SCENARIO` (deux réseaux reliés par un routeur, voir `src/sim/mock.js`). On peut lui donner n'importe quel scénario :

```js
const json = await (await fetch('./scenarios/arp.json')).json();
await app.sim.load(json);
app.sim.play();
```

En S2-S3, `src/sim/index.js` passera au vrai moteur. L'API ne changera pas, les autres pôles n'auront rien à modifier.

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
| `scene`, `world`, `camera` | objets Three.js : `scene` est dans l'espace de référence WebXR (mètres), `world` porte la topologie mise à l'échelle |

`initScene(container, options)` est **asynchrone** depuis la phase 2 (`WebGPURenderer` s'initialise avant le premier rendu) ; `init(app)` du pôle render l'attend. Sans WebGPU, `initScene` lève `WebGPUUnavailableError` : `init(app)` affiche « WebGPU requis » et renvoie `{ available: false, reason }` (pas de repli WebGL).

Sur `#scene`, le rendu émet `topology:device-selected` (`detail: { id, device }`) à chaque clic ou toucher sur un équipement.

## Tests

`node --test` lance tous les tests. Ceux du pôle simulation : `tests/engine.test.js`, `events.test.js`, `scenario.test.js`, `state.test.js`, `commands.test.js`, `protocol.test.js`, `mock.test.js`.
