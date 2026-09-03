import { useState } from 'react';
import type { EvidenceItem } from '../types';

const C = {
  crimson: '#8F0909',
  crimsonD: '#721010',
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
  { id: 'pitot', label: 'Pitot Tube', category: 'Air Data Systems', hint: 'Measures ram air pressure to determine airspeed' },
  { id: 'altimeter', label: 'Altimeter', category: 'Air Data Systems', hint: 'Indicates altitude via static pressure sensing' },
  { id: 'asi', label: 'Airspeed Indicator', category: 'Air Data Systems', hint: 'Displays differential between pitot and static pressure' },
  { id: 'vsi', label: 'Vertical Speed Indicator', category: 'Air Data Systems', hint: 'Shows rate of altitude change via static port' },
  { id: 'ils', label: 'ILS Localizer', category: 'Navigation Systems', hint: 'Provides lateral guidance on precision approaches' },
  { id: 'vor', label: 'VOR Receiver', category: 'Navigation Systems', hint: 'VHF omnidirectional radio range — en route navigation' },
  { id: 'gps', label: 'GPS / FMS', category: 'Navigation Systems', hint: 'Satellite-based position and flight management' },
  { id: 'adf', label: 'ADF / NDB', category: 'Navigation Systems', hint: 'Automatic direction finder — older nav aid' },
  { id: 'hyd_pump', label: 'Hydraulic Pump', category: 'Hydraulic Systems', hint: 'Generates hydraulic pressure from engine or electric drive' },
  { id: 'actuator', label: 'Flight Control Actuator', category: 'Hydraulic Systems', hint: 'Converts hydraulic pressure into control surface movement' },
  { id: 'acc', label: 'Hydraulic Accumulator', category: 'Hydraulic Systems', hint: 'Stores pressurized fluid for emergency backup' },
  { id: 'selector_valve', label: 'Selector Valve', category: 'Hydraulic Systems', hint: 'Directs hydraulic flow to specific systems' },
  { id: 'battery', label: 'Aircraft Battery', category: 'Electrical Systems', hint: 'Provides emergency power and engine start power' },
  { id: 'alternator', label: 'Alternator / Generator', category: 'Electrical Systems', hint: 'Engine-driven primary source of electrical power' },
  { id: 'bus_bar', label: 'Main Bus Bar', category: 'Electrical Systems', hint: 'Distributes electrical power to connected circuits' },
  { id: 'cb', label: 'Circuit Breaker', category: 'Electrical Systems', hint: 'Protects individual circuits from overload' },
];

const CATEGORIES = ['Air Data Systems', 'Navigation Systems', 'Hydraulic Systems', 'Electrical Systems'];

const CATEGORY_COLORS: Record<string, string> = {
  'Air Data Systems': '#2563ab',
  'Navigation Systems': '#0a7060',
  'Hydraulic Systems': '#8F0909',
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
  const [selected, setSelected] = useState<string | null>(null); // tap-to-place selection
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [startTime] = useState(Date.now());

  const placed = new Set(Object.values(placements).flat());
  const unplaced = shuffled.filter(i => !placed.has(i.id));

  // Move an item to a category (or back to unplaced if category is null)
  function moveItem(itemId: string, toCategory: string | null) {
    setPlacements(prev => {
      const next = { ...prev };
      for (const cat of CATEGORIES) {
        next[cat] = next[cat].filter(id => id !== itemId);
      }
      if (toCategory) next[toCategory] = [...next[toCategory], itemId];
      return next;
    });
  }

  // Tap on an item in the unplaced pool or in a category
  function handleItemTap(itemId: string) {
    if (selected === itemId) {
      setSelected(null); // deselect
    } else {
      setSelected(itemId);
      setHoveredItem(itemId);
    }
  }

  // Tap on a category zone
  function handleCategoryTap(cat: string) {
    if (!selected) return;
    moveItem(selected, cat);
    setSelected(null);
  }

  // Tap the unplaced pool (move selected back)
  function handleUnplacedTap() {
    if (!selected) return;
    moveItem(selected, null);
    setSelected(null);
  }

  // Drag handlers (desktop)
  function handleDrop(category: string) {
    if (!dragging) return;
    moveItem(dragging, category);
    setDragging(null);
  }

  function handleDropUnplaced() {
    if (!dragging) return;
    moveItem(dragging, null);
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
  const selectedItem = selected ? ITEMS.find(i => i.id === selected) : null;

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ color: C.grey, fontSize: 13, lineHeight: 1.55 }}>
        <strong style={{ color: C.white }}>Tap</strong> a component to select it, then tap a category to place it.
        On desktop you can also drag and drop.
      </div>

      {/* Selection / hint status bar */}
      <div style={{
        background: C.bgCard,
        border: `1px solid ${selectedItem ? '#f59e0b' : hintItem ? C.crimson : C.border}`,
        borderRadius: 10,
        padding: '10px 14px',
        minHeight: 36,
        transition: 'border-color 0.15s',
      }}>
        {selectedItem ? (
          <span style={{ color: '#f59e0b', fontSize: 12 }}>
            <strong>{selectedItem.label}</strong> selected — tap a category below to place it, or tap it again to deselect.
            {selectedItem.hint && <span style={{ color: C.grey }}>{' · '}{selectedItem.hint}</span>}
          </span>
        ) : hintItem ? (
          <span style={{ color: C.grey, fontSize: 12, fontStyle: 'italic' }}>
            <span style={{ color: C.white, fontWeight: 600 }}>{hintItem.label}</span>{' — '}{hintItem.hint}
          </span>
        ) : (
          <span style={{ color: '#64748b', fontSize: 12 }}>Tap a component to select it</span>
        )}
      </div>

      {/* Unplaced pool */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={handleDropUnplaced}
        onClick={handleUnplacedTap}
        style={{
          background: C.bgCard,
          border: `2px dashed ${selected && !placed.has(selected) ? '#f59e0b' : C.border}`,
          borderRadius: 12,
          padding: 14,
          minHeight: 60,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          cursor: selected && placed.has(selected) ? 'pointer' : 'default',
        }}
      >
        <div style={{ color: C.grey, fontSize: 11, width: '100%', marginBottom: 2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Unclassified Components — {unplaced.length} remaining
          {selected && placed.has(selected) && (
            <span style={{ color: '#f59e0b', marginLeft: 8 }}>← tap here to return {selectedItem?.label}</span>
          )}
        </div>
        {unplaced.map(item => (
          <div
            key={item.id}
            draggable
            onDragStart={e => { e.stopPropagation(); setDragging(item.id); }}
            onDragEnd={() => setDragging(null)}
            onMouseEnter={() => !selected && setHoveredItem(item.id)}
            onMouseLeave={() => setHoveredItem(null)}
            onClick={e => { e.stopPropagation(); handleItemTap(item.id); }}
            style={{
              background: selected === item.id ? '#92400e' : dragging === item.id ? C.crimsonD : '#1f2937',
              border: `2px solid ${selected === item.id ? '#f59e0b' : '#374151'}`,
              borderRadius: 8,
              padding: '8px 14px',
              color: C.white,
              fontSize: 13,
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'background 0.1s, border-color 0.1s',
              touchAction: 'manipulation',
            }}
          >
            {item.label}
          </div>
        ))}
        {unplaced.length === 0 && <div style={{ color: C.grey, fontSize: 12, fontStyle: 'italic' }}>All components placed</div>}
      </div>

      {/* Category drop zones */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {CATEGORIES.map(cat => {
          const catColor = CATEGORY_COLORS[cat];
          const isTarget = !!selected; // highlight zones when something is selected
          return (
            <div
              key={cat}
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(cat)}
              onClick={() => handleCategoryTap(cat)}
              style={{
                background: C.bgCard,
                border: `2px solid ${isTarget ? catColor : C.border}`,
                borderRadius: 12,
                padding: 14,
                minHeight: 100,
                borderTopColor: catColor,
                borderTopWidth: 3,
                borderTopStyle: 'solid',
                cursor: isTarget ? 'pointer' : 'default',
                transition: 'border-color 0.15s',
                boxShadow: isTarget ? `0 0 0 1px ${catColor}33` : 'none',
              }}
            >
              <div style={{
                color: catColor, fontSize: 11, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
              }}>
                {cat}
                {isTarget && <span style={{ opacity: 0.7, marginLeft: 6 }}>← tap</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {placements[cat].map(id => {
                  const item = ITEMS.find(i => i.id === id)!;
                  const correct = item.category === cat;
                  return (
                    <div
                      key={id}
                      draggable
                      onDragStart={e => { e.stopPropagation(); setDragging(id); }}
                      onDragEnd={() => setDragging(null)}
                      onMouseEnter={() => !selected && setHoveredItem(id)}
                      onMouseLeave={() => setHoveredItem(null)}
                      onClick={e => { e.stopPropagation(); handleItemTap(id); }}
                      style={{
                        background: selected === id ? '#92400e' : '#1f2937',
                        border: `2px solid ${selected === id ? '#f59e0b' : done ? (correct ? C.green : '#ef4444') : '#374151'}`,
                        borderRadius: 8,
                        padding: '8px 10px',
                        color: C.white,
                        fontSize: 13,
                        cursor: 'pointer',
                        userSelect: 'none',
                        touchAction: 'manipulation',
                      }}
                    >
                      {item.label}
                    </div>
                  );
                })}
                {placements[cat].length === 0 && (
                  <div style={{
                    color: isTarget ? catColor : C.grey,
                    fontSize: 11, fontStyle: 'italic', textAlign: 'center', paddingTop: 16,
                    opacity: isTarget ? 0.8 : 0.5,
                  }}>
                    {isTarget ? 'Tap to place here' : 'Drop here'}
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
          border: 'none', borderRadius: 12, padding: '14px',
          cursor: placed.size === 0 ? 'not-allowed' : 'pointer',
          fontWeight: 700, fontSize: 14,
          touchAction: 'manipulation',
        }}
      >
        Submit Classification → ({placed.size}/{ITEMS.length} placed)
      </button>
    </div>
  );
}
