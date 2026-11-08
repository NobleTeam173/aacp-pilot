// Workshop routes — ES module, runs in Node.js/ECS alongside server.js
import { Router } from 'express';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const router = Router();

// ── Questions ──────────────────────────────────────────────────────────────
const QUESTIONS = [
  { id:1, round:'Opening Reflection', type:'wordcloud', text:'What role does a guidance counsellor play in helping a student\'s potential grow? (one word or short phrase)' },
  { id:2, round:'Opening Reflection', type:'mcq', text:'How often do students come to you with questions about aviation or aerospace careers?', options:[{id:'a',text:'Rarely — once or twice a year'},{id:'b',text:'Occasionally — a few times a year'},{id:'c',text:'Regularly — it comes up often'},{id:'d',text:'Never — students don\'t mention it'}] },
  { id:3, round:'Opening Reflection', type:'mcq', text:'What\'s the most common reason students don\'t pursue aviation careers?', options:[{id:'a',text:'Cost — training seems too expensive'},{id:'b',text:'Awareness — they don\'t know what\'s available'},{id:'c',text:'Academics — requirements seem too high'},{id:'d',text:'Parents — family discourages it'}] },
  { id:4, round:'Fact or Fiction', type:'mcq', text:'A commercial airline captain in Canada earns $120,000–$250,000+. Fact or Fiction?', options:[{id:'fact',text:'✓ Fact'},{id:'fiction',text:'✗ Fiction'}], correct:'fact', explanation:'Fact. Transport Canada data shows captains at major carriers earn $180K–$250K+. Regional first officers start ~$60K and advance rapidly as the industry faces a critical pilot shortage.' },
  { id:5, round:'Fact or Fiction', type:'mcq', text:'You need a university degree to become a licensed pilot in Canada. Fact or Fiction?', options:[{id:'fact',text:'✓ Fact'},{id:'fiction',text:'✗ Fiction'}], correct:'fiction', explanation:'Fiction. No degree required. A Transport Canada Commercial Pilot Licence requires flight training + written exams. Many students enter directly from high school through college flight programs.' },
  { id:6, round:'Fact or Fiction', type:'mcq', text:'Canada will need 7,300+ new pilots by 2033. Fact or Fiction?', options:[{id:'fact',text:'✓ Fact'},{id:'fiction',text:'✗ Fiction'}], correct:'fact', explanation:'Fact. Canada faces a critical shortage across ALL aviation roles — pilots, AMEs, ATCOs, and more. This is one of the fastest-growing career sectors for the next decade.' },
  { id:7, round:'Career Discovery', type:'open', text:'Which aviation or aerospace career did you discover today that you would introduce to a student?' },
  { id:8, round:'Counsellor Insights', type:'wordcloud', text:'In ONE word — what do you think students most need to know about aviation careers?' },
  { id:9, round:'Counsellor Role', type:'mcq', text:'Which resource would most help you guide students into aviation and aerospace pathways?', options:[{id:'a',text:'Salary & career data I can share with students'},{id:'b',text:'A student-facing career compatibility tool'},{id:'c',text:'A school visit from an aviation professional'},{id:'d',text:'Scholarship and funding information'}] },
  { id:10, round:'Your Takeaway', type:'open', text:'One student. One conversation. What\'s one thing you\'ll say differently after today?' },
];

// ── DB helpers ─────────────────────────────────────────────────────────────
function toPos(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}
async function run(sql, params = []) {
  return pool.query(toPos(sql), params);
}

// ── In-memory session state ────────────────────────────────────────────────
const sessions = new Map();

function getOrCreateMem(id) {
  if (!sessions.has(id)) {
    sessions.set(id, { id, currentQ: -1, status: 'waiting', revealAnswer: false, clients: new Set() });
  }
  return sessions.get(id);
}

function broadcast(id, event, data) {
  const s = sessions.get(id);
  if (!s) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of s.clients) {
    try { res.write(payload); } catch { s.clients.delete(res); }
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────

// Get all questions (presenter dashboard sidebar)
router.get('/questions', (_req, res) => {
  res.json(QUESTIONS);
});

// Get session
router.get('/session/:id', async (req, res) => {
  try {
    const r = await run('SELECT * FROM workshop_sessions WHERE id = ?', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Session not found' });
    const sess = r.rows[0];
    const mem = getOrCreateMem(sess.id);
    const q = sess.current_q >= 0 ? QUESTIONS[sess.current_q] : null;
    res.json({ ...sess, currentQ: sess.current_q, currentQuestion: q, revealAnswer: mem.revealAnswer });
  } catch (e) {
    console.error('[workshop] getSession', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// SSE stream
router.get('/session/:id/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const mem = getOrCreateMem(req.params.id);
  mem.clients.add(res);

  // Send current state immediately
  try {
    const r = await run('SELECT * FROM workshop_sessions WHERE id = ?', [req.params.id]);
    if (r.rows[0]) {
      const sess = r.rows[0];
      const q = sess.current_q >= 0 ? QUESTIONS[sess.current_q] : null;
      res.write(`event: state\ndata: ${JSON.stringify({ status: sess.status, currentQ: sess.current_q, currentQuestion: q, revealAnswer: mem.revealAnswer })}\n\n`);
    }
  } catch {}

  const hb = setInterval(() => { try { res.write(':hb\n\n'); } catch {} }, 25000);
  req.on('close', () => { clearInterval(hb); mem.clients.delete(res); });
});

// Submit response
router.post('/session/:id/respond', async (req, res) => {
  const { questionId, participantId, response } = req.body;
  if (!questionId || !participantId || response === undefined) return res.status(400).json({ error: 'Missing fields' });
  try {
    const sr = await run('SELECT * FROM workshop_sessions WHERE id = ?', [req.params.id]);
    if (!sr.rows[0] || sr.rows[0].status === 'closed') return res.status(400).json({ error: 'Session not active' });
    const q = QUESTIONS.find(q => q.id === questionId);
    if (!q) return res.status(400).json({ error: 'Unknown question' });
    const autoApprove = q.type !== 'open';
    await run(
      `INSERT INTO workshop_responses (session_id, question_id, participant_id, response, moderated, visible) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (session_id, question_id, participant_id) DO UPDATE SET response = EXCLUDED.response, submitted_at = NOW()`,
      [req.params.id, questionId, participantId, JSON.stringify(response), autoApprove, autoApprove]
    );
    const agg = await getAggregate(req.params.id, questionId);
    broadcast(req.params.id, 'results', { questionId, aggregate: agg });
    res.json({ ok: true });
  } catch (e) {
    console.error('[workshop] respond', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get results for a question
router.get('/session/:id/results/:qid', async (req, res) => {
  try {
    const agg = await getAggregate(req.params.id, parseInt(req.params.qid));
    res.json(agg);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create session (presenter)
router.post('/create', async (req, res) => {
  const { name, pin } = req.body;
  if (!name || !pin || String(pin).length < 4) return res.status(400).json({ error: 'name and pin (min 4 chars) required' });
  try {
    const id = `osca2026-${Date.now()}`;
    await run(
      `INSERT INTO workshop_sessions (id, name, presenter_pin, status, current_q) VALUES (?, ?, ?, 'waiting', -1)`,
      [id, name, String(pin)]
    );
    getOrCreateMem(id);
    res.json({ id });
  } catch (e) {
    console.error('[workshop] create', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Activate question
router.post('/session/:id/question', async (req, res) => {
  const { pin, questionIndex, qIndex } = req.body;
  const questionIndex_ = questionIndex ?? qIndex;
  try {
    const sr = await run('SELECT * FROM workshop_sessions WHERE id = ?', [req.params.id]);
    const sess = sr.rows[0];
    if (!sess || sess.presenter_pin !== String(pin)) return res.status(401).json({ error: 'Unauthorized' });
    if (questionIndex_ < 0 || questionIndex_ >= QUESTIONS.length) return res.status(400).json({ error: 'Invalid question' });
    const mem = getOrCreateMem(req.params.id);
    mem.currentQ = questionIndex_;
    mem.status = 'active';
    mem.revealAnswer = false;
    await run(`UPDATE workshop_sessions SET current_q = ?, status = 'active' WHERE id = ?`, [questionIndex_, req.params.id]);
    broadcast(req.params.id, 'question', { question: QUESTIONS[questionIndex_], revealAnswer: false, totalQuestions: QUESTIONS.length });
    res.json({ ok: true });
  } catch (e) {
    console.error('[workshop] question', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reveal answer
router.post('/session/:id/reveal', async (req, res) => {
  const { pin } = req.body;
  try {
    const sr = await run('SELECT * FROM workshop_sessions WHERE id = ?', [req.params.id]);
    const sess = sr.rows[0];
    if (!sess || sess.presenter_pin !== String(pin)) return res.status(401).json({ error: 'Unauthorized' });
    const mem = getOrCreateMem(req.params.id);
    mem.revealAnswer = true;
    const q = QUESTIONS[mem.currentQ];
    if (q) broadcast(req.params.id, 'reveal', { correct: q.correct, explanation: q.explanation });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Close session
router.post('/session/:id/close', async (req, res) => {
  const { pin } = req.body;
  try {
    const sr = await run('SELECT * FROM workshop_sessions WHERE id = ?', [req.params.id]);
    const sess = sr.rows[0];
    if (!sess || sess.presenter_pin !== String(pin)) return res.status(401).json({ error: 'Unauthorized' });
    await run(`UPDATE workshop_sessions SET status = 'closed' WHERE id = ?`, [req.params.id]);
    const mem = getOrCreateMem(req.params.id);
    mem.status = 'closed';
    broadcast(req.params.id, 'closed', {});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Mod queue
router.get('/session/:id/modqueue', async (req, res) => {
  const { pin } = req.query;
  try {
    const sr = await run('SELECT * FROM workshop_sessions WHERE id = ?', [req.params.id]);
    const sess = sr.rows[0];
    if (!sess || sess.presenter_pin !== String(pin)) return res.status(401).json({ error: 'Unauthorized' });
    const r = await run(
      `SELECT id, question_id, response, submitted_at FROM workshop_responses WHERE session_id = ? AND moderated = FALSE ORDER BY submitted_at ASC`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Moderate response
router.post('/session/:id/moderate/:rid', async (req, res) => {
  const { pin, visible } = req.body;
  try {
    const sr = await run('SELECT * FROM workshop_sessions WHERE id = ?', [req.params.id]);
    const sess = sr.rows[0];
    if (!sess || sess.presenter_pin !== String(pin)) return res.status(401).json({ error: 'Unauthorized' });
    await run(`UPDATE workshop_responses SET moderated = TRUE, visible = ? WHERE id = ? AND session_id = ?`, [visible, parseInt(req.params.rid), req.params.id]);
    const r = await run('SELECT question_id FROM workshop_responses WHERE id = ?', [parseInt(req.params.rid)]);
    if (r.rows[0]) {
      const agg = await getAggregate(req.params.id, r.rows[0].question_id);
      broadcast(req.params.id, 'results', { questionId: r.rows[0].question_id, aggregate: agg });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Participant count
router.get('/session/:id/participants', async (req, res) => {
  try {
    const r = await run(`SELECT COUNT(DISTINCT participant_id) AS cnt FROM workshop_responses WHERE session_id = ?`, [req.params.id]);
    res.json({ count: parseInt(r.rows[0]?.cnt || '0', 10) });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// CSV export
router.get('/session/:id/export', async (req, res) => {
  const { pin } = req.query;
  try {
    const sr = await run('SELECT * FROM workshop_sessions WHERE id = ?', [req.params.id]);
    const sess = sr.rows[0];
    if (!sess || sess.presenter_pin !== String(pin)) return res.status(401).json({ error: 'Unauthorized' });
    const r = await run(`SELECT question_id, participant_id, response, visible, submitted_at FROM workshop_responses WHERE session_id = ? ORDER BY question_id, submitted_at`, [req.params.id]);
    const lines = ['question_id,question_text,participant_id,response,visible,submitted_at'];
    for (const row of r.rows) {
      const q = QUESTIONS.find(q => q.id === row.question_id);
      const resp = typeof row.response === 'object' ? JSON.stringify(row.response) : String(row.response);
      lines.push([row.question_id, `"${(q?.text || '').replace(/"/g, '""')}"`, row.participant_id, `"${resp.replace(/"/g, '""')}"`, row.visible, row.submitted_at].join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="workshop-${req.params.id}.csv"`);
    res.send(lines.join('\n'));
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Contact form
router.post('/session/:id/contact', async (req, res) => {
  const { name, organization, email, area_of_interest, consent } = req.body;
  if (!name || !organization || !email) return res.status(400).json({ error: 'name, organization, email required' });
  try {
    await run(`INSERT INTO workshop_contacts (session_id, name, organization, email, area_of_interest, consent) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.id, name, organization, email, area_of_interest || null, !!consent]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Aggregate helper ───────────────────────────────────────────────────────
async function getAggregate(sessionId, questionId) {
  const r = await run(`SELECT response FROM workshop_responses WHERE session_id = ? AND question_id = ? AND visible = TRUE`, [sessionId, questionId]);
  const q = QUESTIONS.find(q => q.id === questionId);
  if (!q) return null;

  if (q.type === 'mcq') {
    const counts = {};
    for (const row of r.rows) {
      const opt = row.response?.choice || row.response;
      if (opt) counts[opt] = (counts[opt] || 0) + 1;
    }
    return { type: 'mcq', total: r.rows.length, counts };
  }
  if (q.type === 'wordcloud') {
    const freq = {};
    for (const row of r.rows) {
      const w = (row.response?.word || row.response || '').trim().toLowerCase();
      if (w) freq[w] = (freq[w] || 0) + 1;
    }
    return { type: 'wordcloud', total: r.rows.length, freq };
  }
  return { type: 'open', total: r.rows.length, responses: r.rows.map(row => row.response?.text || row.response) };
}

export default router;
