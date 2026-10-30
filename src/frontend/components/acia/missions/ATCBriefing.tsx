import { useState, useEffect, useRef } from 'react';

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

export interface WMEvidence {
  briefingVersion: string;
  presentationMode: 'audio+text' | 'text-only';
  responses: Array<{
    questionId: string;
    response: string;
    correct: boolean;
    isUpdateItem: boolean;
    clarificationRequested: boolean;
  }>;
  retentionScore: number;
  updateTrackingScore: number;
  interferenceCount: number;
  clarificationRequested: boolean;
  completedBriefing: boolean;
  completedRecall: boolean;
  elapsedSeconds: number;
}

const BRIEFING_ITEMS = [
  { id: 'b1', text: 'Runway in use: two-eight-right. Surface wind one-zero-zero at eight knots.' },
  { id: 'b2', text: 'Active NOTAM: taxiway Bravo closed for maintenance until further notice.' },
  { id: 'b3', text: 'Approach frequency: one-two-four decimal five.' },
  { id: 'b4', text: 'Traffic advisory: a Cessna one-seven-two is in the circuit, currently on downwind.' },
  { id: 'b5', text: 'Correction — runway in use is now two-six-left. Runway two-eight-right is closed. I say again: runway two-six-left.', isCorrection: true },
  { id: 'b6', text: 'Departure frequency: one-two-one decimal nine. Atis information...', isIncomplete: true },
  { id: 'b7', text: 'Weather: visibility one-zero kilometres, few cloud at three thousand feet, temperature one-four.' },
];

interface Question {
  id: string;
  text: string;
  isUpdateItem: boolean;
  isClarificationItem: boolean;
  checkCorrect: (response: string) => boolean;
  checkInterference: (response: string) => boolean;
}

const QUESTIONS: Question[] = [
  {
    id: 'q1',
    text: 'Which runway is currently in use?',
    isUpdateItem: true,
    isClarificationItem: false,
    checkCorrect: (r) => {
      const v = r.toLowerCase();
      return v.includes('26l') || v.includes('two-six-left') || v.includes('two six left') || v.includes('26 l');
    },
    checkInterference: (r) => {
      const v = r.toLowerCase();
      return v.includes('28r') || v.includes('two-eight-right') || v.includes('two eight right') || v.includes('28 r');
    },
  },
  {
    id: 'q2',
    text: 'What taxiway is closed?',
    isUpdateItem: false,
    isClarificationItem: false,
    checkCorrect: (r) => r.toLowerCase().includes('bravo') || r.toLowerCase().includes('b'),
    checkInterference: () => false,
  },
  {
    id: 'q3',
    text: 'What is the current status of runway 28R?',
    isUpdateItem: true,
    isClarificationItem: false,
    checkCorrect: (r) => {
      const v = r.toLowerCase();
      return v.includes('closed') || v.includes('not in use') || v.includes('unavailable') || v.includes('out of service');
    },
    checkInterference: () => false,
  },
  {
    id: 'q4',
    text: 'What is the approach frequency?',
    isUpdateItem: false,
    isClarificationItem: false,
    checkCorrect: (r) => {
      const v = r.toLowerCase().replace(/\s/g, '');
      return v.includes('124.5') || v.includes('1245') || v.includes('onetwofour');
    },
    checkInterference: () => false,
  },
  {
    id: 'q5',
    text: 'What is the current ATIS information letter?',
    isUpdateItem: false,
    isClarificationItem: true,
    checkCorrect: () => false,
    checkInterference: () => false,
  },
];

type Phase = 'practice' | 'briefing' | 'recall' | 'done';

interface SavedState {
  phase: Phase;
  responses: Record<string, string>;
  clarifications: Record<string, boolean>;
  completedBriefing: boolean;
  savedAt: number;
}

interface Props {
  sessionId?: string;
  onComplete: (wmEvidence: WMEvidence) => void;
}

function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { resolve(); return; }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.88;
    utt.pitch = 0.95;
    utt.onend = () => resolve();
    utt.onerror = () => resolve();
    window.speechSynthesis.speak(utt);
  });
}

export function ATCBriefing({ sessionId, onComplete }: Props) {
  const stateKey = `acia_wm_state_${sessionId ?? 'local'}`;
  const startTime = useRef(Date.now());

  // Restore saved state
  const getSaved = (): SavedState | null => {
    try {
      const raw = localStorage.getItem(stateKey);
      if (!raw) return null;
      const s: SavedState = JSON.parse(raw);
      if (Date.now() - s.savedAt > 4 * 60 * 60 * 1000) return null;
      return s;
    } catch { return null; }
  };

  const saved = getSaved();
  const [phase, setPhase] = useState<Phase>(saved?.phase ?? 'practice');
  const [responses, setResponses] = useState<Record<string, string>>(saved?.responses ?? {});
  const [clarifications, setClarifications] = useState<Record<string, boolean>>(saved?.clarifications ?? {});
  const [completedBriefing, setCompletedBriefing] = useState(saved?.completedBriefing ?? false);

  const [audioEnabled, setAudioEnabled] = useState(true);
  const [presentationMode] = useState<'audio+text' | 'text-only'>(() =>
    typeof window !== 'undefined' && !window.speechSynthesis ? 'text-only' : 'audio+text'
  );

  const [briefingItemIndex, setBriefingItemIndex] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [practiceAnswer, setPracticeAnswer] = useState('');
  const [practiceRevealed, setPracticeRevealed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Save state on changes
  useEffect(() => {
    if (phase === 'done') return;
    try {
      const s: SavedState = { phase, responses, clarifications, completedBriefing, savedAt: Date.now() };
      localStorage.setItem(stateKey, JSON.stringify(s));
    } catch { /* ignore */ }
  }, [phase, responses, clarifications, completedBriefing, stateKey]);

  // Briefing: read items one by one
  useEffect(() => {
    if (phase !== 'briefing') return;
    if (briefingItemIndex >= BRIEFING_ITEMS.length) {
      setTimeout(() => {
        setCompletedBriefing(true);
        setPhase('recall');
      }, 1200);
      return;
    }
    const item = BRIEFING_ITEMS[briefingItemIndex];
    if (audioEnabled && presentationMode === 'audio+text' && window.speechSynthesis) {
      setIsSpeaking(true);
      speak(item.text).then(() => {
        setIsSpeaking(false);
        setTimeout(() => setBriefingItemIndex(i => i + 1), 1500);
      });
    } else {
      setTimeout(() => setBriefingItemIndex(i => i + 1), 2200);
    }
  }, [phase, briefingItemIndex, audioEnabled, presentationMode]);

  function handleStartBriefing() {
    setBriefingItemIndex(0);
    setPhase('briefing');
  }

  function setResponse(qid: string, val: string) {
    setResponses(prev => ({ ...prev, [qid]: val }));
  }

  function setClarification(qid: string, val: boolean) {
    setClarifications(prev => ({ ...prev, [qid]: val }));
  }

  function handleSubmit() {
    if (submitted) return;
    setSubmitted(true);

    const elapsed = Math.round((Date.now() - startTime.current) / 1000);
    const responseArr = QUESTIONS.map(q => {
      const r = responses[q.id] ?? '';
      const clarReq = clarifications[q.id] ?? false;
      const correct = q.isClarificationItem ? false : q.checkCorrect(r);
      const interference = q.checkInterference(r);
      return {
        questionId: q.id,
        response: r,
        correct,
        isUpdateItem: q.isUpdateItem,
        clarificationRequested: clarReq,
        _interference: interference,
      };
    });

    const staticItems = responseArr.filter(r => !r.isUpdateItem && !QUESTIONS.find(q => q.id === r.questionId)?.isClarificationItem);
    const updateItems = responseArr.filter(r => r.isUpdateItem);
    const retentionScore = staticItems.length > 0
      ? staticItems.filter(r => r.correct).length / staticItems.length
      : 0;
    const updateTrackingScore = updateItems.length > 0
      ? updateItems.filter(r => r.correct).length / updateItems.length
      : 0;
    const interferenceCount = responseArr.filter(r => r._interference).length;
    const clarificationRequested = Object.values(clarifications).some(Boolean);

    const evidence: WMEvidence = {
      briefingVersion: 'v1',
      presentationMode: audioEnabled ? presentationMode : 'text-only',
      responses: responseArr.map(({ _interference: _i, ...r }) => r),
      retentionScore,
      updateTrackingScore,
      interferenceCount,
      clarificationRequested,
      completedBriefing,
      completedRecall: true,
      elapsedSeconds: elapsed,
    };

    try { localStorage.removeItem(stateKey); } catch { /* ignore */ }
    onComplete(evidence);
  }

  const allAnswered = QUESTIONS.every(q => {
    if (q.isClarificationItem) return (responses[q.id] ?? '').trim().length > 0 || (clarifications[q.id] ?? false);
    return (responses[q.id] ?? '').trim().length > 0;
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  if (phase === 'practice') {
    return (
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: '#0c1525', border: '1px solid #1a3a5f', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ color: C.blue, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Operational Briefing — How this works
          </div>
          <div style={{ color: C.white, fontSize: 14, lineHeight: 1.7 }}>
            You'll receive a short operational briefing. Afterwards you'll be asked what you remember — <strong>no replay, no notes</strong>. Read or listen carefully the first time.
          </div>
        </div>

        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ color: C.amber, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            Practice Example
          </div>
          <div style={{ fontFamily: 'monospace', color: C.white, fontSize: 13, background: '#07090f', border: '1px solid #1a2a3a', borderRadius: 8, padding: '10px 14px', marginBottom: 12, lineHeight: 1.6 }}>
            "Runway 09 is active. Wind 090 at 12 knots."
          </div>
          <div style={{ color: C.grey, fontSize: 13, marginBottom: 8 }}>Which runway is active?</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={practiceAnswer}
              onChange={e => setPracticeAnswer(e.target.value)}
              disabled={practiceRevealed}
              placeholder="Type your answer…"
              style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, padding: '8px 12px', fontSize: 13 }}
            />
            {!practiceRevealed && (
              <button
                onClick={() => setPracticeRevealed(true)}
                disabled={!practiceAnswer.trim()}
                style={{ background: practiceAnswer.trim() ? `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})` : '#2d1118', color: practiceAnswer.trim() ? 'white' : C.grey, border: 'none', borderRadius: 8, padding: '8px 16px', cursor: practiceAnswer.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}
              >
                Check
              </button>
            )}
          </div>
          {practiceRevealed && (
            <div style={{ marginTop: 8, color: C.green, fontSize: 13 }}>
              ✓ Answer: <strong>09</strong> — correct. The briefing said "Runway 09 is active."
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setAudioEnabled(v => !v)}
            style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 14px', color: C.grey, fontSize: 12, cursor: 'pointer' }}
          >
            {audioEnabled && presentationMode === 'audio+text' ? '🔊 Audio on' : '🔇 Text only'}
          </button>
          <button
            onClick={handleStartBriefing}
            style={{ flex: 1, background: `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`, color: 'white', border: 'none', borderRadius: 12, padding: '13px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
          >
            I'm ready — start the briefing →
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'briefing') {
    const shownItems = BRIEFING_ITEMS.slice(0, briefingItemIndex);
    const allDone = briefingItemIndex >= BRIEFING_ITEMS.length;
    return (
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: '#07090f', border: '1px solid #1a2a3a', borderRadius: 12, padding: 16, minHeight: 220 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ color: C.blue, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
              Operational Briefing
            </div>
            {isSpeaking && (
              <div style={{ color: C.amber, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: C.amber, animation: 'pulse 1s infinite' }} />
                Broadcasting
              </div>
            )}
          </div>
          {shownItems.map((item, i) => (
            <div
              key={item.id}
              style={{
                fontFamily: 'monospace',
                fontSize: 13,
                lineHeight: 1.7,
                color: item.isCorrection ? C.amber : C.white,
                borderLeft: item.isCorrection ? `3px solid ${C.amber}` : '3px solid transparent',
                paddingLeft: item.isCorrection ? 10 : 10,
                marginBottom: 8,
                opacity: i === shownItems.length - 1 ? 1 : 0.75,
              }}
            >
              {item.text}
            </div>
          ))}
          {allDone && (
            <div style={{ color: C.green, fontSize: 13, fontWeight: 600, marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
              Briefing complete — recall begins now.
            </div>
          )}
        </div>
        <div style={{ color: C.grey, fontSize: 12, textAlign: 'center' }}>
          Item {Math.min(briefingItemIndex + 1, BRIEFING_ITEMS.length)} of {BRIEFING_ITEMS.length}
        </div>
      </div>
    );
  }

  if (phase === 'recall') {
    return (
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: '#0c1525', border: '1px solid #1a3a5f', borderRadius: 10, padding: '10px 14px' }}>
          <div style={{ color: C.blue, fontSize: 12, fontWeight: 600 }}>Briefing recall — answer from memory</div>
          <div style={{ color: C.grey, fontSize: 12, marginTop: 2 }}>The briefing is no longer visible. Answer based on what you remember.</div>
        </div>

        {QUESTIONS.map((q, idx) => (
          <div key={q.id} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
            <div style={{ color: C.grey, fontSize: 11, marginBottom: 4 }}>Question {idx + 1} of {QUESTIONS.length}</div>
            <div style={{ color: C.white, fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{q.text}</div>
            {q.isClarificationItem ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={responses[q.id] ?? ''}
                    onChange={e => { setResponse(q.id, e.target.value); setClarification(q.id, false); }}
                    placeholder="Type your answer, or request clarification below…"
                    style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, padding: '9px 12px', fontSize: 13 }}
                  />
                </div>
                <button
                  onClick={() => { setClarification(q.id, true); setResponse(q.id, responses[q.id] ?? ''); }}
                  style={{
                    background: clarifications[q.id] ? '#0f1a0f' : 'transparent',
                    border: `1px solid ${clarifications[q.id] ? C.green : C.border}`,
                    borderRadius: 8,
                    color: clarifications[q.id] ? C.green : C.grey,
                    padding: '8px 14px',
                    cursor: 'pointer',
                    fontSize: 12,
                    alignSelf: 'flex-start',
                  }}
                >
                  {clarifications[q.id] ? '✓ Clarification requested' : 'Request clarification'}
                </button>
              </div>
            ) : (
              <input
                value={responses[q.id] ?? ''}
                onChange={e => setResponse(q.id, e.target.value)}
                placeholder="Type your answer…"
                style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, padding: '9px 12px', fontSize: 13, boxSizing: 'border-box' }}
              />
            )}
          </div>
        ))}

        <button
          onClick={handleSubmit}
          disabled={!allAnswered || submitted}
          style={{
            background: allAnswered && !submitted ? `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})` : '#2d1118',
            color: allAnswered && !submitted ? 'white' : C.grey,
            border: 'none',
            borderRadius: 12,
            padding: '14px',
            cursor: allAnswered && !submitted ? 'pointer' : 'not-allowed',
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          Submit Recall →
        </button>
      </div>
    );
  }

  return null;
}
