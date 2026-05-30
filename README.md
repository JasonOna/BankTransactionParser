# YNAB Transaction Sync

Automated sync of bank and credit card transactions from CSV files to YNAB using TypeScript/Node.js.

## Architecture

This project demonstrates key software engineering principles for financial data syncing:

- **Separation of Concerns**: Parse → Transform → API layers are independent
- **Idempotency**: Uses SHA-256 hashed `import_id` to prevent duplicate transactions
- **Adapter Pattern**: Bank/credit card adapters normalize different CSV formats
- **Configuration Management**: Environment-based config for easy deployment
- **Error Handling**: Defensive parsing and detailed logging of failures

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:

- `YNAB_API_KEY` - Get from [YNAB Deveopler](https://app.youneedabudget.com/settings/developer)
- `YNAB_BUDGET_ID` - Find in YNAB URL: `https://app.youneedabudget.com/budgets/{BUDGET_ID}`
- `SAVINGS_ACCOUNT_ID` - YNAB account ID from settings
- `CREDIT_CARD_ACCOUNT_ID` - YNAB account ID from settings
- `BANK_CSV_PATH` - Path to exported bank CSV
- `CREDIT_CARD_CSV_PATH` - Path to exported credit card CSV

### 3. Customize CSV Adapters

The bank and credit card adapters in `src/parsers/` are templates. Your bank/card likely has different column names.

**To customize:**

1. Export a sample CSV from your bank
2. Update the `BankCsvRow` interface in `src/types.ts` to match your columns
3. Update the `transformRow()` method in `src/parsers/bankAdapter.ts`

Example - if your bank uses `Debit/Credit` column instead of signed amounts:

```typescript
private transformRow(row: BankCsvRow): NormalizedTransaction {
  // ... existing code ...
  const amount = row.Type === 'debit' 
    ? parseAmount(row.Amount)
    : -parseAmount(row.Amount);
  // ... rest of code ...
}
```

### 4. Run the Sync

```bash
# Dev mode (with hot reload)
npm run dev

# Production (build then run)
npm run sync
```

## Project Structure

```txt
src/
├── index.ts                    # Entry point
├── config.ts                   # Configuration loader
├── logger.ts                   # Structured logging
├── types.ts                    # TypeScript interfaces
├── utils.ts                    # Shared utilities
├── parsers/
│   ├── bankAdapter.ts          # Bank CSV → Normalized
│   └── creditCardAdapter.ts    # Credit Card CSV → Normalized
└── services/
    ├── ynabService.ts          # YNAB API client
    └── syncEngine.ts           # Orchestration & deduplication
```

## How It Works

### 1. Parse Phase

- Bank and credit card CSVs are read and validated
- Each row is transformed to a normalized `NormalizedTransaction`
- Defensive parsing catches and logs formatting issues

### 2. Deduplication Phase

- Transactions are deduplicated by `import_id`
- `import_id` is a SHA-256 hash of (date + amount + payee)
- Same transaction from multiple sources = same hash = kept once

### 3. YNAB Import Phase

- Transactions are sent to YNAB API with `import_id`
- YNAB uses `import_id` for idempotency — running sync twice is safe
- Duplicate transactions are silently ignored by YNAB

### 4. Reporting Phase

- Results are logged and summarized
- Failed transactions are listed with errors
- Exit code indicates success/failure for automation

## Idempotency & Safety

This sync is **idempotent** — you can run it multiple times safely:

1. **Deterministic import_id**: Hashing (date, amount, payee) ensures the same transaction always has the same ID
2. **YNAB's duplicate protection**: Transactions with duplicate import_id are skipped
3. **Local deduplication**: If same CSV is processed twice, duplicates are removed before YNAB upload

## Extending the System

### Add a New Account/Bank

1. Create a new adapter in `src/parsers/newBankAdapter.ts`
2. Add account mappings to `Config` in `src/types.ts`
3. Update `.env` with new account ID
4. Call adapter in `syncEngine.ts`

Example:

```typescript
const savingsTransactions = await new SavingsAdapter(config.accountMappings.savings)
  .parse(config.savingsCsvPath, config.daysBack);
```

### Customize Date Filtering

Set `DAYS_BACK` in `.env` to only import recent transactions:

```bash
DAYS_BACK=30  # Only import last 30 days
```

### Add Category Assignment

Modify `ynabService.ts` `importTransactions()` to auto-assign categories:

```typescript
category_id: this.mapPayeeToCategory(txn.payee),
```

## Logging

The project uses [pino](https://getpino.io/) for structured logging. Set `LOG_LEVEL` in `.env`:

```bash
LOG_LEVEL=info    # Standard logging
LOG_LEVEL=debug   # Verbose, includes all rows parsed
LOG_LEVEL=error   # Only errors
```

## Troubleshooting

### CSV Parsing Fails

- Check date format matches your bank's export
- Verify column names in `BankCsvRow` interface match headers
- Run with `LOG_LEVEL=debug` to see each row

### Transactions Not Appearing in YNAB

- Verify `SAVINGS_ACCOUNT_ID` and `CREDIT_CARD_ACCOUNT_ID` are correct
- Check YNAB's transaction list — they may be hidden/unapproved
- Review sync report for any errors

### Duplicate Transactions

- Check `DAYS_BACK` — you may be re-importing old data
- Verify `import_id` generation hasn't changed
- Check transaction amounts match exactly (amount is part of hash)

## Running as a Scheduled Job

Use `cron` (macOS/Linux) or Task Scheduler (Windows):

```bash
# Crontab example - daily at 6 AM
0 6 * * * cd /path/to/project && npm run sync >> sync.log 2>&1
```

## Next Steps

- [ ] Add support for your specific bank/card formats
- [ ] Set up scheduled imports (cron/Task Scheduler)
- [ ] Add category auto-mapping based on payee
- [ ] Integrate with bank's native API (if available)
- [ ] Add transaction matching/linking to existing YNAB entries
