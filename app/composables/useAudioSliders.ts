type Dir = 'output' | 'input'

/**
 * Saisies locales des curseurs audio d'un appareil (sortie / entrée), communes
 * au volet des appareils et à la page /devices.
 *
 * Tant qu'un curseur a été bougé, sa valeur locale s'affiche à la place de
 * celle du serveur ; `send` émet la commande WebSocket correspondante.
 */
export function useAudioSliders(send: (key: string, method: string, extra?: Record<string, unknown>) => void) {
  const percent = { output: ref<Record<string, number>>({}), input: ref<Record<string, number>>({}) }
  const chPercent = {
    output: ref<Record<string, Record<string, number>>>({}),
    input: ref<Record<string, Record<string, number>>>({})
  }

  const val = (dir: Dir, key: string, fb: number) => key in percent[dir].value ? percent[dir].value[key] : fb
  const chVal = (dir: Dir, key: string, ch: string, fb: number) => chPercent[dir].value[key]?.[ch] ?? fb

  function onSlider(dir: Dir, key: string, v: number) {
    percent[dir].value = { ...percent[dir].value, [key]: v }
    // le serveur remet tous les canaux au même niveau : leurs saisies locales sont oubliées
    chPercent[dir].value = Object.fromEntries(Object.entries(chPercent[dir].value).filter(([k]) => k !== key))
    send(key, `Set.${dir}.volume`, { percent: v })
  }
  function onChSlider(dir: Dir, key: string, ch: string, v: number) {
    chPercent[dir].value = { ...chPercent[dir].value, [key]: { ...(chPercent[dir].value[key] ?? {}), [ch]: v } }
    send(key, `Set.${dir}.channel`, { channel: ch, percent: v })
  }

  return { val, chVal, onSlider, onChSlider }
}
