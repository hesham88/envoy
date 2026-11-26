/**
 * One-click samples: fictional documents from real situations, each with questions Envoy answers
 * on the device and questions that need the cloud (masked). `where` records what Gemma 4 did in
 * our test run (scripts/verify-samples.mjs); without the on-device model, Basic protection sends
 * every question, masked.
 */
import { EN_FREELANCE, EN_LAB, EN_LEASE, EN_LOAN, EN_OFFER } from '@envoy/core';
import type { SessionDoc } from '../app/session';

export type SampleId = 'lease' | 'offer' | 'lab' | 'freelance' | 'loan';
export interface SampleQuestion {
  text: string;
  /** Where Private mode answered it in our test run. */
  where: 'device' | 'cloud';
}
export interface Sample {
  id: SampleId;
  label: string;
  /** One line: whose document and what kind. */
  blurb: string;
  doc: SessionDoc;
  questions: readonly SampleQuestion[];
}

const doc = (d: { title: string; text: string; notice: string }): SessionDoc => ({
  title: d.title,
  text: d.text,
  source: 'sample',
  notice: d.notice,
});

export const SAMPLES: readonly Sample[] = [
  {
    id: 'lease',
    label: 'Rental lease',
    blurb: 'A tenant in Cairo, with two national IDs and a bank account.',
    doc: doc(EN_LEASE),
    questions: [
      { text: 'What is my monthly rent?', where: 'device' },
      { text: 'How much notice does my landlord need before entering?', where: 'device' },
      { text: 'Can my landlord raise the rent 20% this year?', where: 'cloud' },
    ],
  },
  {
    id: 'offer',
    label: 'Job offer',
    blurb: 'Salary, bonus, severance and a non-compete.',
    doc: doc(EN_OFFER),
    questions: [
      { text: 'How long is my probation period?', where: 'device' },
      { text: 'How many days of paid leave do I get?', where: 'device' },
      {
        text: 'If they let me go without cause after 18 months, how much severance do I get?',
        where: 'cloud',
      },
      { text: 'Can I join a healthcare software startup right after I resign?', where: 'cloud' },
    ],
  },
  {
    id: 'lab',
    label: 'Lab results and bill',
    blurb: 'Blood tests with an MRN, an insurance member ID and a claim number.',
    doc: doc(EN_LAB),
    questions: [
      { text: 'When should I repeat the vitamin D test?', where: 'device' },
      { text: 'What was my HbA1c?', where: 'device' },
      { text: 'If insurance covers 80% of the lab fee, how much do I pay?', where: 'cloud' },
      {
        text: 'Is my fasting glucose in the prediabetes range, and what should I do next?',
        where: 'cloud',
      },
    ],
  },
  {
    id: 'freelance',
    label: 'Freelance contract',
    blurb: 'Milestones, a kill fee and a liability cap.',
    doc: doc(EN_FREELANCE),
    questions: [
      { text: 'Within how many days must the client pay an invoice?', where: 'device' },
      {
        text: 'If the client cancels halfway through Milestone 2, how much do they owe me?',
        where: 'cloud',
      },
      { text: 'What is the most I could be liable for?', where: 'cloud' },
    ],
  },
  {
    id: 'loan',
    label: 'Solar loan',
    blurb: 'Instalments, an early-settlement charge and warranties.',
    doc: doc(EN_LOAN),
    questions: [
      { text: 'How long is the battery warranty?', where: 'device' },
      { text: 'How much notice do I need to settle the loan early?', where: 'device' },
      { text: 'If I pay off the loan early, how much is the penalty?', where: 'cloud' },
    ],
  },
];

/** `?sample=lab` opens that sample. */
export function sampleFromUrl(search: string): Sample | null {
  const id = new URLSearchParams(search).get('sample');
  return SAMPLES.find((s) => s.id === id) ?? null;
}
