import { useState, useRef } from 'react';
import type { QuestionRecord, QuestionResponse } from '../types';
import { buildClassificationPrompt, buildQuestionResponse } from '../evidenceEngine';

const C = {
  crimson: '#8F0909',
  crimsonD: '#721010',
  bg: '#0f0a0b',
  bgCard: '#1a0d10',
  bgDeep: '#12080d',
  border: '#3d1020',
  borderLight: '#5a1a2d',
  white: '#f1f5f9',
  grey: '#94a3b8',
  greyD: '#64748b',
};

interface Props {
  question: QuestionRecord;
  variantText: string;
  expectedCorrect?: string;
  onComplete: (response: QuestionResponse) => void;
}

export function AdaptiveQuestion({ question, variantText, expectedCorrect, onComplete }: Props) {
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [mentorAck, setMentorAck] = useState('');
  const [error, setError] = useState('');
  const startTimeRef = useRef(Date.now());

  const isMemoryQuestion = question.interactionType === 'memory_recall';
  const minLength = question.difficulty >= 3 ? 40 : 20;
  const canSubmit = response.trim().length >= minLength && !submitting && !submitted;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');

    const responseTimeMs = Date.now() - startTimeRef.current;

    try {
      const token = localStorage.getItem('aacp_access_token');

      // Step 1: Classify response against rubric using AI
      const classifyPrompt = buildClassificationPrompt(question, variantText, response.trim(), expectedCorrect);
      const classifyRes = await fetch('/acia/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          systemPrompt: classifyPrompt,
          messages: [{ role: 'user', content: 'Classify this response against the indicators.' }],
        }),
      });

      let detectedIndicators: string[] = [];
      if (classifyRes.ok) {
        const data = await classifyRes.json() as { reply?: string };
        if (data.reply) {
          try {
            const jsonMatch = data.reply.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]) as { detected?: string[] };
              detectedIndicators = parsed.detected ?? [];
            }
          } catch {
            // Fallback: all indicators detected (generous)
            detectedIndicators = question.evidenceRubric
              .filter(r => r.positive)
              .map(r => r.indicator);
          }
        }
      }

      // Step 2: Get a mentor acknowledgement (brief, non-evaluative)
      const ackMessages = [
        "Noted. Let's continue with the next challenge.",
        "Interesting approach. I'll factor that into the broader picture.",
        "Good. Let's keep moving.",
        "I noticed the way you worked through that. Let's try the next one.",
        "That tells me something useful. On to the next mission.",
      ];
      setMentorAck(ackMessages[Math.floor(Math.random() * ackMessages.length)]);
      setSubmitted(true);

      const qResponse = buildQuestionResponse(
        question,
        variantText,
        response.trim(),
        detectedIndicators,
        responseTimeMs,
      );

      // Brief pause to show acknowledgement
      setTimeout(() => onComplete(qResponse), 1800);

    } catch {
      setError('Connection error. Please try again.');
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{
          background: '#1a0d10', border: `1px solid ${C.borderLight}`,
          borderRadius: 14, padding: '18px 20px',
        }}>
          <div style={{ color: C.grey, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Captain ACIA
          </div>
          <p style={{ color: C.white, fontSize: 14, lineHeight: 1.7, margin: 0 }}>{mentorAck}</p>
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 6, height: 6, borderRadius: '50%', background: C.crimson,
              animation: `pulse 1.2s ${i * 0.3}s ease-in-out infinite`,
            }} />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:0.3;transform:scale(1)} 50%{opacity:1;transform:scale(1.3)} }`}</style>
      </div>
    );
  }

  // Render memory questions with structured sections
  const sections = isMemoryQuestion ? variantText.split(/\[After[^\]]*\]|\[After completing[^\]]*\]/) : null;

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Mission context strip */}
      <div style={{
        background: C.bgDeep, borderRadius: 10, padding: '10px 14px',
        border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: C.crimson,
          boxShadow: `0 0 8px ${C.crimson}`,
        }} />
        <span style={{ color: C.grey, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
          {question.family}
        </span>
        <span style={{
          marginLeft: 'auto', color: C.greyD, fontSize: 11,
          background: '#2d1020', padding: '2px 8px', borderRadius: 4,
        }}>
          {'◆'.repeat(question.difficulty) + '◇'.repeat(4 - question.difficulty)}
        </span>
      </div>

      {/* Question text */}
      <div style={{
        background: C.bgCard, border: `1px solid ${C.border}`,
        borderRadius: 14, padding: '20px 22px',
      }}>
        <div style={{
          color: C.grey, fontSize: 11, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
        }}>
          Mission Challenge
        </div>
        {sections ? (
          sections.map((section, i) => (
            <p key={i} style={{
              color: i === 0 ? C.white : C.grey,
              fontSize: i === 0 ? 15 : 13,
              lineHeight: 1.75,
              margin: i > 0 ? '12px 0 0' : 0,
              whiteSpace: 'pre-line',
              fontStyle: i > 0 ? 'italic' : 'normal',
            }}>
              {section.trim()}
            </p>
          ))
        ) : (
          <p style={{ color: C.white, fontSize: 15, lineHeight: 1.75, margin: 0, whiteSpace: 'pre-line' }}>
            {variantText}
          </p>
        )}
      </div>

      {/* Response area */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ color: C.grey, fontSize: 12, fontWeight: 600 }}>
          Your response
        </label>
        <textarea
          value={response}
          onChange={e => setResponse(e.target.value)}
          placeholder={question.difficulty >= 3
            ? "Walk through your thinking — what you would do and why…"
            : "Type your response here…"}
          disabled={submitting}
          rows={question.interactionType === 'open_response_scenario' ? 6 : 4}
          style={{
            background: C.bgDeep,
            border: `1px solid ${C.borderLight}`,
            borderRadius: 10,
            padding: '12px 14px',
            color: C.white,
            fontSize: 14,
            lineHeight: 1.6,
            resize: 'vertical',
            outline: 'none',
            fontFamily: 'inherit',
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit();
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: C.greyD, fontSize: 11 }}>
            {response.trim().length < minLength
              ? `${minLength - response.trim().length} more characters to continue`
              : 'Ready to submit'}
          </span>
          {error && <span style={{ color: '#f87171', fontSize: 12 }}>{error}</span>}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              background: canSubmit ? `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})` : '#2d1020',
              color: canSubmit ? C.white : C.greyD,
              border: 'none',
              borderRadius: 8,
              padding: '10px 22px',
              fontSize: 13,
              fontWeight: 700,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              letterSpacing: '0.04em',
              transition: 'background 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            {submitting ? 'Processing…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
