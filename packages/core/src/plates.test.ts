import { describe, expect, it } from 'vitest';
import { detectWithRules } from './rules';

const plates = (t: string) =>
  detectWithRules(t)
    .filter((e) => e.type === 'PLATE')
    .map((e) => e.value);

describe('vehicle plates', () => {
  it('finds a plate the text names, in any format', () => {
    expect(plates('Vehicle registration: 7ABC123, parked on site.')).toEqual(['7ABC123']);
    expect(plates('Licence plate KA-01 1234 was seen at the gate.')).toEqual(['KA-01 1234']);
    expect(plates('Car plate no. ABC 1234')).toEqual(['ABC 1234']);
  });

  it('finds strict UK, French and German formats on their own', () => {
    expect(plates('Parked: AB12 CDE near the door.')).toEqual(['AB12 CDE']);
    expect(plates('Le véhicule AB-123-CD est assuré.')).toEqual(['AB-123-CD']);
    expect(plates('Kennzeichen B-MW 1234 gemeldet.')).toEqual(['B-MW 1234']);
  });

  it('leaves ordinary text, years, card numbers and IBANs alone', () => {
    expect(plates('The car is red and the registration is complete.')).toEqual([]);
    expect(plates('Car model 2024, vehicle Toyota.')).toEqual([]);
    expect(plates('Card 4532 0151 1283 0366, IBAN EG38 0019 0005 0000 0000 2631 8000 2')).toEqual(
      [],
    );
    expect(plates('Regards, the registrar.')).toEqual([]);
  });
});
