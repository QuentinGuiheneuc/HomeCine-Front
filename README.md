# HomeCine Front

Interface web de contrôle pour un serveur audio maison multi-sources. Permet de gérer les lecteurs audio (Spotify, Deezer, radio, fichiers locaux, entrée audio), les équaliseurs paramétriques, les appareils de sortie et la diffusion réseau (VBAN/Snapcast).

[![Nuxt UI](https://img.shields.io/badge/Made%20with-Nuxt%20UI-00DC82?logo=nuxt&labelColor=020420)](https://ui.nuxt.com)

---

## Stack technique

| Catégorie | Technologie |
|---|---|
| Framework | Nuxt 4 + Vue 3 |
| UI | Nuxt UI 4 (Tailwind CSS) |
| Langage | TypeScript |
| HTTP | Axios |
| Temps réel | WebSocket natif |
| Graphiques | Unovis |
| Validation | Zod |
| Icons | Lucide, Material Symbols, MDI |
| Package manager | pnpm 10 |

---

## Prérequis

- Node.js >= 20
- pnpm >= 10
- Serveur backend [HomeCine-Serv](../HomeCine-Serv) accessible (API REST + WebSocket)

---

## Installation

```bash
pnpm install
```

---

## Configuration

Les URLs du backend sont définies dans `app/src/config.ts` :

```ts
const appConfig = {
  API_URL: 'http://192.168.1.40:3007',  // API REST
  WS_URL:  'ws://192.168.1.40:8099'     // WebSocket
}
```

Modifie ces valeurs selon ton environnement réseau.

---

## Démarrage

```bash
# Développement (localhost)
pnpm dev

# Développement exposé sur le réseau local
pnpm host

# Build production
pnpm build

# Prévisualisation du build
pnpm preview
```

---

## Structure du projet

```
app/
├── pages/                        # Routes Nuxt (file-based routing)
│   ├── login.vue                 # Authentification
│   ├── index.vue                 # Tableau de bord
│   ├── spotify.vue               # Interface Spotify complète
│   ├── lecteurs/
│   │   ├── index.vue             # Liste des lecteurs
│   │   ├── new.vue               # Création d'un lecteur
│   │   └── [id].vue              # Édition d'un lecteur
│   ├── devices/
│   │   ├── index.vue             # Liste des appareils
│   │   └── [id].vue              # Détail d'un appareil
│   ├── eqconfig.vue              # Presets d'égalisation
│   ├── eq.vue                    # Visualisation EQ temps réel
│   ├── snap.vue                  # Diffusion Snapcast
│   ├── bt.vue                    # Bluetooth
│   ├── control/index.vue         # Panneau de contrôle global
│   └── settings/                 # Paramètres (membres, sécurité, Spotify…)
│
├── components/
│   ├── spotify/
│   │   ├── components/
│   │   │   ├── LibrarySidebar.vue  # Sidebar : Playlists / Albums / Artistes
│   │   │   ├── HomeView.vue        # Vue d'accueil Spotify
│   │   │   ├── ItemPlaylist.vue    # Détail d'une playlist / titres likés
│   │   │   ├── ItemAlbum.vue       # Détail d'un album
│   │   │   ├── ItemArtist.vue      # Détail d'un artiste
│   │   │   └── lecture.vue         # Player fixe (lecture en cours)
│   │   └── composable/
│   │       └── usePlaylists.ts     # Chargement et pagination des playlists
│   ├── lecteur/
│   │   ├── services/               # Formulaires par type de lecteur
│   │   └── transports/             # Sous-configs de transport audio
│   ├── DeviceSlideover.vue         # Panneau latéral contrôle appareil
│   └── ...
│
├── composables/
│   ├── useAuth.ts                # Authentification (login, token, logout)
│   ├── useLecteursWs.ts          # États lecteurs en temps réel (WebSocket)
│   ├── useDeviceBus.ts           # Contrôle du bus audio des appareils
│   ├── useDeviceControlWs.ts     # WebSocket contrôle appareil
│   ├── useParametricEq.ts        # Gestion des bandes EQ
│   ├── useDashboard.ts           # État global de l'UI
│   ├── useLikedSync.ts           # Synchronisation titres likés Spotify
│   ├── useSnapWs.ts              # WebSocket Snapcast
│   └── useToastHelpers.ts        # Notifications toast
│
├── src/
│   ├── api/
│   │   ├── lecteur.ts            # CRUD lecteurs
│   │   └── eq.ts                 # CRUD presets EQ
│   ├── lib/https.ts              # Instance Axios + intercepteur auth
│   └── config.ts                 # URLs API et WebSocket
│
├── utils/
│   ├── audioLayouts.ts           # 60+ layouts audio (mono → 22.2, ambisonics)
│   ├── lecteurOptions.ts         # Options par type de lecteur (bitrate, etc.)
│   └── eqTools.ts                # Calcul de courbes EQ
│
└── types/
    └── lecteur.ts                # Types TypeScript (Lecteur, ConfEq, etc.)
```

---

## Pages principales

### `/spotify`

Interface Spotify complète avec :

- **Sidebar** — trois onglets : Playlists, Albums (bibliothèque), Artistes (suivis) ; recherche locale instantanée ; chargement lazy par onglet
- **Titres likés** — chargement de toutes les pages, lecture séquentielle depuis n'importe quel titre
- **Playlist** — cover, description, liste des titres avec double-clic pour lire
- **Album** — cover, pistes numérotées, pagination "charger plus", navigation vers l'artiste
- **Artiste** — hero avec bannière floue, top 10 titres, discographie scrollable horizontalement
- **Player fixe** — affichage de la lecture en cours (titre, artiste, cover, progression)
- Deep-linking URL : `?pl=<id>`, `?al=<id>`, `?ar=<id>`

> **Note backend** : nécessite les routes Spotify du backend (API Feb 2026) :
> `GET /spotify/albums/:id`, `GET /spotify/artists/:id`, etc.

### `/lecteurs`

Liste de tous les lecteurs audio. Chaque lecteur a un type (Spotify, Deezer, Radio, Local, LocalInput) et une configuration spécifique. Démarrage/arrêt depuis la liste.

### `/lecteurs/new` et `/lecteurs/[id]`

Création et édition d'un lecteur. Le formulaire de configuration s'adapte dynamiquement selon le type choisi. Section EQ pour associer un preset d'égalisation.

### `/eqconfig`

Gestion des presets EQ. Chaque preset définit :
- Sample rate
- Fichier de config EQ (`path_eq`)
- Layout d'entrée (ex. `7.1`)
- Mapping canal par canal Input → Output (tableau scrollable, découpé en blocs de 12)

### `/devices`

Liste des appareils audio de sortie. Panneau latéral (`DeviceSlideover`) pour le contrôle de volume, EQ et état.

---

## Types de lecteurs

| Type | Description | Config notable |
|---|---|---|
| `spotify` | Client Spotify (librespot) | bitrate, device-type, typeStream |
| `deezer` | Client Deezer | bitrate, device-type, typeStream |
| `radio` | Flux radio HTTP | URL du flux, typeStream |
| `local` | Fichier audio local | source_path, loop, typeStream |
| `localInput` | Capture audio ALSA | pcm_device, layout sortie, master_gain_db, typeStream |

### Transports disponibles

| Transport | Description |
|---|---|
| `localStream` | Sortie sur device audio local (ALSA) |
| `StreamOutFifo` | Sortie vers un pipe FIFO (ex. Snapcast) |
| `vban` | Envoi réseau via protocole VBAN |

---

## API backend consommée

### Authentification & système

| Méthode | Endpoint | Rôle |
|---|---|---|
| `POST` | `/login` | Authentification → `access_token` |
| `POST` | `/logout` | Déconnexion |

### Lecteurs

| Méthode | Endpoint | Rôle |
|---|---|---|
| `GET` | `/lecteur` | Liste des lecteurs |
| `GET` | `/lecteur/:id` | Détail d'un lecteur |
| `POST` | `/lecteur` | Créer un lecteur |
| `PUT` | `/lecteur/:id` | Modifier un lecteur |
| `PUT` | `/lecteur/:id/start` | Démarrer un lecteur |
| `PUT` | `/lecteur/:id/stop` | Arrêter un lecteur |
| `DELETE` | `/lecteur/:id` | Supprimer un lecteur |

### Égalisation

| Méthode | Endpoint | Rôle |
|---|---|---|
| `GET` | `/eq` | Liste des presets EQ |
| `GET` | `/eq/:id` | Détail d'un preset |
| `POST` | `/eq` | Créer un preset |
| `PUT` | `/eq/:id` | Modifier un preset |
| `DELETE` | `/eq/:id` | Supprimer un preset |

### Spotify (API Feb 2026)

| Méthode | Endpoint | Rôle |
|---|---|---|
| `GET` | `/spotify/me` | Profil utilisateur |
| `GET` | `/spotify/me/tracks` | Titres likés (paginé) |
| `GET` | `/spotify/playlists/me` | Playlists de l'utilisateur |
| `GET` | `/spotify/playlists/:id` | Détail d'une playlist |
| `GET` | `/spotify/me/albums` | Albums sauvegardés |
| `GET` | `/spotify/albums/:id` | Détail d'un album |
| `GET` | `/spotify/albums/:id/tracks` | Pistes d'un album (pagination) |
| `GET` | `/spotify/me/following/artists` | Artistes suivis |
| `GET` | `/spotify/artists/:id` | Détail d'un artiste |
| `GET` | `/spotify/artists/:id/top-tracks` | Top 10 titres d'un artiste |
| `GET` | `/spotify/artists/:id/albums` | Discographie d'un artiste |
| `PUT` | `/spotify/devices/play` | Lancer la lecture |
| `GET` | `/spotify/me/player/recently-played` | Historique de lecture |

### WebSocket

| URL | Rôle |
|---|---|
| `ws://.../lecteur` | États temps réel des lecteurs (start/stop/error) |
| `ws://.../controlOfDevice` | Contrôle des appareils (volume, EQ) |
| `ws://.../snap` | État de la diffusion Snapcast |

Protocole JSON-RPC : `{ method: "Lecteur.State", params: [...] }`

---

## Authentification

- Token Bearer stocké dans un cookie `TOKEN` (`sameSite: lax`)
- Middleware global (`auth.global.ts`) : redirige vers `/login` si pas de token
- Les erreurs 401/403 des routes Spotify ne déclenchent **pas** de déconnexion (scope Spotify manquant ≠ session expirée)

---

## Thème

- Couleur primaire : **green**
- Couleur neutre : **zinc**
- Mode clair/sombre : toggle sur la page de login, préférence système ensuite

---

## Commandes utiles

```bash
pnpm lint          # Linting ESLint
pnpm typecheck     # Vérification TypeScript (vue-tsc)
```
