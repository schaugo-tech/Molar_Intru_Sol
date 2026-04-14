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
  const heightPct = Math.round(inputs.alveolar_height * 100)
  const hasTarget = inputs.target_intrusion_mm !== undefined
  const hasRisk = inputs.risk_limit_kpa !== undefined

  return (
    <div className="control-stack">
      <PanelCard title="逆向推荐输入">
        <label className="field">
          <span>牙槽骨高度（必选）：{heightPct}%</span>
          <input
            type="range"
            min={50}
            max={100}
            step={5}
            value={heightPct}
            onChange={(e) => onInputsChange({ ...inputs, alveolar_height: Number(e.target.value) / 100 })}
          />
        </label>

        <label className="field field-inline">
          <span><input type="checkbox" checked={hasTarget} onChange={(e) => onInputsChange({ ...inputs, target_intrusion_mm: e.target.checked ? (inputs.target_intrusion_mm ?? 0.12) : undefined })} /> 目标压低量</span>
          <span>{hasTarget ? `${inputs.target_intrusion_mm?.toFixed(2)} mm` : '未启用'}</span>
        </label>
        <label className="field">
          <input
            type="range"
            min={0.02}
            max={0.25}
            step={0.01}
            value={inputs.target_intrusion_mm ?? 0.12}
            disabled={!hasTarget}
            onChange={(e) => onInputsChange({ ...inputs, target_intrusion_mm: Number(e.target.value) })}
          />
        </label>

        <label className="field field-inline">
          <span><input type="checkbox" checked={hasRisk} onChange={(e) => onInputsChange({ ...inputs, risk_limit_kpa: e.target.checked ? (inputs.risk_limit_kpa ?? 20) : undefined })} /> 风险上限</span>
          <span>{hasRisk ? `${inputs.risk_limit_kpa?.toFixed(0)} kPa` : '未启用'}</span>
        </label>
        <label className="field">
          <input
            type="range"
            min={5}
            max={30}
            step={5}
            value={inputs.risk_limit_kpa ?? 20}
            disabled={!hasRisk}
            onChange={(e) => onInputsChange({ ...inputs, risk_limit_kpa: Number(e.target.value) })}
          />
        </label>
      </PanelCard>

      <PanelCard title="综合评分权重">
        <label className="field"><span>目标达成权重</span><input type="number" step={0.01} value={inputs.score_weights?.target ?? 0.5} onChange={(e) => onInputsChange({ ...inputs, score_weights: { ...(inputs.score_weights ?? {}), target: Number(e.target.value) } })} /></label>
        <label className="field"><span>风险控制权重</span><input type="number" step={0.01} value={inputs.score_weights?.risk ?? 0.35} onChange={(e) => onInputsChange({ ...inputs, score_weights: { ...(inputs.score_weights ?? {}), risk: Number(e.target.value) } })} /></label>
        <label className="field"><span>副作用权重（近远中位移）</span><input type="number" step={0.01} value={inputs.score_weights?.side ?? 0.15} onChange={(e) => onInputsChange({ ...inputs, score_weights: { ...(inputs.score_weights ?? {}), side: Number(e.target.value) } })} /></label>
      </PanelCard>

      <div className="button-row">
        <button className="btn btn-primary" onClick={onAnalyze} disabled={loading}>{loading ? '计算中…' : '更新推荐'}</button>
        <button className="btn" onClick={onReset}>重置</button>
      </div>
    </div>
  )
}
