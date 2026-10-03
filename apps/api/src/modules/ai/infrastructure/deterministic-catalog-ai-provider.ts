import type {
  AiFailureCode,
} from '@artisan-marketplace/contracts';
import { AiProviderError } from '../domain/ai-error.js';
import type {
  CatalogAiAttribution,
  CatalogAiProvider,
  CatalogAiRequest,
  CatalogAiResult,
} from '../domain/catalog-ai-provider.js';

/**
 * A scripted answer, so failure behaviour can be exercised without a
 * provider that can be made to fail on demand.
 */
export type ScriptedOutcome =
  | { kind: 'result'; result: CatalogAiResult }
  | { kind: 'failure'; code: AiFailureCode; diagnostic: string };

/**
 * The deterministic local provider.
 *
 * It exists so the pipeline can be proven end to end without a paid
 * dependency, and so tests can drive every branch the pipeline has: a clean
 * answer, an answer missing a field, an answer with a wrong-typed field, and
 * each provider failure category. ADR-010 requires AI behaviour in
 * application tests to be fixture-backed for exactly this reason.
 *
 * It is a development and test adapter. The composition root refuses to
 * select it outside those environments, so a deployment cannot come to
 * depend on it: a stub that quietly answers in production would be worse
 * than no AI at all, because the product would look assisted while nothing
 * was.
 *
 * It derives its answer from the request input rather than returning a fixed
 * object, so the output is a function of the input and the tests assert a
 * real relationship rather than a memorized constant.
 */
export class DeterministicCatalogAiProvider
  implements CatalogAiProvider
{
  readonly attribution: CatalogAiAttribution = {
    provider: 'deterministic-local',
    model: 'catalog-draft-fixture',
    modelVersion: '1',
  };

  /**
   * Outcomes consumed in order, one per call. Once exhausted the provider
   * answers from its own derivation, so a test that scripts three failures
   * and calls five times still gets a defined result rather than an
   * accidental success.
   */
  private readonly script: ScriptedOutcome[] = [];

  constructor(script: readonly ScriptedOutcome[] = []) {
    this.script.push(...script);
  }

  get calls(): number {
    return this.callCount;
  }

  private callCount = 0;

  get lastRequest(): CatalogAiRequest | null {
    return this.last;
  }

  private last: CatalogAiRequest | null = null;

  async generateCatalogDraft(
    request: CatalogAiRequest,
  ): Promise<CatalogAiResult> {
    this.callCount += 1;
    this.last = request;

    const scripted = this.script.shift();

    if (scripted) {
      if (scripted.kind === 'failure') {
        throw new AiProviderError(
          scripted.code,
          'The deterministic provider was scripted to fail.',
          scripted.diagnostic,
        );
      }

      return scripted.result;
    }

    return deriveFixture(request);
  }
}

/**
 * Builds an answer from the request.
 *
 * The transcription is the one field a human actually produced, so when it is
 * present it becomes the description. Otherwise the description is derived
 * from the media kinds the job referenced, which is enough to exercise
 * normalization, confidence, and the publish-blocking-field risk rule
 * without asserting anything about how a real model behaves.
 */
function deriveFixture(
  request: CatalogAiRequest,
): CatalogAiResult {
  const product = request.input.product;

  const materials = deriveMaterials(product.materials);

  const description =
    request.input.transcription?.trim() ||
    `Handmade piece from ${
      request.media.length > 0
        ? request.media
            .map((reference) =>
              reference.kind.toLowerCase(),
            )
            .sort()
            .join(' and ')
        : 'local materials'
    }.`;

  return {
    title:
      product.title?.trim() ||
      'Handmade Basket',
    description: `  ${description}\n\n  Finished by hand.  `,
    category:
      product.category?.trim() ||
      'basketry',
    ...(materials.length > 0
      ? { materials }
      : {}),
    fieldConfidence: {
      title: 0.9,
      description: 0.8,
      category: 0.55,
      materials: 0.75,
    },
  };
}

function deriveMaterials(
  existing: readonly string[],
): string[] {
  const normalized = existing
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (normalized.length > 0) {
    return [
      ...normalized,
      normalized[0]!.toUpperCase(),
    ];
  }

  return ['bamboo', 'natural fibre'];
}
