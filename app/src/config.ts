const appConfig = {
  API_URL: process.env.API_URL ?? ‘http://192.168.1.40:3007’,
  WS_URL:  process.env.WS_BASE ?? ‘ws://192.168.1.40:8099’
} as const

export default appConfig
