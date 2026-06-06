# FilePlayer — Contrat Front

Référence complète pour piloter le **FilePlayer** depuis le front :
config d'instanciation, commandes (front → player) et events (player → front).

- Côté Node : classe `FilePlayer` (`modules/lecteur/FilePlayer/index.ts`).
- Côté Python : `player.py` (process spawné, IPC via stdin/stdout).
- Les commandes sont envoyées par `send(cmd)` ou les méthodes dédiées.
- Les events sont émis par l'`EventEmitter` du `FilePlayer` Node.

---

## 1. Config (à l'instanciation)

```jsonc
{
  "name": "Salon",
  "typeStream": "StreamOutFifo",   // "StreamOutFifo" | "sendVban" | "localStream"
  "queue":   ["/data/a.mp3", "/data/b.flac"],
  "volume":  85,                    // 0–100
  "repeat":  false,
  "shuffle": false,

  // ── UNE des 3 sorties selon typeStream ──────────────────────────────
  "StreamOutFifo": {
    "path-audio": "/tmp/fileplayer/out.fifo",
    "channels":   8,
    "rate":       48000,
    "config":     "7.1",            // nom du layout (chanels.ts) → ordre des canaux
    "order":      ["FL","FR","FC","LFE","BL","BR","SL","SR"]  // optionnel, prioritaire
  },
  "sendVban":    { "stream": { "host":"127.0.0.1","port":6980,"name":"stream","channels":2,"rate":44100 } },
  "localStream": { "stream": { "channels":2,"rate":44100,"output_device_index":0 } },

  // ── EQ (optionnel) ──────────────────────────────────────────────────
  "eq": {
    "eq":            true,          // active l'EQ
    "order":         ["FL","FR","FC","LFE","BL","BR","SL","SR"],
    "channels":      8,             // sinon = channels de la sortie
    "rate":          48000,         // sinon = rate de la sortie
    "path-eq":       "/data/eq_salon.json",
    "gain_in_db":    -6.0,          // optionnel : trim d'entrée avant filtres (headroom)
    "center_r_boost": 1.0           // optionnel : pondération R dans le mono (upmix)
  }
}
```

**Résolution de l'ordre des canaux** (upmix + EQ partagent le même) :
`StreamOutFifo.order` → `eq.order` → `chanels.ts[config]`.

**Upmix Python** (stéréo → multicanal) : actif quand la sortie a > 2 canaux.
Mapping par label (cf. `upmix.py`) — `FC`/`LFE` = mono, `FLC`/`FRC` pondérés,
autres = copie `L`/`R`.

---

## 2. Commandes (front → player)

| Méthode TS | Commande JSON | Paramètres |
|---|---|---|
| `Play()` / `Play(path)` | `{"cmd":"play"}` | `path?` — insère en tête + joue |
| `Pause()` | `{"cmd":"pause"}` | — |
| `Resume()` | `{"cmd":"resume"}` | — |
| `{"cmd":"stop"}` | `{"cmd":"stop"}` | arrête la lecture (≠ `Stop()` qui tue le process) |
| `Next()` | `{"cmd":"next"}` | — |
| `Prev()` | `{"cmd":"prev"}` | — |
| `Seek(s)` | `{"cmd":"seek","position":42.5}` | `position` en secondes (borné `[0, durée]`) |
| `SetVolume(v)` | `{"cmd":"volume","value":85}` | `value` 0–100 (gain live, sans relancer ffmpeg) |
| `SetQueue(files)` | `{"cmd":"queue","files":[...]}` | `files[]` — remplace toute la queue et démarre |
| `AddToQueue(files)` | `{"cmd":"add","files":[...]}` | `files[]` — ajoute en fin (démarre si arrêté) |
| `RemoveFromQueue(i)` | `{"cmd":"remove","index":2}` | `index` — enchaîne sur le suivant si c'était le courant |
| `MoveInQueue(a,b)` | `{"cmd":"move","from":3,"to":0}` | `from`, `to` — ne coupe pas la lecture |
| `SetRepeat(b)` | `{"cmd":"repeat","value":true}` | `value` |
| `SetShuffle(b)` | `{"cmd":"shuffle","value":true}` | `value` |
| `GetStatus()` | `{"cmd":"status"}` | — → émet `status_reply` |
| — | `{"cmd":"eq_reload"}` | recharge les filtres EQ depuis le JSON (à chaud) |

**Extensions acceptées** (queue / add) :
`.mp3 .flac .aac .m4a .ogg .opus .wav .aiff .aif .wma .alac .ape .m4b .mp4`
`.mkv .mka .dts .dtshd .ac3 .eac3 .thd .mlp .mxf`

---

## 3. Events (player → front)

### Events typés

```js
player.on("track",        (data) => { /* changement de morceau */ });
player.on("state",        (data) => { /* changement d'état */ });
player.on("queue",        (data) => { /* queue modifiée */ });
player.on("status_reply", (data) => { /* réponse à GetStatus() */ });
player.on("error_msg",    (data) => { /* erreur */ });
player.on("ffmpeg_args",  (data) => { /* debug/test */ });
player.on("log",          (data) => { /* ligne brute */ });
```

| Event | `data` |
|---|---|
| `track` | `{event:"track_change", path, title, artist, album, cover_url, duration, position, volume, index, total, src_channels, src_rate, out_channels, out_rate, out_layout}` |
| `state` | `{event:"<voir liste>", ...}` |
| `queue` | `{event:"queue_update", queue:[...], total, index}` |
| `status_reply` | `{event:"status", playing, paused, index, total, volume, repeat, shuffle, position, duration, current}` |
| `error_msg` | `{event:"error"\|"ffmpeg_failed", msg?, path?, code?, stderr?}` |
| `log` | `{type:"raw", raw}` |

**Valeurs de `state.event`** :
`ready` · `playing` · `paused` · `stopped` · `track_end` ·
`volume` · `repeat` · `shuffle` · `seek` · `eq_loaded` · `eq_reloaded`.

### Flux générique (broadcast WebSocket)

```js
player.on("event", (arr) => {
  // arr = [{ type, ...data }]
  // type ∈ "track_change" | "state_change" | "queue_update"
  //        | "status" | "error" | "progress"
});
```

**Progress** (barre de lecture, émis ~1×/seconde, uniquement dans le flux générique) :

```json
{ "type":"progress", "event":"progress", "position": 42.0, "duration": 207.76, "index": 1 }
```

---

## 4. Cycle de vie (méthodes TS)

| Méthode | Retour |
|---|---|
| `Start()` | `void` — spawn le process Python |
| `Stop()` | `{ok:true}` \| `{error}` — SIGTERM puis SIGKILL après 4 s |
| `Restart({timeoutMs, backoffMs})` | `Promise<{ok, reason?, error?}>` |
| `Status()` | `{alive, pid, starting, name}` |
| `send(cmd)` | `Promise` — envoi brut d'une commande |

---

## 5. Exemple front (pseudo-code)

```js
// Abonnement temps réel
player.on("track",  t => ui.showTrack(t));
player.on("queue",  q => ui.renderQueue(q.queue, q.index));
player.on("event",  arr => arr.forEach(e => {
  if (e.type === "progress") ui.updateSeekbar(e.position, e.duration);
  if (e.type === "error")    ui.toast(e.msg ?? e.event);
}));

// Contrôles
btnPlay.onclick   = () => player.Play();
btnNext.onclick   = () => player.Next();
seekbar.onchange  = v  => player.Seek(v);
volume.onchange   = v  => player.SetVolume(v);
trash.onclick     = i  => player.RemoveFromQueue(i);
dragDrop.onmove   = (a,b) => player.MoveInQueue(a, b);
```
