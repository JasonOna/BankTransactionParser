import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { NormalizedTransaction, CreditCardCsvRow, CreditCardMetadata } from '../types';
import { parseDate, parseMinorUnits, generateImportId, sanitizePayee, sanitizeMemo, isWithinLookback } from '../utils/utils';
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
      const metadata = this.parseMetadata(fileContent);
      const csvContent = fileContent.split(/\r?\n/).filter(line => !line.trim().startsWith('#')).join('\n');
      const rows: CreditCardCsvRow[] = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      // add running balances
      const transactions: NormalizedTransaction[] = [];
      let runningBalance = metadata.openingBalanceMinor;

      for (const [index, row] of rows.entries()) {
        try {
          const balanceBefore = runningBalance;
          const amountMinor = parseMinorUnits(row.Amount);
          runningBalance += amountMinor;
          row['Running Balance'] = runningBalance;
          const transaction = this.transformRow(row, index + 2, balanceBefore, amountMinor);

          // Skip old transactions if lookback is specified
          if (!isWithinLookback(transaction.date, daysBack)) {
            continue;
          }

          transactions.push(transaction);
        } catch (error) {
          this.logger.warn(
            { rowNumber: index + 2, error: error instanceof Error ? error.message : 'invalid row' },
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
  private transformRow(row: CreditCardCsvRow, sourceRowNumber: number, balanceBefore: number, amountMinor: number): NormalizedTransaction {
    const date = parseDate(row.Date);
    const merchant = sanitizePayee(row['Merchant Name']);
    const details = row['Transaction Details'];
    const runningBalance = row['Running Balance'];

    const transaction: NormalizedTransaction = {
      date,
      transactionDate: row['Processed On'] ? parseDate(row['Processed On']) : undefined,
      merchant,
      payee: merchant,
      amountMinor,
      accountId: this.accountId,
      rawDescription: details,
      transactionType: row['Transaction Type'],
      sourceRowNumber,
      balanceBefore,
      balanceAfter: runningBalance,
      balanceSource: 'derived',
      memo: sanitizeMemo(details),
      source: 'credit_card',
      importId: '', // Will be set below
    };

    transaction.importId = generateImportId(transaction);
    return transaction;
  }

  private parseMetadata(fileContent: string): CreditCardMetadata {
    const metadata = new Map<string, string>();
    for (const line of fileContent.split(/\r?\n/)) {
      const match = line.match(/^#\s*([^=]+)=(.*)$/);
      if (match) metadata.set(match[1].trim(), match[2].trim());
    }

    const openingBalance = metadata.get('opening_balance');

    if (!openingBalance) {
      throw new Error('Credit-card opening balance metadata is required');
    }

    return {
      openingBalanceMinor: parseMinorUnits(openingBalance),
    };
  }
}
