// types/spotify.ts
export type Image = { url: string; width: number | null; height: number | null }

export type Playlist = {
  id: string
  name: string
  description?: string | null
  images?: Image[]
  owner?: { id: string; display_name?: string }
  public?: boolean
  snapshot_id?: string
  tracks?: { href: string; total: number }
  uri: string
  href: string
  type: 'playlist'
}

export type Paging<T> = {
  href: string
  items: T[]
  limit: number
  next: string | null
  offset: number
  previous: string | null
  total: number
}
