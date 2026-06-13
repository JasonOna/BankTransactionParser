import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PayeeCategoryStore } from './payeeCategoryStore';

function tmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'payee-cat-'));
  return path.join(dir, 'data.json');
}

describe('PayeeCategoryStore', () => {
  it('saves and loads mappings', () => {
    const file = tmpFile();
    const store = new PayeeCategoryStore(file);

    // initially empty
    store.load();
    expect(store.getCategoryForPayee('Some Payee')).toBeUndefined();

    store.setCategoryForPayee('Some Payee', 'cat_123');
    store.save();

    const reloaded = new PayeeCategoryStore(file);
    reloaded.load();
    expect(reloaded.getCategoryForPayee('Some Payee')).toBe('cat_123');
  });
});
