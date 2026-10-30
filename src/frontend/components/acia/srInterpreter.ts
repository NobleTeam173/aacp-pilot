export interface SREvidence {
  orientationChallenge: {
    presented: boolean;
    solvedIndependently: boolean;
    hintRequested: boolean;
  };
  placements: Array<{
    componentId: string;
    attemptCount: number;
    corrected: boolean;
  }>;
  explorationBehavior: {
    exploreSeconds: number;
    orbitEventsBeforeAssembly: number;
  };
  corrections: number;
  totalComponents: number;
  componentsPlaced: number;
  completedAssembly: boolean;
  elapsedSeconds: number;
}

export interface SRInterpretation {
  state: 'not_assessed' | 'insufficient_evidence' | 'observed';
  dimensions: {
    orientation: 'independent' | 'guided' | 'not_observed';
    relationships: 'accurate' | 'partial' | 'not_observed';
    mentalRotation: 'active' | 'limited' | 'not_observed';
    correction: 'self_corrected' | 'completed' | 'not_observed';
  };
  notes: string[];
}

export function interpretSREvidence(ev: SREvidence): SRInterpretation {
  // Dimension: spatial orientation
  let orientation: SRInterpretation['dimensions']['orientation'] = 'not_observed';
  if (ev.orientationChallenge.presented) {
    orientation = ev.orientationChallenge.solvedIndependently ? 'independent' : 'guided';
  }

  // Dimension: spatial relationships (average placement attempts)
  let relationships: SRInterpretation['dimensions']['relationships'] = 'not_observed';
  if (ev.placements.length > 0) {
    const avg = ev.placements.reduce((s, p) => s + p.attemptCount, 0) / ev.placements.length;
    relationships = avg <= 1.5 ? 'accurate' : avg <= 2.5 ? 'partial' : 'partial';
  }

  // Dimension: mental rotation (orbit activity before assembly)
  let mentalRotation: SRInterpretation['dimensions']['mentalRotation'] = 'not_observed';
  const orbits = ev.explorationBehavior.orbitEventsBeforeAssembly;
  if (orbits >= 5) mentalRotation = 'active';
  else if (orbits >= 1) mentalRotation = 'limited';

  // Dimension: spatial correction
  let correction: SRInterpretation['dimensions']['correction'] = 'not_observed';
  if (ev.completedAssembly) {
    correction = ev.corrections >= 1 ? 'self_corrected' : 'completed';
  }

  const dims = { orientation, relationships, mentalRotation, correction };
  const observedCount = Object.values(dims).filter(v => v !== 'not_observed').length;

  // Overall state
  let state: SRInterpretation['state'];
  if (!ev.completedAssembly && ev.componentsPlaced < 2) {
    state = 'not_assessed';
  } else if (ev.componentsPlaced < 3 || observedCount < 2) {
    state = 'insufficient_evidence';
  } else {
    state = 'observed';
  }

  // Admin-only notes (never shown to participants)
  const notes: string[] = [];
  if (orientation === 'independent') {
    notes.push('Participant oriented vertical fin without assistance.');
  } else if (orientation === 'guided') {
    notes.push('Participant used the hint to orient the vertical fin.');
  }
  if (mentalRotation === 'active') {
    notes.push('Active multi-angle inspection observed during exploration phase.');
  } else if (mentalRotation === 'limited') {
    notes.push('Limited multi-angle inspection before assembly began.');
  } else if (mentalRotation === 'not_observed') {
    notes.push('No orbit activity detected during exploration phase.');
  }
  if (correction === 'self_corrected') {
    notes.push(`Participant self-corrected ${ev.corrections} placement(s) during assembly.`);
  }
  if (state === 'insufficient_evidence') {
    notes.push('Insufficient assembly interactions to support a competency observation.');
  }

  return { state, dimensions: dims, notes };
}
