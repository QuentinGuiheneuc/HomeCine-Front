<script setup>
import { ref, computed, onMounted } from 'vue'
import http from '@/src/lib/https'
import { useToast } from '#imports'

const toast = useToast?.()

/* ---------------------------------
 * state
 * --------------------------------- */
const loadingOverview = ref(false)
const loadingSchema = ref(false)
const loadingRules = ref(false)
const savingRule = ref(false)
const validatingRule = ref(false)
const actionLoading = ref(null)
const errorMsg = ref(null)

const overview = ref({
  modulesin: {},
  modulesout: {},
  modulesAll: {}
})

const schema = ref({
  inputs: {},
  outputs: {},
  ruleFormat: {}
})

const rules = ref([])
const ruleSearch = ref('')
const editorOpen = ref(false)
const validationResult = ref(null)

const RESERVED_RULE_KEYS = [
  'id',
  'name',
  'description',
  'enabled',
  'createdAt',
  'updatedAt',
  'from',
  'input',
  'modulein',
  'action',
  'vol20',
  'when',
  'cooldownMs'
]

/* ---------------------------------
 * helpers
 * --------------------------------- */
function deepClone(v) {
  try {
    return JSON.parse(JSON.stringify(v))
  } catch {
    return v
  }
}

function prettyJson(v) {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

function toSelectItems(arr = []) {s
  return arr.map(v => ({ label: String(v), value: String(v) }))
}

function normalizeString(v) {
  return String(v || '').trim().toLowerCase()
}

function listRuleTargets(rule = {}) {
  return Object.entries(rule).filter(([k]) => !RESERVED_RULE_KEYS.includes(k))
}

function getInputNames() {
  return Object.keys(schema.value?.inputs || overview.value?.modulesin || {})
}

function getOutputNames() {
  return Object.keys(schema.value?.outputs || overview.value?.modulesout || {})
}

function getInputActions(inputName) {
  if (!inputName) return []
  const mod = schema.value?.inputs?.[inputName] || overview.value?.modulesin?.[inputName]
  return Array.isArray(mod?.keyActions) ? mod.keyActions : []
}

function getOutputModule(moduleName) {
  if (!moduleName) return null
  return schema.value?.outputs?.[moduleName] || overview.value?.modulesout?.[moduleName] || null
}

function getOutputFunctions(moduleName) {
  const mod = getOutputModule(moduleName)
  return Array.isArray(mod?.functions) ? mod.functions : []
}

function getFunctionSchema(moduleName, fn) {
  if (!moduleName || !fn) return null
  const mod = getOutputModule(moduleName)
  return mod?.functionSchema?.[fn] || null
}

function getFunctionArgEntries(moduleName, fn) {
  const fnSchema = getFunctionSchema(moduleName, fn)
  if (!fnSchema?.args || typeof fnSchema.args !== 'object') return []
  return Object.entries(fnSchema.args)
}

function hasStructuredArgs(target) {
  return !!getFunctionSchema(target?.moduleName, target?.fn)?.args
}

function getArgLabel(argName, meta = {}) {
  return meta.label || argName
}

function getArgPlaceholder(meta = {}) {
  if (meta.placeholder !== undefined) return meta.placeholder
  if (meta.example !== undefined) return String(meta.example)
  return ''
}

function getDefaultValueFromMeta(meta = {}, exampleValue) {
  if (exampleValue !== undefined) return deepClone(exampleValue)
  if (meta.example !== undefined) return deepClone(meta.example)
  if (meta.default !== undefined) return deepClone(meta.default)

  if (meta.type === 'number') return 0
  if (meta.type === 'boolean') return false
  if (meta.type === 'array') return []
  if (meta.type === 'object') return {}
  return ''
}

function buildArgsModelFromSchema(moduleName, fn, currentArgs = {}) {
  const fnSchema = getFunctionSchema(moduleName, fn)
  if (!fnSchema?.args) return deepClone(currentArgs || {})

  const example = fnSchema.example || {}
  const model = {}

  for (const [argName, meta] of Object.entries(fnSchema.args)) {
    if (currentArgs && currentArgs[argName] !== undefined) {
      model[argName] = deepClone(currentArgs[argName])
      continue
    }

    if (example && example[argName] !== undefined) {
      model[argName] = deepClone(example[argName])
      continue
    }

    model[argName] = getDefaultValueFromMeta(meta, undefined)
  }

  return model
}

function normalizeArgsModelForPayload(argsModel = {}, fnSchema = null) {
  if (!fnSchema?.args) return deepClone(argsModel || {})

  const out = {}

  for (const [argName, meta] of Object.entries(fnSchema.args)) {
    let value = argsModel?.[argName]

    if (meta.type === 'number') {
      if (value === '' || value === null || value === undefined) {
        if (meta.required) out[argName] = value
        continue
      }

      const n = Number(value)
      out[argName] = Number.isFinite(n) ? n : value
      continue
    }

    if (meta.type === 'boolean') {
      out[argName] = !!value
      continue
    }

    if (meta.type === 'array' || meta.type === 'object') {
      out[argName] = deepClone(value)
      continue
    }

    if (value === undefined || value === null) {
      if (meta.required) out[argName] = ''
      continue
    }

    out[argName] = String(value)
  }

  return out
}

function getArgInputKind(meta = {}) {
  if (meta.type === 'boolean') return 'boolean'
  if (meta.type === 'number') return 'number'
  if (meta.type === 'object' || meta.type === 'array') return 'json'
  return 'text'
}

function createEmptyTarget() {
  return {
    moduleName: '',
    fn: '',
    argsModel: {},
    argsText: '{\n}'
  }
}

function createEmptyEditor() {
  return {
    id: null,
    name: '',
    description: '',
    enabled: true,
    from: '',
    action: '',
    cooldownMs: 0,
    whenMode: 'press',
    whenValue: 1,
    targets: [createEmptyTarget()]
  }
}

const editor = ref(createEmptyEditor())

function ruleMatchesSearch(rule) {
  if (!ruleSearch.value.trim()) return true
  const s = normalizeString(ruleSearch.value)

  const chunks = [
    rule.id,
    rule.name,
    rule.description,
    rule.from,
    rule.action,
    ...listRuleTargets(rule).flatMap(([moduleName, spec]) => [
      moduleName,
      spec?.fn,
      prettyJson(spec?.args)
    ])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return chunks.includes(s)
}

const filteredRules = computed(() => {
  return (rules.value || []).filter(ruleMatchesSearch)
})

const inputCount = computed(() => Object.keys(overview.value?.modulesin || {}).length)
const outputCount = computed(() => Object.keys(overview.value?.modulesout || {}).length)

const currentInputActions = computed(() => getInputActions(editor.value.from))
const currentInputActionItems = computed(() => toSelectItems(currentInputActions.value))

/* ---------------------------------
 * editor mapping
 * --------------------------------- */
function whenToEditor(when) {
  if (!when) return { whenMode: 'press', whenValue: 1 }
  if (when.press) return { whenMode: 'press', whenValue: 1 }
  if (when.release) return { whenMode: 'release', whenValue: 0 }
  if (when.hold) return { whenMode: 'hold', whenValue: 2 }
  if (when.value !== undefined) return { whenMode: 'value', whenValue: Number(when.value) }
  return { whenMode: 'press', whenValue: 1 }
}

function editorToWhen() {
  if (editor.value.whenMode === 'none') return undefined
  if (editor.value.whenMode === 'press') return { press: true }
  if (editor.value.whenMode === 'release') return { release: true }
  if (editor.value.whenMode === 'hold') return { hold: true }
  if (editor.value.whenMode === 'value') return { value: Number(editor.value.whenValue || 0) }
  return { press: true }
}

function ruleToEditor(rule = {}) {
  const whenPart = whenToEditor(rule.when)

  const targets = listRuleTargets(rule).map(([moduleName, spec]) => {
    const args = spec?.args ?? {}
    const fn = spec?.fn || ''
    const fnSchema = getFunctionSchema(moduleName, fn)

    return {
      moduleName,
      fn,
      argsModel: fnSchema ? buildArgsModelFromSchema(moduleName, fn, args) : {},
      argsText: prettyJson(args)
    }
  })

  return {
    id: rule.id || null,
    name: rule.name || '',
    description: rule.description || '',
    enabled: rule.enabled !== false,
    from: rule.from || rule.input || rule.modulein || '',
    action: rule.action || rule.vol20 || '',
    cooldownMs: Number(rule.cooldownMs || 0),
    whenMode: whenPart.whenMode,
    whenValue: whenPart.whenValue,
    targets: targets.length ? targets : [createEmptyTarget()]
  }
}

function buildPayloadFromEditor() {
  const payload = {
    name: editor.value.name?.trim() || '',
    description: editor.value.description?.trim() || '',
    enabled: !!editor.value.enabled,
    from: editor.value.from,
    action: editor.value.action
  }

  if (Number.isFinite(Number(editor.value.cooldownMs)) && Number(editor.value.cooldownMs) > 0) {
    payload.cooldownMs = Number(editor.value.cooldownMs)
  }

  const when = editorToWhen()
  if (when) payload.when = when

  for (const target of editor.value.targets) {
    if (!target.moduleName) {
      throw new Error('Chaque target doit avoir un module')
    }

    if (!target.fn) {
      throw new Error(`La fonction du module '${target.moduleName}' est obligatoire`)
    }

    const fnSchema = getFunctionSchema(target.moduleName, target.fn)
    let parsedArgs = {}

    if (fnSchema?.args) {
      parsedArgs = normalizeArgsModelForPayload(target.argsModel, fnSchema)
    } else {
      try {
        parsedArgs = target.argsText?.trim() ? JSON.parse(target.argsText) : {}
      } catch (e) {
        throw new Error(`JSON invalide pour ${target.moduleName}.${target.fn}`)
      }
    }

    payload[target.moduleName] = {
      fn: target.fn,
      args: parsedArgs
    }
  }

  return payload
}

function openCreateEditor() {
  editor.value = createEmptyEditor()
  validationResult.value = null
  editorOpen.value = true
}

function openEditEditor(rule) {
  editor.value = ruleToEditor(rule)
  validationResult.value = null
  editorOpen.value = true
}

function closeEditor() {
  editorOpen.value = false
  editor.value = createEmptyEditor()
  validationResult.value = null
}

function addTarget() {
  editor.value.targets.push(createEmptyTarget())
}

function removeTarget(index) {
  if (editor.value.targets.length <= 1) return
  editor.value.targets.splice(index, 1)
}

function updateTargetModule(index) {
  const target = editor.value.targets[index]
  target.fn = ''
  target.argsModel = {}
  target.argsText = '{\n}'
}

function updateTargetFunction(index) {
  const target = editor.value.targets[index]
  const fnSchema = getFunctionSchema(target.moduleName, target.fn)

  if (fnSchema?.args) {
    target.argsModel = buildArgsModelFromSchema(target.moduleName, target.fn, {})
    target.argsText = prettyJson(fnSchema.example || {})
  } else {
    target.argsModel = {}
    target.argsText = '{\n}'
  }
}

function makeVolumeDeltaPreset(index, delta) {
  const target = editor.value.targets[index]
  target.moduleName = 'snap'
  target.fn = 'volumeDelta'
  target.argsModel = buildArgsModelFromSchema('snap', 'volumeDelta', {
    id: '',
    delta
  })
  target.argsText = prettyJson({
    id: '',
    delta
  })
}

function makeToggleMutePreset(index) {
  const target = editor.value.targets[index]
  target.moduleName = 'snap'
  target.fn = 'toggleMute'
  target.argsModel = buildArgsModelFromSchema('snap', 'toggleMute', {
    id: ''
  })
  target.argsText = prettyJson({
    id: ''
  })
}

function makeSetVolumePreset(index, percent = 50) {
  const target = editor.value.targets[index]
  target.moduleName = 'snap'
  target.fn = 'setVolume'
  target.argsModel = buildArgsModelFromSchema('snap', 'setVolume', {
    id: '',
    percent
  })
  target.argsText = prettyJson({
    id: '',
    percent
  })
}

/* ---------------------------------
 * api
 * --------------------------------- */
async function fetchOverview() {
  try {
    loadingOverview.value = true
    errorMsg.value = null

    const res = await http.get('/control')
    overview.value = {
      modulesin: res.data?.modulesin || {},
      modulesout: res.data?.modulesout || {},
      modulesAll: res.data?.modulesAll || {}
    }
  } catch (e) {
    console.error(e)
    errorMsg.value = 'Impossible de charger le résumé control.'
    toast?.add?.({ title: 'Erreur', description: errorMsg.value, color: 'red' })
  } finally {
    loadingOverview.value = false
  }
}

async function fetchSchema() {
  try {
    loadingSchema.value = true

    const res = await http.get('/control/schema')
    schema.value = {
      inputs: res.data?.inputs || {},
      outputs: res.data?.outputs || {},
      ruleFormat: res.data?.ruleFormat || {}
    }
  } catch (e) {
    console.error(e)
    toast?.add?.({
      title: 'Erreur schema',
      description: 'Impossible de charger le schema des règles.',
      color: 'red'
    })
  } finally {
    loadingSchema.value = false
  }
}

async function fetchRules() {
  try {
    loadingRules.value = true

    const res = await http.get('/control/rules')
    rules.value = res.data?.rules || []
  } catch (e) {
    console.error(e)
    toast?.add?.({
      title: 'Erreur règles',
      description: 'Impossible de charger les règles.',
      color: 'red'
    })
  } finally {
    loadingRules.value = false
  }
}

async function refreshAll() {
  await Promise.all([
    fetchOverview(),
    fetchSchema(),
    fetchRules()
  ])
}

async function validateEditor() {
  try {
    validatingRule.value = true
    validationResult.value = null

    const payload = buildPayloadFromEditor()
    const res = await http.post('/control/rules/validate', payload)

    validationResult.value = res.data
    toast?.add?.({
      title: 'Validation OK',
      description: 'La règle est valide.',
      color: 'green'
    })
  } catch (e) {
    console.error(e)

    validationResult.value = e?.response?.data || {
      ok: false,
      errors: ['Validation impossible']
    }

    toast?.add?.({
      title: 'Validation KO',
      description: 'La règle est invalide.',
      color: 'amber'
    })
  } finally {
    validatingRule.value = false
  }
}

async function saveEditor() {
  try {
    savingRule.value = true
    const payload = buildPayloadFromEditor()

    let res
    if (editor.value.id) {
      res = await http.put(`/control/rules/${editor.value.id}`, payload)
    } else {
      res = await http.post('/control/rules', payload)
    }

    toast?.add?.({
      title: editor.value.id ? 'Règle modifiée' : 'Règle créée',
      description: res.data?.rule?.name || res.data?.rule?.id || 'OK',
      color: 'green'
    })

    closeEditor()
    await refreshAll()
  } catch (e) {
    console.error(e)
    const apiErrors = e?.response?.data?.errors
    const msg = Array.isArray(apiErrors) && apiErrors.length
      ? apiErrors.join(' | ')
      : e?.message || 'Enregistrement impossible.'

    toast?.add?.({
      title: 'Erreur',
      description: msg,
      color: 'red'
    })
  } finally {
    savingRule.value = false
  }
}

async function toggleRule(rule) {
  if (!rule?.id) return

  try {
    actionLoading.value = `toggle:${rule.id}`
    await http.patch(`/control/rules/${rule.id}/toggle`)
    await fetchRules()

    toast?.add?.({
      title: 'Règle mise à jour',
      description: rule.name || rule.id,
      color: 'green'
    })
  } catch (e) {
    console.error(e)
    toast?.add?.({
      title: 'Erreur',
      description: 'Impossible de changer l’état de la règle.',
      color: 'red'
    })
  } finally {
    actionLoading.value = null
  }
}

async function deleteRule(rule) {
  if (!rule?.id) return
  if (!confirm(`Supprimer la règle "${rule.name || rule.id}" ?`)) return

  try {
    actionLoading.value = `delete:${rule.id}`
    await http.delete(`/control/rules/${rule.id}`)
    await fetchRules()

    toast?.add?.({
      title: 'Règle supprimée',
      description: rule.name || rule.id,
      color: 'green'
    })
  } catch (e) {
    console.error(e)
    toast?.add?.({
      title: 'Erreur suppression',
      description: 'Impossible de supprimer la règle.',
      color: 'red'
    })
  } finally {
    actionLoading.value = null
  }
}

function copyRuleAsJson(rule) {
  navigator.clipboard?.writeText(prettyJson(rule))
  toast?.add?.({
    title: 'Copié',
    description: rule.name || rule.id,
    color: 'green'
  })
}

/* ---------------------------------
 * mounted
 * --------------------------------- */
onMounted(async () => {
  await refreshAll()
})
</script>

<template>
  <div class="flex flex-col gap-6 pb-10 px-3 sm:px-4 lg:px-6">
    <div class="sticky top-0 z-20 -mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6 pt-4 pb-3">
      <UDashboardNavbar class="sticky top-1 z-20 bg-background/80 backdrop-blur border-b border-default" style="height: 80px;">
        <template #left>
          <UPageCard
            title="Control / Rules"
            description="Gestion des modules input, output et des règles fn + args."
            variant="naked"
            orientation="horizontal"
            class="mb-0"
          />
        </template>

        <template #right>
          <div class="flex flex-wrap gap-2 w-full lg:w-auto lg:ms-auto items-center">
            <div class="hidden sm:flex items-center gap-2 text-xs text-dimmed">
              <span>Inputs: {{ inputCount }}</span>
              <span>· Outputs: {{ outputCount }}</span>
              <span>· Rules: {{ rules.length }}</span>
            </div>

            <UButton
              icon="i-lucide-refresh-ccw"
              color="neutral"
              :loading="loadingOverview || loadingSchema || loadingRules"
              @click="refreshAll"
            >
              Rafraîchir
            </UButton>

            <UButton
              icon="i-lucide-plus"
              color="primary"
              @click="openCreateEditor"
            >
              Nouvelle règle
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </div>

    <UAlert v-if="errorMsg" color="red" :title="errorMsg" />

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <UPageCard variant="subtle" :ui="{ container: 'p-4 gap-y-3' }">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold">Modules input</h3>
          <UBadge color="primary" variant="subtle">{{ Object.keys(overview.modulesin || {}).length }}</UBadge>
        </div>

        <div v-if="!Object.keys(overview.modulesin || {}).length" class="text-sm text-dimmed">
          Aucun module input.
        </div>

        <div v-else class="grid gap-3">
          <UPageCard
            v-for="(mod, name) in overview.modulesin"
            :key="`in-${name}`"
            variant="soft"
            :ui="{ container: 'p-3 gap-y-2' }"
          >
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium">{{ name }}</div>
                <div class="text-xs text-dimmed">{{ mod.type }}</div>
              </div>
              <UBadge color="primary" variant="subtle">
                {{ mod.keyActions.length || 0 }} actions
              </UBadge>
            </div>

            <div class="flex flex-wrap gap-2">
              <UBadge
                v-for="act in mod.keyActions || []"
                :key="`${name}-${act}`"
                color="neutral"
                variant="soft"
              >
                {{ act }}
              </UBadge>
            </div>
          </UPageCard>
        </div>
      </UPageCard>

      <UPageCard variant="subtle" :ui="{ container: 'p-4 gap-y-3' }">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold">Modules output</h3>
          <UBadge color="primary" variant="subtle">{{ Object.keys(overview.modulesout || {}).length }}</UBadge>
        </div>

        <div v-if="!Object.keys(overview.modulesout || {}).length" class="text-sm text-dimmed">
          Aucun module output.
        </div>

        <div v-else class="grid gap-3">
          <UPageCard
            v-for="(mod, name) in overview.modulesout"
            :key="`out-${name}`"
            variant="soft"
            :ui="{ container: 'p-3 gap-y-2' }"
          >
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium">{{ name }}</div>
                <div class="text-xs text-dimmed">{{ mod.type }}</div>
              </div>
              <UBadge color="primary" variant="subtle">
                {{ mod.functions?.length || 0 }} fonctions
              </UBadge>
            </div>

            <div class="flex flex-wrap gap-2">
              <UBadge
                v-for="fn in mod.functions || []"
                :key="`${name}-${fn}`"
                color="neutral"
                variant="soft"
              >
                {{ fn }}
              </UBadge>
            </div>

            <div
              v-if="mod.functionSchema && Object.keys(mod.functionSchema).length"
              class="grid gap-2 pt-2"
            >

            </div>
          </UPageCard>
        </div>
      </UPageCard>
    </div>

    <UPageCard
      variant="subtle"
      :ui="{ container: 'p-3 sm:p-4 gap-y-0', wrapper: 'items-stretch' }"
    >
      <div class="flex flex-col md:flex-row gap-3 md:items-center">
        <div class="flex-1">
          <UInput
            v-model="ruleSearch"
            icon="i-lucide-search"
            placeholder="Rechercher une règle, action, module, fonction, args..."
          />
        </div>

        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          @click="fetchRules"
        >
          Refresh règles
        </UButton>
      </div>
    </UPageCard>

    <UPageCard
      v-if="editorOpen"
      variant="subtle"
      :ui="{ container: 'p-4 sm:p-5 gap-y-4' }"
    >
      <div class="flex items-center justify-between gap-3">
        <div>
          <h3 class="font-semibold">
            {{ editor.id ? 'Modifier la règle' : 'Créer une règle' }}
          </h3>
          <div class="text-xs text-dimmed">
            Format cible: <span class="font-mono">module: { fn, args }</span>
          </div>
        </div>

        <div class="flex gap-2">
          <UButton color="neutral" variant="ghost" @click="closeEditor">
            Fermer
          </UButton>
          <UButton color="amber" variant="ghost" :loading="validatingRule" @click="validateEditor">
            Valider
          </UButton>
          <UButton color="primary" :loading="savingRule" @click="saveEditor">
            Enregistrer
          </UButton>
        </div>
      </div>

      <UAlert
        v-if="validationResult"
        :color="validationResult.ok ? 'green' : 'amber'"
        :title="validationResult.ok ? 'Validation OK' : 'Validation KO'"
        :description="validationResult.ok ? 'La règle est valide.' : (validationResult.errors || []).join(' | ')"
      />

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <label class="text-xs text-dimmed block mb-1">Nom</label>
          <UInput v-model="editor.name" placeholder="Volume - salon" />
        </div>

        <div>
          <label class="text-xs text-dimmed block mb-1">Description</label>
          <UInput v-model="editor.description" placeholder="Règle volume bas salon" />
        </div>

        <div>
          <label class="text-xs text-dimmed block mb-1">Input</label>
          <USelect
            v-model="editor.from"
            size="sm"
            :items="toSelectItems(getInputNames())"
          />
        </div>

        <div>
          <label class="text-xs text-dimmed block mb-1">Action</label>
          <USelect
            v-model="editor.action"
            size="sm"
            :items="currentInputActionItems"
          />
        </div>

        <div>
          <label class="text-xs text-dimmed block mb-1">Cooldown (ms)</label>
          <UInput v-model.number="editor.cooldownMs" type="number" min="0" />
        </div>

        <div class="flex items-center gap-3 pt-5">
          <USwitch v-model="editor.enabled" />
          <span class="text-sm">Enabled</span>
        </div>

        <div>
          <label class="text-xs text-dimmed block mb-1">When</label>
          <USelect
            v-model="editor.whenMode"
            size="sm"
            :items="[
              { label: 'None', value: 'none' },
              { label: 'Press', value: 'press' },
              { label: 'Release', value: 'release' },
              { label: 'Hold', value: 'hold' },
              { label: 'Value', value: 'value' }
            ]"
          />
        </div>

        <div v-if="editor.whenMode === 'value'">
          <label class="text-xs text-dimmed block mb-1">when.value</label>
          <UInput v-model.number="editor.whenValue" type="number" min="0" max="2" />
        </div>
      </div>

      <div class="flex items-center justify-between pt-2">
        <h4 class="font-medium">Targets</h4>
        <UButton size="xs" color="primary" variant="ghost" @click="addTarget">
          Ajouter target
        </UButton>
      </div>

      <div class="grid gap-4">
        <UPageCard
          v-for="(target, index) in editor.targets"
          :key="`target-${index}`"
          variant="soft"
          :ui="{ container: 'p-4 gap-y-3' }"
        >
          <div class="flex items-center justify-between">
            <div class="font-medium">Target #{{ index + 1 }}</div>
            <UButton
              size="xs"
              color="red"
              variant="ghost"
              :disabled="editor.targets.length <= 1"
              @click="removeTarget(index)"
            >
              Supprimer
            </UButton>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label class="text-xs text-dimmed block mb-1">Module output</label>
              <USelect
                v-model="target.moduleName"
                size="sm"
                :items="toSelectItems(getOutputNames())"
                @update:model-value="updateTargetModule(index)"
              />
            </div>

            <div>
              <label class="text-xs text-dimmed block mb-1">Fonction</label>
              <USelect
                v-model="target.fn"
                size="sm"
                :items="toSelectItems(getOutputFunctions(target.moduleName))"
                @update:model-value="updateTargetFunction(index)"
              />
            </div>
          </div>

          <div
            v-if="getFunctionSchema(target.moduleName, target.fn)"
            class="rounded-lg border border-default p-3 bg-muted/30"
          >
            <div class="font-medium">
              {{ getFunctionSchema(target.moduleName, target.fn)?.label || target.fn }}
            </div>

            <div
              v-if="getFunctionSchema(target.moduleName, target.fn)?.description"
              class="text-xs text-dimmed mt-1"
            >
              {{ getFunctionSchema(target.moduleName, target.fn)?.description }}
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton
              v-if="target.moduleName === 'snap'"
              size="2xs"
              color="neutral"
              variant="ghost"
              @click="makeVolumeDeltaPreset(index, -3)"
            >
              Preset snap volume -3
            </UButton>

            <UButton
              v-if="target.moduleName === 'snap'"
              size="2xs"
              color="neutral"
              variant="ghost"
              @click="makeVolumeDeltaPreset(index, 3)"
            >
              Preset snap volume +3
            </UButton>

            <UButton
              v-if="target.moduleName === 'snap'"
              size="2xs"
              color="neutral"
              variant="ghost"
              @click="makeToggleMutePreset(index)"
            >
              Preset snap toggleMute
            </UButton>

            <UButton
              v-if="target.moduleName === 'snap'"
              size="2xs"
              color="neutral"
              variant="ghost"
              @click="makeSetVolumePreset(index, 50)"
            >
              Preset snap setVolume 50
            </UButton>
          </div>

          <div
            v-if="hasStructuredArgs(target)"
            class="grid grid-cols-1 lg:grid-cols-2 gap-4"
          >
            <div
              v-for="[argName, meta] in getFunctionArgEntries(target.moduleName, target.fn)"
              :key="`${target.moduleName}-${target.fn}-${argName}`"
              class="space-y-1"
            >
              <label class="text-xs text-dimmed block">
                {{ getArgLabel(argName, meta) }}
                <span v-if="meta.required" class="text-red-500">*</span>
              </label>

              <div v-if="getArgInputKind(meta) === 'boolean'" class="flex items-center gap-3 pt-2">
                <USwitch v-model="target.argsModel[argName]" />
                <span class="text-sm">{{ getArgLabel(argName, meta) }}</span>
              </div>

              <UInput
                v-else-if="getArgInputKind(meta) === 'number'"
                v-model.number="target.argsModel[argName]"
                type="number"
                :min="meta.min"
                :max="meta.max"
                :placeholder="getArgPlaceholder(meta)"
              />

              <UTextarea
                v-else-if="getArgInputKind(meta) === 'json'"
                :model-value="prettyJson(target.argsModel[argName] ?? (meta.type === 'array' ? [] : {}))"
                :rows="6"
                class="font-mono"
                @update:model-value="(val) => {
                  try {
                    target.argsModel[argName] = JSON.parse(val)
                  } catch {}
                }"
              />

              <UInput
                v-else
                v-model="target.argsModel[argName]"
                type="text"
                :placeholder="getArgPlaceholder(meta)"
              />

              <div v-if="meta.description" class="text-[11px] text-dimmed">
                {{ meta.description }}
              </div>

              <div class="text-[11px] text-dimmed">
                type: <span class="font-mono">{{ meta.type || 'string' }}</span>
              </div>
            </div>
          </div>

          <div v-else>
            <label class="text-xs text-dimmed block mb-1">args (JSON)</label>
            <UTextarea
              v-model="target.argsText"
              :rows="8"
              class="font-mono"
            />
            <div class="text-[11px] text-dimmed mt-1">
              Aucun schema disponible pour cette fonction. Mode JSON brut.
            </div>
          </div>

          <div v-if="hasStructuredArgs(target)" class="rounded-lg border border-default p-3 bg-muted/20">
            <div class="text-xs text-dimmed mb-1">Preview args</div>
            <pre class="text-[11px] leading-5 whitespace-pre-wrap break-all text-dimmed font-mono">{{ prettyJson(target.argsModel) }}</pre>
          </div>
        </UPageCard>
      </div>
    </UPageCard>

    <div>
      <div class="flex items-center justify-between mb-2">
        <h3 class="font-semibold">Règles</h3>
        <div class="text-xs text-dimmed">{{ filteredRules.length }} affichée(s)</div>
      </div>

      <div v-if="!filteredRules.length" class="text-sm text-dimmed">
        Aucune règle.
      </div>

      <div v-else class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        <UPageCard
          v-for="rule in filteredRules"
          :key="rule.id"
          variant="subtle"
          :ui="{ container: 'p-4 gap-y-3' }"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-base truncate">
                  {{ rule.name || rule.id }}
                </span>

                <UBadge :color="rule.enabled === false ? 'amber' : 'green'" variant="subtle">
                  {{ rule.enabled === false ? 'Disabled' : 'Enabled' }}
                </UBadge>
              </div>

              <div class="text-xs text-dimmed font-mono">
                {{ rule.id }}
              </div>

              <div class="text-sm text-dimmed" v-if="rule.description">
                {{ rule.description }}
              </div>
            </div>

            <div class="flex flex-col gap-2 items-end">
              <div class="flex items-center gap-2">
                <span class="text-xs text-dimmed">Enabled</span>
                <USwitch
                  :model-value="rule.enabled !== false"
                  :disabled="actionLoading === `toggle:${rule.id}`"
                  @update:model-value="toggleRule(rule)"
                />
              </div>

              <UButton size="xs" color="neutral" variant="ghost" @click="openEditEditor(rule)">
                Edit
              </UButton>

              <UButton size="xs" color="neutral" variant="ghost" @click="copyRuleAsJson(rule)">
                Copy JSON
              </UButton>

              <UButton
                size="xs"
                color="red"
                variant="ghost"
                :loading="actionLoading === `delete:${rule.id}`"
                @click="deleteRule(rule)"
              >
                Delete
              </UButton>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2 text-[11px] text-dimmed">
            <div>
              Input:
              <span class="font-mono">{{ rule.from || '-' }}</span>
            </div>
            <div>
              Action:
              <span class="font-mono">{{ rule.action || '-' }}</span>
            </div>
            <div>
              When:
              <span class="font-mono">{{ prettyJson(rule.when || { press: true }) }}</span>
            </div>
            <div>
              Cooldown:
              <span class="font-mono">{{ rule.cooldownMs ?? 0 }}</span>
            </div>
          </div>

          <div class="grid gap-3">
            <UPageCard
              v-for="[moduleName, spec] in listRuleTargets(rule)"
              :key="`${rule.id}-${moduleName}`"
              variant="soft"
              :ui="{ container: 'p-3 gap-y-2' }"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="font-medium">
                  {{ moduleName }}
                </div>
                <UBadge color="primary" variant="subtle">
                  {{ spec?.fn || '-' }}
                </UBadge>
              </div>

              <pre class="text-[11px] leading-5 whitespace-pre-wrap break-all text-dimmed font-mono">{{ prettyJson(spec?.args || {}) }}</pre>
            </UPageCard>
          </div>
        </UPageCard>
      </div>
    </div>
  </div>
</template>
