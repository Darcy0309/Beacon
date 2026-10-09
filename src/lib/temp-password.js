// Temporary passwords an administrator reads out or texts to someone: easy
// to say and type (no 0/O, 1/l/I), still long and random enough to be safe
// for the few minutes before they choose their own.

const LETTERS = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";

/** "Kp7-mxq4-Rz9t": 12 random characters in three groups, with a capital and a digit in each. */
export function generateTempPassword(random = (n) => {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0] % n;
}) {
  const pick = (set) => set[random(set.length)];
  const group = () => [pick(UPPER), pick(LETTERS), pick(DIGITS), pick(LETTERS)].sort(() => random(3) - 1).join("");
  return [group(), group(), group()].join("-");
}
