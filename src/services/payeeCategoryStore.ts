import fs from 'fs';
import path from 'path';
import { normalizeLookupText } from '../utils/utils';

export interface PayeeCategoryData {
  payeeCategories: Record<string, string>;
}

/**
 * Stores a mapping from normalized payee -> YNAB categoryId
 */
export class PayeeCategoryStore {
  private data: PayeeCategoryData = { payeeCategories: {} };

  constructor(private filePath: string = path.join(process.cwd(), 'data', 'payee-categories.json')) {}

  load(): PayeeCategoryData {
    if (!fs.existsSync(this.filePath)) {
      return this.data;
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PayeeCategoryData>;
      this.data = {
        payeeCategories: parsed.payeeCategories ?? {},
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

  getCategoryForPayee(payee: string): string | undefined {
    return this.data.payeeCategories[normalizeLookupText(payee)];
  }

  setCategoryForPayee(payee: string, categoryId: string): void {
    this.data.payeeCategories[normalizeLookupText(payee)] = categoryId;
  }

  getData(): PayeeCategoryData {
    return this.data;
  }
}
