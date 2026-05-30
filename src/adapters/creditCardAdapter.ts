import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { NormalizedTransaction, CreditCardCsvRow } from '../types';
import { parseDate, parseAmount, generateImportId, sanitizePayee, sanitizeMemo, isWithinLookback } from '../utils/utils';
import { getLogger } from '../utils/logger';

/**
 * Credit Card CSV Adapter
 * Converts credit card CSV format to normalized transactions
 * Customize the column names and parsing logic for your specific card
 */
export class CreditCardAdapter {
  private logger = getLogger();
  private accountId: string;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  /**
   * Parse credit card CSV file
   */
  async parse(filePath: string, daysBack?: number): Promise<NormalizedTransaction[]> {
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`Credit card CSV file not found: ${filePath}`);
      return [];
    }

    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const rows: CreditCardCsvRow[] = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
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
            'Failed to parse credit card transaction row'
          );
        }
      }

      this.logger.info(
        { count: transactions.length, file: filePath },
        'Parsed credit card transactions'
      );

      return transactions;
    } catch (error) {
      throw new Error(`Failed to parse credit card CSV: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Transform a single credit card CSV row to normalized format
   * Customize column names to match your card's CSV headers
   */
  private transformRow(row: CreditCardCsvRow): NormalizedTransaction {
    const date = parseDate(row.Date);
    const payee = sanitizePayee(row['Merchant Name']);
    const amount = parseAmount(row.Amount);
    const details = row['Transaction Details'];

    const transaction: NormalizedTransaction = {
      date,
      payee,
      amount,
      accountId: this.accountId,
      memo: sanitizeMemo(details),
      source: 'credit_card',
      importId: '', // Will be set below
    };

    transaction.importId = generateImportId(transaction);
    return transaction;
  }
}
