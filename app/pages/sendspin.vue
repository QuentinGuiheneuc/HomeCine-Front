<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  getSendspin, saveSendspin, startSendspin, stopSendspin, clearSendspin,
  type SendspinConfig, type SendspinState,
} from '@/src/api/sendspin'

const toast   = useToast()
const pending = ref(false)
const busy    = ref(false)            // start/stop/delete en cours
const saving  = ref(false)
const state   = ref<SendspinState>({ config: null, running: false })

const MODES = ['snapcast', 'vban', 'url', 'process'].map(v => ({ label: v, value: v }))

/* ── Formulaire de config ───────────────────────────────────────────────── */
const form = ref<SendspinConfig>(defaultConfig())
function defaultConfig(): SendspinConfig {
  return { mode: 'url', name: '', audioDevice: '', url: '', args: '' }
}

const running = computed(() => state.value.running)
const configured = computed(() => !!state.value.config)

function applyState(s: SendspinState) {
  state.value = s
  form.value = { ...defaultConfig(), ...(s.config ?? {}) }
}

async function load() {
  pending.value = true
  try { applyState(await getSendspin()) }
  catch { toast.add({ title: 'Chargement impossible', color: 'error' }) }
  finally { pending.value = false }
}

async function save() {
  if (!form.value.mode) { toast.add({ title: 'Mode requis', color: 'warning' }); return }
  saving.value = true
  try {
    const s = await saveSendspin({ ...form.value })
    if (s && (s.config !== undefined)) applyState(s); else await load()
    toast.add({ title: 'Configuration enregistrée', color: 'success', icon: 'i-lucide-save' })
  } catch (e: any) {
    toast.add({ title: 'Enregistrement impossible', description: e?.response?.data?.error || e?.response?.data?.message, color: 'error' })
  } finally { saving.value = false }
}

async function start() {
  busy.value = true
  try { await startSendspin(); await load(); toast.add({ title: 'SendSpin démarré', color: 'success', icon: 'i-lucide-play' }) }
  catch (e: any) { toast.add({ title: 'Démarrage impossible', description: e?.response?.data?.error, color: 'error' }) }
  finally { busy.value = false }
}
async function stop() {
  busy.value = true
  try { await stopSendspin(); await load(); toast.add({ title: 'SendSpin arrêté', color: 'neutral' }) }
  catch { toast.add({ title: 'Arrêt impossible', color: 'error' }) }
  finally { busy.value = false }
}
async function remove() {
  if (!confirm('Effacer la configuration SendSpin et arrêter ?')) return
  busy.value = true
  try {
    await clearSendspin()
    applyState({ config: null, running: false })
    form.value = defaultConfig()
    toast.add({ title: 'Configuration effacée', color: 'success' })
  } catch { toast.add({ title: 'Suppression impossible', color: 'error' }) }
  finally { busy.value = false }
}

onMounted(load)
</script>

<template>
  <UDashboardPanel id="sendspin">
    <template #header>
      <UDashboardNavbar title="SendSpin">
        <template #leading><UDashboardSidebarCollapse /></template>
        <template #right>
          <UButton label="Actualiser" color="neutral" icon="i-lucide-refresh-cw" :loading="pending" @click="load" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-5 pb-10">

        <!-- ── État ──────────────────────────────────────────────────────────── -->
        <UPageCard variant="subtle" :ui="{ container: 'p-0 gap-y-0' }" class="overflow-hidden">
          <div class="flex items-center gap-4 px-5 py-4" :class="running ? 'bg-gradient-to-r from-primary/15 to-transparent' : 'bg-elevated/40'">
            <div class="size-12 rounded-xl flex items-center justify-center shrink-0" :class="running ? 'bg-primary/20' : 'bg-elevated'">
              <UIcon name="i-lucide-radio" class="size-6" :class="running ? 'text-primary' : 'text-dimmed'" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-[11px] uppercase tracking-widest text-dimmed">Émetteur SendSpin</p>
              <p class="text-lg font-bold leading-tight truncate">{{ form.name || form.url || (configured ? 'Configuré' : 'Non configuré') }}</p>
              <p class="text-xs text-dimmed truncate">{{ form.mode }}<span v-if="form.audioDevice"> · {{ form.audioDevice }}</span></p>
            </div>
            <span class="inline-flex items-center gap-1.5 text-xs shrink-0">
              <span class="size-2 rounded-full" :class="running ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'" />
              {{ running ? 'En cours' : 'Arrêté' }}
            </span>
            <UButton v-if="running" icon="i-lucide-square" color="error" variant="soft" size="sm" :loading="busy" @click="stop">Arrêter</UButton>
            <UButton v-else icon="i-lucide-play" color="primary" size="sm" :loading="busy" :disabled="!configured" @click="start">Démarrer</UButton>
          </div>
        </UPageCard>

        <!-- ── Configuration ─────────────────────────────────────────────────── -->
        <UPageCard variant="subtle" :ui="{ container: 'p-4 gap-y-3' }">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium flex items-center gap-2"><UIcon name="i-lucide-sliders-horizontal" class="size-4 text-primary" />Configuration</p>
              <p class="text-xs text-dimmed">Enregistrer redémarre l'émetteur s'il est actif.</p>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Mode"><USelect v-model="form.mode" :items="MODES" class="w-full" /></UFormField>
            <UFormField label="Nom"><UInput v-model="form.name" placeholder="Salon" class="w-full" /></UFormField>
            <UFormField label="Périphérique audio"><UInput v-model="form.audioDevice" placeholder="ex: hw:0,0 / default" class="w-full font-mono" /></UFormField>
            <UFormField label="URL"><UInput v-model="form.url" placeholder="ex: http://… / udp://…" class="w-full font-mono" /></UFormField>
            <UFormField label="Arguments" class="sm:col-span-2"><UTextarea v-model="form.args" :rows="2" placeholder="Arguments supplémentaires (CLI)" class="w-full font-mono" /></UFormField>
          </div>

          <div class="flex items-center justify-between pt-3 border-t border-default">
            <UButton label="Effacer la config" color="error" variant="soft" icon="i-lucide-trash-2" :loading="busy" :disabled="!configured" @click="remove" />
            <UButton label="Enregistrer" icon="i-lucide-save" color="primary" :loading="saving" :disabled="!form.mode" @click="save" />
          </div>
        </UPageCard>

      </div>
    </template>
  </UDashboardPanel>
</template>
