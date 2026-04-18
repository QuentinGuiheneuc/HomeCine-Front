<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import http from "@/src/lib/https"
import {
  apiCellsToBands,
  bandsToApiCells,
  computeEqCurveWebAudio,
  type UiBand
} from "~/utils/eqTools"

const toast = useToast()

type LayoutDef = {
  channels: number
  order: string[]
  indices?: number[]
}

type EqPayload = {
  layouts: Record<string, LayoutDef>
  eqListe: Record<string, any[]>
  configLayouts?: { rate: number; config: string }
}

type ApiPreset = {
  name: string
  eq: EqPayload
  rate: number
}

const fs = ref(48000)
const curvePoints = ref(1000)
const dbRange = ref(20)

const selectedLayout = ref<string>("")
const selectedPresetName = ref<string>("")
const selectedChannel = ref<string>("FL")

const canvasRef = ref<HTMLCanvasElement | null>(null)

const presetsData = ref<ApiPreset[]>([])
const presetsOriginal = ref<ApiPreset[]>([])
const pending = ref(false)
const loadError = ref("")

async function fetchEq() {
  pending.value = true
  loadError.value = ""
  try {
    const res: any = await http.get("/eq")
    const data: ApiPreset[] = Array.isArray(res?.data) ? res.data : res

    presetsData.value = data || []
    presetsOriginal.value = JSON.parse(JSON.stringify(presetsData.value))

    if (presetsData.value.length && !selectedPresetName.value) {
      selectedPresetName.value = presetsData.value[0].name
    }
  } catch (e: any) {
    loadError.value = e?.message || String(e)
  } finally {
    pending.value = false
  }
}

async function postEqPreset() {
  const p = selectedPreset.value
  if (!p) return

  const body = {
    configLayouts: {
      rate: fs.value,
      config: selectedLayout.value,
      path_eq: (p as any).config?.path_eq
    },
    eqListe: p.eq.eqListe
  }

  try {
    await http.post("/eq/q", body)
    toast.add({ title: "EQ sauvegardé", color: "success" })
    presetsOriginal.value = JSON.parse(JSON.stringify(presetsData.value))
  } catch (e: any) {
    toast.add({
      title: "Erreur sauvegarde EQ",
      description: e?.data?.message || e?.message || String(e),
      color: "error"
    })
  }
}

onMounted(fetchEq)

const presets = computed(() => presetsData.value || [])
const presetItems = computed(() => presets.value.map(p => ({ label: p.name, value: p.name })))

const selectedPreset = computed(() => {
  return presets.value.find(p => p.name === selectedPresetName.value) || presets.value[0]
})

const layoutKeys = computed(() => {
  const p = selectedPreset.value
  return p ? Object.keys(p.eq?.layouts || {}) : []
})

const layoutItems = computed(() =>
  layoutKeys.value.map(k => ({ label: k, value: k }))
)

const currentLayoutDef = computed<LayoutDef | null>(() => {
  const p = selectedPreset.value
  if (!p) return null
  return p.eq?.layouts?.[selectedLayout.value] || null
})

watch(selectedPreset, (p) => {
  if (!p) return
  if (typeof p.rate === "number" && p.rate > 0) fs.value = p.rate

  const apiLayout = p.eq?.configLayouts?.config
  const available = Object.keys(p.eq?.layouts || {})
  selectedLayout.value = (apiLayout && available.includes(apiLayout)) ? apiLayout : (available[0] || "")
}, { immediate: true })

const channelItems = computed(() => {
  const p = selectedPreset.value
  const def = currentLayoutDef.value
  if (!p || !def) return []

  const keys = Object.keys(p.eq?.eqListe || {})
  const order = Array.isArray(def.order) ? def.order : []
  const final = order.length ? order.filter(ch => keys.includes(ch)) : keys
  return final.map(ch => ({ label: ch, value: ch }))
})

watch([channelItems, selectedPresetName, selectedLayout], () => {
  const items = channelItems.value
  if (!items.length) return
  if (!items.some(i => i.value === selectedChannel.value)) {
    selectedChannel.value = items[0].value
  }
}, { immediate: true })

const bands = ref<UiBand[]>([])

function sortBands() {
  bands.value = bands.value.filter(b => b.cell >= 1).sort((a, b) => a.cell - b.cell)
}

function loadBandsFromApi() {
  const p = selectedPreset.value
  if (!p) return
  bands.value = apiCellsToBands(p.eq?.eqListe?.[selectedChannel.value] || [])
  sortBands()
}

watch([selectedPresetName, selectedChannel], loadBandsFromApi, { immediate: true })

const channelBands = computed(() => {
  sortBands()
  return bands.value
})

watch(bands, () => {
  const p = selectedPreset.value
  if (!p) return
  const channelId = p.eq?.eqListe?.[selectedChannel.value]?.[0]?.["@channel"]
  if (!p.eq.eqListe) p.eq.eqListe = {}
  p.eq.eqListe[selectedChannel.value] = bandsToApiCells(bands.value, channelId)
}, { deep: true })

function toggleBand(cell: number, v: boolean) {
  const b = bands.value.find(x => x.cell === cell)
  if (!b) return
  b.enabled = v
  if (v && (!b.freq || b.freq < 20)) b.freq = 1000
}

function resetChannel() {
  const orig = presetsOriginal.value.find(p => p.name === selectedPresetName.value)
  if (!orig) return
  bands.value = apiCellsToBands(orig.eq?.eqListe?.[selectedChannel.value] || [])
  sortBands()
}

function addBand(type: UiBand["type"]) {
  sortBands()
  const cell = bands.value.length + 1
  bands.value.push({
    id: crypto.randomUUID(),
    cell,
    enabled: true,
    type,
    freq: type === "highpass" ? 80 : type === "lowpass" ? 12000 : type === "lowshelf" ? 80 : type === "highshelf" ? 10000 : 1000,
    q: 0.9,
    gainDb: type === "lowshelf" ? 1.5 : type === "highshelf" ? 1.0 : 0
  })
}

const eqCurve = ref<{ f: number; db: number }[]>([])

async function recomputeCurve() {
  try {
    eqCurve.value = await computeEqCurveWebAudio(bands.value, fs.value, curvePoints.value, 20, 20000)
  } catch {
    eqCurve.value = []
  }
}

watch([bands, fs, curvePoints], recomputeCurve, { deep: true, immediate: true })

let raf = 0
function scheduleDraw() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(draw)
}

function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const w = Math.max(1, Math.round(rect.width * dpr))
  const h = Math.max(1, Math.round(rect.height * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  return { rect, dpr }
}

function cssVar(name: string, fallback = "#00beff") {
  if (typeof window === "undefined") return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext("2d")
  if (!ctx) return

  const { rect, dpr } = resizeCanvasToDisplaySize(canvas)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const w = rect.width
  const h = rect.height
  const padL = 56, padR = 14, padT = 14, padB = 28
  const r = dbRange.value
  const fMin = 20
  const fMax = Math.min(20000, fs.value / 2 - 1)

  const logX = (f: number) => {
    const a = Math.log10(fMin), b = Math.log10(fMax)
    return (Math.log10(f) - a) / (b - a)
  }
  const xFromF = (f: number) => padL + logX(f) * (w - padL - padR)
  const yFromDb = (db: number) => (1 - (db + r) / (2 * r)) * (h - padT - padB) + padT

  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = cssVar("--ui-color-neutral-700")
  ctx.fillRect(0, 0, w, h)
  ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace"
  ctx.textBaseline = "middle"
  ctx.lineWidth = 2
  ctx.strokeStyle = "rgba(255,255,255,0.10)"
  ctx.fillStyle = "rgba(255,255,255,0.65)"

  for (let db = -r; db <= r; db += 6) {
    const y = yFromDb(db)
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke()
    ctx.fillText(`${db} dB`, 8, y)
  }

  ctx.strokeStyle = "rgba(255,255,255,0.25)"
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(padL, yFromDb(0)); ctx.lineTo(w - padR, yFromDb(0)); ctx.stroke()

  const ticks = [20, 30, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].filter(f => f <= fMax)
  ctx.lineWidth = 1
  ctx.strokeStyle = "rgba(255,255,255,0.10)"
  ctx.fillStyle = "rgba(255,255,255,0.65)"
  ctx.textBaseline = "alphabetic"

  for (const f of ticks) {
    const x = xFromF(f)
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, h - padB); ctx.stroke()
    const label = f >= 1000 ? `${f / 1000}k` : `${f}`
    ctx.fillText(label, x - ctx.measureText(label).width / 2, h - 10)
  }

  const pts = eqCurve.value
  if (!pts.length) {
    ctx.fillStyle = "rgba(255,255,255,0.7)"
    ctx.fillText("No curve data", padL, padT + 14)
    return
  }

  ctx.strokeStyle = cssVar("--ui-color-primary-600")
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let i = 0; i < pts.length; i++) {
    const x = xFromF(pts[i].f), y = yFromDb(pts[i].db)
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

onMounted(async () => {
  await nextTick()
  scheduleDraw()
  window.addEventListener("resize", scheduleDraw)
})
onBeforeUnmount(() => {
  window.removeEventListener("resize", scheduleDraw)
  cancelAnimationFrame(raf)
})
watch([eqCurve, dbRange], scheduleDraw)
</script>

<template>
  <div class="flex flex-col min-h-0 flex-1 min-w-0">
    <UDashboardNavbar class="sticky top-1 z-20 bg-background/80 backdrop-blur border-b border-default" style="height: 130px;">
      <template #leading>
        <UPageCard
          title="EQ par canal"
          :description="`Preset: ${selectedPresetName || '—'} • Layout: ${selectedLayout} • Canal: ${selectedChannel} • fs: ${fs}Hz`"
          variant="naked"
          orientation="horizontal"
          :ui="{ container: 'p-4 sm:p-4 gap-3' }"
          class="mb-0 flex items-center"
        >
          <div class="flex flex-wrap items-center gap-2 w-full lg:w-auto lg:ms-auto">
            <USelect v-model="selectedPresetName" :items="presetItems" class="min-w-[160px]" />
            <UButton color="neutral" variant="soft" :loading="pending" @click="fetchEq">Reload</UButton>
            <UButton color="neutral" variant="soft" @click="resetChannel">Reset canal</UButton>
            <UButton color="primary" icon="i-lucide-save" @click="postEqPreset">Sauvegarder</UButton>
          </div>

          <div v-if="loadError" class="text-sm text-red-500">{{ loadError }}</div>

          <div class="flex flex-1 gap-1">
            <UButton
              v-for="it in channelItems"
              :key="it.value"
              size="xs"
              :color="it.value === selectedChannel ? 'primary' : 'neutral'"
              :variant="it.value === selectedChannel ? 'solid' : 'soft'"
              @click="selectedChannel = it.value"
            >
              {{ it.label }}
            </UButton>
          </div>
        </UPageCard>
      </template>
    </UDashboardNavbar>

    <main class="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-2 sm:px-6 lg:px-8">
      <div class="w-full lg:max-w-12xl py-6 sm:py-8 lg:py-12 space-y-6">
        <UCard>
          <div class="flex flex-wrap gap-3 items-end">
            <div class="min-w-[160px]">
              <div class="text-sm text-dimmed mb-1">Points</div>
              <UInput v-model.number="curvePoints" type="number" :min="64" :max="2048" />
            </div>
            <div class="min-w-[160px]">
              <div class="text-sm text-dimmed mb-1">dB range (±)</div>
              <UInput v-model.number="dbRange" type="number" :min="6" :max="36" />
            </div>

            <div class="ms-auto flex flex-wrap gap-2">
              <UButton size="sm" color="neutral" variant="soft" @click="addBand('highpass')">+ HPF</UButton>
              <UButton size="sm" color="neutral" variant="soft" @click="addBand('lowshelf')">+ LowShelf</UButton>
              <UButton size="sm" color="neutral" variant="soft" @click="addBand('peaking')">+ Peaking</UButton>
              <UButton size="sm" color="neutral" variant="soft" @click="addBand('highshelf')">+ HighShelf</UButton>
              <UButton size="sm" color="neutral" variant="soft" @click="addBand('lowpass')">+ LPF</UButton>
            </div>
          </div>

          <div class="mt-4">
            <canvas ref="canvasRef" class="w-full h-[360px] rounded-md border border-default/60" />
          </div>
        </UCard>

        <div class="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          <UCard
            v-for="b in channelBands"
            :key="b.id"
            class="flex flex-col mb-0"
            :ui="{ body: 'p-1 sm:p-4' }"
          >
            <div class="flex items-center justify-between px-1">
              <div class="font-medium">Cell {{ b.cell }}</div>
              <UCheckbox
                :model-value="b.enabled"
                label="ON"
                @update:model-value="(v: boolean) => toggleBand(b.cell, v)"
              />
            </div>

            <div class="mt-3 space-y-4">
              <div class="m-0">
                <div class="text-sm text-dimmed mb-1">Type</div>
                <USelect
                  v-model="b.type"
                  :items="[
                    { label: 'Peaking', value: 'peaking' },
                    { label: 'Low shelf', value: 'lowshelf' },
                    { label: 'High shelf', value: 'highshelf' },
                    { label: 'HPF', value: 'highpass' },
                    { label: 'LPF', value: 'lowpass' }
                  ]"
                />
              </div>

              <div class="m-0">
                <div class="flex items-center justify-between">
                  <div class="text-sm text-dimmed">Freq</div>
                  <UBadge variant="subtle">{{ b.freq }} Hz</UBadge>
                </div>
                <input
                  type="range" min="20" max="20000" step="1"
                  class="w-full accent-current h-1.5 range-primary-0"
                  :value="b.freq"
                  @input="b.freq = ($event.target as HTMLInputElement).valueAsNumber"
                />
              </div>

              <div class="m-0">
                <div class="flex items-center justify-between">
                  <div class="text-sm text-dimmed">Q / S</div>
                  <UBadge variant="subtle">{{ b.q.toFixed(2) }}</UBadge>
                </div>
                <input
                  type="range" min="0.10" max="100" step="0.01"
                  class="w-full accent-current h-1.5 range-primary-0"
                  :value="b.q"
                  @input="b.q = Number(($event.target as HTMLInputElement).value)"
                />
              </div>

              <div class="m-0">
                <div class="flex items-center justify-between">
                  <div class="text-sm text-dimmed">Gain</div>
                  <UBadge variant="subtle">{{ b.gainDb.toFixed(1) }} dB</UBadge>
                </div>
                <input
                  type="range" min="-38" max="18" step="0.1"
                  class="w-full accent-current h-1.5 range-primary-0"
                  :disabled="b.type === 'highpass' || b.type === 'lowpass'"
                  :value="b.gainDb"
                  @input="b.gainDb = Number(($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </main>
  </div>
</template>
