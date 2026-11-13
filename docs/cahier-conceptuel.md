# Cahier conceptuel

Assemblé par Ramy. Version S1 : besoins, cas d'utilisation, maquettes, contrats. Version finale (refonte, phase 9a, 13 novembre 2026) : cas d'utilisation complétés, diagrammes de déploiement, de séquence, d'états et de classes établis d'après le code.

| Livrable (cahier des charges §4) | État | Où |
| --- | --- | --- |
| Besoins fonctionnels F01–F10 | ✅ S1, états mis à jour | [section 1](#1-besoins) |
| Maquettes de l'interface (PC et mobile) | ✅ S1 (Ramy) ; captures finales | [section 3](#3-maquettes-et-interface-réalisée) |
| Diagramme de cas d'utilisation | ✅ S1 (Ramy), complété en 9a | [section 2](#2-cas-dutilisation), [`conception/cas-utilisation.md`](conception/cas-utilisation.md) |
| Diagramme de déploiement | ✅ S1 (provisoire), final en 9a | [section 4](#4-déploiement), [`architecture.md` §3](architecture.md#3-déploiement) |
| Diagramme de séquence du ping | ✅ 9a, relevé sur le moteur | [section 5](#5-séquence-du-ping) |
| Diagramme d'états de la simulation | ✅ 9a | [section 6](#6-états-de-la-simulation) |
| Diagramme de classes | ✅ 9a | [section 7](#7-classes) |
| Contrats entre modules | ✅ S1 (Khalil), tenus à jour à chaque phase | [`simulation/contrats.md`](simulation/contrats.md) |
| Choix du moteur de rendu | ✅ S1 (Ayoub), refait en phase 2 (100 % WebGPU) | [`decision-renderer.md`](decision-renderer.md) |

## 1. Besoins

**Utilisateurs.** Primaires : étudiants du cycle ingénieur qui étudient les réseaux. Secondaires : enseignants (cours et TD). Évaluation : superviseur et jury.

**Besoin pédagogique.** Chaque scénario présente le rôle du protocole, les équipements impliqués, la succession des messages et leur interprétation. Le projet simule les échanges pour apprendre ; il ne reproduit pas une pile réseau complète (simplifications indiquées dans les [fiches des protocoles](protocoles/)).

**Besoin d'accès.** URL HTTPS sans configuration ; installation PWA facultative ; utilisation hors ligne après un premier chargement ; mode classique (souris, tactile) et mode VR (WebXR, émulable).

| Réf. | Fonctionnalité | Priorité | Cas d'utilisation | État |
| --- | --- | --- | --- | --- |
| F01 | Charger une topologie JSON et l'explorer en 3D | Essentiel | UC04, UC05, UC06, UC17, UC20 | ✅ |
| F02 | Animations et explications étape par étape | Essentiel | UC07, UC10 | ✅ |
| F03 | ARP, ICMP, DNS, DHCP, TCP, UDP | Prioritaire | UC07, UC08 | ✅ |
| F04 | HTTP, routage statique (VLAN si le temps le permet) | Progressif | UC07 | ✅ HTTP et routage ; VLAN non réalisé |
| F05 | Inspection des paquets | Essentiel | UC11 | ✅ |
| F06 | Lecture, pause, pas à pas, vitesse, réinitialisation | Essentiel | UC09 | ✅ |
| F07 | Accès par URL, PWA, cache | Essentiel | UC01, UC02, UC03 | ✅ |
| F08 | Mode classique et VR WebXR | Essentiel | UC04, UC12, UC13 | ✅ |
| F09 | Extensions (IPv6, TLS, OSPF…) | Extension | UC07 | Non réalisé |
| F10 | AR par hit testing | Option | UC14 | Non réalisé |
| — | Caractéristiques des équipements et débit (demande du superviseur) | Refonte | UC15 | ✅ |
| — | Diagnostic et recommandations (demande du superviseur) | Refonte | UC16 | ✅ |
| — | Éditeur de topologie (demande du superviseur) | Refonte | UC17 à UC20 | ✅ |
| — | Vérification HTTPS et TLS du site (demande du superviseur) | Refonte | UC21 | ✅ |

## 2. Cas d'utilisation

Le diagramme de S1 (UC01 à UC14) reste valable :

![Diagramme de cas d'utilisation, S1](conception/cas-utilisation.svg)

Cas ajoutés par la refonte :

```mermaid
flowchart LR
    E(["👤 Étudiant / Enseignant"])
    CI(["⚙️ GitHub Actions"])
    subgraph app["3D Network Topology"]
      UC05(["UC05 Sélectionner un équipement"])
      UC07(["UC07 Lancer la simulation"])
      UC15(["UC15 Consulter la fiche<br/>et le débit d'un équipement"])
      UC16(["UC16 Lire les recommandations<br/>et voir le problème"])
      UC17(["UC17 Construire une topologie"])
      UC18(["UC18 Configurer un équipement"])
      UC19(["UC19 Jouer sa topologie"])
      UC20(["UC20 Enregistrer, exporter,<br/>importer"])
      UC21(["UC21 Vérifier HTTPS et TLS"])
    end
    E --- UC15 & UC16 & UC17 & UC20
    CI --- UC21
    UC15 -. "«extend»" .-> UC05
    UC16 -. "«include»" .-> UC05
    UC18 -. "«extend»" .-> UC17
    UC19 -. "«extend»" .-> UC17
    UC19 -. "«include»" .-> UC07
    UC20 -. "«extend»" .-> UC17
```

Description de tous les cas (UC01 à UC21) et correspondance avec le plan de démonstration : [`conception/cas-utilisation.md`](conception/cas-utilisation.md).

## 3. Maquettes et interface réalisée

Maquettes de S1 :

| PC | Mobile |
| --- | --- |
| ![Maquette PC](conception/maquette.svg) | ![Maquette mobile](conception/maquette-mobile.svg) |

Interface réalisée (la disposition des maquettes est conservée : scène au centre, barre de lecture dessous, inspecteur et explications à droite, colonne unique sur mobile) :

| PC | Mobile |
| --- | --- |
| ![Interface réalisée sur PC](captures/explorer-ping.jpg) | ![Interface réalisée sur mobile](captures/mobile.jpg) |

## 4. Déploiement

Diagramme final et explications : [`architecture.md` §3](architecture.md#3-déploiement). En résumé : le dépôt est testé puis publié par GitHub Actions sur GitHub Pages (HTTPS) ; le navigateur charge des fichiers statiques, les met en cache par le Service Worker, affiche la scène en WebGPU et ouvre la session VR par la WebXR Device API (casque réel ou Immersive Web Emulator) ; les topologies construites restent dans le navigateur.

## 5. Séquence du ping

Scénario `ping.json` : PC 1 (192.168.1.10/24) → Switch 1 → Routeur (g0 192.168.1.1, g1 192.168.2.1) → Switch 2 → PC 2 (192.168.2.20/24). Séquence **relevée en exécutant le moteur** (un seul ping, caches ARP vides). Chaque message met environ 400 ms simulées par câble.

```mermaid
sequenceDiagram
    autonumber
    actor U as Étudiant
    participant UI as Interface
    participant PC1 as PC 1<br/>192.168.1.10
    participant SW1 as Switch 1
    participant R as Routeur<br/>g0 .1.1 / g1 .2.1
    participant SW2 as Switch 2
    participant PC2 as PC 2<br/>192.168.2.20

    U->>UI: choisit « Ping », Lecture
    UI->>PC1: sim.play() — étape icmp-start
    Note over PC1: 192.168.2.20 hors de 192.168.1.0/24<br/>→ passerelle 192.168.1.1 (route-gateway)<br/>MAC inconnue → ARP
    PC1->>SW1: ARP request « qui a 192.168.1.1 ? »<br/>MAC dest. ff:ff:ff:ff:ff:ff
    Note over SW1: apprend la MAC de PC 1 sur p1,<br/>inonde la diffusion
    SW1->>R: ARP request (diffusion)
    R->>SW1: ARP reply « 192.168.1.1 est 02:…:a0 »
    SW1->>PC1: ARP reply (port appris)
    Note over PC1: cache ARP mis à jour
    PC1->>SW1: ICMP echo-request, TTL 64<br/>MAC dest. = routeur
    SW1->>R: ICMP echo-request
    Note over R: route directe 192.168.2.0/24 via g1<br/>TTL 64 → 63, MAC de PC 2 inconnue
    R->>SW2: ARP request « qui a 192.168.2.20 ? »
    SW2->>PC2: ARP request (diffusion)
    PC2->>SW2: ARP reply « 192.168.2.20 est 02:…:20 »
    SW2->>R: ARP reply
    R->>SW2: ICMP echo-request, TTL 63
    SW2->>PC2: ICMP echo-request
    Note over PC2: a appris la MAC du routeur<br/>par sa requête ARP : pas de nouvel ARP
    PC2->>SW2: ICMP echo-reply, TTL 64
    SW2->>R: ICMP echo-reply
    R->>SW1: ICMP echo-reply, TTL 63 (cache ARP déjà rempli)
    SW1->>PC1: ICMP echo-reply
    PC1-->>UI: icmp-reply-received, icmp-summary<br/>explication, journal, inspecteur
```

Les étapes expliquées dans l'ordre : `icmp-start`, `icmp-request-1`, `route-gateway`, `arp-request-pc1`, `arp-reply-r1`, `arp-cache-update-pc1`, `router-forward-r1`, `arp-request-r1`, `arp-reply-pc2`, `icmp-reply-pc2`, `icmp-reply-received-1`, `icmp-summary`. Le scénario fourni envoie deux pings : le second ne fait plus d'ARP (caches remplis), ce que l'explication fait remarquer.

## 6. États de la simulation

Patron State (`src/sim/state.js`) : une commande non permise renvoie `false` et le bouton correspondant est désactivé, en 2D comme sur le pupitre VR.

```mermaid
stateDiagram-v2
    [*] --> idle
    idle --> ready: load
    ready --> playing: play
    ready --> paused: step
    playing --> paused: pause
    paused --> playing: play
    paused --> paused: step
    playing --> finished: plus rien à jouer
    paused --> finished: step (dernier évènement)
    playing --> ready: reset
    paused --> ready: reset
    finished --> ready: reset
    ready --> ready: load (autre scénario)
    playing --> ready: load
    paused --> ready: load
    finished --> ready: load
    playing --> paused: erreur d'un protocole
```

## 7. Classes

Le code est écrit en modules ES avec des **fonctions de fabrique** (`createSimulation`, `createBus`, `createTrafficMeter`…) plutôt qu'avec le mot-clé `class` : chaque « classe » du diagramme est l'objet renvoyé par sa fabrique, ou un format de données (scénario, paquet, évènement) validé par une fonction. Les noms de méthodes sont ceux du code.

### Simulation

```mermaid
classDiagram
    direction LR
    class Simulation {
      <<app.sim>>
      +load(scenario, params)
      +loadScenario(id)
      +listScenarios()
      +play() pause() step() reset()
      +setSpeed(speed)
      +tick(deltaMs)
      +getState() SimulationState
      +getHistory() NetworkEvent[]
      +getPacketsInFlight()
      +getTraffic()
      +diagnose() Problem[]
      +setCustomScenario(scenario)
      +describe(packet)
      +on(topic, listener)
    }
    class Engine {
      +now()
      +schedule(time, action) number
      +cancel(id)
      +advanceTo(time)
      +nextTime()
    }
    class Bus {
      <<Observer>>
      +on(topic, listener)
      +emit(topic, payload)
    }
    class StateMachine {
      <<State>>
      +isAllowed(command, status)
      +nextStatus(status, command)
    }
    class Ctx {
      +scenario
      +params
      +now()
      +device(id)
      +memory(deviceId)
      +send(deviceId, packet, options)
      +drop(deviceId, packet, reason)
      +explain(stepId)
      +schedule(delay, action) cancel
    }
    class Protocol {
      <<interface Strategy>>
      +name
      +start(ctx)
      +onReceive(device, packet, ctx, meta)
      +describe(packet)
    }
    class DeviceBehaviour {
      <<interface Strategy>>
      +type
      +onReceive(device, packet, ctx, meta) bool
    }
    class Stack {
      <<stack.js, net.js>>
      +sendIp(ctx, id, packet)
      +sendUdp(ctx, id, datagram)
      +resolveMac()
      +lookupRoute(device, ip)
      +runtimeDevice(ctx, device)
      +configureDevice(ctx, id, config)
    }
    class TrafficMeter {
      +add(event)
      +snapshot(scenario, now)
      +reset()
    }
    class Scenario {
      <<JSON>>
      +id title protocol
      +devices: Device[]
      +links: Link[]
      +params
      +steps: Step[]
    }
    class Device {
      +id type label model
      +interfaces: Interface[]
      +gateway dns routes services
    }
    class Link {
      +id a b
      +cable bandwidth latency
    }
    class NetworkEvent {
      <<gelé>>
      +id type time
      +source destination link
      +packet: Packet
      +bytes transmitted step
    }
    class Packet {
      <<gelé>>
      +id protocol type
      +eth ip transport data
    }
    class Diagnostics {
      +diagnose(scenario, traffic) Problem[]
    }
    class Builder {
      <<fonctions pures>>
      +addDevice() connect() moveDevice()
      +setAddress() setGateway() setRole()
      +validateRun() assembleRun()
    }

    Simulation *-- Engine
    Simulation *-- Bus
    Simulation ..> StateMachine
    Simulation *-- TrafficMeter
    Simulation o-- Scenario
    Simulation ..> Ctx : fournit
    Simulation ..> Diagnostics
    Ctx <.. Protocol : utilise
    Ctx <.. DeviceBehaviour : utilise
    Protocol ..> Stack
    DeviceBehaviour ..> Stack
    Scenario *-- Device
    Scenario *-- Link
    NetworkEvent *-- Packet
    Bus ..> NetworkEvent : publie
    Builder ..> Scenario : renvoie un nouveau
    Protocol <|.. ARP
    Protocol <|.. ICMP
    Protocol <|.. UDP
    Protocol <|.. DNS
    Protocol <|.. DHCP
    Protocol <|.. TCP
    Protocol <|.. HTTP
    DeviceBehaviour <|.. Switch
    DeviceBehaviour <|.. Host
    DeviceBehaviour <|.. Router
    HTTP ..> DNS : resolveName
    HTTP ..> TCP : connect
```

### Rendu, interface et VR

```mermaid
classDiagram
    direction LR
    class RenderAPI {
      <<app.render>>
      +loadTopology(scenario)
      +highlightDevice(id, mode)
      +highlightPacket(eventId)
      +highlightLink(id)
      +setLinkLoads(loads)
      +pickDeviceHit(origin, direction, options)
      +onFrame(listener)
      +startXR(session)
      +setEditMode(on)
      +packetStyle(protocol, broadcast)
    }
    class Scene {
      +renderer: WebGPURenderer
      +camera
      +world
      +setAnimationLoop()
    }
    class DeviceFactory {
      <<Factory>>
      +createFallback(device)
      +loadModel(device)
      +setHighlight(object, mode)
    }
    class PacketAnimator {
      +update()
      +select(eventId)
    }
    class XRBridge {
      +prepareXRSession(session)
    }
    class UIAPI {
      <<app.ui>>
      +select(id)
      +clear()
      +getSelection()
      +onChange(listener)
      +packets
      +mode
      +tabs
      +modules
    }
    class Controls {
      +getView()
      +run(command)
      +togglePlay()
      +handleKey(event)
    }
    class Inspector {
      +getView()
      +getPacketView()
    }
    class Recommendations {
      +getView()
      +choose(id)
    }
    class Editor {
      +addAtCenter(model)
      +connect(a, b, cable)
      +setAddress()
      +chooseRun(id)
      +play()
      +saveAs(name)
      +exportFile()
      +importText(text)
    }
    class TopologyStore {
      +loadDraft() saveDraft()
      +list() save() open() remove()
    }
    class XRAPI {
      <<app.xr>>
      +getCapabilities()
      +getStatus()
      +isPresenting()
      +enter()
      +exit()
    }
    class VrRig {
      +controlPanel
      +infoPanels
      +recoPanel
      +controllers
      +dispose()
    }

    RenderAPI *-- Scene
    Scene *-- DeviceFactory
    Scene *-- PacketAnimator
    Scene ..> XRBridge
    UIAPI *-- Controls
    UIAPI *-- Inspector
    UIAPI *-- Recommendations
    UIAPI *-- Editor
    Editor *-- TopologyStore
    XRAPI ..> RenderAPI : startXR
    XRAPI *-- VrRig
    VrRig ..> Controls : même logique
    VrRig ..> Inspector : même fiche
    VrRig ..> Recommendations : même contrôleur
    VrRig ..> UIAPI : select(id)
    RenderAPI ..> Simulation : abonné au bus
    UIAPI ..> Simulation : commandes
```

Patrons utilisés (Observer, Command, State, Strategy, Factory, Façade) et leur rôle : [`architecture.md` §9](architecture.md#9-patrons-de-conception).
