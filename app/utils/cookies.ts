export enum CookieName {
  TOKEN = 'TOKEN',
  AUTH_UI = 'AUTH_UI'
}

export type CookieSetOptions = Partial<{
  'path': string
  'domain': string
  'expires': Date | string
  'max-age': number
  'secure': boolean
  'samesite': 'lax' | 'strict' | 'none' | string
}>

export function setCookie(name: string, value: string, options: CookieSetOptions = {}): void {
  const parts: string[] = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`]
  if (options.expires instanceof Date) parts.push(`Expires=${options.expires.toUTCString()}`)
  else if (typeof options.expires === 'string') parts.push(`Expires=${options.expires}`)
  if (typeof options['max-age'] === 'number') parts.push(`Max-Age=${options['max-age']}`)
  if (options.path) parts.push(`Path=${options.path}`)
  if (options.domain) parts.push(`Domain=${options.domain}`)
  if (options.secure) parts.push('Secure')
  if (options.samesite) parts.push(`SameSite=${options.samesite}`)
  document.cookie = parts.join(' ')
}

export function getCookie(name: string): string | null {
  const value = document.cookie.split(' ').find(row => row.startsWith(`${encodeURIComponent(name)}=`))?.split('=')[1]
  return value ? decodeURIComponent(value) : null
}

export function deleteCookie(name: string, options: Pick<CookieSetOptions, 'path' | 'domain'> = {}): void {
  setCookie(name, '', { ...options, 'max-age': 0 })
}

export const getToken = (): string | null => getCookie(CookieName.TOKEN)
export const deleteToken = (): void => deleteCookie(CookieName.TOKEN)