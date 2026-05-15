import http from '../lib/https'

type GetUserProfile = {
  name?: string
  email?: string
  settings?: {
    ui?: {
      primary?: string
      neutral?: string
    }
  }
  appearance?: string
}

export async function GetUserProfile() {
  const res = await http.get('/user')
  return res.data
}
export async function GetUserAll() {
  const res = await http.get('/user/all')
  return res.data
}
