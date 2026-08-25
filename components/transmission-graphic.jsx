export default function TransmissionGraphic({ className }) {
  // Faint background motif: an envelope launching a paper airplane along a
  // dotted trajectory — "transmission / sending". Uses currentColor.
  return (
    <svg viewBox="0 0 260 200" fill="none" className={className} aria-hidden="true">
      {/* dotted flight trajectory */}
      <path
        d="M46 170 Q 128 160 168 100 T 238 34"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="0.5 13"
        strokeLinecap="round"
      />
      {/* envelope */}
      <rect x="22" y="146" width="74" height="48" rx="7" stroke="currentColor" strokeWidth="3" />
      <path d="M26 153 L59 174 L92 153" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {/* paper airplane */}
      <g transform="translate(178,8) scale(2.7)" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 2 L11 13" />
        <path d="M22 2 L15 22 L11 13 L2 9 Z" />
      </g>
    </svg>
  );
}
