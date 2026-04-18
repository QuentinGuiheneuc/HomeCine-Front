type SelectItem<T = string> = { label: string; value: T }

const deviceTypeItems: SelectItem[] = [
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
]

const framesPerBufferItems: SelectItem<number>[] = [
  { label: '256', value: 256 },
  { label: '512', value: 512 },
  { label: '1024', value: 1024 },
  { label: '2048', value: 2048 }
]

type StreamOptions = {
  bitrateItems: SelectItem[]
  Device_typeItems: SelectItem[]
  frames_per_bufferItems: SelectItem<number>[]
}

export const typeStreamOptions: Record<string, StreamOptions> = {
  spotify: {
    bitrateItems: [
      { label: '96', value: '96' },
      { label: '160', value: '160' },
      { label: '320', value: '320' }
    ],
    Device_typeItems: deviceTypeItems,
    frames_per_bufferItems: framesPerBufferItems
  },
  deezer: {
    bitrateItems: [
      { label: '96', value: '96' },
      { label: '128', value: '128' },
      { label: '160', value: '160' },
      { label: '320', value: '320' }
    ],
    Device_typeItems: deviceTypeItems,
    frames_per_bufferItems: framesPerBufferItems
  }
}
