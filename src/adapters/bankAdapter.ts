import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { NormalizedTransaction, BankCsvRow } from '../types';
import { parseDate, parseAmount, generateImportId, sanitizePayee, sanitizeMemo, isWithinLookback } from '../utils/utils';
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

      for (const row of rows) {
        try {
          const transaction = this.transformRow(row);

          // Skip old transactions if lookback is specified
          if (!isWithinLookback(transaction.date, daysBack)) {
            continue;
          }

          transactions.push(transaction);
        } catch (error) {
          this.logger.warn(
            { row, error },
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
  private transformRow(row: BankCsvRow): NormalizedTransaction {
    const date = parseDate(row.Date);
    const payee = sanitizePayee(row.Description);
    const amount = row.Debit ?  -parseAmount(row.Debit) :  parseAmount(row.Credit);

    const transaction: NormalizedTransaction = {
      date,
      payee,
      amount,
      memo: sanitizeMemo(row.Description),
      accountId: this.accountId,
      source: 'bank',
      importId: '', // Will be set below
    };

    transaction.importId = generateImportId(transaction);

    return transaction;
  }
}
