export type TreatmentNeedInput = {
  ahi_band?: 'lt5' | '5to15' | '15to30' | 'gt30'
}

export type TMJSensitivityInput = {
  pain_vas?: number
  joint_state?: 'none' | 'click' | 'lock'
  mouth_opening_mm?: number
  mouth_opening_state?: 'normal' | 'mildly_limited' | 'limited'
}

export type PeriodontalInput = {
  mobility_state?: 'stable' | 'mild' | 'obvious'
  bone_loss_state?: 'none' | 'low' | 'medium' | 'high'
}

export type OcclusalNeedInput = {
  deep_overbite: boolean
  occlusal_interference: boolean
  anterior_crossbite: boolean
}

export type FrontendInputs = {
  treatment_need: TreatmentNeedInput
  tmj_sensitivity: TMJSensitivityInput
  periodontal: PeriodontalInput
  occlusal_need: OcclusalNeedInput
}

export type RecommendV1Request = {
  inputs: FrontendInputs
  mp_grid?: number[]
  vo_grid?: number[]
}

export type RecommendPoint = {
  mp: number
  vo: number
  utility: number
  raw_utility?: number
  benefit_mp: number
  benefit_vo: number
  raw_tmj?: number
  raw_low?: number
  raw_up?: number
  r_tmj: number
  r_pdl: number
  feasible: boolean
  limit_factor: 'feasible' | 'tmj' | 'pdl'
}

export type RecommendV1Response = {
  status: string
  scalars: { d: number; j: number; p: number; o: number; mp_target_pct: number; vo_target_mm: number; vo_need_label: string }
  best: RecommendPoint
  alternatives: RecommendPoint[]
  charts: {
    best: RecommendPoint
    alternatives: RecommendPoint[]
    heatmaps: {
      utility: [number, number, number][]
      limit_factor: [number, number, number][]
    }
    radar: Array<{
      name: string
      mp: number
      vo: number
      values: Record<string, number>
    }>
    curves: {
      fix_vo_vary_mp: RecommendPoint[]
      fix_mp_vary_vo: RecommendPoint[]
    }
    surface3d: {
      utility: [number, number, number][]
      tmj: [number, number, number][]
      pdl: [number, number, number][]
      recommend_points: {
        utility: Array<{ name: string; value: [number, number, number] }>
        tmj: Array<{ name: string; value: [number, number, number] }>
        pdl: Array<{ name: string; value: [number, number, number] }>
      }
    }
  }
  option_templates?: {
    utility_surface3d_option: any
    tmj_surface3d_option: any
    pdl_surface3d_option: any
  }
  meta: any
}
