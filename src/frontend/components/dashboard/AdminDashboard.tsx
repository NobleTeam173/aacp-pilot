import { useState, useEffect, useCallback } from 'react';
import { QUESTION_BANK, QUESTION_FAMILIES, applyVariants } from '../acia/questionBank';
import { COMPETENCY_LABELS } from '../acia/types';
import type { CompetencyKey, QuestionRecord } from '../acia/types';
import { generateVariant, auditStaticVariant, getValidationLog } from '../acia/variantEngine';
import type { ValidationIssueRecord } from '../acia/variantEngine';

const C = {
  crimson: '#8F0909',
  crimsonD: '#721010',
  bg: '#0f0a0b',
  bgCard: '#1a0d10',
  border: '#3d1020',
  white: '#f1f5f9',
  grey: '#94a3b8',
  greyD: '#8a9ab0',
  green: '#22c55e',
  greenBg: '#0f1a0f',
  greenBorder: '#1a3a1a',
  amber: '#f59e0b',
  amberBg: '#1a1400',
  amberBorder: '#3a2a00',
  red: '#ef4444',
  redBg: '#1a0505',
  redBorder: '#3a0505',
};

type StatusFilter = 'all' | 'pending' | 'active' | 'rejected';

interface Participant {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  organizationName: string | null;
  institutionName: string | null;
  region: string | null;
  status: 'pending' | 'active' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = localStorage.getItem('aacp_access_token');
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...((opts?.headers as Record<string, string>) ?? {}) },
  });
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

// ── Decline Modal ─────────────────────────────────────────────────────────────

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

// ── Participant Row ────────────────────────────────────────────────────────────

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
                ✕ Decline
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

// ── Question Validation Panel ─────────────────────────────────────────────────

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

  const statusColor = (issues: string[]) => issues.length === 0 ? '#86efac' : '#f87171';

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
            <div style={{ background: '#0d2010', border: '1px solid #1a4a20', borderRadius: 8, padding: '12px 16px', color: '#86efac', fontSize: 13 }}>
              All {QUESTION_BANK.length} questions passed validation across sampled variants.
            </div>
          ) : (
            sampleIssues.map(({ q, issues, sample }, i) => (
              <div key={`${q.questionId}-${i}`} style={{ background: C.bgCard, border: '1px solid #5c1a1a', borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, color: '#f87171', fontSize: 12 }}>{q.questionId}</span>
                  <span style={{ color: C.grey, fontSize: 12 }}>{q.family}</span>
                  <span style={{ marginLeft: 'auto', color: C.greyD, fontSize: 11 }}>
                    {q.variantGenerator ? `generator: ${q.variantGenerator}` : 'static variant'}
                  </span>
                </div>
                <div style={{ background: '#1a0a0a', borderRadius: 4, padding: '8px 10px', marginBottom: 8, fontSize: 12, color: C.grey, fontFamily: 'monospace' }}>
                  {sample.slice(0, 200)}{sample.length > 200 ? '…' : ''}
                </div>
                {issues.map((issue, j) => (
                  <div key={j} style={{ color: '#f87171', fontSize: 12, display: 'flex', gap: 6 }}>
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
                    <span style={{ color: '#f87171', fontSize: 12, fontWeight: 700 }}>{entry.questionId}</span>
                    <span style={{ color: C.greyD, fontSize: 11 }}>{entry.family}</span>
                    {entry.participantReported && <span style={{ background: '#3a1a00', color: '#fbbf24', fontSize: 10, padding: '1px 6px', borderRadius: 3 }}>PARTICIPANT REPORTED</span>}
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

// ── Admin Question Bank ───────────────────────────────────────────────────────

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
    active: { bg: '#0f1a0f', color: '#86efac' },
    draft: { bg: '#1a1400', color: '#fde68a' },
    retired: { bg: '#1a0505', color: '#f87171' },
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
                  background: '#2d0f1a', color: C.crimson,
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
                      background: '#12080d', border: `1px solid ${C.border}`,
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
                          background: '#12080d', borderRadius: 8, padding: '8px 12px',
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

// ── Main Admin Dashboard ──────────────────────────────────────────────────────
// ── Organizations panel ───────────────────────────────────────────────────────

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
          {toast.ok ? '✓ ' : '✕ '}{toast.msg}
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
              <input required value={name} onChange={e => setName(e.target.value)} style={{ background: '#0f0a0b', color: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px', fontSize: 13 }} />
            </label>
            <label style={{ color: C.greyD, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Type *
              <select value={orgType} onChange={e => setOrgType(e.target.value as 'employer' | 'postsecondary')} style={{ background: '#0f0a0b', color: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px', fontSize: 13 }}>
                <option value="employer">Employer</option>
                <option value="postsecondary">Post-Secondary</option>
              </select>
            </label>
            <label style={{ color: C.greyD, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Partner Status
              <select value={partnerStatus} onChange={e => setPartnerStatus(e.target.value)} style={{ background: '#0f0a0b', color: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px', fontSize: 13 }}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
              </select>
            </label>
            <label style={{ color: C.greyD, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1/-1' }}>
              Approved Email Domains (comma-separated)
              <input value={domains} onChange={e => setDomains(e.target.value)} placeholder="e.g. company.com, partner.org" style={{ background: '#0f0a0b', color: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px', fontSize: 13 }} />
            </label>
            <label style={{ color: C.greyD, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Primary Contact Email
              <input type="email" value={contact} onChange={e => setContact(e.target.value)} style={{ background: '#0f0a0b', color: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px', fontSize: 13 }} />
            </label>
            <label style={{ color: C.greyD, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Notes
              <input value={notes} onChange={e => setNotes(e.target.value)} style={{ background: '#0f0a0b', color: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px', fontSize: 13 }} />
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

// ── Audit log panel ───────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  action: string;
  userId: string | null;
  entityType: string | null;
  details: string;
  timestamp: string;
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
          <input value={actionFilter} onChange={e => setActionFilter(e.target.value)} placeholder="Filter by action…" style={{ background: '#0f0a0b', color: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 12px', fontSize: 12 }} />
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

// ── Assessment unlock panel (inline in Approvals tab) ─────────────────────────

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
      <div style={{ background: '#1a0d10', border: `1px solid ${C.border}`, borderRadius: 14, padding: 28, minWidth: 380, maxWidth: 460 }}>
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
            {msg && <p style={{ color: '#f87171', fontSize: 12, margin: 0 }}>{msg}</p>}
            <label style={{ color: C.greyD, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Assessment ID
              <input required value={assessmentId} onChange={e => setAssessmentId(e.target.value)} placeholder="Assessment UUID" style={{ background: '#0f0a0b', color: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px', fontSize: 13 }} />
            </label>
            <label style={{ color: C.greyD, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Reason (required for audit record)
              <textarea required rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for unlocking this assessment…" style={{ background: '#0f0a0b', color: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px', fontSize: 13, resize: 'vertical' }} />
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

// ── Admin Management Panel (super_admin only) ─────────────────────────────────

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

type AdminTab = 'approvals' | 'questions' | 'organizations' | 'audit' | 'admins' | 'pilot';

// ── Pilot Access Panel ────────────────────────────────────────────────────────

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
              const roleMap: Record<string, string> = { youth: 'Participant', employer: 'Employer', postsecondary: 'Post-Sec' };
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
          {toast.ok ? '✓ ' : '✕ '}{toast.msg}
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
          { key: 'organizations', label: 'Organizations' },
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

      {adminTab === 'questions'     && <AdminQuestionBank />}
      {adminTab === 'organizations' && <OrganizationsPanel />}
      {adminTab === 'pilot'         && <PilotAccessPanel />}
      {adminTab === 'audit'         && <AuditLogPanel />}
      {adminTab === 'admins'        && isSuperAdmin && <AdminManagementPanel />}

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
    </div>
    </div>
  );
}
