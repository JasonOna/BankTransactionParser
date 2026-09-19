/**
 * Common types and interfaces for transaction syncing
 */

/**
 * Internal normalized transaction format
 * All bank/card formats are converted to this
 */
export interface NormalizedTransaction {
  date: Date;
  transactionDate?: Date;
  merchant: string;
  payee: string;
  amountMinor: number;
  /** @deprecated Use amountMinor. Kept for compatibility with existing matchers. */
  amount?: number;
  accountId: string;
  categoryId?: string;
  memo?: string;
  rawDescription: string;
  transactionType?: string;
  sourceRowNumber: number;
  balanceBefore?: number;
  balanceAfter?: number;
  balanceSource?: 'source' | 'derived';
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
  Balance: string;
}

/**
 * Raw CSV row from credit card - adapt this based on your card's format
 */
export interface CreditCardCsvRow {
  'Date': string;
  'Transaction Details': string;
  Amount: string;
  'Merchant Name': string;
  'Transaction Type': string;
  'Processed On'?: string;
  'Running Balance': number;
}

export interface CreditCardMetadata {
  openingBalanceMinor: number;
  openingBalanceDate: Date;
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
  creditCardStartingBalance: string;
  logLevel: string;
  daysBack?: number;
  liveRun?: boolean;
}

export interface YnabPayee {
  id: string;
  name: string;
  deleted?: boolean;
  transfer_account_id?: string | null;
}

export interface YnabCategory {
  id: string;
  name: string;
}

export interface PayeeAliasData {
  merchantAliases: Record<string, string>;
  keywordAliases: Record<string, string>;
}

export interface PayeeMatchResult {
  merchant: string;
  payee: string;
  matchedBy: 'merchant_alias' | 'keyword_alias' | 'ynab_payee' | 'manual';
}
