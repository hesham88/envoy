import { describe, expect, it } from 'vitest';
import { flagNames } from './names';

const names = (text: string) => flagNames(text, []).map((e) => e.value);

describe('flagNames (Basic protection)', () => {
  // Regressions from the eval's Basic arm (tests/eval/cases.json): each of these leaked before.
  it('catches hyphenated Arabic surnames', () => {
    expect(names('1. Parties. Hisham El-Masry, national ID 2801…')).toEqual(['Hisham El-Masry']);
    expect(names('1. Patient Record. Yasmin El-Banna, national ID')).toEqual(['Yasmin El-Banna']);
    expect(names('Member: Seif El-Din. Card billed')).toEqual(['Seif El-Din']);
    expect(names('Tariq El-Sawy ("Landlord") and Hanaa Maher')).toEqual([
      'Tariq El-Sawy',
      'Hanaa Maher',
    ]);
    expect(names('Signed by Abdel-Rahman Ali.')).toEqual(['Abdel-Rahman Ali']);
  });

  it('keeps the name when a role word comes first', () => {
    expect(
      names('1. Contact. Landlord Karim Fathy leases to Tenant Mona Adel (primary phone'),
    ).toEqual(['Karim Fathy', 'Mona Adel']);
    expect(names('Parties. Landlord Karim Fathy leases the apartment to Co-Tenants')).toEqual([
      'Karim Fathy',
    ]);
  });

  it('ignores headings and labels made of ordinary words', () => {
    const doc = [
      'Base Salary',
      'The base salary is EGP 30,000.',
      'Referring Physician: Dr. Omar Nabil',
      'Milestone Fee',
      'Principal Balance',
      'Termination Without Cause',
      'The tenant Karim Fathy signs.',
    ].join('\n');
    expect(names(doc)).toEqual(['Dr. Omar Nabil', 'Karim Fathy']);
  });

  it('never runs a name across a line break', () => {
    expect(names('Tenant: Mona Adel\nEmail: mona.adel@example.com')).toEqual(['Mona Adel']);
  });

  it('still ignores ordinary capitalised phrases', () => {
    expect(
      names('This Residential Lease Agreement is made in Cairo, Arab Republic of Egypt.'),
    ).toEqual([]);
    expect(names('The Landlord may raise the Rent once a year.')).toEqual([]);
  });

  it('still handles titles and names in capitals', () => {
    expect(names('Dr. Omar and Mrs Hala Samir met AHMED HASSAN.')).toEqual([
      'Dr. Omar',
      'Mrs Hala Samir',
      'AHMED HASSAN',
    ]);
  });
});
