import { describe, expect, it } from 'vitest';
import {
  checkOutbound,
  detectWithRules,
  maskFindings,
  scanText,
  validateCustomRule,
} from './index';

// Key-shaped test values are assembled at runtime so no secret-like literal sits in the repo.
const fake = (prefix: string, n: number, ch = 'A') => prefix + ch.repeat(n);
const AWS = fake('AKIA', 16, 'Q');
const GOOGLE = fake('AIza', 35, 'x');
const GITHUB = fake('ghp_', 36, 'b');
const JWT = ['eyJ' + 'a'.repeat(12), 'eyJ' + 'b'.repeat(12), 'c'.repeat(20)].join('.');

describe('secret detection', () => {
  it('finds provider keys, JWTs and PEM private keys', () => {
    const pem = [
      ['-----BEGIN RSA', 'PRIVATE KEY-----'].join(' '),
      'M'.repeat(40),
      ['-----END RSA', 'PRIVATE KEY-----'].join(' '),
    ].join('\n');
    const text = `aws ${AWS} google ${GOOGLE} gh ${GITHUB}\njwt ${JWT}\n${pem}`;
    const found = detectWithRules(text).filter((e) => e.type === 'SECRET');
    expect(found.map((e) => e.value)).toEqual([AWS, GOOGLE, GITHUB, JWT, pem]);
  });

  it('takes only the value of a password or api_key assignment', () => {
    const text = 'DB_PASSWORD = "hunter2-very-long"\napi_key: Zx81kq99plm';
    const found = detectWithRules(text).filter((e) => e.type === 'SECRET');
    expect(found.map((e) => e.value)).toEqual(['hunter2-very-long', 'Zx81kq99plm']);
    expect(text.slice(found[0]!.start, found[0]!.end)).toBe('hunter2-very-long');
  });

  it('never reads the next line as the value of an empty assignment', () => {
    const env = ['VITE_FIREBASE_API_KEY=', 'AUTH_TOKEN=""', 'DEBUG=true'].join('\n');
    expect(scanText(env).findings.filter((f) => f.type === 'SECRET')).toEqual([]);
  });

  it('leaves ordinary prose alone', () => {
    expect(
      detectWithRules('The password policy is strict. Ask Skye for a token of thanks.').filter(
        (e) => e.type === 'SECRET',
      ),
    ).toEqual([]);
  });

  it('the guard blocks a secret even when spaced out', () => {
    const [e] = detectWithRules(`key ${AWS}`);
    const spaced = AWS.split('').join(' ');
    expect(checkOutbound(`send ${spaced}`, [e!]).ok).toBe(false);
  });
});

describe('custom rules', () => {
  const rules = [
    { label: 'PROJECT', terms: ['Project Falcon', 'Falcon'] },
    { label: 'CLIENT', pattern: String.raw`ACME-\d{4}` },
  ];

  it('matches whole words, any case, and tags them with the label', () => {
    const r = scanText('falcon and Project Falcon for ACME-2041, not Falconry.', { custom: rules });
    expect(r.findings.map((f) => [f.type, f.value, f.tag])).toEqual([
      ['CUSTOM', 'falcon', '[PROJECT]'],
      ['CUSTOM', 'Project Falcon', '[PROJECT_2]'],
      ['CUSTOM', 'ACME-2041', '[CLIENT]'],
    ]);
    expect(r.masked).toBe('[PROJECT] and [PROJECT_2] for [CLIENT], not Falconry.');
  });

  it('yields to a built-in detail it sits inside, so the whole detail stays masked', () => {
    const r = scanText('Office at 3 Road 9, Maadi, Cairo.', {
      custom: [{ label: 'AREA', terms: ['Maadi'] }],
    });
    expect(r.masked).toBe('Office at [ADDRESS].');
    expect(
      scanText('We met in Maadi.', { custom: [{ label: 'AREA', terms: ['Maadi'] }] }).masked,
    ).toBe('We met in [AREA].');
  });

  it('the guard applies custom rules to new text too', () => {
    expect(checkOutbound('About Project Falcon', [], { custom: rules }).ok).toBe(false);
    expect(checkOutbound('About the project', [], { custom: rules }).ok).toBe(true);
  });

  it('validates rules and skips invalid ones instead of throwing', () => {
    expect(validateCustomRule({ label: 'project', terms: ['x1'] })).toMatch(/label/);
    expect(validateCustomRule({ label: 'P', terms: [] })).toMatch(/at least one/);
    expect(validateCustomRule({ label: 'P', pattern: '(' })).toMatch(/valid/);
    expect(validateCustomRule({ label: 'P', pattern: 'a*' })).toMatch(/empty/);
    expect(validateCustomRule({ label: 'P', terms: ['ok'] })).toBeNull();
    expect(() => scanText('anything', { custom: [{ label: 'BAD', pattern: '(' }] })).not.toThrow();
  });

  it('escapes regex characters in terms', () => {
    expect(scanText('cost (a+b) here', { custom: [{ label: 'F', terms: ['(a+b)'] }] }).masked).toBe(
      'cost [F] here',
    );
    expect(scanText('use C++ daily', { custom: [{ label: 'LANG', terms: ['C++'] }] }).masked).toBe(
      'use [LANG] daily',
    );
  });
});

describe('scanText / maskFindings', () => {
  it('masks everything, or everything except kept tags', () => {
    const text = 'Mail mona@example.com, key ' + AWS;
    const r = scanText(text);
    expect(r.masked).toBe('Mail [EMAIL], key [SECRET]');
    expect(maskFindings(text, r, new Set(['[EMAIL]']))).toBe('Mail mona@example.com, key [SECRET]');
  });

  it('is fast enough to run on every keystroke', () => {
    const big =
      'Mona Adel paid EGP 8,500 to EG380019000500000000263180002 on 1 March 2026. '.repeat(400); // ~30 KB
    const t0 = performance.now();
    scanText(big);
    expect(performance.now() - t0).toBeLessThan(250);
  });
});
