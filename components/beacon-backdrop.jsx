export default function BeaconBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2"
        style={{
          width: "120%",
          height: "120%",
          background:
            "radial-gradient(circle, color-mix(in oklch, var(--beacon) 14%, transparent), transparent 58%)",
        }}
      />
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="beacon-ring" style={{ animationDelay: `${i * 1.8}s` }} />
      ))}
      <div
        aria-hidden
        className="absolute left-1/2 top-[42%] size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-beacon animate-beacon-pulse"
      />
    </div>
  );
}
