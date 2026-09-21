import { SphereGlyph } from "@/components/logo-mark";

/**
 * Combined logo: the Signature "S" sphere with the "Lighthouse" wordmark. The
 * wordmark uses currentColor so it follows the surface it sits on.
 */
export default function LighthouseWordmark({ className }) {
  return (
    <svg viewBox="0 0 244 56" fill="none" className={className} role="img" aria-label="Lighthouse">
      <svg x="1" y="3" width="50" height="50" viewBox="0 0 100 100">
        <SphereGlyph id="lighthouse-wordmark" />
      </svg>
      <text
        x="60"
        y="38"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        fontSize="27"
        fontWeight="800"
        letterSpacing="-0.5"
        fill="currentColor"
      >
        Lighthouse
      </text>
    </svg>
  );
}
