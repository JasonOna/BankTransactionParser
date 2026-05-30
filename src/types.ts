/**
 * Common types and interfaces for transaction syncing
 */

/**
 * Internal normalized transaction format
 * All bank/card formats are converted to this
 */
export interface NormalizedTransaction {
  date: Date;
  payee: string;
  amount: number; // Always positive; sign indicates direction
  accountId: string;
  categoryId?: string;
  memo?: string;
  uniquenessKey?: string; // To differentiate multiple similar txns
  source: 'bank' | 'credit_card'; // Origin source for debugging
  importId: string; // Deterministic hash for YNAB idempotency
}

/**
 * Raw CSV row from bank - adapt this based on your bank's format
 */
export interface BankCsvRow {
  Date: string;
  Description: string;
  Debit: string;
  Credit: string;
}

/**
 * Raw CSV row from credit card - adapt this based on your card's format
 */
export interface CreditCardCsvRow {
  'Date': string;
  'Transaction Details': string;
  Amount: string;
  'Merchant Name': string;
}

/**
 * Result of processing a transaction
 */
export interface TransactionResult {
  success: boolean;
  transaction: NormalizedTransaction;
  error?: string;
  ynabId?: string; // ID returned from YNAB if successful
}

/**
 * Sync report showing what was processed
 */
export interface SyncReport {
  totalProcessed: number;
  successful: number;
  failed: number;
  skipped: number;
  errors: Array<{ transaction: NormalizedTransaction; error: string }>;
}

/**
 * Configuration loaded from environment
 */
export interface Config {
  ynabApiKey: string;
  ynabBudgetId: string;
  accountMappings: Record<string, string>; // account name -> YNAB account ID
  bankCsvPath: string;
  creditCardCsvPath: string;
  logLevel: string;
  daysBack?: number;
}
