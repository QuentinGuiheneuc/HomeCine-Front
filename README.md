# HomeCine Front

Interface web de contrôle pour un serveur audio maison multi-sources. Permet de gérer les lecteurs audio (Spotify, FilePlayer, Deezer, radio, fichiers locaux, entrée audio), une **bibliothèque musicale unifiée multi-sources**, les équaliseurs paramétriques, les appareils de sortie et la diffusion réseau (VBAN / Snapcast).

[![Nuxt UI](https://img.shields.io/badge/Made%20with-Nuxt%20UI-00DC82?logo=nuxt&labelColor=020420)](https://ui.nuxt.com)

---

## Stack technique

| Catégorie | Technologie |
|---|---|
| Framework | Nuxt 4 + Vue 3 |
| UI | Nuxt UI 4 (Tailwind CSS v4) |
| Langage | TypeScript |
| HTTP | Axios (`src/lib/https.ts`) — proxy Nitro `/proxy` |
| Temps réel | WebSocket natif (multi-canaux) |
| Utilitaires | VueUse (`useDebounceFn`, `useEventListener`, `createSharedComposable`) |
| Icons | Lucide, Material Symbols, MDI, Simple Icons, Framework7 |
| Package manager | pnpm |

---

## Prérequis

- Node.js >= 20
- pnpm >= 10
- Serveur backend **HomeCine-Serv** accessible (API REST + WebSocket)

---

## Installation & démarrage

```bash
pnpm install

pnpm dev       # Développement (localhost)
pnpm host      # Développement exposé sur le réseau local
pnpm build     # Build production
pnpm preview   # Prévisualisation du build
```

---

## Configuration

URLs du backend dans `app/src/config.ts` :

```ts
API_URL: process.env.API_URL ?? '/proxy'              // API REST (via proxy Nitro)
WS_URL:  process.env.WS_BASE ?? 'ws://192.168.1.40:8099'
```

Le front passe par un **proxy Nitro** (`/proxy/**` → backend) configuré dans `nuxt.config.ts`,
ce qui rend toutes les requêtes same-origin (cookies `SameSite=Lax`, covers relatives, etc.).
La route `/refresh` est proxifiée à la racine pour matcher le path du cookie `REFRESH_TOKEN`.

---

## Pages principales

### `/spotify` — Bibliothèque musicale unifiée
Navigateur **multi-sources** (Spotify + FilePlayer) bâti sur l'API `/library` :
- **Sidebar** (`LibrarySidebar`) : playlists / albums / artistes, recherche, filtres de **source**, réindexation
- **Accueil** (`HomeView`) : sections en **carousels horizontaux** (`HScroll`) + recherche temps réel + chips de filtre par source
- **Vue détail** playlist / album / artiste (composants `Item*` recyclés)
- **Lecture** (`▶`) → `POST /library/play` avec **sélecteur de lecteur** compatible (par type de source)
- **Ajout à la file** (`＋`) → `POST /library/enqueue`
- **Lecteur fixe** en bas (`lecture.vue`) : pochette, contrôles, progression, volume — piloté par le WS `lecteur-live`

### `/lecteurs`
Liste, création (`new.vue`) et édition (`[id].vue`) des lecteurs. La page d'édition d'un
lecteur `fileplayer` intègre un **contrôle live** (`FilePlayerControl`) : transport, seek,
volume, repeat/shuffle et gestion de queue (ajout fichier, suppression, réordonnancement).

### `/eq` · `/eqconfig` · `/eq/presset`
Égaliseur paramétrique temps réel (bandes ON/OFF, suppression) et gestion des presets EQ
(mapping canal Input → Output).

### `/devices`
Appareils de sortie : contrôle volume (général + par canal selon `vban.channels`), mute,
EQ et état temps réel via WebSocket.

### `/snap` · `/bt` · `/control`
Snapcast (groupes, clients, latence), Bluetooth, panneau de contrôle général.

### `/settings`
Général, Notifications (in-app + Web Push), Security. Sections **admin** (gardées par
middleware `admin`) : Members, Spotify, Navigateurs (suivi des sessions navigateur + logs).

---

## Bibliothèque `/library` (multi-sources)

Client : `app/src/api/library.ts`. Mapping vers les composants `Item*` : `useLibraryMappers.ts`.

| Méthode | Endpoint | Rôle |
|---|---|---|
| `GET` | `/library/providers` | Sources disponibles (`{ source, lecteurId, canReindex }`) |
| `POST` | `/library/reindex` | Réindexer (`{ source? }`) |
| `GET` | `/library/search?q=&limit=&sources=` | Recherche multi-sources |
| `POST` | `/library/enqueue` | Ajouter une piste à la file `{ track }` |
| `POST` | `/library/play` | Lire `{ source, type, id\|uri, lecteurId }` |
| `GET` | `/library/categories?sources=&limit=` | Catégories |
| `GET` | `/library/playlists?category=&q=&sources=&limit=` | Playlists |
| `GET` | `/library/playlists/:source/:id/tracks?limit=` | Pistes d'une playlist |
| `POST` | `/library/playlists/:source/:id/enqueue` | Enfiler toute la playlist |
| `GET` | `/library/albums?q=&sources=&limit=` | Albums |
| `GET` | `/library/albums/:source/:id/tracks` | Pistes d'un album |
| `GET` | `/library/artists?q=&sources=&limit=` | Artistes |
| `GET` | `/library/artists/:source/:id/albums` | Albums d'un artiste |
| `GET` | `/library/artists/:source/:id/tracks` | Pistes d'un artiste |
| `GET` | `/library/cover/:source/:id` | Pochette (URL relative → préfixée `API_URL`) |

> Les objets utilisent `source`, `coverUrl`, `trackCount`, `durationMs`, `sourceId`/`id`.
> `resolveCoverUrl()` préfixe les covers relatives et laisse passer les URLs absolues / `data:`.

---

## Lecteurs — WebSocket `lecteur-live`

Composable `app/composables/useLecteursWs.ts`. Voir aussi `app/pages/lecteurs/API.md`.

**Serveur → front** : `Lecteur.Init`, `Lecteur.Update`, `Lecteur.Heartbeat` (1 s),
`Lecteur.Queue`, `Lecteur.Error`.

**Front → serveur** : `Lecteur.GetState`, `Lecteur.GetQueue`, `Lecteur.Play`, `Lecteur.Pause`,
`Lecteur.Resume`, `Lecteur.TogglePlayPause`, `Lecteur.Next`, `Lecteur.Prev`,
`Lecteur.SetVolume`, `Lecteur.SetShuffle`, `Lecteur.SetRepeat`, `Lecteur.Seek`, `Set.select`.

État d'un lecteur (`LecteurState`) : `id, name, type, alive, playing, shuffle, repeat, track,
temp, queue, volume, device_type, supports_volume`. (`playing` seul fait foi — pas de `paused`.)

Le lecteur « principal » est choisi via `Set.select` et mémorisé dans
`useDashboard().activeLecteurId` ; les commandes ciblent ce lecteur par défaut.

---

## Types de lecteurs & transports

| Type | Description |
|---|---|
| `spotify` | Client Spotify (librespot) |
| `fileplayer` | Lecture de fichiers locaux (queue, repeat, shuffle, seek) — cf. `app/API.md` |
| `deezer` | Client Deezer |
| `radio` | Flux radio HTTP |
| `local` | Fichier audio local |
| `localInput` | Capture audio ALSA |

| Transport | Description |
|---|---|
| `localStream` | Sortie sur device audio local (ALSA) |
| `StreamOutFifo` | Sortie vers pipe FIFO (ex. Snapcast) |
| `vban` / `sendVban` | Envoi réseau via protocole VBAN |

---

## Structure du projet

```
app/
├── pages/
│   ├── spotify.vue              # Bibliothèque multi-sources (/library) + lecteur fixe
│   ├── lecteurs/               # Liste, new, [id] (+ contrôle live FilePlayer)
│   ├── devices/                # Appareils de sortie (volume par canal)
│   ├── eq*.vue / eq/           # Égaliseur & presets
│   ├── snap/ · bt.vue · control/
│   └── settings/               # General, Notifications, Security, (admin) Members/Spotify/Browsers
│
├── components/
│   ├── spotify/components/
│   │   ├── HomeView.vue         # Accueil + recherche + filtres source (carousels)
│   │   ├── LibrarySidebar.vue   # Sidebar bibliothèque (/library)
│   │   ├── HScroll.vue          # Carousel horizontal (flèches, largeur bornée)
│   │   ├── ItemPlaylist/Album/Artist.vue  # Vues détail (events play/enqueue)
│   │   └── lecture.vue          # Lecteur fixe (WS lecteur-live)
│   ├── spotify/composable/useLibraryMappers.ts  # /library → forme Item*
│   ├── lecteur/services/        # Formulaires par type (dont FilePlayerServiceConfig)
│   ├── lecteur/transports/      # localStream / StreamOutFifo / Vban
│   ├── FilePlayerControl.vue     # Contrôle live d'un FilePlayer
│   ├── LecteurSlideover.vue      # Choix du lecteur principal
│   ├── LecteurQueueSlideover.vue # File d'attente
│   └── NotificationsSlideover.vue
│
├── composables/
│   ├── useAuth.ts · useDashboard.ts (état UI global, activeLecteurId)
│   ├── useLecteursWs.ts · useDeviceControlWs.ts · useSnapWs.ts · useWs.ts
│   ├── useCurrentUser.ts (JWT decode, isAdmin) · useNotifications.ts
│   └── useParametricEq.ts
│
├── src/
│   ├── api/  library.ts · lecteur.ts · eq.ts · admin.ts · notifications.ts
│   ├── lib/https.ts            # Axios + intercepteurs (Bearer, X-Browser, refresh 401)
│   └── config.ts
│
├── middleware/admin.ts          # Garde des routes admin
├── utils/ (browser.ts, cookies.ts, audioLayouts.ts, …)
├── layouts/default.vue
└── types/ (lecteur.ts, …)
```

---

## Authentification & sécurité

- Token Bearer dans le cookie `TOKEN` (`SameSite=Lax`), refresh via `/refresh`
  (cookie `REFRESH_TOKEN`, path proxifié à la racine)
- En-tête `X-Browser` (détection navigateur, cookie `BROWSER`) pour le suivi des sessions
- 401 → refresh automatique puis rejeu ; échec → redirection `/login`
- Routes admin protégées par le middleware `admin` + nav masquée si non-admin (`useCurrentUser`)

---

## Thème

- Couleur primaire : **green** · neutre : **zinc**
- Mode clair / sombre selon préférence

---

## Commandes utiles

```bash
pnpm lint          # ESLint
pnpm typecheck     # vue-tsc
```
