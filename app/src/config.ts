const appConfig = {
  API_URL: process.env.API_URL ?? 'http://localhost:3007',
  WS_URL:  process.env.WS_BASE ?? 'ws://localhost:8099'
} as const

export default appConfig
