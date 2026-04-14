import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
// import type { GridRecord } from '../types'

type GridRecord = {
  mp: number
  vo: number
  [key: string]: string | number | null | undefined
}

type Props = {
  grid: GridRecord[]
  field: 'overall_score' | 'tmj' | 'pdl_lower'
  title: string
}

function Surface({ grid, field }: { grid: GridRecord[], field: Props['field'] }) {
  const { geometry, color } = useMemo(() => {
    const mps = [...new Set(grid.map((g) => g.mp))].sort((a, b) => a - b)
    const vos = [...new Set(grid.map((g) => g.vo))].sort((a, b) => a - b)
    const map = new Map(grid.map((g) => [`${g.mp}_${g.vo}`, g[field] as number]))

    const values = grid.map((g) => g[field] as number)
    const min = Math.min(...values)
    const max = Math.max(...values)

    const positions: number[] = []
    for (let j = 0; j < vos.length; j++) {
      for (let i = 0; i < mps.length; i++) {
        const x = (mps[i] - 60) * 0.25
        const yRaw = map.get(`${mps[i]}_${vos[j]}`) ?? min
        const yNorm = (yRaw - min) / Math.max(max - min, 1e-9)
        const z = (vos[j] - 5) * 1.2
        positions.push(x, yNorm * 2.2 - 1.2, z)
      }
    }

    const indices: number[] = []
    for (let j = 0; j < vos.length - 1; j++) {
      for (let i = 0; i < mps.length - 1; i++) {
        const a = j * mps.length + i
        const b = a + 1
        const c = a + mps.length
        const d = c + 1
        indices.push(a, c, b, b, c, d)
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()

    const color = field === 'overall_score' ? '#45c4a5' : field === 'tmj' ? '#f18c7f' : '#7aa0ff'
    return { geometry, color }
  }, [field, grid])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} metalness={0.1} roughness={0.45} side={THREE.DoubleSide} transparent opacity={0.88} />
    </mesh>
  )
}

export default function Surface3DChart({ grid, field, title }: Props) {
  return (
    <div className="surface3d-wrap">
      <div className="surface3d-title">{title}</div>
      <Canvas camera={{ position: [3.2, 2.6, 6], fov: 45 }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[4, 5, 3]} intensity={1} />
        <axesHelper args={[2]} />
        <gridHelper args={[8, 16, '#2e4f7f', '#1f324f']} />
        <Surface grid={grid} field={field} />
        <OrbitControls enablePan enableRotate enableZoom />
      </Canvas>
    </div>
  )
}
