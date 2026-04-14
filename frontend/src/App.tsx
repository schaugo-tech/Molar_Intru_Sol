import { useEffect, useMemo, useState } from 'react'
import AnatomyScene from './components/AnatomyScene'
import ChartsPanel from './components/ChartsPanel'
import ControlPanel from './components/ControlPanel'
import InsightCard from './components/InsightCard'
import { fetchRecommendMeta, previewRecommend } from './utils/api'
import type { FrontendInputs, RecommendV1Response } from './types'

const defaultInputs: FrontendInputs = {
  treatment_need: { ahi_band: '15to30' },
  tmj_sensitivity: { pain_vas: 3, joint_state: 'none', mouth_opening_state: 'normal' },
  periodontal: { mobility_state: 'stable', bone_loss_state: 'none' },
  occlusal_need: { deep_overbite: true, occlusal_interference: true, anterior_crossbite: false },
}

export default function App() {
  const [meta, setMeta] = useState<any>(null)
  const [inputs, setInputs] = useState<FrontendInputs>(defaultInputs)
  const [result, setResult] = useState<RecommendV1Response | undefined>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sceneMp, setSceneMp] = useState(60)
  const [sceneVo, setSceneVo] = useState(5)

  const mpGrid = useMemo(() => Array.from({ length: 5 }, (_, i) => 50 + i * 5), [])
  const voGrid = useMemo(() => Array.from({ length: 9 }, (_, i) => Number((3 + i * 0.5).toFixed(2))), [])

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await previewRecommend({ inputs, mp_grid: mpGrid, vo_grid: voGrid })
      setResult(data)
      setSceneMp(data.best.mp)
      setSceneVo(data.best.vo)
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
    const chartImgs = chartCanvases.map((c) => c.toDataURL('image/png'))

    const conclusion = `推荐值为 MP ${result.best.mp.toFixed(1)}% / VO ${result.best.vo.toFixed(2)} mm；综合得分 ${result.best.utility.toFixed(2)}/100。在当前输入下，TMJ=${result.best.raw_tmj?.toFixed?.(4) ?? '-'} MPa，PDL下前牙=${result.best.raw_low?.toFixed?.(4) ?? '-'} kPa，PDL上前牙=${result.best.raw_up?.toFixed?.(4) ?? '-'} kPa。`
    const altRows = result.alternatives.map((a, i) => `<tr><td>${i + 1}</td><td>${a.mp.toFixed(1)}%</td><td>${a.vo.toFixed(2)} mm</td><td>${a.utility.toFixed(2)}</td><td>${a.raw_tmj?.toFixed?.(4) ?? '-'}</td><td>${a.raw_low?.toFixed?.(4) ?? '-'}</td><td>${a.raw_up?.toFixed?.(4) ?? '-'}</td></tr>`).join('')

    const html = `
<!doctype html><html><head><meta charset="utf-8"/><title>MAD推荐报告</title>
<style>
body{font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;margin:20px;color:#1c2638}
h1{color:#214f9b} h2{color:#2b3f66;margin-top:20px}
table{width:100%;border-collapse:collapse;margin-top:8px} th,td{border:1px solid #c9d6ef;padding:8px;font-size:12px;word-break:break-word}
th{background:#ecf3ff}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.img{width:100%;border:1px solid #d9e2f5;border-radius:6px}
.box{background:#f8fbff;border:1px solid #d8e3f7;padding:12px;border-radius:8px;line-height:1.7}
</style></head><body>
<h1>MAD 推荐报告</h1>
<div class="box">
<b>输入条件</b><br/>AHI分档：${inputs.treatment_need.ahi_band}<br/>
TMJ：VAS=${inputs.tmj_sensitivity.pain_vas}，state=${inputs.tmj_sensitivity.joint_state}，opening=${inputs.tmj_sensitivity.mouth_opening_state}<br/>
牙周：mobility=${inputs.periodontal.mobility_state}，bone_loss=${inputs.periodontal.bone_loss_state}<br/>
咬合：overbite=${inputs.occlusal_need.deep_overbite}，interference=${inputs.occlusal_need.occlusal_interference}，crossbite=${inputs.occlusal_need.anterior_crossbite}
</div>
<h2>推荐结论</h2><div class="box">${conclusion}</div>
<h2>备选点</h2><table><thead><tr><th>#</th><th>MP</th><th>VO</th><th>得分</th><th>TMJ(MPa)</th><th>PDL下(kPa)</th><th>PDL上(kPa)</th></tr></thead><tbody>${altRows}</tbody></table>
<h2>图像证据</h2><div class="grid">
${chartImgs[0] ? `<div><div>综合得分3D</div><img class="img" src="${chartImgs[0]}"/></div>` : ''}
${chartImgs[1] ? `<div><div>TMJ风险3D</div><img class="img" src="${chartImgs[1]}"/></div>` : ''}
${chartImgs[2] ? `<div><div>前牙PDL风险3D</div><img class="img" src="${chartImgs[2]}"/></div>` : ''}
${chartImgs[3] ? `<div><div>雷达图</div><img class="img" src="${chartImgs[3]}"/></div>` : ''}
</div>
</body></html>`
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  useEffect(() => {
    fetchRecommendMeta().then(setMeta).catch((e) => setError(`meta 读取失败：${e.message}`))
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">MAD AI-Embedded Design Platform</div>
          <h1>MAD下颌前移矫治器智能设计与生物力学评估系统</h1>
          <p>让人工智能计算连接三维打印实体产品创新</p>
        </div>
        <div className="header-note">
          <div>引擎版本：{meta?.engine_version ?? '读取中...'}</div>
          {error ? <div className="header-error">{error}</div> : null}
        </div>
      </header>

      <main className="app-grid">
        <aside className="left-col">
          <ControlPanel inputs={inputs} loading={loading} onInputsChange={setInputs} onAnalyze={run} onReset={() => setInputs(defaultInputs)} />
        </aside>
        <section className="center-col">
          <div className="scene-panel">
            <AnatomyScene selectedMp={sceneMp} selectedVo={sceneVo} />
            <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="compact-note">3D 位姿交互：更新推荐后自动同步位姿；也可手动拖动 MP/VO 预览。</div>
              <label className="field">
                <span>MP：{sceneMp.toFixed(1)}%</span>
                <input type="range" min={50} max={70} step={0.5} value={sceneMp} onChange={(e) => setSceneMp(Number(e.target.value))} />
              </label>
              <label className="field">
                <span>VO：{sceneVo.toFixed(2)} mm</span>
                <input type="range" min={3} max={7} step={0.25} value={sceneVo} onChange={(e) => setSceneVo(Number(e.target.value))} />
              </label>
            </div>
          </div>
          <ChartsPanel data={result} selectedMp={sceneMp} selectedVo={sceneVo} />
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
