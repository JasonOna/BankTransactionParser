import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { NormalizedTransaction, YnabCategory } from '../types';
import { normalizeLookupText } from '../utils/utils';
import { PayeeCategoryStore } from './payeeCategoryStore';
import { getLogger } from '../utils/logger';

type PromptFn = (message: string) => Promise<string>;

export interface CategoryMatcherOptions {
  categories: YnabCategory[];
  store: PayeeCategoryStore;
  prompt?: PromptFn;
}

export interface CategoryResolutionReport {
  transactions: NormalizedTransaction[];
  reviewedPayees: number;
}

/**
 * Resolves categories for transactions grouped by resolved payee.
 */
export class CategoryMatcher {
  private logger = getLogger();
  private prompt: PromptFn;
  private categories: YnabCategory[];
  private store: PayeeCategoryStore;

  constructor(private options: CategoryMatcherOptions) {
    this.categories = options.categories;
    this.store = options.store;
    this.prompt = options.prompt ?? this.createPrompt();
  }

  async resolveTransactions(transactions: NormalizedTransaction[]): Promise<CategoryResolutionReport> {
    const groups = this.groupTransactionsByPayee(transactions);
    const resolved = transactions.map(txn => ({ ...txn }));
    let reviewedPayees = 0;

    for (const [payeeKey, group] of groups.entries()) {
      const payee = group[0].payee ?? group[0].merchant;
      reviewedPayees += 1;

      // Check if a mapping already exists
      const existingCategoryId = this.store.getCategoryForPayee(payee);
      if (existingCategoryId) {
        for (const txn of resolved) {
          if (normalizeLookupText(txn.payee ?? txn.merchant) === payeeKey) {
            txn.categoryId = existingCategoryId;
          }
        }
        this.logger.info({ payee, categoryId: existingCategoryId, transactionCount: group.length }, 'Applied stored category mapping');
        continue;
      }

      // Prompt the user for a category choice
      const promptMessage = this.buildPromptMessage(payee);
      const answer = await this.prompt(promptMessage);
      const trimmed = answer.trim();

      if (!trimmed) {
        // User chose to skip mapping for this payee
        this.logger.info({ payee }, 'User skipped category mapping');
        continue;
      }

      // Resolve numeric selection or name
      let selectedCategory = this.resolveSelectedCategory(trimmed);
      if (!selectedCategory) {
        // If user typed a name that wasn't matched, try to find by normalized name
        const byName = this.categories.find(c => normalizeLookupText(c.name) === normalizeLookupText(trimmed));
        selectedCategory = byName;
      }

      if (!selectedCategory) {
        this.logger.info({ payee, input: trimmed }, 'Unrecognized category input - skipping');
        continue;
      }

      // Optionally save mapping
      const saveResponse = await this.prompt(`Save mapping "${payee}" -> "${selectedCategory.name}"? [Y/n]: `);
      if (!this.isNo(saveResponse)) {
        this.store.setCategoryForPayee(payee, selectedCategory.id);
        this.store.save();
      }

      for (const txn of resolved) {
        if (normalizeLookupText(txn.payee ?? txn.merchant) === payeeKey) {
          txn.categoryId = selectedCategory.id;
        }
      }

      this.logger.info({ payee, category: selectedCategory.name, transactionCount: group.length }, 'Applied selected category to payee group');
    }

    return { transactions: resolved, reviewedPayees };
  }

  private groupTransactionsByPayee(transactions: NormalizedTransaction[]): Map<string, NormalizedTransaction[]> {
    const groups = new Map<string, NormalizedTransaction[]>();

    for (const txn of transactions) {
      const key = normalizeLookupText(txn.payee ?? txn.merchant);
      const existing = groups.get(key) ?? [];
      existing.push(txn);
      groups.set(key, existing);
    }

    return groups;
  }

  private buildPromptMessage(payee: string): string {
    const list = this.categories
      .map((c, i) => `${i + 1}. ${c.name}`)
      .join('\n');

    return `Payee: ${payee}\nCategories:\n${list}\nEnter a number to select a category, type a category name, or leave blank to skip:`;
  }

  private resolveSelectedCategory(input: string): YnabCategory | undefined {
    const index = Number.parseInt(input, 10);
    if (!Number.isNaN(index) && index >= 1 && index <= this.categories.length) {
      return this.categories[index - 1];
    }
    return undefined;
  }

  private isNo(response: string): boolean {
    return ['n', 'no', 'false'].includes(response.trim().toLowerCase());
  }

  private createPrompt(): PromptFn {
    return async (message: string) => {
      const rl = readline.createInterface({ input, output });
      try {
        return await rl.question(`${message} `);
      } finally {
        rl.close();
      }
    };
  }
}
