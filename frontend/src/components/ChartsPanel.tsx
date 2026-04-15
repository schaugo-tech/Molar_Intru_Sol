import ReactECharts from 'echarts-for-react'
import type { RecommendV1Response, SurfacePayload } from '../types'
import PanelCard from './PanelCard'

type Props = {
  data?: RecommendV1Response
}

const MAT_COLORS: Record<string, string> = {
  TPU: '#2d7bff',
  Multi: '#1fcf82',
  PETG: '#ff7b32',
}

function flattenSurface(payload: SurfacePayload, material: string): [number, number, number][] {
  const one = payload[material]
  if (!one) return []
  const out: [number, number, number][] = []
  one.x_heights.forEach((h, i) => {
    one.y_planned_intrusion.forEach((s, j) => {
      out.push([s, h, one.z_values[i][j]])
    })
  })
  return out
}

function surfaceRange(payload: SurfacePayload) {
  const all = ['TPU', 'Multi', 'PETG'].flatMap((m) => flattenSurface(payload, m))
  const xs = all.map((d) => d[0])
  const ys = all.map((d) => d[1])
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

function buildSurfaceOption(title: string, zName: string, surfaces: SurfacePayload, points: Array<{ name: string; material: string; value: [number, number, number] }>) {
  const series: any[] = []
  ;['TPU', 'Multi', 'PETG'].forEach((m) => {
    const data = flattenSurface(surfaces, m)
    series.push({
      type: 'surface',
      name: `${m} 曲面`,
      data,
      wireframe: { show: true, lineStyle: { color: 'rgba(255,255,255,0.12)' } },
      itemStyle: { opacity: 0.40, color: MAT_COLORS[m] },
      shading: 'lambert',
    })
  })

  ;['TPU', 'Multi', 'PETG'].forEach((m) => {
    const sub = points.filter((p) => p.material === m && p.name === '推荐')
    if (!sub.length) return
    series.push({
      type: 'scatter3D',
      name: `${m} 标注`,
      data: sub.map((p) => ({ name: `${p.name}(${m})`, value: p.value })),
      symbolSize: 11,
      itemStyle: { color: '#ffffff', borderColor: MAT_COLORS[m], borderWidth: 2 },
      label: { show: true, formatter: '{b}', color: '#ffffff', backgroundColor: 'rgba(10,20,40,.55)', padding: [2, 5], borderRadius: 4 },
    })
  })

  const range = surfaceRange(surfaces)

  return {
    title: { text: title, left: 10, top: 8, textStyle: { color: '#e9f1ff', fontSize: 14 } },
    tooltip: { formatter: (p: any) => `${p.seriesName}<br/>step=${p.value?.[0]?.toFixed?.(4)} mm<br/>height=${(p.value?.[1] * 100)?.toFixed?.(0)}%<br/>${zName}=${p.value?.[2]?.toFixed?.(4)}` },
    legend: { show: false },
    xAxis3D: { type: 'value', name: '设计步距(mm)', min: range.minX, max: range.maxX, nameGap: 26, nameTextStyle: { color: '#dce8ff', fontSize: 11 }, axisLabel: { color: '#d6e3fb', margin: 8 }, axisLine: { lineStyle: { color: '#6f84a8' } }, splitLine: { lineStyle: { color: 'rgba(170,190,220,0.08)' } } },
    yAxis3D: { type: 'value', name: '牙槽骨高度', min: range.minY, max: range.maxY, nameGap: 26, nameTextStyle: { color: '#dce8ff', fontSize: 11 }, axisLabel: { color: '#d6e3fb', margin: 8, formatter: (v: number) => `${Math.round(v * 100)}%` }, axisLine: { lineStyle: { color: '#6f84a8' } }, splitLine: { lineStyle: { color: 'rgba(170,190,220,0.08)' } } },
    zAxis3D: { type: 'value', name: '', axisLabel: { color: '#d6e3fb', margin: 8 }, axisLine: { lineStyle: { color: '#6f84a8' } }, splitLine: { lineStyle: { color: 'rgba(170,190,220,0.08)' } } },
    grid3D: {
      boxWidth: 86,
      boxDepth: 72,
      boxHeight: 56,
      environment: '#0f1a2c',
      viewControl: {
        projection: 'orthographic',
        alpha: 20,
        beta: 222,
        distance: 170,
        rotateSensitivity: 0,
        zoomSensitivity: 0,
        panSensitivity: 0,
      },
      light: { main: { intensity: 0.92 }, ambient: { intensity: 0.45 } },
    },
    series,
    backgroundColor: '#0f1a2c',
  }
}


function lineRange(data: RecommendV1Response['charts']['curves_2d'], keyName: 'step_vs_score' | 'step_vs_pdl' | 'step_vs_z17' | 'step_vs_x17') {
  const points = data.flatMap((row) => row[keyName])
  const xs = points.map((p) => p[0])
  return { minX: Math.min(...xs), maxX: Math.max(...xs) }
}

function buildLineOption(title: string, yName: string, data: RecommendV1Response['charts']['curves_2d'], keyName: 'step_vs_score' | 'step_vs_pdl' | 'step_vs_z17' | 'step_vs_x17') {
  const rg = lineRange(data, keyName)
  return {
    title: { text: title, left: 10, top: 8, textStyle: { color: '#dfe6ff', fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    legend: { bottom: 4, textStyle: { color: '#dfe6ff' } },
    xAxis: { type: 'value', name: '设计步距(mm)', nameLocation: 'middle', min: rg.minX, max: rg.maxX, nameGap: 28, axisLabel: { color: '#dbe7ff' }, axisLine: { lineStyle: { color: '#8aa2c9' } }, splitLine: { lineStyle: { color: 'rgba(160,185,225,0.10)' } } },
    yAxis: { type: 'value', name: '', axisLabel: { color: '#dbe7ff' }, axisLine: { lineStyle: { color: '#8aa2c9' } }, splitLine: { lineStyle: { color: 'rgba(160,185,225,0.10)' } } },
    series: data.map((row) => ({
      name: row.material,
      type: 'line',
      smooth: true,
      showSymbol: false,
      data: row[keyName],
      lineStyle: { width: 2, color: MAT_COLORS[row.material] },
    })),
    backgroundColor: '#0f1a2c',
  }
}

export default function ChartsPanel({ data }: Props) {
  if (!data) return <PanelCard title="图表区"><div className="compact-note">请先点击“更新推荐”。</div></PanelCard>

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
  const h3d = isMobile ? 260 : 320
  const h2d = isMobile ? 210 : 240

  const score3d = buildSurfaceOption('综合评分 3D 拟合曲面（3材料同图）', 'Score', data.charts.surfaces.score, data.charts.recommend_points.score)
  const pdl3d = buildSurfaceOption('PDL应力极值 3D 拟合曲面', 'PDL_max(kPa)', data.charts.surfaces.pdl_max, data.charts.recommend_points.pdl_max)
  const z173d = buildSurfaceOption('17牙压低量 3D 拟合曲面', 'Disp_Z_17(mm)', data.charts.surfaces.disp_z17, data.charts.recommend_points.disp_z17)
  const x173d = buildSurfaceOption('17牙近远中位移 3D 拟合曲面', 'Disp_X_17(mm)', data.charts.surfaces.disp_x17, data.charts.recommend_points.disp_x17)

  const score2d = buildLineOption('2D: 步距-综合评分（多材料叠加）', 'Score', data.charts.curves_2d, 'step_vs_score')
  const z172d = buildLineOption('2D: 步距-17牙压低实现量', 'Disp_Z_17(mm)', data.charts.curves_2d, 'step_vs_z17')
  const pdl2d = buildLineOption('2D: 步距-PDL应力', 'PDL_max(kPa)', data.charts.curves_2d, 'step_vs_pdl')

  return (
    <div className="chart-grid">
      <PanelCard title="综合评分 3D"><ReactECharts option={score3d} style={{ height: h3d }} /></PanelCard>
      <PanelCard title="PDL 3D"><ReactECharts option={pdl3d} style={{ height: h3d }} /></PanelCard>
      <PanelCard title="17牙压低量 3D"><ReactECharts option={z173d} style={{ height: h3d }} /></PanelCard>
      <PanelCard title="17牙近远中位移 3D"><ReactECharts option={x173d} style={{ height: h3d }} /></PanelCard>
      <PanelCard title="综合评分 2D"><ReactECharts option={score2d} style={{ height: h2d }} /></PanelCard>
      <PanelCard title="17牙压低实现量 2D"><ReactECharts option={z172d} style={{ height: h2d }} /></PanelCard>
      <PanelCard title="PDL 2D"><ReactECharts option={pdl2d} style={{ height: h2d }} /></PanelCard>
    </div>
  )
}
