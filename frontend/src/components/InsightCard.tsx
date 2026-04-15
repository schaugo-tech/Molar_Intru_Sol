import type { RecommendV1Response } from '../types'
import PanelCard from './PanelCard'

type Props = { data?: RecommendV1Response }

export default function InsightCard({ data }: Props) {
  if (!data) return <PanelCard title="推荐摘要"><div className="compact-note">等待计算。</div></PanelCard>
  const { best, alternatives } = data
  return (
    <div className="control-stack">
      <PanelCard title="推荐结论卡片">
        <div className="metric-grid">
          <div className="metric-box"><span>推荐材料</span><strong>{best.material}</strong></div>
          <div className="metric-box"><span>推荐步距</span><strong>{best.planned_intrusion_mm.toFixed(2)} mm</strong></div>
          <div className="metric-box"><span>17牙压低量</span><strong>{best.Disp_Z_17.toFixed(3)} mm</strong></div>
          <div className="metric-box"><span>17牙近远中位移</span><strong>{best.Disp_X_17.toFixed(3)} mm</strong></div>
          <div className="metric-box"><span>PDL应力极值</span><strong>{best['PDL_max (kPa)'].toFixed(2)} kPa</strong></div>
          <div className="metric-box"><span>综合评分</span><strong>{best.ComprehensiveScore.toFixed(2)}</strong></div>
        </div>
      </PanelCard>

      <PanelCard title="备选组合">
        <div className="candidate-list">
          {alternatives.map((c, idx) => (
            <div key={`${c.material}-${c.planned_intrusion_mm}-${idx}`} className="candidate-item">
              <div><strong>备选 {idx + 1}</strong> · {c.material}</div>
              <div>步距 {c.planned_intrusion_mm.toFixed(2)} mm</div>
              <div>评分 {c.ComprehensiveScore.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </PanelCard>
    </div>
  )
}
