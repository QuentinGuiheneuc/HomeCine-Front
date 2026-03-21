export type LecteurType = 'spotify' | 'deezer' | 'radio' | 'local' | string

export type ConfEq = {
  rate: number
  config: string
  path_eq: string
  order: string[]
}

export type Lecteur = {
  id: number
  name: string
  type: LecteurType
  isStarting: number | boolean
  config: any
  conf_eq: ConfEq | null
}

export type LecteurState = {
  id: number
  status: 'stopped' | 'starting' | 'running' | 'error'
  message?: string
  track?: {
    title?: string
    artist?: string
    album?: string
    cover?: string
  }
  volume?: { percent: number; muted: boolean }
}

export const typeStream = ref< any >({
  spotify: {
    bitrateItems: [
      { label: '96', value: '96' },
      { label: '160', value: '160' },
      { label: '320', value: '320' }
    ],
    Device_typeItems: [
      { label: 'avr', value: 'avr' },
      { label: 'speaker', value: 'speaker' },
      { label: 'computer', value: 'computer' },
      { label: 'tablet', value: 'tablet' },
      { label: 'smartphone', value: 'smartphone' },
      { label: 'tv', value: 'tv' },
      { label: 'stb', value: 'stb' },
      { label: 'audiodongle', value: 'audiodongle' },
      { label: 'gameconsole', value: 'gameconsole' },
      { label: 'castvideo', value: 'castvideo' },
      { label: 'castaudio', value: 'castaudio' },
      { label: 'automobile', value: 'automobile' },
      { label: 'smartwatch', value: 'chromebook' },
      { label: 'carthing', value: 'carthing' }
    ],
    frames_per_bufferItems: [
      { label: '256', value: 256 },
      { label: '512', value: 512 },
      { label: '1024', value: 1024 },
      { label: '2048', value: 2048 }
    ]
  },
  deezer: {
    bitrateItems: [
      { label: '96', value: '96' },
      { label: '128', value: '128' },
      { label: '160', value: '160' },
      { label: '320', value: '320' }

    ],
    Device_typeItems: [
      { label: 'avr', value: 'avr' },
      { label: 'speaker', value: 'speaker' },
      { label: 'computer', value: 'computer' },
      { label: 'tablet', value: 'tablet' },
      { label: 'smartphone', value: 'smartphone' },
      { label: 'tv', value: 'tv' },
      { label: 'stb', value: 'stb' },
      { label: 'audiodongle', value: 'audiodongle' },
      { label: 'gameconsole', value: 'gameconsole' },
      { label: 'castvideo', value: 'castvideo' },
      { label: 'castaudio', value: 'castaudio' },
      { label: 'automobile', value: 'automobile' },
      { label: 'smartwatch', value: 'chromebook' },
      { label: 'carthing', value: 'carthing' }
    ],
    frames_per_bufferItems: [
      { label: '256', value: 256 },
      { label: '512', value: 512 },
      { label: '1024', value: 1024 },
      { label: '2048', value: 2048 }
    ]
  }
})
