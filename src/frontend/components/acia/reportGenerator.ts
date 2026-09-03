export interface ReportData {
  participantName: string;
  assessmentDate: string;
  pathwayType: 'standard' | 'transition' | string;
  aciaVersion: string;
  assessmentStage?: 'baseline' | 'completion' | 'followup';
  // Career alignment
  topPathway?: string;
  careerAlignments: Array<{
    label: string;
    alignment: string;
    evidenceConfidence?: string;
    description?: string;
    observedStrengths?: string[];
    developmentOpportunities?: string[];
    nextSteps?: string[];
    aviationBridgeNeeded?: string[];
    credentialNote?: string;
  }>;
  // Competency evidence
  competencies: Array<{ key: string; label: string; state: string; confidence?: string }>;
  developmentAreas: string[];
  observedStrengths: string[];
  emergingCapabilities: string[];
  // Transition-specific
  professionalProfile?: {
    currentRole?: string;
    industry?: string;
    yearsExperience?: number;
    domain?: string;
    educationLevel?: string;
  };
  transferableCompetencies?: string[];
  skillsBridge?: string[];
  credentialBridge?: string[];
  // Next steps
  recommendedNextSteps: string[];
  badgeId?: string;
}

const ALIGNMENT_LABEL: Record<string, string> = {
  strong: 'Strong Pathway Alignment',
  promising: 'Promising Pathway Alignment',
  developing: 'Developing Alignment',
  exploratory: 'Exploratory Interest',
  insufficient: 'Insufficient Evidence',
};

const STATE_LABEL: Record<string, string> = {
  strong: 'Strong Evidence',
  demonstrated: 'Demonstrated',
  developing: 'Developing',
  emerging: 'Emerging',
  insufficient: 'Insufficient Evidence',
};

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function openACIAReport(data: ReportData): void {
  const win = window.open('', '_blank', 'width=900,height=1100,scrollbars=yes');
  if (!win) {
    alert('Please allow pop-ups to generate the report.');
    return;
  }

  const date = new Date(data.assessmentDate).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  const pathwayLabel = data.pathwayType === 'transition' ? 'Career Transition' : 'Standard';
  const isTransition = data.pathwayType === 'transition';
  const stageLabels: Record<string, string> = {
    baseline: 'Baseline Assessment',
    completion: 'AACP Completion Assessment',
    followup: '90-Day Employment Follow-Up Assessment',
  };
  const stageLabel = data.assessmentStage ? stageLabels[data.assessmentStage] ?? '' : '';

  // Data integrity — only show alignments that have actual evidence behind them
  const supportedAlignments = data.careerAlignments.filter(a =>
    a.alignment !== 'insufficient' && a.evidenceConfidence !== 'low'
  );
  const hasReliableData = supportedAlignments.length > 0;

  // Pathway snapshot: only name a top pathway when evidence supports it
  const topPathwayDisplay = hasReliableData && data.topPathway ? data.topPathway : null;

  const alignmentsHtml = supportedAlignments.slice(0, 5).map(a => `
    <div class="pathway-card">
      <div class="pathway-header">
        <span class="pathway-name">${esc(a.label)}</span>
        <span class="alignment-badge ${a.alignment}">${ALIGNMENT_LABEL[a.alignment] ?? a.alignment}</span>
      </div>
      ${a.description ? `<p class="pathway-desc">${esc(a.description)}</p>` : ''}
      ${a.observedStrengths?.length ? `
        <div class="sub-section">
          <div class="sub-label">Observed Competencies Relevant to This Pathway</div>
          <ul>${a.observedStrengths.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
        </div>` : ''}
      ${a.developmentOpportunities?.length ? `
        <div class="sub-section">
          <div class="sub-label">Areas to Develop for This Pathway</div>
          <ul>${a.developmentOpportunities.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
        </div>` : ''}
      ${a.aviationBridgeNeeded?.length ? `
        <div class="sub-section">
          <div class="sub-label">Aviation Knowledge to Develop</div>
          <ul>${a.aviationBridgeNeeded.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
        </div>` : ''}
      ${a.credentialNote ? `<div class="credential-note"><strong>Credential Note:</strong> ${esc(a.credentialNote)}</div>` : ''}
      ${a.nextSteps?.length ? `
        <div class="sub-section">
          <div class="sub-label">Recommended Next Steps</div>
          <ol>${a.nextSteps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        </div>` : ''}
    </div>
  `).join('');

  const competenciesHtml = data.competencies.filter(c => c.state !== 'insufficient').map(c => `
    <div class="competency-row">
      <div class="competency-name">${esc(c.label)}</div>
      <div class="evidence-badge ${c.state}">${STATE_LABEL[c.state] ?? c.state}</div>
    </div>
  `).join('');

  const observedStrengthsHtml = data.observedStrengths.length ? `
    <h2>What We Observed</h2>
    <p style="font-size:9.5pt;color:#666;margin-bottom:12px">The following patterns were observed consistently across multiple assessment interactions. These reflect how this participant naturally approached aviation and aerospace situations throughout the assessment.</p>
    <ul class="observed-list">${data.observedStrengths.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
  ` : '';

  const devPrioritiesHtml = data.developmentAreas.slice(0, 4).length ? `
    <h2>Development Priorities</h2>
    <p style="font-size:9.5pt;color:#666;margin-bottom:12px">These are areas where targeted learning or experience can meaningfully expand this participant's aviation career readiness. They are not weaknesses — they are the next chapter of growth.</p>
    <div class="dev-list">
      ${data.developmentAreas.slice(0, 4).map(s => `
        <div class="dev-item">
          <div class="dev-bullet"></div>
          <div>${esc(s)}</div>
        </div>`).join('')}
    </div>
  ` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>ACIA Career Intelligence Report — ${esc(data.participantName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 11pt;
    line-height: 1.65;
    color: #1a1a24;
    background: #fff;
    padding: 0;
  }
  .page { max-width: 800px; margin: 0 auto; padding: 48px 60px; }
  h1 { font-size: 22pt; font-weight: 700; color: #0a0a12; letter-spacing: -0.5px; margin-bottom: 4px; }
  h2 { font-size: 12pt; font-weight: 700; color: #8F0909; margin: 32px 0 10px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #e0c8cc; padding-bottom: 6px; }
  h3 { font-size: 11pt; font-weight: 700; color: #1a1a24; margin: 16px 0 6px; }
  p { margin-bottom: 10px; }
  ul, ol { padding-left: 20px; margin-bottom: 10px; }
  li { margin-bottom: 5px; }

  .header { border-bottom: 2px solid #8F0909; padding-bottom: 22px; margin-bottom: 28px; }
  .org-tag { font-size: 8pt; font-weight: 700; letter-spacing: 2px; color: #8F0909; text-transform: uppercase; margin-bottom: 8px; }
  .stage-tag { font-size: 9pt; font-weight: 700; color: #8F0909; letter-spacing: 0.5px; text-transform: uppercase; margin: 6px 0 12px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-top: 14px; }
  .meta-item { font-size: 9.5pt; }
  .meta-label { color: #888; font-style: italic; }
  .meta-value { color: #1a1a24; font-weight: 600; }

  .snapshot-box { background: #f9f5f6; border-left: 4px solid #8F0909; padding: 18px 20px; margin-bottom: 24px; border-radius: 0 6px 6px 0; }
  .snapshot-box p { margin-bottom: 8px; }
  .snapshot-box p:last-child { margin-bottom: 0; }
  .top-pathway { font-size: 12pt; font-weight: 700; color: #0a0a12; margin-top: 10px; padding-top: 10px; border-top: 1px solid #e0c8cc; }
  .top-pathway span { color: #8F0909; }
  .integrity-notice { background: #fef9f0; border: 1px solid #f0d9b0; border-radius: 5px; padding: 10px 14px; font-size: 9.5pt; color: #7a5c1a; margin-top: 10px; }

  .pathway-card { border: 1px solid #e0c8cc; border-radius: 6px; padding: 16px 18px; margin-bottom: 14px; break-inside: avoid; }
  .pathway-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px; flex-wrap: wrap; }
  .pathway-name { font-size: 11.5pt; font-weight: 700; color: #0a0a12; }
  .alignment-badge { font-size: 8pt; font-weight: 700; padding: 3px 9px; border-radius: 3px; white-space: nowrap; }
  .alignment-badge.strong { background: #d4edda; color: #155724; }
  .alignment-badge.promising { background: #d1ecf1; color: #0c5460; }
  .alignment-badge.developing { background: #fff3cd; color: #856404; }
  .alignment-badge.exploratory { background: #e2e3e5; color: #383d41; }
  .pathway-desc { font-size: 10pt; color: #444; margin-bottom: 8px; }
  .sub-section { margin-top: 10px; }
  .sub-label { font-size: 8.5pt; font-weight: 700; color: #8F0909; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 5px; }
  .credential-note { background: #f9f5f6; padding: 8px 12px; border-radius: 4px; font-size: 9.5pt; color: #444; margin-top: 8px; }
  .no-data-note { font-size: 10pt; color: #888; font-style: italic; padding: 10px 0; }

  .observed-list { list-style: none; padding: 0; }
  .observed-list li { padding: 7px 0 7px 16px; border-bottom: 1px solid #f0e8ea; position: relative; font-size: 10.5pt; }
  .observed-list li::before { content: ''; position: absolute; left: 0; top: 16px; width: 6px; height: 6px; background: #8F0909; border-radius: 50%; }

  .competency-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0e8ea; gap: 12px; }
  .competency-name { font-size: 10.5pt; color: #1a1a24; }
  .evidence-badge { font-size: 8.5pt; font-weight: 600; padding: 3px 9px; border-radius: 3px; white-space: nowrap; }
  .evidence-badge.strong { background: #d4edda; color: #155724; }
  .evidence-badge.demonstrated { background: #d4edda; color: #155724; }
  .evidence-badge.developing { background: #fff3cd; color: #856404; }
  .evidence-badge.emerging { background: #e2e3e5; color: #383d41; }

  .dev-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px; }
  .dev-item { display: flex; align-items: flex-start; gap: 12px; font-size: 10.5pt; color: #1a1a24; }
  .dev-bullet { width: 3px; min-width: 3px; height: 20px; background: #8F0909; border-radius: 2px; margin-top: 2px; }

  .profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 16px; }
  .profile-item { font-size: 10pt; }

  .next-steps-list { counter-reset: steps; list-style: none; padding: 0; }
  .next-steps-list li { counter-increment: steps; display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px solid #f0e8ea; font-size: 10.5pt; }
  .next-steps-list li::before { content: counter(steps); color: #8F0909; font-weight: 700; min-width: 22px; font-family: Georgia, serif; font-size: 11pt; }

  .program-cta { background: #fdf2f4; border: 1px solid #f0c8cc; border-radius: 6px; padding: 18px 20px; margin: 24px 0; }
  .program-cta h3 { color: #8F0909; margin-bottom: 8px; font-size: 12pt; }

  .badge-ref { background: #f9f5f6; border: 1px solid #e0c8cc; border-radius: 6px; padding: 14px 18px; margin-top: 20px; font-size: 9.5pt; color: #555; }
  .verify-btn { display: inline-block; margin-top: 10px; background: #8F0909; color: #fff; text-decoration: none; padding: 7px 16px; border-radius: 4px; font-size: 9pt; font-weight: 700; letter-spacing: 0.05em; }

  .disclaimer { background: #f9f5f6; border: 1px solid #e0c8cc; border-radius: 6px; padding: 16px 18px; margin-top: 28px; font-size: 9pt; color: #666; line-height: 1.7; }

  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e0c8cc; text-align: center; font-size: 8.5pt; color: #999; }

  @media print {
    body { font-size: 10pt; }
    .page { padding: 24px 32px; }
    h2 { page-break-after: avoid; }
    .pathway-card { page-break-inside: avoid; }
    @page { margin: 20mm 15mm; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="org-tag">AACP · Aviation and Aerospace Competency Program</div>
    <h1>Career Intelligence Report</h1>
    ${stageLabel ? `<div class="stage-tag">${esc(stageLabel)}</div>` : ''}
    <div class="meta-grid">
      <div class="meta-item"><span class="meta-label">Participant: </span><span class="meta-value">${esc(data.participantName)}</span></div>
      <div class="meta-item"><span class="meta-label">Assessment Date: </span><span class="meta-value">${date}</span></div>
      <div class="meta-item"><span class="meta-label">ACIA Version: </span><span class="meta-value">${esc(data.aciaVersion)}</span></div>
      <div class="meta-item"><span class="meta-label">Pathway Type: </span><span class="meta-value">${esc(pathwayLabel)}</span></div>
      ${data.badgeId ? `<div class="meta-item" style="grid-column:1/-1"><span class="meta-label">Badge ID: </span><span class="meta-value" style="font-family:monospace;font-size:9pt">${esc(data.badgeId.slice(0, 16).toUpperCase())}</span></div>` : ''}
    </div>
  </div>

  <h2>Your Career Intelligence Snapshot</h2>
  <div class="snapshot-box">
    <p>This report presents the findings of the AACP Aviation Career Intelligence Assessment (ACIA) — an evidence-based career discovery and competency-development assessment for individuals exploring Canadian aviation and aerospace careers.</p>
    <p>Results reflect observed behaviours and responses across multiple assessment missions. Evidence is expressed as developmental states — not scores, grades, percentages, or pass/fail outcomes.</p>
    ${topPathwayDisplay ? `
    <div class="top-pathway">Primary Career Pathway to Explore: <span>${esc(topPathwayDisplay)}</span></div>
    ` : `
    <div class="integrity-notice">Note: Insufficient evidence was captured to produce a reliable pathway recommendation. Career alignments reflect early observations only — further engagement with AACP resources or a coach conversation is recommended before drawing pathway conclusions.</div>
    `}
  </div>

  ${isTransition && data.professionalProfile ? `
  <h2>Professional Background</h2>
  <div class="profile-grid">
    ${data.professionalProfile.currentRole ? `<div class="profile-item"><span class="meta-label">Current Role: </span>${esc(data.professionalProfile.currentRole)}</div>` : ''}
    ${data.professionalProfile.industry ? `<div class="profile-item"><span class="meta-label">Industry: </span>${esc(data.professionalProfile.industry)}</div>` : ''}
    ${data.professionalProfile.yearsExperience ? `<div class="profile-item"><span class="meta-label">Experience: </span>${data.professionalProfile.yearsExperience} years</div>` : ''}
    ${data.professionalProfile.educationLevel ? `<div class="profile-item"><span class="meta-label">Education: </span>${esc(data.professionalProfile.educationLevel)}</div>` : ''}
  </div>
  ` : ''}

  <h2>${isTransition ? 'Career Pathway Intelligence' : 'Career Pathway Alignment'}</h2>
  ${alignmentsHtml || `<p class="no-data-note">Insufficient evidence was gathered during this assessment to produce a supported pathway alignment. A complete assessment engagement is required before pathway recommendations can be made.</p>`}

  ${observedStrengthsHtml}

  <h2>Competency Evidence Profile</h2>
  <p style="font-size:9.5pt;color:#666;margin-bottom:12px">The following competencies were observed across ACIA assessment missions. Evidence states reflect the quality and consistency of observed behaviour — not a numeric score.</p>
  ${competenciesHtml || `<p class="no-data-note">Insufficient competency evidence was observed during this assessment. A complete engagement across all nine missions is required to generate a competency profile.</p>`}

  ${data.emergingCapabilities.length ? `
  <h2>Areas of Growing Strength</h2>
  <p style="font-size:9.5pt;color:#666;margin-bottom:8px">These competencies showed early indicators during the assessment. Targeted experience or training may develop them further.</p>
  <ul>${data.emergingCapabilities.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
  ` : ''}

  ${devPrioritiesHtml}

  ${isTransition && data.transferableCompetencies?.length ? `
  <h2>Transferable Competencies</h2>
  <p style="font-size:9.5pt;color:#666;margin-bottom:8px">Competencies from your professional background that are relevant to aviation and aerospace roles.</p>
  <ul>${data.transferableCompetencies.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
  ` : ''}

  ${isTransition && data.skillsBridge?.length ? `
  <h2>Skills Bridge</h2>
  <ul>${data.skillsBridge.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
  ` : ''}

  ${isTransition && data.credentialBridge?.length ? `
  <h2>Credential Bridge</h2>
  <ul>${data.credentialBridge.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
  ` : ''}

  ${data.recommendedNextSteps.length ? `
  <h2>Recommended Next Steps</h2>
  <ol class="next-steps-list">
    ${data.recommendedNextSteps.map(s => `<li>${esc(s)}</li>`).join('')}
  </ol>
  ` : ''}

  <div class="program-cta">
    <h3>Recommended Development Pathway</h3>
    <p>The AACP 8-Week Program is the structured development pathway that follows ACIA. It provides mentored learning, competency development, industry exposure, and career guidance aligned to your ACIA findings.</p>
    <p style="font-size:9.5pt;color:#8F0909;font-weight:600">Contact AACP to learn about enrollment and upcoming cohorts · aviationaerospacecompetency.com</p>
  </div>

  ${data.badgeId ? `
  <div class="badge-ref">
    <strong>Digital Completion Badge</strong><br>
    This report is accompanied by an ACIA Digital Completion Badge issued by AACP. The badge can be shared on professional networks and verified by employers, institutions, and program partners.<br>
    <a class="verify-btn" href="https://aviationaerospacecompetency.com/badge/verify/${esc(data.badgeId)}" target="_blank">VERIFY CREDENTIAL →</a>
  </div>` : ''}

  <div class="disclaimer">
    <strong>Important Notice:</strong> The ACIA Aviation Career Intelligence Assessment is a career discovery and competency-development assessment. This report is intended to support career exploration, development planning, and conversations with aviation mentors, career advisors, training institutions, and employers.<br><br>
    This report does not constitute: a professional certification, occupational qualification, regulatory endorsement, Transport Canada licence or approval, employer assessment outcome, or guarantee of employment or admission to any program. Career alignments represent pathways worth exploring based on observed patterns — they are not predictions of career success and do not indicate that the participant is qualified for any occupation.<br><br>
    Aviation careers in Canada are regulated. Licensing, certification, and employment requirements vary by role and are governed by Transport Canada, industry bodies, and individual employers. Participants are encouraged to research applicable regulatory requirements for their intended career pathway.
  </div>

  <div class="footer">
    AACP Aviation Career Intelligence Report · Generated ${new Date().toLocaleDateString('en-CA')} · aviationaerospacecompetency.com
  </div>
</div>

<script>
  window.addEventListener('load', function() {
    setTimeout(function() { window.print(); }, 600);
  });
<\/script>
</body>
</html>`;

  win.document.write(html);
  win.document.close();
}
