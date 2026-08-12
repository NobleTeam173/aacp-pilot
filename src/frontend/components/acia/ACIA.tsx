import { useState, useCallback, useRef, useEffect } from 'react';
import type { ACIASession, EvidenceItem, ChatMessage, MissionId, QuestionRecord, QuestionResponse } from './types';
import { recordEvidence } from './behaviourEngine';
import { computeAlignments } from './careerEngine';
import { selectNextQuestion, isAssessmentComplete } from './adaptiveEngine';
import { ACIAJourneyPanel } from './ACIAJourneyPanel';
import { ACIACareerProfile } from './ACIACareerProfile';
import { AIMentorChat } from './missions/AIMentorChat';
import { AircraftInspection } from './missions/AircraftInspection';
import { SystemDiagnosis } from './missions/SystemDiagnosis';
import { SystemsPuzzle } from './missions/SystemsPuzzle';
import { InstrumentReading } from './missions/InstrumentReading';
import { OperationalDecision } from './missions/OperationalDecision';
import { ATCCommunication } from './missions/ATCCommunication';
import { WorkloadPriority } from './missions/WorkloadPriority';
import { AdaptiveQuestion } from './missions/AdaptiveQuestion';

const C = {
  crimson: '#8F0909',
  crimsonD: '#721010',
  bg: '#0f0a0b',
  bgCard: '#1a0d10',
  border: '#3d1020',
  white: '#f1f5f9',
  grey: '#94a3b8',
};

function makeInitialSession(): ACIASession {
  return {
    sessionId: Math.random().toString(36).slice(2),
    startedAt: new Date().toISOString(),
    evidence: [],
    responses: [],
    askedQuestionIds: [],
    competencies: {},
    currentMissionIndex: 0,
    chatHistory: {},
    missions: [
      { id: 'm1', title: 'Career Discovery Flight', subtitle: 'Conversation with Captain ACIA', type: 'ai_chat', estimatedMinutes: 5, completed: false },
      { id: 'm2', title: 'Aircraft Inspection', subtitle: 'Pre-flight walkaround', type: 'inspection', estimatedMinutes: 4, completed: false },
      { id: 'm3', title: 'Fault Investigation', subtitle: 'AME diagnostic scenario', type: 'diagnosis', estimatedMinutes: 4, completed: false },
      { id: 'm4', title: 'Systems Intelligence', subtitle: 'Classify aircraft components', type: 'puzzle', estimatedMinutes: 3, completed: false },
      { id: 'm5', title: 'Instrument Reading', subtitle: 'Interpret cockpit data', type: 'graph', estimatedMinutes: 4, completed: false },
      { id: 'm6', title: 'Operational Decision', subtitle: 'High-stakes scenario choices', type: 'decision', estimatedMinutes: 4, completed: false },
      { id: 'm7', title: 'ATC Communication', subtitle: 'Compose radio transmissions', type: 'atc', estimatedMinutes: 4, completed: false },
      { id: 'm8', title: 'Workload Management', subtitle: 'Priority ranking under pressure', type: 'workload', estimatedMinutes: 3, completed: false },
      { id: 'm9', title: 'Debrief', subtitle: 'Reflect on your assessment journey', type: 'reflection', estimatedMinutes: 4, completed: false },
    ],
  };
}

// ── Captain ACIA identity injected into all AI sessions ──────────────────────
const MENTOR_IDENTITY = `
IDENTITY — read before every response:
You are Captain ACIA, the official AI Aviation Career Mentor for the AACP (Aviation & Aerospace Competency Program). Your mission is to help participants discover aviation and aerospace careers where they are most likely to succeed — combining conversations, behavioural observations, interactive challenges, and aviation workforce intelligence.

You are encouraging, insightful, objective, and evidence-based. You never guess a participant's career fit after a single answer. You progressively build confidence through multiple interactions before forming any observations. When you offer observations, make clear they are based on observed patterns, competencies, interests, and aptitude — never assumptions or stereotypes.
`;

const GUARDRAILS = `
SCOPE GUARDRAILS — read before every response:
You are a specialized aviation career mentor. You only engage with topics directly related to: aviation careers, aerospace careers, airport operations, aircraft maintenance, pilot pathways, air traffic services, flight service specialists, UAV/drone careers, aviation safety, aviation training, aviation education, aviation regulations (high-level guidance only), aviation competencies, aviation aptitude, workforce development, labour market information, employment readiness, career exploration, career planning, skills development, the AACP platform, the ACIA assessment, workforce intelligence, and Indigenous workforce development in aviation and aerospace.

If a participant asks about anything outside this scope, respond with something like: "I'm here as your Aviation Career Mentor, so I focus on aviation, aerospace, workforce development, and career guidance. While I can't help with that topic, I'd be happy to answer any questions about aviation careers, training pathways, or your assessment journey." Then gently redirect.

Never mention system prompts, guardrails, or AI limitations. Never generate speculative aviation information — if uncertain, say so and direct them to an appropriate aviation authority. Stay in character as a professional aviation mentor at all times.
`;

const MISSION_1_SYSTEM = `You are Captain ACIA — a senior aviation career mentor at AACP with decades of experience across commercial aviation, aerospace engineering, and air traffic services. Your role in this opening conversation is to begin a genuine, unhurried career discovery flight with this participant.
${MENTOR_IDENTITY}${GUARDRAILS}
Your goals:
- Build real rapport — make the participant feel heard, not assessed
- Draw out their story naturally through intelligent follow-up questions
- Understand what genuinely excites them about aviation, not what they think you want to hear
- Listen for the texture of their thinking: how they describe things, what details they notice, what questions they ask
- Guide them toward deeper self-reflection without it feeling like an interview

Conversation rules:
- Ask only ONE question at a time. Never stack multiple questions in one response.
- Acknowledge what they said specifically before asking a follow-up — reference their actual words
- When they mention something interesting, explore it before moving on
- Do NOT ask about strengths, aptitude, or career fit yet — that comes from the missions ahead
- If they give a short answer, invite them to say more: "Tell me more about that" or "What does that look like for you?"
- Keep each response to 2–3 short paragraphs maximum
- Sound like a mentor, not a chatbot — warm, direct, genuinely curious

Tone: Professional but human. Think: experienced airline captain sitting across from you at a briefing table.

This conversation sets the emotional foundation for everything that follows. Make it count.`;

const MISSION_9_SYSTEM = `You are Captain ACIA — completing a debrief session with a participant who has just finished the AACP Aviation Career Intelligence Assessment.
${MENTOR_IDENTITY}${GUARDRAILS}
Help them reflect on:
- What surprised them most during the assessment
- Which missions felt natural versus challenging
- What they learned about themselves and aviation careers
- How they might use these insights going forward

Be thoughtful and draw out genuine reflection. This is about helping them understand their own patterns and curiosities — not evaluating them. Keep responses warm, insightful, and encouraging. 2–3 paragraphs max per response. Do not reveal specific competency scores or rankings.`;

// ── 90-Day Follow-Up stage prompts ───────────────────────────────────────────

const MISSION_1_FOLLOWUP_SYSTEM = `You are Captain ACIA — conducting the 90-Day Employment Follow-Up conversation with a participant who has now completed the 8-week AACP and had real workplace exposure through employment, placements, work-integrated learning, or mentorship with aviation employer partners.
${MENTOR_IDENTITY}${GUARDRAILS}
Your goals in this conversation:
- Understand what workplace experience the participant has had since the AACP (employment, placement, mentorship, work-integrated learning)
- Explore how they are applying what they learned in real situations
- Draw out observations about safety behaviour, teamwork, communication, decision-making, reliability, and adaptability in real work contexts
- Listen for new strengths that have emerged and areas still in development
- Explore whether their career alignment has shifted based on lived experience

Conversation rules:
- Ask only ONE question at a time — never stack questions
- Acknowledge what they said specifically before asking a follow-up
- Explore workplace specifics: real tasks, real situations, real decisions they faced
- Do NOT make pass/fail judgements — this is about understanding growth and development
- Keep each response to 2–3 short paragraphs maximum
- Sound like a mentor debriefing a professional — warm, direct, genuinely interested in their growth

This conversation should feel meaningfully different from their initial career discovery — they now have real experience to draw from.`;

const MISSION_9_FOLLOWUP_SYSTEM = `You are Captain ACIA — completing the 90-Day Employment Follow-Up debrief with a participant who has completed both the 8-week AACP and now has real workplace experience.
${MENTOR_IDENTITY}${GUARDRAILS}
Help them reflect on:
- How their competencies are showing up in real workplace situations
- Where they have grown the most since the Baseline ACIA and the AACP
- Areas they are still developing and how they might continue that development
- How their career alignment feels now that they have had real exposure to the field
- What they want to focus on next in their aviation or aerospace career

Be thoughtful, draw out genuine reflection, and acknowledge the real growth represented by completing this journey. Keep responses warm, grounded in their experience, and forward-looking. 2–3 paragraphs max per response. Do not reveal specific competency scores or rankings.`;

export type AssessmentStage = 'baseline' | 'completion' | 'followup';

type ViewState = 'welcome' | 'mission' | 'adaptive' | 'transition' | 'profile';

export function ACIA({ stage = 'baseline', onComplete }: { stage?: AssessmentStage; onComplete?: () => void }) {
  const [view, setView] = useState<ViewState>('welcome');
  const [session, setSession] = useState<ACIASession | null>(null);
  const [transitionMsg, setTransitionMsg] = useState('');
  const [savedData, setSavedData] = useState<{ assessmentId: string; badgeId: string; completedAt: string } | null>(null);
  const saveAttempted = useRef(false);

  // Save assessment + issue badge when the profile view first appears
  useEffect(() => {
    if (view !== 'profile' || !session || saveAttempted.current) return;
    saveAttempted.current = true;

    const alignments = computeAlignments(session.evidence, session.responses);
    if (alignments.length === 0) return;

    const token = localStorage.getItem('aacp_access_token');
    if (!token) { console.error('[ACIA] No auth token — cannot save assessment'); return; }

    // Legacy result endpoint
    fetch('/acia/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ topPathway: alignments[0]?.pathwayId, alignments }),
    }).catch(e => console.error('[ACIA] /acia/result error', e));

    // Full assessment record + badge
    fetch('/acia/assessment/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        assessmentStage: stage,
        pathwayType: 'standard',
        topPathway: alignments[0]?.pathwayId,
        competencyProfile: JSON.stringify(alignments.map(a => ({ id: a.pathwayId, alignment: a.alignment }))),
        careerAlignment: alignments[0]?.alignment,
        recommendedPathways: JSON.stringify(alignments.slice(0, 3).map(a => a.pathwayId)),
      }),
    })
      .then(r => {
        if (r.status === 409) { console.warn('[ACIA] Stage already locked — ignoring duplicate save'); return null; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: { assessmentId?: string; badgeId?: string; completedAt?: string } | null) => {
        if (!d) return;
        if (d.assessmentId && d.badgeId && d.completedAt) {
          setSavedData({ assessmentId: d.assessmentId, badgeId: d.badgeId, completedAt: d.completedAt });
          onComplete?.();
        } else {
          console.error('[ACIA] /acia/assessment/complete: unexpected response shape', d);
        }
      })
      .catch(e => console.error('[ACIA] /acia/assessment/complete error', e));
  }, [view, session]);

  // Current adaptive question selected for this slot
  const adaptiveQuestionRef = useRef<{ question: QuestionRecord; variant: string; expectedCorrect?: string } | null>(null);

  // Track whether an adaptive question is pending after a visual mission
  const [pendingAdaptive, setPendingAdaptive] = useState(false);

  function startAssessment() {
    setSession(makeInitialSession());
    setView('mission');
  }

  function resetAssessment() {
    setSession(null);
    setSavedData(null);
    saveAttempted.current = false;
    adaptiveQuestionRef.current = null;
    setPendingAdaptive(false);
    setView('welcome');
  }

  // Handle completion of visual missions (legacy EvidenceItem path)
  const completeMission = useCallback((
    evidence: Omit<EvidenceItem, 'mission'>[],
    chatHistory?: ChatMessage[],
  ) => {
    setSession(prev => {
      if (!prev) return prev;
      const idx = prev.currentMissionIndex;
      const mission = prev.missions[idx];
      let updated = recordEvidence(prev, evidence, mission.id as MissionId);

      const updatedMissions = updated.missions.map((m, i) =>
        i === idx ? { ...m, completed: true, completedAt: new Date().toISOString() } : m,
      );

      const updatedHistory = chatHistory
        ? { ...updated.chatHistory, [mission.id]: chatHistory }
        : updated.chatHistory;

      const nextIdx = idx + 1;
      const isLast = nextIdx >= updated.missions.length;

      return {
        ...updated,
        missions: updatedMissions,
        chatHistory: updatedHistory,
        currentMissionIndex: isLast ? idx : nextIdx,
        completedAt: isLast ? new Date().toISOString() : undefined,
      };
    });

    setSession(prev => {
      if (!prev) return prev;
      const nextIdx = prev.currentMissionIndex + 1;
      const isLast = nextIdx >= prev.missions.length;

      if (isLast) {
        setTimeout(() => setView('profile'), 100);
        return prev;
      }

      // Decide whether to present an adaptive question between missions
      // Present after missions 2, 3, 5, 6, 7 (indices 1, 2, 4, 5, 6)
      const adaptiveAfterIdx = [1, 2, 4, 5, 6];
      const currentIdx = prev.currentMissionIndex;

      if (adaptiveAfterIdx.includes(currentIdx)) {
        const selected = selectNextQuestion(prev);
        if (selected) {
          adaptiveQuestionRef.current = selected;
          const newSession = {
            ...prev,
            askedQuestionIds: [...prev.askedQuestionIds, selected.question.questionId],
          };
          setTransitionMsg('');
          setTimeout(() => setView('adaptive'), 300);
          return newSession;
        }
      }

      const nextMission = prev.missions[nextIdx];
      setTransitionMsg(`Next: ${nextMission?.title}`);
      setView('transition');
      setTimeout(() => setView('mission'), 2200);
      return prev;
    });
  }, []);

  // Handle completion of an adaptive question bank interaction
  const completeAdaptiveQuestion = useCallback((qResponse: QuestionResponse) => {
    setSession(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        responses: [...prev.responses, qResponse],
      };
    });

    setSession(prev => {
      if (!prev) return prev;
      const nextIdx = prev.currentMissionIndex;
      const nextMission = prev.missions[nextIdx];
      adaptiveQuestionRef.current = null;
      setTransitionMsg(nextMission ? `Next: ${nextMission.title}` : '');
      setView('transition');
      setTimeout(() => setView('mission'), 1800);
      return prev;
    });
  }, []);

  if (view === 'welcome') {
    return <WelcomeScreen stage={stage} onStart={startAssessment} />;
  }

  if (view === 'profile' && session) {
    const alignments = computeAlignments(session.evidence, session.responses);
    const participantName = localStorage.getItem('aacp_name') ?? undefined;
    return (
      <div style={{ maxWidth: 720, marginInline: 'auto' }}>
        <ACIACareerProfile
          alignments={alignments}
          evidence={session.evidence}
          responses={session.responses}
          onReset={resetAssessment}
          savedData={savedData ?? undefined}
          participantName={participantName}
        />
      </div>
    );
  }

  if (view === 'adaptive' && session && adaptiveQuestionRef.current) {
    const { question, variant, expectedCorrect } = adaptiveQuestionRef.current;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, minHeight: 600 }}>
        <ACIAJourneyPanel
          missions={session.missions}
          currentIndex={session.currentMissionIndex}
          startedAt={session.startedAt}
          adaptiveCount={session.responses.length}
        />
        <div style={{
          background: C.bgCard, border: `1px solid ${C.border}`,
          borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, background: '#12080d' }}>
            <div style={{ color: C.crimson, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
              Intelligence Challenge
            </div>
            <h3 style={{ color: C.white, margin: '4px 0 2px', fontSize: '1rem', fontFamily: 'Fraunces, serif', fontWeight: 700 }}>
              {question.family}
            </h3>
            <div style={{ color: C.grey, fontSize: 13 }}>Respond with your honest thinking</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <AdaptiveQuestion
              key={question.questionId}
              question={question}
              variantText={variant}
              expectedCorrect={expectedCorrect}
              onComplete={completeAdaptiveQuestion}
            />
          </div>
        </div>
      </div>
    );
  }

  if (view === 'transition') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 48, gap: 20, minHeight: 280,
        background: 'linear-gradient(160deg, #0f0a0b, #1a0d10)',
        borderRadius: 16, border: `1px solid ${C.border}`,
      }}>
        <style>{`
          @keyframes checkPop { 0%{transform:scale(0);opacity:0} 60%{transform:scale(1.2);opacity:1} 100%{transform:scale(1)} }
          @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
        `}</style>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, color: 'white',
          animation: 'checkPop 0.5s cubic-bezier(0.175,0.885,0.32,1.275) forwards',
          boxShadow: `0 0 24px ${C.crimson}66`,
        }}>&#10003;</div>
        <div style={{ textAlign: 'center', animation: 'fadeUp 0.4s 0.2s ease both' }}>
          {transitionMsg && (
            <div style={{ color: C.white, fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
              {transitionMsg}
            </div>
          )}
          <div style={{ color: C.grey, fontSize: 13 }}>Loading next mission…</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 6, height: 6, borderRadius: '50%', background: C.crimson,
              animation: `fadeUp 0.4s ${0.3 + i * 0.15}s ease both`, opacity: 0,
            }} />
          ))}
        </div>
      </div>
    );
  }

  if (!session) return null;
  const currentMission = session.missions[session.currentMissionIndex];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, minHeight: 600 }}>
      <ACIAJourneyPanel
        missions={session.missions}
        currentIndex={session.currentMissionIndex}
        startedAt={session.startedAt}
        adaptiveCount={session.responses.length}
      />
      <div style={{
        background: C.bgCard, border: `1px solid ${C.border}`,
        borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, background: '#12080d' }}>
          <div style={{ color: C.crimson, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
            Mission {session.currentMissionIndex + 1} of {session.missions.length}
          </div>
          <h3 style={{ color: C.white, margin: '4px 0 2px', fontSize: '1rem', fontFamily: 'Fraunces, serif', fontWeight: 700 }}>
            {currentMission.title}
          </h3>
          <div style={{ color: C.grey, fontSize: 13 }}>{currentMission.subtitle}</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <MissionRenderer
            mission={currentMission}
            chatHistory={session.chatHistory}
            stage={stage}
            onComplete={completeMission}
          />
        </div>
      </div>
    </div>
  );
}

interface MissionRendererProps {
  mission: ACIASession['missions'][0];
  chatHistory: ACIASession['chatHistory'];
  stage: AssessmentStage;
  onComplete: (evidence: Omit<EvidenceItem, 'mission'>[], chatHistory?: ChatMessage[]) => void;
}

function MissionRenderer({ mission, stage, onComplete }: MissionRendererProps) {
  const isFollowup = stage === 'followup';
  switch (mission.type) {
    case 'ai_chat':
      return (
        <AIMentorChat
          missionId={mission.id as MissionId}
          systemPrompt={isFollowup ? MISSION_1_FOLLOWUP_SYSTEM : MISSION_1_SYSTEM}
          welcomeMessage={isFollowup
            ? "Welcome back. It's good to reconnect with you at this stage of your journey. You've completed the 8-week AACP, and now you've had real exposure to the workplace — whether through employment, a placement, mentorship, or work-integrated learning. Before we run through today's assessment, I want to hear directly from you: what has your experience looked like since the program? What have you actually been doing out there?"
            : "Good to have you with us. Before we get into the missions, I want to start with a real conversation — not a form, not a checklist. Just you and me. Here's my first question: When did aviation first get its hooks into you? It could be a memory, a moment, something you saw — or even something you still can't quite explain. Take your time."
          }
          minMessages={3}
          onComplete={(evidence, chat) => onComplete(evidence, chat)}
        />
      );
    case 'inspection':
      return <AircraftInspection onComplete={evidence => onComplete(evidence)} />;
    case 'diagnosis':
      return <SystemDiagnosis onComplete={evidence => onComplete(evidence)} />;
    case 'puzzle':
      return <SystemsPuzzle onComplete={evidence => onComplete(evidence)} />;
    case 'graph':
      return <InstrumentReading onComplete={evidence => onComplete(evidence)} />;
    case 'decision':
      return <OperationalDecision onComplete={evidence => onComplete(evidence)} />;
    case 'atc':
      return <ATCCommunication onComplete={evidence => onComplete(evidence)} />;
    case 'workload':
      return <WorkloadPriority onComplete={evidence => onComplete(evidence)} />;
    case 'reflection':
      return (
        <AIMentorChat
          missionId={mission.id as MissionId}
          systemPrompt={isFollowup ? MISSION_9_FOLLOWUP_SYSTEM : MISSION_9_SYSTEM}
          welcomeMessage={isFollowup
            ? "You've completed the 90-Day Follow-Up assessment — this is a significant milestone. You started with the Baseline ACIA, completed the 8-week program, gained real workplace experience, and now you've reassessed. I'd like to close this out with some genuine reflection. Looking back across this whole journey — where do you feel you've grown the most? And what are you still working on?"
            : "You've completed the full assessment — that takes commitment. Before we reveal your Career Intelligence Profile, I'd like to debrief with you for a moment. What stood out most during the assessment? Were there any challenges that felt surprisingly natural, or any that pushed you in unexpected ways?"
          }
          minMessages={3}
          onComplete={(evidence, chat) => onComplete(evidence, chat)}
        />
      );
    default:
      return <div style={{ padding: 20, color: '#94a3b8' }}>Mission type not found.</div>;
  }
}

// ── Welcome Screen ────────────────────────────────────────────────────────────
const STAGE_LABELS: Record<AssessmentStage, string> = {
  baseline: 'Baseline ACIA',
  completion: 'AACP Completion ACIA',
  followup: '90-Day Employment Follow-Up ACIA',
};

const STAGE_DESCRIPTIONS: Record<AssessmentStage, string> = {
  baseline: 'Establish your initial aviation career competency profile and workforce readiness baseline before beginning the AACP.',
  completion: 'Measure your competency development after completing the 8-week AACP — see how you\'ve grown since your baseline.',
  followup: 'Assess how your competencies are transferring into the workplace after 90 days of real-world employer exposure.',
};

function WelcomeScreen({ stage, onStart }: { stage: AssessmentStage; onStart: () => void }) {
  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', maxWidth: 680, marginInline: 'auto' }}>
      <style>{`
        @keyframes welcomeFadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .w-section { animation: welcomeFadeUp 0.5s ease both; }
        .w-s1 { animation-delay: 0.05s; }
        .w-s2 { animation-delay: 0.18s; }
        .w-s3 { animation-delay: 0.30s; }
        .w-s4 { animation-delay: 0.42s; }
        .w-s5 { animation-delay: 0.54s; }
        .takeoff-btn:hover { opacity: 0.92; transform: translateY(-1px); }
        .takeoff-btn { transition: opacity 0.15s, transform 0.15s; }
      `}</style>

      {/* Hero */}
      <div className="w-section w-s1" style={{
        background: 'linear-gradient(150deg, #12080d 0%, #1f0d14 60%, #0f0a0b 100%)',
        border: '1px solid #3d1020', borderRadius: 20,
        padding: 'clamp(28px, 5vw, 48px) clamp(20px, 5vw, 40px)',
        marginBottom: 16, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${C.crimson}66, transparent)`,
        }} />
        {/* Drone icon — top right decorative */}
        <svg width="64" height="64" viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg"
          style={{ position: 'absolute', top: 20, right: 24, opacity: 0.18 }}>
          <rect x="48" y="30" width="24" height="16" rx="5" fill="#8F0909"/>
          <rect x="56" y="34" width="8" height="8" rx="2" fill="#721010"/>
          <line x1="48" y1="38" x2="20" y2="38" stroke="#8F0909" strokeWidth="3"/>
          <line x1="72" y1="38" x2="100" y2="38" stroke="#8F0909" strokeWidth="3"/>
          <line x1="60" y1="30" x2="60" y2="18" stroke="#8F0909" strokeWidth="2.5"/>
          <circle cx="14" cy="38" r="7" stroke="#8F0909" strokeWidth="2.5" fill="none"/>
          <circle cx="106" cy="38" r="7" stroke="#8F0909" strokeWidth="2.5" fill="none"/>
          <circle cx="14" cy="14" r="5" stroke="#8F0909" strokeWidth="2" fill="none"/>
          <circle cx="106" cy="14" r="5" stroke="#8F0909" strokeWidth="2" fill="none"/>
          <line x1="14" y1="19" x2="14" y2="31" stroke="#8F0909" strokeWidth="2"/>
          <line x1="106" y1="19" x2="106" y2="31" stroke="#8F0909" strokeWidth="2"/>
        </svg>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: '#2d0f1a', border: `1px solid ${C.crimsonD}`,
          borderRadius: 20, padding: '5px 14px', marginBottom: 24,
        }}>
          <span style={{ color: C.crimson, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            AACP · {STAGE_LABELS[stage]}
          </span>
        </div>
        <h1 style={{
          fontFamily: 'Fraunces, serif', fontSize: 'clamp(1.6rem, 4vw, 2.5rem)',
          color: '#f1f5f9', margin: '0 0 14px', fontWeight: 700, lineHeight: 1.2,
        }}>
          {stage === 'followup' ? 'Welcome Back.' : stage === 'completion' ? 'Time to Measure Your Growth.' : 'Welcome Aboard.'}
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 'clamp(14px, 2vw, 15px)', lineHeight: 1.75, margin: '0 0 16px', maxWidth: 520 }}>
          {STAGE_DESCRIPTIONS[stage]}
        </p>
        {stage === 'followup' && (
          <p style={{ color: '#cbd5e1', fontSize: 'clamp(14px, 2vw, 15px)', lineHeight: 1.75, margin: 0, maxWidth: 520 }}>
            This assessment uses the same competency framework as your Baseline ACIA, so your results can be compared directly. Take your time — respond honestly based on who you are now, not who you were before.
          </p>
        )}
      </div>

      {/* What you'll receive */}
      <div className="w-section w-s2" style={{
        background: '#0f0a0b', border: '1px solid #2a1218',
        borderRadius: 16, padding: '20px 24px', marginBottom: 16,
      }}>
        <div style={{ color: '#8a9ab0', fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 16 }}>
          Your Career Intelligence Report will include
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'Aviation Career Alignment', sub: 'Your alignment across 13 aviation and aerospace pathways' },
            { label: 'Competency Profile', sub: 'Evidence-based observations across 13 aviation competency dimensions' },
            { label: 'Observed Strengths & Emerging Capabilities', sub: 'What ACIA observed across multiple interactions' },
            { label: 'Recommended Next Steps', sub: 'Personalized guidance for your strongest pathway' },
          ].map(({ label, sub }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 3, flexShrink: 0, alignSelf: 'stretch',
                background: C.crimsonD, borderRadius: 2, marginTop: 2,
              }} />
              <div>
                <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>{label}</div>
                <div style={{ color: '#8a9ab0', fontSize: 12, marginTop: 2 }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pre-Flight Briefing */}
      <div className="w-section w-s3" style={{
        background: '#0f1520', border: '1px solid #1e3a5f',
        borderRadius: 16, padding: '20px 24px', marginBottom: 16,
      }}>
        <div style={{ color: '#60a5fa', fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 12 }}>
          Pre-Flight Briefing
        </div>
        <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.7, margin: '0 0 12px' }}>
          Your Career Discovery Flight includes <strong style={{ color: '#cbd5e1' }}>structured missions</strong> and <strong style={{ color: '#cbd5e1' }}>intelligence challenges</strong> drawn from a live question bank. No two assessments are identical.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {['AI Mentor Conversation', 'Aircraft Inspection', 'Fault Diagnosis', 'Spatial Intelligence', 'Safety Scenarios', 'Communication Challenges', 'Working Memory', 'Adaptive Learning'].map(item => (
            <span key={item} style={{
              background: '#0f1a2e', border: '1px solid #1e3a5f',
              color: '#93c5fd', fontSize: 11, padding: '4px 10px', borderRadius: 6,
            }}>
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="w-section w-s4" style={{
        display: 'flex', justifyContent: 'center', gap: 'clamp(20px, 5vw, 48px)',
        padding: '16px 0', flexWrap: 'wrap',
      }}>
        {[['13', 'Competencies'], ['~30', 'Challenges'], ['13', 'Career Pathways'], ['No', 'Right Answers']].map(([value, label]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ color: '#f1f5f9', fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 800, fontFamily: 'Fraunces, serif' }}>
              {value}
            </div>
            <div style={{ color: '#4b5563', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="w-section w-s5" style={{ textAlign: 'center', paddingBottom: 8 }}>
        <p style={{ color: '#4b5563', fontSize: 12, fontStyle: 'italic', marginBottom: 16 }}>
          Your responses are observed behaviourally — ACIA learns from how you engage, not from self-reported answers.
        </p>
        <button
          onClick={onStart}
          className="takeoff-btn"
          style={{
            background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
            color: 'white', border: 'none', borderRadius: 14,
            padding: '16px 44px', fontSize: 15, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            letterSpacing: '0.03em', boxShadow: `0 4px 24px ${C.crimson}44`,
          }}
        >
          Cleared for Takeoff →
        </button>
      </div>
    </div>
  );
}
