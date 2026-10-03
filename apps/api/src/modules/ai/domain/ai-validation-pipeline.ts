import type {
  AiProposalField,
  AiRiskLevel,
  AiRiskReason,
} from '@artisan-marketplace/contracts';
import { schemaFailure } from './ai-error.js';

/**
 * The four validation stages, in the order the contract fixes:
 * schema, then semantic/business, then normalization, then
 * confidence/risk.
 *
 * They are separate functions with no I/O and no shared mutable state, so
 * each is independently assertable and a change to one cannot quietly move a
 * rule that belongs to another.
 */

/* ------------------------------------------------------------------ *
 * Stage 1: schema validation
 * ------------------------------------------------------------------ */

/**
 * Structural limits for a proposed catalog value.
 *
 * These bound what can be stored and what a human is asked to read. They are
 * collected in one place so the proposal schema version has exactly one
 * definition of its own shape.
 */
export const PROPOSAL_LIMITS = {
  title: 200,
  description: 4_000,
  category: 80,
  material: 80,
  materials: 20,
} as const;

const TEXT_FIELDS = [
  'title',
  'description',
  'category',
] as const;

type TextField = (typeof TEXT_FIELDS)[number];

const FIELD_LIMITS: Record<TextField | 'material', number> = {
  title: PROPOSAL_LIMITS.title,
  description: PROPOSAL_LIMITS.description,
  category: PROPOSAL_LIMITS.category,
  material: PROPOSAL_LIMITS.material,
};

/**
 * Fields without which a product cannot be published.
 *
 * The Catalog module already declares its publish precondition as
 * `{ title, description }`. The AI module restates it rather than importing
 * it, because a proposal set is not a product and "this proposal set is
 * missing a field the product will need" is a fact about the proposal. The
 * duplication is deliberate, and the pipeline test asserts the two lists
 * agree so they cannot drift.
 */
export const PUBLISH_BLOCKING_PROPOSAL_FIELDS = [
  'title',
  'description',
] as const;

export function isPublishBlocking(
  field: AiProposalField,
): boolean {
  return (
    PUBLISH_BLOCKING_PROPOSAL_FIELDS as readonly string[]
  ).includes(field);
}

export type SchemaValidationOutcome =
  | {
      kind: 'rejected';
      issues: readonly string[];
    }
  | {
      kind: 'accepted';
      /**
       * Fields that survived structural validation, still in their
       * pre-normalization form. Normalization is a later stage and folding it
       * in here would make the stages indistinguishable.
       */
      fields: ReadonlyMap<AiProposalField, unknown>;
      issues: readonly string[];
    };

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function describeType(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'an array';
  }

  return `a ${typeof value}`;
}

/**
 * Stage 1: is this answer shaped like an answer?
 *
 * A field of the wrong type is dropped and recorded rather than failing the
 * whole response, because one malformed field is exactly the partial-result
 * case the state machine exists to express. A response that is not an object
 * at all, or that yields no usable field, has nothing to review and is
 * rejected outright.
 *
 * Keys outside the schema are recorded and ignored rather than rejected: a
 * model that adds a field is producing something the application does not yet
 * understand, and failing a run over it would be worse than ignoring it. It
 * is still recorded, so a schema being outrun is visible.
 */
export function validateSchema(
  raw: unknown,
): SchemaValidationOutcome {
  if (!isPlainObject(raw)) {
    return {
      kind: 'rejected',
      issues: ['Provider output was not a JSON object.'],
    };
  }

  const issues: string[] = [];

  for (const key of Object.keys(raw)) {
    if (
      key !== 'title' &&
      key !== 'description' &&
      key !== 'category' &&
      key !== 'materials'
    ) {
      issues.push(`Ignored unknown output key: ${key}.`);
    }
  }

  const fields = new Map<AiProposalField, unknown>();

  for (const field of TEXT_FIELDS) {
    const value = raw[field];

    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value !== 'string') {
      issues.push(
        `${field} was ${describeType(value)} rather than a string.`,
      );
      continue;
    }

    if (!value.trim()) {
      issues.push(`${field} was blank.`);
      continue;
    }

    if (value.length > FIELD_LIMITS[field]) {
      issues.push(
        `${field} exceeded ${FIELD_LIMITS[field]} characters.`,
      );
      continue;
    }

    fields.set(field, value);
  }

  if (raw.materials !== undefined && raw.materials !== null) {
    const materials = readMaterials(raw.materials, issues);

    if (materials) {
      fields.set('materials', materials);
    }
  }

  if (fields.size === 0) {
    return {
      kind: 'rejected',
      issues: [
        ...issues,
        'Provider output contained no usable field.',
      ],
    };
  }

  return {
    kind: 'accepted',
    fields,
    issues,
  };
}

function readMaterials(
  value: unknown,
  issues: string[],
): string[] | null {
  if (!Array.isArray(value)) {
    issues.push(
      `materials was ${describeType(value)} rather than an array.`,
    );
    return null;
  }

  if (value.length > PROPOSAL_LIMITS.materials) {
    issues.push(
      `materials exceeded ${PROPOSAL_LIMITS.materials} entries.`,
    );
    return null;
  }

  const accepted: string[] = [];

  for (const entry of value) {
    if (typeof entry !== 'string') {
      issues.push(
        `A materials entry was ${describeType(entry)} rather than a string.`,
      );
      continue;
    }

    if (!entry.trim()) {
      issues.push('A materials entry was blank.');
      continue;
    }

    if (entry.length > PROPOSAL_LIMITS.material) {
      issues.push(
        `A materials entry exceeded ${PROPOSAL_LIMITS.material} characters.`,
      );
      continue;
    }

    accepted.push(entry);
  }

  if (accepted.length === 0) {
    issues.push('materials contained no usable entry.');
    return null;
  }

  return accepted;
}

/* ------------------------------------------------------------------ *
 * Stage 2: semantic and business validation
 * ------------------------------------------------------------------ */

export type SemanticOutcome = {
  accepted: ReadonlyMap<AiProposalField, unknown>;
  rejected: ReadonlyMap<AiProposalField, string>;
};

/**
 * Stage 2: checks that need to know what the values mean rather than what
 * they are made of.
 *
 * This stage carries exactly two rules, and each protects a concrete
 * product outcome rather than inventing policy:
 *
 * - a materials list that carries no information once its own entries are
 *   normalized away is not a proposal;
 * - a description that is indistinguishable from the title is not a
 *   description. A provider that echoes the title has produced a value that
 *   adds nothing a buyer can use, and publishing it would make the listing
 *   look broken rather than assisted.
 *
 * Everything else that could be called semantic here — a category
 * taxonomy, prohibited claims, price policy — needs a decision that has
 * not been made, and a rule invented to fill the stage would be a durable
 * product policy nobody approved.
 *
 * What the stage buys is the *ordering* guarantee: nothing here is
 * evaluated before the schema stage has passed, and a field that passes
 * the schema and fails here is reported as a rejection rather than
 * silently dropped. Because a schema-invalid field is dropped and a
 * semantic failure is retained as REJECTED, this is the only stage that
 * can make a run finish `PARTIAL_RESULT`: something usable and something
 * refused in one answer, which is exactly the case a human review exists
 * for.
 */
export function validateSemantics(
  fields: ReadonlyMap<AiProposalField, unknown>,
): SemanticOutcome {
  const accepted = new Map<AiProposalField, unknown>();
  const rejected = new Map<AiProposalField, string>();

  const title = fields.get('title');

  for (const [field, value] of fields) {
    if (field === 'materials') {
      const normalized = normalizeMaterials(value as string[]);

      if (normalized.length === 0) {
        rejected.set(
          field,
          'materials held no entry that survived normalization, so it described nothing.',
        );
        continue;
      }

      accepted.set(field, normalized);
      continue;
    }

    if (
      field === 'description' &&
      title !== undefined &&
      normalizeText(value as string) ===
        normalizeText(title as string)
    ) {
      rejected.set(
        field,
        'description repeated the title, so it carried no information of its own.',
      );
      continue;
    }

    accepted.set(field, value);
  }

  return {
    accepted,
    rejected,
  };
}

/* ------------------------------------------------------------------ *
 * Stage 3: normalization
 * ------------------------------------------------------------------ */

/**
 * Trims, collapses horizontal whitespace runs to single spaces, and collapses
 * runs of blank lines.
 *
 * Paragraph breaks are preserved. Collapsing a generated paragraph onto one
 * line is cosmetic; collapsing the blank line between two sentences into a
 * space would join two ideas into one sentence, so newlines are kept and only
 * their surrounding padding is normalized.
 */
export function normalizeText(value: string): string {
  return value
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Trims each entry, drops blanks, drops case-insensitive duplicates keeping
 * the first spelling, and preserves the order the provider gave, because
 * order may be deliberate emphasis and re-sorting would silently discard
 * information the model expressed.
 */
export function normalizeMaterials(
  value: readonly string[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of value) {
    const normalized = normalizeText(entry);

    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

export function normalizeField(
  field: AiProposalField,
  value: unknown,
): string | string[] {
  if (field === 'materials') {
    return normalizeMaterials(value as string[]);
  }

  return normalizeText(value as string);
}

/* ------------------------------------------------------------------ *
 * Stage 4: confidence and risk
 * ------------------------------------------------------------------ */

/**
 * Below this, a publish-blocking field is flagged.
 *
 * This is a policy value, not a model property. ADR-005 requires confidence
 * thresholds to be observable and versioned when they affect workflow
 * behavior, so the decision is written onto every proposal through
 * `riskReasons`, and changing it is an `AI_PIPELINE_VERSION` change.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

const RISK_ORDER: Record<AiRiskLevel, number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

export function highestRisk(
  levels: readonly AiRiskLevel[],
): AiRiskLevel {
  return levels.reduce<AiRiskLevel>(
    (worst, level) =>
      RISK_ORDER[level] > RISK_ORDER[worst] ? level : worst,
    'NONE',
  );
}

/**
 * The confidence to record.
 *
 * `null` means the provider said nothing usable, which is different from
 * saying zero. Storing `0` would read as a measured lack of confidence rather
 * than an absence of measurement, and would suppress exactly the flag that
 * its absence should raise. A value outside `[0, 1]` is discarded for the
 * same reason: a `7` is not high confidence, it is a claim that cannot be
 * compared against the threshold at all.
 */
export function readConfidence(
  value: unknown,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  if (value < 0 || value > 1) {
    return null;
  }

  return value;
}

export type RiskAssessment = {
  riskLevel: AiRiskLevel;
  riskReasons: readonly AiRiskReason[];
};

/**
 * Stage 4: how much attention does this field need?
 *
 * Confidence is routing information and nothing else. There is no
 * `requiresReview` derived from it, because ADR-002 states that AI output
 * cannot independently authorize anything: a field at 0.99 confidence is
 * exactly as actionable as one at 0.2, which is to say not actionable until
 * a human decides.
 */
export function assessRisk(
  field: AiProposalField,
  rawConfidence: unknown,
  validationIssues: readonly string[],
): RiskAssessment {
  const riskReasons: AiRiskReason[] = [];

  if (validationIssues.length > 0) {
    riskReasons.push('SEMANTIC_VALIDATION_REJECTED');
  }

  const confidence = readConfidence(rawConfidence);

  if (
    confidence !== null &&
    confidence < LOW_CONFIDENCE_THRESHOLD &&
    isPublishBlocking(field)
  ) {
    riskReasons.push('LOW_CONFIDENCE');
  }

  if (riskReasons.length === 0) {
    return {
      riskLevel: 'NONE',
      riskReasons,
    };
  }

  return {
    riskLevel: riskReasons.includes(
      'SEMANTIC_VALIDATION_REJECTED',
    )
      ? 'HIGH'
      : 'LOW',
    riskReasons,
  };
}

/**
 * The one risk a per-field assessment cannot see: a publish-blocking field
 * that is simply absent. A set with no `title` leaves the product
 * unpublishable, and every field that *is* present looks fine on its own.
 */
export function assessProposalSetRisk(
  present: ReadonlySet<AiProposalField>,
): RiskAssessment {
  const missing = (
    PUBLISH_BLOCKING_PROPOSAL_FIELDS as readonly AiProposalField[]
  ).filter((field) => !present.has(field));

  if (missing.length === 0) {
    return {
      riskLevel: 'NONE',
      riskReasons: [],
    };
  }

  return {
    riskLevel: 'HIGH',
    riskReasons: ['MISSING_PUBLISH_BLOCKING_FIELD'],
  };
}

/* ------------------------------------------------------------------ *
 * Composition
 * ------------------------------------------------------------------ */

/**
 * One field's proposal, before identity and timestamps are assigned.
 */
export type DraftProposal = {
  field: AiProposalField;
  value: string | string[];
  confidence: number | null;
  validationStatus: 'VALID' | 'REJECTED';
  validationIssues: readonly string[];
  riskLevel: AiRiskLevel;
  riskReasons: readonly AiRiskReason[];
};

export type PipelineOutcome =
  | {
      kind: 'rejected';
      failure: ReturnType<typeof schemaFailure>;
      issues: readonly string[];
    }
  | {
      kind: 'partial';
      drafts: readonly DraftProposal[];
      issues: readonly string[];
    }
  | {
      kind: 'complete';
      drafts: readonly DraftProposal[];
      issues: readonly string[];
    };

/**
 * Runs the four stages over a raw provider result.
 *
 * A field the semantic stage rejected is still reported, with
 * `validationStatus: 'REJECTED'`, so the rejection is auditable rather than
 * merely absent. It is not reviewable: the review service refuses anything
 * that is not `VALID`, which keeps "recorded" and "actionable" separate.
 *
 * A response that loses every field to the semantic stage is a rejection
 * rather than a partial result, because there is then nothing for a human to
 * act on and reporting it as partial would tell the workflow a review is
 * waiting when none is.
 */
export function runValidationPipeline(
  raw: unknown,
  confidences: ReadonlyMap<AiProposalField, unknown>,
): PipelineOutcome {
  const schema = validateSchema(raw);

  if (schema.kind === 'rejected') {
    return {
      kind: 'rejected',
      failure: schemaFailure(
        'Provider output did not satisfy the proposal schema.',
        schema.issues.join(' '),
      ),
      issues: schema.issues,
    };
  }

  const semantic = validateSemantics(schema.fields);

  const setRisk = assessProposalSetRisk(
    new Set(semantic.accepted.keys()),
  );

  const drafts: DraftProposal[] = [];

  for (const [field, value] of semantic.accepted) {
    const normalized = normalizeField(field, value);

    const fieldRisk = assessRisk(
      field,
      confidences.get(field),
      [],
    );

    const riskReasons =
      setRisk.riskReasons.length > 0
        ? [
            ...fieldRisk.riskReasons,
            'MISSING_PUBLISH_BLOCKING_FIELD' as const,
          ]
        : fieldRisk.riskReasons;

    drafts.push({
      field,
      value: normalized as string | string[],
      confidence: readConfidence(confidences.get(field)),
      validationStatus: 'VALID',
      validationIssues: [],
      riskLevel: highestRisk([
        fieldRisk.riskLevel,
        setRisk.riskLevel,
      ]),
      riskReasons,
    });
  }

  for (const [field, issue] of semantic.rejected) {
    const value = schema.fields.get(field);

    /**
     * The schema kept this field, so its value is present. The guard is
     * here because `semantic.rejected` and `schema.fields` are built
     * separately and a future rule could reject a field the schema stage
     * never kept; dropping it silently is the failure this guards against.
     */
    if (value === undefined) {
      continue;
    }

    const fieldRisk = assessRisk(
      field,
      confidences.get(field),
      [issue],
    );

    drafts.push({
      field,
      value: normalizeField(field, value) as string | string[],
      confidence: readConfidence(confidences.get(field)),
      validationStatus: 'REJECTED',
      validationIssues: [issue],
      riskLevel: highestRisk([
        fieldRisk.riskLevel,
        setRisk.riskLevel,
      ]),
      riskReasons: [
        ...fieldRisk.riskReasons,
        'MISSING_PUBLISH_BLOCKING_FIELD' as const,
      ].filter(
        (reason, index, all) => all.indexOf(reason) === index,
      ),
    });
  }

  const reviewable = drafts.filter(
    (draft) => draft.validationStatus === 'VALID',
  );

  if (reviewable.length === 0) {
    return {
      kind: 'rejected',
      failure: schemaFailure(
        'Every proposed field failed semantic validation.',
        schema.issues.concat([
          ...semantic.rejected.values(),
        ]),
      ),
      issues: schema.issues,
    };
  }

  return {
    kind:
      reviewable.length === drafts.length
        ? 'complete'
        : 'partial',
    drafts,
    issues: schema.issues,
  };
}
