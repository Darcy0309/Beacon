export default function BeaconLogo({ className }) {
  // Rising-arrow "growth" mark — arrow in currentColor, gold accent ray.
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M3.5 19.6 L18.4 5.2" stroke="#f5b120" strokeWidth="1.6" strokeLinecap="round" opacity="0.95" />
      <path d="M5.6 20.5 L20 5.2" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 5.2 L13.3 5.7 M20 5.2 L19.5 12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
