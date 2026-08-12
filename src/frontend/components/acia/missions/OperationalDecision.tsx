import { useState } from 'react';
import type { EvidenceItem } from '../types';

const C = {
  crimson: '#8F0909',
  crimsonD: '#721010',
  bgCard: '#1a0d10',
  border: '#3d1020',
  white: '#f1f5f9',
  grey: '#94a3b8',
  green: '#22c55e',
  amber: '#f59e0b',
};

interface Scenario {
  id: string;
  domain: string;
  context: string;
  situation: string;
  options: {
    label: string;
    rationale: string;
    safetyScore: number;
    decisionScore: number;
    sitAware: number;
    assertScore: number; // leadership/assertiveness signal
  }[];
  bestIndex: number;
}

const SCENARIOS: Scenario[] = [
  {
    id: 's1',
    domain: 'Flight Operations',
    context: 'You are the first officer on a B737 on final approach to Vancouver International (YVR). Weather: 300 ft overcast, RVR 1,200 m. Your aircraft is ILS CAT I certified — regulatory minimums are 200 ft decision height (DH), RVR 550 m.',
    situation: 'At decision height, the captain calls "approach lights in sight" and begins to continue below DH. You are on instruments and have no visual reference. The aircraft is on speed and on glidepath. What is your call?',
    options: [
      {
        label: 'Continue — the captain has visual, and PIC authority overrides your instrument check',
        rationale: 'BOTH crew must independently have the required visual reference at DH for CAT I. If the pilot monitoring has no visual, a go-around is required — PIC authority does not override this regulatory requirement.',
        safetyScore: 0.1, decisionScore: 0.1, sitAware: 0.2, assertScore: 0.1,
      },
      {
        label: 'Call "go around" firmly and clearly — you do not have the required visual reference at DH',
        rationale: 'Correct. At DH both pilots must have visual reference. "Go around" must be called immediately and executed without delay. Your call as pilot monitoring is not a suggestion — it is a safety-critical intervention.',
        safetyScore: 1.0, decisionScore: 1.0, sitAware: 0.9, assertScore: 1.0,
      },
      {
        label: 'Wait one more second below DH — visual may improve as the aircraft descends',
        rationale: 'Continuing flight below DH without required visual reference is a serious regulatory deviation. Hoping for visual to improve below minimums is not a valid option.',
        safetyScore: 0.1, decisionScore: 0.1, sitAware: 0.3, assertScore: 0.2,
      },
      {
        label: 'Ask the captain to confirm the visual before you decide',
        rationale: 'There is no time at DH for dialogue. "Go around" must be immediate. Verbal confirmation of the captain\'s visual comes after the go-around is initiated, not before.',
        safetyScore: 0.4, decisionScore: 0.2, sitAware: 0.4, assertScore: 0.3,
      },
    ],
    bestIndex: 1,
  },
  {
    id: 's2',
    domain: 'Aircraft Maintenance',
    context: 'You are an AME conducting a 100-hour inspection on a Cessna 172 used for flight training. During the post-inspection engine run-up, you observe a right magneto RPM drop of 125 RPM — within the 150 RPM maximum permitted, but at the high end. The aircraft is booked for a student flight in 90 minutes.',
    situation: 'Your chief inspector says: "It\'s within limits — sign it off and get it back on line." What do you do?',
    options: [
      {
        label: 'Sign off the aircraft — it is within the 150 RPM limit and the CI has authority',
        rationale: 'Each licenced AME is personally and legally responsible for their signoffs. A high-end mag drop post-inspection suggests a possible issue (fouled plug, timing drift). Deferring to authority does not relieve your professional obligation.',
        safetyScore: 0.3, decisionScore: 0.3, sitAware: 0.3, assertScore: 0.2,
      },
      {
        label: 'Investigate the high-side magneto before signing — clean or test the plug set, check timing, document findings',
        rationale: 'Correct. A mag drop at the upper limit, especially on a freshly inspected engine, warrants investigation. Clean/test the plug set, verify timing, document findings, then sign off with confidence. This protects the student, the operator, and your licence.',
        safetyScore: 1.0, decisionScore: 0.9, sitAware: 0.8, assertScore: 0.8,
      },
      {
        label: 'Defer to the chief inspector — they have more experience with this aircraft type',
        rationale: 'Personal responsibility cannot be delegated. Each AME who signs a maintenance release is personally accountable for that decision under the Aeronautics Act.',
        safetyScore: 0.2, decisionScore: 0.2, sitAware: 0.2, assertScore: 0.1,
      },
      {
        label: 'Ground the aircraft immediately and write it up as unserviceable without further investigation',
        rationale: 'Grounding without investigation is over-conservative when the reading is within limits. The right approach is to investigate the cause of the high drop, document findings, and then release or ground based on evidence.',
        safetyScore: 0.6, decisionScore: 0.4, sitAware: 0.4, assertScore: 0.5,
      },
    ],
    bestIndex: 1,
  },
  {
    id: 's3',
    domain: 'Maintenance — Authority & Assertiveness',
    context: 'You are a first-year AME apprentice working alongside your licenced AME on a scheduled inspection of a twin-engine commuter aircraft. After completing the horizontal stabilizer attachment inspection, you notice that the required torque seal paint has not been applied to three attachment bolts. The torque wrench was used, but the visual torque verification seal — required by the maintenance manual — was omitted. Your AME is about to sign the inspection off.',
    situation: 'The aircraft pushes back in 25 minutes. When you point it out, your AME says: "I tightened them correctly — the seal is just an admin step. It\'s fine." What do you do?',
    options: [
      {
        label: 'Accept the AME\'s judgment — they are licenced, responsible, and more experienced than you',
        rationale: 'Torque seal is not administrative — it is the documented evidence that correct torque was applied and has not been disturbed. Accepting an explanation that contradicts the maintenance manual is a safety and professional failure, regardless of experience differential.',
        safetyScore: 0.1, decisionScore: 0.1, sitAware: 0.3, assertScore: 0.0,
      },
      {
        label: 'Apply the torque seals yourself before the aircraft is released, without telling the AME',
        rationale: 'Good instinct, wrong execution. Performing maintenance tasks on an aircraft type you are not licensed on — without the licenced AME\'s direction — is itself a maintenance error. The correct approach is to raise the concern so the AME makes the call.',
        safetyScore: 0.5, decisionScore: 0.3, sitAware: 0.5, assertScore: 0.4,
      },
      {
        label: 'Respectfully and directly state: "I understand the torque is correct, but the maintenance manual requires torque seal as evidence — can we take two minutes to apply it before we sign off?"',
        rationale: 'Correct. This is assertiveness without aggression — clear, professional, grounded in the maintenance manual. Speaking up when a procedure is missed, even in the face of authority, is what safe maintenance culture looks like. You raised it; the AME now owns the decision.',
        safetyScore: 1.0, decisionScore: 1.0, sitAware: 0.9, assertScore: 1.0,
      },
      {
        label: 'Go directly to the Director of Maintenance and report the AME for skipping the step',
        rationale: 'Over-escalation for a correctable issue. The correct first step is to raise the concern directly with the AME. Escalating to the Director without first attempting to resolve it directly bypasses appropriate communication and may damage working relationships unnecessarily.',
        safetyScore: 0.6, decisionScore: 0.4, sitAware: 0.6, assertScore: 0.6,
      },
    ],
    bestIndex: 2,
  },
];

interface Props {
  onComplete: (evidence: Omit<EvidenceItem, 'mission'>[]) => void;
}

export function OperationalDecision({ onComplete }: Props) {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [scores, setScores] = useState({ safety: 0, decision: 0, sitAware: 0, assert: 0, count: 0 });

  const scenario = SCENARIOS[scenarioIdx];
  const isLast = scenarioIdx === SCENARIOS.length - 1;

  function confirm() {
    if (selected === null) return;
    setRevealed(true);
    const opt = scenario.options[selected];
    setScores(prev => ({
      safety: prev.safety + opt.safetyScore,
      decision: prev.decision + opt.decisionScore,
      sitAware: prev.sitAware + opt.sitAware,
      assert: prev.assert + opt.assertScore,
      count: prev.count + 1,
    }));
  }

  function next() {
    const opt = scenario.options[selected!];
    const finalScores = {
      safety: scores.safety + (isLast ? 0 : 0),
      decision: scores.decision + (isLast ? 0 : 0),
      sitAware: scores.sitAware + (isLast ? 0 : 0),
      assert: scores.assert + (isLast ? 0 : 0),
      count: scores.count + (isLast ? 0 : 0),
    };

    if (isLast) {
      const n = scores.count + 1;
      const safety = (scores.safety + opt.safetyScore) / n;
      const decision = (scores.decision + opt.decisionScore) / n;
      const sitAware = (scores.sitAware + opt.sitAware) / n;
      const assert = (scores.assert + opt.assertScore) / n;

      const evidence: Omit<EvidenceItem, 'mission'>[] = [
        { key: 'safety_mindset', delta: safety },
        { key: 'decision_quality', delta: decision },
        { key: 'situational_awareness', delta: sitAware },
        { key: 'stress_response', delta: (safety + decision) / 2 },
        { key: 'procedural_compliance', delta: safety > 0.7 ? 0.85 : 0.35 },
        { key: 'communication_quality', delta: assert }, // assertiveness in authority-gradient situations
      ];
      onComplete(evidence);
    } else {
      setScenarioIdx(i => i + 1);
      setSelected(null);
      setRevealed(false);
    }

    void finalScores;
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Progress */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {SCENARIOS.map((_, i) => (
          <div key={i} style={{
            width: i === scenarioIdx ? 24 : 8, height: 8, borderRadius: 4,
            background: i < scenarioIdx ? C.green : i === scenarioIdx ? C.crimson : C.border,
            transition: 'all 0.2s',
          }} />
        ))}
        <span style={{ color: C.grey, fontSize: 12, marginLeft: 8 }}>
          Scenario {scenarioIdx + 1}/{SCENARIOS.length} — {scenario.domain}
        </span>
      </div>

      {/* Context + question */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
        <div style={{
          color: C.grey, fontSize: 12, marginBottom: 12, lineHeight: 1.6,
          borderLeft: `2px solid ${C.border}`, paddingLeft: 12,
        }}>
          {scenario.context}
        </div>
        <div style={{ color: C.white, fontSize: 15, fontWeight: 600, lineHeight: 1.65 }}>
          {scenario.situation}
        </div>
      </div>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {scenario.options.map((opt, i) => {
          const isSelected = selected === i;
          const isBest = i === scenario.bestIndex;
          let bg = C.bgCard;
          let border = C.border;
          let textColor = C.white;
          if (revealed) {
            if (isBest) { bg = '#0f1a0f'; border = '#1a3a1a'; textColor = C.green; }
            else if (isSelected && !isBest) { bg = '#1a0505'; border = '#3a0505'; }
          } else if (isSelected) {
            bg = '#2d1020'; border = C.crimson;
          }
          return (
            <button
              key={i}
              onClick={() => !revealed && setSelected(i)}
              disabled={revealed}
              style={{
                background: bg, border: `1px solid ${border}`, borderRadius: 12,
                padding: '13px 16px', color: textColor, fontSize: 13,
                cursor: revealed ? 'default' : 'pointer', textAlign: 'left', lineHeight: 1.55,
                transition: 'border-color 0.15s',
              }}
            >
              <strong style={{ display: 'block', marginBottom: revealed ? 6 : 0 }}>
                {String.fromCharCode(65 + i)}. {opt.label}
              </strong>
              {revealed && (
                <span style={{ color: C.grey, fontSize: 12 }}>{opt.rationale}</span>
              )}
            </button>
          );
        })}
      </div>

      {!revealed ? (
        <button
          onClick={confirm}
          disabled={selected === null}
          style={{
            background: selected === null ? '#2d1118' : `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
            color: selected === null ? C.grey : 'white',
            border: 'none', borderRadius: 12, padding: '12px',
            cursor: selected === null ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14,
          }}
        >
          Submit Decision
        </button>
      ) : (
        <button
          onClick={next}
          style={{
            background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
            color: 'white', border: 'none', borderRadius: 12, padding: '12px',
            cursor: 'pointer', fontWeight: 700, fontSize: 14,
          }}
        >
          {isLast ? 'Complete Mission →' : 'Next Scenario →'}
        </button>
      )}
    </div>
  );
}
