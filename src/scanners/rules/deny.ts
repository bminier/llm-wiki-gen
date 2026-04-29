import { abaValid, luhnValid } from "../checksums.ts";

export interface DenyRule {
  id: string;
  description: string;
  /** Regex with the global flag to enumerate matches; capture group 1 if specific. */
  pattern: RegExp;
  /** Optional post-match validator (e.g. checksum). */
  validate?: (match: string) => boolean;
}

const SSN = {
  id: "us-ssn",
  description: "US Social Security Number",
  // Reject area 000, 666, 9xx; group 00; serial 0000.
  pattern: /\b(?!000|666|9\d{2})(\d{3})-(?!00)(\d{2})-(?!0000)(\d{4})\b/g,
} satisfies DenyRule;

const CREDIT_CARD = {
  id: "credit-card",
  description: "Credit/debit card number (Luhn-validated)",
  pattern: /\b(?:\d[ -]?){12,18}\d\b/g,
  validate: (m: string) => luhnValid(m.replace(/[\s-]/g, "")),
} satisfies DenyRule;

const ABA_ROUTING = {
  id: "aba-routing",
  description: "US ABA routing number",
  pattern: /\b\d{9}\b/g,
  validate: (m: string) => abaValid(m),
} satisfies DenyRule;

const IBAN = {
  id: "iban",
  description: "IBAN (international bank account)",
  pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
} satisfies DenyRule;

const AWS_ACCESS_KEY = {
  id: "aws-access-key",
  description: "AWS access key ID",
  pattern: /\b(AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA)[A-Z0-9]{16}\b/g,
} satisfies DenyRule;

const AWS_SECRET = {
  id: "aws-secret-key",
  description: "AWS secret access key context",
  pattern: /aws_secret_access_key\s*[:=]\s*["']?([A-Za-z0-9/+]{40})["']?/gi,
} satisfies DenyRule;

const GCP_KEY = {
  id: "gcp-service-account",
  description: "GCP service account private key marker",
  pattern: /"type":\s*"service_account"/g,
} satisfies DenyRule;

const AZURE_KEY = {
  id: "azure-storage-key",
  description: "Azure storage key (base64, length 88)",
  pattern: /\b[A-Za-z0-9+/]{86}==\b/g,
} satisfies DenyRule;

const OPENSSH_PRIVATE = {
  id: "openssh-private-key",
  description: "OpenSSH/PEM private key header",
  pattern: /-----BEGIN (?:OPENSSH|RSA|DSA|EC|PGP) PRIVATE KEY-----/g,
} satisfies DenyRule;

const BIP39 = {
  id: "bip39-mnemonic",
  description: "BIP-39 mnemonic seed phrase (12 or 24 lowercase words)",
  // Conservative: 12 or 24 lowercase words, 3-8 chars each, separated by single spaces.
  pattern: /\b(?:[a-z]{3,8}\s){11,23}[a-z]{3,8}\b/g,
  validate: (m: string) => {
    const words = m.trim().split(/\s+/);
    return words.length === 12 || words.length === 24;
  },
} satisfies DenyRule;

const PASSPORT_US = {
  id: "us-passport",
  description: "US passport number context",
  pattern: /passport\s*(?:#|number|no\.?)?\s*[:=]?\s*([A-Z0-9]{9})\b/gi,
} satisfies DenyRule;

const ACCOUNT_NUMBER_CONTEXT = {
  id: "account-number",
  description: "Bank account number near contextual keyword",
  // 6-17 digit account near 'account #', 'acct no', 'a/c', etc.
  pattern: /\b(?:account|acct|a\/c)\s*(?:#|no\.?|number)?\s*[:=]?\s*(\d{6,17})\b/gi,
} satisfies DenyRule;

export const DENY_RULES: DenyRule[] = [
  SSN,
  CREDIT_CARD,
  ABA_ROUTING,
  IBAN,
  AWS_ACCESS_KEY,
  AWS_SECRET,
  GCP_KEY,
  AZURE_KEY,
  OPENSSH_PRIVATE,
  BIP39,
  PASSPORT_US,
  ACCOUNT_NUMBER_CONTEXT,
];
