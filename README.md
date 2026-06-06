# HomeCine Front

Interface web de contrôle pour un **serveur audio maison multi-pièces / multi-sources**.

Elle pilote :
- des **lecteurs audio** (Spotify, FilePlayer, Deezer, radio, fichiers locaux, entrée audio ligne),
- une **bibliothèque musicale unifiée** qui agrège plusieurs sources (Spotify + FilePlayer local),
- des **égaliseurs paramétriques** par canal,
- les **appareils de sortie** (volume général + par canal, mute, EQ),
- la **diffusion réseau** (VBAN, Snapcast) et le **Bluetooth**.

Tout l'état audio (lecture, position, volume, EQ, devices) est **temps réel via WebSocket** ;
la configuration (lecteurs, presets, utilisateurs) passe par une **API REST** proxifiée.

[![Nuxt UI](https://img.shields.io/badge/Made%20with-Nuxt%20UI-00DC82?logo=nuxt&labelColor=020420)](https://ui.nuxt.com)

---

## Table des matières

1. [Stack technique](#stack-technique)
2. [Installation & démarrage](#installation--démarrage)
3. [Configuration & proxy](#configuration--proxy)
4. [Authentification & sécurité](#authentification--sécurité)
5. [Pages principales](#pages-principales)
6. [Bibliothèque `/library`](#bibliothèque-library-multi-sources)
7. [Protocole WebSocket lecteurs](#protocole-websocket-lecteurs-lecteur-live)
8. [Contrat FilePlayer](#contrat-fileplayer)
9. [Types de lecteurs & transports](#types-de-lecteurs--transports)
10. [Composables](#composables)
11. [API REST consommée](#api-rest-consommée)
12. [Structure du projet](#structure-du-projet)
13. [Conventions & pièges connus](#conventions--pièges-connus)
14. [Commandes utiles](#commandes-utiles)

---

## Stack technique

| Catégorie | Technologie |
|---|---|
| Framework | Nuxt 4 + Vue 3 (`<script setup>`) |
| UI | Nuxt UI 4 (Tailwind CSS v4) |
| Langage | TypeScript |
| HTTP | Axios — instance unique `src/lib/https.ts` (baseURL `/proxy`) |
| Temps réel | WebSocket natif, wrappé par `useWs` + composables dédiés |
| Utilitaires | VueUse (`useDebounceFn`, `useEventListener`, `createSharedComposable`) |
| Icons | Lucide (`i-lucide-*`), Material Symbols, MDI (`mdi:*`), Simple Icons, Framework7 (`f7:*`) |
| Package manager | pnpm |

---

## Installation & démarrage

```bash
pnpm install

pnpm dev       # Développement (localhost:3000)
pnpm host      # Développement exposé sur le réseau local (0.0.0.0)
pnpm build     # Build production
pnpm preview   # Prévisualisation du build
```

**Prérequis** : Node >= 20, pnpm >= 10, et le backend **HomeCine-Serv** accessible (REST + WS).

---

## Configuration & proxy

### `app/src/config.ts`

```ts
const appConfig = {
  API_URL: process.env.API_URL ?? '/proxy',                 // REST via proxy Nitro
  WS_URL:  process.env.WS_BASE ?? 'ws://192.168.1.40:8099',  // WebSocket direct
  WS_URL_BROADCAST: process.env.WS_URL_BROADCAST ?? 'ws://192.168.1.40:9086',
} as const
```

### Proxy Nitro (`nuxt.config.ts`)

```ts
nitro: {
  routeRules: {
    '/refresh':  { proxy: 'http://192.168.1.40:3007/refresh' },
    '/proxy/**': { proxy: 'http://192.168.1.40:3007/**' },
  },
}
```

**Pourquoi un proxy ?** Le front et le backend sont sur des IP différentes. En passant par
`/proxy`, toutes les requêtes deviennent **same-origin** du point de vue du navigateur :
- les cookies `SameSite=Lax` (`TOKEN`, `REFRESH_TOKEN`, `IKEY`) sont envoyés même en POST,
- les **covers relatives** renvoyées par l'API (`/library/cover/...`) se résolvent correctement,
- pas de préflight CORS bloquant.

La route `/refresh` est proxifiée **à la racine** (et non sous `/proxy`) pour que le path
corresponde exactement à celui du cookie `REFRESH_TOKEN` (posé par le serveur avec `path:/refresh`).

---

## Authentification & sécurité

Gérée dans `src/lib/https.ts` (intercepteurs Axios) + `composables/useAuth.ts`.

- **Token Bearer** : cookie `TOKEN` (non-httpOnly, ~15 min), injecté en `Authorization: Bearer …`
  sur chaque requête.
- **Refresh** : sur `401`, l'intercepteur appelle `POST /refresh` (instance `authHttp`,
  `baseURL = window.location.origin`), enregistre le nouveau token dans `TOKEN`, puis **rejoue**
  la requête initiale. Les requêtes concurrentes pendant un refresh sont mises en file.
- **Détection navigateur** : `utils/browser.ts` déduit le navigateur (Chrome/Firefox/Opera/
  Edge/Safari + version), le persiste dans le cookie `BROWSER` et l'envoie en en-tête `X-Browser`
  (suivi des sessions côté admin).
- **Rôle / admin** : `useCurrentUser` décode le JWT (`TOKEN`) côté client (sans vérif de
  signature) pour exposer `user` et `isAdmin`. Le middleware `middleware/admin.ts` bloque les
  routes admin, et la navigation masque les liens admin pour les non-admins.
- **Échec de refresh** ou 401/403 persistant → redirection unique vers `/login`.

---

## Pages principales

### `/spotify` — Bibliothèque musicale unifiée

Navigateur **multi-sources** (Spotify + FilePlayer) bâti sur l'API `/library`. Layout :
sidebar bibliothèque à gauche (drawer sur mobile) + zone de contenu + lecteur fixe en bas.

- **`LibrarySidebar`** : onglets Playlists / Albums / Artistes, recherche locale, **filtres de
  source** (boutons icône), bouton **Réindexer**. Émet l'objet complet sélectionné.
- **`HomeView`** : accueil avec sections en **carousels horizontaux** (`HScroll`) + barre de
  recherche temps réel + **chips de filtre par source** (avec coche ✓ sur l'état actif). Le
  filtre est appliqué **côté client** (instantané, sans refetch).
- **Vues détail** (`ItemPlaylist`, `ItemAlbum`, `ItemArtist`) : recyclées de l'ancienne UI
  Spotify, alimentées via un **mapping** `/library` → forme attendue (`useLibraryMappers`).
  L'en-tête (cover, nom) s'affiche immédiatement même si le chargement des pistes échoue (ex. 403).
- **Lecture** (`▶`) → `POST /library/play`. Au clic, un **sélecteur de lecteur** propose les
  lecteurs **dont le `type` correspond à la `source`** (Spotify → lecteurs spotify, etc.).
  Un seul compatible → lecture directe ; plusieurs → modal de choix ; aucun → toast.
- **Ajout à la file** (`＋`) → `POST /library/enqueue { track }`.
- **Lecteur fixe** (`lecture.vue`) : pochette, titre/artiste, transport (shuffle · prev ·
  play/pause · next · repeat), barre de progression, volume (avec mute mémorisant le niveau),
  icône du type de device. Piloté par le WS `lecteur-live`.

### `/lecteurs`

- **`index.vue`** : liste des lecteurs configurés, start/stop, filtres par type.
- **`new.vue`** : création — le formulaire de config s'adapte au type choisi
  (`SpotifyServiceConfig`, `FilePlayerServiceConfig`, `DeezerServiceConfig`, …).
- **`[id].vue`** : édition. Pour un lecteur **`fileplayer`** vivant, intègre le composant
  **`FilePlayerControl`** : transport, seek, volume, repeat/shuffle, et **gestion de queue**
  (ajout d'un fichier par chemin, lecture, monter/descendre, suppression).

### `/eq` · `/eqconfig` · `/eq/presset`

Égaliseur paramétrique temps réel (bandes ON/OFF, suppression individuelle) et presets EQ
(sample rate, fichier de config, **mapping canal par canal Input → Output**, layouts jusqu'à 22.2).

### `/devices`

Appareils de sortie. Slider de volume **général** + sliders **par canal** : le nombre de
canaux affichés suit `vban.channels` (les canaux manquants dans l'état WS sont complétés au
niveau moyen). Mute, boutons ±5 %, état temps réel via `useDeviceControlWs`.

### `/snap` · `/bt` · `/control`

Snapcast (groupes, clients, volume, latence), Bluetooth (connexion/état), panneau général.

### `/settings`

- **General**, **Notifications** (toasts in-app + **Web Push** via service worker `public/sw.js`,
  préférences par type d'événement, historique), **Security** (changement de mot de passe).
- **Admin** (gardé par middleware) : **Members** (CRUD utilisateurs, révocation de session),
  **Spotify** (auth/config), **Navigateurs** (sessions navigateur, journal global filtrable,
  suppression de logs).

---

## Bibliothèque `/library` (multi-sources)

Client : `app/src/api/library.ts` · Mapping vers `Item*` : `useLibraryMappers.ts`.

### Endpoints

| Méthode | Endpoint | Rôle |
|---|---|---|
| `GET` | `/library/providers` | Sources : `[{ source, lecteurId, canReindex }]` |
| `POST` | `/library/reindex` | Réindexer `{ source? }` |
| `GET` | `/library/search?q=&limit=&sources=` | Recherche multi-sources |
| `POST` | `/library/enqueue` | Ajouter une piste `{ track }` |
| `POST` | `/library/play` | Lire `{ source, type, id\|uri, lecteurId }` |
| `GET` | `/library/categories?sources=&limit=` | Catégories |
| `GET` | `/library/playlists?category=&q=&sources=&limit=` | Playlists |
| `GET` | `/library/playlists/:source/:id/tracks?limit=` | Pistes d'une playlist |
| `POST` | `/library/playlists/:source/:id/enqueue` | Enfiler toute la playlist `{ lecteurId? }` |
| `GET` | `/library/albums?q=&sources=&limit=` | Albums |
| `GET` | `/library/albums/:source/:id/tracks` | Pistes d'un album |
| `GET` | `/library/artists?q=&sources=&limit=` | Artistes |
| `GET` | `/library/artists/:source/:id/albums` | Albums d'un artiste |
| `GET` | `/library/artists/:source/:id/tracks` | Pistes d'un artiste |
| `GET` | `/library/cover/:source/:id` | Pochette (URL **relative**) |

### Formes de données (camelCase backend)

```ts
LibraryTrack    { source, sourceId|id, uri, title, artists[], album, date,
                  durationMs, coverUrl, lecteurId }
LibraryAlbum    { source, id|sourceId, name, artists[], date, coverUrl, trackCount, uri, lecteurId }
LibraryArtist   { source, id, name, coverUrl, lecteurId }
LibraryPlaylist { source, id, name, description, coverUrl, trackCount, uri, lecteurId }
LibraryProvider { source, lecteurId, canReindex }  // normalisé en { id, name } par getProviders()
```

### Deux modèles d'action

| Geste | Endpoint | Sémantique |
|---|---|---|
| `＋` sur une piste | `POST /library/enqueue { track:{source,uri,lecteurId} }` | ajout à la **file** |
| `▶` playlist/album/artiste | `POST /library/play { source, type, id, lecteurId }` | **lecture** d'un contexte |
| `▶` une piste | `POST /library/play { source, type:'track', uri, lecteurId }` | lecture d'une piste |

### Helpers clés

- **`resolveCoverUrl(url)`** : `null` → placeholder ; `http(s)`/`data:` → tel quel ;
  chemin relatif (`/library/cover/...`) → **préfixé par `API_URL`** (`/proxy`).
- **`resolveId(item)`** : `item.id ?? item.sourceId` (les sources ne nomment pas l'id pareil).
- **`useLibraryMappers`** : convertit `LibraryTrack/Album/Artist/Playlist` vers la forme
  « Spotify-like » attendue par `ItemPlaylist/ItemAlbum/ItemArtist`, en conservant l'objet
  original dans `__src` pour pouvoir l'enfiler. Tolérant au camelCase **et** snake_case.

---

## Protocole WebSocket lecteurs (`lecteur-live`)

Composable `app/composables/useLecteursWs.ts` · endpoint `ws://…/lecteur-live` ·
référence complète : `app/pages/lecteurs/API.md`.

### Messages serveur → front

| Message | Quand | Contenu |
|---|---|---|
| `Lecteur.Init` | connexion / `GetState` | `{ lecteurs: LecteurState[] }` (queue incluse si dispo) |
| `Lecteur.Update` | changement d'état | `{ id, data: LecteurState }` |
| `Lecteur.Heartbeat` | chaque seconde | `{ lecteurs: HeartbeatEntry[] }` (position + volume) |
| `Lecteur.Queue` | réponse `GetQueue` | `{ id, queue: QueueItem[] }` |
| `Lecteur.Error` | erreur commande | `{ id?, error }` |

### Messages front → serveur

`Lecteur.GetState` · `Lecteur.GetQueue` · `Lecteur.Play` (`{id, uri?}`) · `Lecteur.Pause` ·
`Lecteur.Resume` · `Lecteur.TogglePlayPause` · `Lecteur.Next` · `Lecteur.Prev` ·
`Lecteur.SetVolume` (`{id, value}`) · `Lecteur.SetShuffle` (`{id, value}`) ·
`Lecteur.SetRepeat` (`{id, value}`) · `Lecteur.Seek` (`{id, position_ms}`) ·
`Set.select` (`{id}` — définit le lecteur principal côté serveur).

### `LecteurState`

```ts
{ id, name, type, alive, playing, shuffle, repeat,
  track: TrackInfo|null, temp: TempInfo|null, queue: QueueItem[]|null,
  volume, device_type, supports_volume }
```

- **`playing` seul fait foi** : `true` = lecture, `false` = arrêté. (Pas de champ `paused`.)
- Le **lecteur principal** est choisi via `Set.select` et mémorisé dans
  `useDashboard().activeLecteurId`. Les commandes ciblent ce lecteur par défaut, avec repli
  sur le `lecteurId` renvoyé par l'API.
- Fréquences : Heartbeat 1 s · poll Spotify ~4 s · poll FilePlayer 1 s · queue à la demande.

### Slideovers liés

- **`LecteurSlideover`** (`L`) : liste des lecteurs, sélection du principal (`Set.select`),
  volume par lecteur, badges Lecture/Arrêté/Hors-ligne.
- **`LecteurQueueSlideover`** (`Q`) : file d'attente du lecteur actif (piste en cours + suite).

---

## Contrat FilePlayer

Documenté en détail dans **`app/API.md`** (config d'instanciation, commandes IPC, events).
Côté front, un FilePlayer démarré se pilote via le WS `lecteur-live` (transport, volume,
shuffle/repeat, seek) et les commandes de queue de la bibliothèque :

| Action UI | Effet |
|---|---|
| Config à la création (`FilePlayerServiceConfig`) | `queue[]`, `volume`, `repeat`, `shuffle`, transport (FIFO/local/VBAN) |
| Contrôle live (`FilePlayerControl`) | play/pause/next/prev/seek/volume + add/remove/move dans la queue |

Extensions audio acceptées : `.mp3 .flac .aac .m4a .ogg .opus .wav .aiff .wma .alac .ape …`
et conteneurs `.mkv .mka .dts .ac3 .eac3 .mp4 …`.

---

## Types de lecteurs & transports

| Type | Statut | Description | Config notable |
|---|---|---|---|
| `spotify` | ✅ | Client Spotify (librespot) + API Spotify | bitrate, device-type, typeStream |
| `fileplayer` | ✅ | Lecture de fichiers locaux | queue, repeat, shuffle, EQ, upmix |
| `deezer` | 🚧 **non implémenté** | Client Deezer — formulaire de config présent, intégration lecture/bibliothèque à faire | bitrate, device-type |
| `radio` | 🚧 **non implémenté** | Flux radio HTTP — formulaire de config présent, lecture à faire | URL du flux |
| `localInput` | ✅ | Capture audio ALSA (entrée ligne) | pcm_device, layout sortie, master_gain_db |

> **Deezer** et **radio** : seuls leurs formulaires de configuration
> (`DeezerServiceConfig`, `RadioServiceConfig`) existent. Ces sources ne sont pas encore
> branchées à la bibliothèque `/library` ni au protocole de lecture — à compléter.
> La lecture de **fichiers locaux** est assurée par le type `fileplayer`.

| Transport | Description |
|---|---|
| `localStream` | Sortie sur device audio local (ALSA) |
| `StreamOutFifo` | Sortie vers pipe FIFO (ex. Snapcast) |
| `vban` / `sendVban` | Envoi réseau via protocole VBAN |

---

## Composables

| Composable | Rôle |
|---|---|
| `useWs` | WebSocket générique : reconnexion auto, parsing JSON, handlers multiples, cleanup |
| `useLecteursWs` | États lecteurs temps réel + toutes les commandes `Lecteur.*` / `Set.select` |
| `useDeviceControlWs` | Contrôle & état des appareils de sortie (singleton) |
| `useSnapWs` | État Snapcast (JSON-RPC) |
| `useDashboard` | État UI global partagé (`createSharedComposable`) : slideovers, `activeLecteurId`, raccourcis clavier |
| `useAuth` | Login / token / logout / `isAuthenticated` |
| `useCurrentUser` | Décodage JWT → `user`, `isAdmin` |
| `useNotifications` | Toasts in-app, Web Push, préférences, historique (`createSharedComposable`) |
| `useParametricEq` | Gestion des bandes EQ |

### Raccourcis clavier (`useDashboard`)

`n` notifications · `s-d` devices Spotify · `d` device · `l` lecteurs · `q` file d'attente ·
`m` menu · `ctrl+d` ajout device · `g-h`/`g-s` navigation.

---

## API REST consommée

### Authentification
`POST /login` · `POST /logout` · `POST /refresh` · `POST /register`

### Lecteurs (`src/api/lecteur.ts`)
`GET /lecteur` · `GET /lecteur/:id` · `POST /lecteur` · `PUT /lecteur/:id` ·
`PUT /lecteur/:id/start` · `PUT /lecteur/:id/stop` · `DELETE /lecteur/:id`

### EQ (`src/api/eq.ts`)
`GET /eq` · `GET /eq/:id` · `POST /eq` · `PUT /eq/:id` · `DELETE /eq/:id`

### Bibliothèque (`src/api/library.ts`)
Voir [section dédiée](#bibliothèque-library-multi-sources).

### Admin (`src/api/admin.ts`)
`GET /user/all` · `POST /admin/users/:id/revoke-token` ·
navigateurs : `GET` browsers / logs, `revoke`/`restore`, `DELETE /admin/logs`…

### Notifications (`src/api/notifications.ts`)
préférences, subscribe/unsubscribe Web Push, clé VAPID, historique, mark-read.

---

## Structure du projet

```
app/
├── pages/
│   ├── spotify.vue              # Bibliothèque /library + lecteur fixe
│   ├── lecteurs/               # index, new, [id] (+ FilePlayerControl), API.md
│   ├── devices/                # index (volume par canal), [id]
│   ├── eq.vue · eqconfig.vue · eq/presset.vue
│   ├── snap/ · bt.vue · control/
│   └── settings/               # general, notifications, security, members*, spotify*, browsers*
│
├── components/
│   ├── spotify/components/
│   │   ├── HomeView.vue · LibrarySidebar.vue · HScroll.vue
│   │   ├── ItemPlaylist.vue · ItemAlbum.vue · ItemArtist.vue · lecture.vue
│   │   └── …
│   ├── spotify/composable/useLibraryMappers.ts
│   ├── lecteur/services/        # *ServiceConfig.vue (dont FilePlayerServiceConfig)
│   ├── lecteur/transports/      # LocalStream / StreamOutFifo / Vban
│   ├── FilePlayerControl.vue · LecteurSlideover.vue · LecteurQueueSlideover.vue
│   ├── NotificationsSlideover.vue · DeviceSlideover.vue · DeviceAddSlideover.vue
│   └── …
│
├── composables/                 # useWs, useLecteursWs, useDeviceControlWs, useSnapWs,
│                                # useDashboard, useAuth, useCurrentUser, useNotifications, …
├── middleware/admin.ts
├── plugins/push-notifications.client.ts
├── src/
│   ├── api/  library.ts · lecteur.ts · eq.ts · admin.ts · notifications.ts
│   ├── lib/https.ts            # Axios + intercepteurs
│   └── config.ts
├── utils/  browser.ts · cookies.ts · audioLayouts.ts · lecteurOptions.ts · eqTools.ts
├── layouts/default.vue
├── types/  lecteur.ts (+ index.d.ts)
└── API.md                       # Contrat FilePlayer (process Python)

public/sw.js                      # Service worker Web Push
```

---

## Conventions & pièges connus

- **Icônes dynamiques** : UnoCSS/Nuxt UI ne détecte que les classes **présentes statiquement**.
  Une icône via `:icon="fn()"` peut ne pas être générée → préférer des `<UIcon name="mdi:…">`
  en `v-if` quand le nom est conditionnel.
- **`HScroll`** (carousel) : un ancêtre flex sans `min-w-0` laisse le contenu déborder
  horizontalement → on **plafonne la largeur du scroller** à l'espace visible
  (`window.innerWidth − left`) avec une **garde** (jamais ≤ 0, sinon la section devient
  invisible). Les flèches n'apparaissent que s'il y a réellement un dépassement.
- **Covers** : toujours passer par `resolveCoverUrl` (les URLs FilePlayer sont relatives).
- **IDs library** : utiliser `resolveId` (les pistes exposent `sourceId`, pas toujours `id`).
- **Lecteurs** : `playing` est l'unique source de vérité de l'état lecture (pas de `paused`).
- **Cookies cross-origin** : tout passe par le proxy `/proxy` pour rester same-origin.

---

## Thème

- Couleur primaire : **green** · neutre : **zinc**
- Mode clair / sombre selon la préférence

---

## Commandes utiles

```bash
pnpm lint          # ESLint
pnpm typecheck     # vue-tsc
```
