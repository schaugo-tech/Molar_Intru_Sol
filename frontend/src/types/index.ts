export type InverseRecoInputs = {
  alveolar_height: number
  target_intrusion_mm?: number
  risk_limit_kpa?: number
  score_weights?: { target?: number; risk?: number; side?: number }
}

export type RecommendV1Request = {
  inputs: InverseRecoInputs
  search_points?: number
  surface_grid_size?: number
}

export type RecommendPoint = {
  material: 'TPU' | 'Multi' | 'PETG' | string
  planned_intrusion_mm: number
  Disp_Z_17: number
  Disp_X_17: number
  Disp_Y_17: number
  ['PDL_max (kPa)']: number
  ComprehensiveScore: number
  within_risk_limit: boolean
  surface_position?: {
    height_value: number
    step_value: number
    rank_percentile: number
    rank_label: string
    note: string
  }
}

export type SurfacePayload = {
  [material: string]: {
    x_heights: number[]
    y_planned_intrusion: number[]
    z_values: number[][]
  }
}

export type RecommendV1Response = {
  status: string
  best: RecommendPoint
  alternatives: RecommendPoint[]
  charts: {
    surfaces: {
      score: SurfacePayload
      pdl_max: SurfacePayload
      disp_z17: SurfacePayload
      disp_x17: SurfacePayload
    }
    recommend_points: Record<string, Array<{ name: string; material: string; value: [number, number, number] }>>
    curves_2d: Array<{
      material: string
      step_vs_score: [number, number][]
      step_vs_pdl: [number, number][]
      step_vs_z17: [number, number][]
      step_vs_x17: [number, number][]
    }>
    motion_payload: {
      material: string
      alveolar_height: number
      planned_intrusion_mm: number
      note: string
      teeth: Array<{ tooth_id: number; disp_x_mm: number; disp_y_mm: number; disp_z_mm: number }>
    }
  }
  scoring_formula: Record<string, any>
  meta: any
}
