import crypto from 'crypto';
import { NormalizedTransaction } from '../types';

/**
 * Parse date string - adapt based on your bank's date format
 */
export function parseDate(dateStr: string): Date {
  const trimmed = dateStr.trim();
  
  // Try to match DD/MM/YYYY format specifically
  const ddMmYyyyMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  
  if (ddMmYyyyMatch) {
    const [, day, month, year] = ddMmYyyyMatch;
    // Note: JavaScript Date months are 0-indexed (0 = January, 11 = December)
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date format: ${dateStr}`);
    }
    return date;
  }

  const dayMonthYearMatch = trimmed.match(/^(\d{2})\s+([A-Za-z]{3})\s+(\d{2})$/);
  if (dayMonthYearMatch) {
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
      .indexOf(dayMonthYearMatch[2].toLowerCase());
    const date = new Date(2000 + Number(dayMonthYearMatch[3]), month, Number(dayMonthYearMatch[1]));
    if (month < 0 || isNaN(date.getTime())) {
      throw new Error('Invalid date format');
    }
    return date;
  }

  // Fallback for formats JS normally natively supports (MM/DD/YYYY or YYYY-MM-DD)
  const date = new Date(trimmed);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  return date;
}

/**
 * Parse amount string, handling currency symbols and spaces
 */
export function parseAmount(amountStr: string): number {
  const cleaned = amountStr
    .trim()
    .replace(/[$,\s]/g, '')
    .replace(/[()]/g, (match) => (match === '(' ? '-' : ''));

  const amount = parseFloat(cleaned);
  if (isNaN(amount)) {
    throw new Error(`Invalid amount format: ${amountStr}`);
  }
  return Math.round(Math.abs(amount) * 100) / 100;// Always return positive
}

export function parseMinorUnits(amountStr: string): number {
  const cleaned = amountStr.trim().replace(/[$,\s]/g, '');
  const match = cleaned.match(/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) {
    throw new Error('Invalid monetary amount');
  }

  const sign = match[1] === '-' ? -1 : 1;
  const cents = (match[3] ?? '').padEnd(2, '0');
  return sign * (Number(match[2]) * 100 + Number(cents));
}

/**
 * Check if transaction is within the lookback window
 */
export function isWithinLookback(date: Date, daysBack?: number): boolean {
  if (!daysBack) return true;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  cutoff.setHours(0, 0, 0, 0);

  return date >= cutoff;
}

/**
 * Normalize merchant text for matching and alias lookups
 */
export function normalizeLookupText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate deterministic import ID for idempotency
 * Hash of date + amount + payee ensures same transaction = same ID
 */
export function generateImportId(transaction: Partial<NormalizedTransaction>): string {
  const key = [
    transaction.accountId ?? '',
    transaction.source ?? '',
    transaction.date?.toISOString().slice(0, 10) ?? '',
    transaction.transactionDate?.toISOString().slice(0, 10) ?? '',
    transaction.amountMinor ?? '',
    normalizeLookupText(transaction.merchant ?? transaction.payee ?? ''),
    transaction.transactionType ?? '',
    transaction.balanceBefore ?? '',
    transaction.balanceAfter ?? '',
  ].join('|');
  return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
}

/**
 * Sanitize payee name - remove extra whitespace, trim
 */
export function sanitizePayee(payee: string): string {
  return payee
    .trim()
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .substring(0, 100); // YNAB payee length limit
}

/**
 * Sanitize memo - remove extra whitespace, trim
 */
export function sanitizeMemo(memo?: string): string | undefined {
  if (!memo) return undefined;
  const cleaned = memo
    .trim()
    .replace(/\s+/g, ' ')
    .substring(0, 500); // Reasonable memo limit
  return cleaned || undefined;
}
