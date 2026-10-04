import { useState } from 'react';
import { request } from '../../services/apiClient';
import { RPAS_DOMAIN_LABELS, TC_CERT_LABELS, EXPERIENCE_LABELS } from './rpasEngine';
import type { RpasApplicationDomain } from './rpasEngine';

const C = {
  bg:         '#0f172a',
  card:       '#1e293b',
  border:     '#334155',
  focus:      '#8f0909',
  white:      '#f1f5f9',
  grey:       '#94a3b8',
  greyD:      '#8a9ab0',
  crimson:    '#8f0909',
  crimsonD:   '#721010',
  red:        '#ef4444',
  redBg:      'rgba(239,68,68,0.08)',
  redBorder:  '#ef4444',
  green:      '#22c55e',
  greenBg:    'rgba(34,197,94,0.08)',
  greenBorder:'#16a34a',
};

const inputStyle = {
  width: '100%', background: C.bg, border: `1px solid ${C.border}`,
  borderRadius: 10, padding: '11px 14px', color: C.white, fontSize: 14,
  outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit',
};

interface Props {
  onComplete: () => void;
}

export function RpasIntakeForm({ onComplete }: Props) {
  const [tcCertStatus, setTcCertStatus] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('');
  const [practicalContext, setPracticalContext] = useState('');
  const [applicationDomains, setApplicationDomains] = useState<RpasApplicationDomain[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDomain(d: RpasApplicationDomain) {
    setApplicationDomains(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tcCertStatus) { setError('Please select your TC certification status'); return; }
    if (!experienceLevel) { setError('Please select your experience level'); return; }
    setError(null);
    setSubmitting(true);
    try {
      await request('/rpas/profile', {
        method: 'POST',
        body: { tcCertStatus, experienceLevel, practicalContext, applicationDomains },
      });
      onComplete();
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to save profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 560, width: '100%' }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '24px', marginBottom: 16 }}>

        <div style={{ color: C.grey, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 18 }}>
          RPAS Background
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', color: C.grey, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            Transport Canada Certification
          </label>
          <select value={tcCertStatus} onChange={e => setTcCertStatus(e.target.value)} style={inputStyle}>
            <option value="">Select certification status…</option>
            {Object.entries(TC_CERT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', color: C.grey, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            RPAS Operating Experience
          </label>
          <select value={experienceLevel} onChange={e => setExperienceLevel(e.target.value)} style={inputStyle}>
            <option value="">Select experience level…</option>
            {Object.entries(EXPERIENCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', color: C.grey, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            Application Domains of Interest
            <span style={{ fontWeight: 400, marginLeft: 6 }}>(select all that apply)</span>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(Object.entries(RPAS_DOMAIN_LABELS) as [RpasApplicationDomain, string][]).map(([k, v]) => {
              const selected = applicationDomains.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleDomain(k)}
                  style={{
                    background: selected ? `${C.crimson}22` : C.bg,
                    border: `1px solid ${selected ? C.crimson : C.border}`,
                    borderRadius: 8, padding: '6px 12px',
                    color: selected ? C.white : C.grey,
                    fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                    fontWeight: selected ? 600 : 400,
                  }}
                >
                  {v}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', color: C.grey, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            Practical Experience Context
            <span style={{ fontWeight: 400, marginLeft: 6 }}>(optional)</span>
          </label>
          <textarea
            value={practicalContext}
            onChange={e => setPracticalContext(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Briefly describe any RPAS operating experience, relevant training, or professional context…"
            style={{ ...inputStyle, resize: 'vertical' as const, minHeight: 80 }}
          />
        </div>
      </div>

      {error && (
        <div style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
          <div style={{ color: '#fca5a5', fontSize: 13 }}>{error}</div>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        style={{
          width: '100%',
          background: submitting ? C.crimsonD : `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
          color: C.white, border: 'none', borderRadius: 12,
          padding: '14px', fontWeight: 700, fontSize: 15,
          cursor: submitting ? 'not-allowed' : 'pointer',
          opacity: submitting ? 0.7 : 1,
        }}
      >
        {submitting ? 'Saving…' : 'Continue to Intelligence Assessment →'}
      </button>
    </form>
  );
}
