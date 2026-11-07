import { Router, Request, Response } from 'express';
import {
  createSession, getSession, activateQuestion, revealAnswer, closeSession,
  submitResponse, getAggregate, getModQueue, moderateResponse,
  submitContact, exportCSV, getParticipantCount,
  getOrCreateMemSession, broadcastSession,
} from '../workshop/workshopService';
import { QUESTIONS } from '../workshop/questions';

export const workshopRouter = Router();

// ── Public: session info ───────────────────────────────────────────────────
workshopRouter.get('/session/:id', async (req: Request, res: Response) => {
  try {
    const sess = await getSession(req.params.id);
    if (!sess) return res.status(404).json({ error: 'Session not found' });
    const mem = getOrCreateMemSession(req.params.id);
    const currentQuestion = mem.currentQ >= 0 ? QUESTIONS[mem.currentQ] : null;
    res.json({
      id: sess.id,
      name: sess.name,
      status: mem.status,
      currentQ: mem.currentQ,
      currentQuestion,
      revealAnswer: mem.revealAnswer,
      totalQuestions: QUESTIONS.length,
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Public: SSE stream for live updates ───────────────────────────────────
workshopRouter.get('/session/:id/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const mem = getOrCreateMemSession(req.params.id);
  mem.clients.add(res);

  // Send current state immediately
  res.write(`event: state\ndata: ${JSON.stringify({
    currentQ: mem.currentQ,
    currentQuestion: mem.currentQ >= 0 ? QUESTIONS[mem.currentQ] : null,
    revealAnswer: mem.revealAnswer,
    status: mem.status,
  })}\n\n`);

  // Heartbeat
  const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch { clearInterval(hb); } }, 20000);

  req.on('close', () => {
    clearInterval(hb);
    mem.clients.delete(res);
  });
});

// ── Public: submit response ────────────────────────────────────────────────
workshopRouter.post('/session/:id/respond', async (req: Request, res: Response) => {
  const { questionId, participantId, response } = req.body;
  if (!questionId || !participantId || response === undefined) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  // Basic input validation
  if (typeof participantId !== 'string' || participantId.length > 64) {
    return res.status(400).json({ error: 'Invalid participantId' });
  }
  try {
    await submitResponse(req.params.id, Number(questionId), participantId, response);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ── Public: results for one question ──────────────────────────────────────
workshopRouter.get('/session/:id/results/:qid', async (req: Request, res: Response) => {
  try {
    const agg = await getAggregate(req.params.id, Number(req.params.qid));
    res.json(agg);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Public: submit contact form (optional) ────────────────────────────────
workshopRouter.post('/session/:id/contact', async (req: Request, res: Response) => {
  const { name, organization, email, area_of_interest, consent } = req.body;
  if (!name || !organization || !email || consent !== true) {
    return res.status(400).json({ error: 'Missing required contact fields or consent not given' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  try {
    await submitContact(req.params.id, { name, organization, email, area_of_interest, consent });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Presenter: create session ──────────────────────────────────────────────
workshopRouter.post('/create', async (req: Request, res: Response) => {
  const { name, pin } = req.body;
  if (!name || !pin || pin.length < 4) {
    return res.status(400).json({ error: 'name and pin (min 4 chars) required' });
  }
  try {
    const id = await createSession(name, pin);
    res.json({ id });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Presenter: activate question ──────────────────────────────────────────
workshopRouter.post('/session/:id/question', async (req: Request, res: Response) => {
  const { qIndex, pin } = req.body;
  if (qIndex === undefined || !pin) return res.status(400).json({ error: 'qIndex and pin required' });
  try {
    await activateQuestion(req.params.id, Number(qIndex), pin);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(e.message === 'unauthorized' ? 403 : 400).json({ error: e.message });
  }
});

// ── Presenter: reveal answer ───────────────────────────────────────────────
workshopRouter.post('/session/:id/reveal', async (req: Request, res: Response) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'pin required' });
  try {
    await revealAnswer(req.params.id, pin);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(e.message === 'unauthorized' ? 403 : 400).json({ error: e.message });
  }
});

// ── Presenter: close session ───────────────────────────────────────────────
workshopRouter.post('/session/:id/close', async (req: Request, res: Response) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'pin required' });
  try {
    await closeSession(req.params.id, pin);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(e.message === 'unauthorized' ? 403 : 400).json({ error: e.message });
  }
});

// ── Presenter: moderation queue ───────────────────────────────────────────
workshopRouter.get('/session/:id/modqueue', async (req: Request, res: Response) => {
  const pin = req.query.pin as string;
  if (!pin) return res.status(400).json({ error: 'pin required' });
  try {
    const items = await getModQueue(req.params.id, pin);
    res.json(items);
  } catch (e: any) {
    res.status(e.message === 'unauthorized' ? 403 : 400).json({ error: e.message });
  }
});

workshopRouter.post('/session/:id/moderate/:rid', async (req: Request, res: Response) => {
  const { pin, visible } = req.body;
  if (!pin || visible === undefined) return res.status(400).json({ error: 'pin and visible required' });
  try {
    await moderateResponse(req.params.id, Number(req.params.rid), Boolean(visible), pin);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(e.message === 'unauthorized' ? 403 : 400).json({ error: e.message });
  }
});

// ── Presenter: participant count ───────────────────────────────────────────
workshopRouter.get('/session/:id/participants', async (req: Request, res: Response) => {
  const pin = req.query.pin as string;
  if (!pin) return res.status(400).json({ error: 'pin required' });
  try {
    // Validate PIN
    const sess = await getSession(req.params.id);
    if (!sess || sess.presenter_pin !== pin) return res.status(403).json({ error: 'unauthorized' });
    const count = await getParticipantCount(req.params.id);
    res.json({ count });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Presenter: export CSV ──────────────────────────────────────────────────
workshopRouter.get('/session/:id/export', async (req: Request, res: Response) => {
  const pin = req.query.pin as string;
  if (!pin) return res.status(400).json({ error: 'pin required' });
  try {
    const csv = await exportCSV(req.params.id, pin);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="osca2026-workshop-${req.params.id}.csv"`);
    res.send(csv);
  } catch (e: any) {
    res.status(e.message === 'unauthorized' ? 403 : 400).json({ error: e.message });
  }
});

// ── Public: questions list (for participant UI bootstrapping) ──────────────
workshopRouter.get('/questions', (_req: Request, res: Response) => {
  res.json(QUESTIONS.map(q => ({ id: q.id, round: q.round, type: q.type, text: q.text, options: q.options })));
});
