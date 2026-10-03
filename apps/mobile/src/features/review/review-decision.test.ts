import {
  NO_EDITS,
  buildDecision,
  clearEdit,
  decisionNotice,
  describeFailure,
  editSeed,
  editTextFor,
  setEditText,
  submitDecision,
  type ReviewEditState,
} from './review-decision';
import { ReviewTransportError } from '../../network/review-contract';
import type {
  ClientProposalDecisionInput,
  ClientProposalDecisionResult,
  ClientReviewSuggestion,
} from '../../network/review-contract';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

/**
 * A complete suggestion, built from what the server is documented to send.
 *
 * Every field is present because the screen reads the whole projection: a
 * fixture that omitted any of them would let a field the client depends on be
 * dropped without a test noticing.
 */
function aSuggestion(
  overrides: Partial<ClientReviewSuggestion> = {},
): ClientReviewSuggestion {
  return {
    proposalId: 'proposal-1',
    jobId: 'job-1',
    attempt: 1,
    field: 'category',
    proposedValue: 'basketry',
    currentValue: null,
    confidence: 0.91,
    riskLevel: 'NONE',
    riskReasons: [],
    stale: false,
    provider: 'deterministic-local',
    model: 'deterministic-fixture',
    modelVersion: '1',
    promptVersion: 'p1',
    schemaVersion: 's1',
    pipelineVersion: 'v1',
    ...overrides,
  };
}

function aResult(
  overrides: Partial<ClientProposalDecisionResult> = {},
): ClientProposalDecisionResult {
  return {
    product: {
      id: 'product-1',
      ownerId: 'artisan-1',
      state: 'REVIEW_REQUIRED',
      title: 'Bamboo Basket',
      description: 'Handwoven storage basket.',
      category: 'basketry',
      materials: ['bamboo'],
    },
    applied: ['category'],
    staleFields: [],
    ...overrides,
  };
}

/**
 * A send that records what it was asked to do and answers with `result`.
 */
function aSend(result: ClientProposalDecisionResult) {
  const sent: ClientProposalDecisionInput[] = [];

  return {
    sent,
    send: async (
      decision: ClientProposalDecisionInput,
    ): Promise<ClientProposalDecisionResult> => {
      sent.push(decision);

      return result;
    },
  };
}

/**
 * The value an artisan types is the value that is sent.
 *
 * This is the rule the decision path exists for. The proposal is evidence of
 * what a model suggested; the edit is the artisan's own word and is the only
 * one of the two that may overwrite their product.
 */
async function testAnEditSendsWhatTheArtisanTyped(): Promise<void> {
  const suggestion = aSuggestion({
    field: 'title',
    proposedValue: 'Bamboo Basket',
  });

  const built = buildDecision(
    suggestion,
    'EDITED',
    'A cane basket my grandmother wove',
  );

  expect(
    built.ok &&
      built.decision.decision === 'EDITED' &&
      built.decision.value ===
        'A cane basket my grandmother wove',
    `an edit sends the typed value, not the proposal (received: ${JSON.stringify(built)})`,
  );
  expect(
    !JSON.stringify(built).includes('Bamboo Basket'),
    'the model proposal does not travel with the edit',
  );
}

/**
 * Accepting and rejecting carry no value at all.
 *
 * The server refuses a value beside either, and the absence is the meaning:
 * an acceptance takes the model's value, and a rejection takes none. A client
 * that sent a value here would be building a request that is always refused.
 */
async function testAcceptAndRejectCarryNoValue(): Promise<void> {
  const suggestion = aSuggestion();

  for (const decision of ['ACCEPTED', 'REJECTED'] as const) {
    const built = buildDecision(suggestion, decision, 'ignored');

    expect(
      built.ok &&
        built.decision.decision === decision &&
        !('value' in built.decision),
      `a ${decision} carries no value even when text is present (received: ${JSON.stringify(built)})`,
    );
  }
}

/**
 * The editor opens on what the artisan had, not on what the model said.
 *
 * This is about who the value is attributed to. The server records
 * `EDITED` together with the value that was sent, and nothing in the request
 * says whether a person retyped it or simply pressed save. So an editor that
 * opened on the proposal would, the moment it was saved unchanged, put the
 * model's words into the product under a decision called `EDITED` — an
 * artisan's name on a model's text, in the one field the record is trusted
 * for. Taking the suggestion is what Accept is for, and it is recorded as
 * what it is.
 */
async function testTheEditorOpensOnTheArtisansOwnValue(): Promise<void> {
  const suggestion = aSuggestion({
    field: 'title',
    proposedValue: 'Bamboo Basket',
    currentValue: 'Hand-woven basket',
  });

  expect(
    editSeed(suggestion) === 'Hand-woven basket',
    `the editor opens on the artisan's value (received: ${editSeed(suggestion)})`,
  );
  expect(
    editTextFor(suggestion, NO_EDITS) === 'Hand-woven basket',
    'an unopened editor shows the same thing',
  );

  const saved = await submitDecision(
    NO_EDITS,
    suggestion,
    'EDITED',
    async () => aResult({ applied: ['title'] }),
  );

  expect(
    saved.state === NO_EDITS,
    'saving an editor nobody typed in drops nothing, because nothing was written',
  );

  /**
   * The value that would be sent, were this to go on the wire, is the
   * artisan's. Asserted through `buildDecision` because that is where the
   * value is taken from.
   */
  const built = buildDecision(
    suggestion,
    'EDITED',
    editTextFor(suggestion, NO_EDITS),
  );

  expect(
    built.ok &&
      built.decision.decision === 'EDITED' &&
      built.decision.value === 'Hand-woven basket',
    `an untouched editor sends the artisan's value, not the model's (received: ${JSON.stringify(built)})`,
  );
}

/**
 * A list-valued field opens joined, because that is how the value is displayed
 * above the editor, and an editor that opened on something else would look
 * like a different value.
 */
async function testAListValuedFieldOpensJoined(): Promise<void> {
  expect(
    editSeed(
      aSuggestion({
        field: 'materials',
        proposedValue: ['bamboo', 'cane'],
        currentValue: ['cane', 'bamboo'],
      }),
    ) === 'cane, bamboo',
    "a list-valued field opens on the artisan's entries, joined as displayed",
  );
  expect(
    editSeed(
      aSuggestion({ field: 'category', currentValue: null }),
    ) === '',
    'a field with no value yet opens empty, which is what there is to correct',
  );
}

/**
 * Materials are sent as a list.
 *
 * The server normalizes that field as a list of entries. A string would be
 * normalized entry by entry, turning "cane" into four one-letter materials, so
 * the artisan's comma-separated text is split here, where what was meant can
 * still be seen.
 */
async function testMaterialsAreSentAsAList(): Promise<void> {
  const suggestion = aSuggestion({
    field: 'materials',
    proposedValue: ['bamboo', 'cane'],
    currentValue: ['bamboo'],
  });

  const built = buildDecision(
    suggestion,
    'EDITED',
    ' cane , bamboo ,, ',
  );

  expect(
    built.ok &&
      built.decision.decision === 'EDITED' &&
      Array.isArray(built.decision.value) &&
      JSON.stringify(built.decision.value) ===
        JSON.stringify(['cane', 'bamboo']),
    `a materials edit is split into entries (received: ${JSON.stringify(built)})`,
  );
}

/**
 * A blank edit is refused before anything is sent.
 *
 * An empty `materials` list is the case the guard is really for: the server
 * accepts one and writes it, so an artisan who cleared the list to retype it
 * would find the field cleared. The text fields are refused too, which costs
 * nothing and saves a request to learn something already known.
 */
async function testABlankEditIsRefusedWithoutARequest(): Promise<void> {
  const suggestion = aSuggestion({ field: 'description' });
  const sender = aSend(aResult());
  const state = setEditText(NO_EDITS, 'proposal-1', '   ');

  const { state: after, outcome } = await submitDecision(
    state,
    suggestion,
    'EDITED',
    sender.send,
  );

  expect(
    outcome.kind === 'refused',
    'a blank edit is refused',
  );
  expect(
    sender.sent.length === 0,
    'nothing is sent, so the server is never asked to blank a field',
  );
  expect(
    editTextFor(suggestion, after) === '   ',
    'what the artisan typed is left exactly as it is, so they can carry on',
  );
}

/**
 * A failed request must not cost the artisan their typing.
 *
 * This is the case the whole state shape exists for. The same function the
 * screen calls is called here, with a transport that refuses, and the value
 * is still in the state it returns — so a request failing and a value being
 * discarded are not two things this screen is able to do.
 */
async function testAFailedSubmissionPreservesTheTypedValue(): Promise<void> {
  const suggestion = aSuggestion({
    field: 'title',
    proposedValue: 'Bamboo Basket',
  });

  const typed = 'A cane basket my grandmother wove';
  const state = setEditText(NO_EDITS, 'proposal-1', typed);
  const attempts: ClientProposalDecisionInput[] = [];

  const { state: after, outcome } = await submitDecision(
    state,
    suggestion,
    'EDITED',
    async (decision) => {
      attempts.push(decision);

      throw new ReviewTransportError(
        'The request failed with HTTP 503.',
        'TRANSIENT_FAILURE',
        true,
      );
    },
  );

  expect(
    outcome.kind === 'refused',
    'a failed request is reported as a refusal, not as a decision',
  );
  expect(
    attempts.length === 1,
    'the request was actually attempted, so this is a failure and not a silent skip',
  );
  expect(
    editTextFor(suggestion, after) === typed,
    `the typed value survives a failed request (received: ${editTextFor(suggestion, after)})`,
  );
  expect(
    after === state,
    'the state is returned unchanged, so there is no path that drops the draft',
  );
}

/**
 * The server's own reason is what the artisan is shown.
 *
 * "Not ready" with no reason is the least useful thing a client can say about
 * a refusal it caused, so the reasons the server sent are shown instead of
 * the message that wrapped them.
 */
async function testARefusalIsShownAsTheServersReason(): Promise<void> {
  const suggestion = aSuggestion();

  const { outcome } = await submitDecision(
    NO_EDITS,
    suggestion,
    'ACCEPTED',
    async () => {
      throw new ReviewTransportError(
        'This product is not ready.',
        'CONFLICT',
        false,
        [
          {
            reason: 'PRODUCT_NOT_APPROVABLE',
            message: 'This product is not in a state that can be changed.',
          },
        ],
      );
    },
  );

  expect(
    outcome.kind === 'refused' &&
      outcome.message ===
        'This product is not in a state that can be changed.',
    `the server's reason is what is shown (received: ${outcome.message})`,
  );
}

/**
 * A decision that was carried out clears the editor.
 *
 * The suggestion is gone from the review surface at this point, so keeping its
 * draft would only be a stale value waiting to be applied to a proposal the
 * artisan has already answered.
 */
async function testASuccessfulSubmissionClearsTheTypedValue(): Promise<void> {
  const suggestion = aSuggestion({ field: 'title' });
  const state = setEditText(
    NO_EDITS,
    'proposal-1',
    'A cane basket my grandmother wove',
  );
  const sender = aSend(aResult({ applied: ['title'] }));

  const { state: after, outcome } = await submitDecision(
    state,
    suggestion,
    'EDITED',
    sender.send,
  );

  expect(
    outcome.kind === 'decided',
    'a carried-out decision is reported as decided',
  );
  expect(
    sender.sent.length === 1 &&
      sender.sent[0].decision === 'EDITED' &&
      sender.sent[0].value ===
        'A cane basket my grandmother wove',
    'exactly one request is sent, carrying the typed value',
  );
  expect(
    clearEdit(after, 'proposal-1') === after,
    'clearing a draft that is already gone changes nothing, so closing the editor afterwards is safe',
  );
  expect(
    !('proposal-1' in after.drafts),
    'a decided suggestion keeps no draft',
  );
}

/**
 * Clearing one editor does not disturb another.
 *
 * An artisan comparing two suggestions can have one open while they read the
 * other, so closing an editor has to be narrow.
 */
async function testEditingOneSuggestionLeavesTheOthersAlone(): Promise<void> {
  let state: ReviewEditState = setEditText(
    NO_EDITS,
    'proposal-1',
    'my own words',
  );

  state = setEditText(state, 'proposal-2', 'a second correction');
  state = clearEdit(state, 'proposal-1');

  expect(
    !('proposal-1' in state.drafts),
    'the closed editor is gone',
  );
  expect(
    state.drafts['proposal-2'] === 'a second correction',
    'the other editor is untouched',
  );
  expect(
    clearEdit(state, 'proposal-1') === state,
    'closing an editor that was never open changes nothing',
  );
}

/**
 * A stale suggestion is stated after it is applied.
 *
 * The warning cannot be shown afterwards by the review surface, because the
 * suggestion is gone; and it is the one thing the artisan cannot infer, since
 * the value they now see looks correct.
 */
async function testStaleInputIsStatedAfterADecision(): Promise<void> {
  const suggestion = aSuggestion({ field: 'title' });

  expect(
    decisionNotice(suggestion, 'ACCEPTED', aResult()) ===
      'Used the suggested title.',
    'a straightforward acceptance says what happened',
  );
  expect(
    decisionNotice(
      suggestion,
      'REJECTED',
      aResult({ applied: [] }),
    ) === 'Suggestion for title rejected. Nothing was changed.',
    'a rejection says that nothing changed',
  );
  expect(
    decisionNotice(
      suggestion,
      'EDITED',
      aResult({ staleFields: ['title'] }),
    ).includes('before your last edit'),
    'a decision applied over stale input says so',
  );
  expect(
    !decisionNotice(
      suggestion,
      'EDITED',
      aResult({ staleFields: ['category'] }),
    ).includes('before your last edit'),
    'staleness of another field is not reported as this one',
  );
}

/**
 * A failure without a usable message still produces something an artisan can
 * read, and the retryable flag is preserved so the screen can offer another
 * attempt when another attempt is what the problem calls for.
 */
async function testFailuresAreDescribedForTheScreen(): Promise<void> {
  expect(
    describeFailure(
      new ReviewTransportError('Server said no.', 'CONFLICT', false),
    ).message === 'Server said no.' &&
      describeFailure(
        new ReviewTransportError('Lost.', 'NETWORK_ERROR', true),
      ).retryable,
    'a classified failure keeps its message and its retryable flag',
  );
  expect(
    describeFailure(new Error('boom')).message === 'boom',
    'an unexpected error is still described',
  );
  expect(
    describeFailure('not an error').message ===
      'Something went wrong.',
    'a non-error value does not render as nothing',
  );
}

async function main(): Promise<void> {
  await testAnEditSendsWhatTheArtisanTyped();
  await testAcceptAndRejectCarryNoValue();
  await testTheEditorOpensOnTheArtisansOwnValue();
  await testAListValuedFieldOpensJoined();
  await testMaterialsAreSentAsAList();
  await testABlankEditIsRefusedWithoutARequest();
  await testAFailedSubmissionPreservesTheTypedValue();
  await testARefusalIsShownAsTheServersReason();
  await testASuccessfulSubmissionClearsTheTypedValue();
  await testEditingOneSuggestionLeavesTheOthersAlone();
  await testStaleInputIsStatedAfterADecision();
  await testFailuresAreDescribedForTheScreen();

  console.log('REVIEW DECISION TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
