# HomeCine Front

Interface web de pilotage d'un **serveur audio maison multi-pièces / multi-sources**
(back-end **HomeCine-Serv**).

Une seule application réunit :

- une **bibliothèque musicale unifiée** (`/library`) qui agrège plusieurs sources
  (fichiers locaux, Spotify, YouTube, Deezer…) — recherche, navigation, collections, genres, favoris ;
- des **lecteurs** (un process par service + sortie) pilotés **en temps réel** : transport,
  volume, shuffle/repeat, seek, file d'attente ;
- l'**égaliseur paramétrique** et ses presets (mapping canal par canal, jusqu'à 22.2) ;
- les **appareils de sortie** : ALSA (cartes, PCM, `asound.conf`), volume général et par canal ;
- la **diffusion réseau** : Snapcast, VBAN, SendSpin, Bluetooth ;
- un moteur de **règles de contrôle**, la gestion des **comptes/identifiants** et les
  **notifications** (toasts + Web Push).

L'état audio (lecture, position, volume, devices) arrive **en temps réel par WebSocket** ;
la configuration passe par une **API REST proxifiée**.

[![Nuxt UI](https://img.shields.io/badge/Made%20with-Nuxt%20UI-00DC82?logo=nuxt&labelColor=020420)](https://ui.nuxt.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Table des matières

1. [Stack technique](#stack-technique)
2. [Démarrage rapide](#démarrage-rapide)
3. [Configuration & proxy](#configuration--proxy)
4. [Authentification & sécurité](#authentification--sécurité)
5. [Navigation & pages](#navigation--pages)
6. [Bibliothèque musicale (`/musique`)](#bibliothèque-musicale-musique)
7. [Temps réel — WebSockets](#temps-réel--websockets)
8. [Lecteurs](#lecteurs)
9. [Diffusion & protocoles réseau](#diffusion--protocoles-réseau)
10. [Appareils de sortie & EQ](#appareils-de-sortie--eq)
11. [Paramètres & administration](#paramètres--administration)
12. [API REST consommée](#api-rest-consommée)
13. [Composables](#composables)
14. [Raccourcis clavier](#raccourcis-clavier)
15. [Structure du projet](#structure-du-projet)
16. [Conventions & pièges connus](#conventions--pièges-connus)
17. [Qualité & CI](#qualité--ci)
18. [Licence](#licence)

---

## Stack technique

| Catégorie | Technologie |
|---|---|
| Framework | Nuxt 4 + Vue 3 (`<script setup>`) |
| UI | Nuxt UI 4 (Tailwind CSS v4), thème `primary: green` / `neutral: zinc` |
| Langage | TypeScript |
| HTTP | Axios — instance unique `app/src/lib/https.ts` (baseURL `/proxy`) |
| Temps réel | WebSocket natif, encapsulé par `useWs` + composables dédiés |
| Utilitaires | VueUse (`useDebounceFn`, `useStorage`, `useIntersectionObserver`, `createSharedComposable`…) |
| Graphes | Unovis (`@unovis/vue`) |
| Validation | Zod |
| Icônes | Lucide (`i-lucide-*`), Material Symbols, MDI (`mdi:*`), Simple Icons, Framework7 (`f7:*`), CBI |
| Package manager | pnpm 10 |

---

## Démarrage rapide

```bash
pnpm install
pnpm dev
```

| Script | Effet |
|---|---|
| `pnpm dev` | Développement sur `http://localhost:3000` |
| `pnpm host` | Développement exposé sur le réseau — **IP fixée** (`nuxt dev --host 192.168.1.20`) |
| `pnpm build` | Build production |
| `pnpm preview` | Prévisualisation du build |
| `pnpm lint` | ESLint (config Nuxt + stylistic) |
| `pnpm typecheck` | `vue-tsc` |

**Prérequis**

- Node **22** (version testée en CI ; Nuxt 4 exige ≥ 20.19), pnpm ≥ 10 ;
- le back-end **HomeCine-Serv** joignable : REST sur `:3007`, WebSocket sur `:8099`
  (+ `:9086` pour la découverte des devices).

---

## Configuration & proxy

### IP du back-end

Elle apparaît à **deux endroits** (valeurs par défaut) :

```ts
// nuxt.config.ts
const ip = '192.168.1.19'

nitro: {
  routeRules: {
    // /refresh à la racine : le cookie REFRESH_TOKEN a path:/refresh côté serveur
    '/refresh':  { proxy: `http://${ip}:3007/refresh` },
    // toutes les autres routes API (login, logout, user, library…)
    '/proxy/**': { proxy: `http://${ip}:3007/**` }
  }
}
```

```ts
// app/src/config.ts
const appConfig = {
  API_URL:          process.env.API_URL          ?? '/proxy',            // REST via proxy Nitro
  WS_URL:           process.env.WS_BASE          ?? 'ws://192.168.1.19:8099',
  WS_URL_BROADCAST: process.env.WS_URL_BROADCAST ?? 'ws://192.168.1.19:9086'
} as const
```

`nuxt.config.ts` injecte `API_URL` et `WS_BASE` dans le bundle client via `vite.define` :
ces variables sont **figées au build**, un changement impose de rebuilder.

> ⚠️ Sur une autre installation, changer l'IP dans `nuxt.config.ts` **et** dans
> `app/src/config.ts` (ou fournir `API_URL` / `WS_BASE` / `WS_URL_BROADCAST` au build).

### Pourquoi un proxy ?

Le front et le back-end sont sur des hôtes différents. En passant par `/proxy`, toutes les
requêtes deviennent **same-origin** du point de vue du navigateur :

- les cookies `SameSite=Lax` (`TOKEN`, `REFRESH_TOKEN`, `BROWSER`) partent même en POST ;
- les **pochettes relatives** renvoyées par l'API (`/library/cover/...`) se résolvent ;
- pas de préflight CORS bloquant.

La route `/refresh` est proxifiée **à la racine** (pas sous `/proxy`) pour que le chemin
corresponde exactement à celui du cookie `REFRESH_TOKEN` (posé avec `path:/refresh`).

---

## Authentification & sécurité

Implémentée dans `app/src/lib/https.ts` (intercepteurs Axios) + `composables/useAuth.ts`.

- **Bearer** : le cookie `TOKEN` (non-httpOnly, ~15 min) est injecté en
  `Authorization: Bearer …` sur chaque requête.
- **Refresh transparent** : sur `401` (ou `403` dont le message évoque un token expiré/révoqué),
  l'intercepteur appelle `POST /refresh` via une instance dédiée (`baseURL = window.location.origin`),
  enregistre le nouveau token et **rejoue** la requête. Les requêtes concurrentes pendant un
  refresh sont mises en file. `refreshAccessToken()` est exporté pour les appelants hors Axios
  (WebSocket).
- **Empreinte navigateur** : `utils/browser.ts` déduit le navigateur (Chrome / Firefox / Opera /
  Edge / Safari + version), le persiste dans le cookie `BROWSER` et l'envoie en en-tête
  `X-Browser` — c'est ce qui alimente le suivi des sessions côté admin.
- **WebSockets** : les sockets étant cross-origin, le cookie ne les suit pas ; `utils/ws.ts`
  joint le token en query (`?token=…`). Sur `Lecteur.AuthError`, le composable rafraîchit le
  token, reconstruit l'URL et renvoie `Lecteur.Auth` (3 tentatives max, puis toast « session expirée »).
- **Rôle** : `useCurrentUser` décode le JWT côté client (**sans vérification de signature**)
  pour exposer `user` et `isAdmin` — c'est du confort d'UI, l'autorisation reste serveur.
- **Garde de routes** : `middleware/auth.global.ts` redirige vers `/login` sans token ;
  `middleware/admin.ts` protège les routes admin (`/settings/members`, `/settings/browsers`…),
  et `/settings/credentials` déclare son propre `definePageMeta({ middleware: 'admin' })`.
- **Échec de refresh** ou 401/403 persistant → suppression du cookie et redirection unique vers `/login`.

---

## Navigation & pages

Le menu latéral (`app/layouts/default.vue`) est **dynamique** : les entrées Bluetooth, Snap,
VBAN et SendSpin n'apparaissent que si le service correspondant est activé côté serveur
(`GET /services`, exposé par `useProtocols`).

| Route | Fichier | Contenu |
|---|---|---|
| `/` | `pages/index.vue` | **Maison** — tableau de bord : compteurs lecteurs / en lecture / en ligne / sources, cartes des lecteurs actifs, volume par pièce, règles de contrôle, dernières notifications |
| `/musique` | `pages/musique.vue` | **Bibliothèque unifiée** + lecteur fixe (voir section dédiée) |
| `/lecteurs` | `pages/lecteurs/index.vue` | Liste des lecteurs, start/stop, création (modale) |
| `/lecteurs/:id` | `pages/lecteurs/[id].vue` | Édition d'un lecteur + contrôle live FilePlayer |
| `/devices` | `pages/devices/index.vue` | Appareils de sortie : volume général et par canal, mute, état temps réel |
| `/devices/:id` | `pages/devices/[id].vue` | Configuration ALSA (cartes USB, PCM/bus, `asound.conf`, save/rollback) + instances snapclient |
| `/eq` · `/eqconfig` · `/eq/presset` | `pages/eq*.vue` | Égaliseur paramétrique temps réel, presets et mapping des canaux |
| `/snap` · `/snap/snapconfig` | `pages/snap/*` | Snapcast : groupes, clients, volumes, latence, streams, serveur |
| `/vban` | `pages/vban.vue` | Flux VBAN : sélection de la cible, master/haut-parleurs, streams enregistrés |
| `/sendspin` | `pages/sendspin.vue` | SendSpin : mode `snapcast` / `vban` / `url` / `process`, start/stop |
| `/bt` | `pages/bt.vue` | Bluetooth : adaptateurs, scan, appairage, connexion |
| `/control` | `pages/control/index.vue` | Moteur de règles (entrées/sorties, schéma, validation, activation) |
| `/settings/**` | `pages/settings/*` | Profil, notifications, sécurité, et section admin |
| `/login` | `pages/login.vue` | Connexion |

---

## Bibliothèque musicale (`/musique`)

Client API : `app/src/api/library.ts` (+ `dbPlaylists.ts`, `genres.ts`, `saved.ts`) ·
adaptation vers les vues détail : `composable/useLibraryMappers.ts`.

**Layout** : sidebar bibliothèque à gauche (drawer sur mobile) · zone de contenu ·
lecteur fixe en bas (`lecture.vue`, 104 px).

### Sources

Les sources proviennent de `GET /library/providers` — le front sait iconifier `fileplayer`,
`spotify`, `youtube` et `deezer`, et retombe sur une icône générique pour les autres.
La sélection de sources est **partagée et persistée** (`useLibrarySources`,
localStorage `hc-library-sources`) : sidebar et accueil filtrent avec le même état.

### Vues

| Vue | Déclencheur | Contenu |
|---|---|---|
| `home` | par défaut | Carrousels (`HScroll`) : sources, titres, albums, artistes, playlists, dossiers, genres — + recherche temps réel |
| `playlist` / `album` / `artist` | sidebar, accueil, navigation croisée | Détail avec en-tête (pochette, nom) affiché **immédiatement**, même si le chargement des pistes échoue |
| `db` | « Mes playlists » | Collection stockée en base : réordonner, retirer, renommer, supprimer, importer depuis une URL |
| `saved` | Titres aimés / Artistes suivis | Favoris paginés (scroll infini) |
| `tracks` | Dossier fileplayer, genre, « Tous les titres » | Liste paginée ; un genre est éditable (renommer, pochette, retirer une piste) |

### Actions sur une piste

| Geste | Effet |
|---|---|
| ▶ | `POST /library/play` — un **sélecteur de lecteur** propose les lecteurs dont le type correspond à la source (un seul candidat → lecture directe, plusieurs → modale, aucun → toast) |
| ＋ | `POST /library/enqueue { track }` — ajout à la file du lecteur ciblé |
| ♥ | `POST`/`DELETE /library/saved/tracks` — aimé / non aimé |
| 📁 | Ajout à une collection (playlist/album en base) ou à un **genre**. La source est verrouillée pour les collections : mélanger les sources casserait la lecture |
| ⤓ | *(YouTube)* `Lecteur.Download` sur un lecteur YouTube |
| ✨ | *(FilePlayer)* `POST /library/enrich` — identification des métadonnées en **aperçu** (`dryRun`) puis écriture, à l'unité ou en lot |

### Endpoints `/library`

| Méthode | Endpoint | Rôle |
|---|---|---|
| `GET` | `/library/providers` | Sources disponibles (`source`, `lecteurId`, `canReindex`, `public`…) |
| `PUT` | `/library/providers/:source/public` | Rendre une source publique/privée |
| `POST` | `/library/reindex` | Réindexation (`{ source? }`) |
| `GET` `POST` `PUT` `DELETE` | `/library/roots` | Dossiers scannés (stockage local) |
| `GET` | `/library/search?q=&sources=&limit=` | Recherche multi-sources |
| `GET` | `/library/trackliste` | Toutes les pistes (paginé) |
| `GET` | `/library/categories` · `/library/categories/:source/:id/tracks` | Dossiers et leur contenu |
| `GET` | `/library/playlists` · `/library/playlists/:source/:id/tracks` | Playlists |
| `POST` | `/library/playlists/:source/:id/enqueue` | Enfiler toute une playlist |
| `GET` | `/library/albums` · `/library/albums/:source/:id/tracks` | Albums |
| `GET` | `/library/artists` · `/library/artists/:source/:id/albums` · `.../tracks` | Artistes |
| `GET` | `/library/like/:source?artist=` | Titres aimés d'un artiste |
| `POST` | `/library/enqueue` · `/library/play` | Ajout à la file · lecture |
| `POST` | `/library/enrich` | Enrichissement des métadonnées (avec `dryRun`) |
| `GET` | `/library/cover/:source/:id` | Pochette (**URL relative**) |
| `*` | `/library/db-playlists…` | Collections en base : CRUD, import, pistes, `move`, `play` |
| `*` | `/library/genres…` | Genres : CRUD, pistes (`add`/`remove`) |
| `*` | `/library/saved/tracks` · `/library/saved/artists` | Favoris et artistes suivis |

### Formes de données

```ts
LibraryTrack    { source, id|sourceId, uri, title, artists[], album, date,
                  durationMs|duration_ms, coverUrl|cover_url, lecteurId, like }
LibraryAlbum    { source, id|sourceId, name, artists[], date, coverUrl, trackCount, lecteurId }
LibraryArtist   { source, id, name, cover_url }
LibraryPlaylist { source, id, name, description, cover_url, track_count }
LibraryProvider { id, name, source, lecteurId, canReindex, active, public }
Page<T>         { items, total, page, pageSize, hasMore }
```

Le back-end mélange **camelCase** et **snake_case** selon les sources : les helpers et les
mappers tolèrent les deux.

### Helpers indispensables

- **`resolveCoverUrl(url)`** — `null` → placeholder ; `http(s)` / `data:` → tel quel ;
  `//host/…` → `https:` ; chemin relatif → préfixé par `API_URL` (`/proxy`).
- **`resolveId(item)`** — `item.id ?? item.sourceId` (les sources ne nomment pas l'id pareil).
- **`sourceKey(item)`** — id **natif de la source** (`channelId` YouTube, `sourceId`) prioritaire
  sur l'id de ligne en base : indispensable pour les éléments aimés/suivis.
- **`unpage` / `pageParams` / `listItems`** — normalisent les réponses paginées (ou les
  tableaux bruts hérités) en `Page<T>`.
- **`useLibraryMappers`** — convertit `LibraryTrack/Album/Artist/Playlist` vers la forme
  « Spotify-like » attendue par `ItemPlaylist/ItemAlbum/ItemArtist`, en gardant l'objet
  d'origine dans `__src` pour pouvoir l'enfiler ensuite.

---

## Temps réel — WebSockets

Toutes les sockets passent par `wsProxyUrl(path)` (`app/utils/ws.ts`) : base `WS_URL`
(ou `WS_URL_BROADCAST` pour `Device`) + `?token=` pour l'authentification.

| Endpoint | Composable | Rôle |
|---|---|---|
| `/lecteur-live` | `useLecteursWs` | État et commandes des lecteurs (partagé pour toute l'app) |
| `/controlOfDevice` | `useDeviceControlWs` | État et contrôle des appareils de sortie (singleton) |
| `/Device` | `DeviceAddSlideover` | Découverte des appareils (port `WS_URL_BROADCAST`) |
| `/Snap` | `useSnapWs` | Snapcast en JSON-RPC 2.0 (réponses corrélées par `id`) |
| `/spotify-player` | `useSpotifyPlayerWs` | État du player Spotify (devices, piste) |

### Protocole `lecteur-live`

**Serveur → front**

| Message | Quand | Contenu |
|---|---|---|
| `Lecteur.Init` | connexion / `GetState` | `{ lecteurs: LecteurState[] }` (file incluse si disponible) |
| `Lecteur.Update` | changement d'état | `{ id, data: LecteurState }` |
| `Lecteur.Heartbeat` | chaque seconde | `{ lecteurs: HeartbeatEntry[] }` (position, volume, `device_type`) |
| `Lecteur.Queue` | réponse à `GetQueue` | `{ id, queue: QueueItem[] }` |
| `Lecteur.Like` | réponse à `GetLike` / `ToggleLike` | `{ id, sourceId, like }` |
| `Lecteur.AuthError` / `Lecteur.Auth` | token expiré / ré-authentification | `{ reason }` |
| `Lecteur.Error` | erreur de commande | `{ id?, error }` |

**Front → serveur**

```
Lecteur.GetState · Lecteur.GetQueue · Lecteur.Play {id, uri?} · Lecteur.Pause · Lecteur.Resume
Lecteur.Next · Lecteur.Prev · Lecteur.Seek {id, position_ms} · Lecteur.SetVolume {id, value}
Lecteur.SetShuffle {id, value} · Lecteur.SetRepeat {id, value}
Lecteur.GetLike · Lecteur.ToggleLike
Lecteur.SetQueue {id, files[]} · Lecteur.AddToQueue · Lecteur.RemoveFromQueue {id, index}
Lecteur.MoveInQueue {id, from, to} · Lecteur.ClearQueue · Lecteur.Download {id, videoId, format}
Set.select {id}          // définit le lecteur principal côté serveur
```

### `LecteurState`

```ts
{ id, name, type, alive, playing, paused, shuffle, repeat,
  track: TrackInfo|null, temp: TempInfo|null, queue: QueueItem[]|null,
  volume, device_type, supports_volume }
```

- **`playing` fait foi** pour l'état de lecture (`true` = lit, `false` = arrêté).
- Le **lecteur principal** est choisi via `Set.select` et mémorisé dans
  `useDashboard().activeLecteurId` ; les commandes le ciblent par défaut, avec repli sur le
  `lecteurId` renvoyé par l'API library.
- Cadence : heartbeat 1 s · file à la demande · reconnexion automatique toutes les 2 s.

### Slideovers liés

- **`LecteurSlideover`** (`L`) : liste des lecteurs, sélection du principal, volume par lecteur,
  badges Lecture / Arrêté / Hors-ligne, réinitialisation de la file (types `fileplayer`,
  `youtube`, `deezer`).
- **`LecteurQueueSlideover`** (`Q`) : file du lecteur actif.
- **`DeviceSlideover`**, **`DeviceSpotifySlideover`**, **`DeviceAddSlideover`**, **`NotificationsSlideover`**.

---

## Lecteurs

Un lecteur = un **service** (d'où vient l'audio) + un **transport** (où il sort).

### Types

| Type | État côté front | Description | Config notable |
|---|---|---|---|
| `spotify` | ✅ | librespot + API Spotify | bitrate, device-type, compte (`tokenUserId`) |
| `fileplayer` | ✅ | Lecture de fichiers locaux, file gérée depuis le front | queue, repeat, shuffle, EQ, upmix |
| `youtube` | ✅ | Source bibliothèque + téléchargement (`Lecteur.Download`) | transport, file |
| `deezer` | ⚙️ | Connexion du compte (ARL / OAuth) et gestion de file ; la présence dans la bibliothèque dépend du back-end | bitrate, device-type |
| `radio` | 🚧 | Formulaire de configuration seulement | URL du flux |
| `local` | 🚧 | Formulaire de configuration seulement — couvert en pratique par `fileplayer` | transport |
| `localInput` | ✅ | Capture ALSA (entrée ligne) | `pcm_device`, layout de sortie, `master_gain_db` |

### Transports

| Transport | Description |
|---|---|
| `localStream` | Sortie sur un périphérique audio local (ALSA) |
| `StreamOutFifo` | Sortie vers un pipe FIFO (ex. Snapcast) |
| `vban` / `sendVban` | Envoi réseau via le protocole VBAN |

### Création & édition

- **Création** : modale `LecteurCreateModal` — le formulaire de config s'adapte au type choisi
  (`SpotifyServiceConfig`, `FilePlayerServiceConfig`, `YouTubeServiceConfig`,
  `DeezerServiceConfig`, `RadioServiceConfig`, `LocalServiceConfig`, `LocalInputServiceConfig`),
  avec choix du transport et d'un preset EQ (`conf_eq_id`).
- **Édition** (`/lecteurs/:id`) : mêmes formulaires + start/stop. Pour un **`fileplayer`** vivant,
  le composant `FilePlayerControl` ajoute le contrôle live : transport, seek, volume,
  repeat/shuffle et **gestion de file** (ajout par chemin, lecture, monter/descendre, suppression).
- **Compte lié** : `TokenUserSelect` choisit le compte d'authentification (`config.tokenUserId`).
  Un admin voit tous les utilisateurs annotés de l'état de leur token, un utilisateur voit le sien.

### Contrat FilePlayer

Détaillé dans **[`app/API.md`](app/API.md)** : config d'instanciation (queue, volume, sortie
`StreamOutFifo` / `sendVban` / `localStream`, EQ), commandes IPC et events du process Python.

Extensions acceptées : `.mp3 .flac .aac .m4a .ogg .opus .wav .aiff .wma .alac .ape …`
et conteneurs `.mkv .mka .dts .ac3 .eac3 .mp4 …`.

---

## Diffusion & protocoles réseau

Les services sont pilotés par `GET /services` / `PUT /services/:name` (composable `useProtocols`) :
activer un service le fait apparaître dans le menu. Le catalogue connu du front est dans
`src/api/protocols.ts` (Snapcast, VBAN, DLNA/UPnP, AirPlay, Chromecast).

| Domaine | Page | API |
|---|---|---|
| **Snapcast** | `/snap`, `/snap/snapconfig` | WS JSON-RPC (`Client.SetVolume`, `Group.SetStream`, `Client.SetChannelMap`…) + `GET /snap/state`, `POST /snap/restore`, instances via `/snap/*` |
| **VBAN** | `/vban` | `GET`/`POST`/`DELETE /vban`, `GET /vban/state`, `POST /vban/select` — sélection de la cible, réglages master et haut-parleurs, streams enregistrés |
| **SendSpin** | `/sendspin` | `GET`/`PUT /sendspin`, `POST /sendspin/start`/`stop`, `DELETE /sendspin` — modes `snapcast`, `vban`, `url`, `process` |
| **Bluetooth** | `/bt` | `/bt/adapters`, `/bt/devices`, `/bt/status`, `/bt/scan`, `/bt/pair`, `/bt/connect`, `/bt/disconnect` |
| **Règles** | `/control` | `/control`, `/control/schema`, CRUD `/control/rules`, `POST /control/rules/validate`, `PATCH /control/rules/:id/toggle` |

---

## Appareils de sortie & EQ

### `/devices`

Liste des appareils détectés (état temps réel via `useDeviceControlWs`) : slider de volume
**général** + sliders **par canal**, mute, boutons ±5 %. Le nombre de canaux suit
`vban.channels` ; les canaux absents de l'état WS sont complétés au niveau moyen.

### `/devices/:id`

Configuration ALSA de l'appareil : cartes USB détectées, éditeur de **PCM/bus** multi-cartes
(`useDeviceBus`), aperçu et écriture de `asound.conf` (`/alsa/save`, `/alsa/rollback`),
gestion des instances **snapclient** (ajout, autostart, autorestart, start/stop).

### `/eq` · `/eqconfig` · `/eq/presset`

Égaliseur paramétrique temps réel (bandes ON/OFF, courbe calculée via Web Audio dans
`utils/eqTools.ts`) et presets : sample rate, fichier de config, **mapping canal par canal
Input → Output**, layouts jusqu'à 22.2 (`utils/audioLayouts.ts`).

---

## Paramètres & administration

| Page | Contenu |
|---|---|
| `/settings` | Profil (nom, email, avatar) |
| `/settings/notifications` | Toasts in-app + **Web Push** (service worker `public/sw.js`, clé VAPID, abonnement), préférences par type d'événement, historique |
| `/settings/security` | Changement de mot de passe (schéma Zod) |
| `/settings/members` 🔒 | CRUD utilisateurs, révocation de toutes les sessions d'un compte |
| `/settings/credentials` 🔒 | **Connexions** : clés d'application par fournisseur, comptes Spotify (librespot : autorisation, échange, vérification), Deezer (ARL / OAuth), visibilité publique des sources, dossiers du stockage local, activation des protocoles audio |
| `/settings/browsers` 🔒 | Sessions navigateur, journal global filtrable, révocation/restauration, suppression de logs |

🔒 = réservé aux administrateurs.

---

## API REST consommée

Toutes les requêtes passent par l'instance Axios `app/src/lib/https.ts` (baseURL `/proxy`).

| Module | Endpoints principaux |
|---|---|
| Auth | `POST /login` · `/logout` · `/refresh` · `/register` |
| `api/user.ts` | `GET /user` · `GET /user/all` · `PUT /user/:id` · `DELETE /user/:id` |
| `api/lecteur.ts` | `GET`/`POST` `/lecteur` · `GET`/`PUT`/`DELETE` `/lecteur/:id` · `PUT /lecteur/:id/start` et `/stop` · `POST /lecteur/:id/command` |
| `api/library.ts` | voir [Bibliothèque](#bibliothèque-musicale-musique) |
| `api/dbPlaylists.ts` | `/library/db-playlists…` (CRUD, import, pistes, move, play) |
| `api/genres.ts` | `/library/genres…` |
| `api/saved.ts` | `/library/saved/tracks` · `/library/saved/artists` |
| `api/eq.ts` | `GET`/`POST` `/eq` · `GET`/`PUT`/`DELETE` `/eq/:id` |
| `api/credentials.ts` | `/credentials/providers` · `/credentials` · `/credentials/spotify/authorize` · `/credentials/deezer/connect` et `/authorize` · `/credentials/:id/default` |
| `api/librespot.ts` | `/credentials/librespot` (authorize, exchange, verify, all, user/:id) |
| `api/appkey.ts` | `/keys` · `/keys/catalog` · `/keys/:provider` |
| `api/services.ts` | `GET /services` · `PUT /services/:name` |
| `api/vban.ts` | `/vban` · `/vban/state` · `/vban/select` |
| `api/sendspin.ts` | `/sendspin` · `/sendspin/start` · `/sendspin/stop` |
| `api/snap.ts` | `/snap/state` · `/snap/restore` |
| `api/notifications.ts` | préférences, abonnement Web Push, clé VAPID, historique, `read` |
| `api/admin.ts` | `/admin/browsers…` · `/admin/logs` · `/admin/users/:id/revoke-token` |

---

## Composables

| Composable | Rôle |
|---|---|
| `useWs` | WebSocket générique : reconnexion auto, parsing JSON, handlers multiples, cleanup |
| `useLecteursWs` | État temps réel des lecteurs + toutes les commandes `Lecteur.*` / `Set.select` (partagé) |
| `useDeviceControlWs` | Contrôle et état des appareils de sortie (singleton) |
| `useSnapWs` | Snapcast en JSON-RPC (promesses corrélées par `id` + notifications) |
| `useSpotifyPlayerWs` | État du player Spotify (devices, piste courante) |
| `useDashboard` | État UI global partagé : slideovers, `activeLecteurId`, menu, raccourcis clavier |
| `useLibrarySources` | Sources actives de la bibliothèque, persistées en localStorage |
| `useProtocols` | Services/protocoles audio (`/services`) — pilote aussi le menu |
| `useAuth` | Login / logout / `isAuthenticated` |
| `useCurrentUser` | Décodage du JWT → `user`, `isAdmin` |
| `useNotifications` | Toasts, Web Push, préférences, historique (partagé) |
| `useParametricEq` | Gestion des bandes de l'égaliseur |
| `useDeviceBus` | État et actions de l'éditeur de PCM/bus ALSA (UI-agnostique) |
| `useToastHelpers` | Raccourcis `ok` / `ko` / `info` sur `useToast()` |
| `useLibraryMappers` | Adaptation `/library` → composants de détail |

---

## Raccourcis clavier

Définis dans `useDashboard` :

| Touche | Action |
|---|---|
| `n` | Notifications |
| `l` | Lecteurs |
| `q` | File d'attente |
| `d` | Appareil |
| `s` puis `d` | Appareils Spotify |
| `m` | Menu latéral |
| `ctrl` + `d` | Ajouter un appareil |
| `g` puis `h` / `s` | Aller à l'accueil / aux paramètres |

---

## Structure du projet

```
app/
├── pages/
│   ├── index.vue                # Maison (tableau de bord)
│   ├── musique.vue              # Bibliothèque /library + lecteur fixe
│   ├── lecteurs/                # index, [id] (+ FilePlayerControl)
│   ├── devices/                 # index (volume par canal), [id] (ALSA, snapclient)
│   ├── eq.vue · eqconfig.vue · eq/presset.vue
│   ├── snap/                    # index, snapconfig
│   ├── vban.vue · sendspin.vue · bt.vue · control/
│   └── settings/                # index, notifications, security, members*, credentials*, browsers*
│
├── components/
│   ├── spotify/components/      # HomeView, LibrarySidebar, HScroll, ItemAlbum/Artist/Playlist,
│   │                            # TrackListView, SavedDetail, DbPlaylistDetail, lecture.vue…
│   ├── spotify/composable/      # useLibraryMappers…
│   ├── lecteur/services/        # *ServiceConfig.vue (un par type de lecteur)
│   ├── lecteur/transports/      # LocalStream / StreamOutFifo / Vban
│   ├── lecteur/                 # LecteurCreateModal, LecteurConfigForm, TokenUserSelect
│   ├── FilePlayerControl.vue · LecteurSlideover.vue · LecteurQueueSlideover.vue
│   ├── Device*Slideover.vue · NotificationsSlideover.vue · MarqueeText.vue
│   └── settings/MembersList.vue
│
├── composables/                 # useWs, useLecteursWs, useDeviceControlWs, useSnapWs,
│                                # useDashboard, useProtocols, useLibrarySources, useAuth…
├── middleware/                  # auth.global.ts, admin.ts
├── plugins/push-notifications.client.ts
├── src/
│   ├── api/                     # library, dbPlaylists, genres, saved, lecteur, eq, credentials,
│   │                            # librespot, appkey, services, vban, sendspin, snap, admin…
│   ├── lib/https.ts             # Axios + intercepteurs (Bearer, refresh, X-Browser)
│   └── config.ts                # API_URL / WS_URL / WS_URL_BROADCAST
├── utils/                       # ws, cookies, browser, audioLayouts, channelLayouts,
│                                # eqTools, eqPreset, lecteurOptions, nowPlaying, youtube
├── layouts/default.vue          # Sidebar dynamique + slideovers globaux
├── types/                       # lecteur.ts, device.ts, index.d.ts
└── API.md                       # Contrat FilePlayer (process Python)

public/sw.js                     # Service worker Web Push
server/api/notifications.ts      # Données de démo (reste du template)
```

---

## Conventions & pièges connus

- **Icônes dynamiques** — Nuxt UI ne génère que les classes présentes **statiquement**. Une
  icône passée via `:icon="fn()"` peut ne pas être produite : préférer des
  `<UIcon name="mdi:…">` en `v-if` quand le nom est conditionnel.
- **Pochettes** — toujours passer par `resolveCoverUrl` : les URL FilePlayer sont relatives et
  doivent être préfixées par `/proxy`.
- **Identifiants library** — `resolveId` pour l'affichage, `sourceKey` pour rappeler l'API de la
  source (les éléments aimés/suivis portent un id de ligne en base, pas l'id natif).
- **Pagination** — les réponses varient (tableau brut ou enveloppe `{ items, … }`) : passer par
  `unpage` / `listItems` plutôt que lire `res.data` directement.
- **État de lecture** — `playing` est la source de vérité ; ne pas se fier à `paused`.
- **`HScroll`** — un ancêtre flex sans `min-w-0` laisse le contenu déborder : le scroller
  plafonne sa largeur à l'espace visible (`window.innerWidth − left`), avec une garde (jamais
  ≤ 0, sinon la section devient invisible). Les flèches n'apparaissent qu'en cas de dépassement.
- **Sources mixtes** — une collection en base est verrouillée sur une source ; y mélanger des
  pistes d'origines différentes casse la lecture sur le lecteur de cette source.
- **Cookies** — tout le REST passe par `/proxy` pour rester same-origin ; les WebSockets, eux,
  s'authentifient par `?token=`.
- **Restes du template Nuxt UI Dashboard** — `pages/inbox.vue` (lit `/api/mails`, non fourni),
  `components/customers/*`, `TeamsMenu.vue` et `server/api/notifications.ts` ne sont pas
  branchés au back-end.

---

## Qualité & CI

`.github/workflows/ci.yml` lance, à chaque push (Ubuntu, Node 22, pnpm) :

```bash
pnpm install
pnpm run lint
pnpm run typecheck
```

---

## Licence

[MIT](LICENSE) — © 2025 Quentin Guiheneuc.
