/**
 * The Signature "S" sphere: a steel-blue lobe and an indigo lobe interlocked
 * around an S-shaped gap, each with a notch cut in from the rim. Drawn once
 * here, in a 100×100 space, and shared by the icon and the wordmark.
 *
 * `id` prefixes the gradient and mask ids so two copies on one page (the
 * sidebar wordmark and a collapsed-rail icon) do not collide.
 */
export function SphereGlyph({ id = "sphere" }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-light`} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#d8e7f7" />
          <stop offset="0.5" stopColor="#6f9fd6" />
          <stop offset="1" stopColor="#224c85" />
        </linearGradient>
        <linearGradient id={`${id}-dark`} x1="0.2" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#7075ee" />
          <stop offset="0.5" stopColor="#2f34ae" />
          <stop offset="1" stopColor="#0e124a" />
        </linearGradient>
        <radialGradient id={`${id}-gloss`} cx="0.28" cy="0.16" r="0.6">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-shade`} cx="0.68" cy="0.88" r="0.7">
          <stop offset="0" stopColor="#000000" stopOpacity="0.4" />
          <stop offset="1" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        {/* The disc minus the S band and the two notches: what remains are the lobes. */}
        <mask id={`${id}-lobes`}>
          <circle cx="50" cy="50" r="47" fill="#ffffff" />
          <path d="M 55 -2 C 47 18, 43 40, 47 55 C 51 68, 55 80, 54 100 L 57 100 C 60 80, 61 68, 56 55 C 53 40, 55 25, 62 17 C 66 12, 70 10, 76 8 L 76 -2 Z" fill="#000000" />
          <path d="M 2 62 L 36 74 L 4 71 Z" fill="#000000" />
          <path d="M 98 35 L 59 37 L 98 43 Z" fill="#000000" />
        </mask>
      </defs>
      <g mask={`url(#${id}-lobes)`}>
        <circle cx="50" cy="50" r="47" fill={`url(#${id}-light)`} />
        {/* everything to the right of the band */}
        <path d="M 76 -2 L 76 8 C 70 10, 66 12, 62 17 C 55 25, 53 40, 56 55 C 61 68, 60 80, 57 100 L 110 110 L 110 -10 Z" fill={`url(#${id}-dark)`} />
        <circle cx="50" cy="50" r="47" fill={`url(#${id}-shade)`} />
        <circle cx="50" cy="50" r="47" fill={`url(#${id}-gloss)`} />
      </g>
    </>
  );
}

/** Icon-only mark, for the collapsed sidebar rail. */
export default function BeaconMark({ className }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Beacon">
      <SphereGlyph id="beacon-mark" />
    </svg>
  );
}
