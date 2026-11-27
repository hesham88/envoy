import { describe, expect, it } from 'vitest';
import { detectWithRules } from './rules';

const accounts = (text: string) =>
  detectWithRules(text)
    .filter((e) => e.type === 'ACCOUNT')
    .map((e) => e.value);

describe('staff and employee numbers', () => {
  it('masks a number the text calls an employee, staff, payroll or badge number', () => {
    expect(accounts('Employee NB-4471-2290')).toEqual(['NB-4471-2290']);
    expect(accounts('Staff no. 55-201-934')).toEqual(['55-201-934']);
    expect(accounts('Payroll ID: 7730 4412 09')).toEqual(['7730 4412 09']);
    expect(accounts('badge #A 902211')).toEqual(['A 902211']);
  });

  it('leaves the words alone when no number follows', () => {
    expect(accounts('Every employee gets 21 days of leave.')).toEqual([]);
    expect(accounts('Staff meeting on Monday at 10.')).toEqual([]);
  });
});
