export interface Option { id: string; label: string }
export interface Question {
  id: number;
  round: string;
  type: 'open' | 'mcq' | 'wordcloud';
  text: string;
  options?: Option[];
  correct?: string;        // option id for quiz questions
  explanation?: string;
  multiselect?: boolean;
  discussionPrompt?: string;
  scored?: boolean;        // false = insight/discussion only
}

export const QUESTIONS: Question[] = [
  // ── Opening Reflection (after video) ──────────────────────────────────
  { id: 1, round: 'Opening Reflection', type: 'open',
    text: 'Where do you see yourself, as a guidance counsellor, in this process?' },
  { id: 2, round: 'Opening Reflection', type: 'open',
    text: 'What do you think the seed represents?' },
  { id: 3, round: 'Opening Reflection', type: 'open',
    text: 'What does the young person need for that seed to grow?' },
  { id: 4, round: 'Opening Reflection', type: 'open',
    text: 'What do the branches represent?' },

  // ── Round 1: Aviation — Fact or Fiction? ──────────────────────────────
  { id: 5, round: 'Round 1: Fact or Fiction?', type: 'mcq', scored: false,
    text: 'Do you need a university degree to become a commercial pilot in Canada?',
    options: [
      { id: 'A', label: 'Yes, a university degree is mandatory' },
      { id: 'B', label: 'No, but required flight training and licensing are necessary' },
      { id: 'C', label: 'Only if you want to fly internationally' },
      { id: 'D', label: 'Not sure' },
    ],
    correct: 'B',
    explanation: 'A university degree is not a general Transport Canada requirement for a commercial pilot licence. Applicable training, experience, examinations and medical requirements still apply.' },
  { id: 6, round: 'Round 1: Fact or Fiction?', type: 'mcq', scored: false,
    text: 'Which of these careers exist within aviation?',
    options: [
      { id: 'A', label: 'Aircraft Maintenance Engineer' },
      { id: 'B', label: 'RPAS Operator' },
      { id: 'C', label: 'Flight Dispatcher' },
      { id: 'D', label: 'All of the above' },
    ],
    correct: 'D',
    explanation: 'All three are established aviation careers in Canada.' },
  { id: 7, round: 'Round 1: Fact or Fiction?', type: 'mcq', scored: false,
    text: 'Do all aviation careers require advanced mathematics?',
    options: [
      { id: 'A', label: 'Yes' },
      { id: 'B', label: 'No, requirements vary by occupation' },
      { id: 'C', label: 'Only pilots need mathematics' },
      { id: 'D', label: 'Not sure' },
    ],
    correct: 'B',
    explanation: 'Mathematical requirements vary widely. A flight dispatcher or airport operations role needs far less math than an aerospace engineer.' },

  // ── Round 2: Why Aren't More Youth Exploring Aviation? ────────────────
  { id: 8, round: 'Round 2: Counsellor Insights', type: 'mcq', scored: false,
    text: 'What do you believe is the biggest reason young people do not consider aviation and aerospace careers?',
    options: [
      { id: 'A', label: 'Limited awareness of available careers' },
      { id: 'B', label: 'Perceived training costs' },
      { id: 'C', label: 'Lack of exposure and role models' },
      { id: 'D', label: 'Misconceptions about academic requirements' },
      { id: 'E', label: 'Limited access to career guidance resources' },
      { id: 'F', label: 'Other / Not sure' },
    ] },
  { id: 9, round: 'Round 2: Counsellor Insights', type: 'mcq', scored: false,
    text: 'At what stage do students typically begin expressing interest in aviation careers?',
    options: [
      { id: 'A', label: 'Elementary school' },
      { id: 'B', label: 'Grades 7–8' },
      { id: 'C', label: 'Grades 9–10' },
      { id: 'D', label: 'Grades 11–12' },
      { id: 'E', label: 'Rarely or never' },
    ] },
  { id: 10, round: 'Round 2: Counsellor Insights', type: 'mcq', scored: false,
    text: 'What would most encourage young people to explore aviation careers?',
    options: [
      { id: 'A', label: 'Visits from aviation professionals' },
      { id: 'B', label: 'Hands-on aviation experiences' },
      { id: 'C', label: 'Clear career pathway information' },
      { id: 'D', label: 'Career discovery tools' },
      { id: 'E', label: 'Exposure to employers and training institutions' },
      { id: 'F', label: 'Other' },
    ] },

  // ── Round 3: The Guidance Counsellor's Role ───────────────────────────
  { id: 11, round: "Round 3: Counsellor's Role", type: 'mcq', scored: false,
    text: "What role should guidance counsellors play in helping students discover aviation careers?",
    options: [
      { id: 'A', label: 'Introduce students to aviation career possibilities' },
      { id: 'B', label: "Help identify students' strengths and interests" },
      { id: 'C', label: 'Connect students with career and training resources' },
      { id: 'D', label: 'Support conversations with parents and caregivers' },
      { id: 'E', label: 'All of the above' },
    ],
    correct: 'E',
    explanation: 'Discussion: All of the above.',
    discussionPrompt: 'What specific actions can you take this semester?' },
  { id: 12, round: "Round 3: Counsellor's Role", type: 'mcq', scored: false,
    text: 'How confident are you in guiding students toward aviation and aerospace careers?',
    options: [
      { id: 'A', label: 'Very confident' },
      { id: 'B', label: 'Somewhat confident' },
      { id: 'C', label: 'Slightly confident' },
      { id: 'D', label: 'Not confident' },
    ] },
  { id: 13, round: "Round 3: Counsellor's Role", type: 'mcq', scored: false,
    text: 'What would most help you provide better aviation career guidance?',
    options: [
      { id: 'A', label: 'Aviation career pathway guides' },
      { id: 'B', label: 'Professional development opportunities' },
      { id: 'C', label: 'Industry speakers and school visits' },
      { id: 'D', label: 'Student career discovery tools' },
      { id: 'E', label: 'Direct connections to training providers' },
      { id: 'F', label: 'Other' },
    ] },

  // ── Round 4: Student Competencies and Strengths ───────────────────────
  { id: 14, round: 'Round 4: Competency Word Cloud', type: 'wordcloud',
    text: 'Identify ONE competency or personal strength you believe young people need to succeed in aviation and aerospace.',
    discussionPrompt: 'How many of these strengths might already exist in your students, even if they have never considered aviation?' },

  // ── Round 5: Parents and Career Exploration ───────────────────────────
  { id: 15, round: 'Round 5: Parents & Families', type: 'mcq', scored: false,
    text: 'How can parents and caregivers best support young people interested in aviation careers?',
    options: [
      { id: 'A', label: 'Encourage exploration of different careers' },
      { id: 'B', label: 'Support hands-on activities and aviation events' },
      { id: 'C', label: 'Help research training pathways and costs' },
      { id: 'D', label: "Recognize and encourage their child's strengths" },
      { id: 'E', label: 'Connect them with aviation professionals and role models' },
      { id: 'F', label: 'Other' },
    ] },
  { id: 16, round: 'Round 5: Parents & Families', type: 'open',
    text: 'What barriers do parents and families face when supporting young people interested in aviation careers?',
    discussionPrompt: 'How can counsellors support students when their families are unfamiliar with aviation careers or concerned about training costs?' },

  // ── Final Question ────────────────────────────────────────────────────
  { id: 17, round: 'Final Question', type: 'open',
    text: 'What is one resource or form of support AACP could provide to make it easier for you to introduce aviation careers to students?' },
];
