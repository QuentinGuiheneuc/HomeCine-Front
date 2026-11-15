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

/* Transports de sortie d'un lecteur. Des fabriques et non des constantes : les
   formulaires modifient ces objets en place, chaque config doit avoir les siens. */
export const STREAM_TYPE_ITEMS: SelectItem[] = [
  { label: 'LocalStream', value: 'localStream' },
  { label: 'StreamOutFifo', value: 'StreamOutFifo' },
  { label: 'Vban', value: 'vban' }
]
export const defaultLocalStream = () => ({ 'output_device_index': 0, 'path-audio': '' })
export const defaultStreamOutFifo = () => ({ 'fifo_id': null, 'path-audio': '', 'channels': 8, 'rate': 48000, 'config': '7.1' })
export const defaultVban = () => ({ dest_ip: '', dest_port: 6980, stream_name: '' })
