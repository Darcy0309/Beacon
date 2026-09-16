export default function BeaconWordmark({ className }) {
  return (
    <svg viewBox="0 0 212 56" fill="none" className={className} role="img" aria-label="Beacon">
      <defs>
        <linearGradient id="beacon-badge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1e3a6e" />
          <stop offset="0.55" stopColor="#2a5294" />
          <stop offset="1" stopColor="#e8a020" />
        </linearGradient>
      </defs>
      <rect x="2" y="6" width="44" height="44" rx="12" fill="url(#beacon-badge)" />
      <g transform="translate(11.2,14) scale(1.08)">
        <path
          d="M12 2.2 C 8.1 2.2 5 5.3 5 9.1 C 5 14 12 21.5 12 21.5 C 12 21.5 19 14 19 9.1 C 19 5.3 15.9 2.2 12 2.2 Z"
          fill="#ffffff"
        />
        <circle cx="12" cy="9" r="2.8" fill="#f5b120" />
      </g>
      <text
        x="58"
        y="38"
        fontFamily="var(--font-outfit), system-ui, sans-serif"
        fontSize="30"
        fontWeight="700"
        letterSpacing="-0.8"
        fill="currentColor"
      >
        Beacon
      </text>
    </svg>
  );
}
