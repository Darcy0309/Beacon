/**
 * A streak that laps a panel's border. Built from a chain of small pills that
 * each follow the same rounded path with a slight lag, so the streak bends
 * smoothly through corners instead of pivoting as one rigid bar. Pills are
 * sized largest in the middle and smallest at both ends, giving the taper.
 *
 * Purely presentational; the colour comes from the panel's --edge variable.
 */
export default function EdgeTrace({ segments = 13 }) {
  const mid = (segments - 1) / 2;
  return (
    <span aria-hidden className="edge-trace">
      {Array.from({ length: segments }, (_, i) => {
        // 1 at the centre of the streak, falling to 0 at either end.
        const s = 1 - Math.abs(i - mid) / mid;
        return <i key={i} style={{ "--i": i, "--s": s.toFixed(3) }} />;
      })}
    </span>
  );
}
