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
| Icons | Lucide, Material Symbols, MDI |
| Package manager | pnpm |

---

## Prérequis

- Node.js >= 20
- pnpm >= 10
- Serveur backend HomeCine-Serv accessible (API REST + WebSocket)

---

## Installation

```bash
pnpm install
```

---

## Configuration

Les URLs du backend sont définies dans `app/src/config.ts` :

```ts
API_URL: 'http://192.168.1.40:3007'   // API REST
WS_URL:  'ws://192.168.1.40:8099'     // WebSocket
```

Modifie ces valeurs selon ton environnement. La variable d'environnement `WS_BASE` peut aussi être utilisée pour le WebSocket :

```env
WS_BASE=ws://192.168.1.40:8099
```

---

## Démarrage

```bash
# Développement (localhost)
pnpm dev

# Développement (exposé sur le réseau local)
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
├── pages/                  # Routes (file-based routing Nuxt)
│   ├── login.vue           # Authentification
│   ├── index.vue           # Tableau de bord
│   ├── lecteurs/           # Gestion des lecteurs audio
│   │   ├── index.vue       # Liste
│   │   ├── new.vue         # Création
│   │   └── [id].vue        # Édition
│   ├── devices/            # Appareils de sortie
│   │   ├── index.vue
│   │   └── [id].vue
│   ├── eqconfig.vue        # Presets d'égalisation
│   ├── eq.vue              # Visualisation EQ temps réel
│   ├── spotify.vue         # Interface Spotify
│   ├── snap.vue            # Diffusion Snapcast
│   ├── bt.vue              # Bluetooth
│   ├── control/            # Panneau de contrôle
│   └── settings/           # Paramètres (membres, sécurité, Spotify…)
│
├── components/
│   ├── lecteur/
│   │   ├── services/       # Formulaires par type de lecteur
│   │   │   ├── SpotifyServiceConfig.vue
│   │   │   ├── DeezerServiceConfig.vue
│   │   │   ├── RadioServiceConfig.vue
│   │   │   ├── LocalServiceConfig.vue
│   │   │   └── LocalInputServiceConfig.vue
│   │   └── transports/     # Sous-configs de transport audio
│   │       ├── LocalStreamConfig.vue
│   │       ├── StreamOutFifoConfig.vue
│   │       └── VbanConfig.vue
│   ├── spotify/            # Interface lecteur Spotify
│   ├── DeviceSlideover.vue # Panneau latéral de contrôle appareil
│   └── ...
│
├── composables/
│   ├── useAuth.ts          # Authentification (login, token, logout)
│   ├── useLecteursWs.ts    # États lecteurs en temps réel (WebSocket)
│   ├── useDeviceBus.ts     # Contrôle du bus audio des appareils
│   ├── useParametricEq.ts  # Gestion des bandes EQ
│   └── useDashboard.ts     # État global de l'UI (sliders, panneaux)
│
├── src/
│   ├── api/
│   │   ├── lecteur.ts      # CRUD lecteurs
│   │   └── eq.ts           # CRUD presets EQ
│   ├── lib/https.ts        # Instance Axios + intercepteur auth
│   └── config.ts           # URLs API et WebSocket
│
├── utils/
│   ├── audioLayouts.ts     # 60+ layouts audio (mono → 22.2, ambisonics)
│   ├── lecteurOptions.ts   # Options par type de lecteur (bitrate, etc.)
│   └── eqTools.ts          # Calcul de courbes EQ
│
└── types/
    └── lecteur.ts          # Types TypeScript (Lecteur, ConfEq, etc.)
```

---

## Pages principales

### `/lecteurs`
Liste de tous les lecteurs audio. Chaque lecteur a un type (Spotify, Deezer, Radio, Local, LocalInput) et une configuration spécifique. Démarrage/arrêt depuis la liste.

### `/lecteurs/new`
Création d'un lecteur. Le formulaire de configuration s'adapte dynamiquement selon le type choisi. Section EQ pour associer un preset d'égalisation (chargé depuis `/eq`).

### `/lecteurs/[id]`
Édition d'un lecteur existant. Mêmes champs que la création + contrôles Start/Stop.

### `/eqconfig`
Gestion des presets EQ. Chaque preset définit :
- Sample rate
- Fichier de config EQ (`path_eq`)
- Layout d'entrée (ex. `7.1`)
- Mapping canal par canal Input → Output (tableau scrollable, découpé en blocs de 12 si > 12 canaux)

### `/spotify`
Interface de lecture Spotify : bibliothèque, playlists, titres likés, lecture par URI.

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

### Transports disponibles (par lecteur)

| Transport | Description |
|---|---|
| `localStream` | Sortie sur device audio local (index ALSA) |
| `StreamOutFifo` | Sortie vers un pipe FIFO (ex. Snapcast) |
| `vban` | Envoi réseau via protocole VBAN |

---

## API backend consommée

| Méthode | Endpoint | Rôle |
|---|---|---|
| `POST` | `/login` | Authentification → `access_token` |
| `POST` | `/logout` | Déconnexion |
| `GET` | `/lecteur` | Liste des lecteurs |
| `GET` | `/lecteur/:id` | Détail d'un lecteur |
| `POST` | `/lecteur` | Créer un lecteur |
| `PUT` | `/lecteur/:id` | Modifier un lecteur |
| `PUT` | `/lecteur/:id/start` | Démarrer un lecteur |
| `PUT` | `/lecteur/:id/stop` | Arrêter un lecteur |
| `DELETE` | `/lecteur/:id` | Supprimer un lecteur |
| `GET` | `/eq` | Liste des presets EQ |
| `GET` | `/eq/:id` | Détail d'un preset EQ |
| `POST` | `/eq` | Créer un preset EQ |
| `PUT` | `/eq/:id` | Modifier un preset EQ |
| `DELETE` | `/eq/:id` | Supprimer un preset EQ |
| `GET` | `/spotify/me/tracks` | Titres likés Spotify |
| `POST` | `/spotify/audio` | Lancer une URL Spotify |

### WebSocket

| URL | Rôle |
|---|---|
| `ws://.../lecteur` | États temps réel des lecteurs (start/stop/error) |
| `ws://.../controlOfDevice` | Contrôle des appareils (volume, EQ) |

Protocole JSON-RPC : `{ method: "Lecteur.State", params: [...] }`

---

## Authentification

- Token Bearer stocké dans un cookie `TOKEN` (`sameSite: lax`)
- Middleware global : redirige vers `/login` si pas de token
- Réponses 401/402/403 → logout automatique + redirection `/login`

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
