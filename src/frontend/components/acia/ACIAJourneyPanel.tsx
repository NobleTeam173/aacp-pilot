import type { Mission } from './types';

const C = {
  crimson: '#80011f',
  crimsonD: '#5c0116',
  bgCard: '#1a0d10',
  border: '#3d1020',
  white: '#f1f5f9',
  grey: '#94a3b8',
  green: '#22c55e',
};

interface Props {
  missions: Mission[];
  currentIndex: number;
  startedAt: string;
}

export function ACIAJourneyPanel({ missions, currentIndex, startedAt }: Props) {
  const completed = missions.filter(m => m.completed).length;
  const total = missions.length;
  const pct = Math.round((completed / total) * 100);
  const elapsedMs = Date.now() - new Date(startedAt).getTime();
  const elapsedMin = Math.floor(elapsedMs / 60000);

  const currentMission = missions[currentIndex];

  return (
    <div style={{
      background: C.bgCard,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
    }}>
      <div>
        <div style={{ color: C.grey, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          Assessment Journey
        </div>
        <div style={{ height: 6, background: '#2d1020', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${C.crimson}, #c0032e)`,
            borderRadius: 4,
            transition: 'width 0.6s ease',
          }} />
        </div>
        <div style={{ color: C.grey, fontSize: 12, marginTop: 6 }}>
          {completed}/{total} missions complete
        </div>
      </div>

      {currentMission && (
        <div style={{
          background: '#2d0f1a',
          border: `1px solid ${C.crimson}`,
          borderRadius: 12,
          padding: '12px 14px',
        }}>
          <div style={{ color: C.crimson, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Current Mission
          </div>
          <div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{currentMission.title}</div>
          <div style={{ color: C.grey, fontSize: 12, marginTop: 3 }}>{currentMission.subtitle}</div>
          <div style={{ color: C.grey, fontSize: 11, marginTop: 6 }}>≈ {currentMission.estimatedMinutes} min</div>
        </div>
      )}

      <div>
        <div style={{ color: C.grey, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
          Missions
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {missions.map((m, i) => {
            const isCurrent = i === currentIndex;
            const isCompleted = m.completed;
            const isFuture = i > currentIndex && !isCompleted;
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: isCurrent ? '#2d0f1a' : 'transparent',
                  border: `1px solid ${isCurrent ? C.crimson : 'transparent'}`,
                  opacity: isFuture ? 0.5 : 1,
                }}
              >
                <div style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: isCompleted ? C.green : isCurrent ? C.crimson : '#2d1020',
                  border: `2px solid ${isCompleted ? C.green : isCurrent ? C.crimson : C.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 10,
                  color: 'white',
                  fontWeight: 700,
                }}>
                  {isCompleted ? '✓' : i + 1}
                </div>
                <div>
                  <div style={{ color: isCurrent ? C.white : isCompleted ? C.grey : C.grey, fontSize: 12, fontWeight: isCurrent ? 600 : 400 }}>
                    {m.title}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: C.grey, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>Time</div>
            <div style={{ color: C.white, fontSize: 16, fontWeight: 700 }}>{elapsedMin}m</div>
          </div>
          <div>
            <div style={{ color: C.grey, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>Progress</div>
            <div style={{ color: C.white, fontSize: 16, fontWeight: 700 }}>{pct}%</div>
          </div>
          <div>
            <div style={{ color: C.grey, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>Remaining</div>
            <div style={{ color: C.white, fontSize: 16, fontWeight: 700 }}>{total - completed}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
