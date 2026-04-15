import { Canvas, useThree } from '@react-three/fiber'
import { ArcballControls, Bounds, GizmoHelper, GizmoViewcube, Grid, useBounds, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import * as THREE from 'three'

type Props = {
  selectedStep: number
  selectedHeight: number
  motion17?: { disp_x_mm: number; disp_y_mm: number; disp_z_mm: number }
  material?: string
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

function ModelPart({
  item,
  offset = [0, 0, 0],
  rotation = [0, 0, 0],
  groupRef,
}: {
  item: ManifestItem
  offset?: [number, number, number]
  rotation?: [number, number, number]
  groupRef?: React.Ref<THREE.Group>
}) {
  const gltf = useGLTF(modelUrl(item.file))
  const { scene, center } = useMemo(() => {
    const cloned = gltf.scene.clone(true)
    const mat = buildMaterial(item)
    cloned.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh
        const geom = mesh.geometry as THREE.BufferGeometry
        if (geom && !geom.attributes.normal) geom.computeVertexNormals()
        mesh.material = mat
        mesh.castShadow = false
        mesh.receiveShadow = false
      }
    })
    const box = new THREE.Box3().setFromObject(cloned)
    const c = box.getCenter(new THREE.Vector3())
    cloned.position.sub(c)
    return { scene: cloned, center: c }
  }, [gltf.scene, item])

  const groupPos: [number, number, number] = [offset[0] + center.x, offset[1] + center.y, offset[2] + center.z]
  return (
    <group ref={groupRef} position={groupPos} rotation={rotation}>
      <primitive object={scene} scale={1.1} />
    </group>
  )
}

function AutoFitToUpperTeeth({ targetRef }: { targetRef: React.RefObject<THREE.Group> }) {
  const bounds = useBounds()
  useEffect(() => {
    if (targetRef.current) {
      bounds.refresh(targetRef.current).clip().fit()
    }
  }, [bounds, targetRef])
  return null
}

function AnatomyModel({ motion17, manifest }: Props & { manifest: ManifestItem[] }) {
  const teethURef = useRef<THREE.Group>(null!)
  const zLift = (motion17?.disp_z_mm ?? 0) * 20
  const xRotRad = -((motion17?.disp_x_mm ?? 0) * 500 * Math.PI) / 180

  return (
    <group>
      {manifest.map((item) => {
        const isUpperTeeth = item.file.includes('teeth_U') || item.file.includes('teeth_upper')
        const offset: [number, number, number] = isUpperTeeth ? [0, 0, zLift] : [0, 0, 0]
        const rotation: [number, number, number] = isUpperTeeth ? [xRotRad, 0, 0] : [0, 0, 0]
        return (
          <ModelPart
            key={item.file}
            item={item}
            offset={offset}
            rotation={rotation}
            groupRef={isUpperTeeth ? teethURef : undefined}
          />
        )
      })}
      <AutoFitToUpperTeeth targetRef={teethURef} />
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

export default function AnatomyScene({ selectedStep, selectedHeight, motion17, material }: Props) {
  const [manifest, setManifest] = useState<ManifestItem[]>([])

  useEffect(() => {
    fetch(modelUrl('manifest.json')).then((res) => res.json()).then((data) => setManifest(data.files ?? []))
  }, [])

  return (
    <div className="scene-wrap scene-wrap--bright">
      <div style={{ position: 'absolute', zIndex: 5, right: 16, top: 12 }} className="scene-badge">材料: {material ?? '-'} · height {selectedHeight.toFixed(2)} · step {selectedStep.toFixed(2)}</div>
      <Canvas
        orthographic
        camera={{ position: [0, 0, 12], zoom: 85 }}
        gl={{ antialias: true }}
        dpr={[1, 2]}
        onCreated={({ gl, camera }) => {
          camera.up.set(0, -1, 0)
          camera.lookAt(0, 0, 0)
          camera.updateProjectionMatrix()
          gl.outputColorSpace = THREE.SRGBColorSpace
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.2
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
            <Bounds margin={1.05}>
              <AnatomyModel selectedStep={selectedStep} selectedHeight={selectedHeight} motion17={motion17} material={material} manifest={manifest} />
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

useGLTF.preload(modelUrl('maxilla.glb'))
useGLTF.preload(modelUrl('mandible.glb'))
useGLTF.preload(modelUrl('teeth_upper.glb'))
useGLTF.preload(modelUrl('teeth_lower.glb'))
useGLTF.preload(modelUrl('muscle_cheeks.glb'))
useGLTF.preload(modelUrl('muscle_lip.glb'))
useGLTF.preload(modelUrl('muscle_others.glb'))
