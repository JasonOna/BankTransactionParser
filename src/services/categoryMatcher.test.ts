import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CategoryMatcher } from './categoryMatcher';
import { PayeeCategoryStore } from './payeeCategoryStore';
import { NormalizedTransaction } from '../types';

function tmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-match-'));
  return path.join(dir, 'data.json');
}

function makePrompt(responses: string[]) {
  let i = 0;
  return async (_: string) => {
    const r = responses[i] ?? '';
    i += 1;
    return r;
  };
}

describe('CategoryMatcher', () => {
  it('applies stored mapping without prompting', async () => {
    const file = tmpFile();
    const store = new PayeeCategoryStore(file);
    store.load();
    store.setCategoryForPayee('My Payee', 'cat_1');
    store.save();

    const categories = [{ id: 'cat_1', name: 'Groceries' }];
    const matcher = new CategoryMatcher({ categories, store, prompt: makePrompt([]) });

    const txns: NormalizedTransaction[] = [
      { date: new Date(), merchant: 'M', payee: 'My Payee', amount: 10, accountId: 'a', source: 'bank', importId: '1' },
      { date: new Date(), merchant: 'M2', payee: 'My Payee', amount: 5, accountId: 'a', source: 'bank', importId: '2' },
    ];

    const res = await matcher.resolveTransactions(txns);
    expect(res.transactions.every(t => t.categoryId === 'cat_1')).toBe(true);
  });

  it('prompts and saves mapping when user selects number', async () => {
    const file = tmpFile();
    const store = new PayeeCategoryStore(file);
    store.load();

    const categories = [
      { id: 'c1', name: 'Food' },
      { id: 'c2', name: 'Transport' },
    ];

    // First prompt returns '1' to select category 1, second prompt returns 'Y' to save mapping
    const matcher = new CategoryMatcher({ categories, store, prompt: makePrompt(['1', 'Y']) });

    const txns: NormalizedTransaction[] = [
      { date: new Date(), merchant: 'X', payee: 'New Payee', amount: 3, accountId: 'a', source: 'bank', importId: 'a1' },
    ];

    const res = await matcher.resolveTransactions(txns);
    expect(res.transactions[0].categoryId).toBe('c1');

    // Reload store to check save
    const reloaded = new PayeeCategoryStore(file);
    reloaded.load();
    expect(reloaded.getCategoryForPayee('New Payee')).toBe('c1');
  });

  it('skips when user leaves blank', async () => {
    const file = tmpFile();
    const store = new PayeeCategoryStore(file);
    store.load();

    const categories = [{ id: 'c1', name: 'Misc' }];
    const matcher = new CategoryMatcher({ categories, store, prompt: makePrompt(['']) });

    const txns: NormalizedTransaction[] = [
      { date: new Date(), merchant: 'Y', payee: 'Skip Payee', amount: 7, accountId: 'a', source: 'bank', importId: 'z1' },
    ];

    const res = await matcher.resolveTransactions(txns);
    expect(res.transactions[0].categoryId).toBeUndefined();
  });
});
