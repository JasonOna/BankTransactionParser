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
    adapter = new CreditCardAdapter(mockAccountId);
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
      'Date,Amount,Account Number,,Transaction Type,Transaction Details,Category,Merchant Name,Processed On',
      '30 May 26,-39.00,Card ending 2352,,MISCELLANEOUS DEBIT,TARGET 5099 GLEN WAVERLEY,Other shopping,Target (The Glen),'
    ].join('\n')

    vi.spyOn(fs, 'readFileSync').mockReturnValue(mockCsvContent);

    const result = await adapter.parse('fake-cc.csv');

    expect(result).toHaveLength(1);
    expect(result[0].date).toBeInstanceOf(Date);
    expect(result[0].accountId).toBe(mockAccountId);
    expect(result[0].source).toBe('credit_card');
    expect(result[0].amount).toBeDefined();
  });

  it('should filter transactions outside of the lookback period', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const mockCsvContent = `Post Date,Description,Amount,Card Last 4\n2020-01-01,Old Payee,10.00,1234`;
    vi.spyOn(fs, 'readFileSync').mockReturnValue(mockCsvContent);

    vi.spyOn(utils, 'isWithinLookback').mockReturnValue(false);

    const result = await adapter.parse('fake-cc.csv', 30);

    expect(result).toHaveLength(0);
    
    vi.restoreAllMocks();
  });

  it('should handle CSV parsing errors gracefully', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('Read error');
    });

    await expect(adapter.parse('fake-cc.csv')).rejects.toThrow('Failed to parse credit card CSV: Read error');
  });
});
