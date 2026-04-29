/**
 * WARN/ALLOW heuristics for emails and phone numbers. The logic is intentionally
 * cheap and explainable in v0.1; the LLM-based contextual classifier in v0.2
 * (`pii-llm.ts`) will refine these verdicts.
 */

export const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}\b/g;

/**
 * North-American + common international phone formats. Avoids matching pure 9-
 * or 10-digit runs that could be account numbers by requiring at least one
 * separator (space, dot, dash, parens) or a leading +.
 */
export const PHONE_PATTERN =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]\d{3,4}[\s.-]\d{3,4}\b/g;

const PERSONAL_CONTEXT_TOKENS = [
  "personal",
  "home",
  "cell",
  "cellular",
  "mobile",
  "private",
  "spouse",
  "wife",
  "husband",
  "kid",
  "child",
  "daughter",
  "son",
  "mother",
  "father",
  "mom",
  "dad",
  "family",
  "emergency contact",
];

const BUSINESS_CONTEXT_TOKENS = [
  "office",
  "work",
  "support",
  "sales",
  "billing",
  "ext.",
  "extension",
  "inquiries",
  "press",
  "info@",
  "contact",
  "hr",
  "team",
];

const DEFAULT_BUSINESS_DOMAINS = new Set<string>([
  // Common public-facing role addresses live on company domains; we rely on
  // the user-supplied list, but mark these as never-personal regardless.
]);

export type Verdict = "deny" | "warn" | "allow";

/** Returns true if `value` is in the explicit business-allow list. */
export function detectAllowList(value: string, allow: readonly string[] | undefined): boolean {
  if (!allow || allow.length === 0) return false;
  const v = value.trim();
  return allow.some((a) => a === v);
}

export function evaluateEmailContext(
  email: string,
  text: string,
  idx: number,
  businessDomains: readonly string[],
): Verdict {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (DEFAULT_BUSINESS_DOMAINS.has(domain)) return "allow";
  if (
    businessDomains.some(
      (d) => domain === d.toLowerCase() || domain.endsWith(`.${d.toLowerCase()}`),
    )
  )
    return "allow";

  const window = textWindow(text, idx, 120);
  if (containsToken(window, PERSONAL_CONTEXT_TOKENS)) return "warn";
  if (containsToken(window, BUSINESS_CONTEXT_TOKENS)) return "allow";

  // Default: surface as info — reportable, not blocking. We map info→allow at the
  // scanner output layer so non-personal emails are skipped silently.
  return "allow";
}

export function evaluatePhoneContext(_phone: string, text: string, idx: number): Verdict {
  const window = textWindow(text, idx, 120);
  if (containsToken(window, PERSONAL_CONTEXT_TOKENS)) return "warn";
  if (containsToken(window, BUSINESS_CONTEXT_TOKENS)) return "allow";
  return "allow";
}

function textWindow(text: string, idx: number, radius: number): string {
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + radius);
  return text.slice(start, end).toLowerCase();
}

function containsToken(haystack: string, tokens: readonly string[]): boolean {
  return tokens.some((t) => haystack.includes(t));
}
