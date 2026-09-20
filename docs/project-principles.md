# Project Principles

## Purpose

This project turns exported account activity into a trustworthy YNAB import. It
must make it easier to understand spending without inventing, losing, or
silently changing financial facts.

This constitution governs the data model, importers, categorization, reports,
and any future user interface.

## Principles

### 1. Financial facts are immutable and traceable

- Imported source values are preserved, including the raw description and
  source row number.
- A correction is represented as a new decision or adjustment; the original
  imported fact is not overwritten.
- Every transaction can be traced to its account, source, and import batch.
- Derived values are labelled as derived and must not be presented as source
  values.

### 2. Money uses exact arithmetic

- Monetary values are stored as integer minor units, such as cents.
- Currency is explicit; this project currently supports AUD only.
- Floating-point arithmetic is not used for persisted money or balance
  reconciliation.
- Dates and sign conventions are explicit at every import boundary.

### 3. Imports are safe to retry

- Re-uploading the exact same file is a no-op for transaction creation.
- Overlapping exports are reconciled at transaction level, not only by file
  identity.
- Database constraints and a transaction boundary protect against concurrent
  duplicate uploads where the chosen storage system supports them.
- Import results report inserted, already-known, rejected, warned, and
  review-required rows separately.

### 4. Ambiguity is visible, never guessed away

- No combination of date, amount, and payee is assumed to be universally
  unique.
- Identity signals are used from strongest to weakest: provider ID, balance
  transition, deterministic fingerprint, then occurrence count.
- If the available data cannot distinguish a repeated transaction from a new
  legitimate occurrence, the row is preserved for review.
- Warnings and rejected rows remain observable; the importer does not silently
  discard or silently correct source data.

### 5. Source validation happens before mutation

- Files are parsed and validated before transactions are written.
- Credit-card imports require valid opening-balance metadata before processing
  rows.
- Bank balance continuity is checked and reconciliation failures are recorded.
- A failed validation must produce a clear reason and must not leave a partial
  import.

### 6. Categorization is useful but reversible

- Categories are a reporting aid, not a replacement for the imported fact.
- Automatic categorization must be explainable by a rule, source category, or
  other recorded basis.
- Users can override a category without changing the transaction's raw source
  data.
- Category changes are safe to revise and must not make historical imports
  impossible to interpret.

### 7. Privacy is a product requirement

- Financial data is treated as sensitive by default.
- Logs, errors, examples, and diagnostics must not expose full account
  numbers, unnecessary descriptions, or transaction contents.
- External transmission or third-party processing of financial data requires
  an explicit user decision and clear documentation.
- Test fixtures should use representative synthetic data where real exports
  are not required.

### 8. Prefer the smallest system that preserves these guarantees

- Architecture is driven by the invariants above, not by premature features.
- A new dependency or service must remove meaningful complexity or provide a
  required guarantee.
- The implementation should keep import, normalization, identity matching,
  categorization, and reporting separable enough to test independently.

## Required quality gates

An implementation is not complete unless the affected behavior has checks for:

1. Exact-file retry does not create duplicates.
2. Overlapping exports retain legitimate repeated transactions.
3. Ambiguous matches are surfaced for review.
4. Money calculations reconcile exactly in cents.
5. Invalid credit-card metadata is rejected before mutation.
6. Bank balance discontinuities produce warnings without silent correction.
7. Raw source data remains available after categorization or user edits.
8. Sensitive values are absent from normal logs and error messages.

## Out of scope until explicitly adopted

- Foreign-currency conversion and multi-currency reconciliation.
- Automatic financial advice, forecasting, or investment recommendations.
- Treating a merchant name or category as a permanent identity.
- Silent deduplication when the source data is mathematically ambiguous.

## Amendment rule

When a proposed feature conflicts with this constitution, the conflict must be
made explicit. Either the feature is redesigned to preserve the principles, or
this document is amended with the reason, trade-off, and new quality gate
before implementation proceeds.