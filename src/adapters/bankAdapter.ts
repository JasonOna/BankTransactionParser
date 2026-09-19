import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { NormalizedTransaction, BankCsvRow } from '../types';
import { parseDate, parseMinorUnits, generateImportId, sanitizePayee, sanitizeMemo, isWithinLookback } from '../utils/utils';
import { getLogger } from '../utils/logger';

/**
 * Bank CSV Adapter
 * Converts bank CSV format to normalized transactions
 * Customize the column names and parsing logic for your specific bank
 */
export class BankAdapter {
  private logger = getLogger();
  private accountId: string;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  /**
   * Parse bank CSV file
   */
  async parse(filePath: string, daysBack?: number): Promise<NormalizedTransaction[]> {
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`Bank CSV file not found: ${filePath}`);
      return [];
    }

    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const rows: BankCsvRow[] = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        // Adjust these options based on your bank's CSV format
      });

      const transactions: NormalizedTransaction[] = [];

      const chronologicalRows = [...rows].reverse();
      let previousBalance: number | undefined;

      for (const [index, row] of chronologicalRows.entries()) {
        try {
          const transaction = this.transformRow(row, rows.length - index);
          if (previousBalance !== undefined && transaction.balanceBefore !== previousBalance) {
            this.logger.warn({ rowNumber: transaction.sourceRowNumber }, 'Bank balance continuity warning');
          }
          previousBalance = transaction.balanceAfter;

          // Skip old transactions if lookback is specified
          if (!isWithinLookback(transaction.date, daysBack)) {
            continue;
          }

          transactions.push(transaction);
        } catch (error) {
          this.logger.warn(
            { rowNumber: rows.indexOf(row) + 2, error: error instanceof Error ? error.message : 'invalid row' },
            'Failed to parse bank transaction row'
          );
        }
      }

      this.logger.info(
        { count: transactions.length, file: filePath },
        'Parsed bank transactions'
      );

      return transactions;
    } catch (error) {
      throw new Error(`Failed to parse bank CSV: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Transform a single bank CSV row to normalized format
   * Customize column names to match your bank's CSV headers
   */
  private transformRow(row: BankCsvRow, sourceRowNumber: number): NormalizedTransaction {
    const date = parseDate(row.Date);
    const merchant = sanitizePayee(row.Description);
    const amountMinor = row.Debit ? -parseMinorUnits(row.Debit) : parseMinorUnits(row.Credit);
    const balanceAfter = parseMinorUnits(row.Balance);

    const transaction: NormalizedTransaction = {
      date,
      amountMinor,
      merchant,
      payee: merchant,
      rawDescription: row.Description,
      memo: sanitizeMemo(row.Description),
      accountId: this.accountId,
      sourceRowNumber,
      balanceBefore: balanceAfter - amountMinor,
      balanceAfter,
      balanceSource: 'source',
      source: 'bank',
      importId: '', // Will be set below
    };

    transaction.importId = generateImportId(transaction);

    return transaction;
  }
}
