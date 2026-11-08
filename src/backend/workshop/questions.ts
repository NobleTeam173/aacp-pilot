export interface Option { id: string; text: string; }
export interface Question {
  id: number;
  round: string;
  type: 'open' | 'mcq' | 'wordcloud';
  text: string;
  options?: Option[];
  correct?: string;
  explanation?: string;
}

export const QUESTIONS: Question[] = [
  // ── Opening Reflection ────────────────────────────────────────────────
  {
    id: 1,
    round: 'Opening Reflection',
    type: 'wordcloud',
    text: 'What role does a guidance counsellor play in helping a student\'s potential grow? (one word or short phrase)',
  },
  {
    id: 2,
    round: 'Opening Reflection',
    type: 'mcq',
    text: 'How often do students come to you with questions about aviation or aerospace careers?',
    options: [
      { id: 'a', text: 'Rarely — once or twice a year' },
      { id: 'b', text: 'Occasionally — a few times a year' },
      { id: 'c', text: 'Regularly — it comes up often' },
      { id: 'd', text: 'Never — students don\'t mention it' },
    ],
  },
  {
    id: 3,
    round: 'Opening Reflection',
    type: 'mcq',
    text: 'What\'s the most common reason students don\'t pursue aviation careers?',
    options: [
      { id: 'a', text: 'Cost — training seems too expensive' },
      { id: 'b', text: 'Awareness — they don\'t know what\'s available' },
      { id: 'c', text: 'Academics — requirements seem too high' },
      { id: 'd', text: 'Parents — family discourages it' },
    ],
  },

  // ── Fact or Fiction ───────────────────────────────────────────────────
  {
    id: 4,
    round: 'Fact or Fiction',
    type: 'mcq',
    text: 'A commercial airline captain in Canada earns $120,000–$250,000+. Fact or Fiction?',
    options: [
      { id: 'fact', text: '✓ Fact' },
      { id: 'fiction', text: '✗ Fiction' },
    ],
    correct: 'fact',
    explanation: 'Fact. Transport Canada data shows captains at major carriers earn $180K–$250K+. Regional first officers start ~$60K and advance rapidly as the industry faces a critical pilot shortage.',
  },
  {
    id: 5,
    round: 'Fact or Fiction',
    type: 'mcq',
    text: 'You need a university degree to become a licensed pilot in Canada. Fact or Fiction?',
    options: [
      { id: 'fact', text: '✓ Fact' },
      { id: 'fiction', text: '✗ Fiction' },
    ],
    correct: 'fiction',
    explanation: 'Fiction. No degree required. A Transport Canada Commercial Pilot Licence requires flight training + written exams. Many students enter directly from high school through college flight programs.',
  },
  {
    id: 6,
    round: 'Fact or Fiction',
    type: 'mcq',
    text: 'Canada will need 7,300+ new pilots by 2033. Fact or Fiction?',
    options: [
      { id: 'fact', text: '✓ Fact' },
      { id: 'fiction', text: '✗ Fiction' },
    ],
    correct: 'fact',
    explanation: 'Fact. Canada faces a critical shortage across ALL aviation roles — pilots, AMEs, ATCOs, and more. This is one of the fastest-growing career sectors for the next decade.',
  },

  // ── Career Discovery ──────────────────────────────────────────────────
  {
    id: 7,
    round: 'Career Discovery',
    type: 'open',
    text: 'Which aviation or aerospace career did you discover today that you would introduce to a student?',
  },

  // ── Word Cloud ────────────────────────────────────────────────────────
  {
    id: 8,
    round: 'Counsellor Insights',
    type: 'wordcloud',
    text: 'In ONE word — what do you think students most need to know about aviation careers?',
  },

  // ── Counsellor Role ───────────────────────────────────────────────────
  {
    id: 9,
    round: 'Counsellor Role',
    type: 'mcq',
    text: 'Which resource would most help you guide students into aviation and aerospace pathways?',
    options: [
      { id: 'a', text: 'Salary & career data I can share with students' },
      { id: 'b', text: 'A student-facing career compatibility tool' },
      { id: 'c', text: 'A school visit from an aviation professional' },
      { id: 'd', text: 'Scholarship and funding information' },
    ],
  },

  // ── Takeaway ──────────────────────────────────────────────────────────
  {
    id: 10,
    round: 'Your Takeaway',
    type: 'open',
    text: 'One student. One conversation. What\'s one thing you\'ll say differently after today?',
  },
];
