import fs from 'fs';
import path from 'path';
import { PayeeAliasData } from '../types';
import { normalizeLookupText } from '../utils/utils';

/**
 * Stores merchant and keyword aliases for payee resolution.
 */
export class PayeeAliasStore {
  private data: PayeeAliasData = {
    merchantAliases: {},
    keywordAliases: {},
  };

  constructor(private filePath: string = path.join(process.cwd(), 'data', 'payee-aliases.json')) {}

  load(): PayeeAliasData {
    if (!fs.existsSync(this.filePath)) {
      return this.data;
    }

    try {
      const rawContent = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(rawContent) as Partial<PayeeAliasData>;
      this.data = {
        merchantAliases: parsed.merchantAliases ?? {},
        keywordAliases: parsed.keywordAliases ?? {},
      };
      return this.data;
    } catch {
      return this.data;
    }
  }

  save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(this.data, null, 2)}\n`, 'utf-8');
  }

  getMerchantAlias(merchant: string): string | undefined {
    return this.data.merchantAliases[normalizeLookupText(merchant)];
  }

  setMerchantAlias(merchant: string, payee: string): void {
    this.data.merchantAliases[normalizeLookupText(merchant)] = payee;
  }

  getKeywordAlias(keyword: string): string | undefined {
    return this.data.keywordAliases[normalizeLookupText(keyword)];
  }

  setKeywordAlias(keyword: string, payee: string): void {
    this.data.keywordAliases[normalizeLookupText(keyword)] = payee;
  }

  getData(): PayeeAliasData {
    return this.data;
  }
}