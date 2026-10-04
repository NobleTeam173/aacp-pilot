import type { RpasProfile } from './rpasEngine';
import { RPAS_DOMAIN_LABELS, TC_CERT_LABELS, EXPERIENCE_LABELS } from './rpasEngine';

const C = {
  bg:      '#0f172a',
  card:    '#1e293b',
  border:  '#334155',
  white:   '#f1f5f9',
  grey:    '#94a3b8',
  greyD:   '#8a9ab0',
  crimson: '#8f0909',
  green:   '#22c55e',
  greenBg: 'rgba(34,197,94,0.08)',
};

interface Props {
  profile: RpasProfile;
  onEnroll?: () => void;
  enrolling?: boolean;
}

export function RpasCareerProfile({ profile, onEnroll, enrolling }: Props) {
  const domains = profile.applicationDomains ?? [];

  return (
    <div style={{ maxWidth: 560, width: '100%' }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '24px', marginBottom: 16 }}>
        <div style={{ color: C.grey, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 18 }}>
          RPAS Career Intelligence Profile
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
          <div>
            <div style={{ color: C.grey, fontSize: 11, fontWeight: 600, marginBottom: 5 }}>TC Certification</div>
            <div style={{ color: C.white, fontSize: 14 }}>
              {profile.tcCertStatus ? TC_CERT_LABELS[profile.tcCertStatus] ?? profile.tcCertStatus : '—'}
            </div>
          </div>
          <div>
            <div style={{ color: C.grey, fontSize: 11, fontWeight: 600, marginBottom: 5 }}>Operating Experience</div>
            <div style={{ color: C.white, fontSize: 14 }}>
              {profile.experienceLevel ? EXPERIENCE_LABELS[profile.experienceLevel] ?? profile.experienceLevel : '—'}
            </div>
          </div>
        </div>

        {domains.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ color: C.grey, fontSize: 11, fontWeight: 600, marginBottom: 8 }}>Application Domains</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {domains.map(d => (
                <span key={d} style={{
                  background: `${C.crimson}18`, border: `1px solid ${C.crimson}44`,
                  borderRadius: 6, padding: '4px 10px', color: C.white, fontSize: 12,
                }}>
                  {RPAS_DOMAIN_LABELS[d] ?? d}
                </span>
              ))}
            </div>
          </div>
        )}

        {profile.practicalContext && (
          <div>
            <div style={{ color: C.grey, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Experience Context</div>
            <div style={{ color: C.greyD, fontSize: 13, lineHeight: 1.6 }}>{profile.practicalContext}</div>
          </div>
        )}
      </div>

      {profile.hubStatus === 'profile_ready' && onEnroll && (
        <div style={{ background: C.greenBg, border: `1px solid ${C.green}44`, borderRadius: 16, padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ color: C.green, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            Profile ready — next step
          </div>
          <div style={{ color: C.greyD, fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
            Your RPAS career intelligence profile is complete. Enrol in the 1-week Applied RPAS Workforce Program to access your full workforce profile and next-step pathway.
          </div>
          <div style={{ color: C.grey, fontSize: 12, marginBottom: 14 }}>
            Program fee: $1,200 CAD — payment instructions will be provided separately.
          </div>
          <button
            onClick={onEnroll}
            disabled={enrolling}
            style={{
              background: `linear-gradient(135deg, ${C.crimson}, #721010)`,
              color: C.white, border: 'none', borderRadius: 10,
              padding: '12px 20px', fontWeight: 700, fontSize: 14,
              cursor: enrolling ? 'not-allowed' : 'pointer',
              opacity: enrolling ? 0.7 : 1,
            }}
          >
            {enrolling ? 'Enrolling…' : 'Enrol in Applied RPAS Workforce Program →'}
          </button>
        </div>
      )}
    </div>
  );
}
