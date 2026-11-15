/**
 * Icônes partagées — évite de redéfinir la même table de correspondance
 * dans chaque page/composant (auto-importé par Nuxt depuis app/utils).
 */

/**
 * Icône d'une source de bibliothèque ou d'un type de lecteur
 * (spotify, fileplayer, youtube…).
 *
 * `fallback` : icône par défaut de l'appelant — la page Connexions liste des
 * fournisseurs et non de la musique, elle passe `i-lucide-database`.
 */
export function sourceIcon(source?: string | null, fallback = 'i-lucide-music'): string {
  switch ((source ?? '').toLowerCase()) {
    case 'spotify': return 'mdi:spotify'
    case 'fileplayer': return 'mdi:file-music'
    case 'youtube': return 'mdi:youtube'
    case 'deezer': return 'i-simple-icons-deezer'
    case 'soundcloud': return 'i-simple-icons-soundcloud'
    case 'tidal': return 'i-simple-icons-tidal'
    case 'playlist': return 'i-lucide-list-music'
    default: return fallback
  }
}
