import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BankAdapter } from './bankAdapter';
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

describe('BankAdapter', () => {
  let adapter: BankAdapter;
  const mockAccountId = 'test-account-123';

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new BankAdapter(mockAccountId);
  });

  it('should return empty array if file does not exist', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const result = await adapter.parse('fake-path.csv');
    expect(fs.existsSync).toHaveBeenCalledWith('fake-path.csv');
    expect(result).toEqual([]);
  });

  it('should parse valid CSV files correctly', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const mockCsvContent = `Date,Description,Debit,Credit,Balance\n30/05/2026,Eftpos Debit                  30May10:24 Tally Ho Bakery    \\Mount Waverley    Au,8.30,,55263.17`;
    vi.spyOn(fs, 'readFileSync').mockReturnValue(mockCsvContent);

    // Mocking utils if needed, or let them execute if they are simple enough
    // In this case, we rely on utils.ts to actually return results.
    const result = await adapter.parse('fake-path.csv');

    expect(result).toHaveLength(1);
    expect(result[0].accountId).toBe(mockAccountId);
    expect(result[0].source).toBe('bank');
    expect(result[0].amount).toBeDefined();
    expect(result[0].date).toBeInstanceOf(Date);
  });

  it('should filter transactions outside of the lookback period', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const mockCsvContent = `Transaction Date,Description,Amount,Account Number\n2020-01-01,Old Payee,10.00,123456`;
    vi.spyOn(fs, 'readFileSync').mockReturnValue(mockCsvContent);

    // Assuming utils.isWithinLookback works correctly and will filter out an old date.
    // We mock it temporarily to guarantee the filter out
    vi.mocked(utils.isWithinLookback); // might be a bit tricky if we partially mock. Let's just override using vi.spyOn
    vi.spyOn(utils, 'isWithinLookback').mockReturnValue(false);

    const result = await adapter.parse('fake-path.csv', 30);

    expect(result).toHaveLength(0);
    
    // Restore
    vi.restoreAllMocks();
  });

  it('should handle CSV parsing errors gracefully', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    // Missing columns or invalid data to trigger an error
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('Read error');
    });

    await expect(adapter.parse('fake-path.csv')).rejects.toThrow('Failed to parse bank CSV: Read error');
  });
});
