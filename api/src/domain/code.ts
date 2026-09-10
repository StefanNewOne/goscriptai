import type { Language } from './types.js';

// Script code = ad name in Ads Manager (CLAUDE.md invariant 7).
// Format: {CLIENT_CODE}-{YYMM}-{NN} e.g. ALEKS-2609-03, with -MK/-SQ suffix
// for bilingual (BOTH) sets.

const CLIENT_CODE_RE = /^[A-Z][A-Z0-9]{1,15}$/;

export function isValidClientCode(code: string): boolean {
  return CLIENT_CODE_RE.test(code);
}

// Transliterate a Cyrillic/Latin client name into a suggested CLIENT_CODE.
const TRANSLIT: Record<string, string> = {
  а: 'A', б: 'B', в: 'V', г: 'G', д: 'D', ѓ: 'GJ', е: 'E', ж: 'ZH', з: 'Z',
  ѕ: 'DZ', и: 'I', ј: 'J', к: 'K', л: 'L', љ: 'LJ', м: 'M', н: 'N', њ: 'NJ',
  о: 'O', п: 'P', р: 'R', с: 'S', т: 'T', ќ: 'KJ', у: 'U', ф: 'F', х: 'H',
  ц: 'C', ч: 'CH', џ: 'DZH', ш: 'SH', ç: 'C', ë: 'E',
};

export function suggestClientCode(name: string, maxLen = 8): string {
  const out: string[] = [];
  for (const ch of name.toLowerCase()) {
    if (ch >= 'a' && ch <= 'z') out.push(ch.toUpperCase());
    else if (ch >= '0' && ch <= '9') out.push(ch);
    else if (TRANSLIT[ch]) out.push(TRANSLIT[ch]);
    // everything else (spaces, punctuation) is dropped
  }
  const code = out.join('').slice(0, maxLen);
  return code.length >= 2 ? code : (code + 'XX').slice(0, 2);
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export interface CodeParts {
  clientCode: string;
  yymm: string; // "2609"
  nn: number; // 1-based sequence within client+month
  language?: Language;
}

export function buildCode(parts: CodeParts): string {
  if (!isValidClientCode(parts.clientCode)) {
    throw new Error(`Invalid client code: ${parts.clientCode}`);
  }
  if (!/^\d{4}$/.test(parts.yymm)) {
    throw new Error(`Invalid YYMM: ${parts.yymm}`);
  }
  const base = `${parts.clientCode}-${parts.yymm}-${pad2(parts.nn)}`;
  if (parts.language === 'MK') return `${base}-MK`;
  if (parts.language === 'SQ') return `${base}-SQ`;
  return base;
}

// Given the codes already used for a client+month, return the next free NN.
export function nextSequence(existingCodes: readonly string[], clientCode: string, yymm: string): number {
  const prefix = `${clientCode}-${yymm}-`;
  let max = 0;
  for (const code of existingCodes) {
    if (!code.startsWith(prefix)) continue;
    const rest = code.slice(prefix.length); // "03" or "03-MK"
    const nn = Number.parseInt(rest.slice(0, 2), 10);
    if (Number.isFinite(nn) && nn > max) max = nn;
  }
  return max + 1;
}

// Derive YYMM from a Date (UTC). Kept here so callers don't reinvent it.
export function yymmFromDate(date: Date): string {
  const yy = pad2(date.getUTCFullYear() % 100);
  const mm = pad2(date.getUTCMonth() + 1);
  return `${yy}${mm}`;
}
