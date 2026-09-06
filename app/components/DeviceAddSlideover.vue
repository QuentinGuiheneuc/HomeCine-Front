<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import config from '@/src/config'
import http from '@/src/lib/https'
import { useToast, useDashboard } from '#imports'

/* Dashboard state */
const { DeviceAddSlideover } = useDashboard()
const toast = useToast?.()

/* WS */
const wsStatus = ref<'disconnected' | 'connecting' | 'connected'>('disconnected')
const wsErrorMsg = ref<string | null>(null)
let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
/** URL (token inclus) avec laquelle la socket courante a été ouverte */
let wsUrlUsed = ''
/** Commandes envoyées avant l'ouverture : rejouées dans onopen */
let pendingSend: any[] = []

// const wsUrl = computed(() => `${config.WS_URL}/Device`)

/* Search results */
type FoundDevice = {
  key: string
  name: string
  ip: string
  ipIface?: string
  type: string
  matchedIp?: any
  port?: number
  description?: string
  exists: boolean
  existsChecked: boolean
  raw?: any
  lastSeen: number
}

const searching = ref(false)
const foundMap = ref<Record<string, FoundDevice>>({})
const checkingMap = ref<Record<string, boolean>>({}) // anti-spam checks
const q = ref('')

/* ---------- Balayage de présence (Presence.* sur le WS broadcast) ----------
   Sondage unicast adresse par adresse : passe là où la diffusion est bloquée
   (pare-feu, routeur, VPN). Les résultats remontent au fil de l'eau. */
const rxCount      = ref(0)                     // messages reçus sur la socket (diagnostic)
const scanning     = ref(false)
const scanProgress = ref<{ faites: number; total: number } | null>(null)
const scanRetryMs  = ref<number | null>(null)   // refus : réessayer dans…

const scanPercent = computed(() => {
  const pr = scanProgress.value
  return pr && pr.total ? Math.min(100, Math.round((pr.faites / pr.total) * 100)) : 0
})

/** Lance Presence.Scan (le serveur balaie les réseaux de ses interfaces) */
function startPresenceScan() {
  ensureFreshWs()
  scanning.value = true
  scanRetryMs.value = null
  scanProgress.value = null
  sendWs({ method: 'Presence.Scan' })
  // Aucun accusé de réception : seul Presence.Done clôt le balayage.
  setTimeout(() => { if (scanning.value && !scanProgress.value) scanning.value = false }, 20000)
}

/**
 * Messages liés au balayage — renvoie true si le message est consommé.
 * Device.Search et Presence.Scan ne reviennent QUE pour signaler un refus ;
 * une annonce d'appareil, elle, ne porte pas de champ `method`.
 */
function handlePresence(msg: any): boolean {
  switch (msg?.method) {
    case 'Device.Search':
      if (!msg.error) return true          // pas d'accusé de réception attendu
      searching.value = false
      toast?.add?.({
        title: 'Recherche refusée',
        description: String(msg.error),
        color: 'warning', icon: 'i-lucide-triangle-alert'
      })
      return true
    case 'Presence.Scan': {
      if (!msg.error) return true          // pas d'accusé de réception attendu
      searching.value = false
      scanning.value = false
      scanRetryMs.value = Number(msg.reessayerDansMs) || null
      toast?.add?.({
        title: 'Balayage refusé',
        description: scanRetryMs.value
          ? msg.error + ' — réessayez dans ' + Math.ceil(scanRetryMs.value / 1000) + ' s'
          : String(msg.error),
        color: 'warning', icon: 'i-lucide-triangle-alert'
      })
      return true
    }

    case 'Presence.Progress':
      scanProgress.value = { faites: Number(msg.faites) || 0, total: Number(msg.total) || 0 }
      return true

    case 'Presence.Done': {
      scanning.value = false
      scanProgress.value = null
      const plages = Array.isArray(msg.plages) ? msg.plages : []
      // `trouvees` est un TABLEAU d'adresses, pas un compteur
      const trouvees = plages.reduce((n: number, x: any) =>
        n + (Array.isArray(x?.trouvees) ? x.trouvees.length : Number(x?.trouvees) || 0), 0)
      const sondees = plages.reduce((n: number, x: any) => n + (Number(x?.sondees) || 0), 0)
      toast?.add?.({
        title: 'Balayage terminé',
        description: trouvees + ' adresse(s) sur ' + sondees + ' sondée(s)',
        color: 'success', icon: 'i-lucide-radar'
      })
      return true
    }

    case 'Presence.Found': {
      // Sonde UDP : l'annonce complète est dans `reponse` → même message qu'une
      // diffusion, on le repasse tel quel au traitement broadcast.
      if (msg.reponse && typeof msg.reponse === 'object') {
        handleWsMessage(msg.reponse)
        return true
      }
      // Sondes tcp/ping : on sait seulement qu'une machine répond à cette adresse.
      const ip = String(msg.ip || '')
      if (!ip) return true
      handleWsMessage({
        name: ip,
        interfaces: { address: ip },
        config: {
          Server: { Port: Number(msg.port) || undefined },
          con: {
            type: String(msg.methode || 'sonde'),
            description: msg.ms != null ? 'sonde ' + msg.methode + ' · ' + msg.ms + ' ms' : ''
          }
        }
      })
      return true
    }

    case 'Presence.Alive': {
      // Appareil déjà en base : rafraîchit une carte affichée, n'en crée pas.
      const ip = String(msg.ip || '')
      const prev = ip ? foundMap.value[ip] : undefined
      if (prev) foundMap.value = { ...foundMap.value, [ip]: { ...prev, lastSeen: Date.now() } }
      return true
    }
  }
  return false
}

const foundList = computed(() => {
  const arr = Object.values(foundMap.value)
    .sort((a, b) => b.lastSeen - a.lastSeen)

  const s = q.value.trim().toLowerCase()
  if (!s) return arr
  return arr.filter(d =>
    d.ip.toLowerCase().includes(s) ||
    d.type.toLowerCase().includes(s) ||
    d.key.toLowerCase().includes(s)
  )
})

/* ---------- WS connect ---------- */
function connectWs() {
  if (typeof window === 'undefined') return
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  wsStatus.value = 'connecting'
  wsErrorMsg.value = null

  try {
    wsUrlUsed = wsProxyUrl('Device')
    ws = new WebSocket(wsUrlUsed)
  } catch (err: any) {
    console.error('[WS] create error', err)
    wsStatus.value = 'disconnected'
    wsErrorMsg.value = 'Erreur création WebSocket'
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    wsStatus.value = 'connected'
    wsErrorMsg.value = null
    const queue = pendingSend
    pendingSend = []
    for (const payload of queue) ws?.send(JSON.stringify(payload))
  }

  ws.onclose = () => {
    wsStatus.value = 'disconnected'
    scheduleReconnect()
  }

  ws.onerror = (err: any) => {
    console.error('[WS] error', err)
    wsErrorMsg.value = 'Erreur WebSocket (voir console)'
  }

  ws.onmessage = (event: MessageEvent) => {
    rxCount.value++
    let msg: any
    try {
      msg = JSON.parse(event.data)
      console.log('[WS] message received', msg)
    } catch {
      console.error('[WS] invalid JSON', event.data)
      return
    }
    handleWsMessage(msg)
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectWs()
  }, 1500)
}
async function checkExistsInDb(ip: string): Promise<boolean> {
  // adapte si ton route est /objet?ip=...
  const res = await http.get(`/objet/${encodeURIComponent(ip)}`)
  const data = res.data
  return Array.isArray(data) && data.length > 0
}
async function existsInDbByIp(ip: string): Promise<{ exists: boolean; row?: any }> {
  ip = String(ip || '').trim()
  if (!ip) return { exists: false }

  const res = await http.get(`/objet/${encodeURIComponent(ip)}`)
  const data = res.data

  // 1) API renvoie directement un array
  if (Array.isArray(data)) {
    return { exists: data.length > 0, row: data[0] }
  }

  // 2) API renvoie { status, data: [...] }
  if (data && Array.isArray(data.data)) {
    return { exists: data.data.length > 0, row: data.data[0] }
  }

  // 3) API renvoie un objet direct (row)
  if (data && typeof data === 'object' && Object.keys(data).length) {
    return { exists: true, row: data }
  }

  return { exists: false }
}

function getIpsFromMsg(msg: any) {
  const ipMain = String(msg?.interfaces?.address || '').trim() // ✅ PRINCIPAL
  const ipAlt = String(msg?.ipres || '').trim() // secondaire
  const ip = ipMain || ipAlt
  const key = ipMain || ipAlt || '' // ✅ clé = ipMain
  return { ip, key, ipMain, ipAlt }
}
async function existsInDbByIpMainOrAlt(ipMain: string, ipAlt: string) {
  if (ipMain) {
    const r1 = await http.get(`/objet/${encodeURIComponent(ipMain)}`)
    if (Array.isArray(r1.data[0]) && r1.data.length) return { exists: true, matchedIp: ipMain }
  }
  return { exists: false as const, matchedIp: undefined as string | undefined }
}
/* ---------- Message parsing ---------- */
async function handleWsMessage(msg: any) {
  if (!msg) return
  if (handlePresence(msg)) return          // messages du balayage réseau

  // on accepte si on a au moins interfaces.address ou ipres
  if (!msg.interfaces?.address && !msg.ipres) return

  const { key, ip, ipMain, ipAlt } = getIpsFromMsg(msg)
  if (!key) return

  // Upsert UI
  const prev = foundMap.value[key]
  foundMap.value = {
    ...foundMap.value,
    [key]: {
      key,
      name: String(msg.name || 'Device'),
      ip,        // affichage
      ipMain,    // ✅ interfaces.address
      ipAlt,     // ipres
      port: Number(msg.config?.Server?.Port || 0) || undefined,
      type: String(msg.config?.con?.type || 'n/a'),
      description: String(msg.config?.con?.description || ''),
      exists: prev?.exists ?? false,
      existsChecked: prev?.existsChecked ?? false,
      matchedIp: prev?.matchedIp,
      raw: msg,
      lastSeen: Date.now()
    }
  }

  // Check DB (anti-spam)
  if (!foundMap.value[key].existsChecked && !checkingMap.value[key]) {
    checkingMap.value[key] = true
    try {
      // ✅ Choisis 1 des 2 lignes :

      // 1) check uniquement interfaces.address
      const { exists, row } = await existsInDbByIp(ipMain)
      console.log(`[exists] check for ${ipMain} => ${exists}`)
      // 2) check interfaces.address puis ipres

      const cur = foundMap.value[key]
      if (cur) {
        foundMap.value = { ...foundMap.value,
          [key]: { ...cur, exists, matchedIp: row, existsChecked: true }
        }
      }
    } catch (e) {
      console.error('[exists] check error', e)
      const cur = foundMap.value[key]
      if (cur) foundMap.value = { ...foundMap.value, [key]: { ...cur, existsChecked: true } }
    } finally {
      checkingMap.value[key] = false
    }
  }
  console.log(foundMap.value)
}


/* ---------- Actions ---------- */
function clearResults() {
  foundMap.value = {}
  scanProgress.value = null
  scanRetryMs.value = null
}

function sendWs(payload: any) {
  console.log('[WS] sending message', payload)
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    // La socket n'est pas (encore) prête : on garde la commande et on connecte.
    pendingSend.push(payload)
    connectWs()
    return
  }
  ws.send(JSON.stringify(payload))
}

/**
 * Le token voyage dans l'URL : une socket ouverte garde celui du départ.
 * Après un rafraîchissement de session, le serveur la rejette silencieusement —
 * on la rouvre donc si l'URL a changé.
 */
function ensureFreshWs() {
  if (ws && ws.readyState === WebSocket.OPEN && wsUrlUsed !== wsProxyUrl('Device')) {
    ws.close()
    ws = null
  }
  connectWs()
}


/**
 * Lance une recherche.
 * -> adapte le "method" à TON backend.
 * Si ton backend attend juste "SEARCH" ou autre, change ici.
 */
function startSearch() {
  ensureFreshWs()

  searching.value = true
  wsErrorMsg.value = null

  // ✅ Exemple de commande
  sendWs({ method: 'Device.Search' })

  // fallback: stop l’UI "searching" après 3s si aucune réponse
  setTimeout(() => { searching.value = false }, 8000)
}

/**
 * Ajout en DB via HTTP
 * -> adapte l’endpoint selon ton API (ex: POST /device)
 */
async function addToDb(d: FoundDevice) {
  try {
    // adapte payload/route à ton backend
    const payload = {
      name: d.name,
      type: d.type,
      ip: d.ip,
      port: '3007',
      description: `Auto-discovered (${d.type})`,
      isalive: 1,
      allconfig: d.raw ?? null
    }

    await http.post('/objet/add', payload)
    toast?.add?.({ title: 'Device ajouté', description: `${d.name} ${d.ip}`, color: 'success' })
  } catch (e: any) {
    console.error(e)
    toast?.add?.({ title: 'Ajout impossible', color: 'error' })
  }
}

/* ---------- Lifecycle ---------- */
onMounted(() => {
  connectWs()
})

onBeforeUnmount(() => {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  if (ws && ws.readyState === WebSocket.OPEN) ws.close()
})

/* Quand le slideover s’ouvre: on connecte WS */
watch(DeviceAddSlideover, (open) => {
  if (open) {
    if (!ws || ws.readyState !== WebSocket.OPEN) connectWs()
  }
})
const DeviceAddSlideoverToggle = () => {
  DeviceAddSlideover.value = !DeviceAddSlideover.value
}
</script>

<template>
  <USlideover
    v-model:open="DeviceAddSlideover"
    title="Ajouter des devices"
    :ui="{ content: 'max-w-4xl w-screen', header: 'px-4 py-4', body: 'px-0 py-0' }"
  >
    <template #header>
      <div class="flex items-center justify-between gap-3 px-4 py-3 ">
        <UButton size="xs" color="neutral" variant="ghost" icon="material-symbols:arrow-back-rounded" @click="DeviceAddSlideoverToggle"></UButton>
        <div>
          <div class="font-medium text-sm">Découverte devices</div>
          <div class="text-[11px] text-dimmed">
            Trouvés: {{ foundList.length }} · Reçus: {{ rxCount }} · WS:
            <span
              :class="[
                'px-2 py-0.5 rounded-full text-[10px]',
                wsStatus === 'connected' && 'bg-emerald-500/10 text-emerald-400',
                wsStatus === 'connecting' && 'bg-amber-500/10 text-amber-400',
                wsStatus === 'disconnected' && 'bg-red-500/10 text-red-400'
              ]"
            >
              {{ wsStatus }}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <UInput v-model="q" icon="i-lucide-search" placeholder="Filtrer IP / type..." size="xs" class="w-52" />
          <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-trash-2" @click="clearResults">
            Vider
          </UButton>
          <UButton
            size="xs"
            color="primary"
            :loading="searching"
            icon="i-lucide-radar"
            @click="startSearch"
          >
            Scanner
          </UButton>
          <UTooltip text="Balayer le réseau adresse par adresse (Presence.Scan)">
            <UButton
              size="xs"
              color="primary"
              variant="soft"
              :loading="scanning"
              icon="i-lucide-scan-search"
              @click="startPresenceScan"
            >
              {{ scanProgress ? scanPercent + ' %' : 'Balayage' }}
            </UButton>
          </UTooltip>
        </div>
      </div>
    </template>

    <template #body>
      <div class="p-3 space-y-3">
        <UAlert v-if="wsErrorMsg" color="red" :title="wsErrorMsg" />
        <UAlert
          v-if="wsStatus !== 'connected'"
          color="amber"
          title="WebSocket non connecté"
          description="Vérifie WS_URL et le endpoint /Device."
          variant="subtle"
        />

        <UAlert
          v-else-if="!foundList.length"
          color="neutral"
          title="Aucun résultat"
          description="Clique sur Scanner pour lancer la recherche."
          variant="subtle"
        />

        <div class="grid gap-3 md:grid-cols-2">
          <UCard
            v-for="d in foundList"
            :key="d.key"
            class="border border-default/60"
            :ui="{ body: 'space-y-2' }"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-cpu" class="size-4 text-dimmed" />
                  <div class="font-medium text-sm truncate"> {{ d.name }} en {{ d.type }} </div>
                  <UBadge v-if="!d.exists" variant="subtle" class="text-[10px]">Découvert</UBadge>
                  <UBadge v-if="d.exists" variant="subtle" class="text-[10px]">Déja Ajouter</UBadge>
                </div>
                <div class="text-[11px] text-dimmed font-mono">
                  {{ d.ip }}
                </div>
                <div class="text-[11px] text-dimmed font-mono">
                  {{ d.description }}
                </div>
              </div>

              <div class="flex items-center gap-2">
                <UButton v-if="!d.exists" size="xs" color="primary" variant="solid" @click="addToDb(d)">
                  Ajouter
                </UButton>
              </div>
            </div>

            <div class="text-[10px] text-dimmed">
              Dernière détection: {{ new Date(d.lastSeen).toLocaleTimeString() }}
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </USlideover>
</template>
