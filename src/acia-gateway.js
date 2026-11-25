// AACP Intelligence Gateway — ACIA™ for Career Navigator.
//
// Runs on the AWS Canada (ca-central-1) backend. Students talk only to ACIA™; this
// module decides what ACIA™ says:
//   1. Safety   — crisis or unsafe messages get a fixed response; nothing leaves AACP.
//   2. Privacy  — personal details in a message block any external request.
//   3. Interpret— intent + career/subject/sector are matched against fixed lists.
//   4. Answer   — from the verified knowledge base (src/knowledge/career-kb.js) first.
//   5. Template — only if the knowledge base has no answer AND an approved template
//                 fits: a system-level query is built from fixed, non-identifying
//                 parameters (career title, subject, sector, age band). The student's
//                 words, history, name, email or account ID are never included.
//   6. Validate — AI output is checked (no links, contacts, figures, personal
//                 questions or unsafe content) before it's cached and shown.
// External AI providers only ever see the rendered template (see buildTemplateQuery).
import KB from './knowledge/career-kb.js';

export const GATEWAY_MODEL = 'claude-haiku-4-5';

// ── 1. Safety ────────────────────────────────────────────────────────────────
// Exact wording supplied by AACP (2026-11-25).
export const CRISIS_REPLY = [
  'Your safety matters.',
  'I’m sorry you’re going through a difficult time. ACIA™ is designed to provide career guidance, but you deserve support from someone who can help.',
  'Please consider speaking with a trusted adult or school counsellor.',
  '**Kids Help Phone**\nCall 1-800-668-6868 or text CONNECT to 686868.',
  '**9-8-8 Suicide Crisis Helpline**\nCall or text 988.',
  'If you are in immediate danger, call 911.',
].join('\n\n');

const CRISIS_RE = [
  /\b(kill|hurt|harm|cut|burn)\s*(ing)?\s*(my\s*self|myself)\b/i,
  /\bself[\s-]*harm/i, /\bsuicid/i, /\bend\s+(my|it\s+all|my\s+life)\b/i, /\b(want|wanna|going)\s+to\s+die\b/i,
  /\b(don'?t|do\s+not)\s+want\s+to\s+(live|be\s+alive|exist)\b/i, /\bno\s+reason\s+to\s+live\b/i, /\bbetter\s+off\s+dead\b/i,
  /\boverdos/i, /\b(someone|somebody|they|he|she)\s+(is|are|keeps?)\s+(hurting|hitting|abusing|touching)\s+me\b/i,
  /\b(i'?m|i\s+am)\s+(being\s+)?(abused|not\s+safe)\b/i, /\bnot\s+safe\s+at\s+home\b/i,
];
const UNSAFE_RE = [
  /\b(porn|nude|nudes|sexting|onlyfans)\b/i, /\bsex(ual)?\b(?!\s*(education|ed\b))/i,
  /\b(make|build|buy)\s+(a\s+)?(bomb|gun|weapon|explosive)/i,
  /\b(buy|get|sell|score|smoke|vape)\s+(some\s+|a\s+)?(drugs|weed|cannabis|vapes?|alcohol|booze|cocaine|pills|edibles)\b/i,
  /\b(kill|shoot|stab|attack)\s+(him|her|them|someone|people|my\s+\w+)\b/i,
];
export const OFF_LIMITS_REPLY = 'I can only help with careers, school courses and training. Try asking me about a career, what it pays, or which courses to take.';

// ── 2. Privacy ───────────────────────────────────────────────────────────────
const PII_RE = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,                         // email
  /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/,           // phone
  /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][\s-]?\d[ABCEGHJ-NPRSTV-Z]\d\b/i, // Canadian postal code
  /\b\d{1,5}\s+\w+(\s+\w+)?\s+(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|crescent|cres|way|court|ct|lane|ln)\b/i,
  /\b\d{9}\b/,                                                      // student / SIN-like numbers
  /\bAACP-[A-Z0-9]{4}-[A-Z0-9]{4}\b/i,                              // AACP™ Student ID — never sent to AI providers
  /\bmy\s+(name|full\s+name|address|phone|number|email|school\s+is|birthday|password)\b/i,
  /\b(i\s+live\s+(at|on)|i\s+go\s+to\s+\w+\s+(school|high|junior))\b/i,
  /\b(19|20)\d{2}[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/, // date (e.g. birth date)
];
export const PRIVACY_NOTE = 'Just a reminder: you don’t need to share personal details like your name, contact information, address or school with ACIA™.';

// ── 3. Interpret ─────────────────────────────────────────────────────────────
const ALIASES = {
  pilot: ['pilot', 'pilots', 'airline pilot', 'fly planes', 'flying', 'captain', 'first officer', 'flight school', 'flight training'],
  uav: ['drone pilot', 'drone operator', 'drone', 'drones', 'uav', 'rpas', 'uas', 'unmanned'],
  ame: ['ame', 'aircraft maintenance', 'aircraft mechanic', 'airplane mechanic', 'aviation mechanic', 'aircraft technician'],
  avionics: ['avionics'], structures: ['structures', 'aircraft structures', 'sheet metal'],
  atc: ['air traffic', 'atc', 'controller'], fss: ['flight service', 'fss', 'flight service specialist'],
  airport_ops: ['airport operations', 'airport ops', 'airport manager'], ground_ops: ['ground crew', 'ramp', 'ground operations', 'ground handling'],
  cargo: ['cargo', 'freight', 'logistics'], customer_ops: ['flight attendant', 'cabin crew', 'customer service', 'check-in', 'airline customer'],
  aerospace_mfg: ['aerospace manufacturing', 'manufacturing'], aerospace_eng: ['aerospace engineer', 'aeronautical engineer', 'aerospace engineering'],
  aviation_tech: ['aviation technology', 'aviation technician'], gas_turbine: ['gas turbine', 'jet engine', 'turbine'],
  dispatcher: ['dispatcher', 'flight dispatch', 'dispatch'], defence_systems: ['defence', 'defense', 'military'], space_systems: ['space', 'satellite', 'astronaut', 'rocket'],
  eng_professional: ['engineer', 'engineering', 'mechanical engineer', 'civil engineer', 'electrical engineer'],
  eng_technologist: ['technologist', 'engineering technologist'], registered_nurse: ['nurse', 'nursing', 'registered nurse', 'rn'],
  practical_nurse: ['lpn', 'practical nurse', 'licensed practical nurse'], electrician: ['electrician', 'electrical trade'],
  welder: ['welder', 'welding'], millwright: ['millwright', 'industrial mechanic'], auto_tech: ['auto mechanic', 'car mechanic', 'automotive', 'mechanic'],
  heavy_equipment_tech: ['heavy equipment', 'heavy duty mechanic', 'heavy-duty'],
};
const SUBJECTS = { math: ['math', 'mathematics', 'algebra', 'calculus'], science: ['science', 'physics', 'chemistry', 'biology'], english: ['english', 'ela', 'writing', 'reading'], social: ['social studies', 'history', 'geography'], cts: ['cts', 'shop', 'robotics', 'coding', 'computer'] };
const SUBJECT_LABEL = { math: 'mathematics', science: 'science (physics, chemistry, biology)', english: 'English language arts', social: 'social studies', cts: 'career and technology studies (CTS)' };
const SECTOR_WORDS = { aviation: ['aviation', 'aerospace', 'airport', 'airline', 'aircraft'], engineering: ['engineering'], healthcare: ['healthcare', 'health care', 'medical', 'hospital'], trades: ['trades', 'trade', 'apprenticeship', 'apprentice'] };
const INTENTS = [
  ['crisis_none', []],
  ['cost', ['cost', 'tuition', 'expensive', 'afford', 'price', 'fees']],
  ['salary', ['salary', 'pay', 'paid', 'earn', 'wage', 'money', 'income', 'make a year', 'how much do']],
  ['time', ['how long', 'years to', 'how many years', 'time to become', 'how fast']],
  ['courses', ['courses', 'high school', 'classes', 'grade 10', 'grade 11', 'grade 12', 'math 30', 'english 30', 'what should i take', 'which subjects']],
  ['education', ['school', 'college', 'university', 'program', 'degree', 'diploma', 'study', 'requirement', 'admission', 'apply', 'get in', 'qualif']],
  ['outlook', ['demand', 'jobs available', 'job market', 'outlook', 'hiring', 'future', 'shortage', 'in demand']],
  ['steps', ['licence', 'license', 'certif', 'steps', 'how do i become', 'how to become', 'path', 'pathway', 'route']],
  ['day_to_day', ['typical day', 'day to day', 'daily', 'day in the life', 'what is it like', "what's it like", 'work like', 'what do they do all day']],
  ['skills', ['skills', 'good at', 'qualities', 'personality', 'strengths', 'need to be']],
  ['explore', ['explore', 'try it', 'experience', 'volunteer', 'club', 'shadow', 'summer job', 'get started now', 'while in school']],
  ['compare', ['compare', ' vs ', 'versus', 'difference between', 'better than']],
  ['list', ['what careers', 'which careers', 'list', 'options', 'jobs in', 'careers in']],
  ['scholarship', ['scholarship', 'bursary', 'grant', 'funding', 'financial aid']],
  ['overview', ['what is', 'what does', 'tell me about', 'about being', 'what do']],
  ['greeting', ['hello', 'hi', 'hey', 'help', 'what can you do', 'good morning']],
];

function careerIndex() {
  const idx = [];
  for (const p of KB.aviation) idx.push({ id: p.id, title: p.title, sector: 'aviation' });
  for (const c of KB.compare) if (!idx.some(x => x.id === c.id)) idx.push({ id: c.id, title: c.title, sector: 'aviation' });
  for (const c of KB.extraCareers) idx.push({ id: c.id, title: c.title, sector: c.sector });
  return idx;
}
const CAREERS = careerIndex();
const careerById = id => CAREERS.find(c => c.id === id) || null;
const has = (t, w) => (' ' + t + ' ').includes(w.includes(' ') ? w : ' ' + w + ' ') || (w.includes(' ') && t.includes(w));

export function interpret(text, context = {}) {
  const t = ' ' + String(text).toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ') + ' ';
  // careers mentioned (longest alias first so "aerospace engineer" beats "engineer")
  const hits = [];
  const pairs = Object.entries(ALIASES).flatMap(([id, ws]) => ws.map(w => [id, w])).sort((a, b) => b[1].length - a[1].length);
  let rest = t;
  for (const [id, w] of pairs) {
    if (has(rest, w) && careerById(id) && !hits.includes(id)) { hits.push(id); rest = rest.split(w).join(' '); }
  }
  for (const c of CAREERS) if (!hits.includes(c.id) && t.includes(' ' + c.title.toLowerCase().split(/[—(/]/)[0].trim() + ' ')) hits.push(c.id);
  const subject = Object.keys(SUBJECTS).find(k => SUBJECTS[k].some(w => has(t, w))) || null;
  const sector = Object.keys(SECTOR_WORDS).find(k => SECTOR_WORDS[k].some(w => has(t, w))) || null;
  let intent = null;
  for (const [name, words] of INTENTS) if (words.some(w => t.includes(w.includes(' ') ? w : ' ' + w))) { intent = name; break; }
  const fromContext = !hits.length && context.careerId && careerById(context.careerId) ? context.careerId : null;
  const careers = hits.length ? hits : (fromContext ? [fromContext] : []);
  if (!intent) intent = careers.length ? 'overview' : (sector ? 'list' : 'unknown');
  // "How is math used by an electrician?" → subject link, not a general overview.
  if (subject && careers.length && ['overview', 'unknown', 'skills'].includes(intent)) intent = 'subject_link';
  if (intent === 'compare' && careers.length < 2) intent = careers.length ? 'overview' : 'unknown';
  return { intent, careers, subject, sector, usedContext: !!fromContext };
}

// ── 4. Answer from the verified knowledge base ───────────────────────────────
const fmt$ = n => '$' + Math.round(n).toLocaleString('en-CA');
const courseName = id => { for (const g of KB.courses) for (const c of g.items) if (c.id === id) return c.name; return id; };
const aviation = id => KB.aviation.find(p => p.id === id);
const compareOf = id => KB.compare.find(p => p.id === id);
const extra = id => KB.extraCareers.find(p => p.id === id);
const facts = id => KB.careerFacts[id];
const programsFor = id => KB.programs.filter(p => (p.careers || []).includes(id));
const alisUrl = id => facts(id)?.profile ? KB.alisBase + facts(id).profile + '/' : null;

function reqText(req) {
  const names = (req.any || []).map(courseName).join(' or ');
  return names + (req.min ? ` (at least ${req.min}%)` : '');
}

function kbAnswer(intent, careerId, ageBand) {
  const c = careerById(careerId); if (!c) return null;
  const av = aviation(careerId), cmp = compareOf(careerId), ex = extra(careerId), f = facts(careerId);
  const title = c.title, cites = [];
  const out = s => ({ text: s, citations: cites });
  switch (intent) {
    case 'overview': {
      const what = av?.whatTheyDo || cmp?.tagline || ex?.blurb;
      if (!what) return null;
      let s = `**${title}**\n${what}`;
      if (av?.licenceType) s += `\n\nLicensing: ${av.licenceType} (${av.licenceSource}).`;
      if (av?.education) s += `\nTraining: ${av.education}.`;
      s += `\n\nYou can ask me about pay, training, high school courses or how to get started.`;
      return out(s);
    }
    case 'salary': {
      if (av?.salary) { let s = `**${title} — pay**\nTypically ${av.salary.low} to ${av.salary.high}.`; if (av.salary.note) s += ` ${av.salary.note}.`;
        if (cmp?.salary) s += `\n\nAlong a typical career: about ${fmt$(cmp.salary.entry)} at entry, ${fmt$(cmp.salary.year5)} after 5 years and ${fmt$(cmp.salary.year10)} after 10 years.`;
        if (cmp?.regions?.AB) s += ` In Alberta: about ${fmt$(cmp.regions.AB.entry)} at entry.`;
        return out(s); }
      if (f?.salary) { const u = alisUrl(careerId); if (u) cites.push({ label: 'ALIS occupation profile', url: u });
        return out(`**${title} — pay in Alberta**\n${f.salary} (2023 Alberta Wage and Salary Survey). Job outlook: ${f.outlook}.`); }
      if (cmp?.salary) return out(`**${title} — pay**\nAbout ${fmt$(cmp.salary.entry)} at entry, ${fmt$(cmp.salary.year5)} after 5 years and ${fmt$(cmp.salary.year10)} after 10 years.`);
      return null;
    }
    case 'outlook': {
      if (cmp?.jobDemand) { let s = `**${title} — job outlook**\n${cmp.jobDemand}.`; if (cmp.demand_note) s += ` ${cmp.demand_note}.`; if (cmp.demand_sources) s += `\n\nSources: ${cmp.demand_sources}.`; return out(s); }
      if (f?.outlook) { const u = alisUrl(careerId); if (u) cites.push({ label: 'ALIS occupation profile', url: u });
        return out(`**${title} — job outlook in Alberta**\nOutlook: ${f.outlook}. About ${f.employed} people work in this occupation in Alberta.`); }
      return null;
    }
    case 'cost': {
      if (cmp?.trainingCost) { let s = `**${title} — training cost**\nAbout ${fmt$(cmp.trainingCost.low)} to ${fmt$(cmp.trainingCost.high)}.`; if (cmp.trainingCost.note) s += ` ${cmp.trainingCost.note}.`;
        if (cmp.paidPathway) s += `\n\nPaid or funded options: ${cmp.paidPathway}.`; return out(s); }
      if (f?.cost?.length) { for (const x of f.cost) if (x.url) cites.push({ label: 'Official cost information', url: x.url });
        return out(`**${title} — training cost**\n` + f.cost.map(x => '• ' + x.text).join('\n')); }
      return null;
    }
    case 'time': {
      if (cmp?.timeToEntry) return out(`**${title} — how long it takes**\n${cmp.timeToEntry}.`);
      return null;
    }
    case 'steps': {
      if (av?.journey?.length) return out(`**How to become a ${title}**\n` + av.journey.slice(0, 6).map((j, i) => `${i + 1}. **${j.title}** — ${j.body}`).join('\n'));
      if (cmp?.entryRoutes?.length) return out(`**Ways into ${title}**\n` + cmp.entryRoutes.map(r => `• ${r.route} — ${r.duration}${r.cost ? ', ' + r.cost : ''}${r.note ? '. ' + r.note : ''}`).join('\n'));
      return null;
    }
    case 'education':
    case 'courses': {
      const progs = programsFor(careerId);
      if (!progs.length) { if (av?.education) return out(`**${title} — training**\n${av.education}.`); return null; }
      const lines = progs.slice(0, 4).map(p => {
        cites.push({ label: `${p.inst}: ${p.name}`, url: p.url });
        const req = p.routes?.[0]?.reqs?.map(reqText).join('; ');
        return `• **${p.name}** — ${p.inst} (${KB.routeTypes[p.type] || p.type})` + (req ? `\n  High school courses: ${req}.` : '') + (p.notes?.[0] ? `\n  ${p.notes[0]}` : '');
      });
      return out(`**${title} — ${intent === 'courses' ? 'high school courses' : 'programs and requirements'}**\n${lines.join('\n')}\n\nRequirements checked ${KB.verified.requirements}. Always confirm on the school’s page before you apply. My Courses can check your own course plan against these.`);
    }
    default: return null;
  }
}

function compareAnswer(ids) {
  const rows = ids.slice(0, 2).map(id => ({ c: careerById(id), cmp: compareOf(id), av: aviation(id), f: facts(id) }));
  if (rows.some(r => !r.c)) return null;
  const line = r => {
    const pay = r.cmp?.salary ? `${fmt$(r.cmp.salary.entry)} at entry → ${fmt$(r.cmp.salary.year10)} at 10 years` : (r.av?.salary ? `${r.av.salary.low}–${r.av.salary.high}` : (r.f?.salary || 'see the career page'));
    return `**${r.c.title}**\n• Pay: ${pay}\n• Time to start: ${r.cmp?.timeToEntry || '—'}\n• Training cost: ${r.cmp?.trainingCost ? fmt$(r.cmp.trainingCost.low) + '–' + fmt$(r.cmp.trainingCost.high) : '—'}\n• Outlook: ${r.cmp?.jobDemand || r.f?.outlook || '—'}`;
  };
  return { text: rows.map(line).join('\n\n') + '\n\nThe Compare tab shows these side by side in more detail.', citations: [] };
}

function listAnswer(sector) {
  const list = CAREERS.filter(c => !sector || c.sector === sector);
  const name = sector ? (KB.sectors.find(s => s.id === sector)?.name || sector) : 'Career Navigator';
  return { text: `**Careers in ${name}**\n` + list.map(c => '• ' + c.title).join('\n') + '\n\nAsk me about any of them — pay, training, or high school courses.', citations: [] };
}

const HELP = 'I’m ACIA™, your career guide. I can tell you about careers in aviation and aerospace, engineering, healthcare and the skilled trades — what they pay, how long training takes, which programs and high school courses you need, and the job outlook. Try: “What does an air traffic controller earn?” or “Which courses do I need for nursing?”';

// ── 5. Approved templates (the ONLY text an external AI provider ever receives) ─
const AUDIENCE = { under_13: 'student aged 12 or younger', '13_17': 'high school student aged 13 to 17', '18_plus': 'young adult' };
export const TEMPLATES = {
  day_to_day:   { needs: ['career'], render: p => `Describe what a typical workday looks like for a ${p.career} in Canada, for a ${p.audience}.` },
  skills:       { needs: ['career'], render: p => `List the main skills and personal qualities that help someone succeed as a ${p.career}, and how a ${p.audience} could start building them.` },
  explore:      { needs: ['career'], render: p => `Suggest safe, age-appropriate ways a ${p.audience} in Alberta could explore a career as a ${p.career}, such as school courses, clubs, volunteering or job shadowing.` },
  subject_link: { needs: ['career', 'subject'], render: p => `Explain how ${p.subject} is used in the work of a ${p.career}, for a ${p.audience}.` },
  sector:       { needs: ['sector'], render: p => `Give a short overview of the kinds of careers in ${p.sector} in Canada, for a ${p.audience}.` },
};
export const TEMPLATE_SYSTEM = [
  'You are a backend writing service for ACIA, a Canadian career-guidance assistant for students.',
  'You receive a single, general question. It contains no information about any person. Answer it in plain, encouraging, age-appropriate language.',
  'Rules: at most 170 words; plain text with short paragraphs or "• " bullets; no headings with #.',
  'Do NOT include: links or website names, email addresses, phone numbers, salaries or dollar amounts, admission averages, grades, percentages or other specific requirements, names of specific schools or employers, or questions asking for personal information.',
  'Do not give medical, legal or financial advice. Do not mention that you are an AI or name any AI company.',
  'If the question is not about careers, education or skills, reply exactly: OUT_OF_SCOPE',
].join('\n');

function pickTemplate(it, ageBand) {
  const career = it.careers[0] ? careerById(it.careers[0])?.title : null;
  const audience = AUDIENCE[ageBand] || AUDIENCE['13_17'];
  const sectorName = it.sector ? (KB.sectors.find(s => s.id === it.sector)?.name || null) : null;
  let id = null;
  if (career && it.subject && it.intent === 'subject_link') id = 'subject_link';
  else if (career && ['day_to_day', 'skills', 'explore'].includes(it.intent)) id = it.intent;
  else if (career && it.intent === 'overview') id = 'day_to_day';
  else if (!career && sectorName && ['overview', 'list', 'unknown'].includes(it.intent)) id = null; // KB list covers it
  if (!id) return null;
  const params = { career, subject: it.subject ? SUBJECT_LABEL[it.subject] : null, sector: sectorName, audience };
  if (TEMPLATES[id].needs.some(n => !params[n])) return null;
  const used = Object.fromEntries(['career', 'subject', 'sector', 'audience'].filter(k => params[k]).map(k => [k, params[k]]));
  return { id, params: used, query: TEMPLATES[id].render(params), cacheKey: `${id}|${it.careers[0] || ''}|${it.subject || ''}|${it.sector || ''}|${ageBand || '13_17'}` };
}

// ── 6. Validate AI output ────────────────────────────────────────────────────
const BAD_OUT = [
  /https?:\/\/|www\.|\.(com|ca|org|net)\b/i, /[A-Z0-9._%+-]+@[A-Z0-9.-]+/i, /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/,
  /\$\s?\d|\d+\s?%|\bper\s?cent\b|\bpercent\b/i, /\b(admission average|minimum (grade|mark|average)|gpa)\b/i,
  /\b(what('s| is) your (name|age|address|school|email|phone)|how old are you|where do you live|tell me your)\b/i,
  /\b(anthropic|claude|openai|chatgpt|as an ai|language model)\b/i, /\bOUT_OF_SCOPE\b/,
  ...CRISIS_RE, ...UNSAFE_RE,
];
export function validateOutput(text) {
  const t = String(text || '').trim();
  if (t.length < 40) return 'too_short';
  if (t.length > 1600) return 'too_long';
  for (const re of BAD_OUT) if (re.test(t)) return 'content_rule';
  return null;
}

// ── Storage (PostgreSQL in Canada): AI answer cache + event log (no message text, no user IDs) ─
let gatewayReady = false;
export async function ensureGatewayTables(db) {
  if (gatewayReady) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS acia_gateway_answers (
      cache_key TEXT PRIMARY KEY, template_id TEXT NOT NULL, params TEXT NOT NULL, query TEXT NOT NULL,
      answer TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', model TEXT, created_at TEXT NOT NULL,
      served_count INTEGER NOT NULL DEFAULT 0, last_served_at TEXT, reviewed_by TEXT, reviewed_at TEXT)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS acia_gateway_events (
      id TEXT PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL, intent TEXT, template_id TEXT, reason TEXT)`).run();
  gatewayReady = true;
}
async function logEvent(db, kind, { intent = null, template = null, reason = null } = {}) {
  await db.prepare(`INSERT INTO acia_gateway_events (id, at, kind, intent, template_id, reason) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), new Date().toISOString(), kind, intent, template, reason).run().catch(() => {});
}

async function callProvider(env, query) {
  if (!env.ANTHROPIC_API_KEY) return { error: 'no_key' };
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: GATEWAY_MODEL, max_tokens: 400, system: TEMPLATE_SYSTEM, messages: [{ role: 'user', content: query }] }),
    });
    if (!res.ok) return { error: `provider_${res.status}` };
    const data = await res.json();
    return { text: (data.content || []).map(b => b.text || '').join('').trim() };
  } catch (e) { return { error: 'provider_unreachable' }; } finally { clearTimeout(t); }
}

// ── Main entry ───────────────────────────────────────────────────────────────
// input: { message, ageBand, context: { careerId } }  →  { reply, source, citations, careerId, label }
export async function gatewayAnswer(env, input, { callExternal = callProvider } = {}) {
  const db = env.DB;
  await ensureGatewayTables(db);
  const message = String(input?.message ?? '').slice(0, 1000);
  const ageBand = ['under_13', '13_17', '18_plus'].includes(input?.ageBand) ? input.ageBand : '13_17';
  if (!message.trim()) return { reply: HELP, source: 'knowledge_base', citations: [] };

  if (CRISIS_RE.some(re => re.test(message))) { await logEvent(db, 'safety_crisis'); return { reply: CRISIS_REPLY, source: 'safety', citations: [] }; }
  if (UNSAFE_RE.some(re => re.test(message))) { await logEvent(db, 'safety_blocked'); return { reply: OFF_LIMITS_REPLY, source: 'safety', citations: [] }; }
  const pii = PII_RE.some(re => re.test(message));
  if (pii) await logEvent(db, 'privacy_flag');

  const it = interpret(message, input?.context || {});
  const careerId = it.careers[0] || null;
  const note = pii ? PRIVACY_NOTE + '\n\n' : '';
  const done = (r, source, extra = {}) => ({ reply: note + r.text, source, citations: r.citations || [], careerId, ...extra });

  if (it.intent === 'greeting' && !careerId) return { reply: note + HELP, source: 'knowledge_base', citations: [] };
  if (it.intent === 'scholarship') return done({ text: 'The **Scholarships & funding** tab lists grants, bursaries and awards with their official sources. ' + (careerId ? 'Many apply to students heading into ' + careerById(careerId).title + ' training.' : '') }, 'knowledge_base');
  if (it.intent === 'compare') { const r = compareAnswer(it.careers); if (r) { await logEvent(db, 'kb', { intent: it.intent }); return done(r, 'knowledge_base'); } }
  if (it.intent === 'list' && !careerId) { await logEvent(db, 'kb', { intent: it.intent }); return done(listAnswer(it.sector), 'knowledge_base'); }
  if (careerId) {
    const r = kbAnswer(it.intent, careerId, ageBand);
    if (r) { await logEvent(db, 'kb', { intent: it.intent }); return done(r, 'knowledge_base'); }
  }

  // Knowledge base had no answer → approved template, if one fits.
  const tpl = pickTemplate(it, ageBand);
  if (!tpl) {
    await logEvent(db, 'no_answer', { intent: it.intent });
    const fallback = careerId ? (kbAnswer('overview', careerId, ageBand) || { text: HELP }) : { text: HELP };
    return done(fallback, 'knowledge_base');
  }
  if (pii) { // privacy validation failed → no external request
    await logEvent(db, 'external_blocked', { intent: it.intent, template: tpl.id, reason: 'privacy' });
    return done(kbAnswer('overview', careerId, ageBand) || { text: HELP }, 'knowledge_base');
  }
  const cached = await db.prepare(`SELECT answer, status FROM acia_gateway_answers WHERE cache_key = ?`).bind(tpl.cacheKey).first();
  if (cached?.status === 'active') {
    await db.prepare(`UPDATE acia_gateway_answers SET served_count = served_count + 1, last_served_at = ? WHERE cache_key = ?`).bind(new Date().toISOString(), tpl.cacheKey).run().catch(() => {});
    await logEvent(db, 'ai_cached', { intent: it.intent, template: tpl.id });
    return done({ text: cached.answer }, 'ai_template', { label: 'General guidance' });
  }
  if (cached?.status === 'blocked') {
    await logEvent(db, 'external_blocked', { intent: it.intent, template: tpl.id, reason: 'admin_blocked' });
    return done(kbAnswer('overview', careerId, ageBand) || { text: HELP }, 'knowledge_base');
  }
  const r = await callExternal(env, tpl.query);
  const invalid = r.error || validateOutput(r.text);
  if (invalid) {
    await logEvent(db, 'external_rejected', { intent: it.intent, template: tpl.id, reason: String(invalid).slice(0, 40) });
    return done(kbAnswer('overview', careerId, ageBand) || { text: HELP }, 'knowledge_base');
  }
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO acia_gateway_answers (cache_key, template_id, params, query, answer, status, model, created_at, served_count, last_served_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, 1, ?) ON CONFLICT (cache_key) DO NOTHING`)
    .bind(tpl.cacheKey, tpl.id, JSON.stringify(tpl.params), tpl.query, r.text, GATEWAY_MODEL, now, now).run().catch(() => {});
  await logEvent(db, 'ai_generated', { intent: it.intent, template: tpl.id });
  return done({ text: r.text }, 'ai_template', { label: 'General guidance' });
}
