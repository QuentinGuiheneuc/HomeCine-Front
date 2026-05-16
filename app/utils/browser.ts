export type BrowserName = 'chrome' | 'firefox' | 'opera' | 'safari' | 'edge' | 'unknown'

export interface BrowserInfo {
  name: BrowserName
  version: string
}

export function detectBrowser(): BrowserInfo {
  if (typeof navigator === 'undefined') return { name: 'unknown', version: '' }

  const ua = navigator.userAgent

  // Opera doit être testé avant Chrome (OPR/xx dans le UA)
  if (/OPR\/|Opera/.test(ua)) {
    const v = ua.match(/(?:OPR|Opera)[\/ ]([\d.]+)/)?.[1] ?? ''
    return { name: 'opera', version: v }
  }

  // Edge (Chromium) doit être testé avant Chrome (Edg/xx dans le UA)
  if (/Edg\//.test(ua)) {
    const v = ua.match(/Edg\/([\d.]+)/)?.[1] ?? ''
    return { name: 'edge', version: v }
  }

  if (/Firefox\//.test(ua)) {
    const v = ua.match(/Firefox\/([\d.]+)/)?.[1] ?? ''
    return { name: 'firefox', version: v }
  }

  if (/Chrome\//.test(ua)) {
    const v = ua.match(/Chrome\/([\d.]+)/)?.[1] ?? ''
    return { name: 'chrome', version: v }
  }

  if (/Safari\//.test(ua)) {
    const v = ua.match(/Version\/([\d.]+)/)?.[1] ?? ''
    return { name: 'safari', version: v }
  }

  return { name: 'unknown', version: '' }
}

export function getBrowserToken(): string {
  const { name, version } = detectBrowser()
  const major = version.split('.')[0]
  return `${name}${major ? `-${major}` : ''}`
}
