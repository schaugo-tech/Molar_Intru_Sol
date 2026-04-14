import { useEffect, useState } from 'react'
import AnatomyScene from './components/AnatomyScene'
import ChartsPanel from './components/ChartsPanel'
import ControlPanel from './components/ControlPanel'
import InsightCard from './components/InsightCard'
import { fetchRecommendMeta, previewRecommend } from './utils/api'
import type { InverseRecoInputs, RecommendV1Response } from './types'

const defaultInputs: InverseRecoInputs = {
  alveolar_height: 0.65,
  target_intrusion_mm: undefined,
  risk_limit_kpa: undefined,
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
    if (!result) return
    const chartCanvases = Array.from(document.querySelectorAll('.chart-grid canvas')) as HTMLCanvasElement[]
    const imgs = chartCanvases.map((c) => c.toDataURL('image/png'))

    const html = `<!doctype html><html><head><meta charset='utf-8'/><title>后牙压低推荐报告</title>
    <style>
      body{font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;margin:22px;color:#1d2940}
      h1{color:#1f4c96} h2{color:#2a3d61;margin-top:20px}
      .box{border:1px solid #d8e3f7;background:#f8fbff;padding:12px;border-radius:10px;line-height:1.7}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .img{width:100%;border:1px solid #d2deef;border-radius:8px}
      table{width:100%;border-collapse:collapse} th,td{border:1px solid #d2deef;padding:8px;font-size:12px}
      th{background:#ebf2ff}
    </style></head><body>
    <h1>后牙压低逆向推荐报告</h1>
    <div class='box'>
      <b>输入</b><br/>
      牙槽骨高度：${(inputs.alveolar_height * 100).toFixed(0)}%<br/>
      目标压低量：${inputs.target_intrusion_mm?.toFixed(2) ?? '默认 0.10'} mm<br/>
      风险上限：${inputs.risk_limit_kpa?.toFixed(0) ?? '默认 20'} kPa<br/>
      权重：target=${(inputs.score_weights?.target ?? 0.5).toFixed(2)}, risk=${(inputs.score_weights?.risk ?? 0.35).toFixed(2)}, side=${(inputs.score_weights?.side ?? 0.15).toFixed(2)}
    </div>
    <h2>推荐结论</h2>
    <div class='box'>
      推荐材料：${result.best.material}<br/>
      推荐步距：${result.best.planned_intrusion_mm.toFixed(3)} mm<br/>
      17牙压低量：${result.best.Disp_Z_17.toFixed(4)} mm<br/>
      17牙近远中位移：${result.best.Disp_X_17.toFixed(4)} mm<br/>
      PDL应力极值：${result.best['PDL_max (kPa)'].toFixed(3)} kPa<br/>
      综合评分：${result.best.ComprehensiveScore.toFixed(2)}
    </div>
    <h2>备选组合</h2>
    <table><thead><tr><th>#</th><th>材料</th><th>步距</th><th>评分</th></tr></thead><tbody>
      ${result.alternatives.map((x, i) => `<tr><td>${i + 1}</td><td>${x.material}</td><td>${x.planned_intrusion_mm.toFixed(3)} mm</td><td>${x.ComprehensiveScore.toFixed(2)}</td></tr>`).join('')}
    </tbody></table>
    <h2>图表证据（3D/2D）</h2>
    <div class='grid'>${imgs.map((src, i) => `<div><img class='img' src='${src}'/><div style='font-size:12px;color:#5f6f8e;margin-top:4px'>图 ${i + 1}</div></div>`).join('')}</div>
    </body></html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 250)
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
            <AnatomyScene selectedStep={result?.best.planned_intrusion_mm ?? 0.1} selectedHeight={inputs.alveolar_height} motion17={motion17} material={result?.best.material} />
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
