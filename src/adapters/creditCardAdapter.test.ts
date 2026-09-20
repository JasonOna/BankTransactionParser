import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreditCardAdapter } from './creditCardAdapter';
import fs from 'fs';
import * as utils from '../utils/utils';

vi.mock('fs');
vi.mock('./logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('CreditCardAdapter', () => {
  let adapter: CreditCardAdapter;
  const mockAccountId = 'test-cc-account';

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new CreditCardAdapter(mockAccountId, '0');
  });

  it('should return empty array if file does not exist', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const result = await adapter.parse('fake-cc.csv');
    expect(fs.existsSync).toHaveBeenCalledWith('fake-cc.csv');
    expect(result).toEqual([]);
  });

  it('should parse valid CSV files correctly', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    const mockCsvContent = [
      '# opening_balance=1000.00',
      'Date,Amount,Account Number,,Transaction Type,Transaction Details,Category,Merchant Name,Processed On',
      '30 May 26,-39.01,Card ending 2352,,MISCELLANEOUS DEBIT,TARGET 5099 GLEN WAVERLEY,Other shopping,Target (The Glen),31 May 26'
    ].join('\n')

    vi.spyOn(fs, 'readFileSync').mockReturnValue(mockCsvContent);

    const result = await adapter.parse('fake-cc.csv');

    const date = result[0].date
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');

    const yyyyMmDd = `${yyyy}-${mm}-${dd}`;

    expect(result).toHaveLength(1);
    expect(yyyyMmDd).toBe('2026-05-30')
    expect(result[0].accountId).toBe(mockAccountId);
    expect(result[0].source).toBe('credit_card');
    expect(result[0].merchant).toBe('Target (The Glen)');
    expect(result[0].amountMinor).toBe(-3901)
    expect(result[0].balanceBefore).toBe(100000)
    expect(result[0].balanceAfter).toBe(96099)
    expect(result[0].transactionDate?.getFullYear()).toBe(2026)
    expect(result[0].transactionDate?.getMonth()).toBe(4)
    expect(result[0].transactionDate?.getDate()).toBe(31)
  });

  it('should filter transactions outside of the lookback period', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const mockCsvContent = `# opening_balance=1000.00\nDate,Amount,Account Number,,Transaction Type,Transaction Details,Category,Merchant Name,Processed On\n2020-01-01,10.00,Card ending 1234,,MISCELLANEOUS DEBIT,Old Payee,Other,Old Payee,`;
    vi.spyOn(fs, 'readFileSync').mockReturnValue(mockCsvContent);

    vi.spyOn(utils, 'isWithinLookback').mockReturnValue(false);

    const result = await adapter.parse('fake-cc.csv', 30);

    expect(result).toHaveLength(0);
    
    vi.restoreAllMocks();
  });

  it('rejects files without valid opening balance metadata', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('Date,Amount\n30 May 26,-1.00');

    await expect(adapter.parse('fake-cc.csv')).rejects.toThrow('opening balance metadata is required');
  });

  it('should handle CSV parsing errors gracefully', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('Read error');
    });

    await expect(adapter.parse('fake-cc.csv')).rejects.toThrow('Failed to parse credit card CSV: Read error');
  });
});
