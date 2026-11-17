/**
 * Aircraft3DViewer — interactive 3D aircraft using the ACIA generic twin GLB asset.
 *
 * Model: /models/acia-generic-twin.glb (773 KB, 28 504 triangles, no textures)
 * Coordinate system: Y-up, -Z nose, metres. Bounds: X ±7.65, Y 0–4.25, Z -5.6…5.7
 * Zone positions are in model space (see zone3dPositions.ts).
 */

import { useRef, useState, Suspense } from 'react';
import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// Preload so the model is in cache before the user switches to 3D mode.
useGLTF.preload('/models/acia-generic-twin.glb');

// ── Zone colours matching 2D inspection palette ───────────────────────────────
const COL = {
  idle:     '#60a5fa',
  ok:       '#22c55e',
  caution:  '#f59e0b',
  defect:   '#ef4444',
};

export interface Zone3D {
  id: string;
  label: string;
  position: [number, number, number];
  severity: 'ok' | 'caution' | 'defect';
  issue: string | null;
  found: boolean;
}

interface Props {
  zones: Zone3D[];
  completed: boolean;
  onZoneClick: (id: string) => void;
  selectedId: string | null;
}

// ── GLB aircraft ──────────────────────────────────────────────────────────────
function AircraftModel() {
  const { scene } = useGLTF('/models/acia-generic-twin.glb');

  // Clone so React re-renders don't share the same scene graph instance.
  const cloned = scene.clone(true);
  cloned.traverse(o => {
    if ((o as THREE.Mesh).isMesh) {
      const m = o as THREE.Mesh;
      m.castShadow = true;
      m.receiveShadow = true;
      // Avoid mutating shared cached materials.
      if (m.material) {
        m.material = (m.material as THREE.Material).clone();
        (m.material as THREE.MeshStandardMaterial).envMapIntensity = 0.4;
      }
    }
  });

  return <primitive object={cloned} />;
}

// ── Pulse ring beacon ─────────────────────────────────────────────────────────
function PulseRing({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    if (ref.current) {
      const s = 1 + Math.sin(t.current * 2.2) * 0.35;
      ref.current.scale.setScalar(s);
      (ref.current.material as THREE.MeshBasicMaterial).opacity =
        0.38 - Math.sin(t.current * 2.2) * 0.18;
    }
  });

  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.28, 0.36, 24]} />
      <meshBasicMaterial color={color} transparent opacity={0.38} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ── Zone beacon ───────────────────────────────────────────────────────────────
function ZoneBeacon({ zone, completed, onClick, isSelected }: {
  zone: Zone3D;
  completed: boolean;
  onClick: () => void;
  isSelected: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 1.1;
  });

  const color = !zone.found
    ? COL.idle
    : zone.severity === 'ok'    ? COL.ok
    : zone.severity === 'caution' ? COL.caution
    : COL.defect;

  const scale = hovered && !completed ? 1.4 : 1;

  const stop = (e: ThreeEvent<MouseEvent | PointerEvent>) => e.stopPropagation();

  return (
    <group position={zone.position}>
      {/* Invisible hitbox — generous radius for easy clicking */}
      <mesh
        onClick={e => { stop(e); if (!completed) onClick(); }}
        onPointerOver={e => { stop(e); if (!completed) setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[0.55, 8, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Visible octahedral beacon */}
      <mesh ref={ref} scale={scale}>
        <octahedronGeometry args={[0.18, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={zone.found ? 0.8 : 0.45}
          transparent
          opacity={0.92}
          depthTest={false}
        />
      </mesh>

      {!zone.found && !completed && <PulseRing color={COL.idle} />}

      {(hovered || isSelected) && (
        <Html
          center
          distanceFactor={14}
          style={{
            pointerEvents: 'none',
            background: zone.found
              ? zone.severity === 'ok' ? '#0f1a0f'
              : zone.severity === 'caution' ? '#1a1400' : '#1a0505'
              : '#0c1a2e',
            border: `1px solid ${color}`,
            borderRadius: 8,
            padding: '6px 10px',
            whiteSpace: 'nowrap',
            fontSize: 11,
            color: '#f1f5f9',
            transform: 'translateY(-40px)',
            minWidth: 160,
            userSelect: 'none',
          }}
        >
          <div style={{ fontWeight: 600 }}>{zone.label}</div>
          {zone.found
            ? <div style={{ color, marginTop: 2 }}>
                {zone.severity === 'ok' ? '✓ No issues found' : `⚠ ${zone.issue}`}
              </div>
            : <div style={{ color: COL.idle, marginTop: 2 }}>Click to inspect</div>
          }
        </Html>
      )}
    </group>
  );
}

// ── Scene ─────────────────────────────────────────────────────────────────────
function SceneContent({ zones, completed, onZoneClick, selectedId }: Props) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[-8, 14, -10]} intensity={2.0} color="#fff5e0" castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-20} shadow-camera-right={20}
        shadow-camera-top={20}  shadow-camera-bottom={-20}
        shadow-bias={-0.001}
      />
      <directionalLight position={[10, 6, 8]} intensity={0.5} color="#a0c4ff" />
      <hemisphereLight args={['#8fa3c0', '#1e3050', 0.7]} />

      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#0c1a2e" roughness={0.95} />
      </mesh>
      <gridHelper args={[60, 30, '#1e3050', '#0e1e30']} position={[0, 0.005, 0]} />

      <Suspense fallback={null}>
        <AircraftModel />

        {zones.map(zone => (
          <ZoneBeacon
            key={zone.id}
            zone={zone}
            completed={completed}
            onClick={() => onZoneClick(zone.id)}
            isSelected={selectedId === zone.id}
          />
        ))}
      </Suspense>

      <OrbitControls
        target={[0, 1.8, 0]}
        enablePan={false}
        minDistance={8}
        maxDistance={50}
        maxPolarAngle={Math.PI * 0.48}
        makeDefault
        enableDamping
        dampingFactor={0.08}
      />
    </>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
export function Aircraft3DViewer({ zones, completed, onZoneClick, selectedId }: Props) {
  return (
    <div style={{ position: 'relative', width: '100%', borderRadius: 16, overflow: 'hidden', border: '1px solid #3d1020' }}>
      <Canvas
        style={{ height: 420, background: 'linear-gradient(160deg, #04080f 0%, #0a1220 100%)' }}
        camera={{ position: [-14, 9, -17], fov: 42 }}
        gl={{ antialias: true, alpha: false }}
        shadows
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.1;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
      >
        <SceneContent
          zones={zones}
          completed={completed}
          onZoneClick={onZoneClick}
          selectedId={selectedId}
        />
      </Canvas>

      <div style={{
        position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.65)', borderRadius: 20, padding: '4px 14px',
        color: '#94a3b8', fontSize: 11, pointerEvents: 'none', whiteSpace: 'nowrap',
      }}>
        Drag to orbit · Scroll to zoom · Click glowing beacons to inspect
      </div>

      <div style={{
        position: 'absolute', top: 8, right: 8,
        background: 'rgba(0,0,0,0.6)', borderRadius: 10, padding: '3px 10px',
        color: '#60a5fa', fontSize: 11, pointerEvents: 'none',
      }}>
        {zones.filter(z => z.found).length}/{zones.length} inspected
      </div>
    </div>
  );
}

export { ZONE_3D_POSITIONS } from './zone3dPositions';
