import type { InverseRecoInputs } from '../types'
import PanelCard from './PanelCard'

type Props = {
  inputs: InverseRecoInputs
  loading: boolean
  onInputsChange: (v: InverseRecoInputs) => void
  onAnalyze: () => void
  onReset: () => void
}

export default function ControlPanel({ inputs, loading, onInputsChange, onAnalyze, onReset }: Props) {
  return (
    <div className="control-stack">
      <PanelCard title="逆向推荐输入">
        <label className="field">
          <span>牙槽骨高度（范围内插值）</span>
          <input type="number" step={0.01} value={inputs.alveolar_height} onChange={(e) => onInputsChange({ ...inputs, alveolar_height: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>目标真实压低量（17牙, mm，可空）</span>
          <input type="number" step={0.01} value={inputs.target_intrusion_mm ?? ''} onChange={(e) => onInputsChange({ ...inputs, target_intrusion_mm: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>允许风险上限（PDL_max, kPa，可空）</span>
          <input type="number" step={0.1} value={inputs.risk_limit_kpa ?? ''} onChange={(e) => onInputsChange({ ...inputs, risk_limit_kpa: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </label>
      </PanelCard>

      <PanelCard title="综合评分权重">
        <label className="field"><span>目标达成权重</span><input type="number" step={0.01} value={inputs.score_weights?.target ?? 0.5} onChange={(e) => onInputsChange({ ...inputs, score_weights: { ...(inputs.score_weights ?? {}), target: Number(e.target.value) } })} /></label>
        <label className="field"><span>风险控制权重</span><input type="number" step={0.01} value={inputs.score_weights?.risk ?? 0.35} onChange={(e) => onInputsChange({ ...inputs, score_weights: { ...(inputs.score_weights ?? {}), risk: Number(e.target.value) } })} /></label>
        <label className="field"><span>副作用权重</span><input type="number" step={0.01} value={inputs.score_weights?.side ?? 0.15} onChange={(e) => onInputsChange({ ...inputs, score_weights: { ...(inputs.score_weights ?? {}), side: Number(e.target.value) } })} /></label>
      </PanelCard>

      <div className="button-row">
        <button className="btn btn-primary" onClick={onAnalyze} disabled={loading}>{loading ? '计算中…' : '更新推荐'}</button>
        <button className="btn" onClick={onReset}>重置</button>
      </div>
    </div>
  )
}
