import ReactECharts from 'echarts-for-react'
import type { RecommendV1Response } from '../types'
import PanelCard from './PanelCard'

type Props = {
  data?: RecommendV1Response
  selectedMp?: number
  selectedVo?: number
}

type Triple = [number, number, number]

type Domain = { minMp: number; maxMp: number; minVo: number; maxVo: number }

const chartTheme = {
  axisText: '#dbe7ff',
  axisLine: '#93a6cb',
  splitLine: 'rgba(152,175,214,0.26)',
  background: '#111b2d',
}

function estimateZ(surface: Triple[], mp: number, vo: number): number {
  const exact = surface.find((d) => Math.abs(d[0] - mp) < 1e-6 && Math.abs(d[1] - vo) < 1e-6)
  if (exact) return exact[2]

  const nearest = [...surface]
    .sort((a, b) => ((a[0] - mp) ** 2 + (a[1] - vo) ** 2) - ((b[0] - mp) ** 2 + (b[1] - vo) ** 2))
    .slice(0, 6)

  let num = 0
  let den = 0
  nearest.forEach((p) => {
    const dist = Math.sqrt((p[0] - mp) ** 2 + (p[1] - vo) ** 2)
    const w = 1 / Math.max(dist, 1e-6)
    num += w * p[2]
    den += w
  })
  return den > 0 ? num / den : 0
}

function buildDomain(data: RecommendV1Response): Domain {
  const feasible = data.charts.heatmaps.limit_factor.filter((d) => d[2] === 0)
  const source = feasible.length > 0 ? feasible : data.charts.surface3d.utility

  const mpValues = source.map((d) => d[0])
  const voValues = source.map((d) => d[1])
  return {
    minMp: Math.min(...mpValues),
    maxMp: Math.max(...mpValues),
    minVo: Math.min(...voValues),
    maxVo: Math.max(...voValues),
  }
}

function smoothSurface(surface: Triple[], domain: Domain): Triple[] {
  const mpSet = Array.from(new Set(surface.map((d) => d[0]))).sort((a, b) => a - b)
  const voSet = Array.from(new Set(surface.map((d) => d[1]))).sort((a, b) => a - b)
  const valueMap = new Map(surface.map((d) => [`${d[0]}|${d[1]}`, d[2]]))

  const mpStep = mpSet.length > 1 ? Math.max((mpSet[1] - mpSet[0]) / 4, 0.2) : 0.5
  const voStep = voSet.length > 1 ? Math.max((voSet[1] - voSet[0]) / 4, 0.05) : 0.1

  const findBounds = (arr: number[], v: number): [number, number] => {
    if (v <= arr[0]) return [arr[0], arr[0]]
    if (v >= arr[arr.length - 1]) return [arr[arr.length - 1], arr[arr.length - 1]]
    for (let i = 0; i < arr.length - 1; i += 1) {
      if (arr[i] <= v && v <= arr[i + 1]) return [arr[i], arr[i + 1]]
    }
    return [arr[0], arr[0]]
  }

  const getVal = (x: number, y: number): number => {
    const key = `${x}|${y}`
    const v = valueMap.get(key)
    if (v !== undefined) return v
    return estimateZ(surface, x, y)
  }

  const smooth: Triple[] = []
  for (let mp = domain.minMp; mp <= domain.maxMp + 1e-6; mp += mpStep) {
    for (let vo = domain.minVo; vo <= domain.maxVo + 1e-6; vo += voStep) {
      const [x1, x2] = findBounds(mpSet, mp)
      const [y1, y2] = findBounds(voSet, vo)

      const q11 = getVal(x1, y1)
      const q21 = getVal(x2, y1)
      const q12 = getVal(x1, y2)
      const q22 = getVal(x2, y2)

      let z = q11
      if (Math.abs(x2 - x1) < 1e-6 && Math.abs(y2 - y1) < 1e-6) {
        z = q11
      } else if (Math.abs(x2 - x1) < 1e-6) {
        const ty = (vo - y1) / Math.max(y2 - y1, 1e-6)
        z = q11 * (1 - ty) + q12 * ty
      } else if (Math.abs(y2 - y1) < 1e-6) {
        const tx = (mp - x1) / Math.max(x2 - x1, 1e-6)
        z = q11 * (1 - tx) + q21 * tx
      } else {
        const tx = (mp - x1) / (x2 - x1)
        const ty = (vo - y1) / (y2 - y1)
        z = q11 * (1 - tx) * (1 - ty) + q21 * tx * (1 - ty) + q12 * (1 - tx) * ty + q22 * tx * ty
      }

      smooth.push([Number(mp.toFixed(3)), Number(vo.toFixed(3)), z])
    }
  }

  return smooth
}

function buildSurfaceOption(title: string, zName: string, rawData: Triple[], selected: Triple, domain: Domain) {
  const data = smoothSurface(rawData, domain)
  const zValues = data.map((d) => d[2])
  const zMin = Math.min(...zValues)
  const zMax = Math.max(...zValues)
  const lift = Math.max((zMax - zMin) * 0.10, 0.02)
  const selectedFront: Triple = [selected[0], selected[1], selected[2] + lift]

  return {
    title: { show: false },
    tooltip: { show: false },
    visualMap: {
      show: false,
      min: zMin,
      max: zMax,
      calculable: true,
      orient: 'vertical',
      right: 8,
      top: 40,
      textStyle: { color: chartTheme.axisText },
      inRange: {
        color: ['#224f9b', '#2d8cff', '#3bd2ff', '#8bf094', '#f6d24f'],
      },
    },
    xAxis3D: {
      type: 'value',
      name: 'MP(%)',
      min: domain.minMp,
      max: domain.maxMp,
      axisLabel: { show: true, color: chartTheme.axisText },
      nameTextStyle: { color: chartTheme.axisText, fontSize: 12 },
      axisLine: { lineStyle: { color: chartTheme.axisLine } },
      splitLine: { lineStyle: { color: chartTheme.splitLine } },
    },
    yAxis3D: {
      type: 'value',
      name: 'VO(mm)',
      min: domain.minVo,
      max: domain.maxVo,
      axisLabel: { show: true, color: chartTheme.axisText },
      nameTextStyle: { color: chartTheme.axisText, fontSize: 12 },
      axisLine: { lineStyle: { color: chartTheme.axisLine } },
      splitLine: { lineStyle: { color: chartTheme.splitLine } },
    },
    zAxis3D: {
      type: 'value',
      name: zName,
      axisLabel: { show: true, color: chartTheme.axisText },
      nameTextStyle: { color: chartTheme.axisText, fontSize: 12 },
      axisLine: { lineStyle: { color: chartTheme.axisLine } },
      splitLine: { lineStyle: { color: chartTheme.splitLine } },
    },
    grid3D: {
      boxWidth: 120,
      boxDepth: 95,
      boxHeight: 75,
      environment: chartTheme.background,
      axisPointer: { show: true, lineStyle: { color: '#ffffff' } },
      viewControl: {
        projection: 'orthographic',
        alpha: 20,
        beta: 225,
        distance: 180,
        rotateSensitivity: 0,
        zoomSensitivity: 0,
        panSensitivity: 0,
        autoRotate: false,
      },
      light: {
        main: { intensity: 1.05, shadow: false },
        ambient: { intensity: 0.55 },
      },
    },
    series: [
      {
        type: 'surface',
        name: title,
        data,
        wireframe: { show: false },
        shading: 'lambert',
        itemStyle: { opacity: 0.55 },
      },
      {
        type: 'scatter3D',
        name: '当前选择点',
        data: [selectedFront],
        symbol: 'diamond',
        symbolSize: 16,
        itemStyle: { color: '#ff5f6d', borderColor: '#fff', borderWidth: 1.4, opacity: 1 },
        emphasis: { itemStyle: { color: '#ff2f44', borderColor: '#fff', borderWidth: 2 } },
        label: { show: false },
      },
    ],
    backgroundColor: 'transparent',
  }
}

export default function ChartsPanel({ data, selectedMp, selectedVo }: Props) {
  if (!data) return <PanelCard title="图表区"><div className="compact-note">请先点击“更新推荐”。</div></PanelCard>

  const surface3d = data.charts.surface3d
  const domain = buildDomain(data)
  const currentMp = selectedMp ?? data.best.mp
  const currentVo = selectedVo ?? data.best.vo

  const selectedUtility: Triple = [currentMp, currentVo, estimateZ(surface3d.utility, currentMp, currentVo)]
  const selectedTmj: Triple = [currentMp, currentVo, estimateZ(surface3d.tmj, currentMp, currentVo)]
  const selectedPdl: Triple = [currentMp, currentVo, estimateZ(surface3d.pdl, currentMp, currentVo)]

  const utility3d = buildSurfaceOption('综合得分 3D 拟合曲面', '综合得分', surface3d.utility, selectedUtility, domain)
  const tmj3d = buildSurfaceOption('TMJ 风险 3D 拟合曲面', 'TMJ 风险', surface3d.tmj, selectedTmj, domain)
  const pdl3d = buildSurfaceOption('前牙 PDL 风险 3D 拟合曲面', '前牙 PDL 风险', surface3d.pdl, selectedPdl, domain)

  const radarIndicators = Object.keys(data.charts.radar[0]?.values ?? {}).map((k) => ({
    name: k,
    max: k === '综合得分' ? 100 : 1,
  }))
  const radarOption = {
    title: { text: '推荐点 vs 备选点（雷达）', left: 10, top: 6, textStyle: { color: '#dfe6ff', fontSize: 14 } },
    tooltip: {},
    legend: { bottom: 8, left: 'center', textStyle: { color: '#dfe6ff' } },
    radar: { indicator: radarIndicators },
    series: [{ type: 'radar', data: data.charts.radar.map((r) => ({ name: r.name, value: Object.values(r.values) })) }],
    backgroundColor: 'transparent',
  }

  return (
    <div className="chart-grid">
      <PanelCard title="综合得分 3D"><ReactECharts option={utility3d} style={{ height: 380 }} /></PanelCard>
      <PanelCard title="TMJ 风险 3D"><ReactECharts option={tmj3d} style={{ height: 380 }} /></PanelCard>
      <PanelCard title="前牙 PDL 风险 3D"><ReactECharts option={pdl3d} style={{ height: 380 }} /></PanelCard>
      <PanelCard title="雷达图"><ReactECharts option={radarOption} style={{ height: 320 }} /></PanelCard>
    </div>
  )
}
