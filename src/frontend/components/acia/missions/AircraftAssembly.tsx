import { useState, useRef, useEffect, Suspense, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { EvidenceItem } from '../types';
import { MissionReasoningResponse, type ReasoningQuestion } from './MissionReasoningResponse';

useGLTF.preload('/models/aircraft.glb');

const C = {
  crimson: '#8F0909',
  crimsonD: '#721010',
  bg: '#0f0a0b',
  bgCard: '#1a0d10',
  border: '#3d1020',
  white: '#f1f5f9',
  grey: '#94a3b8',
  green: '#22c55e',
  amber: '#f59e0b',
  blue: '#60a5fa',
};

// Component groups with displaced start positions and snap targets
const COMPONENT_GROUPS = [
  {
    id: 'left_wing',
    label: 'Left Wing',
    prefixes: ['Wing_port', 'Aileron_port', 'Flap_port', 'Nacelle_port'],
    startOffset: new THREE.Vector3(-12, 0, -3),
    snapTarget: new THREE.Vector3(-3.4, 1.35, 0.18),
  },
  {
    id: 'right_wing',
    label: 'Right Wing',
    prefixes: ['Wing_starboard', 'Aileron_starboard', 'Flap_starboard', 'Nacelle_starboard'],
    startOffset: new THREE.Vector3(12, 0, -3),
    snapTarget: new THREE.Vector3(3.4, 1.35, 0.18),
  },
  {
    id: 'stabilizers',
    label: 'Horizontal Stabilizers',
    prefixes: ['Stabilizer_port', 'Stabilizer_starboard'],
    startOffset: new THREE.Vector3(0, 0, 10),
    snapTarget: new THREE.Vector3(0, 2.18, 4.30),
  },
  {
    id: 'vertical_fin',
    label: 'Vertical Fin',
    prefixes: ['VerticalFin'],
    startOffset: new THREE.Vector3(0, 6, 8),
    snapTarget: new THREE.Vector3(0, 3.05, 4.47),
    startRotationY: Math.PI / 4,
  },
  {
    id: 'landing_gear',
    label: 'Landing Gear',
    prefixes: ['GearStrut', 'MainWheel', 'WheelHub', 'NoseStrut', 'NoseWheel', 'NoseHub'],
    startOffset: new THREE.Vector3(0, -3, 0),
    snapTarget: new THREE.Vector3(0, 0.4, 0.1),
  },
];

const ASSEMBLY_QUESTIONS: ReasoningQuestion[] = [
  {
    id: 'approach',
    label: 'Your approach',
    prompt: 'How did you work out where the different components belonged?',
    placeholder: 'Describe what you looked for or how you figured it out…',
    minLength: 20,
  },
  {
    id: 'stuck',
    label: 'When it didn\'t fit',
    prompt: 'What did you do when a component didn\'t go where you expected?',
    placeholder: 'Describe what you tried or how you adjusted…',
    minLength: 20,
  },
  {
    id: 'learning',
    label: 'What helped',
    prompt: 'What helped you understand the assembly, and what would you do differently next time?',
    placeholder: 'Reflect on what worked and what you\'d change…',
    minLength: 20,
  },
];

type Phase = 'explore' | 'assemble' | 'challenge' | 'complete' | 'reflection';

interface AssembledState {
  [componentId: string]: boolean;
}

interface Props {
  sessionId?: string;
  onComplete: (evidence: Omit<EvidenceItem, 'mission'>[]) => void;
}

// ── 3D Scene ──────────────────────────────────────────────────────────────────

interface SceneProps {
  assembled: AssembledState;
  activeComponentId: string | null;
  phase: Phase;
  onComponentClick: (id: string) => void;
  challengeRotation: number | null;
}

function groupMeshesByPrefix(scene: THREE.Group, prefixes: string[]): THREE.Object3D[] {
  const result: THREE.Object3D[] = [];
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const matches = prefixes.some(p => obj.name.startsWith(p));
      if (matches) result.push(obj);
    }
  });
  return result;
}

function AircraftScene({ assembled, activeComponentId, phase, onComponentClick, challengeRotation }: SceneProps) {
  const { scene } = useGLTF('/models/aircraft.glb');
  const groupRefs = useRef<Record<string, THREE.Group>>({});
  const { camera } = useThree();

  // Set up initial camera position
  useEffect(() => {
    camera.position.set(0, 4, 14);
    camera.lookAt(0, 1, 0);
  }, [camera]);

  // Build component groups once
  useEffect(() => {
    COMPONENT_GROUPS.forEach(cfg => {
      const grp = new THREE.Group();
      grp.name = cfg.id;

      const meshes = groupMeshesByPrefix(scene as THREE.Group, cfg.prefixes);
      meshes.forEach(mesh => {
        // Clone and add to group, keeping world transform
        const cloned = mesh.clone();
        grp.add(cloned);
      });

      grp.position.copy(cfg.snapTarget.clone().add(cfg.startOffset));
      if (cfg.startRotationY) grp.rotation.y = cfg.startRotationY;

      groupRefs.current[cfg.id] = grp;
    });
  }, [scene]);

  // Animate positions toward target or start
  useFrame((_, delta) => {
    COMPONENT_GROUPS.forEach(cfg => {
      const grp = groupRefs.current[cfg.id];
      if (!grp) return;

      const isAssembled = assembled[cfg.id];
      const target = isAssembled
        ? cfg.snapTarget.clone()
        : cfg.snapTarget.clone().add(cfg.startOffset);

      grp.position.lerp(target, delta * 4);

      // Animate rotation challenge
      if (cfg.id === 'vertical_fin' && challengeRotation !== null) {
        const targetRot = isAssembled ? 0 : challengeRotation;
        grp.rotation.y = THREE.MathUtils.lerp(grp.rotation.y, targetRot, delta * 3);
      } else if (cfg.id === 'vertical_fin') {
        const targetRot = assembled['vertical_fin'] ? 0 : cfg.startRotationY ?? 0;
        grp.rotation.y = THREE.MathUtils.lerp(grp.rotation.y, targetRot, delta * 3);
      }
    });
  });

  // Highlight active component
  useEffect(() => {
    COMPONENT_GROUPS.forEach(cfg => {
      const grp = groupRefs.current[cfg.id];
      if (!grp) return;
      grp.traverse(obj => {
        if (obj instanceof THREE.Mesh && obj.material) {
          const mat = obj.material as THREE.MeshStandardMaterial;
          if (cfg.id === activeComponentId) {
            mat.emissive = new THREE.Color(0.15, 0.05, 0.05);
          } else if (assembled[cfg.id]) {
            mat.emissive = new THREE.Color(0, 0.05, 0);
          } else {
            mat.emissive = new THREE.Color(0, 0, 0);
          }
        }
      });
    });
  }, [activeComponentId, assembled]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow />
      <directionalLight position={[-5, 5, -5]} intensity={0.4} />

      {/* Static fuselage/body meshes */}
      <primitive object={scene} dispose={null} />

      {/* Component groups */}
      {COMPONENT_GROUPS.map(cfg => {
        const grp = groupRefs.current[cfg.id];
        if (!grp) return null;
        return (
          <primitive
            key={cfg.id}
            object={grp}
            onClick={(e: { stopPropagation: () => void }) => {
              e.stopPropagation();
              if (phase === 'assemble' || phase === 'challenge') onComponentClick(cfg.id);
            }}
          />
        );
      })}

      <OrbitControls
        enablePan={false}
        minDistance={5}
        maxDistance={25}
        target={[0, 1, 0]}
      />
    </>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function AircraftAssembly({ sessionId, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('explore');
  const [assembled, setAssembled] = useState<AssembledState>({});
  const [activeComponentId, setActiveComponentId] = useState<string | null>(null);
  const [challengeShown, setChallengeShown] = useState(false);
  const [challengeSolved, setChallengeSolved] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [exploreTime, setExploreTime] = useState(0);
  const [startTime] = useState(Date.now());
  const [assemblyLog, setAssemblyLog] = useState<{ id: string; timestamp: number }[]>([]);
  const exploreTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const allAssembled = COMPONENT_GROUPS.every(c => assembled[c.id]);
  const assembledCount = Object.values(assembled).filter(Boolean).length;

  // Track exploration time
  useEffect(() => {
    if (phase === 'explore') {
      exploreTimer.current = setInterval(() => setExploreTime(t => t + 1), 1000);
    } else {
      if (exploreTimer.current) clearInterval(exploreTimer.current);
    }
    return () => { if (exploreTimer.current) clearInterval(exploreTimer.current); };
  }, [phase]);

  function handleStartAssembly() {
    setPhase('assemble');
  }

  const handleComponentClick = useCallback((id: string) => {
    if (assembled[id]) return;
    setActiveComponentId(id);
  }, [assembled]);

  function handleSnap() {
    if (!activeComponentId) return;
    setAssembled(prev => ({ ...prev, [activeComponentId]: true }));
    setAssemblyLog(prev => [...prev, { id: activeComponentId, timestamp: Date.now() }]);
    setActiveComponentId(null);

    // After wings and gear, trigger fin challenge
    const nextAssembled = { ...assembled, [activeComponentId]: true };
    const assembledIds = Object.keys(nextAssembled).filter(k => nextAssembled[k]);

    if (assembledIds.length >= 4 && !challengeShown) {
      setChallengeShown(true);
      setPhase('challenge');
    }
  }

  function handleChallengeSolve() {
    setChallengeSolved(true);
    setAssembled(prev => ({ ...prev, vertical_fin: true }));
    setAssemblyLog(prev => [...prev, { id: 'vertical_fin', timestamp: Date.now() }]);
    setPhase('complete');
  }

  function handleSkipChallenge() {
    setHintsUsed(h => h + 1);
    setAssembled(prev => ({ ...prev, vertical_fin: true }));
    setAssemblyLog(prev => [...prev, { id: 'vertical_fin', timestamp: Date.now() }]);
    setPhase('complete');
  }

  function handleProceedToReflection() {
    setPhase('reflection');
  }

  function handleReflectionComplete() {
    // Save assembly log to localStorage
    const logKey = sessionId ? `acia_assembly_log_${sessionId}` : 'acia_assembly_log';
    try {
      localStorage.setItem(logKey, JSON.stringify({
        log: assemblyLog,
        exploreSeconds: exploreTime,
        hintsUsed,
        challengeSolved,
        completedAt: Date.now(),
      }));
    } catch (_) {}

    const totalTime = (Date.now() - startTime) / 1000;
    const explorationDepth = Math.min(1, exploreTime / 30);
    const attentionDelta = challengeSolved ? 0.75 : hintsUsed === 0 ? 0.6 : 0.4;
    const curiosityDelta = explorationDepth > 0.5 ? 0.7 : explorationDepth > 0.2 ? 0.5 : 0.3;

    const evidence: Omit<EvidenceItem, 'mission'>[] = [
      { key: 'spatial_reasoning', delta: 0 },        // non-scoring: captured for future calibration
      { key: 'attention_to_detail', delta: attentionDelta },
      { key: 'curiosity', delta: curiosityDelta },
    ];

    if (totalTime < 180) evidence.push({ key: 'multitasking_ability', delta: 0.4 });

    onComplete(evidence);
  }

  const activeConfig = COMPONENT_GROUPS.find(c => c.id === activeComponentId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20 }}>
      {/* Header */}
      <div style={{ background: '#0f1420', border: '1px solid #1a2a3a', borderRadius: 12, padding: '10px 16px', color: '#93c5fd', fontSize: 13 }}>
        {phase === 'explore' && 'Explore the disassembled aircraft. Rotate and zoom to understand the components before assembly.'}
        {phase === 'assemble' && 'Select a component from the panel, then click "Snap into Position" to attach it to the airframe.'}
        {phase === 'challenge' && 'The vertical fin is misaligned — it needs to be rotated to the correct orientation before it can be fitted.'}
        {phase === 'complete' && 'Assembly complete. The airframe is ready for inspection.'}
      </div>

      {/* 3D Canvas */}
      <div style={{ height: 360, borderRadius: 16, overflow: 'hidden', border: `1px solid ${C.border}`, background: 'linear-gradient(160deg, #050a14 0%, #0a1020 100%)' }}>
        <Suspense fallback={
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.grey, fontSize: 13 }}>
            Loading 3D aircraft…
          </div>
        }>
          <Canvas shadows camera={{ position: [0, 4, 14], fov: 45 }}>
            <AircraftScene
              assembled={assembled}
              activeComponentId={activeComponentId}
              phase={phase}
              onComponentClick={handleComponentClick}
              challengeRotation={phase === 'challenge' && !challengeSolved ? Math.PI / 4 : null}
            />
          </Canvas>
        </Suspense>
      </div>

      {/* Phase: Explore */}
      {phase === 'explore' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {COMPONENT_GROUPS.map(c => (
              <div key={c.id} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', color: C.grey, fontSize: 12 }}>
                {c.label}
              </div>
            ))}
          </div>
          <div style={{ color: C.grey, fontSize: 12 }}>
            Exploring for {exploreTime}s
          </div>
          <button
            onClick={handleStartAssembly}
            style={{ background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`, color: 'white', border: 'none', borderRadius: 12, padding: '12px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
          >
            Begin Assembly →
          </button>
        </div>
      )}

      {/* Phase: Assemble */}
      {phase === 'assemble' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {COMPONENT_GROUPS.filter(c => c.id !== 'vertical_fin' || !challengeShown).map(c => (
              <button
                key={c.id}
                onClick={() => !assembled[c.id] && setActiveComponentId(c.id)}
                disabled={assembled[c.id]}
                style={{
                  background: assembled[c.id] ? '#0f1a0f' : activeComponentId === c.id ? `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})` : C.bgCard,
                  color: assembled[c.id] ? C.green : activeComponentId === c.id ? 'white' : C.grey,
                  border: `1px solid ${assembled[c.id] ? '#1a3a1a' : activeComponentId === c.id ? C.crimson : C.border}`,
                  borderRadius: 8,
                  padding: '7px 14px',
                  cursor: assembled[c.id] ? 'default' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {assembled[c.id] ? `✓ ${c.label}` : c.label}
              </button>
            ))}
          </div>

          {activeConfig && !assembled[activeConfig.id] && (
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ color: C.grey, fontSize: 12, marginBottom: 6 }}>Selected</div>
              <div style={{ color: C.white, fontSize: 15, fontWeight: 600, marginBottom: 10 }}>{activeConfig.label}</div>
              <button
                onClick={handleSnap}
                style={{ background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`, color: 'white', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
              >
                Snap into Position
              </button>
            </div>
          )}

          <div style={{ color: C.grey, fontSize: 12 }}>
            {assembledCount} of {COMPONENT_GROUPS.length} components fitted
          </div>
        </div>
      )}

      {/* Phase: Spatial Challenge */}
      {phase === 'challenge' && (
        <div style={{ background: '#0f1420', border: '1px solid #1a2a3a', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ color: C.white, fontSize: 14, fontWeight: 600 }}>Spatial Orientation Challenge</div>
          <div style={{ color: C.grey, fontSize: 13 }}>
            The vertical fin has been rotated 45° out of alignment. Identify the correct mounting orientation and confirm to fit it.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleChallengeSolve}
              style={{ background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`, color: 'white', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
            >
              Align and Fit Fin →
            </button>
            <button
              onClick={handleSkipChallenge}
              style={{ background: 'transparent', color: C.grey, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontSize: 13 }}
            >
              Show me the correct position
            </button>
          </div>
        </div>
      )}

      {/* Phase: Complete */}
      {phase === 'complete' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#0f1a0f', border: '1px solid #1a3a1a', borderRadius: 12, padding: 14, color: '#86efac', fontSize: 13 }}>
            All {COMPONENT_GROUPS.length} components assembled. Airframe structurally complete — ready for pre-flight inspection.
          </div>
          {challengeSolved && (
            <div style={{ color: C.grey, fontSize: 12 }}>
              You identified the fin misalignment without assistance.
            </div>
          )}
          <button
            onClick={handleProceedToReflection}
            style={{ background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`, color: 'white', border: 'none', borderRadius: 12, padding: '13px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
          >
            Reflect on the Assembly →
          </button>
        </div>
      )}

      {/* Phase: Reflection */}
      {phase === 'reflection' && (
        <MissionReasoningResponse
          questions={ASSEMBLY_QUESTIONS}
          storageKey="acia_assembly_reasoning"
          onComplete={handleReflectionComplete}
        />
      )}
    </div>
  );
}
