import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { NormalizedTransaction, PayeeMatchResult, YnabPayee } from '../types';
import { normalizeLookupText } from '../utils/utils';
import { PayeeAliasStore } from './payeeAliasStore';
import { getLogger } from '../utils/logger';

type PromptFn = (message: string) => Promise<string>;

export interface PayeeMatcherOptions {
  payees: YnabPayee[];
  aliasStore: PayeeAliasStore;
  prompt?: PromptFn;
}

export interface PayeeResolutionReport {
  transactions: NormalizedTransaction[];
  reviewedMerchants: number;
}

/**
 * Resolves transaction merchants to YNAB payees and collects interactive review input.
 */
export class PayeeMatcher {
  private logger = getLogger();
  private prompt: PromptFn;
  private payees: YnabPayee[];

  constructor(private options: PayeeMatcherOptions) {
    this.payees = [...options.payees];
    this.prompt = options.prompt ?? this.createPrompt();
  }

  async resolveTransactions(transactions: NormalizedTransaction[]): Promise<PayeeResolutionReport> {
    const groups = this.groupTransactionsByMerchant(transactions);
    const resolvedTransactions = transactions.map(txn => ({ ...txn }));
    let reviewedMerchants = 0;

    for (const [merchantKey, group] of groups.entries()) {
      const merchant = group[0].merchant;
      const payeeMatch = await this.resolveMerchant(merchant);
      reviewedMerchants += 1;

      for (const txn of resolvedTransactions) {
        if (normalizeLookupText(txn.merchant) === merchantKey) {
          txn.payee = payeeMatch.payee;
        }
      }

      this.logger.info({ merchant, payee: payeeMatch.payee, transactionCount: group.length }, `Resolved merchant payee by ${payeeMatch.matchedBy}`);
    }

    return {
      transactions: resolvedTransactions,
      reviewedMerchants,
    };
  }

  private groupTransactionsByMerchant(transactions: NormalizedTransaction[]): Map<string, NormalizedTransaction[]> {
    const groups = new Map<string, NormalizedTransaction[]>();

    for (const transaction of transactions) {
      const merchantKey = normalizeLookupText(transaction.merchant);
      const existing = groups.get(merchantKey) ?? [];
      existing.push(transaction);
      groups.set(merchantKey, existing);
    }

    return groups;
  }

  private async resolveMerchant(merchant: string): Promise<PayeeMatchResult> {
    const normalizedMerchant = normalizeLookupText(merchant);
    const merchantAlias = this.options.aliasStore.getMerchantAlias(merchant);
    if (merchantAlias) {
      return {
        merchant,
        payee: this.canonicalPayeeName(merchantAlias),
        matchedBy: 'merchant_alias'
      }
    }

    const keywordMatch = this.findKeywordMatch(normalizedMerchant);
    if (keywordMatch) {
      return {
        merchant,
        payee: this.canonicalPayeeName(keywordMatch),
        matchedBy: 'keyword_alias'
      }
    }

    const ynabMatch = this.findExistingPayeeMatch(normalizedMerchant);
    if (ynabMatch) {
      return {
        merchant,
        payee: ynabMatch,
        matchedBy: 'ynab_payee'
      }
    }

    return this.promptForMerchant(merchant);
  }

  private findKeywordMatch(normalizedMerchant: string): string | undefined {
    const aliases = this.options.aliasStore.getData().keywordAliases;
    const matches = new Set<string>();

    for (const [keyword, payee] of Object.entries(aliases)) {
      if (normalizedMerchant.includes(keyword)) {
        matches.add(payee);
      }
    }

    if (matches.size === 1) {
      return [...matches][0];
    }

    return undefined;
  }

  private findExistingPayeeMatch(normalizedMerchant: string): string | undefined {
    for (const payee of this.payees) {
      if (normalizeLookupText(payee.name) === normalizedMerchant) {
        return payee.name;
      }
    }

    return undefined;
  }

  private canonicalPayeeName(payeeName: string): string {
    const exactMatch = this.payees.find(payee => normalizeLookupText(payee.name) === normalizeLookupText(payeeName));
    return exactMatch?.name ?? payeeName;
  }

  private suggestPayees(merchant: string): string[] {
    const tokens = normalizeLookupText(merchant)
      .split(' ')
      .filter(token => token.length > 2);

    return this.payees
      .filter(payee => {
        const normalizedPayee = normalizeLookupText(payee.name);
        return tokens.some(token => normalizedPayee.includes(token) || token.includes(normalizedPayee));
      })
      .slice(0, 100)
      .map(payee => payee.name);
  }

  private async promptForMerchant(merchant: string): Promise<PayeeMatchResult> {
    const suggestions = this.suggestPayees(merchant);
    const suggestionBlock = suggestions.length > 0
      ? `\nSuggestions:\n${suggestions.map((name, index) => `${index + 1}. ${name}`).join('\n')}\n`
      : '\nSuggestions: none\n';

    while (true) {
      const response = await this.prompt(
        `Merchant: ${merchant}${suggestionBlock}Enter an existing payee name or a new payee name to use:`
      );

      const selected = this.resolveSelectedPayee(response, suggestions);
      if (!selected) {
        continue;
      }

      const saveMerchantAlias = await this.prompt(`Save merchant alias "${merchant}" -> "${selected}"? [Y/n]: `);
      if (!this.isNo(saveMerchantAlias)) {
        this.options.aliasStore.setMerchantAlias(merchant, selected);
      }

      const keyword = await this.prompt('Optional keyword to map to this payee (blank to skip): ');
      if (keyword.trim()) {
        this.options.aliasStore.setKeywordAlias(keyword, selected);
      }

      this.options.aliasStore.save();

      return {
        merchant,
        payee: this.canonicalPayeeName(selected),
        matchedBy: 'manual'
      }
    }
  }

  private resolveSelectedPayee(response: string, suggestions: string[]): string | undefined {
    const trimmed = response.trim();
    if (!trimmed) {
      return undefined;
    }

    const suggestionIndex = Number.parseInt(trimmed, 10);
    if (!Number.isNaN(suggestionIndex) && suggestionIndex >= 1 && suggestionIndex <= suggestions.length) {
      return suggestions[suggestionIndex - 1];
    }

    const exactExisting = this.payees.find(payee => normalizeLookupText(payee.name) === normalizeLookupText(trimmed));
    return exactExisting?.name ?? trimmed;
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