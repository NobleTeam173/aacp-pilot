import { useState, useEffect, useCallback } from 'react';

const C = {
  crimson: '#8F0909',
  crimsonD: '#721010',
  bg: '#0f0a0b',
  bgCard: '#1a0d10',
  border: '#3d1020',
  white: '#f1f5f9',
  grey: '#94a3b8',
  green: '#22c55e',
};

export interface ReasoningQuestion {
  id: string;
  label: string;
  prompt: string;
  placeholder: string;
  minLength: number;
}

export interface ReasoningResponses {
  [questionId: string]: string;
}

interface Props {
  questions: ReasoningQuestion[];
  storageKey: string;          // localStorage key for persistence — e.g. 'acia_m2_reasoning'
  onComplete: (responses: ReasoningResponses) => void;
  onSave?: (responses: ReasoningResponses) => void;  // optional callback on each save
  disabled?: boolean;
}

// Persist responses without exposing values in component args
function loadSaved(key: string): ReasoningResponses {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistResponses(key: string, data: ReasoningResponses): void {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}

export function MissionReasoningResponse({ questions, storageKey, onComplete, onSave, disabled = false }: Props) {
  const [responses, setResponses] = useState<ReasoningResponses>(() => loadSaved(storageKey));
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Auto-save on every change
  useEffect(() => {
    if (!submitted) {
      persistResponses(storageKey, responses);
      onSave?.(responses);
    }
  }, [responses, storageKey, submitted, onSave]);

  const handleChange = useCallback((id: string, value: string) => {
    if (submitted) return;
    setResponses(prev => ({ ...prev, [id]: value }));
    setTouched(prev => ({ ...prev, [id]: true }));
  }, [submitted]);

  const answered = questions.filter(q => (responses[q.id] ?? '').trim().length >= q.minLength);
  const allAnswered = answered.length === questions.length;

  function handleSubmit() {
    if (!allAnswered || submitted) return;
    setSubmitted(true);
    // Clear saved draft after confirmed submission
    try { localStorage.removeItem(storageKey); } catch {}
    onComplete(responses);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: '#0c1a2e', border: '1px solid #1e3a5f', borderRadius: 12, padding: '10px 16px', color: '#93c5fd', fontSize: 13 }}>
        Take a moment to reflect on what you observed. These questions have no right or wrong answers — share your genuine thoughts.
        Your responses are saved automatically.
      </div>

      {questions.map((q, idx) => {
        const value = responses[q.id] ?? '';
        const isShort = touched[q.id] && value.trim().length > 0 && value.trim().length < q.minLength;
        const isComplete = value.trim().length >= q.minLength;

        return (
          <div key={q.id} style={{ background: C.bgCard, border: `1px solid ${isComplete ? '#1a3a1a' : C.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: isComplete ? C.green : C.border,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, flexShrink: 0,
                color: isComplete ? '#0a1a0a' : C.grey,
              }}>
                {isComplete ? '✓' : idx + 1}
              </div>
              <div style={{ color: C.grey, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {q.label}
              </div>
            </div>

            <p style={{ color: C.white, fontSize: 14, lineHeight: 1.6, margin: '0 0 12px 0' }}>{q.prompt}</p>

            <textarea
              value={value}
              onChange={e => handleChange(q.id, e.target.value)}
              placeholder={q.placeholder}
              disabled={disabled || submitted}
              rows={4}
              aria-label={q.prompt}
              style={{
                width: '100%',
                background: disabled || submitted ? '#111' : '#0f1420',
                border: `1px solid ${isShort ? '#7c3a00' : isComplete ? '#1a3a1a' : '#2d3748'}`,
                borderRadius: 8,
                color: C.white,
                fontSize: 13,
                lineHeight: 1.6,
                padding: '10px 12px',
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                opacity: disabled || submitted ? 0.7 : 1,
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              {isShort && (
                <span style={{ color: '#f59e0b', fontSize: 11 }}>
                  Please share a little more — at least {q.minLength} characters.
                </span>
              )}
              <span style={{ color: C.grey, fontSize: 11, marginLeft: 'auto' }}>
                {value.trim().length} chars
              </span>
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ color: C.grey, fontSize: 12 }}>
          {answered.length}/{questions.length} questions answered
        </div>
        <button
          onClick={handleSubmit}
          disabled={!allAnswered || submitted}
          style={{
            flex: 1,
            background: submitted ? '#1a3a1a' : !allAnswered ? '#2d1118' : `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
            color: submitted ? C.green : !allAnswered ? C.grey : 'white',
            border: 'none',
            borderRadius: 12,
            padding: '13px',
            cursor: !allAnswered || submitted ? 'not-allowed' : 'pointer',
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {submitted ? 'Responses Saved ✓' : !allAnswered ? `Answer all ${questions.length} questions to continue` : 'Save Responses & Complete Mission →'}
        </button>
      </div>
    </div>
  );
}
