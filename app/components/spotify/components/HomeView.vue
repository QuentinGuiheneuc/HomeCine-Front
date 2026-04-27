<script setup lang="ts">
import http from '@/src/lib/https'

/* ═══════════════════════════════════════════════
   TYPES  (miroir des réponses API Spotify)
═══════════════════════════════════════════════ */
type SpotifyImage = { url: string; width?: number | null; height?: number | null }
type Artist = { id: string; name: string }

type UserProfile = {
  id: string
  display_name?: string | null
  images?: SpotifyImage[]
}

type SimplePlaylist = {
  id: string
  name: string
  description?: string | null
  images?: SpotifyImage[]
  uri: string
  tracks?: { total: number }
  owner?: { display_name?: string }
  type: 'playlist'
}

type SimpleAlbum = {
  id: string
  name: string
  release_date: string
  images?: SpotifyImage[]
  artists?: Artist[]
  album_type?: string
  uri: string
  type: 'album'
}

type RecentItem = {
  played_at: string
  /** type peut être 'track' | 'playlist' | 'album' selon le contexte */
  context_type?: string
  context_uri?: string
  id: string
  name: string
  subtitle: string
  image?: string
  uri: string
  playlist_id?: string  // si c'est une playlist, pour la navigation
}

/* ═══════════════════════════════════════════════
   ÉMISSIONS
═══════════════════════════════════════════════ */
const emit = defineEmits<{
  (e: 'select-playlist', id: string): void
  (e: 'open-liked'): void
  (e: 'play-uri', uri: string): void
}>()

/* ═══════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════ */
const user            = ref<UserProfile | null>(null)
const recentlyPlayed  = ref<RecentItem[]>([])
const featured        = ref<SimplePlaylist[]>([])
const newReleases     = ref<SimpleAlbum[]>([])
const madeForYou      = ref<SimplePlaylist[]>([])
const loading         = ref(true)
const gradientColor   = ref('#1e3a2f')  // recalculé selon l'heure

/* ═══════════════════════════════════════════════
   GREETING
═══════════════════════════════════════════════ */
const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bonne après-midi'
  return 'Bonsoir'
})

/* ═══════════════════════════════════════════════
   DONNÉES MOCK
   → à remplacer par les appels API ci-dessous
═══════════════════════════════════════════════ */
const MOCK_USER: UserProfile = {
  id: 'mock',
  display_name: 'Utilisateur',
  images: []
}

const MOCK_RECENTLY_PLAYED: RecentItem[] = [
  { played_at: '', id: 'liked',   name: 'Titres likés',       subtitle: 'Vos coups de cœur',        image: '__liked__',                                                          uri: '', playlist_id: 'liked' },
  { played_at: '', id: 'r2',     name: 'Chill Vibes',        subtitle: 'Playlist • Spotify',        image: 'https://picsum.photos/seed/chillvibes/300/300',                      uri: 'spotify:playlist:r2', playlist_id: 'r2' },
  { played_at: '', id: 'r3',     name: 'After Hours',        subtitle: 'Album • The Weeknd',        image: 'https://picsum.photos/seed/afterhours/300/300',                      uri: 'spotify:album:r3' },
  { played_at: '', id: 'r4',     name: 'Hits du Moment',     subtitle: 'Playlist • Spotify',        image: 'https://picsum.photos/seed/hits2024/300/300',                        uri: 'spotify:playlist:r4', playlist_id: 'r4' },
  { played_at: '', id: 'r5',     name: 'Rock Classiques',    subtitle: 'Playlist • Vous',           image: 'https://picsum.photos/seed/rockclassic/300/300',                     uri: 'spotify:playlist:r5', playlist_id: 'r5' },
  { played_at: '', id: 'r6',     name: 'Découvertes 2025',   subtitle: 'Playlist • Spotify',        image: 'https://picsum.photos/seed/discover2025/300/300',                    uri: 'spotify:playlist:r6', playlist_id: 'r6' },
]

const MOCK_FEATURED: SimplePlaylist[] = [
  { id: 'f1', name: 'Top 50 Global',      description: 'Les 50 titres les plus écoutés dans le monde.', images: [{ url: 'https://picsum.photos/seed/top50/300/300' }],         uri: 'spotify:playlist:f1', tracks: { total: 50 },  type: 'playlist' },
  { id: 'f2', name: 'Mood Booster',       description: 'Pour remonter le moral en un instant !',        images: [{ url: 'https://picsum.photos/seed/moodboost/300/300' }],     uri: 'spotify:playlist:f2', tracks: { total: 78 },  type: 'playlist' },
  { id: 'f3', name: 'Deep Focus',         description: 'Musique pour la concentration.',                images: [{ url: 'https://picsum.photos/seed/deepfocus/300/300' }],     uri: 'spotify:playlist:f3', tracks: { total: 144 }, type: 'playlist' },
  { id: 'f4', name: 'Peaceful Piano',     description: 'Piano calme pour se détendre.',                 images: [{ url: 'https://picsum.photos/seed/piano/300/300' }],         uri: 'spotify:playlist:f4', tracks: { total: 90 },  type: 'playlist' },
  { id: 'f5', name: 'Énergie du Matin',   description: 'Commencez votre journée plein d\'énergie.',    images: [{ url: 'https://picsum.photos/seed/morning/300/300' }],        uri: 'spotify:playlist:f5', tracks: { total: 62 },  type: 'playlist' },
  { id: 'f6', name: 'Soirée Jazz',        description: 'Les grands classiques du jazz.',                images: [{ url: 'https://picsum.photos/seed/jazz2025/300/300' }],       uri: 'spotify:playlist:f6', tracks: { total: 115 }, type: 'playlist' },
  { id: 'f7', name: 'Workout',            description: 'Motivation maximale à la salle.',               images: [{ url: 'https://picsum.photos/seed/workoutsport/300/300' }],  uri: 'spotify:playlist:f7', tracks: { total: 55 },  type: 'playlist' },
  { id: 'f8', name: 'Rap FR 2025',        description: 'Le meilleur du rap français.',                  images: [{ url: 'https://picsum.photos/seed/rapfr25/300/300' }],        uri: 'spotify:playlist:f8', tracks: { total: 80 },  type: 'playlist' },
]

const MOCK_NEW_RELEASES: SimpleAlbum[] = [
  { id: 'n1', name: 'Chromakopia',   artists: [{ id: 'a1', name: 'Tyler, The Creator' }],  images: [{ url: 'https://picsum.photos/seed/chromak/300/300' }],    release_date: '2024-10-11', album_type: 'album',  uri: 'spotify:album:n1', type: 'album' },
  { id: 'n2', name: 'Short n\' Sweet', artists: [{ id: 'a2', name: 'Sabrina Carpenter' }], images: [{ url: 'https://picsum.photos/seed/shortsweet/300/300' }], release_date: '2024-08-23', album_type: 'album',  uri: 'spotify:album:n2', type: 'album' },
  { id: 'n3', name: 'Hit Me Hard…',  artists: [{ id: 'a3', name: 'Billie Eilish' }],       images: [{ url: 'https://picsum.photos/seed/billie2024/300/300' }], release_date: '2024-05-17', album_type: 'album',  uri: 'spotify:album:n3', type: 'album' },
  { id: 'n4', name: 'GNX',           artists: [{ id: 'a4', name: 'Kendrick Lamar' }],      images: [{ url: 'https://picsum.photos/seed/gnxkendrick/300/300' }],release_date: '2024-11-22', album_type: 'album',  uri: 'spotify:album:n4', type: 'album' },
  { id: 'n5', name: 'One of the Boys', artists: [{ id: 'a5', name: 'Katy Perry' }],        images: [{ url: 'https://picsum.photos/seed/katyperrynew/300/300' }],release_date: '2024-09-05', album_type: 'single', uri: 'spotify:album:n5', type: 'album' },
  { id: 'n6', name: 'Cowboy Carter', artists: [{ id: 'a6', name: 'Beyoncé' }],             images: [{ url: 'https://picsum.photos/seed/cowboybey/300/300' }],  release_date: '2024-03-29', album_type: 'album',  uri: 'spotify:album:n6', type: 'album' },
  { id: 'n7', name: 'Eternal Sunshine', artists: [{ id: 'a7', name: 'Ariana Grande' }],   images: [{ url: 'https://picsum.photos/seed/ariana2024/300/300' }],  release_date: '2024-03-08', album_type: 'album',  uri: 'spotify:album:n7', type: 'album' },
  { id: 'n8', name: 'Manning Fireworks', artists: [{ id: 'a8', name: 'MJ Lenderman' }],   images: [{ url: 'https://picsum.photos/seed/mjlender/300/300' }],    release_date: '2024-09-06', album_type: 'album',  uri: 'spotify:album:n8', type: 'album' },
]

const MOCK_MADE_FOR_YOU: SimplePlaylist[] = [
  { id: 'm1', name: 'Découvertes de la semaine',  description: 'Nouveautés choisies pour vous.',          images: [{ url: 'https://picsum.photos/seed/discov1/300/300' }],     uri: 'spotify:playlist:m1', type: 'playlist' },
  { id: 'm2', name: 'Radar des sorties',          description: 'Suivez vos artistes préférés.',           images: [{ url: 'https://picsum.photos/seed/radar/300/300' }],       uri: 'spotify:playlist:m2', type: 'playlist' },
  { id: 'm3', name: 'Mélange quotidien 1',        description: 'Basé sur votre humeur musicale.',         images: [{ url: 'https://picsum.photos/seed/daily1/300/300' }],      uri: 'spotify:playlist:m3', type: 'playlist' },
  { id: 'm4', name: 'Mélange quotidien 2',        description: 'Un autre mélange fait pour vous.',        images: [{ url: 'https://picsum.photos/seed/daily2/300/300' }],      uri: 'spotify:playlist:m4', type: 'playlist' },
  { id: 'm5', name: 'Revisités',                  description: 'Vos anciens coups de cœur.',              images: [{ url: 'https://picsum.photos/seed/revisit/300/300' }],     uri: 'spotify:playlist:m5', type: 'playlist' },
  { id: 'm6', name: 'Mélange quotidien 3',        description: 'Explorez de nouveaux genres.',            images: [{ url: 'https://picsum.photos/seed/daily3/300/300' }],      uri: 'spotify:playlist:m6', type: 'playlist' },
]

/* ═══════════════════════════════════════════════
   APPELS API
   Endpoints backend (HomeCine-Serv/modules/spotify) :
     GET /spotify/me
     GET /spotify/me/player/recently-played
     GET /spotify/browse/featured-playlists
     GET /spotify/browse/new-releases
     GET /spotify/playlists/me  (pour "Faits pour vous")
═══════════════════════════════════════════════ */

/** Profil utilisateur — GET /spotify/me */
async function fetchUser() {
  try {
    const { data } = await http.get<UserProfile>('/spotify/me')
    user.value = data
  } catch (e) {
    console.warn('[HomeView] fetchUser – fallback mock', e)
    user.value = MOCK_USER
  }
}

/**
 * Récemment joués — GET /spotify/me/player/recently-played
 * Scope requis : user-read-recently-played
 * Réponse : { items: Array<{ played_at, context, track }>, cursors, next, limit }
 * On déduplique par track.id pour n'afficher chaque titre qu'une seule fois.
 */
async function fetchRecentlyPlayed() {
  try {
    const { data } = await http.get<{ items: Array<{ played_at: string; context: any; track: any }> }>(
      '/spotify/me/player/recently-played', { params: { limit: 20 } }
    )
    const seen = new Set<string>()
    const items: RecentItem[] = []
    for (const it of (data.items ?? [])) {
      const t = it.track
      if (!t?.id || seen.has(t.id)) continue
      seen.add(t.id)
      items.push({
        played_at:    it.played_at,
        context_type: it.context?.type,
        context_uri:  it.context?.uri,
        id:           t.id,
        name:         t.name,
        subtitle:     (t.artists ?? []).map((a: Artist) => a.name).join(', '),
        image:        t.album?.images?.[1]?.url ?? t.album?.images?.[0]?.url,
        uri:          t.uri,
      })
      if (items.length >= 12) break
    }
    if (items.length) recentlyPlayed.value = items
    else recentlyPlayed.value = MOCK_RECENTLY_PLAYED
  } catch (e) {
    console.warn('[HomeView] fetchRecentlyPlayed – fallback mock', e)
    recentlyPlayed.value = MOCK_RECENTLY_PLAYED
  }
}

// ⚠️ GET /browse/featured-playlists et GET /browse/new-releases sont dépréciés
// par Spotify depuis 2024 (403 pour les nouvelles apps). On garde les mocks.
// Remplacer par une alternative si Spotify en propose une à l'avenir.

/**
 * Faits pour vous — GET /spotify/playlists/me?limit=50
 * Filtre les playlists dont le owner est Spotify + mots-clés caractéristiques.
 */
async function fetchMadeForYou() {
  try {
    const { data } = await http.get<{ items: SimplePlaylist[] }>(
      '/spotify/playlists/me', { params: { limit: 50 } }
    )
    const keywords = ['mix', 'découverte', 'radar', 'revisit', 'daily', 'weekly', 'mélange', 'release']
    const items = (data.items ?? [])
      .filter((p: any) =>
        (p.owner?.id === 'spotify' || p.owner?.display_name?.toLowerCase() === 'spotify') &&
        keywords.some(k => p.name.toLowerCase().includes(k))
      )
      .slice(0, 8)
      .map((p: any) => ({ ...p, type: 'playlist' as const }))
    if (items.length) madeForYou.value = items
    else madeForYou.value = MOCK_MADE_FOR_YOU
  } catch (e) {
    console.warn('[HomeView] fetchMadeForYou – fallback mock', e)
    madeForYou.value = MOCK_MADE_FOR_YOU
  }
}

/* ═══════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════ */
onMounted(async () => {
  // gradient selon l'heure
  const h = new Date().getHours()
  if (h < 6)       gradientColor.value = '#0d1b2a'
  else if (h < 12) gradientColor.value = '#1a2e1c'
  else if (h < 18) gradientColor.value = '#2a1f0e'
  else             gradientColor.value = '#1a1a2e'

  // appels API fonctionnels (featured-playlists et new-releases sont dépréciés par Spotify → mocks)
  await Promise.allSettled([
    fetchUser(),
    fetchRecentlyPlayed(),
    fetchMadeForYou(),
  ])
  featured.value      = MOCK_FEATURED
  newReleases.value   = MOCK_NEW_RELEASES

  loading.value = false
})

/* ═══════════════════════════════════════════════
   ACTIONS
═══════════════════════════════════════════════ */
async function playUri(uri: string) {
  try {
    await http.put('/spotify/devices/play', { context_uri: uri, offset: { position: 0 } })
  } catch (e) {
    console.warn('[HomeView] playUri', e)
  }
}

function handleCardClick(item: { id: string; playlist_id?: string; uri?: string; type?: string }) {
  if (item.id === 'liked' || item.playlist_id === 'liked') {
    emit('open-liked')
    return
  }
  if (item.playlist_id) { emit('select-playlist', item.playlist_id); return }
  if (item.type === 'playlist') { emit('select-playlist', item.id); return }
  // album ou track → play direct
  if (item.uri) emit('play-uri', item.uri)
}

function handleShortcutClick(item: RecentItem) {
  if (item.id === 'liked' || item.playlist_id === 'liked') { emit('open-liked'); return }
  if (item.playlist_id) { emit('select-playlist', item.playlist_id); return }
  if (item.uri) emit('play-uri', item.uri)
}
</script>

<template>
  <div class="h-full overflow-y-auto">

    <!-- Fond dégradé dynamique en haut -->
    <div
      class="relative"
      :style="{ background: `linear-gradient(to bottom, ${gradientColor}cc 0%, transparent 340px)` }"
    >
      <div class="px-6 pt-8 pb-6 space-y-8">

        <!-- ── Greeting ── -->
        <div class="flex items-center justify-between">
          <h1 class="text-3xl font-bold">{{ greeting }}</h1>
          <USkeleton v-if="loading" class="h-8 w-32" />
          <span v-else-if="user?.display_name" class="text-sm text-dimmed">{{ user.display_name }}</span>
        </div>

        <!-- ── Shortcuts (6 tuiles compactes en haut) ── -->
        <div v-if="loading" class="grid grid-cols-2 xl:grid-cols-3 gap-2">
          <USkeleton v-for="i in 6" :key="i" class="h-16 rounded" />
        </div>
        <div v-else class="grid grid-cols-2 xl:grid-cols-3 gap-2">
          <button
            v-for="item in recentlyPlayed.slice(0, 6)"
            :key="item.id"
            class="group flex items-center gap-0 bg-white/[0.07] hover:bg-white/[0.14] rounded overflow-hidden transition-colors text-left relative"
            @click="handleShortcutClick(item)"
          >
            <!-- image ou gradient "liked" -->
            <div
              v-if="item.image === '__liked__'"
              class="h-16 w-16 shrink-0 bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center"
            >
              <UIcon name="i-lucide-heart" class="text-white size-6" />
            </div>
            <img
              v-else
              :src="item.image"
              class="h-16 w-16 object-cover shrink-0"
              alt=""
              loading="lazy"
            />
            <span class="px-3 text-sm font-semibold leading-tight truncate">{{ item.name }}</span>

            <!-- bouton play au hover -->
            <div class="absolute right-2 opacity-0 group-hover:opacity-100 transition-all translate-y-1 group-hover:translate-y-0">
              <button
                class="h-8 w-8 rounded-full bg-[#1DB954] flex items-center justify-center shadow-lg"
                @click.stop="item.uri && playUri(item.uri)"
              >
                <UIcon name="i-lucide-play" class="text-black size-4 ml-0.5" />
              </button>
            </div>
          </button>
        </div>

        <!-- ── Section réutilisable ── -->
        <template v-if="!loading">

          <!-- Récemment joués -->
          <section>
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-xl font-bold">Récemment joués</h2>
              <button class="text-xs text-dimmed hover:text-foreground transition-colors uppercase tracking-wider">Tout afficher</button>
            </div>
            <div class="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
              <div
                v-for="item in recentlyPlayed"
                :key="item.id"
                class="group shrink-0 w-44 cursor-pointer"
                @click="handleCardClick({ id: item.id, playlist_id: item.playlist_id, uri: item.uri })"
              >
                <div class="relative rounded-md overflow-hidden mb-3">
                  <div
                    v-if="item.image === '__liked__'"
                    class="h-44 w-44 bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center"
                  >
                    <UIcon name="i-lucide-heart" class="text-white size-16" />
                  </div>
                  <img
                    v-else
                    :src="item.image"
                    class="h-44 w-44 object-cover"
                    alt=""
                    loading="lazy"
                  />
                  <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                  <button
                    class="absolute bottom-2 right-2 h-10 w-10 rounded-full bg-[#1DB954] flex items-center justify-center shadow-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200"
                    @click.stop="item.uri && playUri(item.uri)"
                  >
                    <UIcon name="i-lucide-play" class="text-black size-5 ml-0.5" />
                  </button>
                </div>
                <p class="text-sm font-semibold truncate">{{ item.name }}</p>
                <p class="text-xs text-dimmed truncate mt-0.5">{{ item.subtitle }}</p>
              </div>
            </div>
          </section>

          <!-- Faits pour vous -->
          <section>
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-xl font-bold">Faits pour vous</h2>
              <button class="text-xs text-dimmed hover:text-foreground transition-colors uppercase tracking-wider">Tout afficher</button>
            </div>
            <div class="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
              <div
                v-for="pl in madeForYou"
                :key="pl.id"
                class="group shrink-0 w-44 cursor-pointer"
                @click="handleCardClick({ id: pl.id, type: 'playlist' })"
              >
                <div class="relative rounded-md overflow-hidden mb-3">
                  <img
                    :src="pl.images?.[0]?.url ?? 'https://via.placeholder.com/176x176?text=PL'"
                    class="h-44 w-44 object-cover"
                    alt=""
                    loading="lazy"
                  />
                  <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                  <button
                    class="absolute bottom-2 right-2 h-10 w-10 rounded-full bg-[#1DB954] flex items-center justify-center shadow-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200"
                    @click.stop="playUri(pl.uri)"
                  >
                    <UIcon name="i-lucide-play" class="text-black size-5 ml-0.5" />
                  </button>
                </div>
                <p class="text-sm font-semibold truncate">{{ pl.name }}</p>
                <p class="text-xs text-dimmed truncate mt-0.5">{{ pl.description || 'Playlist' }}</p>
              </div>
            </div>
          </section>

          <!-- Mis en avant -->
          <section>
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-xl font-bold">Mis en avant</h2>
              <button class="text-xs text-dimmed hover:text-foreground transition-colors uppercase tracking-wider">Tout afficher</button>
            </div>
            <div class="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
              <div
                v-for="pl in featured"
                :key="pl.id"
                class="group shrink-0 w-44 cursor-pointer"
                @click="handleCardClick({ id: pl.id, type: 'playlist' })"
              >
                <div class="relative rounded-md overflow-hidden mb-3">
                  <img
                    :src="pl.images?.[0]?.url ?? 'https://via.placeholder.com/176x176?text=PL'"
                    class="h-44 w-44 object-cover"
                    alt=""
                    loading="lazy"
                  />
                  <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                  <button
                    class="absolute bottom-2 right-2 h-10 w-10 rounded-full bg-[#1DB954] flex items-center justify-center shadow-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200"
                    @click.stop="playUri(pl.uri)"
                  >
                    <UIcon name="i-lucide-play" class="text-black size-5 ml-0.5" />
                  </button>
                </div>
                <p class="text-sm font-semibold truncate">{{ pl.name }}</p>
                <p class="text-xs text-dimmed truncate mt-0.5">
                  {{ pl.tracks?.total ? pl.tracks.total + ' titres' : pl.description || 'Playlist' }}
                </p>
              </div>
            </div>
          </section>

          <!-- Nouvelles sorties -->
          <section class="pb-6">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-xl font-bold">Nouvelles sorties</h2>
              <button class="text-xs text-dimmed hover:text-foreground transition-colors uppercase tracking-wider">Tout afficher</button>
            </div>
            <div class="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
              <div
                v-for="album in newReleases"
                :key="album.id"
                class="group shrink-0 w-44 cursor-pointer"
                @click="playUri(album.uri)"
              >
                <div class="relative rounded-md overflow-hidden mb-3">
                  <img
                    :src="album.images?.[0]?.url ?? 'https://via.placeholder.com/176x176?text=AL'"
                    class="h-44 w-44 object-cover"
                    alt=""
                    loading="lazy"
                  />
                  <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                  <button
                    class="absolute bottom-2 right-2 h-10 w-10 rounded-full bg-[#1DB954] flex items-center justify-center shadow-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200"
                    @click.stop="playUri(album.uri)"
                  >
                    <UIcon name="i-lucide-play" class="text-black size-5 ml-0.5" />
                  </button>
                </div>
                <p class="text-sm font-semibold truncate">{{ album.name }}</p>
                <p class="text-xs text-dimmed truncate mt-0.5">
                  {{ album.album_type === 'single' ? 'Single' : 'Album' }}
                  · {{ (album.artists ?? []).map(a => a.name).join(', ') }}
                </p>
              </div>
            </div>
          </section>

        </template>

        <!-- Skeleton sections loading -->
        <template v-else>
          <section v-for="s in 3" :key="s">
            <USkeleton class="h-6 w-40 mb-3" />
            <div class="flex gap-4">
              <div v-for="i in 5" :key="i" class="shrink-0 space-y-2">
                <USkeleton class="h-44 w-44 rounded-md" />
                <USkeleton class="h-4 w-36" />
                <USkeleton class="h-3 w-28" />
              </div>
            </div>
          </section>
        </template>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* Masquer la scrollbar horizontale sur les sections */
.scrollbar-none { scrollbar-width: none; }
.scrollbar-none::-webkit-scrollbar { display: none; }
</style>
