import { Canvas, useThree } from '@react-three/fiber'
import { ArcballControls, Bounds, GizmoHelper, GizmoViewcube, Grid, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import * as THREE from 'three'

type Props = {
  selectedMp: number
  selectedVo: number
}

type ManifestItem = {
  name: string
  file: string
  color: string
  style: 'Standard' | 'Wireframe' | 'Physical' | string
  opacity: number
}

const modelUrl = (file: string) => `${import.meta.env.BASE_URL}models/${file}`

function buildMaterial(item: ManifestItem) {
  const common = {
    color: new THREE.Color(item.color),
    transparent: item.opacity < 1,
    opacity: item.opacity,
    side: THREE.DoubleSide,
  }
  if (item.style === 'Wireframe') return new THREE.MeshBasicMaterial({ ...common, wireframe: true })
  if (item.style === 'Physical') return new THREE.MeshPhysicalMaterial({ ...common, roughness: 0.42, metalness: 0.02, clearcoat: 0.08, emissive: new THREE.Color(item.color).multiplyScalar(0.14) })
  return new THREE.MeshStandardMaterial({ ...common, roughness: 0.42, metalness: 0.02, emissive: new THREE.Color(item.color).multiplyScalar(0.16) })
}

function ModelPart({ item, offset = [0, 0, 0], withLocalAxes = false }: { item: ManifestItem, offset?: [number, number, number], withLocalAxes?: boolean }) {
  // const gltf = useGLTF(`/models/${item.file}`)
  const gltf = useGLTF(modelUrl(item.file))
  const scene = useMemo(() => {
    const cloned = gltf.scene.clone(true)
    const mat = buildMaterial(item)
    cloned.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh
        const geom = mesh.geometry as THREE.BufferGeometry
        if (geom && !geom.attributes.normal) {
          geom.computeVertexNormals()
        }
        mesh.material = mat
        mesh.castShadow = false
        mesh.receiveShadow = false
      }
    })
    if (withLocalAxes) cloned.add(new THREE.AxesHelper(0.85))
    return cloned
  }, [gltf.scene, item, withLocalAxes])

  return <primitive object={scene} scale={1.1} position={offset} />
}

function AnatomyModel({ selectedMp, selectedVo, manifest }: Props & { manifest: ManifestItem[] }) {
  // 运动幅度缩放系数（按产品反馈扩大 10 倍）：
  // - MP: 每 +1% 前伸，对应 0.72 的模型位移（原 0.072）
  // - VO: 每 +1mm 开口，对应 1.60 的模型位移（原 0.16）
  // 若后续还需调整，只改这两个系数即可，其他逻辑无需改动。
  const mpShift = (selectedMp - 50) * 0.72
  const voDrop = (selectedVo - 3) * 1.6
  // 按反馈修正方向符号：MP 与 VO 的运动方向均做正负号翻转
  const jawOffset = useMemo(() => [0, -mpShift, voDrop] as [number, number, number], [mpShift, voDrop])

  return (
    <group rotation={[0, 0, -Math.PI / 2]}>
      {manifest.map((item) => {
        const isMandibleGroup = item.file.includes('mandible') || item.file.includes('teeth_lower')
        const offset: [number, number, number] = isMandibleGroup ? jawOffset : [0, 0, 0]
        return <ModelPart key={item.file} item={item} offset={offset} withLocalAxes={item.file.includes('mandible')} />
      })}
      <axesHelper args={[1.4]} />
    </group>
  )
}


function SceneEnvironment() {
  const { gl, scene } = useThree()

  useEffect(() => {
    const pmremGenerator = new THREE.PMREMGenerator(gl)
    const envScene = new RoomEnvironment()
    const envRT = pmremGenerator.fromScene(envScene)
    scene.environment = envRT.texture

    return () => {
      scene.environment = null
      envRT.dispose()
      pmremGenerator.dispose()
      envScene.dispose()
    }
  }, [gl, scene])

  return null
}

export default function AnatomyScene({ selectedMp, selectedVo }: Props) {
  const [manifest, setManifest] = useState<ManifestItem[]>([])

  useEffect(() => {
    // fetch('/models/manifest.json').then((res) => res.json()).then((data) => setManifest(data.files ?? []))
	fetch(modelUrl('manifest.json')).then((res) => res.json()).then((data) => setManifest(data.files ?? []))
  }, [])

  return (
    <div className="scene-wrap scene-wrap--bright">
      <Canvas
        orthographic
        camera={{ position: [0, -12, -8], zoom: 85 }}
        gl={{ antialias: true }}
        dpr={[1, 2]}
        onCreated={({ gl, camera }) => {
          camera.up.set(0, 0, -1) // 翻转 z 轴上下方向
          camera.lookAt(0, 0, 0) // x 轴作为水平向
          camera.updateProjectionMatrix()
          gl.outputColorSpace = THREE.SRGBColorSpace
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.2
          // gl.physicallyCorrectLights = true
        }}
      >
        <color attach="background" args={["#d8e3f7"]} />
        <SceneEnvironment />
        <hemisphereLight intensity={0.35} color="#ffffff" groundColor="#c6d8ee" />
        <ambientLight intensity={0.25} />
        <directionalLight position={[8, 12, 8]} intensity={1.05} />
        <directionalLight position={[-7, 7, -8]} intensity={0.75} />
        <pointLight position={[0, 6, 3]} intensity={0.1} />

        <Suspense fallback={null}>
          {manifest.length > 0 ? (
            <Bounds fit clip observe margin={1.18}>
              <AnatomyModel selectedMp={selectedMp} selectedVo={selectedVo} manifest={manifest} />
            </Bounds>
          ) : null}
        </Suspense>

        <Grid args={[12, 12]} cellSize={0.8} cellThickness={0.5} sectionSize={2} sectionThickness={1} fadeDistance={18} />
        <ArcballControls makeDefault enablePan enableRotate enableZoom />
        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewcube />
        </GizmoHelper>
      </Canvas>
    </div>
  )
}

// useGLTF.preload('/models/maxilla.glb')
// useGLTF.preload('/models/mandible.glb')
// useGLTF.preload('/models/teeth_upper.glb')
// useGLTF.preload('/models/teeth_lower.glb')
// useGLTF.preload('/models/muscle_cheeks.glb')
// useGLTF.preload('/models/muscle_lip.glb')
// useGLTF.preload('/models/muscle_others.glb')
useGLTF.preload(modelUrl('maxilla.glb'))
useGLTF.preload(modelUrl('mandible.glb'))
useGLTF.preload(modelUrl('teeth_upper.glb'))
useGLTF.preload(modelUrl('teeth_lower.glb'))
useGLTF.preload(modelUrl('muscle_cheeks.glb'))
useGLTF.preload(modelUrl('muscle_lip.glb'))
useGLTF.preload(modelUrl('muscle_others.glb'))