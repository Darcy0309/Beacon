export default function BeaconBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: "150%",
          height: "150%",
          background:
            "radial-gradient(circle, color-mix(in oklch, var(--primary) 9%, transparent), transparent 62%)",
        }}
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="beacon-ring" style={{ animationDelay: `${i * 1.4}s` }} />
      ))}
    </div>
  );
}
