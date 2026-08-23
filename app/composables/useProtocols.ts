import { createSharedComposable } from '@vueuse/core'
import { getServices, setServiceEnabled, type Service } from '@/src/api/services'
import { SUPPORTED_PROTOCOLS } from '@/src/api/protocols'

/**
 * État des services/protocoles audio, partagé pour toute l'app
 * (page Connexions + menu, ex. entrée VBAN). Source : API /services.
 */
export interface ProtocolView {
  name:        string   // identifiant service (= name API)
  label:       string
  icon:        string
  description: string
  enabled:     boolean
  running:     boolean
  available:   boolean
}

const _useProtocols = () => {
  const services = ref<Service[]>([])
  const pending  = ref(false)

  async function refresh() {
    pending.value = true
    try { services.value = await getServices() } catch { /* noop */ }
    finally { pending.value = false }
  }
  if (import.meta.client) refresh()

  /** Liste enrichie (icône/description depuis les métadonnées connues) */
  const protocols = computed<ProtocolView[]>(() =>
    services.value.map((s) => {
      const meta = SUPPORTED_PROTOCOLS.find(p => p.id === s.name)
      return {
        name:        s.name,
        label:       s.label || meta?.name || s.name,
        icon:        meta?.icon ?? 'i-lucide-radio',
        description: meta?.description ?? '',
        enabled:     !!s.enabled,
        running:     !!s.running,
        available:   s.available !== false,
      }
    })
  )

  const isEnabled = (name: string) => services.value.find(s => s.name === name)?.enabled ?? false

  /** Active/désactive un service (PUT) puis recharge l'état effectif */
  async function setEnabled(name: string, value: boolean) {
    await setServiceEnabled(name, value)
    await refresh()
  }

  return { services, protocols, pending, isEnabled, setEnabled, refresh }
}

export const useProtocols = createSharedComposable(_useProtocols)
