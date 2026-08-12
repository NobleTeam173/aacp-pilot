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

  const alignmentsHtml = data.careerAlignments.slice(0, 6).map(a => `
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
      <div class="competency-name">${esc(c.label)} <span class="comp-key">(${esc(c.key)})</span></div>
      <div class="evidence-badge ${c.state}">${STATE_LABEL[c.state] ?? c.state}</div>
    </div>
  `).join('');

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
  h2 { font-size: 13pt; font-weight: 700; color: #8F0909; margin: 28px 0 10px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #e0c8cc; padding-bottom: 6px; }
  h3 { font-size: 11pt; font-weight: 700; color: #1a1a24; margin: 16px 0 6px; }
  p { margin-bottom: 10px; }
  ul, ol { padding-left: 20px; margin-bottom: 10px; }
  li { margin-bottom: 4px; }

  .header { border-bottom: 2px solid #8F0909; padding-bottom: 20px; margin-bottom: 28px; }
  .org-tag { font-size: 8pt; font-weight: 700; letter-spacing: 2px; color: #8F0909; text-transform: uppercase; margin-bottom: 8px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-top: 14px; }
  .meta-item { font-size: 9.5pt; }
  .meta-label { color: #888; font-style: italic; }
  .meta-value { color: #1a1a24; font-weight: 600; }

  .summary-box { background: #f9f5f6; border-left: 3px solid #8F0909; padding: 14px 18px; margin-bottom: 20px; border-radius: 0 4px 4px 0; }

  .pathway-card { border: 1px solid #e0c8cc; border-radius: 6px; padding: 16px 18px; margin-bottom: 14px; break-inside: avoid; }
  .pathway-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px; flex-wrap: wrap; }
  .pathway-name { font-size: 11.5pt; font-weight: 700; color: #0a0a12; }
  .alignment-badge { font-size: 8pt; font-weight: 700; padding: 2px 8px; border-radius: 3px; white-space: nowrap; }
  .alignment-badge.strong { background: #d4edda; color: #155724; }
  .alignment-badge.promising { background: #d1ecf1; color: #0c5460; }
  .alignment-badge.developing { background: #fff3cd; color: #856404; }
  .alignment-badge.exploratory { background: #e2e3e5; color: #383d41; }
  .pathway-desc { font-size: 10pt; color: #444; margin-bottom: 8px; }
  .sub-section { margin-top: 8px; }
  .sub-label { font-size: 8.5pt; font-weight: 700; color: #8F0909; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px; }
  .credential-note { background: #f9f5f6; padding: 8px 12px; border-radius: 4px; font-size: 9.5pt; color: #444; margin-top: 8px; }

  .competency-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0e8ea; gap: 12px; }
  .competency-name { font-size: 10pt; color: #1a1a24; }
  .comp-key { color: #888; font-size: 8.5pt; font-weight: 400; }
  .evidence-badge { font-size: 8.5pt; font-weight: 600; padding: 2px 8px; border-radius: 3px; white-space: nowrap; }
  .evidence-badge.strong { background: #d4edda; color: #155724; }
  .evidence-badge.demonstrated { background: #d4edda; color: #155724; }
  .evidence-badge.developing { background: #fff3cd; color: #856404; }
  .evidence-badge.emerging { background: #e2e3e5; color: #383d41; }

  .profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 16px; }
  .profile-item { font-size: 10pt; }

  .next-steps-list { counter-reset: steps; list-style: none; padding: 0; }
  .next-steps-list li { counter-increment: steps; display: flex; gap: 10px; padding: 6px 0; border-bottom: 1px solid #f0e8ea; }
  .next-steps-list li::before { content: counter(steps); color: #8F0909; font-weight: 700; min-width: 20px; font-family: Georgia, serif; }

  .program-cta { background: #fdf2f4; border: 1px solid #f0c8cc; border-radius: 6px; padding: 16px 18px; margin: 20px 0; }
  .program-cta h3 { color: #8F0909; margin-bottom: 6px; }

  .badge-ref { background: #f9f5f6; border: 1px solid #e0c8cc; border-radius: 6px; padding: 12px 16px; margin-top: 16px; font-size: 9.5pt; color: #555; }

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
    <div class="org-tag">AACP · Aviation and Aerospace Career Pathways</div>
    <h1>ACIA Aviation Career Intelligence Report</h1>
    ${stageLabel ? `<div style="font-size:9.5pt;color:#8F0909;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:10px;">${esc(stageLabel)}</div>` : ''}
    <div class="meta-grid">
      <div class="meta-item"><span class="meta-label">Participant: </span><span class="meta-value">${esc(data.participantName)}</span></div>
      <div class="meta-item"><span class="meta-label">Assessment Date: </span><span class="meta-value">${date}</span></div>
      <div class="meta-item"><span class="meta-label">ACIA Version: </span><span class="meta-value">${esc(data.aciaVersion)}</span></div>
      <div class="meta-item"><span class="meta-label">Pathway: </span><span class="meta-value">${esc(pathwayLabel)}</span></div>
      ${data.badgeId ? `<div class="meta-item" style="grid-column:1/-1"><span class="meta-label">Badge ID: </span><span class="meta-value" style="font-family:monospace;font-size:9pt">${esc(data.badgeId.slice(0, 16).toUpperCase())}</span></div>` : ''}
    </div>
  </div>

  <h2>Executive Career Summary</h2>
  <div class="summary-box">
    <p>This report presents the findings of the AACP Aviation Career Intelligence Assessment (ACIA). ACIA is an evidence-based career discovery and competency-development assessment designed for individuals exploring or planning a transition into Canadian aviation and aerospace careers.</p>
    <p>Results are based on observed behaviours and responses across multiple assessment missions. Evidence is expressed as developmental states — not scores, grades, percentages, or pass/fail outcomes. Career alignments represent pathways worth exploring based on observed competency patterns, and should be used as a starting point for guided development — not as a final career determination.</p>
    ${data.topPathway ? `<p><strong>Top Pathway to Explore:</strong> ${esc(data.topPathway)}</p>` : ''}
  </div>

  ${isTransition && data.professionalProfile ? `
  <h2>Professional Background (Source A)</h2>
  <div class="profile-grid">
    ${data.professionalProfile.currentRole ? `<div class="profile-item"><span class="meta-label">Current Role: </span>${esc(data.professionalProfile.currentRole)}</div>` : ''}
    ${data.professionalProfile.industry ? `<div class="profile-item"><span class="meta-label">Industry: </span>${esc(data.professionalProfile.industry)}</div>` : ''}
    ${data.professionalProfile.yearsExperience ? `<div class="profile-item"><span class="meta-label">Experience: </span>${data.professionalProfile.yearsExperience} years</div>` : ''}
    ${data.professionalProfile.educationLevel ? `<div class="profile-item"><span class="meta-label">Education: </span>${esc(data.professionalProfile.educationLevel)}</div>` : ''}
  </div>
  ` : ''}

  <h2>${isTransition ? 'Career Pathways to Explore (Source A + B)' : 'Career Pathway Alignments'}</h2>
  ${alignmentsHtml || '<p>No alignment data available.</p>'}

  <h2>Competency Profile — ACIA Observed Evidence${isTransition ? ' (Source B)' : ''}</h2>
  <p style="font-size:9.5pt;color:#666;margin-bottom:12px">The following competencies were observed across ACIA assessment missions. Evidence states reflect the quality and consistency of observed behaviour — not a numeric score.</p>
  ${competenciesHtml || '<p>No competency data available.</p>'}

  ${data.observedStrengths.length ? `
  <h2>Observed Strengths</h2>
  <ul>${data.observedStrengths.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
  ` : ''}

  ${data.emergingCapabilities.length ? `
  <h2>Emerging Capabilities</h2>
  <p style="font-size:9.5pt;color:#666;margin-bottom:8px">These competencies showed early indicators during the assessment. Targeted experience or training may develop them further.</p>
  <ul>${data.emergingCapabilities.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
  ` : ''}

  ${data.developmentAreas.length ? `
  <h2>Development Opportunities</h2>
  <ul>${data.developmentAreas.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
  ` : ''}

  ${isTransition && data.transferableCompetencies?.length ? `
  <h2>Transferable Competencies</h2>
  <p style="font-size:9.5pt;color:#666;margin-bottom:8px">Competencies from professional background that are relevant to aviation and aerospace roles.</p>
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
    <h3>8-Week AACP Program</h3>
    <p>The AACP 8-Week Program is the structured development pathway that follows ACIA. It provides mentored learning, competency development, industry exposure, and career guidance aligned to your ACIA findings. Contact AACP to learn about enrollment and upcoming cohorts.</p>
    <p style="font-size:9.5pt;color:#8F0909;font-weight:600">aviationaerospacecompetency.com</p>
  </div>

  ${data.badgeId ? `
  <div class="badge-ref">
    <strong>Digital Completion Badge:</strong> This report is accompanied by an ACIA Digital Completion Badge issued by AACP.<br>
    Verify at: <span style="color:#8F0909">https://aviationaerospacecompetency.com/badge/verify/${esc(data.badgeId)}</span>
  </div>` : ''}

  <div class="disclaimer">
    <strong>Important Notice:</strong> The ACIA Aviation Career Intelligence Assessment is a career discovery and competency-development assessment. This report is intended to support career exploration, development planning, and conversations with aviation mentors, career advisors, training institutions, and employers.<br><br>
    This report does not constitute: a professional certification, occupational qualification, regulatory endorsement, Transport Canada licence or approval, employer assessment outcome, or guarantee of employment or admission to any program.<br><br>
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
