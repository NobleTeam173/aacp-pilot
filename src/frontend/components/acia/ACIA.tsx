import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { savePendingCompletion, deletePendingCompletion, getAllPendingCompletions, type PendingCompletion } from '../../utils/aciaStorage';
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
  const now = new Date().toISOString();
  const newSessionId = Math.random().toString(36).slice(2);
  return {
    sessionId: newSessionId,
    startedAt: now,
    evidence: [],
    responses: [],
    askedQuestionIds: [],
    competencies: {},
    currentMissionIndex: 0,
    chatHistory: {},
    sessionRecords: [{
      sessionId: newSessionId,
      startedAt: now,
      isResumption: false,
      missionIndexAtStart: 0,
    }],
    interruptionCount: 0,
    missions: [
      { id: 'm1', title: 'Career Discovery Flight', subtitle: 'Conversation with Captain ACIA', type: 'ai_chat', estimatedMinutes: 5, completed: false },
      { id: 'm2', title: 'Aircraft Inspection', subtitle: 'Pre-flight walkaround', type: 'inspection', estimatedMinutes: 4, completed: false },
      { id: 'm3', title: 'Fault Investigation', subtitle: 'AME diagnostic scenario', type: 'diagnosis', estimatedMinutes: 4, completed: false },
      { id: 'm4', title: 'Systems Intelligence', subtitle: 'Classify aircraft components', type: 'puzzle', estimatedMinutes: 3, completed: false },
      { id: 'm5', title: 'Instrument Reading', subtitle: 'Interpret cockpit data', type: 'graph', estimatedMinutes: 4, completed: false },
      { id: 'm6', title: 'Operational Decision', subtitle: 'High-stakes scenario choices', type: 'decision', estimatedMinutes: 4, completed: false },
      { id: 'm7', title: 'ATC Communication', subtitle: 'Compose radio transmissions', type: 'atc', estimatedMinutes: 4, completed: false },
      { id: 'm8', title: 'Workload Management', subtitle: 'Priority ranking under pressure', type: 'workload', estimatedMinutes: 3, completed: false, oneSitting: true },
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

type ViewState = 'welcome' | 'preamble' | 'mission' | 'adaptive' | 'transition' | 'saving' | 'profile';

const SAVE_KEY = 'aacp_acia_session';

function saveSessionToStorage(session: ACIASession, stage: AssessmentStage) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ session, stage, savedAt: new Date().toISOString() }));
  } catch { /* storage full — ignore */ }
}

function loadSessionFromStorage(): { session: ACIASession; stage: AssessmentStage } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { session: ACIASession; stage: AssessmentStage };
  } catch { return null; }
}

function clearSessionStorage() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

// Neutral mission preamble text — describes what the participant will do without naming competencies
const MISSION_PREAMBLES: Record<string, { what: string; interactions: string; time: string; note?: string }> = {
  'm1': {
    what: 'You will have a conversation with Captain ACIA — an aviation career mentor. Share your background and what draws you to aviation.',
    interactions: '3 or more exchanges',
    time: '~ 5 minutes',
    note: 'There are no right or wrong answers. Respond naturally.',
  },
  'm2': {
    what: 'You will conduct a visual walkaround inspection of a parked aircraft by tapping zones on a diagram. Document any findings you observe.',
    interactions: 'Up to 15 zones to inspect',
    time: '~ 4 minutes',
    note: 'Once submitted, your inspection report cannot be changed.',
  },
  'm3': {
    what: 'You will work through a diagnostic scenario involving an aircraft discrepancy. You will review information and answer a series of questions.',
    interactions: '4 – 6 decision points',
    time: '~ 4 minutes',
    note: 'Each answer is locked once confirmed.',
  },
  'm4': {
    what: 'You will classify a set of aircraft components by dragging them into the correct system categories.',
    interactions: '16 components to classify',
    time: '~ 3 minutes',
    note: 'Hover over any component to see a description.',
  },
  'm5': {
    what: 'You will interpret readings from four aircraft instrument gauges and answer questions about each reading.',
    interactions: '4 instruments',
    time: '~ 4 minutes',
    note: 'Each answer is locked once confirmed. All information needed is provided with each question.',
  },
  'm6': {
    what: 'You will work through a series of aviation-related situations and make decisions using the information provided.',
    interactions: '3 scenarios',
    time: '~ 4 minutes',
    note: 'Each decision is locked once confirmed.',
  },
  'm7': {
    what: 'You will compose radio transmissions and handover messages using scenario information provided to you.',
    interactions: '4 exercises',
    time: '~ 4 minutes',
    note: 'Each exercise is locked once submitted. All information needed is provided in the scenario briefing.',
  },
  'm8': {
    what: 'You will rank a set of operational tasks in order of priority based on the situation described.',
    interactions: '2 rounds',
    time: '~ 3 minutes',
    note: 'Rankings are locked once submitted.',
  },
  'm9': {
    what: 'You will have a closing conversation with Captain ACIA to reflect on your assessment experience.',
    interactions: '3 or more exchanges',
    time: '~ 4 minutes',
    note: 'This is a reflective conversation — there are no correct or incorrect answers.',
  },
};

// Stable UUID-like submission ID — generated once per assessment, survives retries
function generateSubmissionId(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  arr[6] = (arr[6] & 0x0f) | 0x40;
  arr[8] = (arr[8] & 0x3f) | 0x80;
  return [...arr].map((b, i) => ([4, 6, 8, 10].includes(i) ? '-' : '') + b.toString(16).padStart(2, '0')).join('');
}

export function ACIA({ stage = 'baseline', onComplete }: { stage?: AssessmentStage; onComplete?: () => void }) {
  const [view, setView] = useState<ViewState>('welcome');
  const [session, setSession] = useState<ACIASession | null>(null);
  const [transitionMsg, setTransitionMsg] = useState('');
  const [savedData, setSavedData] = useState<{ assessmentId: string; badgeId: string; completedAt: string } | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [saveRetryCount, setSaveRetryCount] = useState(0);
  const saveAttempted = useRef(false);
  // Stable submission ID for this assessment run — used for idempotency + durable recovery
  const submissionId = useRef<string>(generateSubmissionId());
  const [savedSessionData] = useState<{ session: ACIASession; stage: AssessmentStage } | null>(() => {
    const saved = loadSessionFromStorage();
    return saved && saved.stage === stage ? saved : null;
  });

  // Record session end time + mark interruptions when page unloads mid-assessment
  useEffect(() => {
    function handleUnload() {
      if (!session || view === 'profile' || view === 'welcome') return;
      const now = new Date().toISOString();
      // Close the most recent open session record
      const updatedRecords = session.sessionRecords.map((r, i) =>
        i === session.sessionRecords.length - 1 && !r.endedAt ? { ...r, endedAt: now } : r,
      );
      // Mark any in-progress mission as interrupted
      const currentMission = session.missions[session.currentMissionIndex];
      const inMission = view === 'mission' && currentMission && !currentMission.completed;
      const updatedMissions = inMission
        ? session.missions.map((m, i) =>
            i === session.currentMissionIndex ? { ...m, interrupted: true } : m,
          )
        : session.missions;

      const snapshot: ACIASession = {
        ...session,
        sessionRecords: updatedRecords,
        missions: updatedMissions,
        interruptionCount: inMission ? session.interruptionCount + 1 : session.interruptionCount,
      };
      saveSessionToStorage(snapshot, stage);
    }

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [session, view, stage]);

  // Build completion payload from current session (memoized to avoid stale closure issues)
  const buildPayload = useCallback((sess: ACIASession) => {
    const alignments = computeAlignments(sess.evidence, sess.responses);
    const competencyProfile: Record<string, { state: string; evidenceLevel: string; confidence: string }> = {};
    for (const [compId, obs] of Object.entries(sess.competencies)) {
      if (obs) competencyProfile[compId] = { state: obs.state, evidenceLevel: obs.state, confidence: obs.confidence };
    }
    return {
      submissionId: submissionId.current,
      assessmentStage: stage,
      pathwayType: 'standard',
      topPathway: alignments[0]?.pathwayId ?? null,
      competencyProfile,
      careerAlignment: alignments.map(a => ({ pathway: a.pathwayId, alignment: a.alignment, label: a.label ?? a.pathwayId })),
      recommendedPathways: alignments.slice(0, 3).map(a => a.pathwayId),
      startedAt: sess.startedAt,
      participantName: sess.participantName ?? localStorage.getItem('aacp_name') ?? undefined,
    };
  }, [stage]);

  // Core save function — returns true on success, false on failure
  const performSave = useCallback(async (payload: Record<string, unknown>, attemptNum: number): Promise<boolean> => {
    const token = localStorage.getItem('aacp_access_token');
    if (!token) { console.error('[ACIA] No auth token'); return false; }
    try {
      const r = await fetch('/acia/assessment/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!r.ok && r.status !== 200 && r.status !== 201) throw new Error(`HTTP ${r.status}`);
      const d: { assessmentId?: string; badgeId?: string; completedAt?: string } = await r.json();
      if (d.assessmentId) {
        setSavedData({ assessmentId: d.assessmentId, badgeId: d.badgeId ?? '', completedAt: d.completedAt ?? new Date().toISOString() });
        setSaveError(false);
        // Confirmed — clear durable recovery payload
        await deletePendingCompletion(submissionId.current);
        return true;
      }
      throw new Error('Unexpected response shape');
    } catch (e) {
      console.error(`[ACIA] save attempt ${attemptNum} failed:`, e);
      return false;
    }
  }, []);

  // Trigger save when entering 'saving' view — with up to 5 attempts + durable recovery
  useEffect(() => {
    if (view !== 'saving' || !session || saveAttempted.current) return;
    saveAttempted.current = true;
    clearSessionStorage();

    const payload = buildPayload(session);

    // Persist payload to IndexedDB so it survives a refresh
    savePendingCompletion({
      submissionId: submissionId.current,
      stage,
      payload,
      savedAt: new Date().toISOString(),
      attemptCount: 0,
    });

    const run = async () => {
      for (let attempt = 1; attempt <= 5; attempt++) {
        setSaveRetryCount(attempt - 1);
        const ok = await performSave(payload, attempt);
        if (ok) {
          setView('profile');
          return;
        }
        if (attempt < 5) {
          await new Promise(r => setTimeout(r, Math.min(3000 * attempt, 15000)));
        }
      }
      // All attempts exhausted — stay on saving view, show error with manual retry
      setSaveError(true);
    };
    run();
  }, [view, session, buildPayload, performSave, stage]);

  // On mount: check IndexedDB for unsubmitted payloads from a prior page load
  // (handles browser close/reopen during save window)
  useEffect(() => {
    if (view !== 'welcome') return;
    getAllPendingCompletions().then(async (pending) => {
      const token = localStorage.getItem('aacp_access_token');
      if (!pending.length || !token) return;
      for (const entry of pending) {
        // First verify the server doesn't already have this (idempotent check)
        try {
          const r = await fetch('/acia/assessment/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(entry.payload),
          });
          if (r.ok || r.status === 200 || r.status === 201) {
            const d = await r.json();
            if (d.assessmentId) {
              await deletePendingCompletion(entry.submissionId);
              console.log('[ACIA] Recovered pending completion from prior session:', entry.submissionId);
            }
          }
        } catch {}
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Manual retry handler (shown in saving view when all auto-retries fail)
  const handleManualRetry = useCallback(async () => {
    if (!session) return;
    setSaveError(false);
    setSaveRetryCount(0);
    saveAttempted.current = false;
    // Re-trigger the saving effect
    setView('welcome');
    setTimeout(() => setView('saving'), 50);
  }, [session]);

  // Current adaptive question selected for this slot
  const adaptiveQuestionRef = useRef<{ question: QuestionRecord; variant: string; expectedCorrect?: string } | null>(null);

  // Track whether an adaptive question is pending after a visual mission
  const [pendingAdaptive, setPendingAdaptive] = useState(false);

  function startAssessment(resume = false) {
    if (resume) {
      const saved = loadSessionFromStorage();
      if (saved && saved.stage === stage) {
        const now = new Date().toISOString();
        const newBrowserSessionId = Math.random().toString(36).slice(2);
        const resumedSession: ACIASession = {
          ...saved.session,
          sessionRecords: [
            ...(saved.session.sessionRecords ?? []),
            {
              sessionId: newBrowserSessionId,
              startedAt: now,
              isResumption: true,
              missionIndexAtStart: saved.session.currentMissionIndex,
            },
          ],
        };
        setSession(resumedSession);
        saveSessionToStorage(resumedSession, stage);
        setView('preamble');
        return;
      }
    }
    clearSessionStorage();
    const newSession = makeInitialSession();
    setSession(newSession);
    saveSessionToStorage(newSession, stage);
    // Mission 1 starts immediately — the welcome screen already briefed the participant.
    // Subsequent missions show the preamble so participants can prepare.
    setView('mission');
  }

  function resetAssessment() {
    clearSessionStorage();
    setSession(null);
    setSavedData(null);
    setSaveError(false);
    setSaveRetryCount(0);
    saveAttempted.current = false;
    submissionId.current = generateSubmissionId();
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

      const completedAt = new Date().toISOString();
      const startedAt = updated.missions[idx].startedAt;
      const durationMs = startedAt ? Date.now() - new Date(startedAt).getTime() : undefined;
      const updatedMissions = updated.missions.map((m, i) =>
        i === idx ? { ...m, completed: true, completedAt, durationMs, interrupted: false } : m,
      );

      const updatedHistory = chatHistory
        ? { ...updated.chatHistory, [mission.id]: chatHistory }
        : updated.chatHistory;

      const nextIdx = idx + 1;
      const isLast = nextIdx >= updated.missions.length;

      const nextSession = {
        ...updated,
        missions: updatedMissions,
        chatHistory: updatedHistory,
        currentMissionIndex: isLast ? idx : nextIdx,
        completedAt: isLast ? new Date().toISOString() : undefined,
      };

      // Auto-save progress after each mission
      if (!isLast) saveSessionToStorage(nextSession, stage);

      // Checkpoint to server after each completed mission
      const token = localStorage.getItem('aacp_access_token');
      if (token) {
        const cpProfile: Record<string, string> = {};
        for (const [k, v] of Object.entries(nextSession.competencies)) {
          if (v) cpProfile[k] = v.state;
        }
        fetch('/acia/checkpoint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            submissionId: submissionId.current,
            assessmentStage: stage,
            missionId: mission.id,
            missionIndex: idx,
            competencySnapshot: cpProfile,
            evidenceCount: nextSession.evidence.length,
            responseCount: nextSession.responses.length,
          }),
        }).catch(() => {});
      }

      return nextSession;
    });

    setSession(prev => {
      if (!prev) return prev;
      const nextIdx = prev.currentMissionIndex + 1;
      const isLast = nextIdx >= prev.missions.length;

      if (isLast) {
        // Route to 'saving' view — profile only appears after server confirms persistence
        setTimeout(() => setView('saving'), 100);
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
      setTimeout(() => setView('preamble'), 2200);
      return prev;
    });
  }, [stage]);

  // Handle completion of an adaptive question bank interaction
  const completeAdaptiveQuestion = useCallback((qResponse: QuestionResponse) => {
    setSession(prev => {
      if (!prev) return prev;
      const next = {
        ...prev,
        responses: [...prev.responses, qResponse],
      };
      saveSessionToStorage(next, stage);
      return next;
    });

    setSession(prev => {
      if (!prev) return prev;
      const nextIdx = prev.currentMissionIndex;
      const nextMission = prev.missions[nextIdx];
      adaptiveQuestionRef.current = null;
      setTransitionMsg(nextMission ? `Next: ${nextMission.title}` : '');
      setView('transition');
      setTimeout(() => setView('preamble'), 1800);
      return prev;
    });
  }, [stage]);

  if (view === 'welcome') {
    return <WelcomeScreen stage={stage} onStart={startAssessment} savedSessionData={savedSessionData} />;
  }

  if (view === 'preamble' && session) {
    return (
      <MissionPreamble
        session={session}
        stage={stage}
        onBegin={() => {
          setSession(prev => {
            if (!prev) return prev;
            const idx = prev.currentMissionIndex;
            const now = new Date().toISOString();
            const updated = {
              ...prev,
              missions: prev.missions.map((m, i) =>
                i === idx && !m.startedAt ? { ...m, startedAt: now } : m,
              ),
            };
            saveSessionToStorage(updated, stage);
            return updated;
          });
          setView('mission');
        }}
      />
    );
  }

  if (view === 'saving') {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '48px 24px', textAlign: 'center' }}>
        <style>{`
          @keyframes acia-pulse { 0%,100%{opacity:0.4;transform:scale(0.95)} 50%{opacity:1;transform:scale(1.05)} }
          @keyframes acia-spin { to{transform:rotate(360deg)} }
        `}</style>
        {!saveError ? (
          <>
            <div style={{ width: 56, height: 56, borderRadius: '50%', border: `3px solid ${C.crimson}`, borderTopColor: 'transparent', animation: 'acia-spin 1s linear infinite' }} />
            <div>
              <div style={{ color: C.white, fontSize: 18, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                Saving Your Career Intelligence
              </div>
              <div style={{ color: C.grey, fontSize: 13 }}>
                {saveRetryCount === 0 ? 'Securing your assessment results…' : `Retrying… (attempt ${saveRetryCount + 1} of 5)`}
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#2d1010', border: `2px solid ${C.crimson}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>⚠</div>
            <div>
              <div style={{ color: C.white, fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
                We're Having Trouble Saving
              </div>
              <div style={{ color: C.grey, fontSize: 14, maxWidth: 420, lineHeight: 1.6, marginBottom: 24 }}>
                We couldn't save your Career Intelligence right now. Your responses have been preserved. Please keep this page open while we retry, or tap below to try again.
              </div>
              <button
                onClick={handleManualRetry}
                style={{ background: C.crimson, color: '#fff', border: 'none', borderRadius: 8, padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}
              >
                Retry Save
              </button>
            </div>
          </>
        )}
      </div>
    );
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
          onDone={onComplete}
          savedData={savedData ?? undefined}
          participantName={participantName}
          stage={stage}
        />
      </div>
    );
  }

  if (view === 'adaptive' && session && adaptiveQuestionRef.current) {
    const { question, variant, expectedCorrect } = adaptiveQuestionRef.current;
    return (
      <div className="acia-layout">
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
              Intelligence Challenge
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
    <div className="acia-layout">
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

// ── Mission Preamble Screen ───────────────────────────────────────────────────
function MissionPreamble({
  session,
  stage,
  onBegin,
}: {
  session: ACIASession;
  stage: AssessmentStage;
  onBegin: () => void;
}) {
  const [oneSittingConfirmed, setOneSittingConfirmed] = useState(false);
  const currentMission = session.missions[session.currentMissionIndex];
  const preamble = MISSION_PREAMBLES[currentMission.id];
  const needsConfirmation = currentMission.oneSitting && !oneSittingConfirmed;

  return (
    <div className="acia-layout">
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 28, gap: 20 }}>
          {/* Standard briefing card */}
          <div style={{ background: '#0f1520', border: '1px solid #1e3a5f', borderRadius: 14, padding: '18px 22px' }}>
            <div style={{ color: '#60a5fa', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              Mission Briefing
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ color: C.white, fontSize: 14, lineHeight: 1.7, margin: 0 }}>
                {preamble?.what ?? 'You will work through a series of aviation-related situations and make decisions using the information provided.'}
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {preamble?.interactions && (
                  <div style={{ background: '#0a0f1e', borderRadius: 8, padding: '7px 13px', fontSize: 12, color: '#93c5fd' }}>
                    <span style={{ color: '#64748b' }}>Interactions: </span>{preamble.interactions}
                  </div>
                )}
                {preamble?.time && (
                  <div style={{ background: '#0a0f1e', borderRadius: 8, padding: '7px 13px', fontSize: 12, color: '#93c5fd' }}>
                    <span style={{ color: '#64748b' }}>Estimated time: </span>{preamble.time}
                  </div>
                )}
              </div>
              {preamble?.note && !currentMission.oneSitting && (
                <p style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.6, margin: 0, fontStyle: 'italic' }}>{preamble.note}</p>
              )}
            </div>
          </div>

          {/* One-sitting notice — only for designated missions */}
          {currentMission.oneSitting && (
            <div style={{ background: '#1a1200', border: '1px solid #3a2800', borderRadius: 14, padding: '18px 22px' }}>
              <div style={{ color: '#f59e0b', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                Complete this mission in one sitting once started
              </div>
              <p style={{ color: '#fde68a', fontSize: 13, lineHeight: 1.7, margin: '0 0 12px' }}>
                This mission is designed to be completed without interruption. Once you begin, please stay with it until the end — it takes approximately {currentMission.estimatedMinutes} minutes.
              </p>
              <p style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.6, margin: '0 0 14px' }}>
                If your session is interrupted unexpectedly, any responses you have already submitted will be preserved and the interruption will be recorded.
              </p>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={oneSittingConfirmed}
                  onChange={e => setOneSittingConfirmed(e.target.checked)}
                  style={{ marginTop: 2, accentColor: C.crimson, width: 16, height: 16, flexShrink: 0 }}
                />
                <span style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.55 }}>
                  I have approximately {currentMission.estimatedMinutes} minutes available and I am ready to begin this mission now.
                </span>
              </label>
            </div>
          )}

          <button
            onClick={onBegin}
            disabled={needsConfirmation}
            style={{
              background: needsConfirmation ? '#2d1118' : `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
              color: needsConfirmation ? C.grey : 'white',
              border: 'none', borderRadius: 12,
              padding: '14px 32px', fontSize: 15, fontWeight: 700,
              cursor: needsConfirmation ? 'not-allowed' : 'pointer',
              alignSelf: 'flex-start',
              transition: 'background 0.2s',
            }}
          >
            {needsConfirmation ? 'Confirm readiness above to continue' : 'Begin Mission →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Welcome Screen ────────────────────────────────────────────────────────────
const STAGE_LABELS: Record<AssessmentStage, string> = {
  baseline: 'Baseline ACIA',
  completion: 'AACP Completion ACIA',
  followup: '90-Day Employment Follow-Up ACIA',
};

function WelcomeScreen({
  stage,
  onStart,
  savedSessionData,
}: {
  stage: AssessmentStage;
  onStart: (resume?: boolean) => void;
  savedSessionData: { session: ACIASession; stage: AssessmentStage } | null;
}) {
  const isFirstCareer = (() => {
    const cs = localStorage.getItem('aacp_career_stage') ?? '';
    return cs !== 'student' && cs !== 'transition' &&
      cs !== 'aviation_professional' && cs !== 'intl_aviation_professional';
  })();

  const hasProgress = savedSessionData !== null;
  const savedMissions = savedSessionData?.session.missions ?? [];
  const completedMissions = savedMissions.filter(m => m.completed);
  const nextMission = savedMissions.find(m => !m.completed);
  const lastCompleted = completedMissions.at(-1);
  const totalMissions = savedMissions.length || 9;
  const completedCount = completedMissions.length;
  const progressPct = hasProgress ? Math.round((completedCount / totalMissions) * 100) : 0;

  const isFollowup = stage === 'followup';
  const isCompletion = stage === 'completion';

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', maxWidth: 720, marginInline: 'auto' }}>
      <style>{`
        @keyframes aciaFadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .acia-card { animation: aciaFadeUp 0.4s ease both; }
        .acia-cta { transition: background 0.15s, box-shadow 0.15s; }
        .acia-layout { display: grid; grid-template-columns: 220px 1fr; gap: 20px; min-height: 600px; }
        @media (max-width: 700px) {
          .acia-layout { grid-template-columns: 1fr; }
          .acia-journey-panel { display: none; }
        }
        .acia-cta:hover { background: #721010 !important; box-shadow: 0 4px 16px rgba(143,9,9,0.25) !important; }
      `}</style>

      {/* Single Mission Control card */}
      <div className="acia-card" style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
      }}>
        {/* Card header */}
        <div style={{
          padding: '20px 28px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
        }}>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: '#8F0909', marginBottom: 6,
            }}>
              AACP™ · {STAGE_LABELS[stage]}
            </div>
            <h2 style={{
              fontFamily: 'Fraunces, serif', fontSize: '1.2rem',
              fontWeight: 700, color: '#1e293b', margin: 0, lineHeight: 1.3,
            }}>
              ACIA™ — Career Discovery Flight
            </h2>
          </div>
          {hasProgress && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{
                fontSize: 26, fontWeight: 800, color: '#1e293b',
                fontFamily: 'Fraunces, serif', lineHeight: 1,
              }}>
                {completedCount}/{totalMissions}
              </div>
              <div style={{
                fontSize: 10, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: '#94a3b8', marginTop: 3,
              }}>
                Missions Complete
              </div>
            </div>
          )}
        </div>

        {/* Card body */}
        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* Purpose statement */}
          <div>
            <p style={{ fontSize: 15, color: '#1e293b', fontWeight: 500, lineHeight: 1.65, margin: '0 0 10px' }}>
              Explore how you naturally approach aviation and aerospace situations.
            </p>
            {isFirstCareer ? (
              <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.7, margin: 0 }}>
                No previous aviation or aerospace experience is required. Your responses will help AACP build evidence around your strengths and identify career pathways that may align with how you approach different situations. There are no pass or fail results.
              </p>
            ) : isFollowup ? (
              <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.7, margin: 0 }}>
                This assessment uses the same competency framework as your Baseline ACIA. Respond based on who you are now, drawing on your real workplace experience. Your responses contribute to your evolving competency and career intelligence profile.
              </p>
            ) : (
              <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.7, margin: 0 }}>
                Your responses contribute to your evolving competency and career intelligence profile.
              </p>
            )}
          </div>

          {/* Policy chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              'Progress Automatically Saved',
              'Submitted Responses Locked',
              'No Pass or Fail',
            ].map(label => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 6, padding: '5px 12px', fontSize: 12, color: '#475569',
              }}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="5.5" stroke="#16a34a" strokeWidth="1"/>
                  <path d="M3.5 6l1.8 1.8L8.5 4" stroke="#16a34a" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {label}
              </div>
            ))}
          </div>

          {/* Progress panel — in-progress only */}
          {hasProgress && (
            <div style={{
              background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: 12, padding: '18px 20px',
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.09em', color: '#8F0909', marginBottom: 14,
              }}>
                Assessment in Progress
              </div>
              {/* Progress bar */}
              <div style={{ height: 4, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{
                  height: '100%', width: `${progressPct}%`,
                  background: '#8F0909', borderRadius: 4, transition: 'width 0.5s ease',
                }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {lastCompleted && (
                  <div>
                    <div style={{
                      fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em',
                      color: '#94a3b8', marginBottom: 5,
                    }}>
                      Last Completed
                    </div>
                    <div style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>
                      {lastCompleted.title}
                    </div>
                  </div>
                )}
                {nextMission && (
                  <div>
                    <div style={{
                      fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em',
                      color: '#94a3b8', marginBottom: 5,
                    }}>
                      Up Next
                    </div>
                    <div style={{ fontSize: 13, color: '#8F0909', fontWeight: 600 }}>
                      {nextMission.title}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* What you'll receive — fresh start only */}
          {!hasProgress && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.09em', color: '#94a3b8',
              }}>
                Your Career Intelligence Report will include
              </div>
              {[
                { label: 'Aviation Career Alignment', sub: 'Your alignment across 13 aviation and aerospace pathways' },
                { label: 'Competency Evidence Profile', sub: 'Evidence-based observations across 13 competency dimensions' },
                { label: 'Observed Strengths and Emerging Capabilities', sub: 'Built from multiple interactions across the assessment' },
                { label: 'Recommended Next Steps', sub: 'Personalised guidance for your strongest career pathways' },
              ].map(({ label, sub }) => (
                <div key={label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 3, flexShrink: 0, alignSelf: 'stretch',
                    background: '#8F0909', borderRadius: 2, marginTop: 3,
                  }} />
                  <div>
                    <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{sub}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Save notice + CTA */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.65, margin: 0 }}>
              Your progress is saved automatically. You may leave and return later. Once you submit a response, it cannot be changed. Some short missions may need to be completed in one sitting — we will let you know before they begin.
            </p>
            <button
              onClick={() => onStart(hasProgress)}
              className="acia-cta"
              style={{
                display: 'inline-block',
                background: '#8F0909',
                color: 'white',
                border: 'none',
                borderRadius: 10,
                padding: '14px 32px',
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '0.02em',
                alignSelf: 'flex-start',
                fontFamily: 'DM Sans, sans-serif',
                boxShadow: '0 2px 8px rgba(143,9,9,0.18)',
              }}
            >
              {hasProgress ? 'Resume Assessment' : 'Begin Career Discovery Flight'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
