import { useState, useRef, useEffect } from 'react';
import type { ChatMessage, MissionId } from '../types';
import { evidenceFromChatMessages } from '../behaviourEngine';
import type { EvidenceItem } from '../types';

const C = {
  crimson: '#80011f',
  crimsonD: '#5c0116',
  bg: '#0f0a0b',
  bgCard: '#1a0d10',
  border: '#3d1020',
  white: '#f1f5f9',
  grey: '#94a3b8',
};

interface Props {
  missionId: MissionId;
  systemPrompt: string;
  welcomeMessage: string;
  minMessages: number;
  onComplete: (evidence: Omit<EvidenceItem, 'mission'>[], chatHistory: ChatMessage[]) => void;
}

export function AIMentorChat({ missionId, systemPrompt, welcomeMessage, minMessages, onComplete }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: welcomeMessage },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [canComplete, setCanComplete] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const userMessages = messages.filter(m => m.role === 'user');

  useEffect(() => {
    setCanComplete(userMessages.length >= minMessages);
  }, [userMessages.length, minMessages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setError('');

    const updated: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(updated);
    setLoading(true);

    try {
      const token = localStorage.getItem('aacp_access_token');
      const res = await fetch('/acia/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          systemPrompt,
          messages: updated.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json() as { reply?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'AI unavailable');
      const reply = data.reply ?? '';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleComplete() {
    const evidence = evidenceFromChatMessages(messages, missionId as 'm1' | 'm9');
    onComplete(evidence, messages);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        minHeight: 0,
        maxHeight: 420,
      }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '78%',
              background: msg.role === 'user' ? C.crimson : C.bgCard,
              border: `1px solid ${msg.role === 'user' ? C.crimsonD : C.border}`,
              borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              padding: '12px 16px',
              color: C.white,
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              background: C.bgCard,
              border: `1px solid ${C.border}`,
              borderRadius: '18px 18px 18px 4px',
              padding: '12px 16px',
              color: C.grey,
              fontSize: 13,
            }}>
              Thinking...
            </div>
          </div>
        )}
        {error && (
          <div style={{ color: '#f87171', fontSize: 12, textAlign: 'center', padding: 8 }}>
            {error}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div style={{
        padding: '16px 20px',
        borderTop: `1px solid ${C.border}`,
        background: C.bgCard,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Type your message… (Enter to send)"
            rows={2}
            style={{
              flex: 1,
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              color: C.white,
              padding: '10px 14px',
              fontSize: 14,
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            style={{
              background: C.crimson,
              color: 'white',
              border: 'none',
              borderRadius: 12,
              padding: '0 20px',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              opacity: loading || !input.trim() ? 0.5 : 1,
              fontWeight: 700,
              fontSize: 13,
              alignSelf: 'stretch',
            }}
          >
            Send
          </button>
        </div>

        {canComplete ? (
          <button
            onClick={handleComplete}
            style={{
              background: 'linear-gradient(135deg, #80011f, #5c0116)',
              color: 'white',
              border: 'none',
              borderRadius: 12,
              padding: '12px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            Complete Mission →
          </button>
        ) : (
          <p style={{ color: C.grey, fontSize: 12, textAlign: 'center', margin: 0 }}>
            Exchange at least {minMessages} message{minMessages !== 1 ? 's' : ''} to complete this mission
            ({userMessages.length}/{minMessages})
          </p>
        )}
      </div>
    </div>
  );
}
