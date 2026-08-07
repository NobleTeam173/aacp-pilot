import { useState, useCallback } from 'react';
import type { ACIASession, EvidenceItem, ChatMessage, MissionId } from './types';
import { recordEvidence } from './behaviourEngine';
import { computeAlignments } from './careerEngine';
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

const C = {
  crimson: '#80011f',
  crimsonD: '#5c0116',
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
    currentMissionIndex: 0,
    chatHistory: {},
    missions: [
      { id: 'm1', title: 'AI Aviation Briefing', subtitle: 'Chat with an AI aviation mentor', type: 'ai_chat', estimatedMinutes: 5, completed: false },
      { id: 'm2', title: 'Aircraft Inspection', subtitle: 'Pre-flight walkaround', type: 'inspection', estimatedMinutes: 4, completed: false },
      { id: 'm3', title: 'Fault Investigation', subtitle: 'AME diagnostic scenario', type: 'diagnosis', estimatedMinutes: 4, completed: false },
      { id: 'm4', title: 'Systems Puzzle', subtitle: 'Classify aircraft components', type: 'puzzle', estimatedMinutes: 3, completed: false },
      { id: 'm5', title: 'Instrument Reading', subtitle: 'Interpret cockpit data', type: 'graph', estimatedMinutes: 4, completed: false },
      { id: 'm6', title: 'Operational Decision', subtitle: 'High-stakes scenario choices', type: 'decision', estimatedMinutes: 4, completed: false },
      { id: 'm7', title: 'ATC Communication', subtitle: 'Compose radio transmissions', type: 'atc', estimatedMinutes: 4, completed: false },
      { id: 'm8', title: 'Workload Management', subtitle: 'Priority ranking under pressure', type: 'workload', estimatedMinutes: 3, completed: false },
      { id: 'm9', title: 'Reflection', subtitle: 'Review your aviation journey', type: 'reflection', estimatedMinutes: 4, completed: false },
    ],
  };
}

const MISSION_1_SYSTEM = `You are an experienced aviation career mentor at AACP (Aviation & Aerospace Competency Program). Your role in this opening conversation is to help the participant explore their curiosity about aviation careers.

Ask thoughtful, open-ended questions about what draws them to aviation, what aspects of flying or aerospace interest them most, and what they know about the industry. Be warm, encouraging, and genuinely curious about their perspective. Listen for:
- What they already know vs. what they're curious about
- Whether they're drawn to technical, operational, or STEM aspects
- Their communication style and engagement level

Keep responses concise (2-3 paragraphs max). This is the start of their assessment journey — make it feel exciting and welcoming.`;

const MISSION_9_SYSTEM = `You are a reflective aviation career coach completing a debriefing session with a participant who has just completed the AACP Aviation Career Intelligence Assessment.

Help them reflect on:
- What surprised them most during the assessment
- Which missions felt natural vs. challenging
- What they learned about themselves and aviation careers
- How they might use these insights

Be thoughtful and draw out genuine reflection. This is about helping them understand their own strengths and curiosities, not evaluating them. Keep responses warm, insightful, and encouraging. 2-3 paragraphs max per response.`;

type ViewState = 'welcome' | 'mission' | 'transition' | 'profile';

export function ACIA() {
  const [view, setView] = useState<ViewState>('welcome');
  const [session, setSession] = useState<ACIASession | null>(null);
  const [transitionMsg, setTransitionMsg] = useState('');

  function startAssessment() {
    setSession(makeInitialSession());
    setView('mission');
  }

  function resetAssessment() {
    setSession(null);
    setView('welcome');
  }

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
      } else {
        const nextMission = prev.missions[nextIdx];
        setTransitionMsg(`Mission complete! Next: ${nextMission?.title}`);
        setView('transition');
        setTimeout(() => setView('mission'), 2200);
      }
      return prev;
    });
  }, []);

  if (view === 'welcome') {
    return <WelcomeScreen onStart={startAssessment} />;
  }

  if (view === 'profile' && session) {
    const alignments = computeAlignments(session.evidence);
    // Persist result to backend (fire-and-forget)
    const token = localStorage.getItem('aacp_access_token');
    if (token && alignments.length > 0) {
      fetch('/acia/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          topPathway: alignments[0]?.pathwayId,
          alignments,
        }),
      }).catch(() => {});
    }
    return (
      <div style={{ maxWidth: 720, marginInline: 'auto' }}>
        <ACIACareerProfile alignments={alignments} evidence={session.evidence} onReset={resetAssessment} />
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
        }}>✓</div>
        <div style={{ textAlign: 'center', animation: 'fadeUp 0.4s 0.2s ease both' }}>
          <div style={{ color: C.white, fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
            {transitionMsg}
          </div>
          <div style={{ color: C.grey, fontSize: 13 }}>Loading next mission…</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 6, height: 6, borderRadius: '50%', background: C.crimson,
              animation: `fadeUp 0.4s ${0.3 + i * 0.15}s ease both`,
              opacity: 0,
            }} />
          ))}
        </div>
      </div>
    );
  }

  if (!session) return null;

  const currentMission = session.missions[session.currentMissionIndex];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '220px 1fr',
      gap: 20,
      minHeight: 600,
    }}>
      <ACIAJourneyPanel
        missions={session.missions}
        currentIndex={session.currentMissionIndex}
        startedAt={session.startedAt}
      />
      <div style={{
        background: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${C.border}`,
          background: '#12080d',
        }}>
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
  onComplete: (evidence: Omit<EvidenceItem, 'mission'>[], chatHistory?: ChatMessage[]) => void;
}

function MissionRenderer({ mission, onComplete }: MissionRendererProps) {
  switch (mission.type) {
    case 'ai_chat':
      return (
        <AIMentorChat
          missionId={mission.id as MissionId}
          systemPrompt={MISSION_1_SYSTEM}
          welcomeMessage="Welcome to the AACP Aviation Career Intelligence Assessment! I'm your aviation mentor for this experience. Before we dive into the missions, I'd love to start with a conversation. What's drawing you to aviation? Is there a particular role or aspect of the industry that excites you most?"
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
          systemPrompt={MISSION_9_SYSTEM}
          welcomeMessage="You've completed all the assessment missions — that's a significant achievement! Before we reveal your Career Intelligence Profile, I'd love to debrief with you. What stood out most during the assessment? Were there any missions that felt surprisingly natural, or any that challenged you in unexpected ways?"
          minMessages={3}
          onComplete={(evidence, chat) => onComplete(evidence, chat)}
        />
      );
    default:
      return <div style={{ padding: 20, color: '#94a3b8' }}>Mission type not found.</div>;
  }
}

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <div style={{
      background: 'linear-gradient(160deg, #0f0a0b 0%, #1a0d10 50%, #0f0a0b 100%)',
      borderRadius: 20,
      padding: '40px 32px',
      textAlign: 'center',
      border: `1px solid #3d1020`,
      fontFamily: 'DM Sans, sans-serif',
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 64, height: 64, borderRadius: 18, background: C.crimson,
        fontSize: 28, marginBottom: 20,
      }}>
        ✈️
      </div>
      <h2 style={{
        fontFamily: 'Fraunces, serif',
        fontSize: 'clamp(1.4rem, 2.8vw, 2.2rem)',
        color: '#f1f5f9',
        margin: '0 0 12px',
        fontWeight: 700,
      }}>
        Aviation Career Intelligence Assessment
      </h2>
      <p style={{
        color: '#94a3b8', fontSize: 14, lineHeight: 1.7,
        maxWidth: 520, marginInline: 'auto', marginBottom: 28,
      }}>
        A 9-mission experience designed to reveal your natural fit within the aviation and aerospace industry — through real challenges, not self-ratings.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
        maxWidth: 600,
        marginInline: 'auto',
        marginBottom: 32,
      }}>
        {[
          { icon: '🤖', label: 'AI Mentor Conversations' },
          { icon: '✈️', label: 'Aircraft Inspection' },
          { icon: '🔧', label: 'System Diagnosis' },
          { icon: '📡', label: 'ATC Communication' },
          { icon: '📊', label: 'Instrument Reading' },
          { icon: '⚡', label: 'Workload Management' },
        ].map(({ icon, label }) => (
          <div key={label} style={{
            background: '#1a0d10',
            border: '1px solid #3d1020',
            borderRadius: 12,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <span style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 500, textAlign: 'left' }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 32,
        marginBottom: 32,
        flexWrap: 'wrap',
      }}>
        {[['9', 'Missions'], ['30', 'Min Est.'], ['5', 'Career Pathways']].map(([value, label]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ color: '#f1f5f9', fontSize: 28, fontWeight: 800, fontFamily: 'Fraunces, serif' }}>{value}</div>
            <div style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 20, fontStyle: 'italic' }}>
        Your responses are observed behaviourally. There are no right or wrong answers to chase.
      </div>

      <button
        onClick={onStart}
        style={{
          background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
          color: 'white',
          border: 'none',
          borderRadius: 14,
          padding: '15px 40px',
          fontSize: 16,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'DM Sans, sans-serif',
          letterSpacing: 0.3,
        }}
      >
        Begin Assessment →
      </button>
    </div>
  );
}

