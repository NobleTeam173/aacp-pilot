/**
 * Aircraft3DViewer — interactive 3D aircraft built from Three.js primitives.
 *
 * No external GLB model is used; the aircraft is procedurally constructed so
 * inspection zones map exactly to existing ACIA zone IDs without licensing concerns.
 *
 * Zone selection uses raycasting against named mesh groups.
 * The component is view-only for RPAS — the isRpas guard lives in AircraftInspection.tsx.
 */

import { useRef, useState, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';

// ── Zone colours matching 2D inspection palette ───────────────────────────────
const COL = {
  idle: '#60a5fa',
  ok: '#22c55e',
  caution: '#f59e0b',
  defect: '#ef4444',
  selected: '#e2e8f0',
};

export interface Zone3D {
  id: string;
  label: string;
  position: [number, number, number];  // world-space centre
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

// ── Zone beacon mesh — floats above zone position ────────────────────────────
function ZoneBeacon({ zone, completed, onClick, isSelected }: {
  zone: Zone3D;
  completed: boolean;
  onClick: () => void;
  isSelected: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 1.2;
    }
  });

  const color = !zone.found
    ? COL.idle
    : zone.severity === 'ok'
    ? COL.ok
    : zone.severity === 'caution'
    ? COL.caution
    : COL.defect;

  const scale = hovered && !completed ? 1.35 : 1;

  return (
    <group position={zone.position}>
      <mesh
        ref={ref}
        scale={scale}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (!completed) onClick(); }}
        onPointerOver={() => !completed && setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <octahedronGeometry args={[0.07, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={zone.found ? 0.6 : 0.3}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Pulse ring for unfound zones */}
      {!zone.found && !completed && (
        <PulseRing color={COL.idle} />
      )}

      {/* Info popup on hover or selection */}
      {(hovered || isSelected) && (
        <Html
          center
          style={{
            pointerEvents: 'none',
            background: zone.found
              ? (zone.severity === 'ok' ? '#0f1a0f' : zone.severity === 'caution' ? '#1a1400' : '#1a0505')
              : '#0c1a2e',
            border: `1px solid ${color}`,
            borderRadius: 8,
            padding: '6px 10px',
            whiteSpace: 'nowrap',
            fontSize: 11,
            color: '#f1f5f9',
            transform: 'translateY(-28px)',
            minWidth: 140,
          }}
        >
          <div style={{ fontWeight: 600 }}>{zone.label}</div>
          {zone.found && (
            <div style={{ color, marginTop: 2 }}>
              {zone.severity === 'ok' ? '✓ No issues found' : `⚠ ${zone.issue}`}
            </div>
          )}
          {!zone.found && <div style={{ color: COL.idle, marginTop: 2 }}>Click to inspect</div>}
        </Html>
      )}
    </group>
  );
}

// ── Animated pulse ring ───────────────────────────────────────────────────────
function PulseRing({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta;
    if (ref.current) {
      const s = 1 + Math.sin(t.current * 2.5) * 0.4;
      ref.current.scale.setScalar(s);
      (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.4 - Math.sin(t.current * 2.5) * 0.2;
    }
  });

  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.09, 0.115, 24]} />
      <meshBasicMaterial color={color} transparent opacity={0.4} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ── Procedural twin-engine aircraft from primitives ───────────────────────────
function AircraftModel() {
  const mat = {
    fuselage: <meshStandardMaterial color="#1e2d3d" roughness={0.6} metalness={0.4} />,
    wing: <meshStandardMaterial color="#1a2535" roughness={0.7} metalness={0.3} />,
    engine: <meshStandardMaterial color="#253646" roughness={0.5} metalness={0.6} />,
    gear: <meshStandardMaterial color="#374151" roughness={0.8} metalness={0.5} />,
    glass: <meshStandardMaterial color="#1a3a5c" roughness={0.1} metalness={0.1} transparent opacity={0.7} />,
    tail: <meshStandardMaterial color="#172230" roughness={0.6} metalness={0.3} />,
  };

  return (
    <group>
      {/* Main fuselage */}
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.18, 0.14, 2.2, 16]} />
        {mat.fuselage}
      </mesh>

      {/* Nose section */}
      <mesh position={[-1.25, 0.03, 0]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.14, 0.5, 12]} />
        {mat.fuselage}
      </mesh>

      {/* Cockpit windows */}
      <mesh position={[-0.8, 0.16, 0]}>
        <boxGeometry args={[0.28, 0.06, 0.22]} />
        {mat.glass}
      </mesh>

      {/* Cabin windows row (left side) */}
      {[-0.3, 0, 0.3, 0.6].map((z, i) => (
        <mesh key={`wl${i}`} position={[z, 0.17, 0.19]}>
          <boxGeometry args={[0.09, 0.06, 0.01]} />
          {mat.glass}
        </mesh>
      ))}

      {/* Left wing */}
      <mesh position={[0.1, -0.04, -1.2]} rotation={[0.06, 0, 0]}>
        <boxGeometry args={[0.7, 0.04, 1.8]} />
        {mat.wing}
      </mesh>

      {/* Right wing */}
      <mesh position={[0.1, -0.04, 1.2]} rotation={[-0.06, 0, 0]}>
        <boxGeometry args={[0.7, 0.04, 1.8]} />
        {mat.wing}
      </mesh>

      {/* Left wing tip */}
      <mesh position={[0.4, -0.02, -1.95]}>
        <boxGeometry args={[0.22, 0.03, 0.18]} />
        {mat.wing}
      </mesh>
      {/* Right wing tip */}
      <mesh position={[0.4, -0.02, 1.95]}>
        <boxGeometry args={[0.22, 0.03, 0.18]} />
        {mat.wing}
      </mesh>

      {/* Left flap */}
      <mesh position={[0.25, -0.06, -1.0]}>
        <boxGeometry args={[0.3, 0.025, 0.7]} />
        {mat.tail}
      </mesh>
      {/* Right flap */}
      <mesh position={[0.25, -0.06, 1.0]}>
        <boxGeometry args={[0.3, 0.025, 0.7]} />
        {mat.tail}
      </mesh>

      {/* Left engine pod */}
      <mesh position={[0.05, -0.12, -0.88]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.1, 0.08, 0.55, 12]} />
        {mat.engine}
      </mesh>
      {/* Left engine intake */}
      <mesh position={[-0.24, -0.12, -0.88]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.09, 0.09, 0.06, 12]} />
        <meshStandardMaterial color="#0d1520" roughness={0.8} />
      </mesh>

      {/* Right engine pod */}
      <mesh position={[0.05, -0.12, 0.88]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.1, 0.08, 0.55, 12]} />
        {mat.engine}
      </mesh>
      {/* Right engine intake */}
      <mesh position={[-0.24, -0.12, 0.88]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.09, 0.09, 0.06, 12]} />
        <meshStandardMaterial color="#0d1520" roughness={0.8} />
      </mesh>

      {/* Vertical tail fin */}
      <mesh position={[0.88, 0.22, 0]}>
        <boxGeometry args={[0.55, 0.44, 0.03]} />
        {mat.tail}
      </mesh>
      {/* Left horizontal stabiliser */}
      <mesh position={[0.85, 0.02, -0.44]}>
        <boxGeometry args={[0.38, 0.025, 0.5]} />
        {mat.tail}
      </mesh>
      {/* Right horizontal stabiliser */}
      <mesh position={[0.85, 0.02, 0.44]}>
        <boxGeometry args={[0.38, 0.025, 0.5]} />
        {mat.tail}
      </mesh>

      {/* Nose landing gear strut */}
      <mesh position={[-0.88, -0.22, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.22, 8]} />
        {mat.gear}
      </mesh>
      {/* Nose gear wheel */}
      <mesh position={[-0.88, -0.34, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.065, 0.065, 0.055, 12]} />
        {mat.gear}
      </mesh>

      {/* Left main gear strut */}
      <mesh position={[0.15, -0.28, -0.72]}>
        <cylinderGeometry args={[0.022, 0.022, 0.28, 8]} />
        {mat.gear}
      </mesh>
      <mesh position={[0.15, -0.42, -0.72]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.06, 12]} />
        {mat.gear}
      </mesh>

      {/* Right main gear strut */}
      <mesh position={[0.15, -0.28, 0.72]}>
        <cylinderGeometry args={[0.022, 0.022, 0.28, 8]} />
        {mat.gear}
      </mesh>
      <mesh position={[0.15, -0.42, 0.72]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.06, 12]} />
        {mat.gear}
      </mesh>

      {/* Pitot tube — on nose left side */}
      <mesh position={[-1.0, 0.06, -0.18]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.008, 0.008, 0.18, 6]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Static port — fuselage side */}
      <mesh position={[-0.5, -0.03, 0.185]}>
        <circleGeometry args={[0.015, 8]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>

      {/* Left fuel cap — on wing upper surface */}
      <mesh position={[0.22, -0.02, -1.4]}>
        <cylinderGeometry args={[0.025, 0.025, 0.018, 8]} />
        <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Tail antenna */}
      <mesh position={[0.75, 0.44, 0]} rotation={[0.2, 0, 0]}>
        <cylinderGeometry args={[0.006, 0.004, 0.18, 6]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}

// ── Ground reflection plane ───────────────────────────────────────────────────
function GroundShadow() {
  return (
    <mesh position={[0, -0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[2.5, 32]} />
      <meshBasicMaterial color="#000" transparent opacity={0.25} />
    </mesh>
  );
}

// ── Scene content ─────────────────────────────────────────────────────────────
function SceneContent({ zones, completed, onZoneClick, selectedId }: Props) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 2]} intensity={0.9} castShadow={false} />
      <directionalLight position={[-2, -1, -3]} intensity={0.3} color="#4080ff" />
      <pointLight position={[0, 2, 0]} intensity={0.4} color="#ffffff" />

      <Suspense fallback={null}>
        <AircraftModel />
        <GroundShadow />

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
        enablePan={false}
        minDistance={1.2}
        maxDistance={4.5}
        maxPolarAngle={Math.PI * 0.8}
        makeDefault
      />
    </>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
export function Aircraft3DViewer({ zones, completed, onZoneClick, selectedId }: Props) {
  return (
    <div style={{ position: 'relative', width: '100%', borderRadius: 16, overflow: 'hidden', border: '1px solid #3d1020' }}>
      <Canvas
        style={{ height: 340, background: 'linear-gradient(160deg, #050a14 0%, #0a1020 100%)' }}
        camera={{ position: [0, 1.2, 2.8], fov: 45 }}
        gl={{ antialias: true }}
      >
        <SceneContent
          zones={zones}
          completed={completed}
          onZoneClick={onZoneClick}
          selectedId={selectedId}
        />
      </Canvas>

      {/* Navigation hint overlay */}
      <div style={{
        position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.55)', borderRadius: 20, padding: '4px 12px',
        color: '#94a3b8', fontSize: 11, pointerEvents: 'none', whiteSpace: 'nowrap',
      }}>
        Drag to rotate · Scroll to zoom · Tap beacons to inspect
      </div>
    </div>
  );
}

// ── Zone position map — maps ACIA zone IDs to 3D world coordinates ────────────
// These match the procedural model geometry above.
export const ZONE_3D_POSITIONS: Record<string, [number, number, number]> = {
  nose:         [-1.15, 0.08,  0   ],
  l_engine:     [ 0.05, -0.06, -0.88],
  r_engine:     [ 0.05, -0.06,  0.88],
  l_wing_tip:   [ 0.42, 0.02,  -2.0 ],
  r_wing_tip:   [ 0.42, 0.02,   2.0 ],
  l_main_gear:  [ 0.15, -0.38, -0.72],
  r_main_gear:  [ 0.15, -0.38,  0.72],
  nose_gear:    [-0.88, -0.38,  0   ],
  fuselage:     [ 0.1,   0.18,  0   ],
  tail:         [ 1.05,  0.08,  0   ],
  flap_l:       [ 0.26, -0.04, -1.02],
  flap_r:       [ 0.26, -0.04,  1.02],
  pitot_tube:   [-1.02,  0.1,  -0.18],
  static_port:  [-0.5,  -0.02,  0.2 ],
  l_fuel_cap:   [ 0.22,  0.02, -1.4 ],
};
