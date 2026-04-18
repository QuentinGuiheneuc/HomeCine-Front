import type { AlsaPcmDef, BindRow, BusCard, UsbItem } from '~/types/device'

type Deps = {
  usb: Ref<UsbItem[]>
  cfgPcms: ComputedRef<AlsaPcmDef[]>
  setDefaultPcm: Ref<string>
  upsertPcm: (def: AlsaPcmDef) => Promise<void> | void
  deletePcm: (name: string) => Promise<void> | void
  ok: (m: string) => void
  ko: (m: string) => void
  info: (m: string) => void
}

/**
 * Owns the BUS-tab state and actions (multi-card PCM editor).
 *
 * The composable is deliberately UI-agnostic: it never switches tabs nor
 * refreshes data — callers pair it with their own `fetchAll` / tab state.
 */
export function useDeviceBus(deps: Deps) {
  const { usb, cfgPcms, setDefaultPcm, upsertPcm, deletePcm, ok, ko, info } = deps

  const busName = ref('alsa_bus')
  const busCards = ref<BusCard[]>([])
  const busRows = ref<BindRow[]>([])

  const totalBusChannels = computed(() =>
    busCards.value.reduce((acc, c) => acc + (c.channels || 0), 0)
  )

  const busIssues = computed(() => {
    const issues: string[] = []
    if (!busName.value.trim()) issues.push('Nom BUS requis')
    if (!busCards.value.length) issues.push('Ajoute au moins une carte')

    const paths = busCards.value.map(c => c.usbByPath)
    if (new Set(paths).size !== paths.length) issues.push('Deux cartes identiques (A=B)')

    const total = totalBusChannels.value
    const outs = new Set(busRows.value.map(r => r.out))
    for (let i = 0; i < total; i++) {
      if (!outs.has(i)) { issues.push(`Mapping incomplet: out ${i} manquant`); break }
    }

    const chMap = new Map(busCards.value.map(c => [c.key, c.channels]))
    for (const r of busRows.value) {
      const max = chMap.get(r.cardKey)
      if (max == null) continue
      if (r.ch < 0 || r.ch >= max) {
        issues.push(`out${r.out}: ${r.cardKey} ch${r.ch} hors plage`)
        break
      }
    }

    return issues
  })

  const busList = computed(() =>
    cfgPcms.value
      .filter(p => p?.type === 'multi' && p?.name)
      .map(p => ({
        name: String(p.name),
        desc: p?.hint?.description ? String(p.hint.description) : '',
        slaves: Array.isArray(p.slaves) ? p.slaves : []
      }))
  )

  function busChannelsCount(bus: { slaves?: Array<{ channels?: number }> }) {
    return (bus?.slaves || []).reduce((acc, s) => acc + (Number(s?.channels) || 0), 0)
  }

  function addBusCard() {
    const idx = busCards.value.length
    const key = String.fromCharCode(97 + idx) // a, b, c, ...
    const pick = usb.value[idx]?.byPath || usb.value[0]?.byPath || ''
    busCards.value.push({ key, usbByPath: pick, channels: 6 })
  }

  function removeBusCard(key: string) {
    busCards.value = busCards.value
      .filter(c => c.key !== key)
      .map((c, i) => ({ ...c, key: String.fromCharCode(97 + i) }))
    autoFillBus()
  }

  function autoFillBus() {
    const rows: BindRow[] = []
    let out = 0
    for (const c of busCards.value) {
      for (let ch = 0; ch < c.channels; ch++) {
        rows.push({ out, cardKey: c.key, ch })
        out++
      }
    }
    busRows.value = rows
    if (!setDefaultPcm.value) setDefaultPcm.value = busName.value
    ok('BUS auto rempli')
  }

  function saveBusPcm() {
    if (busIssues.value.length) return ko('Corrige les erreurs BUS avant de sauvegarder')

    const slaves = busCards.value
      .map((c) => {
        const u = usb.value.find(x => x.byPath === c.usbByPath)
        return { id: c.key, pcm: u?.plughw || '', channels: c.channels }
      })
      .filter(s => s.pcm)

    const def: AlsaPcmDef = {
      name: busName.value,
      type: 'multi',
      slaves,
      bindings: busRows.value.map(r => ({ out: r.out, slave: r.cardKey, ch: r.ch })),
      hint: { show: true, description: `BUS ${totalBusChannels.value}ch` }
    }

    return upsertPcm(def)
  }

  function loadMultiIntoBus(def: AlsaPcmDef) {
    busName.value = def.name
    const slaves = def.slaves || []
    busCards.value = slaves.map((s, idx) => {
      const u = usb.value.find(x => x.plughw === s.pcm)
      return {
        key: s.id || String.fromCharCode(97 + idx),
        usbByPath: u?.byPath || (usb.value[idx]?.byPath || ''),
        channels: s.channels ?? 2
      }
    })
    const bindings = def.bindings || []
    busRows.value = bindings.map(x => ({
      out: x.out,
      cardKey: x.slave,
      // `channel` is a legacy field name — kept for backward compat
      ch: (x as { ch?: number, channel?: number }).ch ?? (x as { channel?: number }).channel ?? 0
    }))
  }

  function selectBusCard(name: string) {
    const def = cfgPcms.value.find(p => p?.type === 'multi' && p?.name === name)
    if (!def) return info(`BUS "${name}" introuvable`)
    loadMultiIntoBus(def)
  }

  function createNewBusCard() {
    busName.value = 'alsa_bus'
    busCards.value = []
    busRows.value = []

    if (usb.value.length) {
      addBusCard()
      if (usb.value[1]) addBusCard()
      autoFillBus()
    }
  }

  async function deleteBusCard(name: string) {
    await deletePcm(name)
    if (busName.value === name) createNewBusCard()
  }

  function normalizeBusRows() {
    const expected = totalBusChannels.value
    const base = (busRows.value || []).slice(0, expected).map((r, i) => ({
      out: i,
      cardKey: r.cardKey || busCards.value[0]?.key || 'a',
      ch: Number.isFinite(r.ch) ? r.ch : 0
    }))
    for (let i = base.length; i < expected; i++) {
      base.push({ out: i, cardKey: busCards.value[0]?.key || 'a', ch: 0 })
    }
    busRows.value = base
  }

  function nextCardKey(currentKey: string) {
    const keys = busCards.value.map(c => c.key)
    const idx = keys.indexOf(currentKey)
    if (idx < 0) return keys[0] || 'a'
    return keys[(idx + 1) % keys.length] || currentKey
  }

  function cardChannels(cardKey: string) {
    return busCards.value.find(c => c.key === cardKey)?.channels ?? 0
  }

  function addFullBusRow() {
    if (!busCards.value.length) {
      ko('Ajoute au moins une carte dans le BUS')
      return
    }

    const rows = busRows.value || []
    const out = rows.length ? (Math.max(...rows.map(r => r.out)) + 1) : 0
    const last = rows.length ? rows[rows.length - 1] : null

    let cardKey = last?.cardKey || busCards.value[0]!.key
    let ch = Number.isFinite(last?.ch) ? (last!.ch + 1) : 0

    const maxCh = cardChannels(cardKey)
    if (maxCh > 0 && ch >= maxCh) {
      cardKey = nextCardKey(cardKey)
      ch = 0
    }

    busRows.value = [...rows, { out, cardKey, ch }]
  }

  function removeBusRow(idx: number) {
    const rows = [...(busRows.value || [])]
    if (idx < 0 || idx >= rows.length) return
    rows.splice(idx, 1)
    // re-index Out so it stays 0..n-1
    rows.forEach((r, i) => { r.out = i })
    busRows.value = rows
  }

  return {
    // state
    busName,
    busCards,
    busRows,
    // derived
    totalBusChannels,
    busIssues,
    busList,
    // helpers (pure)
    busChannelsCount,
    cardChannels,
    // actions
    addBusCard,
    removeBusCard,
    autoFillBus,
    saveBusPcm,
    loadMultiIntoBus,
    selectBusCard,
    createNewBusCard,
    deleteBusCard,
    addFullBusRow,
    removeBusRow,
    normalizeBusRows
  }
}

export type UseDeviceBus = ReturnType<typeof useDeviceBus>
