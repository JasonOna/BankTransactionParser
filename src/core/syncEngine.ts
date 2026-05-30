import { BankAdapter } from '../adapters/bankAdapter';
import { CreditCardAdapter } from '../adapters/creditCardAdapter';
import { YnabService } from '../services/ynabService';
import { Config, SyncReport } from '../types';
import { getLogger } from '../utils/logger';

/**
 * Sync Engine
 * Orchestrates the entire sync workflow:
 * 1. Parse CSVs from multiple sources
 * 2. Deduplicate transactions
 * 3. Import to YNAB
 * 4. Report results
 */
export class SyncEngine {
  private bankAdapter: BankAdapter;
  private creditCardAdapter: CreditCardAdapter;
  private ynabService: YnabService;
  private config: Config;
  private logger = getLogger();

  constructor(config: Config) {
    this.config = config;
    this.bankAdapter = new BankAdapter(config.accountMappings.checking);
    this.creditCardAdapter = new CreditCardAdapter(config.accountMappings.credit_card);
    this.ynabService = new YnabService(config.ynabApiKey, config.ynabBudgetId);
  }

  /**
   * Run the full sync process
   */
  async sync(): Promise<SyncReport> {
    this.logger.info('Starting YNAB sync...');

    // Validate YNAB setup before proceeding
    const isValid = await this.ynabService.validateSetup(
      Object.values(this.config.accountMappings)
    );
    if (!isValid) {
      throw new Error('YNAB setup validation failed');
    }

    try {
      // Parse transactions from all sources
      const bankTransactions = await this.bankAdapter.parse(
        this.config.bankCsvPath,
        this.config.daysBack
      );

      const creditCardTransactions = await this.creditCardAdapter.parse(
        this.config.creditCardCsvPath,
        this.config.daysBack
      );

      // Combine transactions
      const allTransactions = [...bankTransactions, ...creditCardTransactions];
      this.logger.info(
        { bank: bankTransactions.length, creditCard: creditCardTransactions.length, total: allTransactions.length },
        'Parsed transactions from all sources'
      );

      // Deduplicate by import_id
      const uniqueTransactions = this.deduplicateTransactions(allTransactions);
      this.logger.info(
        { total: allTransactions.length, unique: uniqueTransactions.length },
        'Deduplicated transactions'
      );

      // Import to YNAB
      const report = await this.ynabService.importTransactions(uniqueTransactions);
      this.logger.info(report, 'Sync complete');

      return report;
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Sync failed'
      );
      throw error;
    }
  }

  /**
   * Deduplicate transactions by import_id
   * Keeps only the first occurrence of each import_id
   */
  private deduplicateTransactions(transactions: any[]) {
    const seen = new Set<string>();
    return transactions.filter(txn => {
      if (seen.has(txn.importId)) {
        return false;
      }
      seen.add(txn.importId);
      return true;
    });
  }
}
