import dotenv from 'dotenv';
import { Config } from './types';

dotenv.config();

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): Config {
  const requiredVars = [
    'YNAB_API_KEY',
    'YNAB_BUDGET_ID',
    'SAVINGS_ACCOUNT_ID',
    'CREDIT_CARD_ACCOUNT_ID',
    'BANK_CSV_PATH',
    'CREDIT_CARD_CSV_PATH',
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    ynabApiKey: process.env.YNAB_API_KEY!,
    ynabBudgetId: process.env.YNAB_BUDGET_ID!,
    accountMappings: {
      savings: process.env.SAVINGS_ACCOUNT_ID!,
      credit_card: process.env.CREDIT_CARD_ACCOUNT_ID!,
    },
    bankCsvPath: process.env.BANK_CSV_PATH!,
    creditCardCsvPath: process.env.CREDIT_CARD_CSV_PATH!,
    logLevel: process.env.LOG_LEVEL || 'info',
    daysBack: process.env.DAYS_BACK ? parseInt(process.env.DAYS_BACK, 10) : undefined,
  };
}
