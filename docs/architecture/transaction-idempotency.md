# Transaction Import Idempotency Design

> **Status:** Proposed architecture. The current implementation uses the
> normalized transaction fingerprint and YNAB `import_id`; database-backed
> import batches and duplicate-review workflows described below are future
> options, not implemented features.

## Goal

Repeated uploads must not create duplicate transactions, while legitimate transactions that happen to share the same date, amount, and payee must remain separate.

The importer should be safe to retry and should preserve ambiguous records for review rather than silently discarding them.

All accounts and transactions covered by this design use AUD. Currency conversion and foreign-currency fields are out of scope.

## Source characteristics

### Bank CSV

The bank CSV contains:

- Date
- Description
- Debit
- Credit
- Balance

The balance can be used to validate each transaction and distinguish repeated transactions with otherwise identical details.

``` csv
Date,Description,Debit,Credit,Balance
18/09/2026,Raeta Investment Cc Fees,1008.46,,57930.52,
```

### Credit-card CSV

The credit-card CSV does not provide a provider transaction ID and must include opening-balance metadata before the CSV header. Metadata must use comment lines so the file remains readable as CSV:

- Date
- Amount
- Account Number
- Transaction Type
- Transaction Details
- Category
- Merchant Name
- Processed On

The importer must parse and validate the comment metadata before processing any transactions. It must reject the file if `opening_balance` or `opening_balance_date` is missing or invalid. The opening balance is used to derive a running balance for every row.

The `Date` column is required for both supported sources and maps to the
normalized `posted_date`. The credit-card `Processed On` column is a separate
optional source date and maps to `transaction_date` when present.

```csv
# opening_balance=1250.00
# opening_balance_date=2026-08-09
Date,Amount,Account Number,,Transaction Type,Transaction Details,Category,Merchant Name,Processed On
09 Aug 26,-98.95,Card ending 2352,,MISCELLANEOUS DEBIT,VDAS FOODS PTY LTDVDAS Bayswater,Cafe & coffee,The Hatter & The Hare,
```

## Identity strategy

Use the strongest available identity signal in this order:

1. Provider transaction ID, when supplied.
2. Bank balance transition, when a bank balance is available.
3. Composite transaction fingerprint.
4. Stable YNAB `import_id`, when the transaction has already been exported.
5. Import file hash, to make an exact file retry a no-op.
6. Manual review when the available fields cannot distinguish two transactions.

No single amount/date/payee combination should be treated as a guaranteed unique identity.

## Normalized transaction

Before duplicate detection, normalize every row into a common structure:

```text
account_id
source
posted_date
transaction_date, nullable
signed_amount_minor
normalized_payee
raw_description
transaction_type
source_row_number
```

`posted_date` is required for both supported sources. It is parsed from the
source `Date` column and is part of the transaction fingerprint. The optional
`transaction_date` field represents the credit-card `Processed On` date when
that separate source field is present; it is not a substitute for `Date`.

Amounts should be stored as integer minor units, such as cents, rather than floating-point values.

Payee normalization should be conservative. It may trim whitespace, collapse repeated spaces, and normalize case, but the original description must also be retained.

## Bank running-balance validation

The bank balance in the supplied CSV behaves as a post-transaction balance when rows are read newest first. For a normalized signed amount:

```text
balance_before = balance_after - signed_amount
```

When processing chronologically:

```text
balance_after = balance_before + signed_amount
```

For each adjacent pair of rows, validate that the balances reconcile. A failed reconciliation should be recorded as an import warning and should not be silently corrected.

Store the derived values:

```text
balance_before
balance_after
balance_source = "source"
```

For bank transactions, the duplicate candidate key can include:

```text
account_id
posted_date
signed_amount_minor
normalized_payee
balance_before
balance_after
```

The balance transition helps distinguish multiple transactions with the same date, amount, and payee.

## Credit-card running balance

The credit-card file must include an opening balance. Process rows in chronological order and derive balances:

```text
balance_before = current_balance
balance_after = current_balance + signed_amount
current_balance = balance_after
```

Use a consistent credit-card sign convention:

```text
purchase or fee  => increases amount owed
payment or refund => decreases amount owed
```

Store:

```text
balance_before
balance_after
balance_source = "derived"
```

If the opening balance is missing or invalid, reject the file before processing any transactions.

## Composite fingerprint

For files without a provider ID, generate a deterministic fingerprint from stable fields:

```text
hash(
  account_id +
  posted_date +
  transaction_date +
  signed_amount_minor +
  normalized_payee +
  transaction_type
)
```

Include balance values in a secondary reconciliation key when they are available. Do not include source row number or file position in the primary fingerprint, because exports can be reordered.

The fingerprint must be serialized with an explicit representation for missing
optional values before hashing. It must be stable across repeated exports of
the same transaction. Use the fingerprint, or a stable provider identifier
when one exists, to derive the YNAB `import_id`; do not generate it from the
source row number or upload batch ID.

## YNAB export contract

Transactions are sent to the YNAB transactions endpoint for the configured
budget. The outbound mapping is:

```text
date         = posted_date as YYYY-MM-DD
payee_name   = payee
memo         = memo
category_id  = category_id, or null when uncategorized
amount       = amount in YNAB milliunits
import_id    = stable transaction identity for YNAB duplicate protection
account_id   = configured YNAB account ID
cleared      = "uncleared"
approved     = false
```

YNAB uses milliunits, so an amount expressed in whole AUD dollars is converted
with exact rounding to `round(amount * 1000)` at this boundary. Internal
persisted amounts remain integer AUD minor units; the conversion must not use
floating-point values for persisted data or reconciliation. The adapter must
also ensure that the source amount is representable in YNAB milliunits before
sending it.

The YNAB `import_id` is the outbound form of the internal stable identity. It
must remain unchanged when the same transaction is retried or appears in an
overlapping export. YNAB reports newly created transaction IDs separately from
duplicate import IDs; the sync summary must preserve that distinction. A YNAB
conflict or duplicate response must not be treated as a new transaction.

## Import batches

Create an import-batch record for every upload:

```text
ImportBatch
- id
- account_id
- source
- file_hash
- imported_at
- status
```

Enforce uniqueness on:

```text
(account_id, source, file_hash)
```

If the same file is uploaded again, return the existing batch and do not process its rows again.

The file hash protects exact retries. It does not replace transaction-level matching, because a later export may overlap an earlier export while containing additional transactions.

## Handling repeated transactions

For a fingerprint group, compare occurrence counts rather than assuming that one matching row means one transaction:

```text
existing matching rows: 2
incoming matching rows: 2
new rows to insert:     0
```

If the incoming count is greater, insert only the additional occurrences. If bank balance transitions are available, match those before falling back to occurrence counts.

A transaction that has the same fingerprint as an existing transaction but lacks enough information to determine whether it is a new occurrence should be marked for review.

## Import algorithm

```text
read file
calculate file hash
if (account, source, file hash) already exists:
    return existing import batch

parse and normalize rows
sort by source-defined chronological order

if a trusted balance anchor exists:
    derive balance_before and balance_after
    validate balance continuity

for each normalized row:
    match provider ID if available
    otherwise match balance transition if available
    otherwise match composite fingerprint and occurrence count

    if exactly one existing transaction matches:
        mark row as already imported
    if no transaction matches:
        insert a new transaction
    if multiple matches remain possible:
        preserve the row as pending duplicate review

create import batch
return import summary
```

The operation should run inside a database transaction where possible, with a database uniqueness constraint protecting against concurrent uploads.

## Suggested transaction fields

```text
Transaction
- id
- account_id
- source
- external_transaction_id, nullable
- fingerprint
- posted_date
- transaction_date, nullable
- signed_amount_minor
- payee
- raw_description
- balance_before, nullable
- balance_after, nullable
- balance_source, nullable
- import_batch_id
- source_row_number
- duplicate_status
- created_at
```

Recommended duplicate statuses:

```text
new
already_imported
pending_duplicate_review
confirmed_duplicate
confirmed_distinct
```

## Guarantees and limitations

This design guarantees that:

- Retrying the exact same file is idempotent.
- Provider IDs are unique within an account and source.
- Bank balance transitions can validate and disambiguate many duplicate candidates.
- Multiple legitimate identical credit-card purchases can be preserved through occurrence counting and review.

Without a provider ID, balance anchor, or another distinguishing source field, two genuinely separate credit-card transactions can be mathematically indistinguishable. The correct behavior in that case is to surface the ambiguity, not to claim certainty.
