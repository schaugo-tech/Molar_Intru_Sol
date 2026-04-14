import ReactECharts from 'echarts-for-react'
import type { RecommendV1Response, SurfacePayload } from '../types'
import PanelCard from './PanelCard'

type Props = {
  data?: RecommendV1Response
}

const MAT_COLORS: Record<string, string> = {
  TPU: '#49a8ff',
  Multi: '#79e199',
  PETG: '#ff8383',
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

function buildSurfaceOption(title: string, zName: string, surfaces: SurfacePayload, points: Array<{ name: string; material: string; value: [number, number, number] }>) {
  const series: any[] = []
  ;['TPU', 'Multi', 'PETG'].forEach((m) => {
    const data = flattenSurface(surfaces, m)
    series.push({
      type: 'surface',
      name: `${m} 曲面`,
      data,
      wireframe: { show: false },
      itemStyle: { opacity: 0.5, color: MAT_COLORS[m] },
      shading: 'lambert',
    })
  })

  ;['TPU', 'Multi', 'PETG'].forEach((m) => {
    const sub = points.filter((p) => p.material === m)
    if (!sub.length) return
    series.push({
      type: 'scatter3D',
      name: `${m} 标注`,
      data: sub.map((p) => ({ name: `${p.name}(${m})`, value: p.value })),
      symbolSize: 12,
      itemStyle: { color: '#ffffff', borderColor: MAT_COLORS[m], borderWidth: 2 },
      label: { show: true, formatter: '{b}' },
    })
  })

  return {
    title: { text: title, left: 10, top: 8, textStyle: { color: '#dfe6ff', fontSize: 14 } },
    tooltip: { formatter: (p: any) => `${p.seriesName}<br/>step=${p.value?.[0]?.toFixed?.(4)} mm<br/>height=${p.value?.[1]?.toFixed?.(3)}<br/>${zName}=${p.value?.[2]?.toFixed?.(4)}` },
    legend: { bottom: 8, textStyle: { color: '#dfe6ff' } },
    xAxis3D: { type: 'value', name: '设计步距(mm)' },
    yAxis3D: { type: 'value', name: '牙槽骨高度' },
    zAxis3D: { type: 'value', name: zName },
    grid3D: {
      boxWidth: 110,
      boxDepth: 92,
      boxHeight: 75,
      environment: '#111b2d',
      viewControl: { projection: 'orthographic', alpha: 18, beta: 220, rotateSensitivity: 1, zoomSensitivity: 1, panSensitivity: 1 },
      light: { main: { intensity: 1 }, ambient: { intensity: 0.55 } },
    },
    series,
    backgroundColor: 'transparent',
  }
}

function buildLineOption(title: string, yName: string, data: RecommendV1Response['charts']['curves_2d'], keyName: 'step_vs_score' | 'step_vs_pdl' | 'step_vs_z17' | 'step_vs_x17') {
  return {
    title: { text: title, left: 10, top: 8, textStyle: { color: '#dfe6ff', fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    legend: { bottom: 4, textStyle: { color: '#dfe6ff' } },
    xAxis: { type: 'value', name: '设计步距(mm)', axisLabel: { color: '#dbe7ff' } },
    yAxis: { type: 'value', name: yName, axisLabel: { color: '#dbe7ff' } },
    series: data.map((row) => ({
      name: row.material,
      type: 'line',
      smooth: true,
      showSymbol: false,
      data: row[keyName],
      lineStyle: { width: 2, color: MAT_COLORS[row.material] },
    })),
    backgroundColor: 'transparent',
  }
}

export default function ChartsPanel({ data }: Props) {
  if (!data) return <PanelCard title="图表区"><div className="compact-note">请先点击“更新推荐”。</div></PanelCard>

  const score3d = buildSurfaceOption('综合评分 3D 拟合曲面（3材料同图）', 'Score', data.charts.surfaces.score, data.charts.recommend_points.score)
  const pdl3d = buildSurfaceOption('PDL应力极值 3D 拟合曲面', 'PDL_max(kPa)', data.charts.surfaces.pdl_max, data.charts.recommend_points.pdl_max)
  const z173d = buildSurfaceOption('17牙压低量 3D 拟合曲面', 'Disp_Z_17(mm)', data.charts.surfaces.disp_z17, data.charts.recommend_points.disp_z17)
  const x173d = buildSurfaceOption('17牙近远中位移 3D 拟合曲面', 'Disp_X_17(mm)', data.charts.surfaces.disp_x17, data.charts.recommend_points.disp_x17)

  const score2d = buildLineOption('2D: 步距-综合评分（多材料叠加）', 'Score', data.charts.curves_2d, 'step_vs_score')
  const pdl2d = buildLineOption('2D: 步距-PDL应力', 'PDL_max(kPa)', data.charts.curves_2d, 'step_vs_pdl')

  return (
    <div className="chart-grid">
      <PanelCard title="综合评分 3D"><ReactECharts option={score3d} style={{ height: 390 }} /></PanelCard>
      <PanelCard title="PDL 3D"><ReactECharts option={pdl3d} style={{ height: 390 }} /></PanelCard>
      <PanelCard title="17牙压低量 3D"><ReactECharts option={z173d} style={{ height: 390 }} /></PanelCard>
      <PanelCard title="17牙近远中位移 3D"><ReactECharts option={x173d} style={{ height: 390 }} /></PanelCard>
      <PanelCard title="综合评分 2D"><ReactECharts option={score2d} style={{ height: 290 }} /></PanelCard>
      <PanelCard title="PDL 2D"><ReactECharts option={pdl2d} style={{ height: 290 }} /></PanelCard>
    </div>
  )
}
