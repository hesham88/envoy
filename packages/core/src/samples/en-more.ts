/**
 * More sample documents for demos and tests. Clauses come from the eval cases in
 * `tests/eval/cases.json` (each with one consistent, fictional cast). All people, IDs, accounts
 * and numbers are fictional; IDs and IBANs are structurally valid so the detectors can be shown
 * working, but belong to no one.
 */
export interface SampleDocument {
  title: string;
  notice: string;
  text: string;
}

const NOTICE = 'All people, IDs and numbers are fictional.';

export const EN_OFFER: SampleDocument = {
  title: 'Job offer, Giza',
  notice: NOTICE,
  text: `EMPLOYMENT OFFER AND AGREEMENT
Giza, Arab Republic of Egypt

This Employment Agreement is signed on 1 November 2025.

1. Parties. Between Ramy Lotfy, for Nile Ledger Systems ("Employer"), and Salma Mostafa, national ID 29605210104321, phone +20 101 333 8899, email salma.mostafa@example.com, residing at 22 Syria St, Mohandessin, Giza ("Employee").

2. Compensation. The Employee's gross monthly salary is EGP 65,000, paid on the 25th of each month.

3. Direct Deposit. Salary will be transferred to the Employee's IBAN EG38 0019 0005 0000 0000 2631 8000 2.

4. Probation. The first ninety (90) days of employment are a probationary period during which either party may end the contract with seven (7) days' written notice.

5. Annual Leave. The Employee receives twenty-one (21) working days of paid annual leave.

6. Annual Performance Bonus. At 100% target achievement, the Employee earns an annual bonus equal to 1.8 times the gross monthly salary.

7. Equipment Allowance. The Employer provides a one-time home-office equipment allowance of up to EGP 3,000 on submission of original receipts. Any amount above EGP 3,000 is paid by the Employee.

8. Intellectual Property. Inventions made with Company equipment or relating to the Company's business belong to the Company. Works created entirely on the Employee's own time, without Company equipment or confidential data, and unrelated to the Company's products remain the Employee's property.

9. Non-Competition. For six (6) months after termination, the Employee may not work for a direct competitor offering consumer payment gateway or mobile wallet services in Egypt. This does not apply to non-financial software such as healthcare, education or logistics.

10. Termination Without Cause. If the Employer ends this Agreement without cause after the probation period, the Employer shall pay severance equal to two (2) months of gross monthly salary, plus a 60-day notice period.`,
};

export const EN_LAB: SampleDocument = {
  title: 'Lab results and bill, Dokki',
  notice: NOTICE,
  text: `NILE VALLEY LABORATORIES
Patient report and invoice

1. Patient. Adel Mansour, national ID 26809120103456, phone +20 100 901 2345, email adel.mansour@example.com, address 11 Tahrir St, Dokki, Giza. MRN: 4471-2093-88. Accession #LB 5520918. Collected on 12 October 2026.

2. Referring Physician. Ordered by Dr. Hany Selim.

3. Metabolic Panel. Fasting plasma glucose: 114 mg/dL (normal 70–99 mg/dL; impaired fasting glucose, prediabetes range 100–125 mg/dL; provisional diabetes threshold 126 mg/dL or more). HbA1c: 5.9% (normal below 5.7%; prediabetes 5.7%–6.4%).

4. Vitamin D. Serum 25-OH vitamin D: 14 ng/mL (deficient below 20 ng/mL). Supplement with colecalciferol as prescribed.

5. Pathologist Comment. Glucose values sit in the impaired fasting glucose (prediabetes) range. Repeat HbA1c in three (3) months and review diet and physical activity with the referring physician. Schedule a repeat vitamin D blood test in eight (8) weeks.

6. Fees. Metabolic panel EGP 950; vitamin D test EGP 500. Total lab fee: EGP 1,450.

7. Insurance. Member ID: 4410 2093 7712, Policy Plan B. The insurer reimburses 80% of laboratory fees directly; the patient pays a 20% co-payment at the desk. Claim no. 2026-118843.

8. Refunds. Overpayments are refunded to the patient's IBAN EG38 0019 0005 0000 0000 2631 8000 2 within 14 days.`,
};

export const EN_FREELANCE: SampleDocument = {
  title: 'Freelance design contract',
  notice: NOTICE,
  text: `CONSULTING AGREEMENT

This Consulting Agreement is made on 3 September 2026.

1. Parties. Between Bassem Fouad, for Delta Mobility ("Client"), and Mariam Rizk, national ID 29311090106677, phone +20 106 111 2233, email mariam.rizk@example.com ("Consultant").

2. Scope. The Consultant designs and delivers the Client's mobile design system in three milestones.

3. Milestone Fees. Milestone 1 (Research) USD 3,000; Milestone 2 (Design System Delivery) USD 6,000; Milestone 3 (Handover) USD 2,000. Total contract fee: USD 11,000.

4. Invoicing. Invoices are submitted on the last business day of each month and must be paid in full within fifteen (15) calendar days of receipt.

5. Payment Account. The Client pays the Consultant via IBAN EG38 0019 0005 0000 0000 2631 8000 2.

6. Cancellation Kill Fee. If the Client cancels an active milestone after work has begun, the Client shall pay 50% of that milestone's fee within 14 days.

7. Limitation of Liability. Neither party's total liability under this Agreement shall exceed 100% of the total contract fee in Clause 3, and neither party is liable for indirect or consequential damages.

8. Ownership. The Client owns the final delivered designs once every invoice is paid. The Consultant may show the work in a portfolio after public launch.`,
};

export const EN_LOAN: SampleDocument = {
  title: 'Solar system loan, Heliopolis',
  notice: NOTICE,
  text: `SOLAR SYSTEM PURCHASE AND FINANCING AGREEMENT

1. Borrower. Samer Fawzy, national ID 28103170102345, phone +20 100 321 6549, email samer.fawzy@example.com, address 16 El-Merghany St, Heliopolis, Cairo. Direct debit IBAN: EG38 0019 0005 0000 0000 2631 8000 2. Account number 1010192316.

2. Purchase. A 10 kW hybrid solar system with a lithium battery pack, installed at the address above. Total system cost: EGP 495,000, with a down payment of EGP 95,000.

3. Financing. The remaining principal balance of EGP 400,000 is repaid in 48 monthly instalments of EGP 10,450 on the 5th of each month.

4. Early Prepayment. The Borrower may settle the full remaining principal at any time on 15 days' written notice, subject to an early-settlement charge of 3% of the prepaid principal.

5. Late Payment. An instalment paid more than 10 days late incurs a late fee of EGP 250.

6. Warranty. The hybrid inverter is warranted for five (5) years. The lithium battery pack is covered for ten (10) years or 6,000 charge cycles, whichever comes first.`,
};
