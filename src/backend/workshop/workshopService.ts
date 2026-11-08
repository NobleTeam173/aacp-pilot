import { Response } from 'express';
import { QUESTIONS } from './questions';

// ── In-memory session state (fast reads for SSE; DB is the durable store) ──

interface SessionState {
  id: string;
  currentQ: number;
  status: 'waiting' | 'active' | 'closed';
  revealAnswer: boolean;
  clients: Set<Response>;   // SSE subscribers
}

const sessions = new Map<string, SessionState>();

export function getOrCreateMemSession(id: string): SessionState {
  if (!sessions.has(id)) {
    sessions.set(id, { id, currentQ: -1, status: 'waiting', revealAnswer: false, clients: new Set() });
  }
  return sessions.get(id)!;
}

export function broadcastSession(id: string, event: string, data: unknown) {
  const s = sessions.get(id);
  if (!s) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of s.clients) {
    try { res.write(payload); } catch { s.clients.delete(res); }
  }
}

// ── DB helpers (uses existing db-shim pool) ────────────────────────────────

import pool from '../../db-shim.js';

function toPos(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function run(sql: string, params: unknown[] = []) {
  return (pool as any).query(toPos(sql), params);
}

// ── Session management ─────────────────────────────────────────────────────

export async function createSession(name: string, pin: string): Promise<string> {
  const id = `osca2026-${Date.now()}`;
  await run(
    `INSERT INTO workshop_sessions (id, name, presenter_pin, status, current_q) VALUES (?, ?, ?, 'waiting', -1)`,
    [id, name, pin]
  );
  getOrCreateMemSession(id);
  return id;
}

export async function getSession(id: string) {
  const r = await run(`SELECT * FROM workshop_sessions WHERE id = ?`, [id]);
  return r.rows[0] ?? null;
}

export async function activateQuestion(sessionId: string, qIndex: number, pin: string) {
  const sess = await getSession(sessionId);
  if (!sess || sess.presenter_pin !== pin) throw new Error('unauthorized');
  if (qIndex < 0 || qIndex >= QUESTIONS.length) throw new Error('invalid question');

  const mem = getOrCreateMemSession(sessionId);
  mem.currentQ = qIndex;
  mem.status = 'active';
  mem.revealAnswer = false;

  await run(
    `UPDATE workshop_sessions SET current_q = ?, status = 'active' WHERE id = ?`,
    [qIndex, sessionId]
  );

  broadcastSession(sessionId, 'question', {
    question: QUESTIONS[qIndex],
    revealAnswer: false,
    totalQuestions: QUESTIONS.length,
  });
}

export async function revealAnswer(sessionId: string, pin: string) {
  const sess = await getSession(sessionId);
  if (!sess || sess.presenter_pin !== pin) throw new Error('unauthorized');

  const mem = getOrCreateMemSession(sessionId);
  mem.revealAnswer = true;

  const q = QUESTIONS[mem.currentQ];
  if (!q) return;

  broadcastSession(sessionId, 'reveal', { correct: q.correct, explanation: q.explanation });
}

export async function closeSession(sessionId: string, pin: string) {
  const sess = await getSession(sessionId);
  if (!sess || sess.presenter_pin !== pin) throw new Error('unauthorized');
  await run(`UPDATE workshop_sessions SET status = 'closed' WHERE id = ?`, [sessionId]);
  const mem = getOrCreateMemSession(sessionId);
  mem.status = 'closed';
  broadcastSession(sessionId, 'closed', {});
}

// ── Responses ─────────────────────────────────────────────────────────────

export async function submitResponse(
  sessionId: string,
  questionId: number,
  participantId: string,
  response: unknown
) {
  const sess = await getSession(sessionId);
  if (!sess || sess.status === 'closed') throw new Error('session not active');

  const q = QUESTIONS.find(q => q.id === questionId);
  if (!q) throw new Error('unknown question');

  // Open-text questions need moderation; MCQ/wordcloud auto-approve
  const autoApprove = q.type !== 'open';

  await run(
    `INSERT INTO workshop_responses (session_id, question_id, participant_id, response, moderated, visible)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (session_id, question_id, participant_id)
     DO UPDATE SET response = EXCLUDED.response, submitted_at = NOW()`,
    [sessionId, questionId, participantId, JSON.stringify(response), autoApprove, autoApprove]
  );

  // Push updated aggregate to all listeners
  const agg = await getAggregate(sessionId, questionId);
  broadcastSession(sessionId, 'results', { questionId, aggregate: agg });

  return { ok: true };
}

export async function getAggregate(sessionId: string, questionId: number) {
  const r = await run(
    `SELECT response FROM workshop_responses
     WHERE session_id = ? AND question_id = ? AND visible = TRUE`,
    [sessionId, questionId]
  );

  const q = QUESTIONS.find(q => q.id === questionId);
  if (!q) return null;

  if (q.type === 'mcq') {
    const counts: Record<string, number> = {};
    for (const row of r.rows) {
      const opt: string = row.response?.choice || row.response;
      if (opt) counts[opt] = (counts[opt] || 0) + 1;
    }
    return { type: 'mcq', total: r.rows.length, counts };
  }

  if (q.type === 'wordcloud') {
    const words: string[] = [];
    for (const row of r.rows) {
      const w: string = (row.response?.word || row.response || '').trim().toLowerCase();
      if (w) words.push(w);
    }
    const freq: Record<string, number> = {};
    for (const w of words) freq[w] = (freq[w] || 0) + 1;
    return { type: 'wordcloud', total: r.rows.length, freq };
  }

  // open text: return approved responses list
  return {
    type: 'open',
    total: r.rows.length,
    responses: r.rows.map((row: any) => row.response?.text || row.response),
  };
}

// ── Moderation ─────────────────────────────────────────────────────────────

export async function getModQueue(sessionId: string, pin: string) {
  const sess = await getSession(sessionId);
  if (!sess || sess.presenter_pin !== pin) throw new Error('unauthorized');

  const r = await run(
    `SELECT id, question_id, response, submitted_at
     FROM workshop_responses
     WHERE session_id = ? AND moderated = FALSE
     ORDER BY submitted_at ASC`,
    [sessionId]
  );
  return r.rows;
}

export async function moderateResponse(
  sessionId: string,
  responseId: number,
  visible: boolean,
  pin: string
) {
  const sess = await getSession(sessionId);
  if (!sess || sess.presenter_pin !== pin) throw new Error('unauthorized');

  await run(
    `UPDATE workshop_responses SET moderated = TRUE, visible = ? WHERE id = ? AND session_id = ?`,
    [visible, responseId, sessionId]
  );

  // Re-broadcast updated aggregate
  const r = await run(`SELECT question_id FROM workshop_responses WHERE id = ?`, [responseId]);
  if (r.rows[0]) {
    const agg = await getAggregate(sessionId, r.rows[0].question_id);
    broadcastSession(sessionId, 'results', { questionId: r.rows[0].question_id, aggregate: agg });
  }
}

// ── Contacts ───────────────────────────────────────────────────────────────

export async function submitContact(sessionId: string, data: {
  name: string; organization: string; email: string;
  area_of_interest?: string; consent: boolean;
}) {
  await run(
    `INSERT INTO workshop_contacts (session_id, name, organization, email, area_of_interest, consent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionId, data.name, data.organization, data.email, data.area_of_interest || null, data.consent]
  );
}

// ── CSV Export ─────────────────────────────────────────────────────────────

export async function exportCSV(sessionId: string, pin: string): Promise<string> {
  const sess = await getSession(sessionId);
  if (!sess || sess.presenter_pin !== pin) throw new Error('unauthorized');

  const r = await run(
    `SELECT question_id, participant_id, response, visible, submitted_at
     FROM workshop_responses WHERE session_id = ?
     ORDER BY question_id, submitted_at`,
    [sessionId]
  );

  const lines = ['question_id,question_text,participant_id,response,visible,submitted_at'];
  for (const row of r.rows) {
    const q = QUESTIONS.find(q => q.id === row.question_id);
    const resp = typeof row.response === 'object'
      ? JSON.stringify(row.response)
      : String(row.response);
    lines.push([
      row.question_id,
      `"${(q?.text || '').replace(/"/g, '""')}"`,
      row.participant_id,
      `"${resp.replace(/"/g, '""')}"`,
      row.visible,
      row.submitted_at,
    ].join(','));
  }
  return lines.join('\n');
}

// ── Participant count ──────────────────────────────────────────────────────

export async function getParticipantCount(sessionId: string): Promise<number> {
  const r = await run(
    `SELECT COUNT(DISTINCT participant_id) AS cnt FROM workshop_responses WHERE session_id = ?`,
    [sessionId]
  );
  return parseInt(r.rows[0]?.cnt || '0', 10);
}
