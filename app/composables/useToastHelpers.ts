/**
 * Thin wrapper around `useToast()` exposing three shortcut helpers
 * used across the app: `ok`, `ko`, `info`.
 */
export function useToastHelpers() {
  const toast = useToast?.()

  const ok = (m: string) =>
    toast?.add({ title: 'OK', description: m, icon: 'i-lucide-check', color: 'primary' })

  const ko = (m: string) =>
    toast?.add({ title: 'Erreur', description: m, icon: 'i-lucide-x', color: 'error' })

  const info = (m: string) =>
    toast?.add({ title: 'Info', description: m, icon: 'i-lucide-info', color: 'neutral' })

  return { ok, ko, info }
}
