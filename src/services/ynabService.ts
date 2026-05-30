import axios, { AxiosInstance } from 'axios';
import { NormalizedTransaction, SyncReport } from '../types';
import { getLogger } from '../utils/logger';

/**
 * YNAB API Service
 * Handles all communication with YNAB API
 * Uses import_id for idempotency - same ID = duplicate protection
 */

export class YnabService {
  private client: AxiosInstance;
  private budgetId: string;
  private logger = getLogger();
  private baseUrl = 'https://api.youneedabudget.com/v1';

  constructor(apiKey: string, budgetId: string) {
    this.budgetId = budgetId;
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  /**
   * Import transactions to YNAB
   * Uses import_id for idempotency - prevents duplicate imports
   */
  async importTransactions(transactions: NormalizedTransaction[]): Promise<SyncReport> {
    const report: SyncReport = {
      totalProcessed: transactions.length,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    if (transactions.length === 0) {
      this.logger.info('No transactions to import');
      return report;
    }

    // Convert to YNAB format
    const ynabTransactions = transactions.map(txn => ({
      date: txn.date.toISOString().split('T')[0], // YYYY-MM-DD format
      payee_name: txn.payee,
      memo: txn.memo,
      category_id: txn.categoryId ?? null,
      amount: Math.round(txn.amount * 1000), // YNAB uses milliunits
      import_id: txn.importId, // Critical for idempotency
      account_id: txn.accountId,
      cleared: 'uncleared' as const,
      approved: false,
    }));

    try {
      const response = await this.client.post(
        `/budgets/${this.budgetId}/transactions`,
        { transactions: ynabTransactions }
      );

      const responseData = response.data.data;
      report.successful = responseData.transaction_ids?.length || 0;
      report.skipped = responseData.duplicate_import_ids?.length || 0;

      this.logger.info(
        { 
          successful: report.successful,
          skipped: report.skipped 
        },
        'Successfully imported transactions to YNAB'
      );

      return report;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(
          {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
          },
          'YNAB API error'
        );

        // Handle specific YNAB errors
        if (error.response?.status === 409) {
          this.logger.info('Duplicate transactions detected - they were skipped by YNAB');
          report.skipped = transactions.length;
        } else {
          report.failed = transactions.length;
          report.errors = transactions.map(txn => ({
            transaction: txn,
            error: error.message,
          }));
        }
      } else {
        report.failed = transactions.length;
        report.errors = transactions.map(txn => ({
          transaction: txn,
          error: String(error),
        }));
      }
      return report;
    }
  }

  /**
   * Validate that budget and accounts exist
   */
  async validateSetup(accountIds: string[]): Promise<boolean> {
    try {
      // Check budget exists
      const budgetResponse = await this.client.get(`/budgets/${this.budgetId}`);
      this.logger.info(
        { budget: budgetResponse.data.data.budget.name },
        'Validated YNAB budget'
      );

      // Check accounts exist
      const accounts = budgetResponse.data.data.budget.accounts || [];
      const foundAccountIds = new Set(accounts.map((a: any) => a.id));

      const missing = accountIds.filter(id => !foundAccountIds.has(id));
      if (missing.length > 0) {
        this.logger.error(
          { missingAccountIds: missing },
          'Some YNAB accounts were not found'
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to validate YNAB setup'
      );
      return false;
    }
  }
}
