import type { WMEvidence } from './missions/ATCBriefing';

export interface WMInterpretation {
  state: 'not_assessed' | 'insufficient_evidence' | 'observed';
  dimensions: {
    retention: 'accurate' | 'partial' | 'not_observed';
    updateTracking: 'accurate' | 'partial' | 'not_observed';
    interferenceManagement: 'clean' | 'interfered' | 'not_observed';
    clarificationBehaviour: 'requested' | 'not_requested' | 'not_observed';
  };
  notes: string[];
}

export function interpretWMEvidence(ev: WMEvidence): WMInterpretation {
  // Dimension: retention accuracy (static items)
  let retention: WMInterpretation['dimensions']['retention'] = 'not_observed';
  if (ev.completedRecall) {
    retention = ev.retentionScore >= 0.75 ? 'accurate' : ev.retentionScore >= 0.5 ? 'partial' : 'partial';
  }

  // Dimension: update tracking (items that changed mid-briefing)
  let updateTracking: WMInterpretation['dimensions']['updateTracking'] = 'not_observed';
  if (ev.completedRecall) {
    updateTracking = ev.updateTrackingScore >= 1.0 ? 'accurate' : ev.updateTrackingScore >= 0.5 ? 'partial' : 'partial';
  }

  // Dimension: interference management (superseded info recalled as current)
  let interferenceManagement: WMInterpretation['dimensions']['interferenceManagement'] = 'not_observed';
  if (ev.completedRecall) {
    interferenceManagement = ev.interferenceCount === 0 ? 'clean' : 'interfered';
  }

  // Dimension: clarification behaviour — captured separately, NOT used in state determination
  let clarificationBehaviour: WMInterpretation['dimensions']['clarificationBehaviour'] = 'not_observed';
  if (ev.completedRecall) {
    clarificationBehaviour = ev.clarificationRequested ? 'requested' : 'not_requested';
  }

  const dims = { retention, updateTracking, interferenceManagement, clarificationBehaviour };

  // Observable dimensions exclude clarificationBehaviour per spec
  const scorableDims = { retention, updateTracking, interferenceManagement };
  const observedCount = Object.values(scorableDims).filter(v => v !== 'not_observed').length;

  // Overall state
  let state: WMInterpretation['state'];
  if (!ev.completedBriefing) {
    state = 'not_assessed';
  } else if (!ev.completedRecall || observedCount < 2) {
    state = 'insufficient_evidence';
  } else {
    state = 'observed';
  }

  // Admin-only notes (never shown to participants)
  const notes: string[] = [];
  if (retention === 'accurate') {
    notes.push('Participant accurately retained static briefing information.');
  } else if (retention === 'partial') {
    notes.push('Participant partially retained static briefing information.');
  }
  if (updateTracking === 'accurate') {
    notes.push('Participant correctly tracked updated information (runway change, frequency correction).');
  } else if (updateTracking === 'partial') {
    notes.push('Participant partially tracked updated information.');
  }
  if (interferenceManagement === 'interfered') {
    notes.push(`Participant recalled superseded information as current (${ev.interferenceCount} instance${ev.interferenceCount !== 1 ? 's' : ''}).`);
  } else if (interferenceManagement === 'clean') {
    notes.push('No interference from superseded information observed.');
  }
  if (clarificationBehaviour === 'requested') {
    notes.push('Participant requested clarification on the incomplete ATIS item.');
  }
  if (state === 'insufficient_evidence') {
    notes.push('Insufficient recall interactions to support a WM competency observation.');
  }

  return { state, dimensions: dims, notes };
}
