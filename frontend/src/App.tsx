import { useEffect, useState } from 'react'
import AnatomyScene from './components/AnatomyScene'
import ChartsPanel from './components/ChartsPanel'
import ControlPanel from './components/ControlPanel'
import InsightCard from './components/InsightCard'
import { exportRecommendReport, fetchRecommendMeta, previewRecommend } from './utils/api'
import type { InverseRecoInputs, RecommendV1Response } from './types'

const defaultInputs: InverseRecoInputs = {
  alveolar_height: 0.66,
  target_intrusion_mm: 0.12,
  risk_limit_kpa: 18,
  score_weights: { target: 0.5, risk: 0.35, side: 0.15 },
}

export default function App() {
  const [meta, setMeta] = useState<any>(null)
  const [inputs, setInputs] = useState<InverseRecoInputs>(defaultInputs)
  const [result, setResult] = useState<RecommendV1Response | undefined>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await previewRecommend({ inputs, search_points: 301, surface_grid_size: 42 })
      setResult(data)
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? err?.message
      setError(detail ? `推荐计算失败：${detail}` : '推荐计算失败')
      setResult(undefined)
    } finally {
      setLoading(false)
    }
  }

  const onExportReport = async () => {
    try {
      const blob = await exportRecommendReport({ inputs, search_points: 301, surface_grid_size: 42 })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'posterior_intrusion_recommendation_report.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setError(`导出失败：${err?.message ?? 'unknown error'}`)
    }
  }

  useEffect(() => {
    fetchRecommendMeta().then(setMeta).catch((e) => setError(`meta 读取失败：${e.message}`))
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const motion17 = result?.charts.motion_payload.teeth.find((t) => t.tooth_id === 17)

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">Posterior Intrusion Recommender</div>
          <h1>后牙压低逆向推荐系统</h1>
          <p>输入牙槽骨高度 + 目标压低量/风险上限，输出材料（TPU/Multi/PETG）与设计步距，并给出多曲面证据。</p>
        </div>
        <div className="header-note">
          <div>引擎版本：{meta?.engine_version ?? '读取中...'}</div>
          <div className="header-sub">数据：{meta?.data_file ?? '-'}</div>
          {error ? <div className="header-error">{error}</div> : null}
        </div>
      </header>

      <main className="app-grid">
        <aside className="left-col">
          <ControlPanel inputs={inputs} loading={loading} onInputsChange={setInputs} onAnalyze={run} onReset={() => setInputs(defaultInputs)} />
        </aside>
        <section className="center-col">
          <div className="scene-panel">
            <AnatomyScene
              selectedStep={result?.best.planned_intrusion_mm ?? 0.1}
              selectedHeight={inputs.alveolar_height}
              motion17={motion17}
              material={result?.best.material}
            />
            <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="compact-note">三维运动示意：根据推荐点拟合得到的 17 牙位移向量驱动（非重算FE）。</div>
            </div>
          </div>
          <ChartsPanel data={result} />
        </section>
        <aside className="right-col">
          <InsightCard data={result} />
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={onExportReport}>导出 PDF 报告</button>
          </div>
        </aside>
      </main>
    </div>
  )
}
