import { describe, expect, it } from 'vitest';
import { evaluate, parseAmount } from './expr';

describe('evaluate', () => {
  const v = { RENT: 8500, DEPOSIT: 17000 };

  it('does arithmetic on tag values', () => {
    expect(evaluate('RENT * 1.10', v)).toBe(9350);
    expect(evaluate('RENT*1.2', v)).toBe(10200);
    expect(evaluate('RENT * (1 + 0.1)', v)).toBe(9350);
    expect(evaluate('DEPOSIT - RENT', v)).toBe(8500);
    expect(evaluate('RENT × 12', v)).toBe(102000);
    expect(evaluate('DEPOSIT ÷ 2', v)).toBe(8500);
    expect(evaluate('-RENT + 10000', v)).toBe(1500);
  });

  it('accepts tags written with brackets', () => {
    expect(evaluate('[RENT] * 1.1', v)).toBe(9350);
  });

  it('accepts percentages and comma-formatted numbers inside expressions', () => {
    expect(evaluate('RENT * 110%', v)).toBe(9350);
    expect(evaluate('RENT * (1 + 10%)', v)).toBe(9350);
    expect(evaluate('RENT + 1,000', v)).toBe(9500);
  });

  it('rounds away floating-point noise to cents', () => {
    expect(evaluate('0.1 + 0.2', v)).toBe(0.3);
  });

  it('refuses anything that is not plain arithmetic on known tags', () => {
    expect(evaluate('alert(1)', v)).toBeNull();
    expect(evaluate('RENT * ', v)).toBeNull();
    expect(evaluate('UNKNOWN * 2', v)).toBeNull();
    expect(evaluate('RENT / 0', v)).toBeNull();
    expect(evaluate('(RENT', v)).toBeNull();
    expect(evaluate('constructor', v)).toBeNull();
    expect(evaluate('', v)).toBeNull();
  });
});

describe('parseAmount', () => {
  it('reads amount and currency in either order', () => {
    expect(parseAmount('EGP 8,500')).toEqual({ amount: 8500, currency: 'EGP' });
    expect(parseAmount('8,500 EGP')).toEqual({ amount: 8500, currency: 'EGP' });
    expect(parseAmount('$1,200.50')).toEqual({ amount: 1200.5, currency: 'USD' });
    expect(parseAmount('250 LE')).toEqual({ amount: 250, currency: 'EGP' });
  });

  it('returns null without a number', () => {
    expect(parseAmount('EGP')).toBeNull();
  });
});
