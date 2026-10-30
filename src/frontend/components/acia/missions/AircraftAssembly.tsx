import { useState, useRef, useEffect, Suspense, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { EvidenceItem } from '../types';
import { MissionReasoningResponse, type ReasoningQuestion } from './MissionReasoningResponse';
import { interpretSREvidence, type SREvidence } from '../srInterpreter';

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
    label: "When it didn't fit",
    prompt: "What did you do when a component didn't go where you expected?",
    placeholder: 'Describe what you tried or how you adjusted…',
    minLength: 20,
  },
  {
    id: 'learning',
    label: 'What helped',
    prompt: 'What helped you understand the assembly, and what would you do differently next time?',
    placeholder: "Reflect on what worked and what you'd change…",
    minLength: 20,
  },
];

type Phase = 'explore' | 'assemble' | 'challenge' | 'complete' | 'reflection';

interface AssembledState {
  [componentId: string]: boolean;
}

// Per-component placement tracking for SR evidence
interface PlacementRecord {
  componentId: string;
  attemptCount: number;
  corrected: boolean;
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
  onOrbitChange: () => void;
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

function AircraftScene({ assembled, activeComponentId, phase, onComponentClick, challengeRotation, onOrbitChange }: SceneProps) {
  const { scene } = useGLTF('/models/aircraft.glb');
  const groupRefs = useRef<Record<string, THREE.Group>>({});
  const { camera } = useThree();
  const controlsRef = useRef<{ addEventListener: (e: string, cb: () => void) => void; removeEventListener: (e: string, cb: () => void) => void } | null>(null);

  useEffect(() => {
    camera.position.set(0, 4, 14);
    camera.lookAt(0, 1, 0);
  }, [camera]);

  useEffect(() => {
    COMPONENT_GROUPS.forEach(cfg => {
      const grp = new THREE.Group();
      grp.name = cfg.id;
      const meshes = groupMeshesByPrefix(scene as THREE.Group, cfg.prefixes);
      meshes.forEach(mesh => {
        const cloned = mesh.clone();
        grp.add(cloned);
      });
      grp.position.copy(cfg.snapTarget.clone().add(cfg.startOffset));
      if (cfg.startRotationY) grp.rotation.y = cfg.startRotationY;
      groupRefs.current[cfg.id] = grp;
    });
  }, [scene]);

  // Wire up OrbitControls change event for mental rotation tracking
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.addEventListener('change', onOrbitChange);
    return () => controls.removeEventListener('change', onOrbitChange);
  }, [onOrbitChange]);

  useFrame((_, delta) => {
    COMPONENT_GROUPS.forEach(cfg => {
      const grp = groupRefs.current[cfg.id];
      if (!grp) return;
      const isAssembled = assembled[cfg.id];
      const target = isAssembled
        ? cfg.snapTarget.clone()
        : cfg.snapTarget.clone().add(cfg.startOffset);
      grp.position.lerp(target, delta * 4);

      if (cfg.id === 'vertical_fin' && challengeRotation !== null) {
        const targetRot = isAssembled ? 0 : challengeRotation;
        grp.rotation.y = THREE.MathUtils.lerp(grp.rotation.y, targetRot, delta * 3);
      } else if (cfg.id === 'vertical_fin') {
        const targetRot = assembled['vertical_fin'] ? 0 : cfg.startRotationY ?? 0;
        grp.rotation.y = THREE.MathUtils.lerp(grp.rotation.y, targetRot, delta * 3);
      }
    });
  });

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
      <primitive object={scene} dispose={null} />
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
        ref={controlsRef as React.Ref<unknown>}
        enablePan={false}
        minDistance={5}
        maxDistance={25}
        target={[0, 1, 0]}
      />
    </>
  );
}

// ── Session State Persistence ─────────────────────────────────────────────────

interface SavedState {
  assembled: AssembledState;
  phase: Phase;
  hintsUsed: number;
  challengeSolved: boolean;
  challengeShown: boolean;
  placements: PlacementRecord[];
  corrections: number;
  savedAt: number;
}

const STATE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function loadSavedState(key: string): SavedState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const s: SavedState = JSON.parse(raw);
    if (!s.savedAt || Date.now() - s.savedAt > STATE_TTL_MS) return null;
    // Don't restore if assembly was already complete (go straight through)
    const allDone = COMPONENT_GROUPS.every(c => s.assembled[c.id]);
    if (allDone && s.phase === 'complete') return null;
    return s;
  } catch {
    return null;
  }
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function AircraftAssembly({ sessionId, onComplete }: Props) {
  const stateKey = `acia_assembly_state_${sessionId ?? 'local'}`;
  const saved = loadSavedState(stateKey);

  const [phase, setPhase] = useState<Phase>(saved?.phase ?? 'explore');
  const [assembled, setAssembled] = useState<AssembledState>(saved?.assembled ?? {});
  const [activeComponentId, setActiveComponentId] = useState<string | null>(null);
  const [challengeShown, setChallengeShown] = useState(saved?.challengeShown ?? false);
  const [challengeSolved, setChallengeSolved] = useState(saved?.challengeSolved ?? false);
  const [hintsUsed, setHintsUsed] = useState(saved?.hintsUsed ?? 0);
  const [exploreTime, setExploreTime] = useState(0);
  const [startTime] = useState(Date.now());
  // Legacy log kept for localStorage compatibility
  const [assemblyLog, setAssemblyLog] = useState<{ id: string; timestamp: number }[]>([]);

  // SR evidence dimensions
  const [placements, setPlacements] = useState<PlacementRecord[]>(saved?.placements ?? []);
  const [corrections, setCorrections] = useState(saved?.corrections ?? 0);
  const orbitCountRef = useRef(0);      // orbit events during explore phase
  const pendingSelectRef = useRef<string | null>(null); // track selection for attempt counting

  const exploreTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const allAssembled = COMPONENT_GROUPS.every(c => assembled[c.id]);
  const assembledCount = Object.values(assembled).filter(Boolean).length;

  // Persist state on changes
  useEffect(() => {
    try {
      const s: SavedState = {
        assembled, phase, hintsUsed, challengeSolved, challengeShown,
        placements, corrections, savedAt: Date.now(),
      };
      localStorage.setItem(stateKey, JSON.stringify(s));
    } catch { /* ignore */ }
  }, [assembled, phase, hintsUsed, challengeSolved, challengeShown, placements, corrections, stateKey]);

  // Track exploration time
  useEffect(() => {
    if (phase === 'explore') {
      exploreTimer.current = setInterval(() => setExploreTime(t => t + 1), 1000);
    } else {
      if (exploreTimer.current) clearInterval(exploreTimer.current);
    }
    return () => { if (exploreTimer.current) clearInterval(exploreTimer.current); };
  }, [phase]);

  // Count orbit events during explore phase only (capped at 50)
  const handleOrbitChange = useCallback(() => {
    if (phase === 'explore' && orbitCountRef.current < 50) {
      orbitCountRef.current += 1;
    }
  }, [phase]);

  function handleStartAssembly() {
    setPhase('assemble');
  }

  const handleComponentClick = useCallback((id: string) => {
    if (assembled[id]) return;
    // Track selection attempt: if switching away from a component without snapping
    if (pendingSelectRef.current && pendingSelectRef.current !== id) {
      setPlacements(prev => {
        const idx = prev.findIndex(p => p.componentId === pendingSelectRef.current);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], attemptCount: updated[idx].attemptCount + 1 };
          return updated;
        }
        return [...prev, { componentId: pendingSelectRef.current!, attemptCount: 1, corrected: false }];
      });
    }
    pendingSelectRef.current = id;
    setActiveComponentId(id);
  }, [assembled]);

  function handleSnap() {
    if (!activeComponentId) return;
    const componentId = activeComponentId;

    // Record final placement (last attempt)
    setPlacements(prev => {
      const idx = prev.findIndex(p => p.componentId === componentId);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], attemptCount: updated[idx].attemptCount + 1 };
        return updated;
      }
      return [...prev, { componentId, attemptCount: 1, corrected: false }];
    });

    pendingSelectRef.current = null;
    setAssembled(prev => ({ ...prev, [componentId]: true }));
    setAssemblyLog(prev => [...prev, { id: componentId, timestamp: Date.now() }]);
    setActiveComponentId(null);

    const nextAssembled = { ...assembled, [componentId]: true };
    const assembledIds = Object.keys(nextAssembled).filter(k => nextAssembled[k]);
    if (assembledIds.length >= 4 && !challengeShown) {
      setChallengeShown(true);
      setPhase('challenge');
    }
  }

  function handleAdjust(componentId: string) {
    // Allow re-placing a component — counts as a correction
    setAssembled(prev => ({ ...prev, [componentId]: false }));
    setCorrections(c => c + 1);
    setPlacements(prev => {
      const idx = prev.findIndex(p => p.componentId === componentId);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], corrected: true };
        return updated;
      }
      return prev;
    });
    setActiveComponentId(componentId);
    pendingSelectRef.current = componentId;
  }

  function handleChallengeSolve() {
    setChallengeSolved(true);
    setAssembled(prev => ({ ...prev, vertical_fin: true }));
    setAssemblyLog(prev => [...prev, { id: 'vertical_fin', timestamp: Date.now() }]);
    setPlacements(prev => {
      const idx = prev.findIndex(p => p.componentId === 'vertical_fin');
      if (idx >= 0) return prev;
      return [...prev, { componentId: 'vertical_fin', attemptCount: 1, corrected: false }];
    });
    setPhase('complete');
  }

  function handleSkipChallenge() {
    setHintsUsed(h => h + 1);
    setAssembled(prev => ({ ...prev, vertical_fin: true }));
    setAssemblyLog(prev => [...prev, { id: 'vertical_fin', timestamp: Date.now() }]);
    setPlacements(prev => {
      const idx = prev.findIndex(p => p.componentId === 'vertical_fin');
      if (idx >= 0) return prev;
      return [...prev, { componentId: 'vertical_fin', attemptCount: 1, corrected: false }];
    });
    setPhase('complete');
  }

  function handleProceedToReflection() {
    setPhase('reflection');
  }

  async function handleReflectionComplete() {
    const elapsedSeconds = (Date.now() - startTime) / 1000;

    // Build structured SR evidence
    const srEvidence: SREvidence = {
      orientationChallenge: {
        presented: challengeShown,
        solvedIndependently: challengeSolved,
        hintRequested: hintsUsed > 0,
      },
      placements,
      explorationBehavior: {
        exploreSeconds: exploreTime,
        orbitEventsBeforeAssembly: orbitCountRef.current,
      },
      corrections,
      totalComponents: COMPONENT_GROUPS.length,
      componentsPlaced: assembledCount,
      completedAssembly: allAssembled,
      elapsedSeconds,
    };

    // Interpret SR evidence (non-scoring — for admin review only)
    const srInterpretation = interpretSREvidence(srEvidence);

    // Persist to backend (fire and forget — don't block mission completion)
    const token = localStorage.getItem('aacp_access_token');
    if (token) {
      const submissionId = `assembly_${sessionId ?? 'local'}_${Date.now()}`;
      fetch('/acia/assembly-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          submissionId,
          sessionId: sessionId ?? null,
          srEvidence,
          reflectionStorageKey: 'acia_assembly_reasoning',
        }),
      }).catch(e => console.error('[AircraftAssembly] evidence persist failed:', e));
    }

    // Save logs locally
    const logKey = sessionId ? `acia_assembly_log_${sessionId}` : 'acia_assembly_log';
    const interpKey = `acia_sr_interpretation_${sessionId ?? 'local'}`;
    try {
      localStorage.setItem(logKey, JSON.stringify({
        srEvidence,
        hintsUsed,
        challengeSolved,
        completedAt: Date.now(),
      }));
      localStorage.setItem(interpKey, JSON.stringify(srInterpretation));
    } catch { /* ignore */ }

    // Clear session recovery state
    try { localStorage.removeItem(stateKey); } catch { /* ignore */ }

    // Build evidence
    const explorationDepth = Math.min(1, exploreTime / 30);
    const attentionDelta = challengeSolved ? 0.75 : hintsUsed === 0 ? 0.6 : 0.4;
    const curiosityDelta = explorationDepth > 0.5 ? 0.7 : explorationDepth > 0.2 ? 0.5 : 0.3;

    // SR scoring (Stage 4 — activated)
    let srDelta = 0;
    if (srInterpretation.state === 'observed') {
      const d = srInterpretation.dimensions;
      srDelta += d.orientation === 'independent' ? 0.25 : d.orientation === 'guided' ? 0.10 : 0;
      srDelta += d.correction === 'self_corrected' ? 0.20 : 0;
      srDelta += d.relationships === 'accurate' ? 0.15 : d.relationships === 'partial' ? 0.07 : 0;
      srDelta += d.mentalRotation === 'active' ? 0.05 : 0;
      srDelta = Math.min(0.65, srDelta);
    }

    const evidence: Omit<EvidenceItem, 'mission'>[] = [
      { key: 'spatial_reasoning', delta: srDelta },
      { key: 'attention_to_detail', delta: attentionDelta },
      { key: 'curiosity', delta: curiosityDelta },
    ];
    if (elapsedSeconds < 180) evidence.push({ key: 'multitasking_ability', delta: 0.4 });

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
              onOrbitChange={handleOrbitChange}
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
          <div style={{ color: C.grey, fontSize: 12 }}>Exploring for {exploreTime}s</div>
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
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={() => !assembled[c.id] && handleComponentClick(c.id)}
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
                {assembled[c.id] && (
                  <button
                    onClick={() => handleAdjust(c.id)}
                    style={{
                      background: 'transparent',
                      color: C.grey,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      padding: '4px 8px',
                      cursor: 'pointer',
                      fontSize: 11,
                    }}
                  >
                    Adjust
                  </button>
                )}
              </div>
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

          <div style={{ color: C.grey, fontSize: 12 }}>{assembledCount} of {COMPONENT_GROUPS.length} components fitted</div>
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
