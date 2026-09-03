import { useState, useEffect, useCallback } from 'react';
import { QUESTION_BANK, QUESTION_FAMILIES, applyVariants } from '../acia/questionBank';
import { COMPETENCY_LABELS } from '../acia/types';
import type { CompetencyKey, QuestionRecord } from '../acia/types';
import { generateVariant, auditStaticVariant, getValidationLog } from '../acia/variantEngine';
import type { ValidationIssueRecord } from '../acia/variantEngine';
import { C } from '../../theme';
import { getStoredToken, getStoredRefreshToken, setStoredToken } from '../../services/apiClient';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const doFetch = (token: string | null) =>
    fetch(path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...((opts?.headers as Record<string, string>) ?? {}) },
    });

  let res = await doFetch(getStoredToken());

  if (res.status === 401) {
    const refreshToken = getStoredRefreshToken();
    if (refreshToken) {
      try {
        const rr = await fetch('/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
        if (rr.ok) {
          const rd = await rr.json();
          if (rd.accessToken) { setStoredToken(rd.accessToken); res = await doFetch(rd.accessToken); }
        }
      } catch { /* fall through */ }
    }
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? 'Request failed');
  return data as T;
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string; border: string }> = {
    pending:  { label: 'Pending',  color: C.amber, bg: C.amberBg, border: C.amberBorder },
    active:   { label: 'Approved', color: C.green, bg: C.greenBg, border: C.greenBorder },
    rejected: { label: 'Declined', color: C.red,   bg: C.redBg,   border: C.redBorder   },
  };
  const s = map[status] ?? map.pending;
  return (
    <span style={{
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>{s.label}</span>
  );
}

function roleFmt(role: string) {
  const m: Record<string, string> = { youth: 'Participant', employer: 'Employer', postsecondary: 'Post-Secondary' };
  return m[role] ?? role;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });
}

// â”€â”€ Decline Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DeclineModal({ participant, onConfirm, onCancel, loading }: {
  participant: Participant;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: '#14090c', border: `1px solid ${C.border}`, borderRadius: 16,
        padding: '28px 28px', width: '100%', maxWidth: 440,
      }}>
        <div style={{ color: C.red, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Decline Registration
        </div>
        <div style={{ color: C.white, fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{participant.name}</div>
        <div style={{ color: C.grey, fontSize: 13, marginBottom: 20 }}>{participant.email}</div>
        <label style={{ color: C.grey, fontSize: 12, display: 'block', marginBottom: 6 }}>
          Internal note / reason (optional — will be sent to the participant)
        </label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. Registration incomplete, cohort full, eligibility criteria not met…"
          rows={4}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
            color: C.white, fontSize: 13, padding: '10px 12px', resize: 'vertical', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button
            onClick={() => onConfirm(reason)}
            disabled={loading}
            style={{
              flex: 1, background: C.red, color: 'white', border: 'none',
              borderRadius: 10, padding: '11px', fontWeight: 700, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Declining…' : 'Confirm Decline'}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              flex: 1, background: C.bgCard, color: C.grey, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: '11px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// â”€â”€ Participant Row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ParticipantRow({ p, onApprove, onDecline, actionLoading }: {
  p: Participant;
  onApprove: (id: string) => void;
  onDecline: (p: Participant) => void;
  actionLoading: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const org = p.organizationName || p.institutionName;
  const isLoading = actionLoading === p.id;

  return (
    <div style={{
      background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14,
      overflow: 'hidden', transition: 'border-color 0.15s',
    }}>
      <div
        style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Avatar */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: p.status === 'pending' ? C.amberBg : p.status === 'active' ? C.greenBg : C.redBg,
          border: `1px solid ${p.status === 'pending' ? C.amberBorder : p.status === 'active' ? C.greenBorder : C.redBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: p.status === 'pending' ? C.amber : p.status === 'active' ? C.green : C.red,
          fontSize: 14, fontWeight: 700, flexShrink: 0,
        }}>
          {p.name.charAt(0).toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{p.name}</span>
            <StatusChip status={p.status} />
            <span style={{
              background: '#1e2837', color: '#93c5fd', fontSize: 10,
              padding: '2px 7px', borderRadius: 4, fontWeight: 600,
            }}>{roleFmt(p.role)}</span>
          </div>
          <div style={{ color: C.grey, fontSize: 12, marginTop: 2 }}>
            {p.email}{org ? ` · ${org}` : ''}
          </div>
        </div>

        <div style={{ color: C.greyD, fontSize: 11, textAlign: 'right', flexShrink: 0 }}>
          <div>{fmtDate(p.createdAt)}</div>
          <div style={{ marginTop: 2 }}>Registered</div>
        </div>

        <span style={{ color: C.greyD, fontSize: 14, marginLeft: 4 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '16px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px 20px', marginBottom: 16 }}>
            {[
              ['Email', p.email],
              ['Phone', p.phone ?? '—'],
              ['Role', roleFmt(p.role)],
              ['Organisation', org ?? '—'],
              ['Region', p.region ?? '—'],
              ['Registered', fmtDate(p.createdAt)],
              p.status !== 'pending' ? ['Status updated', fmtDate(p.updatedAt)] : null,
            ].filter(Boolean).map(([label, value]) => (
              <div key={label as string}>
                <div style={{ color: C.greyD, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>{label}</div>
                <div style={{ color: C.white, fontSize: 13 }}>{value as string}</div>
              </div>
            ))}
          </div>

          {p.status === 'pending' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => onApprove(p.id)}
                disabled={isLoading}
                style={{
                  background: `linear-gradient(135deg, #14532d, #166534)`, color: C.green,
                  border: `1px solid ${C.greenBorder}`, borderRadius: 10,
                  padding: '9px 20px', fontWeight: 700, fontSize: 13,
                  cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.6 : 1,
                }}
              >
                {isLoading ? 'Processing…' : '✓ Approve'}
              </button>
              <button
                onClick={() => onDecline(p)}
                disabled={isLoading}
                style={{
                  background: C.redBg, color: C.red,
                  border: `1px solid ${C.redBorder}`, borderRadius: 10,
                  padding: '9px 20px', fontWeight: 700, fontSize: 13,
                  cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.6 : 1,
                }}
              >
                âœ• Decline
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€ Question Validation Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function QuestionValidationPanel() {
  const [sampleIssues, setSampleIssues] = useState<{ q: QuestionRecord; issues: string[]; sample: string }[]>([]);
  const [liveLog, setLiveLog] = useState<ValidationIssueRecord[]>([]);
  const [checked, setChecked] = useState(false);

  function runAudit() {
    const found: { q: QuestionRecord; issues: string[]; sample: string }[] = [];

    for (const q of QUESTION_BANK) {
      if (q.variantGenerator) {
        // Test 3 generated variants and collect any failures
        for (let i = 0; i < 3; i++) {
          const gen = generateVariant(q);
          if (!gen || !gen.isValid) {
            found.push({ q, issues: gen?.validationIssues ?? ['Generator returned null'], sample: gen?.text ?? q.questionTemplate });
          }
        }
      } else {
        // Audit static variants — run 3 samples
        for (let i = 0; i < 3; i++) {
          const text = applyVariants(q.questionTemplate, q.variantVariables);
          const { valid, issues } = auditStaticVariant(q, text);
          if (!valid) {
            found.push({ q, issues, sample: text });
            break; // one failure per question is enough
          }
        }
      }
    }

    setSampleIssues(found);
    setLiveLog([...getValidationLog()]);
    setChecked(true);
  }

  const statusColor = (issues: string[]) => issues.length === 0 ? C.green : C.red;

  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h3 style={{ color: C.white, margin: 0, fontSize: 15, fontWeight: 700 }}>Question Quality & Validation</h3>
          <p style={{ color: C.grey, fontSize: 12, margin: '4px 0 0' }}>
            Audits all questions for logical coherence. Coupled numerical variants are generated and validated before serving.
          </p>
        </div>
        <button
          onClick={runAudit}
          style={{ background: C.crimson, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Run Audit
        </button>
      </div>

      {checked && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sampleIssues.length === 0 ? (
            <div style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: 8, padding: '12px 16px', color: C.green, fontSize: 13 }}>
              All {QUESTION_BANK.length} questions passed validation across sampled variants.
            </div>
          ) : (
            sampleIssues.map(({ q, issues, sample }, i) => (
              <div key={`${q.questionId}-${i}`} style={{ background: C.bgCard, border: '1px solid #5c1a1a', borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, color: C.red, fontSize: 12 }}>{q.questionId}</span>
                  <span style={{ color: C.grey, fontSize: 12 }}>{q.family}</span>
                  <span style={{ marginLeft: 'auto', color: C.greyD, fontSize: 11 }}>
                    {q.variantGenerator ? `generator: ${q.variantGenerator}` : 'static variant'}
                  </span>
                </div>
                <div style={{ background: C.redBg, borderRadius: 4, padding: '8px 10px', marginBottom: 8, fontSize: 12, color: C.grey, fontFamily: 'monospace' }}>
                  {sample.slice(0, 200)}{sample.length > 200 ? '…' : ''}
                </div>
                {issues.map((issue, j) => (
                  <div key={j} style={{ color: C.red, fontSize: 12, display: 'flex', gap: 6 }}>
                    <span>▶</span>{issue}
                  </div>
                ))}
              </div>
            ))
          )}

          {liveLog.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ color: C.grey, fontSize: 12, marginBottom: 8, fontWeight: 600 }}>Runtime Validation Log ({liveLog.length} events)</div>
              {liveLog.slice(-10).map((entry, i) => (
                <div key={i} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 14px', marginBottom: 6 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ color: C.red, fontSize: 12, fontWeight: 700 }}>{entry.questionId}</span>
                    <span style={{ color: C.greyD, fontSize: 11 }}>{entry.family}</span>
                    {entry.participantReported && <span style={{ background: C.amberBorder, color: C.amber, fontSize: 10, padding: '1px 6px', borderRadius: 3 }}>PARTICIPANT REPORTED</span>}
                    <span style={{ marginLeft: 'auto', color: C.greyD, fontSize: 10 }}>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  </div>
                  {entry.issues.map((iss, j) => (
                    <div key={j} style={{ color: C.grey, fontSize: 12 }}>{iss}</div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// â”€â”€ Admin Question Bank â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AdminQuestionBank() {
  const [familyFilter, setFamilyFilter] = useState<string>('all');
  const [competencyFilter, setCompetencyFilter] = useState<string>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [qbTab, setQbTab] = useState<'questions' | 'validation'>('questions');

  const filtered = QUESTION_BANK.filter(q => {
    if (familyFilter !== 'all' && q.familyCode !== familyFilter) return false;
    if (competencyFilter !== 'all' && q.primaryCompetency !== competencyFilter && !q.secondaryCompetencies.includes(competencyFilter as CompetencyKey)) return false;
    if (difficultyFilter !== 'all' && String(q.difficulty) !== difficultyFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!q.questionId.toLowerCase().includes(s) &&
          !q.family.toLowerCase().includes(s) &&
          !q.questionTemplate.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const statusColors: Record<string, { bg: string; color: string }> = {
    active: { bg: C.greenBg, color: C.green },
    draft: { bg: C.amberBg, color: C.amber },
    retired: { bg: C.redBg, color: C.red },
  };
  const diffLabel = ['', 'Introductory', 'Intermediate', 'Advanced', 'Expert'];

  return (
    <div style={{ padding: 'clamp(16px,3vw,28px)', fontFamily: 'DM Sans, sans-serif', maxWidth: 960, marginInline: 'auto' }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: 'Fraunces, serif', color: C.white, margin: '0 0 4px', fontSize: 'clamp(1.1rem,2.5vw,1.4rem)', fontWeight: 700 }}>
            ACIA Question Bank
          </h2>
          <div style={{ color: C.grey, fontSize: 13 }}>
            {QUESTION_BANK.length} questions across {QUESTION_FAMILIES.length} families
          </div>
        </div>
        {/* Sub-tab switcher */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(['questions', 'validation'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setQbTab(tab)}
              style={{
                background: qbTab === tab ? C.crimson : C.bgCard,
                color: qbTab === tab ? '#fff' : C.grey,
                border: `1px solid ${qbTab === tab ? C.crimson : C.border}`,
                borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', textTransform: 'capitalize',
              }}
            >
              {tab === 'validation' ? 'Quality & Validation' : 'Questions'}
            </button>
          ))}
        </div>
      </div>

      {qbTab === 'validation' && <QuestionValidationPanel />}

      {qbTab === 'questions' && <>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search questions…"
          style={{
            background: C.bgCard, border: `1px solid ${C.border}`, color: C.white,
            borderRadius: 8, padding: '7px 12px', fontSize: 13, outline: 'none', flex: '1 1 200px',
          }}
        />
        <select
          value={familyFilter}
          onChange={e => setFamilyFilter(e.target.value)}
          style={{ background: C.bgCard, border: `1px solid ${C.border}`, color: C.grey, borderRadius: 8, padding: '7px 12px', fontSize: 12 }}
        >
          <option value="all">All Families</option>
          {QUESTION_FAMILIES.map(f => (
            <option key={f.code} value={f.code}>{f.name}</option>
          ))}
        </select>
        <select
          value={competencyFilter}
          onChange={e => setCompetencyFilter(e.target.value)}
          style={{ background: C.bgCard, border: `1px solid ${C.border}`, color: C.grey, borderRadius: 8, padding: '7px 12px', fontSize: 12 }}
        >
          <option value="all">All Competencies</option>
          {(Object.entries(COMPETENCY_LABELS) as [CompetencyKey, string][]).map(([k, v]) => (
            <option key={k} value={k}>{k} — {v}</option>
          ))}
        </select>
        <select
          value={difficultyFilter}
          onChange={e => setDifficultyFilter(e.target.value)}
          style={{ background: C.bgCard, border: `1px solid ${C.border}`, color: C.grey, borderRadius: 8, padding: '7px 12px', fontSize: 12 }}
        >
          <option value="all">All Difficulties</option>
          {[1,2,3,4].map(d => <option key={d} value={String(d)}>{diffLabel[d]}</option>)}
        </select>
      </div>

      <div style={{ color: C.greyD, fontSize: 12, marginBottom: 12 }}>{filtered.length} questions</div>

      {/* Question list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(q => {
          const isOpen = expanded === q.questionId;
          const statusMeta = statusColors[q.status] ?? statusColors.draft;
          return (
            <div key={q.questionId} style={{
              background: C.bgCard, border: `1px solid ${isOpen ? C.crimsonD : C.border}`,
              borderRadius: 14, overflow: 'hidden',
              transition: 'border-color 0.2s',
            }}>
              <button
                onClick={() => setExpanded(isOpen ? null : q.questionId)}
                style={{
                  width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                  padding: '14px 16px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12,
                }}
              >
                <span style={{ color: C.crimson, fontWeight: 700, fontSize: 12, fontFamily: 'monospace', flexShrink: 0 }}>
                  {q.questionId}
                </span>
                <span style={{ color: C.white, fontSize: 13, fontWeight: 600, flex: 1 }}>
                  {q.family}
                </span>
                <span style={{
                  background: C.redBg, color: C.crimson,
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, flexShrink: 0,
                }}>
                  {q.primaryCompetency}
                </span>
                <span style={{
                  background: statusMeta.bg, color: statusMeta.color,
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, flexShrink: 0,
                }}>
                  {q.status}
                </span>
                <span style={{ color: C.greyD, fontSize: 11, flexShrink: 0 }}>
                  {'◆'.repeat(q.difficulty)}{'◇'.repeat(4-q.difficulty)}
                </span>
                <span style={{ color: C.greyD, fontSize: 14, flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: '16px 16px 20px' }}>
                  {/* Question text */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ color: C.greyD, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                      Question Template
                    </div>
                    <div style={{
                      background: C.bgCard, border: `1px solid ${C.border}`,
                      borderRadius: 8, padding: '12px 14px',
                      color: C.white, fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap',
                    }}>
                      {q.questionTemplate}
                    </div>
                  </div>

                  {/* Metadata row */}
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
                    <div>
                      <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                        Primary
                      </div>
                      <span style={{ color: C.white, fontSize: 12, fontWeight: 600 }}>
                        {q.primaryCompetency} — {COMPETENCY_LABELS[q.primaryCompetency as CompetencyKey]}
                      </span>
                    </div>
                    {q.secondaryCompetencies.length > 0 && (
                      <div>
                        <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                          Secondary
                        </div>
                        <span style={{ color: C.grey, fontSize: 12 }}>
                          {q.secondaryCompetencies.join(', ')}
                        </span>
                      </div>
                    )}
                    <div>
                      <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                        Difficulty
                      </div>
                      <span style={{ color: C.grey, fontSize: 12 }}>{diffLabel[q.difficulty]}</span>
                    </div>
                    <div>
                      <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                        Interaction
                      </div>
                      <span style={{ color: C.grey, fontSize: 12 }}>{q.interactionType}</span>
                    </div>
                    <div>
                      <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                        Prior Knowledge
                      </div>
                      <span style={{ color: C.grey, fontSize: 12 }}>{q.priorKnowledgeRequired ? 'Required' : 'Not required'}</span>
                    </div>
                  </div>

                  {/* Evidence rubric */}
                  <div>
                    <div style={{ color: C.greyD, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                      Evidence Rubric — {q.evidenceRubric.length} Indicators
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {q.evidenceRubric.map(r => (
                        <div key={r.indicator} style={{
                          display: 'flex', gap: 10, alignItems: 'flex-start',
                          background: C.bgCard, borderRadius: 8, padding: '8px 12px',
                        }}>
                          <div style={{
                            width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                            background: r.positive ? '#16a34a' : '#ef4444',
                          }} />
                          <div style={{ flex: 1 }}>
                            <span style={{ color: C.white, fontSize: 12, fontWeight: 600 }}>{r.label}</span>
                            <span style={{ color: C.greyD, fontSize: 11, marginLeft: 8 }}>({r.competency})</span>
                            <div style={{ color: C.grey, fontSize: 11, marginTop: 2 }}>{r.description}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {q.designNote && (
                    <div style={{ marginTop: 12, color: C.greyD, fontSize: 11, fontStyle: 'italic', borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                      Design note: {q.designNote}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </>}
    </div>
  );
}

// â”€â”€ Main Admin Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â”€â”€ Organizations panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface Organization {
  id: string;
  name: string;
  orgType: 'employer' | 'postsecondary';
  approvedDomains: string[];
  partnerStatus: string;
  primaryContact: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  handoff_authorized?: number;
}

function OrganizationsPanel() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setOrgToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [orgType, setOrgType] = useState<'employer' | 'postsecondary'>('employer');
  const [domains, setDomains] = useState('');
  const [contact, setContact] = useState('');
  const [partnerStatus, setPartnerStatus] = useState('pending');
  const [notes, setNotes] = useState('');

  function showOrgToast(msg: string, ok = true) {
    setOrgToast({ msg, ok });
    setTimeout(() => setOrgToast(null), 3000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ organizations: Organization[] }>('/admin/organizations');
      setOrgs(res.organizations);
    } catch (e) {
      showOrgToast(e instanceof Error ? e.message : 'Failed to load organizations', false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditId(null); setName(''); setOrgType('employer'); setDomains('');
    setContact(''); setPartnerStatus('pending'); setNotes('');
    setShowAdd(true);
  }

  function openEdit(o: Organization) {
    setEditId(o.id); setName(o.name); setOrgType(o.orgType);
    setDomains(o.approvedDomains.join(', ')); setContact(o.primaryContact ?? '');
    setPartnerStatus(o.partnerStatus); setNotes(o.notes ?? '');
    setShowAdd(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const domainList = domains.split(',').map(d => d.trim()).filter(Boolean);
    const body = JSON.stringify({ name, orgType, approvedDomains: domainList, primaryContact: contact || null, partnerStatus, notes: notes || null });
    try {
      if (editId) {
        await apiFetch(`/admin/organizations/${editId}`, { method: 'PUT', body });
      } else {
        await apiFetch('/admin/organizations', { method: 'POST', body });
      }
      showOrgToast(editId ? 'Organization updated.' : 'Organization added.');
      setShowAdd(false);
      load();
    } catch (e) {
      showOrgToast(e instanceof Error ? e.message : 'Save failed', false);
    } finally {
      setSaving(false);
    }
  }

  const TD: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: C.white, borderBottom: `1px solid ${C.border}`, verticalAlign: 'middle' };
  const TH: React.CSSProperties = { ...TD, color: C.greyD, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, background: C.bgCard };

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: toast.ok ? C.greenBg : C.redBg, border: `1px solid ${toast.ok ? C.greenBorder : C.redBorder}`, color: toast.ok ? C.green : C.red, borderRadius: 12, padding: '12px 18px', fontSize: 13, fontWeight: 600 }}>
          {toast.ok ? '✓ ' : 'âœ• '}{toast.msg}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: 'Fraunces, serif', color: C.white, margin: '0 0 4px', fontSize: 'clamp(1.1rem,2.5vw,1.4rem)', fontWeight: 700 }}>Partner Organizations</h2>
          <div style={{ color: C.grey, fontSize: 13 }}>Manage employer and post-secondary partner accounts</div>
        </div>
        <button onClick={openAdd} style={{ background: C.crimson, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + Add Organization
        </button>
      </div>

      {showAdd && (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ color: C.white, margin: '0 0 14px', fontSize: 15 }}>{editId ? 'Edit' : 'Add'} Organization</h3>
          <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ color: C.greyD, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1/-1' }}>
              Organization Name *
              <input required value={name} onChange={e => setName(e.target.value)} style={{ background: C.bg, color: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px', fontSize: 13 }} />
            </label>
            <label style={{ color: C.greyD, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Type *
              <select value={orgType} onChange={e => setOrgType(e.target.value as 'employer' | 'postsecondary')} style={{ background: C.bg, color: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px', fontSize: 13 }}>
                <option value="employer">Employer</option>
                <option value="postsecondary">Post-Secondary</option>
              </select>
            </label>
            <label style={{ color: C.greyD, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Partner Status
              <select value={partnerStatus} onChange={e => setPartnerStatus(e.target.value)} style={{ background: C.bg, color: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px', fontSize: 13 }}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
              </select>
            </label>
            <label style={{ color: C.greyD, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1/-1' }}>
              Approved Email Domains (comma-separated)
              <input value={domains} onChange={e => setDomains(e.target.value)} placeholder="e.g. company.com, partner.org" style={{ background: C.bg, color: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px', fontSize: 13 }} />
            </label>
            <label style={{ color: C.greyD, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Primary Contact Email
              <input type="email" value={contact} onChange={e => setContact(e.target.value)} style={{ background: C.bg, color: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px', fontSize: 13 }} />
            </label>
            <label style={{ color: C.greyD, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Notes
              <input value={notes} onChange={e => setNotes(e.target.value)} style={{ background: C.bg, color: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px', fontSize: 13 }} />
            </label>
            <div style={{ display: 'flex', gap: 8, gridColumn: '1/-1' }}>
              <button type="submit" disabled={saving} style={{ background: C.crimson, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setShowAdd(false)} style={{ background: 'none', color: C.greyD, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 14px', fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p style={{ color: C.greyD, fontSize: 13 }}>Loading…</p>
      ) : orgs.length === 0 ? (
        <p style={{ color: C.greyD, fontSize: 13 }}>No organizations yet. Add one to get started.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: C.bgCard, borderRadius: 10 }}>
            <thead>
              <tr>
                <th style={TH}>Name</th>
                <th style={TH}>Type</th>
                <th style={TH}>Domains</th>
                <th style={TH}>Status</th>
                <th style={TH}>Partner</th>
                <th style={TH}>Handoff Auth</th>
                <th style={TH}></th>
              </tr>
            </thead>
            <tbody>
              {orgs.map(o => (
                <tr key={o.id}>
                  <td style={TD}>{o.name}</td>
                  <td style={TD}><span style={{ color: C.greyD }}>{o.orgType}</span></td>
                  <td style={TD}><span style={{ color: C.greyD, fontSize: 11 }}>{o.approvedDomains.join(', ') || '—'}</span></td>
                  <td style={TD}><span style={{ color: o.status === 'active' ? C.green : C.amber }}>{o.status}</span></td>
                  <td style={TD}><span style={{ color: o.partnerStatus === 'approved' ? C.green : C.amber }}>{o.partnerStatus}</span></td>
                  <td style={TD}>
                    <button
                      onClick={async () => {
                        try {
                          await apiFetch(`/admin/organizations/${o.id}`, { method: 'PUT', body: JSON.stringify({ handoff_authorized: o.handoff_authorized ? 0 : 1 }) });
                          showOrgToast(`Handoff authorization ${o.handoff_authorized ? 'removed' : 'enabled'} for ${o.name}`);
                          load();
                        } catch (e) { showOrgToast(e instanceof Error ? e.message : 'Failed', false); }
                      }}
                      style={{
                        background: o.handoff_authorized ? C.green + '22' : C.bgDeep,
                        border: `1px solid ${o.handoff_authorized ? C.green + '55' : C.border}`,
                        color: o.handoff_authorized ? C.green : C.greyD,
                        borderRadius: 5, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      {o.handoff_authorized ? 'Authorized' : 'Not Authorized'}
                    </button>
                  </td>
                  <td style={TD}>
                    <button onClick={() => openEdit(o)} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.greyD, borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// â”€â”€ Audit log panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface AuditEntry {
  id: string;
  action: string;
  userId: string | null;
  entityType: string | null;
  details: string;
  timestamp: string;
}

// ── ACIA Integrity Audit Panel ────────────────────────────────────────────────

interface AciaParticipantRow {
  participantId: string;
  name: string;
  email: string;
  assessmentId: string | null;
  uiStatus: string;
  dbStatus: string;
  evidenceCount: number;
  alignmentCount: number;
  badgeCount: number;
  lastCompletionAttempt: string | null;
  failedSaveAttempts: number;
  issues: string[];
  recommendedRecovery: string[];
}

interface AciaIntegrityReport {
  generatedAt: string;
  totalParticipants: number;
  participantsWithIssues: number;
  participants: AciaParticipantRow[];
}

interface AciaSaveFailure {
  id: string;
  participant_id: string;
  name: string | null;
  email: string | null;
  submission_id: string;
  attempt_number: number;
  save_started_at: string;
  save_failed_at: string;
  failure_reason: string | null;
  assessment_id: string | null;
}


function ACIAIntegrityPanel() {
  const [report, setReport] = useState<AciaIntegrityReport | null>(null);
  const [failures, setFailures] = useState<AciaSaveFailure[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'audit' | 'failures'>('audit');
  const [filterIssues, setFilterIssues] = useState(false);

  const load = async () => {
    setLoading(true);
    const token = localStorage.getItem('aacp_access_token');
    const h = { Authorization: `Bearer ${token}` };
    const [auditRes, failRes] = await Promise.all([
      fetch('/admin/acia/integrity', { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/admin/acia/save-failures', { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    if (auditRes) setReport(auditRes);
    if (failRes?.failures) setFailures(failRes.failures);
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = report?.participants ?? [];
  const displayed = filterIssues ? rows.filter(r => r.issues.length > 0) : rows;

  const statusColor = (s: string) => s === 'completed' ? '#4caf50' : s === 'legacy_completed' ? '#ff9800' : '#ef5350';
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-CA') : '—';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.white, marginBottom: 4 }}>ACIA Integrity Audit</div>
          {report && (
            <div style={{ fontSize: 12, color: C.greyD }}>
              {report.totalParticipants} participants · {report.participantsWithIssues} with issues · Generated {fmtDate(report.generatedAt)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setFilterIssues(f => !f)} style={{ background: filterIssues ? C.crimson : C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 14px', fontSize: 12, color: C.white, cursor: 'pointer' }}>
            {filterIssues ? 'Show All' : 'Issues Only'}
          </button>
          <button onClick={load} disabled={loading} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 14px', fontSize: 12, color: C.white, cursor: 'pointer' }}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 2, marginBottom: 16 }}>
        {(['audit', 'failures'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 14px', fontSize: 12, fontWeight: 600, color: tab === t ? C.white : C.greyD, borderBottom: `2px solid ${tab === t ? C.crimson : 'transparent'}`, marginBottom: -1 }}>
            {t === 'audit' ? 'Participant Audit' : `Save Failures (${failures.length})`}
          </button>
        ))}
      </div>

      {tab === 'audit' && (
        <div style={{ overflowX: 'auto' }}>
          {loading && !report ? (
            <div style={{ color: C.greyD, fontSize: 13, padding: '24px 0' }}>Loading audit…</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Participant', 'UI Status', 'DB Record', 'Evidence', 'Alignment', 'Badge', 'Failed Saves', 'Last Attempt', 'Issues'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: C.greyD, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map(p => (
                  <tr key={p.participantId} style={{ borderBottom: `1px solid ${C.border}`, background: p.issues.length > 0 ? 'rgba(143,9,9,0.07)' : 'transparent' }}>
                    <td style={{ padding: '8px 10px', color: C.white }}>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div style={{ color: C.greyD, fontSize: 11 }}>{p.email}</div>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ color: statusColor(p.dbStatus), fontWeight: 600 }}>{p.uiStatus}</span>
                    </td>
                    <td style={{ padding: '8px 10px', color: p.assessmentId ? '#4caf50' : '#ef5350' }}>
                      {p.assessmentId ? '✓ ' + p.assessmentId.slice(0, 8) + '…' : '✗ None'}
                    </td>
                    <td style={{ padding: '8px 10px', color: p.evidenceCount > 0 ? C.white : '#ef5350', textAlign: 'center' }}>{p.evidenceCount}</td>
                    <td style={{ padding: '8px 10px', color: p.alignmentCount > 0 ? C.white : (p.assessmentId ? '#ef5350' : C.greyD), textAlign: 'center' }}>{p.alignmentCount}</td>
                    <td style={{ padding: '8px 10px', color: p.badgeCount > 0 ? '#4caf50' : (p.assessmentId ? '#ef5350' : C.greyD), textAlign: 'center' }}>{p.badgeCount}</td>
                    <td style={{ padding: '8px 10px', color: p.failedSaveAttempts > 0 ? '#ef5350' : C.greyD, textAlign: 'center' }}>{p.failedSaveAttempts || '—'}</td>
                    <td style={{ padding: '8px 10px', color: C.greyD, whiteSpace: 'nowrap' }}>{fmtDate(p.lastCompletionAttempt)}</td>
                    <td style={{ padding: '8px 10px', color: C.greyD, maxWidth: 280 }}>
                      {p.issues.length === 0 ? <span style={{ color: '#4caf50' }}>✓ OK</span> : (
                        <ul style={{ margin: 0, paddingLeft: 14, listStyle: 'disc' }}>
                          {p.issues.map((iss, i) => <li key={i} style={{ color: '#ef9a9a', marginBottom: 2 }}>{iss}</li>)}
                          {p.recommendedRecovery.map((rec, i) => <li key={'r' + i} style={{ color: '#90caf9', marginBottom: 2 }}>→ {rec}</li>)}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
                {displayed.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: '24px 10px', color: C.greyD, textAlign: 'center' }}>No participants found</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'failures' && (
        <div style={{ overflowX: 'auto' }}>
          {failures.length === 0 ? (
            <div style={{ color: '#4caf50', fontSize: 13, padding: '24px 0' }}>No unresolved save failures.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Participant', 'Submission ID', 'Attempt #', 'Failed At', 'Reason'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: C.greyD, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {failures.map(f => (
                  <tr key={f.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '8px 10px', color: C.white }}>
                      <div>{f.name ?? f.participant_id.slice(0, 12)}</div>
                      <div style={{ color: C.greyD, fontSize: 11 }}>{f.email}</div>
                    </td>
                    <td style={{ padding: '8px 10px', color: C.greyD, fontFamily: 'monospace', fontSize: 11 }}>{f.submission_id.slice(0, 16)}…</td>
                    <td style={{ padding: '8px 10px', color: C.white, textAlign: 'center' }}>{f.attempt_number}</td>
                    <td style={{ padding: '8px 10px', color: C.greyD, whiteSpace: 'nowrap' }}>{fmtDate(f.save_failed_at)}</td>
                    <td style={{ padding: '8px 10px', color: '#ef9a9a', maxWidth: 320 }}>{f.failure_reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function AuditLogPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [toast, setAuditToast] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const q = actionFilter ? `?action=${encodeURIComponent(actionFilter)}` : '';
    try {
      const res = await apiFetch<{ logs: AuditEntry[] }>(`/audit/logs${q}`);
      setEntries(res.logs ?? []);
    } catch (e) {
      setAuditToast(e instanceof Error ? e.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const TD: React.CSSProperties = { padding: '9px 12px', fontSize: 12, color: C.white, borderBottom: `1px solid ${C.border}`, verticalAlign: 'top', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  const TH: React.CSSProperties = { ...TD, color: C.greyD, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, background: C.bgCard };

  return (
    <div>
      {toast && <p style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{toast}</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: 'Fraunces, serif', color: C.white, margin: '0 0 4px', fontSize: 'clamp(1.1rem,2.5vw,1.4rem)', fontWeight: 700 }}>Audit Log</h2>
          <div style={{ color: C.grey, fontSize: 13 }}>All security and admin events</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={actionFilter} onChange={e => setActionFilter(e.target.value)} placeholder="Filter by action…" style={{ background: C.bg, color: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 12px', fontSize: 12 }} />
          <button onClick={load} style={{ background: C.crimson, color: '#fff', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Search</button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: C.greyD, fontSize: 13 }}>Loading…</p>
      ) : entries.length === 0 ? (
        <p style={{ color: C.greyD, fontSize: 13 }}>No log entries found.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: C.bgCard, borderRadius: 10, fontSize: 12 }}>
            <thead>
              <tr>
                <th style={TH}>Timestamp</th>
                <th style={TH}>Action</th>
                <th style={TH}>User ID</th>
                <th style={TH}>Entity</th>
                <th style={TH}>Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  <td style={{ ...TD, color: C.greyD }}>{new Date(e.timestamp).toLocaleString()}</td>
                  <td style={TD}><code style={{ color: C.amber, fontSize: 11 }}>{e.action}</code></td>
                  <td style={{ ...TD, color: C.greyD, fontSize: 11 }}>{e.userId ?? '—'}</td>
                  <td style={{ ...TD, color: C.greyD }}>{e.entityType ?? '—'}</td>
                  <td style={{ ...TD, color: C.greyD, fontSize: 11 }}>{typeof e.details === 'string' ? e.details.slice(0, 120) : JSON.stringify(e.details).slice(0, 120)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ color: C.greyD, fontSize: 11, textAlign: 'right', marginTop: 8 }}>Showing {entries.length} entries</p>
        </div>
      )}
    </div>
  );
}

// â”€â”€ Assessment unlock panel (inline in Approvals tab) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AssessmentUnlockModal({ onClose }: { onClose: () => void }) {
  const [assessmentId, setAssessmentId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setMsg('');
    try {
      await apiFetch('/admin/assessment/unlock', { method: 'POST', body: JSON.stringify({ assessmentId, reason }) });
      setDone(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to unlock');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: 28, minWidth: 380, maxWidth: 460 }}>
        <h3 style={{ color: C.white, margin: '0 0 8px', fontSize: 16 }}>Unlock Assessment Stage</h3>
        <p style={{ color: C.greyD, fontSize: 12, marginBottom: 16, lineHeight: 1.6 }}>
          This marks a completed assessment as superseded so the participant can retake that stage. This action is audited and cannot be silently reversed.
        </p>
        {done ? (
          <>
            <p style={{ color: '#22c55e', fontSize: 13 }}>Assessment unlocked. The participant can now retake this stage.</p>
            <button onClick={onClose} style={{ marginTop: 12, background: C.crimson, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Close</button>
          </>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {msg && <p style={{ color: C.red, fontSize: 12, margin: 0 }}>{msg}</p>}
            <label style={{ color: C.greyD, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Assessment ID
              <input required value={assessmentId} onChange={e => setAssessmentId(e.target.value)} placeholder="Assessment UUID" style={{ background: C.bg, color: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px', fontSize: 13 }} />
            </label>
            <label style={{ color: C.greyD, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Reason (required for audit record)
              <textarea required rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for unlocking this assessment…" style={{ background: C.bg, color: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px', fontSize: 13, resize: 'vertical' }} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={loading} style={{ background: C.crimson, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {loading ? 'Unlocking…' : 'Confirm Unlock'}
              </button>
              <button type="button" onClick={onClose} style={{ background: 'none', color: C.greyD, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 14px', fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// â”€â”€ Admin Management Panel (super_admin only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface AdminInvitation {
  id: string;
  invitedEmail: string;
  invitedName: string;
  invitedRole: string;
  invitedBy: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

function AdminManagementPanel() {
  const [invitations, setInvitations] = useState<AdminInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgOk, setMsgOk] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ invitations: AdminInvitation[] }>('/admin/invitations');
      setInvitations(res.invitations);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to load invitations'); setMsgOk(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true); setMsg('');
    try {
      await apiFetch('/admin/invitations/send', { method: 'POST', body: JSON.stringify({ name, email, role: 'admin' }) });
      setMsg('Invitation sent to ' + email); setMsgOk(true);
      setName(''); setEmail(''); setShowForm(false);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to send invitation'); setMsgOk(false);
    } finally {
      setSending(false);
    }
  }

  function inviteStatus(inv: AdminInvitation): { label: string; color: string; bg: string; border: string } {
    if (inv.acceptedAt) return { label: 'Accepted', color: C.green, bg: C.greenBg, border: C.greenBorder };
    if (new Date(inv.expiresAt) < new Date()) return { label: 'Expired', color: C.greyD, bg: C.bg, border: C.border };
    return { label: 'Pending', color: C.amber, bg: C.amberBg, border: C.amberBorder };
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: 'Fraunces, serif', color: C.white, margin: '0 0 4px', fontSize: 'clamp(1.1rem, 2.5vw, 1.5rem)', fontWeight: 700 }}>
            Admin Management
          </h2>
          <div style={{ color: C.grey, fontSize: 13 }}>Invite and manage administrator accounts</div>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            background: C.crimson, color: '#fff', border: 'none', borderRadius: 8,
            padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {showForm ? 'Cancel' : '+ Invite Administrator'}
        </button>
      </div>

      {msg && (
        <div style={{
          background: msgOk ? C.greenBg : C.redBg,
          border: `1px solid ${msgOk ? C.greenBorder : C.redBorder}`,
          color: msgOk ? C.green : C.red,
          borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16,
        }}>
          {msg}
        </div>
      )}

      {showForm && (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.crimson, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
            New Administrator Invitation
          </div>
          <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 12, color: C.grey, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Full Name
              <input
                required value={name} onChange={e => setName(e.target.value)} placeholder="Administrator's full name"
                style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, fontSize: 13, padding: '9px 12px', outline: 'none' }}
              />
            </label>
            <label style={{ fontSize: 12, color: C.grey, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Email Address
              <input
                required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@organization.com"
                style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, fontSize: 13, padding: '9px 12px', outline: 'none' }}
              />
            </label>
            <div style={{ fontSize: 12, color: C.greyD, padding: '8px 12px', background: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: 8 }}>
              The invitation link expires in 48 hours. The administrator must complete MFA setup before gaining dashboard access.
            </div>
            <button type="submit" disabled={sending} style={{
              background: C.crimson, color: '#fff', border: 'none', borderRadius: 8,
              padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start',
            }}>
              {sending ? 'Sending…' : 'Send Invitation'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ color: C.grey, fontSize: 13, padding: 20 }}>Loading invitations…</div>
      ) : invitations.length === 0 ? (
        <div style={{ color: C.grey, fontSize: 13, padding: 20 }}>No invitations yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {invitations.map(inv => {
            const s = inviteStatus(inv);
            return (
              <div key={inv.id} style={{
                background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12,
                padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              }}>
                <div>
                  <div style={{ color: C.white, fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{inv.invitedName}</div>
                  <div style={{ color: C.grey, fontSize: 12 }}>{inv.invitedEmail} · {inv.invitedRole}</div>
                  <div style={{ color: C.greyD, fontSize: 11, marginTop: 4 }}>
                    Sent {fmtDate(inv.createdAt)} · Expires {fmtDate(inv.expiresAt)}
                  </div>
                </div>
                <span style={{
                  background: s.bg, border: `1px solid ${s.border}`, color: s.color,
                  fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>{s.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type AdminTab = 'approvals' | 'questions' | 'organizations' | 'coaches' | 'audit' | 'admins' | 'pilot' | 'participants' | 'waitlist' | 'acia_integrity' | 'handoffs';

// ── AACP Waitlist Panel (Admin view) ──────────────────────────────────────────

type WaitlistStatus = 'new' | 'assigned' | 'contacted' | 'guidance_scheduled' | 'program_candidate' | 'enrolled' | 'deferred' | 'not_proceeding';

const WAITLIST_STATUS_LABELS: Record<WaitlistStatus, string> = {
  new:                'New',
  assigned:           'Assigned',
  contacted:          'Contacted',
  guidance_scheduled: 'Guidance Scheduled',
  program_candidate:  'Program Candidate',
  enrolled:           'Enrolled',
  deferred:           'Deferred',
  not_proceeding:     'Not Proceeding',
};

const WAITLIST_STATUS_STYLE: Record<WaitlistStatus, { color: string; bg: string; bdr: string }> = {
  new:                { color: C.amber,   bg: C.amberBg,  bdr: C.amberBorder  },
  assigned:           { color: '#2563eb', bg: '#eff6ff',  bdr: '#bfdbfe'      },
  contacted:          { color: '#7c3aed', bg: '#f5f3ff',  bdr: '#ddd6fe'      },
  guidance_scheduled: { color: '#0369a1', bg: '#f0f9ff',  bdr: '#bae6fd'      },
  program_candidate:  { color: C.crimson, bg: C.redBg,    bdr: C.redBorder    },
  enrolled:           { color: C.green,   bg: C.greenBg,  bdr: C.greenBorder  },
  deferred:           { color: C.greyD,   bg: C.bgDeep,   bdr: C.border       },
  not_proceeding:     { color: C.greyD,   bg: C.bgDeep,   bdr: C.border       },
};

interface WaitlistEntry {
  id: string;
  userId: string;
  participantName: string;
  participantEmail: string;
  aciaCompletedAt: string | null;
  aciaStage: string | null;
  careerAlignments: Array<{ pathwayId: string; label: string; alignment: string }>;
  competencyHighlights: Array<{ key: string; label: string; state: string }>;
  status: WaitlistStatus;
  advisorId: string | null;
  advisorNotes: string | null;
  waitlistedAt: string;
  contactedAt: string | null;
}

function AdminWaitlistPanel() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'done' | 'error'>('loading');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { status?: WaitlistStatus; advisorNotes?: string }>>({});
  const [enrollState, setEnrollState] = useState<Record<string, { loading: boolean; result: string | null }>>({});

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const data = await apiFetch<{ waitlist: WaitlistEntry[] }>('/program/waitlist');
      setEntries(data.waitlist ?? []);
      setLoadState('done');
    } catch {
      setLoadState('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(entry: WaitlistEntry) {
    setSaving(entry.id);
    try {
      const patch = edits[entry.id] ?? {};
      await apiFetch(`/program/waitlist/${entry.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: patch.status ?? entry.status, advisorNotes: patch.advisorNotes ?? entry.advisorNotes }),
      });
      await load();
      setEdits(e => { const n = { ...e }; delete n[entry.id]; return n; });
    } finally {
      setSaving(null);
    }
  }

  async function enrollAndReleaseWeek1(entry: WaitlistEntry) {
    setEnrollState(s => ({ ...s, [entry.userId]: { loading: true, result: null } }));
    const token = localStorage.getItem('aacp_access_token') ?? '';
    try {
      const enrollRes = await fetch('/program/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: entry.userId, cohort: 'pilot-cohort-1' }),
      });
      if (!enrollRes.ok) { const d = await enrollRes.json() as { error?: string }; throw new Error(d.error ?? 'Enrollment failed'); }

      const releaseRes = await fetch('/program/release-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: entry.userId, week: 1 }),
      });
      if (!releaseRes.ok && releaseRes.status !== 409) {
        const d = await releaseRes.json() as { error?: string };
        throw new Error(d.error ?? 'Week release failed');
      }

      setEnrollState(s => ({ ...s, [entry.userId]: { loading: false, result: '✓ Enrolled — Week 1 released' } }));
      setEdits(prev => ({ ...prev, [entry.id]: { ...prev[entry.id], status: 'enrolled' } }));
    } catch (e) {
      setEnrollState(s => ({ ...s, [entry.userId]: { loading: false, result: `Error: ${(e as Error).message}` } }));
    }
  }

  if (loadState === 'loading') return <div style={{ color: C.greyD, fontSize: 14 }}>Loading waitlist…</div>;
  if (loadState === 'error') return <div style={{ color: C.red, fontSize: 14 }}>Failed to load waitlist.</div>;
  if (entries.length === 0) return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '40px 32px', textAlign: 'center', color: C.greyD, fontSize: 14 }}>
      No participants on the AACP waitlist yet.
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontFamily: 'Fraunces, serif', color: C.white, margin: '0 0 4px', fontSize: 'clamp(1.1rem, 2.5vw, 1.4rem)', fontWeight: 800 }}>AACP Waitlist</h2>
          <div style={{ color: C.greyD, fontSize: 13 }}>{entries.length} participant{entries.length !== 1 ? 's' : ''} waiting for placement</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entries.map(entry => {
          const isOpen = expanded === entry.id;
          const myEdit = edits[entry.id] ?? {};
          const currentStatus = (myEdit.status ?? entry.status) as WaitlistStatus;
          const style = WAITLIST_STATUS_STYLE[currentStatus] ?? WAITLIST_STATUS_STYLE.new;
          return (
            <div key={entry.id} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <button
                onClick={() => setExpanded(isOpen ? null : entry.id)}
                style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: C.white }}>{entry.participantName}</span>
                    <span style={{ background: style.bg, color: style.color, border: `1px solid ${style.bdr}`, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                      {WAITLIST_STATUS_LABELS[currentStatus]}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: C.greyD, marginTop: 3 }}>
                    {entry.participantEmail} · Waitlisted {new Date(entry.waitlistedAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
                    {entry.aciaCompletedAt && ` · ACIA baseline ${new Date(entry.aciaCompletedAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}`}
                  </div>
                </div>
                <span style={{ color: C.greyD, fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: '16px 20px', background: C.bgDeep }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
                    {entry.careerAlignments.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.greyD, marginBottom: 8 }}>Career Pathway Alignments</div>
                        {entry.careerAlignments.map((ca, i) => <div key={i} style={{ fontSize: 13, color: C.grey }}>{ca.label}</div>)}
                      </div>
                    )}
                    {entry.competencyHighlights.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.greyD, marginBottom: 8 }}>Observed Competencies</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {entry.competencyHighlights.map((c, i) => (
                            <span key={i} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: C.bgCard, color: C.grey, border: `1px solid ${C.border}` }}>{c.label}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {entry.contactedAt && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.greyD, marginBottom: 4 }}>Last Contacted</div>
                        <div style={{ fontSize: 13, color: C.grey }}>{new Date(entry.contactedAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                      </div>
                    )}
                  </div>

                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.greyD, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status</label>
                      <select
                        value={currentStatus}
                        onChange={e => setEdits(prev => ({ ...prev, [entry.id]: { ...prev[entry.id], status: e.target.value as WaitlistStatus } }))}
                        style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 13, color: C.white, background: C.bgCard, fontFamily: 'inherit' }}
                      >
                        {(Object.keys(WAITLIST_STATUS_LABELS) as WaitlistStatus[]).map(s => (
                          <option key={s} value={s}>{WAITLIST_STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.greyD, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notes</label>
                      <textarea
                        rows={3}
                        value={myEdit.advisorNotes ?? entry.advisorNotes ?? ''}
                        onChange={e => setEdits(prev => ({ ...prev, [entry.id]: { ...prev[entry.id], advisorNotes: e.target.value } }))}
                        placeholder="Internal notes — not visible to participant"
                        style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, color: C.white, background: C.bgCard, fontFamily: 'inherit', resize: 'vertical' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <button
                        onClick={() => save(entry)}
                        disabled={saving === entry.id}
                        style={{ background: C.crimson, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: saving === entry.id ? 'not-allowed' : 'pointer', opacity: saving === entry.id ? 0.7 : 1, fontFamily: 'inherit' }}
                      >
                        {saving === entry.id ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => enrollAndReleaseWeek1(entry)}
                        disabled={enrollState[entry.userId]?.loading}
                        style={{ background: '#1a5c2a', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: enrollState[entry.userId]?.loading ? 'not-allowed' : 'pointer', opacity: enrollState[entry.userId]?.loading ? 0.7 : 1, fontFamily: 'inherit' }}
                      >
                        {enrollState[entry.userId]?.loading ? 'Enrolling…' : 'Enroll & Release Week 1'}
                      </button>
                      {enrollState[entry.userId]?.result && (
                        <span style={{ fontSize: 12, color: enrollState[entry.userId].result!.startsWith('Error') ? C.red : '#4caf50' }}>
                          {enrollState[entry.userId].result}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Participant Override Panel ────────────────────────────────────────────────

const PATHWAY_OPTIONS = [
  { value: 'pilot',          label: 'Commercial Pilot' },
  { value: 'ame',            label: 'Aircraft Maintenance Engineer' },
  { value: 'avionics',       label: 'Avionics Technician' },
  { value: 'structures',     label: 'Structures Technician' },
  { value: 'atc',            label: 'Air Traffic Controller' },
  { value: 'fss',            label: 'Flight Service Specialist' },
  { value: 'airport_ops',    label: 'Airport Operations' },
  { value: 'ground_ops',     label: 'Ground Operations' },
  { value: 'uav',            label: 'UAV / Drone Operations' },
  { value: 'aerospace_mfg',  label: 'Aerospace Manufacturing' },
  { value: 'aerospace_eng',  label: 'Aerospace Engineering' },
  { value: 'cargo',          label: 'Cargo & Logistics' },
  { value: 'customer_ops',   label: 'Customer & Passenger Operations' },
  { value: 'aviation_tech',  label: 'Aviation Technology' },
];

interface ParticipantRecord {
  id: string;
  name: string;
  email: string;
  aciaStatus: 'completed' | 'not_started';
  aciaStage?: string;
  aciaCompletedAt?: string;
  topPathway?: string;
}

function ParticipantOverridePanel() {
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [stage, setStage] = useState('baseline');
  const [topPathway, setTopPathway] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('aacp_access_token') ?? '';
    fetch('/admin/participants', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((d: { participants?: ParticipantRecord[] }) => setParticipants(d.participants ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setResult(null);
    try {
      const token = localStorage.getItem('aacp_access_token') ?? '';
      const r = await fetch(`/admin/participants/${selectedId}/acia-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ assessmentStage: stage, topPathway: topPathway || null, adminNotes: notes.trim() || null }),
      });
      const d = await r.json();
      if (r.ok) {
        setResult({ ok: true, msg: 'ACIA marked as complete. The participant will now appear as ACIA Completed in the Career Advisor dashboard.' });
        setParticipants(prev => prev.map(p =>
          p.id === selectedId ? { ...p, aciaStatus: 'completed', aciaStage: stage, topPathway: topPathway || undefined, aciaCompletedAt: new Date().toISOString() } : p
        ));
        setSelectedId(''); setStage('baseline'); setTopPathway(''); setNotes('');
      } else {
        setResult({ ok: false, msg: d.message ?? d.error ?? 'Failed to update.' });
      }
    } catch {
      setResult({ ok: false, msg: 'Network error — please try again.' });
    } finally {
      setSaving(false);
    }
  }

  const selected = participants.find(p => p.id === selectedId);

  const sel: React.CSSProperties = {
    padding: '9px 12px', fontSize: 13, color: C.white, background: C.bgDeep,
    border: `1px solid ${C.border}`, borderRadius: 8, outline: 'none', width: '100%', fontFamily: 'inherit',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `4px solid #d97706`, borderRadius: 12, padding: '20px 24px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 8 }}>
          Administrative Override
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: C.white, margin: '0 0 8px' }}>
          Mark Participant ACIA as Complete
        </h2>
        <p style={{ fontSize: 13, color: C.greyD, margin: 0, lineHeight: 1.65, maxWidth: 600 }}>
          Use this only when a participant completed the ACIA but the completion was not recorded due to a technical issue. This creates an administrative completion record and is logged in the audit trail. It does not backfill competency evidence.
        </p>
      </div>

      {/* Participant status table */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.greyD, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            All Participants — ACIA Status
          </span>
        </div>
        {loading ? (
          <div style={{ padding: '24px 20px', color: C.greyD, fontSize: 13 }}>Loading…</div>
        ) : (
          <div>
            {participants.map((p, i) => (
              <div key={p.id} style={{
                padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 14,
                borderBottom: i < participants.length - 1 ? `1px solid ${C.border}` : 'none',
                background: selectedId === p.id ? 'rgba(143,9,9,0.06)' : 'transparent',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: C.crimson,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
                }}>
                  {p.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: C.greyD }}>{p.email}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {p.aciaStatus === 'completed' ? (
                    <span style={{ background: C.greenBg, color: C.green, border: `1px solid ${C.greenBorder}`, borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                      ACIA Complete
                    </span>
                  ) : (
                    <button
                      onClick={() => setSelectedId(p.id)}
                      style={{
                        background: selectedId === p.id ? C.crimson : 'none',
                        border: `1px solid ${selectedId === p.id ? C.crimson : C.border}`,
                        color: selectedId === p.id ? '#fff' : C.greyD,
                        borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 700,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      {selectedId === p.id ? 'Selected' : 'Override'}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {participants.length === 0 && (
              <div style={{ padding: '24px 20px', color: C.greyD, fontSize: 13 }}>No participants found.</div>
            )}
          </div>
        )}
      </div>

      {/* Override form */}
      {selectedId && selected && (
        <div style={{ background: C.bgCard, border: `1px solid #d97706`, borderRadius: 12, padding: '22px 26px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>
            Override — {selected.name}
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.greyD, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Assessment Stage</span>
                <select value={stage} onChange={e => setStage(e.target.value)} style={sel} required>
                  <option value="baseline">Baseline ACIA</option>
                  <option value="completion">AACP Completion ACIA</option>
                  <option value="followup">90-Day Follow-Up ACIA</option>
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.greyD, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Top Pathway <span style={{ color: C.greyD, fontWeight: 400 }}>(optional)</span></span>
                <select value={topPathway} onChange={e => setTopPathway(e.target.value)} style={sel}>
                  <option value="">Unknown / Not recorded</option>
                  {PATHWAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.greyD, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Admin Notes <span style={{ color: C.greyD, fontWeight: 400 }}>(logged in audit trail)</span></span>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Participant completed ACIA on 2026-08-14 during pilot testing. Save failed due to payload bug (fixed 2026-08-18)."
                rows={3}
                style={{ ...sel, resize: 'vertical', lineHeight: 1.6 }}
              />
            </label>
            {result && (
              <div style={{
                background: result.ok ? C.greenBg : '#fef2f2',
                border: `1px solid ${result.ok ? C.greenBorder : '#fecaca'}`,
                borderRadius: 8, padding: '10px 14px',
                fontSize: 13, color: result.ok ? C.green : '#b91c1c', lineHeight: 1.6,
              }}>
                {result.msg}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  background: '#d97706', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                  fontFamily: 'inherit',
                }}
              >
                {saving ? 'Saving…' : 'Mark ACIA Complete'}
              </button>
              <button
                type="button"
                onClick={() => { setSelectedId(''); setResult(null); }}
                style={{
                  background: 'none', border: `1px solid ${C.border}`, color: C.greyD,
                  borderRadius: 8, padding: '10px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ── Coach Invitations Panel ──────────────────────────────────────────────────

const COACH_ORG_TYPE_LABELS: Record<string, string> = {
  employer: 'Employer Partner',
  educational_institution: 'Educational Institution',
  industry_association: 'Industry Association',
  aacp_direct: 'AACP Direct',
};

interface CoachInvitation {
  id: string;
  email: string;
  name: string;
  organizationType: string;
  organizationName: string | null;
  notes: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  invitedBy: string;
  status: 'pending' | 'accepted' | 'expired';
}

function CoachInvitationsPanel() {
  const [invitations, setInvitations] = useState<CoachInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', organizationType: 'aacp_direct', organizationName: '', notes: '' });
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgOk, setMsgOk] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ invitations: CoachInvitation[] }>('/admin/coach-invitations');
      setInvitations(res.invitations);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to load invitations'); setMsgOk(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true); setMsg('');
    try {
      await apiFetch('/admin/coach-invitations/send', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          organizationType: form.organizationType,
          organizationName: form.organizationType !== 'aacp_direct' ? form.organizationName : undefined,
          notes: form.notes || undefined,
        }),
      });
      setMsg('Invitation sent to ' + form.email); setMsgOk(true);
      setForm({ name: '', email: '', organizationType: 'aacp_direct', organizationName: '', notes: '' });
      setShowForm(false);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to send invitation'); setMsgOk(false);
    } finally {
      setSending(false);
    }
  }

  function statusStyle(inv: CoachInvitation) {
    if (inv.acceptedAt) return { label: 'Accepted', color: C.green, bg: C.greenBg, border: C.greenBorder };
    if (new Date(inv.expiresAt) < new Date()) return { label: 'Expired', color: C.greyD, bg: '#1e293b', border: '#334155' };
    return { label: 'Pending', color: C.amber, bg: C.amberBg, border: C.amberBorder };
  }


  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: 'Fraunces, serif', color: C.white, margin: '0 0 4px', fontSize: 'clamp(1.1rem, 2.5vw, 1.5rem)', fontWeight: 700 }}>
            Coach Invitations
          </h2>
          <div style={{ color: C.grey, fontSize: 13 }}>
            Invite career coaches sponsored by employer partners, schools, or industry associations
          </div>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{ background: C.crimson, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          {showForm ? 'Cancel' : '+ Invite Coach'}
        </button>
      </div>

      {msg && (
        <div style={{
          background: msgOk ? C.greenBg : C.redBg,
          border: `1px solid ${msgOk ? C.greenBorder : C.redBorder}`,
          color: msgOk ? C.green : C.red,
          borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16,
        }}>
          {msg}
        </div>
      )}

      {showForm && (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.crimson, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
            New Coach Invitation
          </div>
          <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ fontSize: 12, color: C.grey, display: 'flex', flexDirection: 'column', gap: 4 }}>
                Full Name
                <input
                  required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Coach's full name"
                  style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, fontSize: 13, padding: '9px 12px', outline: 'none' }}
                />
              </label>
              <label style={{ fontSize: 12, color: C.grey, display: 'flex', flexDirection: 'column', gap: 4 }}>
                Email Address
                <input
                  required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="coach@organization.com"
                  style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, fontSize: 13, padding: '9px 12px', outline: 'none' }}
                />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ fontSize: 12, color: C.grey, display: 'flex', flexDirection: 'column', gap: 4 }}>
                Sponsoring Organisation Type
                <select
                  value={form.organizationType} onChange={e => setForm(f => ({ ...f, organizationType: e.target.value, organizationName: '' }))}
                  style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, fontSize: 13, padding: '9px 12px', outline: 'none' }}
                >
                  {Object.entries(COACH_ORG_TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
              {form.organizationType !== 'aacp_direct' && (
                <label style={{ fontSize: 12, color: C.grey, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  Organisation Name
                  <input
                    required value={form.organizationName} onChange={e => setForm(f => ({ ...f, organizationName: e.target.value }))}
                    placeholder={form.organizationType === 'employer' ? 'e.g. Air Canada' : form.organizationType === 'educational_institution' ? 'e.g. NAIT' : 'e.g. ATAC'}
                    style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, fontSize: 13, padding: '9px 12px', outline: 'none' }}
                  />
                </label>
              )}
            </div>
            <label style={{ fontSize: 12, color: C.grey, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Personal Message (optional)
              <textarea
                rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="A short note to include in the invitation email…"
                style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, fontSize: 13, padding: '9px 12px', outline: 'none', resize: 'vertical' }}
              />
            </label>
            <div style={{ fontSize: 12, color: C.greyD, padding: '8px 12px', background: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: 8 }}>
              The invitation link expires in 7 days. The coach must complete MFA setup before accessing the coaching dashboard.
            </div>
            <button type="submit" disabled={sending} style={{
              background: C.crimson, color: '#fff', border: 'none', borderRadius: 8,
              padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start',
            }}>
              {sending ? 'Sending…' : 'Send Invitation'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ color: C.grey, fontSize: 13, padding: 20 }}>Loading invitations…</div>
      ) : invitations.length === 0 ? (
        <div style={{ color: C.grey, fontSize: 13, padding: 20 }}>No coach invitations yet. Use the button above to invite a career coach.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {invitations.map(inv => {
            const s = statusStyle(inv);
            return (
              <div key={inv.id} style={{
                background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12,
                padding: '14px 18px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ color: C.white, fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{inv.name}</div>
                  <div style={{ color: C.grey, fontSize: 12, marginBottom: 4 }}>{inv.email}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{
                      background: '#1e2a3a', border: `1px solid ${C.border}`, color: C.grey,
                      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>{COACH_ORG_TYPE_LABELS[inv.organizationType] ?? inv.organizationType}</span>
                    {inv.organizationName && (
                      <span style={{ color: C.greyD, fontSize: 12 }}>{inv.organizationName}</span>
                    )}
                  </div>
                  <div style={{ color: C.greyD, fontSize: 11, marginTop: 6 }}>
                    Sent {fmtDate(inv.createdAt)} · Expires {fmtDate(inv.expiresAt)} · Invited by {inv.invitedBy}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  <span style={{
                    background: s.bg, border: `1px solid ${s.border}`, color: s.color,
                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>{s.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// â”€â”€ Pilot Access Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface PilotInvitation {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organization: string | null;
  pilotRole: string;
  cohortName: string | null;
  notes: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedByName: string | null;
  revokedAt: string | null;
  createdAt: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
}

const PILOT_STATUS_STYLES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending:  { label: 'Pending',  color: C.amber, bg: C.amberBg, border: C.amberBorder },
  accepted: { label: 'Accepted', color: C.green, bg: C.greenBg, border: C.greenBorder },
  expired:  { label: 'Expired',  color: C.greyD, bg: '#1e293b', border: '#334155' },
  revoked:  { label: 'Revoked',  color: C.red,   bg: C.redBg,   border: C.redBorder },
};

function PilotAccessPanel() {
  const [invitations, setInvitations] = useState<PilotInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', organization: '', pilotRole: 'youth', cohortName: '', notes: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadInvitations = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await apiFetch<{ invitations: PilotInvitation[] }>('/pilot/invitations');
      setInvitations(data.invitations);
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to load invitations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadInvitations(); }, [loadInvitations]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true); setCreateError(null); setCreatedLink(null);
    try {
      const data = await apiFetch<{ token: string; invitationId: string }>('/pilot/invitations', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          organization: form.organization.trim() || undefined,
          pilotRole: form.pilotRole,
          cohortName: form.cohortName.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      const link = `${window.location.origin}/app?pilot=${data.token}`;
      setCreatedLink(link);
      setForm({ firstName: '', lastName: '', email: '', organization: '', pilotRole: 'youth', cohortName: '', notes: '' });
      loadInvitations();
    } catch (e: unknown) {
      setCreateError((e as Error).message || 'Failed to create invitation');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(inv: PilotInvitation) {
    if (!confirm(`Revoke invitation for ${inv.email}?`)) return;
    setActionError(null);
    try {
      await apiFetch(`/pilot/invitations/${inv.id}/revoke`, { method: 'PUT' });
      loadInvitations();
    } catch (e: unknown) { setActionError((e as Error).message || 'Failed to revoke'); }
  }

  async function handleExtend(inv: PilotInvitation) {
    setActionError(null);
    try {
      await apiFetch(`/pilot/invitations/${inv.id}/extend`, { method: 'PUT' });
      loadInvitations();
    } catch (e: unknown) { setActionError((e as Error).message || 'Failed to extend'); }
  }

  function copyLink(link: string) {
    navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10,
    padding: '10px 13px', color: C.white, fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { display: 'block', color: C.greyD, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Create invitation form */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '24px' }}>
        <div style={{ color: C.white, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Invite a Pilot Tester</div>
        <div style={{ color: C.greyD, fontSize: 13, marginBottom: 20 }}>
          Send a secure invitation link that grants access to the platform for evaluation purposes.
        </div>

        {createdLink && (
          <div style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ color: C.green, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Invitation created — share this link:</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <code style={{ color: C.grey, fontSize: 12, wordBreak: 'break-all', flex: 1 }}>{createdLink}</code>
              <button
                onClick={() => copyLink(createdLink)}
                style={{ background: copied ? C.green : C.border, color: C.white, border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0 }}
              >
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
            <div style={{ color: C.greyD, fontSize: 12, marginTop: 8 }}>This link will not be shown again. Copy it now.</div>
          </div>
        )}

        <form onSubmit={handleCreate}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>First Name</label>
              <input required value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} placeholder="Jane" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Last Name</label>
              <input required value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Smith" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Email Address</label>
              <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@example.com" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Role</label>
              <select value={form.pilotRole} onChange={e => setForm(f => ({ ...f, pilotRole: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="youth">Participant</option>
                <option value="coach">Coach</option>
                <option value="employer">Employer Partner</option>
                <option value="postsecondary">Post-Secondary Partner</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Organization (optional)</label>
              <input value={form.organization} onChange={e => setForm(f => ({ ...f, organization: e.target.value }))} placeholder="Company / institution" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Cohort (optional)</label>
              <input value={form.cohortName} onChange={e => setForm(f => ({ ...f, cohortName: e.target.value }))} placeholder="e.g. Pilot Cohort 1" style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Internal Notes (optional)</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Context for this invitation (not shown to tester)" style={inputStyle} />
          </div>

          {createError && (
            <div style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
              <div style={{ color: '#fca5a5', fontSize: 13 }}>{createError}</div>
            </div>
          )}

          <button type="submit" disabled={creating} style={{
            background: creating ? C.crimsonD : `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
            color: C.white, border: 'none', borderRadius: 10, padding: '11px 24px',
            fontWeight: 700, fontSize: 13, cursor: creating ? 'not-allowed' : 'pointer',
          }}>
            {creating ? 'Creating…' : 'Generate Invitation Link →'}
          </button>
        </form>
      </div>

      {/* Invitations table */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ color: C.white, fontWeight: 700, fontSize: 15 }}>
            Invitations ({invitations.length})
          </div>
          <button onClick={loadInvitations} style={{ background: C.border, color: C.grey, border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>
            Refresh
          </button>
        </div>

        {actionError && (
          <div style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
            <div style={{ color: '#fca5a5', fontSize: 13 }}>{actionError}</div>
          </div>
        )}

        {loading ? (
          <div style={{ color: C.grey, fontSize: 13, textAlign: 'center', padding: 32 }}>Loading…</div>
        ) : error ? (
          <div style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ color: '#fca5a5', fontWeight: 700, marginBottom: 4, fontSize: 13 }}>Unable to load invitations</div>
            <div style={{ color: C.grey, fontSize: 13 }}>Check your connection or try refreshing.</div>
          </div>
        ) : invitations.length === 0 ? (
          <div style={{ color: C.grey, fontSize: 13, textAlign: 'center', padding: 32 }}>No invitations yet. Create the first one above.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {invitations.map(inv => {
              const st = PILOT_STATUS_STYLES[inv.status] ?? PILOT_STATUS_STYLES.expired;
              const roleMap: Record<string, string> = { youth: 'Participant', coach: 'Coach', employer: 'Employer', postsecondary: 'Post-Sec' };
              return (
                <div key={inv.id} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ color: C.white, fontWeight: 700, fontSize: 14 }}>{inv.firstName} {inv.lastName}</span>
                      <span style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.color, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase' }}>
                        {st.label}
                      </span>
                      <span style={{ background: '#1e293b', border: '1px solid #334155', color: C.greyD, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4 }}>
                        {roleMap[inv.pilotRole] ?? inv.pilotRole}
                      </span>
                    </div>
                    <div style={{ color: C.greyD, fontSize: 12 }}>{inv.email}</div>
                    {inv.organization && <div style={{ color: C.grey, fontSize: 12 }}>{inv.organization}</div>}
                    {inv.cohortName && <div style={{ color: C.grey, fontSize: 11, marginTop: 2 }}>Cohort: {inv.cohortName}</div>}
                    <div style={{ color: C.grey, fontSize: 11, marginTop: 4 }}>
                      {inv.status === 'accepted' && inv.acceptedByName
                        ? `Accepted by ${inv.acceptedByName} · ${fmtDate(inv.acceptedAt!)}`
                        : inv.status === 'pending'
                        ? `Expires ${fmtDate(inv.expiresAt)}`
                        : inv.status === 'revoked'
                        ? `Revoked ${fmtDate(inv.revokedAt!)}`
                        : `Expired ${fmtDate(inv.expiresAt)}`}
                    </div>
                  </div>
                  {inv.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                      <button
                        onClick={() => handleExtend(inv)}
                        style={{ background: '#1e293b', color: C.greyD, border: '1px solid #334155', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}
                      >
                        +7 days
                      </button>
                      <button
                        onClick={() => handleRevoke(inv)}
                        style={{ background: C.redBg, color: C.red, border: `1px solid ${C.redBorder}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}
                      >
                        Revoke
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Handoff Management Panel (admin) ─────────────────────────────────────────

type HandoffStatus = 'draft' | 'awaiting_consent' | 'authorized' | 'ready' | 'sent' | 'acknowledged' | 'closed' | 'cancelled';

interface HandoffRecord {
  id: string;
  participant_id: string;
  participant_name: string;
  participant_email: string;
  direction_id: string | null;
  destination_org_id: string;
  org_name: string;
  destination_type: string;
  handoff_type: string;
  handoff_status: HandoffStatus;
  consent_id: string | null;
  initiated_at: string;
  sent_at: string | null;
  acknowledged_at: string | null;
  closed_at: string | null;
}

interface HandoffDetail extends HandoffRecord {
  consent: { id: string; consent_status: string; information_categories: string; consent_purpose: string; consent_text_version: string; granted_at: string | null } | null;
  direction: { id: string; direction_label: string; direction_type: string; target_occupation: string | null; status: string } | null;
  admin_notes: string | null;
}

interface OrgOption { id: string; name: string; handoff_authorized: number; org_type: string | null; }
interface ParticipantOption { id: string; name: string; email: string; }
interface DirectionOption { id: string; direction_label: string; direction_type: string; target_occupation: string | null; }

const STATUS_COLOR: Record<string, string> = {
  draft: C.greyD, awaiting_consent: C.amber, authorized: C.blue ?? '#3b82f6',
  ready: '#8b5cf6', sent: C.green, acknowledged: C.green, closed: C.greyD, cancelled: C.red,
};

function HandoffStatusChip({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? C.greyD;
  return (
    <span style={{
      background: `${color}22`, border: `1px solid ${color}55`, color,
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 3,
      textTransform: 'uppercase', letterSpacing: '0.07em',
    }}>{status.replace('_', ' ')}</span>
  );
}

function HandoffManagementPanel() {
  const [handoffs, setHandoffs] = useState<HandoffRecord[]>([]);
  const [selected, setSelected] = useState<HandoffDetail | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [participants, setParticipants] = useState<ParticipantOption[]>([]);
  const [createForm, setCreateForm] = useState({ participant_id: '', direction_id: '', destination_org_id: '', destination_type: 'employment', handoff_type: 'partner_introduction' });
  const [directions, setDirections] = useState<DirectionOption[]>([]);
  const [consentForm, setConsentForm] = useState({ categories: [] as string[], purpose: '', show: false });
  const [outcomeForm, setOutcomeForm] = useState({ outcome_type: '', provenance: 'admin_recorded', show: false });
  const [outcomes, setOutcomes] = useState<{ id: string; outcome_type: string; provenance: string; reported_at: string }[]>([]);
  const [followups, setFollowups] = useState<{ id: string; followup_type: string; followup_status: string; due_at: string; anchor_date: string }[]>([]);

  const ALL_CATEGORIES = ['name', 'contact_email', 'career_direction', 'program_completion', 'resume', 'selected_credentials', 'competency_summary'];

  function showToast(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); }

  async function loadHandoffs() {
    setLoading(true);
    try {
      const q = statusFilter ? `?status=${statusFilter}` : '';
      const res = await apiFetch<{ handoffs: HandoffRecord[] }>(`/admin/handoffs${q}`);
      setHandoffs(res.handoffs);
    } catch (e) { showToast(e instanceof Error ? e.message : 'Failed to load handoffs', false); }
    finally { setLoading(false); }
  }

  async function loadDetail(id: string) {
    try {
      const [detail, outcomesRes, followupsRes] = await Promise.all([
        apiFetch<{ handoff: HandoffDetail; consent: HandoffDetail['consent']; direction: HandoffDetail['direction'] }>(`/admin/handoffs/${id}`),
        apiFetch<{ outcomes: typeof outcomes }>(`/admin/handoffs/${id}/outcomes`),
        apiFetch<{ followups: typeof followups }>(`/admin/handoffs/${id}/followups`),
      ]);
      setSelected({ ...detail.handoff, consent: detail.consent, direction: detail.direction });
      setOutcomes(outcomesRes.outcomes);
      setFollowups(followupsRes.followups);
    } catch (e) { showToast(e instanceof Error ? e.message : 'Failed to load detail', false); }
  }

  async function loadOrgsAndParticipants() {
    try {
      const [orgRes, pRes] = await Promise.all([
        apiFetch<{ organizations: OrgOption[] }>('/admin/organizations'),
        apiFetch<{ users: ParticipantOption[] }>('/admin/users/all'),
      ]);
      setOrgs(orgRes.organizations.filter(o => o.handoff_authorized === 1));
      setParticipants(pRes.users.filter(u => (u as any).role === 'youth' || !(u as any).role));
    } catch { /* non-fatal */ }
  }

  async function loadParticipantDirections(pid: string) {
    if (!pid) { setDirections([]); return; }
    try {
      const res = await apiFetch<{ directions: DirectionOption[] }>(`/admin/participants/${pid}/directions`);
      setDirections(res.directions.filter(d => d.status === 'active'));
    } catch { setDirections([]); }
  }

  useEffect(() => { loadHandoffs(); }, [statusFilter]);

  async function handleCreate() {
    try {
      const res = await apiFetch<{ id: string; message: string }>('/admin/handoffs', {
        method: 'POST', body: JSON.stringify(createForm),
      });
      showToast(res.message);
      setShowCreate(false);
      setCreateForm({ participant_id: '', direction_id: '', destination_org_id: '', destination_type: 'employment', handoff_type: 'partner_introduction' });
      await loadHandoffs();
    } catch (e) { showToast(e instanceof Error ? e.message : 'Create failed', false); }
  }

  async function handleStatusChange(id: string, newStatus: string) {
    try {
      const res = await apiFetch<{ message: string }>(`/admin/handoffs/${id}`, {
        method: 'PUT', body: JSON.stringify({ handoff_status: newStatus }),
      });
      showToast(res.message);
      await loadHandoffs();
      if (selected?.id === id) await loadDetail(id);
    } catch (e) { showToast(e instanceof Error ? e.message : 'Update failed', false); }
  }

  async function handleConsentRequest() {
    if (!selected) return;
    try {
      const res = await apiFetch<{ consentId: string; message: string }>(`/admin/handoffs/${selected.id}/consent-request`, {
        method: 'POST', body: JSON.stringify({ information_categories: consentForm.categories, consent_purpose: consentForm.purpose, consent_text_version: 'v1.0-DRAFT-REQUIRES-LEGAL-REVIEW' }),
      });
      showToast(res.message);
      setConsentForm(f => ({ ...f, show: false }));
      await loadDetail(selected.id);
      await loadHandoffs();
    } catch (e) { showToast(e instanceof Error ? e.message : 'Consent request failed', false); }
  }

  async function handleOutcomeRecord() {
    if (!selected) return;
    try {
      const res = await apiFetch<{ id: string; message: string }>(`/admin/handoffs/${selected.id}/outcomes`, {
        method: 'POST', body: JSON.stringify({ outcome_type: outcomeForm.outcome_type, provenance: outcomeForm.provenance }),
      });
      showToast(res.message);
      setOutcomeForm(f => ({ ...f, show: false, outcome_type: '' }));
      await loadDetail(selected.id);
    } catch (e) { showToast(e instanceof Error ? e.message : 'Outcome failed', false); }
  }

  async function handleFollowupComplete(fid: string, status: 'completed' | 'skipped') {
    if (!selected) return;
    try {
      await apiFetch(`/admin/handoffs/${selected.id}/followups/${fid}`, {
        method: 'PUT', body: JSON.stringify({ followup_status: status, provenance: 'admin_recorded' }),
      });
      showToast(`Follow-up ${status}`);
      await loadDetail(selected.id);
    } catch (e) { showToast(e instanceof Error ? e.message : 'Failed', false); }
  }

  const NEXT_STATUSES: Record<string, string[]> = {
    draft: ['awaiting_consent', 'cancelled'],
    awaiting_consent: ['cancelled'],
    authorized: ['ready', 'cancelled'],
    ready: ['sent', 'cancelled'],
    sent: ['acknowledged', 'cancelled'],
    acknowledged: ['closed', 'cancelled'],
  };

  const sectionStyle = { background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 20px', marginBottom: 14 };
  const labelStyle = { color: C.greyD, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: 4 };

  return (
    <div style={{ marginTop: 24 }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: toast.ok ? C.green : C.red, color: '#fff', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
          {toast.msg}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={labelStyle}>Partner-to-Participant Handoff Framework</div>
          <h2 style={{ fontFamily: 'Fraunces, serif', color: C.white, margin: '4px 0 0', fontSize: 20, fontWeight: 700 }}>Handoff Management</h2>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ background: C.bgDeep, border: `1px solid ${C.border}`, color: C.white, padding: '6px 10px', borderRadius: 6, fontSize: 12 }}>
            <option value="">All Statuses</option>
            {['draft','awaiting_consent','authorized','ready','sent','acknowledged','closed','cancelled'].map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
          </select>
          <button onClick={() => { setShowCreate(true); loadOrgsAndParticipants(); }} style={{ background: C.crimson, color: '#fff', border: 'none', borderRadius: 7, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            + New Handoff
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div style={{ ...sectionStyle, borderColor: C.crimson, marginBottom: 20 }}>
          <div style={{ color: C.white, fontWeight: 700, fontSize: 14, marginBottom: 14 }}>New Draft Handoff</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={labelStyle}>Participant</div>
              <select value={createForm.participant_id} onChange={e => { setCreateForm(f => ({ ...f, participant_id: e.target.value, direction_id: '' })); loadParticipantDirections(e.target.value); }}
                style={{ width: '100%', background: C.bgDeep, border: `1px solid ${C.border}`, color: C.white, padding: '7px 10px', borderRadius: 6, fontSize: 12 }}>
                <option value="">Select participant…</option>
                {participants.map(p => <option key={p.id} value={p.id}>{p.name} — {p.email}</option>)}
              </select>
            </div>
            <div>
              <div style={labelStyle}>Active Direction</div>
              <select value={createForm.direction_id} onChange={e => setCreateForm(f => ({ ...f, direction_id: e.target.value }))}
                style={{ width: '100%', background: C.bgDeep, border: `1px solid ${C.border}`, color: C.white, padding: '7px 10px', borderRadius: 6, fontSize: 12 }}>
                <option value="">No direction (edge case)</option>
                {directions.map(d => <option key={d.id} value={d.id}>{d.direction_label} ({d.direction_type})</option>)}
              </select>
            </div>
            <div>
              <div style={labelStyle}>Authorized Destination Organization</div>
              <select value={createForm.destination_org_id} onChange={e => setCreateForm(f => ({ ...f, destination_org_id: e.target.value }))}
                style={{ width: '100%', background: C.bgDeep, border: `1px solid ${C.border}`, color: C.white, padding: '7px 10px', borderRadius: 6, fontSize: 12 }}>
                <option value="">Select organization…</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              {orgs.length === 0 && <div style={{ color: C.amber, fontSize: 11, marginTop: 4 }}>No handoff-authorized organizations. Enable handoff_authorized in the Organizations tab first.</div>}
            </div>
            <div>
              <div style={labelStyle}>Destination Type</div>
              <select value={createForm.destination_type} onChange={e => setCreateForm(f => ({ ...f, destination_type: e.target.value }))}
                style={{ width: '100%', background: C.bgDeep, border: `1px solid ${C.border}`, color: C.white, padding: '7px 10px', borderRadius: 6, fontSize: 12 }}>
                <option value="employment">Employment</option>
                <option value="education_training">Education / Regulated Training</option>
                <option value="industry_experience">Industry Experience</option>
              </select>
            </div>
            <div>
              <div style={labelStyle}>Handoff Type</div>
              <select value={createForm.handoff_type} onChange={e => setCreateForm(f => ({ ...f, handoff_type: e.target.value }))}
                style={{ width: '100%', background: C.bgDeep, border: `1px solid ${C.border}`, color: C.white, padding: '7px 10px', borderRadius: 6, fontSize: 12 }}>
                <option value="pathway_guidance">Pathway Guidance</option>
                <option value="partner_introduction">Partner Introduction</option>
                <option value="application_handoff">Application Handoff</option>
                <option value="opportunity_referral">Opportunity Referral</option>
                <option value="warm_handoff">Warm Handoff</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={handleCreate} style={{ background: C.crimson, color: '#fff', border: 'none', borderRadius: 7, padding: '8px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Create Draft</button>
            <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.greyD, borderRadius: 7, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Handoff List */}
      {loading ? <div style={{ color: C.grey, fontSize: 13, padding: 20 }}>Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1.4fr' : '1fr', gap: 16, alignItems: 'start' }}>
          <div>
            {handoffs.length === 0 && <div style={{ color: C.grey, fontSize: 13, padding: '20px 0' }}>No handoffs found.</div>}
            {handoffs.map(h => (
              <div key={h.id} onClick={() => loadDetail(h.id)} style={{
                ...sectionStyle, cursor: 'pointer', marginBottom: 8,
                borderColor: selected?.id === h.id ? C.crimson : C.border,
                transition: 'border-color 0.15s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{ color: C.white, fontWeight: 700, fontSize: 13 }}>{h.participant_name || h.participant_email}</div>
                    <div style={{ color: C.grey, fontSize: 11, marginTop: 2 }}>→ {h.org_name} <span style={{ color: C.greyD }}>({h.destination_type.replace('_', ' ')})</span></div>
                  </div>
                  <HandoffStatusChip status={h.handoff_status} />
                </div>
                <div style={{ color: C.greyD, fontSize: 11, marginTop: 6 }}>{h.handoff_type.replace(/_/g, ' ')} · {new Date(h.initiated_at).toLocaleDateString('en-CA')}</div>
              </div>
            ))}
          </div>

          {/* Detail Panel */}
          {selected && (
            <div>
              <div style={{ ...sectionStyle, position: 'sticky', top: 70 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ color: C.white, fontWeight: 700, fontSize: 14 }}>Handoff Detail</div>
                  <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: C.greyD, cursor: 'pointer', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  <div><div style={labelStyle}>Participant</div><div style={{ color: C.white, fontSize: 12 }}>{selected.participant_name}</div><div style={{ color: C.grey, fontSize: 11 }}>{selected.participant_email}</div></div>
                  <div><div style={labelStyle}>Status</div><HandoffStatusChip status={selected.handoff_status} /></div>
                  <div><div style={labelStyle}>Destination</div><div style={{ color: C.white, fontSize: 12 }}>{selected.org_name}</div><div style={{ color: C.grey, fontSize: 11 }}>{selected.destination_type.replace('_', ' ')} · {selected.handoff_type.replace(/_/g, ' ')}</div></div>
                  {selected.direction && <div><div style={labelStyle}>Direction</div><div style={{ color: C.white, fontSize: 12 }}>{selected.direction.direction_label}</div><div style={{ color: C.grey, fontSize: 11 }}>{selected.direction.direction_type.replace('_',' ')} {selected.direction.target_occupation ? `· ${selected.direction.target_occupation}` : ''}</div></div>}
                </div>

                {/* Consent Summary */}
                <div style={{ background: C.bgDeep, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                  <div style={labelStyle}>Consent</div>
                  {selected.consent ? (
                    <div style={{ fontSize: 12 }}>
                      <span style={{ color: C.white }}>{selected.consent.consent_status.toUpperCase()}</span>
                      <span style={{ color: C.greyD, marginLeft: 8 }}>{selected.consent.consent_text_version}</span>
                      <div style={{ color: C.grey, marginTop: 4 }}>Categories: {(() => { try { return JSON.parse(selected.consent.information_categories).join(', '); } catch { return selected.consent.information_categories; } })()}</div>
                      {selected.consent.granted_at && <div style={{ color: C.green, fontSize: 11, marginTop: 2 }}>Granted {new Date(selected.consent.granted_at).toLocaleDateString('en-CA')}</div>}
                    </div>
                  ) : (
                    <div style={{ color: C.greyD, fontSize: 12 }}>No consent request yet.</div>
                  )}
                </div>

                {/* Lifecycle Actions */}
                <div style={{ marginBottom: 12 }}>
                  <div style={labelStyle}>Actions</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {selected.handoff_status === 'draft' && !consentForm.show && (
                      <button onClick={() => setConsentForm(f => ({ ...f, show: true }))} style={{ background: C.amber + '22', border: `1px solid ${C.amber}55`, color: C.amber, borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        Request Consent
                      </button>
                    )}
                    {(NEXT_STATUSES[selected.handoff_status] ?? []).map(ns => (
                      <button key={ns} onClick={() => handleStatusChange(selected.id, ns)} style={{
                        background: ns === 'cancelled' ? C.red + '22' : C.crimson + '22',
                        border: `1px solid ${ns === 'cancelled' ? C.red : C.crimson}55`,
                        color: ns === 'cancelled' ? C.red : C.crimson,
                        borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      }}>
                        → {ns.replace('_',' ')}
                      </button>
                    ))}
                    {!outcomeForm.show && ['sent','acknowledged','closed'].includes(selected.handoff_status) && (
                      <button onClick={() => setOutcomeForm(f => ({ ...f, show: true }))} style={{ background: C.green + '22', border: `1px solid ${C.green}55`, color: C.green, borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        Record Outcome
                      </button>
                    )}
                  </div>
                </div>

                {/* Consent Request Form */}
                {consentForm.show && (
                  <div style={{ background: C.bgDeep, border: `1px solid ${C.amber}55`, borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                    <div style={{ ...labelStyle, marginBottom: 8 }}>Request Participant Consent</div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ ...labelStyle, marginBottom: 4 }}>Information Categories (select what will be shared)</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {['name','contact_email','career_direction','program_completion','resume','selected_credentials','competency_summary'].map(cat => (
                          <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.white, cursor: 'pointer' }}>
                            <input type="checkbox" checked={consentForm.categories.includes(cat)} onChange={e => setConsentForm(f => ({ ...f, categories: e.target.checked ? [...f.categories, cat] : f.categories.filter(c => c !== cat) }))} />
                            {cat.replace(/_/g, ' ')}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={labelStyle}>Consent Purpose</div>
                      <input value={consentForm.purpose} onChange={e => setConsentForm(f => ({ ...f, purpose: e.target.value }))} placeholder="e.g. Introduction to ABC Airlines for employment opportunity" style={{ width: '100%', background: C.bgCard, border: `1px solid ${C.border}`, color: C.white, padding: '6px 10px', borderRadius: 6, fontSize: 12 }} />
                    </div>
                    <div style={{ color: C.amber, fontSize: 10, marginBottom: 8 }}>⚠ Consent text version v1.0-DRAFT — REQUIRES LEGAL/PRIVACY REVIEW BEFORE PRODUCTION</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={handleConsentRequest} style={{ background: C.amber + '33', border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 6, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Send Request</button>
                      <button onClick={() => setConsentForm(f => ({ ...f, show: false }))} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.greyD, borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* Outcome Record Form */}
                {outcomeForm.show && (
                  <div style={{ background: C.bgDeep, border: `1px solid ${C.green}55`, borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                    <div style={{ ...labelStyle, marginBottom: 8 }}>Record Outcome Event</div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <select value={outcomeForm.outcome_type} onChange={e => setOutcomeForm(f => ({ ...f, outcome_type: e.target.value }))} style={{ background: C.bgCard, border: `1px solid ${C.border}`, color: C.white, padding: '6px 10px', borderRadius: 6, fontSize: 12 }}>
                        <option value="">Select outcome…</option>
                        {['referred','applied','interviewed','offered','selected','entered_training','entered_industry_experience','employed','still_progressing','declined','not_selected','participant_withdrew'].map(o => <option key={o} value={o}>{o.replace(/_/g,' ')}</option>)}
                      </select>
                      <select value={outcomeForm.provenance} onChange={e => setOutcomeForm(f => ({ ...f, provenance: e.target.value }))} style={{ background: C.bgCard, border: `1px solid ${C.border}`, color: C.white, padding: '6px 10px', borderRadius: 6, fontSize: 12 }}>
                        <option value="admin_recorded">Admin Recorded</option>
                        <option value="partner_confirmed">Partner Confirmed</option>
                        <option value="participant_reported">Participant Reported</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={handleOutcomeRecord} style={{ background: C.green + '33', border: `1px solid ${C.green}`, color: C.green, borderRadius: 6, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Record</button>
                      <button onClick={() => setOutcomeForm(f => ({ ...f, show: false }))} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.greyD, borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* Outcomes */}
                {outcomes.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={labelStyle}>Outcome History (Append-Only)</div>
                    {outcomes.map(o => (
                      <div key={o.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ color: C.white, fontSize: 12 }}>{o.outcome_type.replace(/_/g,' ')}</span>
                        <span style={{ color: C.greyD, fontSize: 10 }}>{o.provenance}</span>
                        <span style={{ color: C.grey, fontSize: 10, marginLeft: 'auto' }}>{new Date(o.reported_at).toLocaleDateString('en-CA')}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Follow-ups */}
                {followups.length > 0 && (
                  <div>
                    <div style={labelStyle}>30/60/90 Follow-ups (anchored to acknowledged_at)</div>
                    {followups.map(f => (
                      <div key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ color: C.white, fontSize: 12 }}>{f.followup_type.replace('_',' ')}</span>
                        <HandoffStatusChip status={f.followup_status} />
                        <span style={{ color: C.grey, fontSize: 10, marginLeft: 4 }}>Due {new Date(f.due_at).toLocaleDateString('en-CA')}</span>
                        {f.followup_status === 'pending' && (
                          <>
                            <button onClick={() => handleFollowupComplete(f.id, 'completed')} style={{ background: C.green + '22', border: `1px solid ${C.green}55`, color: C.green, borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer', marginLeft: 'auto' }}>Complete</button>
                            <button onClick={() => handleFollowupComplete(f.id, 'skipped')} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.greyD, borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>Skip</button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminDashboard() {
  const isSuperAdmin = localStorage.getItem('aacp_role') === 'super_admin';
  const [adminTab, setAdminTab] = useState<AdminTab>('approvals');
  const [showUnlock, setShowUnlock] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [declineTarget, setDeclineTarget] = useState<Participant | null>(null);
  const [declineLoading, setDeclineLoading] = useState(false);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const loadParticipants = useCallback(async () => {
    setLoading(true);
    try {
      const statusParam = filter === 'all' ? '' : `?status=${filter}`;
      const [usersRes, notifRes] = await Promise.all([
        apiFetch<{ users: Participant[] }>(`/admin/users/all${statusParam}`),
        apiFetch<{ pendingCount: number }>('/admin/notifications'),
      ]);
      setParticipants(usersRes.users);
      setPendingCount(notifRes.pendingCount);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load participants', false);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { loadParticipants(); }, [loadParticipants]);

  async function handleApprove(userId: string) {
    setActionLoading(userId);
    try {
      const res = await apiFetch<{ message: string }>('/admin/users/action', {
        method: 'POST', body: JSON.stringify({ userId, action: 'approve' }),
      });
      showToast(res.message);
      await loadParticipants();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Action failed', false);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeclineConfirm(reason: string) {
    if (!declineTarget) return;
    setDeclineLoading(true);
    try {
      const res = await apiFetch<{ message: string }>('/admin/users/action', {
        method: 'POST', body: JSON.stringify({ userId: declineTarget.id, action: 'reject', reason }),
      });
      showToast(res.message);
      setDeclineTarget(null);
      await loadParticipants();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Action failed', false);
    } finally {
      setDeclineLoading(false);
    }
  }

  const FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'pending', label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
    { key: 'active',   label: 'Approved' },
    { key: 'rejected', label: 'Declined' },
    { key: 'all',      label: 'All' },
  ];

  return (
    <div style={{ background: C.bg, minHeight: '100%', fontFamily: 'DM Sans, sans-serif' }}>
    <div style={{ padding: 'clamp(16px, 3vw, 28px)', maxWidth: 860, marginInline: 'auto' }}>
      <style>{`
        @keyframes toastIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: toast.ok ? C.greenBg : C.redBg,
          border: `1px solid ${toast.ok ? C.greenBorder : C.redBorder}`,
          color: toast.ok ? C.green : C.red,
          borderRadius: 12, padding: '12px 18px', fontSize: 13, fontWeight: 600,
          animation: 'toastIn 0.2s ease',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}>
          {toast.ok ? '✓ ' : 'âœ• '}{toast.msg}
        </div>
      )}

      {/* Decline modal */}
      {declineTarget && (
        <DeclineModal
          participant={declineTarget}
          onConfirm={handleDeclineConfirm}
          onCancel={() => setDeclineTarget(null)}
          loading={declineLoading}
        />
      )}

      {showUnlock && <AssessmentUnlockModal onClose={() => setShowUnlock(false)} />}

      {/* Admin top-level tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 28, borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        {([
          { key: 'approvals', label: `Approvals${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
          { key: 'waitlist', label: 'AACP Waitlist' },
          { key: 'organizations', label: 'Organizations' },
          { key: 'coaches', label: 'Coach Invitations' },
          { key: 'participants', label: 'Participant Overrides' },
          { key: 'handoffs', label: 'Handoffs' },
          { key: 'acia_integrity', label: 'ACIA Integrity' },
          { key: 'pilot', label: 'Pilot Access' },
          { key: 'audit', label: 'Audit Log' },
          { key: 'questions', label: 'Question Bank' },
          ...(isSuperAdmin ? [{ key: 'admins', label: 'Admin Management' }] : []),
        ] as { key: AdminTab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setAdminTab(t.key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 18px', fontSize: 13, fontWeight: 600,
              color: adminTab === t.key ? C.white : C.greyD,
              borderBottom: `2px solid ${adminTab === t.key ? C.crimson : 'transparent'}`,
              marginBottom: -1,
              transition: 'color 0.15s, border-color 0.15s',
              letterSpacing: 0.2,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {adminTab === 'questions'      && <AdminQuestionBank />}
      {adminTab === 'handoffs'       && <HandoffManagementPanel />}
      {adminTab === 'organizations'  && <OrganizationsPanel />}
      {adminTab === 'coaches'        && <CoachInvitationsPanel />}
      {adminTab === 'participants'   && <ParticipantOverridePanel />}
      {adminTab === 'acia_integrity' && <ACIAIntegrityPanel />}
      {adminTab === 'pilot'          && <PilotAccessPanel />}
      {adminTab === 'audit'          && <AuditLogPanel />}
      {adminTab === 'admins'         && isSuperAdmin && <AdminManagementPanel />}
      {adminTab === 'waitlist'       && <AdminWaitlistPanel />}

      {adminTab === 'approvals' && <>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 6 }}>
            Registration Management
          </div>
          <h2 style={{ fontFamily: 'Fraunces, serif', color: C.white, margin: '0 0 4px', fontSize: 'clamp(1.1rem, 2.5vw, 1.5rem)', fontWeight: 800 }}>
            Participant Approvals
          </h2>
          <div style={{ color: C.greyD, fontSize: 13 }}>
            Review and action pending access requests
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowUnlock(true)}
            style={{ background: 'none', border: `1px solid ${C.border}`, color: C.greyD, borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Unlock Assessment
          </button>
          {pendingCount > 0 && (
            <div style={{
              background: C.amberBg, border: `1px solid ${C.amberBorder}`,
              borderRadius: 12, padding: '10px 16px',
            }}>
              <div style={{ color: C.amber, fontSize: 13, fontWeight: 700 }}>
                {pendingCount} awaiting approval
              </div>
              <div style={{ color: C.greyD, fontSize: 11 }}>Action required</div>
            </div>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              background: filter === f.key ? C.crimson : C.bgCard,
              color: filter === f.key ? 'white' : C.grey,
              border: `1px solid ${filter === f.key ? C.crimsonD : C.border}`,
              borderRadius: 8, padding: '7px 14px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={loadParticipants}
          style={{
            marginLeft: 'auto', background: C.bgCard, color: C.grey,
            border: `1px solid ${C.border}`, borderRadius: 8,
            padding: '7px 14px', fontSize: 12, cursor: 'pointer',
          }}
          title="Refresh"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Participant list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: C.greyD, fontSize: 14 }}>
          Loading participants…
        </div>
      ) : participants.length === 0 ? (
        <div style={{
          background: C.bgCard, border: `1px solid ${C.border}`,
          borderRadius: 16, padding: 40, textAlign: 'center',
        }}>
          <div style={{ color: C.white, fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
            {filter === 'pending' ? 'No pending approvals' : 'No participants found'}
          </div>
          <div style={{ color: C.greyD, fontSize: 13 }}>
            {filter === 'pending' ? 'All registrations have been reviewed.' : `No ${filter} participants to display.`}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {participants.map(p => (
            <ParticipantRow
              key={p.id}
              p={p}
              onApprove={handleApprove}
              onDecline={setDeclineTarget}
              actionLoading={actionLoading}
            />
          ))}
          <div style={{ color: C.greyD, fontSize: 12, textAlign: 'right', marginTop: 4 }}>
            {participants.length} participant{participants.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
      </>}

      {/* ── Internal Platform Roadmap ─────────────────────────────────────────
          Visible to AACP internal administrators only. Not shown to employers,
          participants, career advisors, validators, or any external user.       */}
      <div style={{ marginTop: 48, paddingTop: 24, borderTop: `1px solid ${C.border}` }}>
        <div style={{ color: C.greyD, fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 16 }}>
          Internal Platform Roadmap
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {/* Regional Workforce Intelligence — future capability placeholder.
              Non-functional. No mapping, geospatial, API, or data collection. */}
          <div style={{
            background: C.bgCard,
            border: `1px dashed ${C.border}`,
            borderRadius: 12,
            padding: '18px 22px',
            maxWidth: 360,
            opacity: 0.7,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>🗺</span>
              <div>
                <div style={{ color: C.white, fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>Regional Workforce Intelligence</div>
                <div style={{ color: C.greyD, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>Future Commercial Capability</div>
              </div>
            </div>
            <div style={{ color: C.grey, fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>
              Regional workforce intelligence for future talent planning, workforce-gap analysis, and employer expansion and location planning.
            </div>
            <div style={{
              display: 'inline-block',
              background: C.bgDeep,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '3px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: C.greyD,
              letterSpacing: 0.5,
            }}>
              Parked — Post-Commercialization
            </div>
          </div>
        </div>
      </div>

    </div>
    </div>
  );
}

