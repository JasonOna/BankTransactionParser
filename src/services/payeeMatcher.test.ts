import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PayeeAliasStore } from './payeeAliasStore';
import { PayeeMatcher } from './payeeMatcher';
import { NormalizedTransaction, YnabPayee } from '../types';

describe('PayeeMatcher', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'payee-matcher-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createTransaction(merchant: string): NormalizedTransaction {
    return {
      date: new Date('2026-06-07T00:00:00.000Z'),
      merchant,
      payee: merchant,
      amount: 12.34,
      accountId: 'account-1',
      source: 'credit_card',
      importId: `id-${merchant}`,
    };
  }

  function createPayees(names: string[]): YnabPayee[] {
    return names.map((name, index) => ({
      id: `payee-${index}`,
      name,
      deleted: false,
    }));
  }

  it('reuses an existing YNAB payee name without prompting', async () => {
    const aliasStore = new PayeeAliasStore(path.join(tempDir, 'aliases.json'));
    aliasStore.load();
    const prompt = vi.fn();
    const matcher = new PayeeMatcher({
      payees: createPayees(['Target (The Glen)', 'Woolworths']),
      aliasStore,
      prompt,
    });

    const result = await matcher.resolveTransactions([
      createTransaction('Target (The Glen)'),
      createTransaction('Target (The Glen)'),
    ]);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions.every(txn => txn.payee === 'Target (The Glen)')).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('uses keyword aliases before prompting', async () => {
    const aliasStore = new PayeeAliasStore(path.join(tempDir, 'aliases.json'));
    aliasStore.load();
    aliasStore.setKeywordAlias('woolworths', 'Woolworths');
    const prompt = vi.fn();
    const matcher = new PayeeMatcher({
      payees: createPayees(['Woolworths']),
      aliasStore,
      prompt,
    });

    const result = await matcher.resolveTransactions([
      createTransaction('Woolworths Market Clyde North'),
    ]);

    expect(result.transactions[0].payee).toBe('Woolworths');
    expect(prompt).not.toHaveBeenCalled();
  });

  it('prompts once for an unknown merchant and saves the alias', async () => {
    const aliasStore = new PayeeAliasStore(path.join(tempDir, 'aliases.json'));
    aliasStore.load();
    const prompt = vi
      .fn()
      .mockResolvedValueOnce('Local Cafe')
      .mockResolvedValueOnce('y')
      .mockResolvedValueOnce('cafe');

    const matcher = new PayeeMatcher({
      payees: createPayees(['Woolworths']),
      aliasStore,
      prompt,
    });

    const result = await matcher.resolveTransactions([
      createTransaction('Cafe A'),
      createTransaction('Cafe A'),
    ]);

    expect(result.transactions.every(txn => txn.payee === 'Local Cafe')).toBe(true);
    expect(prompt).toHaveBeenCalledTimes(3);
    expect(aliasStore.getMerchantAlias('Cafe A')).toBe('Local Cafe');
    expect(aliasStore.getKeywordAlias('cafe')).toBe('Local Cafe');
    expect(fs.existsSync(path.join(tempDir, 'aliases.json'))).toBe(true);
  });
});