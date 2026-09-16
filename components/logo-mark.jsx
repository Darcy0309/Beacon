export default function BeaconMark({ className }) {
  // Icon-only badge (location pin + beacon point) for the collapsed sidebar.
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} role="img" aria-label="Beacon">
      <defs>
        <linearGradient id="beacon-badge-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b57c9" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill="url(#beacon-badge-mark)" />
      <g transform="translate(12,10) scale(1.08)">
        <path d="M12 2.2 C 8.1 2.2 5 5.3 5 9.1 C 5 14 12 21.5 12 21.5 C 12 21.5 19 14 19 9.1 C 19 5.3 15.9 2.2 12 2.2 Z" fill="#ffffff" />
        <circle cx="12" cy="9" r="2.6" fill="#f5b120" />
      </g>
    </svg>
  );
}
