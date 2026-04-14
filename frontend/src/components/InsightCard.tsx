import type { RecommendV1Response } from '../types'
import PanelCard from './PanelCard'

type Props = { data?: RecommendV1Response }

export default function InsightCard({ data }: Props) {
  if (!data) return <PanelCard title="推荐摘要"><div className="compact-note">等待计算。</div></PanelCard>

  const { best, alternatives } = data

  return (
    <div className="control-stack">
      <PanelCard title="推荐结果">
        <div className="metric-grid">
          <div className="metric-box"><span>推荐 MP</span><strong>{best.mp.toFixed(1)}%</strong></div>
          <div className="metric-box"><span>推荐 VO</span><strong>{best.vo.toFixed(2)} mm</strong></div>
          <div className="metric-box"><span>综合得分</span><strong>{best.utility.toFixed(3)}</strong></div>
        </div>
      </PanelCard>

      <PanelCard title="备选点">
        <div className="candidate-list">
          {alternatives.map((c, idx) => (
            <div key={`${c.mp}-${c.vo}-${idx}`} className="candidate-item">
              <div><strong>备选 {idx + 1}</strong></div>
              <div>MP {c.mp.toFixed(1)}% / VO {c.vo.toFixed(2)} mm</div>
              <div>score {c.utility.toFixed(3)}</div>
            </div>
          ))}
        </div>
      </PanelCard>
    </div>
  )
}
