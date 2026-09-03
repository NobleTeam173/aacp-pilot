import { useRef, useState } from 'react';

export interface BadgeData {
  badgeId: string;
  participantName: string;
  issueDate: string;
  aciaVersion: string;
  pathwayType: 'standard' | 'transition' | string;
  assessmentStage?: string;
}

const C = {
  bg:       '#0a0a0c',
  card:     '#111216',
  border:   '#1e2229',
  crimson:  '#dc143c',
  crimsonD: '#7a0b22',
  sub:      '#7a8390',
  body:     '#c8cdd4',
  heading:  '#f0f2f5',
  muted:    '#444a54',
};

const STAGE_BADGE_LABEL: Record<string, string> = {
  baseline: 'BASELINE COMPLETED',
  completion: 'AACP COMPLETED',
  followup: 'FOLLOW-UP COMPLETED',
};

const STAGE_CREDENTIAL_LABEL: Record<string, string> = {
  baseline: 'ACIA Baseline Completion',
  completion: 'ACIA AACP Completion',
  followup: 'ACIA 90-Day Follow-Up',
};

function BadgeSVG({ data, size = 340 }: { data: BadgeData; size?: number }) {
  const shortId = data.badgeId.slice(0, 12).toUpperCase();
  const date = new Date(data.issueDate).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  const badgeLabel = data.assessmentStage ? (STAGE_BADGE_LABEL[data.assessmentStage] ?? 'COMPLETED') : 'COMPLETED';

  return (
    <svg
      width={size} height={size}
      viewBox="0 0 340 340"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id="bgGrad" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#1a0d14" />
          <stop offset="100%" stopColor="#060608" />
        </radialGradient>
        <radialGradient id="glowRed" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#dc143c" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#dc143c" stopOpacity="0" />
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Background */}
      <rect width="340" height="340" rx="20" fill="url(#bgGrad)" />

      {/* Outer border ring */}
      <rect x="6" y="6" width="328" height="328" rx="16" fill="none" stroke="#2a1020" strokeWidth="1.5" />
      <rect x="10" y="10" width="320" height="320" rx="13" fill="none" stroke="#3d1428" strokeWidth="0.5" />

      {/* Ambient centre glow */}
      <circle cx="170" cy="150" r="120" fill="url(#glowRed)" />

      {/* Geometric compass ring */}
      <circle cx="170" cy="148" r="78" fill="none" stroke="#2a1020" strokeWidth="1" />
      <circle cx="170" cy="148" r="70" fill="none" stroke="#3d1428" strokeWidth="0.5" />

      {/* Cardinal tick marks */}
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const isMajor = deg % 90 === 0;
        const r1 = isMajor ? 62 : 65;
        const r2 = 70;
        return (
          <line
            key={deg}
            x1={170 + r1 * Math.sin(rad)} y1={148 - r1 * Math.cos(rad)}
            x2={170 + r2 * Math.sin(rad)} y2={148 - r2 * Math.cos(rad)}
            stroke={isMajor ? '#dc143c' : '#3d1428'} strokeWidth={isMajor ? 1.5 : 0.75}
          />
        );
      })}

      {/* Wing silhouette left */}
      <path d="M 90 148 C 95 140, 110 135, 130 138 L 162 148 L 130 152 C 110 155, 95 152, 90 148 Z"
        fill="#dc143c" opacity="0.7" filter="url(#glow)" />
      {/* Wing silhouette right */}
      <path d="M 250 148 C 245 140, 230 135, 210 138 L 178 148 L 210 152 C 230 155, 245 152, 250 148 Z"
        fill="#dc143c" opacity="0.7" filter="url(#glow)" />

      {/* Centre circle */}
      <circle cx="170" cy="148" r="22" fill="#0f0608" stroke="#dc143c" strokeWidth="1" />
      <circle cx="170" cy="148" r="16" fill="#1a0a10" />

      {/* ACIA text — centre */}
      <text x="170" y="153" textAnchor="middle" fontSize="13" fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif" fill="#f0e8ea" letterSpacing="2">
        ACIA™
      </text>

      {/* Top label */}
      <text x="170" y="50" textAnchor="middle" fontSize="9" fontWeight="600"
        fontFamily="system-ui, -apple-system, sans-serif" fill="#7a8390" letterSpacing="3" textTransform="uppercase">
        AACP™ · AVIATION CAREER INTELLIGENCE
      </text>

      {/* Divider top */}
      <line x1="60" y1="58" x2="280" y2="58" stroke="#2a1020" strokeWidth="0.5" />

      {/* Stage completion badge */}
      <rect x="95" y="192" width="150" height="24" rx="4" fill="#1a0a10" stroke="#dc143c" strokeWidth="0.75" />
      <text x="170" y="208" textAnchor="middle" fontSize="8.5" fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif" fill="#dc143c" letterSpacing="2">
        {badgeLabel}
      </text>

      {/* Divider */}
      <line x1="40" y1="228" x2="300" y2="228" stroke="#1e2229" strokeWidth="0.5" />

      {/* Participant name */}
      <text x="170" y="248" textAnchor="middle" fontSize="12" fontWeight="600"
        fontFamily="system-ui, -apple-system, sans-serif" fill="#f0f2f5">
        {data.participantName.length > 28 ? data.participantName.slice(0, 26) + '…' : data.participantName}
      </text>

      {/* Issue date */}
      <text x="170" y="265" textAnchor="middle" fontSize="8" fontWeight="400"
        fontFamily="system-ui, -apple-system, sans-serif" fill="#7a8390">
        {date}
      </text>

      {/* Credential ID */}
      <text x="170" y="282" textAnchor="middle" fontSize="7" fontWeight="400"
        fontFamily="system-ui, -apple-system, sans-serif" fill="#444a54" letterSpacing="1.5">
        Credential ID: {shortId}
      </text>

      {/* Bottom issuer */}
      <line x1="40" y1="295" x2="300" y2="295" stroke="#1e2229" strokeWidth="0.5" />
      <text x="170" y="312" textAnchor="middle" fontSize="7.5" fontWeight="500"
        fontFamily="system-ui, -apple-system, sans-serif" fill="#7a8390" letterSpacing="1">
        aviationaerospacecompetency.com
      </text>
    </svg>
  );
}

interface Props {
  data: BadgeData;
  onClose?: () => void;
}

export function ACIABadge({ data, onClose }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const verifyUrl = `https://aviationaerospacecompetency.com/badge/verify/${data.badgeId}`;

  function downloadBadge() {
    setDownloading(true);
    try {
      const svg = svgRef.current;
      if (!svg) return;
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      canvas.width = 680;
      canvas.height = 680;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, 680, 680);
        const link = document.createElement('a');
        link.download = `ACIA-Badge-${data.badgeId.slice(0, 8)}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        setDownloading(false);
      };
      img.onerror = () => setDownloading(false);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
    } catch {
      setDownloading(false);
    }
  }

  function copyVerifyLink() {
    navigator.clipboard.writeText(verifyUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  function shareLinkedIn() {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(verifyUrl)}`;
    window.open(url, '_blank', 'width=600,height=500');
  }

  const btnStyle = (primary = false): React.CSSProperties => ({
    background: primary ? C.crimson : C.card,
    color: primary ? '#fff' : C.body,
    border: `1px solid ${primary ? C.crimson : C.border}`,
    borderRadius: 6, padding: '8px 16px', fontSize: 12,
    fontWeight: 600, cursor: 'pointer', letterSpacing: '0.02em',
  });

  return (
    <div style={{
      background: C.bg, border: `1px solid ${C.border}`, borderRadius: 16,
      padding: 28, maxWidth: 420, margin: '0 auto',
    }}>
      {/* Badge render */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
        <div ref={svgRef as unknown as React.RefObject<HTMLDivElement>}>
          <BadgeSVG data={data} />
        </div>
      </div>

      {/* Verification record */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
        {[
          ['Credential', data.assessmentStage ? (STAGE_CREDENTIAL_LABEL[data.assessmentStage] ?? 'Aviation Career Intelligence') : 'Aviation Career Intelligence'],
          ['Issuer', 'Aviation and Aerospace Competency Program (AACP™)'],
          ['Issued', new Date(data.issueDate).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })],
          ['Status', 'Active'],
          ['Assessment Framework', `ACIA ${data.aciaVersion}`],
          ['Credential ID', data.badgeId.slice(0, 12).toUpperCase()],
        ].map(([label, val]) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</span>
            <span style={{ color: C.body, fontSize: 12, fontWeight: 500 }}>{val}</span>
          </div>
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '6px 0' }}>
          <span style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Credential Verification</span>
          <a
            href={verifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              background: C.crimson, color: '#fff',
              padding: '7px 16px', borderRadius: 5,
              fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
              textDecoration: 'none', alignSelf: 'flex-start',
            }}
          >
            VERIFY CREDENTIAL →
          </a>
        </div>
      </div>

      {/* Disclaimer */}
      <p style={{ color: C.muted, fontSize: 11, lineHeight: 1.6, marginBottom: 20, padding: '10px 12px', background: C.card, borderRadius: 6, border: `1px solid ${C.border}` }}>
        This badge recognizes completion of the ACIA assessment journey. It does not constitute professional certification, occupational licensing, Transport Canada approval, or employment qualification.
      </p>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={downloadBadge} disabled={downloading} style={btnStyle(true)}>
          {downloading ? 'Preparing…' : 'Download Badge'}
        </button>
        <button onClick={copyVerifyLink} style={btnStyle()}>
          {copied ? '✓ Copied' : 'Copy Verify Link'}
        </button>
        <button onClick={shareLinkedIn} style={btnStyle()}>
          Share to LinkedIn
        </button>
        {onClose && (
          <button onClick={onClose} style={{ ...btnStyle(), marginLeft: 'auto' }}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}

// Hidden SVG for download — needs a real ref, so we wrap differently for download-only use
export function ACIABadgeDownloadTrigger({ data }: { data: BadgeData }) {
  const svgRef = useRef<SVGSVGElement>(null);
  return (
    <div style={{ position: 'absolute', left: -9999, top: -9999, pointerEvents: 'none' }}>
      <svg ref={svgRef} width="340" height="340" viewBox="0 0 340 340" xmlns="http://www.w3.org/2000/svg">
        <BadgeSVG data={data} />
      </svg>
    </div>
  );
}
