import type {
  AiJob,
  AiProposal,
  AiProposalField,
} from '@artisan-marketplace/contracts';
import { normalizeField } from './ai-validation-pipeline.js';

/**
 * The product fields a staleness check compares, as the AI job snapshot and
 * the current product both hold them.
 */
export type StalenessProduct = {
  title: string | null;
  description: string | null;
  category: string | null;
  materials: readonly string[];
};

/**
 * Whether the product has moved since this proposal was generated.
 *
 * The job recorded the product's values when it was enqueued, and that
 * snapshot is what the provider was actually given, so it is the baseline.
 * A field that has since changed means the proposal rests on input that no
 * longer holds.
 *
 * This lives in the AI module's domain because the job's input snapshot is
 * AI-owned, and it is a pure function so that every surface which reports
 * staleness — the decision path and the review surface — reports the same
 * thing. Two implementations would let them disagree about whether a
 * suggestion is current, which is precisely the fact a human is deciding on.
 *
 * Staleness is reported, not enforced. The documented conflict policy is
 * that the newest confirmed edit wins, and an artisan who has already
 * retitled their product can still choose to take a proposal for it. What
 * must never happen is a value changing without the artisan knowing.
 */
export function isProposalStale(
  job: AiJob,
  proposal: AiProposal,
  product: StalenessProduct,
): boolean {
  return (
    JSON.stringify(
      normalizeFieldOrNull(
        proposal.field,
        job.input.product[proposal.field] ?? null,
      ),
    ) !==
    JSON.stringify(
      normalizeFieldOrNull(
        proposal.field,
        currentFieldOf(product, proposal.field),
      ),
    )
  );
}

function currentFieldOf(
  product: StalenessProduct,
  field: AiProposalField,
): string | readonly string[] | null {
  if (field === 'materials') {
    return product.materials;
  }

  return product[field];
}

function normalizeFieldOrNull(
  field: AiProposalField,
  value: string | readonly string[] | null,
): string | readonly string[] | null {
  if (value === null) {
    return null;
  }

  return normalizeField(field, value) as
    | string
    | string[]
    | null;
}
