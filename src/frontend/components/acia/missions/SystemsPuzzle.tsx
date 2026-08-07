import { useState } from 'react';
import type { EvidenceItem } from '../types';

const C = {
  crimson: '#80011f',
  crimsonD: '#5c0116',
  bgCard: '#1a0d10',
  border: '#3d1020',
  white: '#f1f5f9',
  grey: '#94a3b8',
  green: '#22c55e',
};

interface Item {
  id: string;
  label: string;
  category: string;
  hint?: string;
}

const ITEMS: Item[] = [
  // Air Data Systems
  { id: 'pitot', label: 'Pitot Tube', category: 'Air Data Systems', hint: 'Measures ram air pressure to determine airspeed' },
  { id: 'altimeter', label: 'Altimeter', category: 'Air Data Systems', hint: 'Indicates altitude via static pressure sensing' },
  { id: 'asi', label: 'Airspeed Indicator', category: 'Air Data Systems', hint: 'Displays differential between pitot and static pressure' },
  { id: 'vsi', label: 'Vertical Speed Indicator', category: 'Air Data Systems', hint: 'Shows rate of altitude change via static port' },
  // Navigation Systems
  { id: 'ils', label: 'ILS Localizer', category: 'Navigation Systems', hint: 'Provides lateral guidance on precision approaches' },
  { id: 'vor', label: 'VOR Receiver', category: 'Navigation Systems', hint: 'VHF omnidirectional radio range — en route navigation' },
  { id: 'gps', label: 'GPS / FMS', category: 'Navigation Systems', hint: 'Satellite-based position and flight management' },
  { id: 'adf', label: 'ADF / NDB', category: 'Navigation Systems', hint: 'Automatic direction finder — older nav aid' },
  // Hydraulic Systems
  { id: 'hyd_pump', label: 'Hydraulic Pump', category: 'Hydraulic Systems', hint: 'Generates hydraulic pressure from engine or electric drive' },
  { id: 'actuator', label: 'Flight Control Actuator', category: 'Hydraulic Systems', hint: 'Converts hydraulic pressure into control surface movement' },
  { id: 'acc', label: 'Hydraulic Accumulator', category: 'Hydraulic Systems', hint: 'Stores pressurized fluid for emergency backup' },
  { id: 'selector_valve', label: 'Selector Valve', category: 'Hydraulic Systems', hint: 'Directs hydraulic flow to specific systems' },
  // Electrical Systems
  { id: 'battery', label: 'Aircraft Battery', category: 'Electrical Systems', hint: 'Provides emergency power and engine start power' },
  { id: 'alternator', label: 'Alternator / Generator', category: 'Electrical Systems', hint: 'Engine-driven primary source of electrical power' },
  { id: 'bus_bar', label: 'Main Bus Bar', category: 'Electrical Systems', hint: 'Distributes electrical power to connected circuits' },
  { id: 'cb', label: 'Circuit Breaker', category: 'Electrical Systems', hint: 'Protects individual circuits from overload' },
];

const CATEGORIES = ['Air Data Systems', 'Navigation Systems', 'Hydraulic Systems', 'Electrical Systems'];

const CATEGORY_COLORS: Record<string, string> = {
  'Air Data Systems': '#2563ab',
  'Navigation Systems': '#0a7060',
  'Hydraulic Systems': '#80011f',
  'Electrical Systems': '#966000',
};

interface Props {
  onComplete: (evidence: Omit<EvidenceItem, 'mission'>[]) => void;
}

export function SystemsPuzzle({ onComplete }: Props) {
  const [shuffled] = useState(() => [...ITEMS].sort(() => Math.random() - 0.5));
  const [placements, setPlacements] = useState<Record<string, string[]>>(
    Object.fromEntries(CATEGORIES.map(c => [c, []])),
  );
  const [dragging, setDragging] = useState<string | null>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [startTime] = useState(Date.now());

  const placed = new Set(Object.values(placements).flat());
  const unplaced = shuffled.filter(i => !placed.has(i.id));

  function handleDrop(category: string) {
    if (!dragging) return;
    setPlacements(prev => {
      const next = { ...prev };
      for (const cat of CATEGORIES) {
        next[cat] = next[cat].filter(id => id !== dragging);
      }
      next[category] = [...next[category], dragging];
      return next;
    });
    setDragging(null);
  }

  function handleDropUnplaced() {
    if (!dragging) return;
    setPlacements(prev => {
      const next = { ...prev };
      for (const cat of CATEGORIES) {
        next[cat] = next[cat].filter(id => id !== dragging);
      }
      return next;
    });
    setDragging(null);
  }

  function handleComplete() {
    if (done) return;
    setDone(true);
    const elapsed = (Date.now() - startTime) / 1000;

    let correct = 0;
    let total = 0;
    for (const [cat, ids] of Object.entries(placements)) {
      for (const id of ids) {
        total++;
        const item = ITEMS.find(i => i.id === id);
        if (item?.category === cat) correct++;
      }
    }
    const accuracy = total > 0 ? correct / total : 0;
    const completion = placed.size / ITEMS.length;
    const fullyComplete = placed.size === ITEMS.length;

    const evidence: Omit<EvidenceItem, 'mission'>[] = [
      { key: 'mechanical_reasoning', delta: accuracy * 0.85 + completion * 0.15 },
      { key: 'systematic_reasoning', delta: accuracy > 0.8 ? 0.8 : accuracy > 0.55 ? 0.45 : 0.15 },
      { key: 'attention_to_detail', delta: accuracy },
      { key: 'analytical_reasoning', delta: accuracy * 0.75 },
      // Full completion (all 16 items placed) is a curiosity/thoroughness signal
      { key: 'curiosity', delta: fullyComplete ? 0.6 : completion > 0.6 ? 0.35 : 0.15 },
    ];
    if (elapsed < 150) evidence.push({ key: 'multitasking_ability', delta: 0.45 });

    setTimeout(() => onComplete(evidence), 2000);
  }

  if (done) {
    let correct = 0;
    let total = 0;
    for (const [cat, ids] of Object.entries(placements)) {
      for (const id of ids) {
        total++;
        const item = ITEMS.find(i => i.id === id);
        if (item?.category === cat) correct++;
      }
    }
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <div style={{ color: C.green, fontSize: 40, marginBottom: 16 }}>✓</div>
        <div style={{ color: C.white, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Classification Complete</div>
        <div style={{ color: C.grey, fontSize: 14, marginBottom: 20 }}>
          {correct}/{total} components correctly categorised.
        </div>
        <div style={{ color: C.grey, fontSize: 13 }}>Advancing to next mission…</div>
      </div>
    );
  }

  const hintItem = hoveredItem ? ITEMS.find(i => i.id === hoveredItem) : null;

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ color: C.grey, fontSize: 13, lineHeight: 1.55 }}>
        Drag each aircraft component into its correct system category. Hover over any component to see a hint.
      </div>

      {/* Hint box */}
      <div style={{
        background: C.bgCard,
        border: `1px solid ${hintItem ? C.crimson : C.border}`,
        borderRadius: 10,
        padding: '10px 14px',
        minHeight: 36,
        transition: 'border-color 0.15s',
      }}>
        {hintItem ? (
          <span style={{ color: C.grey, fontSize: 12, fontStyle: 'italic' }}>
            <span style={{ color: C.white, fontWeight: 600 }}>{hintItem.label}</span>{' — '}{hintItem.hint}
          </span>
        ) : (
          <span style={{ color: C.border, fontSize: 12 }}>Hover a component for a hint</span>
        )}
      </div>

      {/* Unplaced pool */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={handleDropUnplaced}
        style={{
          background: C.bgCard,
          border: `2px dashed ${C.border}`,
          borderRadius: 12,
          padding: 14,
          minHeight: 60,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ color: C.grey, fontSize: 11, width: '100%', marginBottom: 2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Unclassified Components — {unplaced.length} remaining
        </div>
        {unplaced.map(item => (
          <div
            key={item.id}
            draggable
            onDragStart={() => setDragging(item.id)}
            onDragEnd={() => setDragging(null)}
            onMouseEnter={() => setHoveredItem(item.id)}
            onMouseLeave={() => setHoveredItem(null)}
            style={{
              background: dragging === item.id ? C.crimsonD : '#1f2937',
              border: '1px solid #374151',
              borderRadius: 8,
              padding: '6px 12px',
              color: C.white,
              fontSize: 12,
              cursor: 'grab',
              userSelect: 'none',
              transition: 'background 0.1s',
            }}
          >
            {item.label}
          </div>
        ))}
        {unplaced.length === 0 && <div style={{ color: C.grey, fontSize: 12, fontStyle: 'italic' }}>All components placed</div>}
      </div>

      {/* Category drop zones — 2×2 grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {CATEGORIES.map(cat => {
          const catColor = CATEGORY_COLORS[cat];
          return (
            <div
              key={cat}
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(cat)}
              style={{
                background: C.bgCard,
                border: `2px dashed ${C.border}`,
                borderRadius: 12,
                padding: 14,
                minHeight: 100,
                borderTopColor: catColor,
                borderTopWidth: 2,
                borderTopStyle: 'solid',
              }}
            >
              <div style={{
                color: catColor, fontSize: 11, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
              }}>
                {cat}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {placements[cat].map(id => {
                  const item = ITEMS.find(i => i.id === id)!;
                  const correct = item.category === cat;
                  return (
                    <div
                      key={id}
                      draggable
                      onDragStart={() => setDragging(id)}
                      onDragEnd={() => setDragging(null)}
                      onMouseEnter={() => setHoveredItem(id)}
                      onMouseLeave={() => setHoveredItem(null)}
                      style={{
                        background: '#1f2937',
                        border: `1px solid ${done ? (correct ? C.green : '#ef4444') : '#374151'}`,
                        borderRadius: 8,
                        padding: '6px 10px',
                        color: C.white,
                        fontSize: 12,
                        cursor: 'grab',
                        userSelect: 'none',
                      }}
                    >
                      {item.label}
                    </div>
                  );
                })}
                {placements[cat].length === 0 && (
                  <div style={{ color: C.grey, fontSize: 11, fontStyle: 'italic', textAlign: 'center', paddingTop: 16 }}>
                    Drop here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={handleComplete}
        disabled={placed.size === 0}
        style={{
          background: placed.size === 0 ? '#2d1118' : `linear-gradient(135deg, ${C.crimson}, ${C.crimsonD})`,
          color: placed.size === 0 ? C.grey : 'white',
          border: 'none', borderRadius: 12, padding: '13px',
          cursor: placed.size === 0 ? 'not-allowed' : 'pointer',
          fontWeight: 700, fontSize: 14,
        }}
      >
        Submit Classification → ({placed.size}/{ITEMS.length} placed)
      </button>
    </div>
  );
}
