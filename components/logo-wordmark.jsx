import { SphereGlyph } from "@/components/logo-mark";

/**
 * Combined logo: the Signature "S" sphere with the "Beacon" wordmark. The
 * wordmark uses currentColor so it follows the surface it sits on.
 */
export default function BeaconWordmark({ className }) {
  return (
    <svg viewBox="0 0 212 56" fill="none" className={className} role="img" aria-label="Beacon">
      <svg x="1" y="3" width="50" height="50" viewBox="0 0 100 100">
        <SphereGlyph id="beacon-wordmark" />
      </svg>
      <text
        x="60"
        y="38"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        fontSize="30"
        fontWeight="800"
        letterSpacing="-0.5"
        fill="currentColor"
      >
        Beacon
      </text>
    </svg>
  );
}
