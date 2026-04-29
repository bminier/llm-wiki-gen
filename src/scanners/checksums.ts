/**
 * Luhn check for credit-card-like numbers. Returns true if the digit string
 * passes Luhn. Length is verified by the caller — Luhn alone accepts arbitrary
 * even-parity digit strings, so this should be combined with a length filter.
 */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits) || digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * ABA routing-number checksum: 9 digits, weighted sum (3,7,1,3,7,1,3,7,1) ≡ 0 (mod 10).
 * Plus a sanity check that the number isn't all the same digit.
 */
export function abaValid(digits: string): boolean {
  if (!/^\d{9}$/.test(digits)) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  const w = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  let s = 0;
  for (let i = 0; i < 9; i++) {
    const d = digits.charCodeAt(i) - 48;
    const wi = w[i];
    if (wi === undefined) return false;
    s += d * wi;
  }
  return s % 10 === 0;
}
