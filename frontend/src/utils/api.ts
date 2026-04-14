import axios from 'axios'
import type { RecommendV1Request, RecommendV1Response } from '../types'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api'

const api = axios.create({
  baseURL,
  timeout: 20000,
})

export async function fetchRecommendMeta() {
  const { data } = await api.get('/v1/recommend/meta')
  return data
}

export async function previewRecommend(payload: RecommendV1Request) {
  const { data } = await api.post<RecommendV1Response>('/v1/recommend/preview', payload)
  return data
}

export async function exportRecommendReport(payload: RecommendV1Request) {
  const { data } = await api.post('/v1/recommend/report', payload, { responseType: 'blob' })
  return data as Blob
}
