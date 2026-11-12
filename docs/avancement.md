# Avancement de la refonte

Fichier de reprise : une nouvelle conversation doit pouvoir continuer le travail à partir d'ici.
Mis à jour à la fin de chaque phase. Branche de travail : `feature/refonte-prof`.

## Règles de travail

- Aucun `git add`, `commit`, `push`, `merge` ni `rebase` par l'assistant : Ramy commite après chaque phase.
- Pour chaque phase : plan court → accord → code + tests → `node --test` → vérification dans le
  navigateur → résumé des fichiers + message de commit → arrêt. Jamais deux phases à la suite.
- Modules ES natifs, aucun bundler, aucun CDN, aucune URL externe à l'exécution, chemins relatifs
  (site servi sous `/3D-network-topology/`). Bibliothèques copiées dans `vendor/`.
- Aucune dépendance npm à l'exécution ; dépendance de développement seulement avec accord.
- Logique pure séparée du DOM et de Three.js, testée sous Node. Suite toujours à 0 échec.
- Valeurs des scénarios ou de l'utilisateur écrites avec `textContent`, jamais `innerHTML`.
- Interface en français, responsive (cibles ≥ 44 px), accessible (ARIA, clavier).
- Tout changement de contrat est reporté dans `docs/simulation/contrats.md` et dans les tests.
- Modèles d'équipements du catalogue : génériques et fictifs, valeurs réalistes.
- La répartition par membre (CODEOWNERS) est suspendue pendant la refonte.

## État des lieux (12 novembre 2026, avant la phase 1)

Tests : `node --test` → 188 tests, 177 réussis, 11 « à faire » (protocoles et équipements non écrits), 0 échec.

| Domaine | État |
| --- | --- |
| Moteur (`src/sim/`) | Contrôleur, file d'évènements, bus, états, validation des scénarios : faits et testés. `app.sim` est encore le **faux moteur** (`mock.js`, protocole « demo »). |
| Protocoles (`src/sim/protocols/`) | **Vides** (9 lignes chacun) : ARP, ICMP, UDP, DNS, DHCP, TCP, HTTP. Pas de routage. |
| Équipements (`src/sim/devices/`) | **Vides** : `host.js`, `switch.js`, `router.js`. |
| Scénarios | `arp.json` complet ; les sept autres sont des ébauches de 6 lignes. |
| Rendu (`src/render/`) | Three.js **r180**, `WebGLRenderer`. Topologie, liens, étiquettes, modèles GLB, surbrillance, lancer de rayon (`picking.js`), animation des paquets. |
| Interface (`src/ui/`) | Commandes, sélection, fiche d'équipement : faites et testées. `scenarioPicker.js` et `explanations.js` : gabarits S1 sans logique. `install.js` : vide. Pas d'inspecteur de paquet ni de journal. |
| XR (`src/xr/`) | Détection WebXR, statut, entrée et sortie de session `immersive-vr`. `vrPanel.js` et `controllers.js` : vides. |
| PWA | `manifest.json` sans icône ; `sw.js` ne met rien en cache ; `tools/build-precache.js` génère `precache-manifest.js` (non versionné) mais rien ne le lit. |
| CI | Tests, génération du précache, déploiement GitHub Pages. Pas de vérification après déploiement. |
| Documentation | README et architecture décrivent l'état S1 ; `decision-renderer.md` se contredit sur la version (r187 annoncée, r180 embarquée). |

## Phases

| N° | Phase | Statut |
| --- | --- | --- |
| 1 | PWA complète (icônes, précache, hors ligne, bouton Installer) | ✅ Terminé (12 nov), à commiter par Ramy |
| 2 | Three.js r187, rendu 100 % WebGPU (mode classique et VR), boucle d'animation WebXR unique | ✅ Terminé et commité (`ac653fc`) ; testé par Ramy avec l'extension Immersive Web Emulator 2.0 |
| 3 | Session immersive complète (panneau VR, manettes, fiches en VR) | ✅ Terminé (12 nov), à commiter par Ramy |
| 4 | Moteur réel, équipements et protocoles | ⏳ En cours, en quatre sous-étapes (un commit chacune) : **4a ✅** (commité, `ffba69f`) équipements, ARP, ICMP, routage statique, vrai moteur, choix du scénario ; **4b ✅** (commité, `1151dfd`) UDP, DNS, DHCP ; **4c ✅** (12 nov, à commiter) TCP, HTTP ; 4d inspecteur de paquets, journal, explications en 2D |
| 5 | Caractéristiques des équipements, débit et bande passante | À faire |
| 6 | Diagnostic et recommandations | À faire |
| 7 | Éditeur de topologie et choix du protocole | À faire |
| 8 | CI/CD et TLS | À faire |
| 9 | Documentation et finition | À faire |

Ordre suivi : 1, 3, puis 2, puis 4 à 9. La phase 3 a été faite avant la phase 2 parce que la
session VR fonctionne déjà avec le rendu actuel (r180, WebGL), alors que la phase 2 (WebGPU)
comporte un risque connu. La phase 1 est fusionnée dans `main` (pull request #15, fusion normale).

## Décisions

| Date | Décision | Raison |
| --- | --- | --- |
| 12 nov | `docs/avancement.md` est le fichier de reprise entre conversations. | Demande de Ramy. |
| 12 nov | `precache-manifest.js` reste généré (non versionné). Sans lui, `sw.js` s'installe sans cache. | Personne ne maintient la liste à la main ; le développement local n'est pas gêné par un cache. |
| 12 nov | Stratégie unique « cache d'abord » ; une nouvelle version prend la main à l'activation (`skipWaiting`, `clients.claim`) et supprime les anciens caches. Pas de bandeau « nouvelle version ». | Simplicité ; la version du cache change dès qu'un fichier change. |
| 12 nov | Icônes dessinées par `tools/build-icons.js` (PNG écrit avec `zlib` de Node), versionnées dans `assets/icons/`. | Aucune dépendance, aucune ressource tierce à attribuer. |
| 12 nov | Horloge du moteur pilotée par la boucle de rendu (`app.sim.tick(delta)`), avec relais interne si personne ne l'appelle pendant 250 ms. | En VR, le `requestAnimationFrame` de la fenêtre est suspendu : sans cela la simulation se figeait. |
| 12 nov | Panneaux VR dessinés sur des canvas 2D appliqués à des plans (pas de bibliothèque de texte 3D). Ils réutilisent `controlsView` et `describeSelection` du pôle ui. | Aucune dépendance ; mêmes règles et mêmes données qu'en 2D. |
| 12 nov | Visée à la manette avec tolérance (`pickDeviceHit(…, { tolerance: 0.7 })`) : l'étiquette d'un équipement est aussi une cible. | Routeur et switch sont plats, donc difficiles à toucher exactement avec un rayon. |
| 12 nov | Gâchette dans le vide : la sélection est gardée. | Éviter de perdre la fiche sur un tir manqué. |
| 12 nov | Essais VR automatisés avec la bibliothèque IWER 2.8 (Meta) injectée dans Chrome piloté, depuis un dossier temporaire hors dépôt. | L'extension Immersive Web Emulator ne se charge pas dans un Chrome sans interface ; IWER est son moteur. |
| 12 nov | **Rendu 100 % WebGPU** : `WebGPURenderer` seul, en mode classique et en VR ; `WebGLRenderer`, `three.module.js` et `?rendu=webgl` supprimés. Aucun contexte WebGL n'est créé. | Demande du professeur (cours : WebGPU, WebXR, Immersive Web Emulator). Remplace la bascule vers `WebGLRenderer` en VR, jamais commitée. |
| 12 nov | VR en WebGPU : `XRGPUBinding` du navigateur s'il accorde la fonctionnalité `webgpu` ; sinon (Immersive Web Emulator) pont `src/render/xrBridge.js` (XRGPUBinding fourni par le pont, copie WebGPU dans un canevas WebGPU, couche-surface sans WebGL remise à l'émulateur). | L'émulateur ne connaît pas l'API WebXR/WebGPU ; le `XRGPUBinding` de Chrome (derrière un drapeau) refuse ses sessions. |
| 12 nov | Sans WebGPU : message « WebGPU requis » à la place de la scène, aucun repli. | Choix du 100 % WebGPU ; le repli WebGL 2 de `WebGPURenderer` n'est jamais déclenché. |
| 12 nov | La vue classique (caméra, cible) est sauvegardée à l'entrée en VR et rendue à la sortie. | Three.js recopie la pose du casque dans la caméra : la vue revenait collée au routeur. |
| 12 nov | Phase 4 découpée en 4a, 4b, 4c, 4d, un commit chacune. | Taille de la phase ; accord de Ramy. |
| 12 nov | Pile réseau commune (`stack.js`, `net.js`) : les équipements font ARP, routage, TTL et réponse au ping ; les protocoles ne gèrent que leur côté « application ». | Mêmes équipements pour tous les scénarios ; les protocoles de 4b/4c (DNS, DHCP, TCP, HTTP) s'appuieront sur `sendIp`. |
| 12 nov | Explications choisies par le scénario : la pile annonce des identifiants d'étapes standard (du plus précis au plus général), seules celles présentes dans `steps` sont affichées, une fois par exécution. | Ajouter ou retirer une explication sans toucher au code. |
| 12 nov | `scenarios/index.json` liste les scénarios terminés ; les ébauches restent hors liste. Repli sur le faux moteur si aucun scénario n'est lisible. | Pas de listage de dossier possible sur un site statique. |
| 12 nov | Durées ralenties : 400 ms par lien, ping toutes les 7 s, délais de 10 à 12 s. | Paquets visibles à vitesse 1 ; la vitesse ×4 accélère. |
| 12 nov | Ports déclarés par scénario (`services`) ; ports clients ouverts à l'envoi ; UDP vers un port fermé → ICMP « port inaccessible ». | Montrer le rôle des ports et la seule « réponse » possible d'UDP. |
| 12 nov | Configuration obtenue pendant l'exécution (DHCP) gardée par la pile (`runtimeDevice`), jamais écrite dans le scénario. | Le scénario est gelé et rejoué à l'identique à chaque réinitialisation. |
| 12 nov | Messages DHCP du serveur diffusés (drapeau de diffusion), serveur DHCP dans le même réseau (pas de relais). | Plus simple et visible ; le relais DHCP n'est pas au programme de cette phase. |
| 12 nov | Délai d'attente DNS de 10 s (au lieu de 5 s réels). | Durées ralenties (400 ms par lien) : avec ARP des deux côtés, la première réponse met 6,4 s. |
| 12 nov | TCP simplifié mais fidèle : poignée de main, séquences et ACK cumulatifs, segments mis de côté dans le désordre, ACK dupliqués, une seule temporisation (RTO) qui renvoie le plus ancien segment, FIN, RST. Numéros initiaux fixes, pas de congestion ni de TIME_WAIT (dit dans les explications). | Montrer la fiabilité de TCP sans noyer l'élève. |
| 12 nov | Perte simulée par paramètre de scénario (`loseSegment`), publiée comme une perte sur l'émetteur. | Pas de modèle de perte sur les liens à ce stade ; la phase 5 (débit, liens) pourra en ajouter un. |
| 12 nov | HTTP/1.1 avec connexion persistante : deux requêtes sur une connexion (200 puis 404). Pas de HTTPS. | Montrer DNS + TCP + HTTP et l'intérêt de garder la connexion ouverte. |
| 12 nov | Le bouton « Installer » est visible tant que l'application n'est pas installée. Sans invite du navigateur, le clic explique comment installer. | « Message clair si l'installation est indisponible » sans encombrer l'en-tête. |

## Journal des phases

### Phase 1 — PWA complète (12 novembre)

- Tests : 213 tests, 202 réussis, 11 « à faire », 0 échec.
- Fichiers : `manifest.json`, `sw.js`, `src/ui/install.js` (+ test), `src/ui/index.js` (+ test),
  `index.html`, `styles.css`, `tools/build-icons.js` (+ test), `assets/icons/*.png`,
  `tests/sw.test.js`, `tests/platform.test.js`, `tools/build-precache.js` (+ test),
  `.github/workflows/ci.yml` (commentaire), `docs/simulation/contrats.md` (§6 API du pôle ui).
- Vérifié dans Chrome piloté, site servi sous `/3D-network-topology/` : Service Worker actif,
  68 fichiers en cache, aucune erreur d'installabilité, rechargement et lecture de la simulation
  avec le serveur arrêté, badge « Hors ligne », aucun débordement à 390 et 340 px.
- Reste à vérifier à la main : l'invite d'installation de Chrome (impossible sans interface).
- Pour tester le hors ligne en local : `node tools/build-precache.js` avant de servir le dossier,
  puis supprimer `precache-manifest.js` (sinon le cache masque les modifications suivantes).

### Phase 3 — Session immersive complète (12 novembre)

- Tests : 243 tests, 232 réussis, 11 « à faire », 0 échec.
- Moteur : `app.sim.tick(deltaMs)` (`src/sim/commands.js`, `simulation.js`, `tests/commands.test.js`).
- Rendu : boucle unique `setAnimationLoop((time, xrFrame) => …)`, `onFrame`, `pickDeviceHit`,
  `getVRAnchor`, placement VR (`src/render/scene.js`, `index.js`, `mock.js`, `picking.js`,
  `vrLayout.js`, `vrLayout.test.mjs`).
- XR : `src/xr/panelLayout.js` (pur), `canvasPanel.js`, `vrPanel.js`, `infoPanels.js`,
  `controllers.js`, `vrRig.js`, `session.js` (crochets d'entrée et de sortie), `index.js`, `vr.test.js`.
- Documentation : `docs/simulation/contrats.md` (§4 `tick`, §7 API du rendu), `docs/architecture.md` (§6).
- Vérifié dans Chrome piloté avec IWER (profil Meta Quest 3) : entrée en VR, gâchette sur Lecture,
  Vitesse +, Pause, Pas à pas, Réinitialiser ; le temps simulé avance pendant la session ;
  sélection du routeur et de PC 1 à la manette (fiche à jour en VR et en 2D) ; paquet animé visible ;
  deux entrées et sorties de suite ; console vide.
- Non vérifié : un vrai casque, et l'extension Immersive Web Emulator elle-même (à faire par Ramy).
- Limite connue : les explications viennent du faux moteur (trois étapes de démonstration) jusqu'à la phase 4.
- README non mis à jour pour la VR : prévu en phase 9.

### Phase 2 — essai obligatoire WebGPU + WebXR (12 novembre, avant tout code)

Three.js 0.187.0, Chrome 157 piloté avec WebGPU réel (adaptateur Intel gen-12lp), émulateur IWER 2.8
(profil Meta Quest 3), session `immersive-vr`. Page d'essai hors dépôt (dossier temporaire).

| Voie | Mode classique | Session VR | Image en VR | Console |
| --- | --- | --- | --- | --- |
| `WebGPURenderer`, backend WebGPU, sans fonctionnalité `webgpu` | WebGPU, image correcte | ouverte, `setSession` refusé : « WebGPU XR sessions require the "webgpu" session feature » | — | erreur à la sortie |
| `WebGPURenderer`, backend WebGPU, `requiredFeatures: ['webgpu']` | WebGPU | refusée : « One or more required features are not supported by the device » | — | — |
| `WebGPURenderer({ forceWebGL: true })` | WebGL 2 | ouverte, boucle appelée | **vide** | « Invalid value used as weak map key » à chaque image |
| WebGPU classique → `WebGPURenderer({ forceWebGL })` en VR → retour WebGPU | WebGPU | ouverte | **vide** | même erreur |
| `WebGLRenderer` r187 seul | WebGL 2 | ouverte | correcte | vide |
| WebGPU classique → `WebGLRenderer` r187 en VR → retour WebGPU | WebGPU, puis WebGPU au retour | ouverte | correcte | vide |

- `XRGPUBinding` est absent de Chrome 157, avec ou sans émulateur : la VR en WebGPU est impossible sur ce poste.
- Cause de l'image vide : la couche XR d'IWER (et donc de l'extension Immersive Web Emulator) a un
  `framebuffer` nul ; le backend WebGL de `WebGPURenderer` r187 l'utilise comme clé de `WeakMap`
  (`WebGLState.drawBuffers`). `WebGLRenderer` gère ce cas. Sur un vrai casque le `framebuffer` n'est
  pas nul : non vérifiable ici.
- Les builds `three.webgpu.js` et `three.module.js` partagent `three.core.js` (`Mesh` identique) :
  une même scène peut être rendue par l'un puis par l'autre.
- À embarquer en plus : `build/three.webgpu.js`, `build/three.tsl.js` (importé par le précédent),
  `examples/jsm/utils/SkeletonUtils.js` (importé par `GLTFLoader` r187).

### Phase 2 — Three.js r187, WebGPU et boucle WebXR (12 novembre)

- Tests : 251 tests, 240 réussis, 11 « à faire », 0 échec.
- Vendor : `vendor/three/` passé à 0.187.0 (`three.webgpu.js`, `three.tsl.js`, `SkeletonUtils.js`,
  `LICENSE` en plus), `install.mjs` (dossier source en argument), `README.md`.
- Rendu : `src/render/renderers.js` (+ `renderers.test.mjs`), `scene.js` (création asynchrone,
  bascule de renderer, `getRenderer`, `getReferenceSpace`, `getRenderingInfo`, `xrSessionFeatures`,
  `whenSettled`, sauvegarde de la vue), `index.js`, `mock.js`, `browser-smoke.mjs`.
- XR : `session.js` (option `webgpu` conditionnelle, statut du rendu réel), `session.test.js`,
  `controllers.js` (`getReferenceSpace()`), `vr.test.js`.
- Docs : `decision-renderer.md` (réécrit), `README.md`, `architecture.md`, `docs/README.md`,
  `ATTRIBUTION.md`, `contrats.md` (§7).
- Boucle d'animation unique et horloge pilotée par le rendu : faites en phase 3, inchangées.
- Vérifié dans Chrome 157 piloté (WebGPU réel, GPU Intel) : voir `decision-renderer.md`,
  section « Vérifié dans l'application ».
- Non vérifié : vrai casque ; VR en WebGPU (pas de navigateur avec `XRGPUBinding`) ; navigateur
  réellement dépourvu de WebGPU (simulé par `?rendu=webgl`, même backend).

### Phase 2 (suite) — rendu 100 % WebGPU, demande du professeur (12 novembre)

Remplace la bascule vers `WebGLRenderer` décrite ci-dessus (elle n'a jamais été commitée).

- Constats préalables : `XRGPUBinding` **existe** dans Chrome 157, désactivé par défaut
  (`chrome://flags` → « Experimental Web Platform features »), mais refuse les sessions de
  l'émulateur (« parameter 1 is not of type 'XRSession' »). IWER 2.8 ne connaît pas la
  fonctionnalité `webgpu` et n'avance ses images que si la session a une couche `XRWebGLLayer` ;
  il ne lit sur son contexte que la taille du canevas et des appels d'effacement.
- Solution : `src/render/xrBridge.js` (+ `xrBridge.test.mjs`) fournit `XRGPUBinding` aux sessions de
  l'émulateur : chaque œil est rendu par `WebGPURenderer` dans une tranche de texture WebGPU, copiée
  (commandes WebGPU) dans un canevas WebGPU que l'émulateur affiche, via une couche dont le
  « contexte » est une simple surface. Sessions du navigateur avec `webgpu` accordé : son
  `XRGPUBinding`, pont inactif.
- Fichiers : `renderers.js` (WebGPU seul, `assertWebGPU`, `WebGPUUnavailableError`),
  `renderers.test.mjs` (dont le test « zéro WebGL » sur tout `src/`), `scene.js` (plus de bascule,
  `whenSettled` supprimé, `getRenderingInfo` → `{ classic, xr: { backend, path } }`), `index.js`
  (message « WebGPU requis »), `mock.js`, `browser-smoke.mjs`, `styles.css` ; tous les imports
  `three.module.js` → `three.webgpu.js` (src, tests, modules complémentaires) ; `install.mjs` ne
  copie plus `three.module.js` ; `session.js` (plus de test WebGL 2, ligne XRGPUBinding, statut).
- Tests : 257 tests, 246 réussis, 11 « à faire », 0 échec.
- Vérifié dans Chrome 157 piloté (WebGPU réel, GPU Intel) avec IWER 2.8, profil Meta Quest 3, compteur
  de `getContext('webgl…')` injecté avant la page : **0 contexte WebGL** du chargement à la fin ;
  mode classique (topologie, GLB, sélection, paquets) ; session VR en mono puis en stéréo, et passage de l'un
  à l'autre pendant la session (images aux bonnes proportions), panneaux, manettes, commandes, sélection, horloge ; deux entrées et sorties ;
  page sans `navigator.gpu` → message « WebGPU requis », aucun canevas, bouton VR désactivé ;
  console vide.
- Non vérifié : l'extension Immersive Web Emulator elle-même (à faire par Ramy, sa version peut
  différer d'IWER 2.8) ; un vrai casque (voie native `XRGPUBinding`).
- Fragilité connue : le pont dépend du fonctionnement interne de Three.js r187 et d'IWER 2.8.
- Passage mono ↔ stéréo de l'émulateur pendant une session : vérifié, l'image suit sans sortir de la VR.

### Phase 4a — équipements, ARP, ICMP, routage statique, vrai moteur (12 novembre)

- Tests : 294 tests, 289 réussis, 5 « à faire » (UDP, DNS, DHCP, TCP, HTTP), 0 échec.
- Moteur : `src/sim/net.js` (adressage, tables de routage, plus long préfixe), `src/sim/stack.js`
  (ARP avec file d'attente et délai, `sendIp`, réponse au ping, erreurs ICMP, routage, étapes
  standard), `src/sim/devices/host.js`, `switch.js`, `router.js`, `devices/index.js`,
  `src/sim/protocols/arp.js`, `icmp.js`, `src/sim/library.js`, `src/sim/index.js` (vrai moteur,
  `listScenarios`, `loadScenario`, repli sur le faux moteur), `scenario.js` (validation de `routes`).
- Scénarios : `ping.json`, `routage.json`, `ttl.json` (nouveau), `index.json` ; `arp.json` inchangé.
- Interface : `src/ui/scenarioPicker.js` (+ test), `styles.css` (message d'erreur du choix).
- Tests : `tests/net.test.js`, `arp.test.js`, `icmp.test.js`, `routage.test.js`, `switch.test.js`,
  `host.test.js`, `router.test.js` (les « à faire » remplacés), `mock.test.js` et `scenario.test.js`
  complétés ; aides `tests/netRun.js` et `tests/fakeCtx.js`.
- Docs : `contrats.md` (§1 `routes` et liste des scénarios, §3 équipements, pile et étapes standard,
  §4 choix du scénario, §5 faux moteur en repli).
- Vérifié dans Chrome 157 piloté : liste des 4 scénarios, changement de scénario (scène 3D, état,
  temps), lecture complète de ping (10,2 s simulées), routage, TTL ; session VR sur ping avec les
  vraies explications dans le panneau VR ; 390 px sans débordement ; console vide.
- Reste pour 4d : les explications et le contenu des paquets ne sont pas encore affichés en 2D
  (panneaux « Inspecteur » et « Explications » encore au gabarit S1 ; en VR, les explications
  s'affichent déjà).

### Phase 4b — UDP, DNS, DHCP (12 novembre)

- Tests : 305 tests, 303 réussis, 2 « à faire » (TCP, HTTP), 0 échec.
- Pile : `stack.js` (ports, `sendUdp`, diffusion `255.255.255.255`, `runtimeDevice`,
  `configureDevice`, erreur ICMP « port inaccessible »), `devices/host.js` (ports fermés, diffusion),
  `devices/router.js` (diffusion jamais transmise), `protocol.js` (`describeHeaders` affiche le
  protocole de transport), `scenario.js` (validation de `dns`, `services`, `records`, `dhcp`,
  `isHostname`).
- Protocoles : `protocols/udp.js`, `dns.js` (`resolveName`, `handleDns`, cache), `dhcp.js` (DORA,
  plage, baux, vérification par ping).
- Scénarios : `udp.json`, `dns.json`, `dhcp.json` (réécrits) ; `index.json` (7 scénarios).
- Tests : `tests/udp.test.js`, `dns.test.js`, `dhcp.test.js` (les « à faire » remplacés),
  `scenario.test.js` et `mock.test.js` complétés.
- Docs : `contrats.md` (§1 nouveaux champs et `transport.protocol`, §3 pile et étapes standard).
- Vérifié dans Chrome 157 piloté : 7 scénarios dans la liste ; DHCP joué jusqu'au bout (14,9 s
  simulées), DNS et UDP en lecture ; console vide.
- Pour 4d : couleurs des paquets par protocole (aujourd'hui bleu ou jaune pour la diffusion).

### Phase 4c — TCP et HTTP (12 novembre)

- Tests : 314 tests, 314 réussis, 0 « à faire », 0 échec : chaque protocole a ses tests.
- Protocoles : `protocols/tcp.js` (connexion réutilisable : `connect`, `handleTcp`, `conn.send`,
  `conn.close`, `tcpFields`), `protocols/http.js` (`parseUrl`, `respond`, DNS + TCP + GET).
- Pile : `devices/host.js` répond RST à un SYN vers un port TCP fermé ; `scenario.js` valide `pages`.
- Scénarios : `tcp.json` (perte et retransmission, RST), `http.json` (même réseau que DNS, page « / »
  et 404) ; `index.json` (9 scénarios).
- Tests : `tests/tcp.test.js`, `tests/http.test.js` (les « à faire » remplacés), `host.test.js`,
  `scenario.test.js`, `mock.test.js` complétés.
- Docs : `contrats.md` (champ `pages`, API TCP, étapes standard TCP et HTTP).
- Vérifié dans Chrome 157 piloté : 9 scénarios ; TCP (14,6 s) et HTTP (22,7 s) joués jusqu'au bout ;
  console vide.
