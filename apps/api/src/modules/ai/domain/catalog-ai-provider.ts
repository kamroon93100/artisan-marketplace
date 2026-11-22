import type {
  AiJobInput,
  AiJobMediaReference,
} from '@artisan-marketplace/contracts';

/**
 * Attribution for an execution.
 *
 * ADR-005 requires an AI execution to be attributable to the provider,
 * model, and model version. The prompt, schema, and pipeline versions are
 * application-owned, so they are not the adapter's to declare; they are
 * supplied on the request and recorded by the pipeline alongside these.
 */
export type CatalogAiAttribution = {
  provider: string;
  model: string;
  modelVersion: string | null;
};

/**
 * What the capability is asked to do, in provider-neutral terms.
 *
 * Media arrives as references, never as bytes. An adapter that needs content
 * resolves the reference itself, inside its own provider and privacy policy,
 * so the job record never becomes a second copy of the media.
 */
export type CatalogAiImage = {
  mediaId: string;
  bytes: Uint8Array;
  contentType: string;
};

export type CatalogAiRequest = {
  requestId: string;
  correlationId: string;
  jobId: string;
  jobType: 'CATALOG_FIELD_GENERATION';
  productId: string;
  promptVersion: string;
  schemaVersion: string;
  pipelineVersion: string;
  input: AiJobInput;
  media: readonly AiJobMediaReference[];
  images?: readonly CatalogAiImage[];
};

/**
 * The raw result of a provider call.
 *
 * The return type is `unknown` deliberately. This is the trust boundary
 * ADR-002 and ADR-005 describe: the adapter's job is to make the call, not to
 * vouch for the answer. Anything that narrowed the type here would have
 * moved validation upstream of the place the contract requires it, and a
 * model that returns a string where an object was expected would then be a
 * type error in adapter code rather than a validated failure with a job
 * state.
 */
export type CatalogAiResult = unknown;

/**
 * One capability, not a general client.
 *
 * ADR-005 requires the domain to depend on capability contracts rather than a
 * vendor. `transcribeAudio`, `analyzeImage`, and `generateEmbedding` are
 * separate capabilities with separate adapters and are deliberately not
 * declared here as unimplemented members: an interface with placeholder
 * methods is an interface the domain will start calling.
 */
export interface CatalogAiProvider {
  readonly attribution: CatalogAiAttribution;

  /**
   * Generates a proposed catalog draft.
   *
   * Implementations either return a result the pipeline will validate, or
   * throw an `AiProviderError` carrying a normalized failure code and the
   * provider's own diagnostic. They must not throw anything else for an
   * expected condition, and they must not write to any canonical store.
   */
  generateCatalogDraft(
    request: CatalogAiRequest,
  ): Promise<CatalogAiResult>;
}
