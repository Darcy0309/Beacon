export default function BeaconWordmark({ className }) {
  // Combined logo: the "Beacon" wordmark and the rising-arrow mark as one graphic.
  // Arrow + text use currentColor; the accent ray is gold.
  return (
    <svg viewBox="0 0 208 70" fill="none" className={className} role="img" aria-label="Beacon">
      <path d="M9 44 L188 13" stroke="#f5b120" strokeWidth="2.4" strokeLinecap="round" opacity="0.95" />
      <path d="M10 40 L196 8" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M196 8 L183 9.6 M196 8 L195 21" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <text
        x="6"
        y="62"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        fontSize="38"
        fontWeight="800"
        letterSpacing="-0.5"
        fill="currentColor"
      >
        Beacon
      </text>
    </svg>
  );
}
