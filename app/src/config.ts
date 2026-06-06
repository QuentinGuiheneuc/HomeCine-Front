const appConfig = {
  API_URL: process.env.API_URL ?? '/proxy',
  WS_URL:  process.env.WS_BASE ?? 'ws://192.168.1.40:8099',
  WS_URL_BROADCAST: process.env.WS_URL_BROADCAST ?? 'ws:///192.168.1.40:9086'
} as const

export default appConfig
