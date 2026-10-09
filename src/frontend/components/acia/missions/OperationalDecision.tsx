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

const RPAS_SCENARIOS: Scenario[] = [
  {
    id: 'rs1',
    domain: 'RPAS Operations — Lost Link',
    context: 'You are conducting a BVLOS (Beyond Visual Line of Sight) pipeline inspection in a rural corridor. Your RPAS has been pre-programmed with a lost-link contingency: RTH (Return to Home) at 60 m AGL if C2 link is lost for more than 10 seconds. Mid-mission, your telemetry drops to zero. The aircraft is 2.1 km out at 55 m AGL. You have no visual contact. It has been 8 seconds since last telemetry.',
    situation: 'The link has not re-established. You have 2 seconds before the automatic RTH triggers. A highway runs between the aircraft\'s current position and your launch point. What do you do?',
    options: [
      {
        label: 'Do nothing — trust the pre-programmed RTH to execute; it was designed for this',
        rationale: 'Correct. The pre-programmed contingency was approved as part of your SFOC/authorization precisely because it handles this scenario. Interfering with an automated safety procedure in progress — especially when you lack the information to improve on it — increases risk, not decreases it.',
        safetyScore: 1.0, decisionScore: 0.9, sitAware: 0.9, assertScore: 0.8,
      },
      {
        label: 'Attempt to manually re-engage control and take over before RTH activates',
        rationale: 'You have no telemetry and are BVLOS. Manual re-engagement without situational awareness of the aircraft\'s current state increases risk of incorrect inputs. Trust the contingency procedure.',
        safetyScore: 0.3, decisionScore: 0.3, sitAware: 0.4, assertScore: 0.5,
      },
      {
        label: 'Immediately notify ATC/FISE of the lost-link event and stand by',
        rationale: 'Notification is important — but it is not your immediate action. Let the automated contingency run. Notification is a parallel or follow-up action after the aircraft is safe, not a substitute for it.',
        safetyScore: 0.5, decisionScore: 0.5, sitAware: 0.6, assertScore: 0.6,
      },
      {
        label: 'Drive toward the aircraft\'s last known position to reestablish visual contact',
        rationale: 'Abandoning your ground station removes your ability to regain control if the link re-establishes. Stay at your control position. Chasing BVLOS aircraft on foot or by vehicle is not an approved contingency.',
        safetyScore: 0.1, decisionScore: 0.1, sitAware: 0.2, assertScore: 0.2,
      },
    ],
    bestIndex: 0,
  },
  {
    id: 'rs2',
    domain: 'RPAS Operations — Client Pressure',
    context: 'You are contracted to fly a rooftop inspection for a property developer in downtown Toronto. Before launch, you check the Nav Canada flight planning tools and identify that the site sits within a 5.6 km radius of Billy Bishop Airport (CYTZ), requiring a RPAS Special Flight Operations Certificate or digital flight authorization. You have neither for this site.',
    situation: 'The client has paid for today\'s shoot and says: "I\'ve already cleared it with the building owner. Just fly lower — no one will know. We need these images today." What do you do?',
    options: [
      {
        label: 'Decline to fly — you do not have the required authorization and cannot obtain it in time today',
        rationale: 'Correct. Operating an RPAS in controlled airspace without authorization is a regulatory violation regardless of client pressure, building owner consent, or altitude flown. The client\'s commercial urgency does not create an exception. Decline clearly, explain the requirement, and offer to rebook with proper authorization in place.',
        safetyScore: 1.0, decisionScore: 1.0, sitAware: 0.9, assertScore: 1.0,
      },
      {
        label: 'Fly at 30 m AGL — below the controlled airspace floor and below RPAS registration requirements',
        rationale: 'This is incorrect. Controlled airspace around CYTZ extends from the surface. Flying at any altitude in this airspace without authorization violates the Canadian Aviation Regulations regardless of altitude or aircraft weight.',
        safetyScore: 0.0, decisionScore: 0.1, sitAware: 0.2, assertScore: 0.2,
      },
      {
        label: 'Try to obtain a digital Nav Canada authorization on-site before flying',
        rationale: 'RPAS flight authorizations near controlled airports cannot always be obtained on-demand, and some locations require an SFOC regardless of authorization portals. If the digital portal grants authorization for the specific location and time, this is acceptable — but only if authorization is confirmed before flight, not as a justification to fly while attempting it.',
        safetyScore: 0.7, decisionScore: 0.7, sitAware: 0.7, assertScore: 0.7,
      },
      {
        label: 'Fly — building owner consent is equivalent to airspace authorization',
        rationale: 'Building owner consent has no bearing on airspace authorization. Airspace is regulated by Transport Canada, not property owners. Consent from a property owner does not permit flight in controlled airspace.',
        safetyScore: 0.0, decisionScore: 0.0, sitAware: 0.1, assertScore: 0.1,
      },
    ],
    bestIndex: 0,
  },
  {
    id: 'rs3',
    domain: 'RPAS Operations — Authority & Team Dynamics',
    context: 'You are a junior RPAS operator on a two-person team conducting a search and rescue support mission in a remote area. Your team lead — who holds the SFOC and is the designated PIC — directs you to deploy into a gully where weather conditions have deteriorated. Winds in the gully are gusting to 38 km/h; your aircraft is rated to 36 km/h sustained. Ground visibility is reducing.',
    situation: 'Your team lead says: "We\'re running out of daylight. Launch now — I need eyes in that gully." What do you do?',
    options: [
      {
        label: 'Launch as directed — the team lead is the PIC and has authority over deployment decisions',
        rationale: 'PIC authority does not override aircraft operating limits. Deploying into conditions that exceed the aircraft\'s wind rating risks loss of the aircraft and adds a recovery problem to the search operation. Compliance is not a defence for operating outside limits.',
        safetyScore: 0.1, decisionScore: 0.1, sitAware: 0.2, assertScore: 0.1,
      },
      {
        label: 'Decline to operate — state clearly that current wind conditions exceed the aircraft\'s operating limit and explain the risk',
        rationale: 'Correct. You are the operator. Declining to operate in conditions outside the aircraft\'s envelope is both your right and your professional obligation. State it factually: "Winds are at 38, aircraft rated to 36 — deploying risks loss of the aircraft." Offer alternatives: reposition to a sheltered launch, wait for conditions to improve, or advise the incident commander of the limitation.',
        safetyScore: 1.0, decisionScore: 1.0, sitAware: 0.9, assertScore: 1.0,
      },
      {
        label: 'Launch but fly slowly and avoid the most exposed areas of the gully',
        rationale: 'Operating outside the aircraft\'s wind rating is a binary limit, not a guideline to work around with technique. Gusts to 38 km/h in an enclosed gully will be higher in turbulent pockets. This approach accepts the risk without justification.',
        safetyScore: 0.2, decisionScore: 0.2, sitAware: 0.3, assertScore: 0.3,
      },
      {
        label: 'Ask the team lead to reduce their request — accept only if they ask for a shorter flight',
        rationale: 'The issue is the wind limit, not the mission duration. Shortening the flight does not change the conditions. The correct intervention is to identify the specific limiting factor and offer a safe alternative or an honest "not tonight" if none exists.',
        safetyScore: 0.4, decisionScore: 0.4, sitAware: 0.4, assertScore: 0.4,
      },
    ],
    bestIndex: 1,
  },
];

interface Props {
  isRpas?: boolean;
  onComplete: (evidence: Omit<EvidenceItem, 'mission'>[]) => void;
}

export function OperationalDecision({ isRpas, onComplete }: Props) {
  return <OperationalDecisionCore scenarios={isRpas ? RPAS_SCENARIOS : SCENARIOS} onComplete={onComplete} />;
}

function OperationalDecisionCore({ scenarios, onComplete }: { scenarios: Scenario[]; onComplete: (evidence: Omit<EvidenceItem, 'mission'>[]) => void }) {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [scores, setScores] = useState({ safety: 0, decision: 0, sitAware: 0, assert: 0, count: 0 });

  const scenario = scenarios[scenarioIdx];
  const isLast = scenarioIdx === scenarios.length - 1;

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
        {scenarios.map((_, i) => (
          <div key={i} style={{
            width: i === scenarioIdx ? 24 : 8, height: 8, borderRadius: 4,
            background: i < scenarioIdx ? C.green : i === scenarioIdx ? C.crimson : C.border,
            transition: 'all 0.2s',
          }} />
        ))}
        <span style={{ color: C.grey, fontSize: 12, marginLeft: 8 }}>
          Scenario {scenarioIdx + 1}/{scenarios.length} — {scenario.domain}
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
