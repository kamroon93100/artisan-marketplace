/**
 * The review screen's decision path, with no React and no React Native in it.
 *
 * Everything here is a plain function over plain values, which is what lets
 * the screen and a test drive the same code. Two things need that:
 *
 *   - the value an artisan typed has to survive a failed request, and the only
 *     honest way to prove that is to run the same function the screen runs
 *     and look at what came back;
 *   - the rule that an edit sends the artisan's own value rather than the
 *     model's proposal, and that a list-valued field is sent as a list, is a
 *     rule about the request rather than about a rendering, so it belongs
 *     where it can be read and tested on its own.
 *
 * There is no decision here that the server has not already authorised. The
 * server validates, compares and writes; this module only decides what to
 * ask for and what to keep if the answer is no.
 */

import { ReviewTransportError } from '../../network/review-contract';
import type {
  ClientProposalDecisionInput,
  ClientProposalDecisionResult,
  ClientReviewSuggestion,
  ProposalDecision,
} from '../../network/review-contract';

/**
 * What the artisan has typed, keyed by proposal id.
 *
 * A key is present only while the artisan is editing that suggestion, which
 * is why the map doubles as the screen's "which editor is open" state and no
 * separate selection has to be kept in step with it.
 */
export type ReviewEditState = {
  readonly drafts: Readonly<Record<string, string>>;
};

export const NO_EDITS: ReviewEditState = { drafts: {} };

/**
 * A field's name as the artisan reads it.
 *
 * The server sends a column name; the server is not the audience.
 */
export function fieldLabel(field: string): string {
  return field.charAt(0).toUpperCase() + field.slice(1);
}

/**
 * The text the editor opens with.
 *
 * The artisan's own current value, never the proposal.
 *
 * Seeding the editor with what the model suggested would make "Save mine"
 * record the model's text under the artisan's name: the server stores
 * `decision = EDITED` with the value that was sent, so an editor opened and
 * saved unchanged would attribute a model's words to a person. Starting from
 * what the artisan had keeps an edit an edit, and leaves "Accept" as the one
 * action that takes the model's value — which is what it is for.
 *
 * A list-valued field is shown joined, because that is how the suggestion is
 * displayed above the editor, and an editor that opened on something other
 * than what the artisan is reading looks like a different value.
 */
export function editSeed(
  suggestion: ClientReviewSuggestion,
): string {
  if (suggestion.currentValue === null) {
    return '';
  }

  return typeof suggestion.currentValue === 'string'
    ? suggestion.currentValue
    : suggestion.currentValue.join(', ');
}

/**
 * The text in the editor for a suggestion: what the artisan typed, or the
 * proposal when they have not typed anything.
 */
export function editTextFor(
  suggestion: ClientReviewSuggestion,
  state: ReviewEditState,
): string {
  return state.drafts[suggestion.proposalId] ?? editSeed(suggestion);
}

/**
 * Opens or updates the editor for one suggestion.
 *
 * A new state object is returned rather than the input mutated, so React sees
 * a changed reference and the screen re-renders. The previous drafts are
 * carried, because opening one editor must not discard another.
 */
export function setEditText(
  state: ReviewEditState,
  proposalId: string,
  text: string,
): ReviewEditState {
  return {
    drafts: { ...state.drafts, [proposalId]: text },
  };
}

/**
 * Closes the editor for one suggestion.
 */
export function clearEdit(
  state: ReviewEditState,
  proposalId: string,
): ReviewEditState {
  if (!(proposalId in state.drafts)) {
    return state;
  }

  const drafts = { ...state.drafts };

  delete drafts[proposalId];

  return { drafts };
}

export type BuiltDecision =
  | { ok: true; decision: ClientProposalDecisionInput }
  | { ok: false; message: string };

/**
 * Turns a choice into a request, or into the reason it cannot be sent.
 *
 * The three decisions differ in more than their name. `ACCEPTED` and
 * `REJECTED` carry no value at all, because the server refuses one beside
 * them: accepting is taking the model's value, and rejecting is taking none.
 * `EDITED` carries the artisan's own text, which is the only value that is
 * allowed to overwrite a confirmed one.
 *
 * `materials` is sent as a list because the server normalizes that field as
 * one. A string would be normalized character by character, turning "cane"
 * into four one-letter materials, so the split happens here where the artisan
 * can be shown what was meant.
 *
 * A blank edit is refused rather than sent. The two shapes are refused for
 * different reasons, and both refusals are the client's to make. The server
 * rejects a blank title, description, or category, so sending one would spend
 * a request to learn what is already known here. An empty `materials` list is
 * a different matter: the server accepts one and writes it, which would clear
 * the field the artisan was trying to correct. Either way, nothing is sent
 * that nobody meant.
 */
export function buildDecision(
  suggestion: ClientReviewSuggestion,
  decision: ProposalDecision,
  text: string,
): BuiltDecision {
  const proposalId = suggestion.proposalId;

  if (decision !== 'EDITED') {
    return {
      ok: true,
      decision: decision === 'ACCEPTED'
        ? { proposalId, decision: 'ACCEPTED' }
        : { proposalId, decision: 'REJECTED' },
    };
  }

  if (suggestion.field === 'materials') {
    const materials = text
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '');

    if (materials.length === 0) {
      return {
        ok: false,
        message:
          'Type at least one material, separated by commas.',
      };
    }

    return {
      ok: true,
      decision: {
        proposalId,
        decision: 'EDITED',
        value: materials,
      },
    };
  }

  if (text.trim() === '') {
    return {
      ok: false,
      message: `Type the ${fieldLabel(
        suggestion.field,
      ).toLowerCase()} you want, or accept or reject the suggestion instead.`,
    };
  }

  return {
    ok: true,
    decision: {
      proposalId,
      decision: 'EDITED',
      value: text,
    },
  };
}

/**
 * What happened to one decision.
 *
 * `decided` means the server accepted the decision. `refused` covers both a
 * request the server rejected and an edit that was never sendable, because
 * from the artisan's side they are the same event: they asked for something
 * and did not get it.
 */
export type ReviewDecisionOutcome =
  | { kind: 'decided'; proposalId: string; message: string }
  | { kind: 'refused'; proposalId: string; message: string };

/**
 * What the artisan is told after a decision was carried out.
 *
 * Staleness is stated here because it is the one thing the artisan cannot
 * see afterwards: the suggestion has been applied, and the value it was
 * generated from is no longer the value on the product.
 */
export function decisionNotice(
  suggestion: ClientReviewSuggestion,
  decision: ProposalDecision,
  result: ClientProposalDecisionResult,
): string {
  const label = fieldLabel(suggestion.field);

  const base =
    decision === 'REJECTED'
      ? `Suggestion for ${label.toLowerCase()} rejected. Nothing was changed.`
      : decision === 'ACCEPTED'
        ? `Used the suggested ${label.toLowerCase()}.`
        : `Saved your version of the ${label.toLowerCase()}.`;

  return result.staleFields.includes(suggestion.field)
    ? `${base} It was made before your last edit, so check the result.`
    : base;
}

/**
 * A failure, as the screen shows it.
 *
 * A refusal that carries blocking reasons is shown as those reasons rather
 * than as its own message, because "not ready" with no reason is the least
 * useful thing a client can say about a refusal it caused.
 */
export function describeFailure(error: unknown): {
  message: string;
  retryable: boolean;
} {
  if (error instanceof ReviewTransportError) {
    return {
      message:
        error.blocking.length > 0
          ? error.blocking
              .map((entry) => entry.message)
              .join(' ')
          : error.message,
      retryable: error.retryable,
    };
  }

  return {
    message:
      error instanceof Error
        ? error.message
        : 'Something went wrong.',
    retryable: true,
  };
}

/**
 * Sends one decision and reports what the screen should keep.
 *
 * Nothing here throws. The caller receives the state to store and the message
 * to show, which is what makes the difference between "the request failed"
 * and "the artisan's text is gone" impossible to express in the first place:
 * there is only one return path, and the state it returns on a refusal is the
 * state it was given.
 */
export async function submitDecision(
  state: ReviewEditState,
  suggestion: ClientReviewSuggestion,
  decision: ProposalDecision,
  send: (
    decision: ClientProposalDecisionInput,
  ) => Promise<ClientProposalDecisionResult>,
): Promise<{
  state: ReviewEditState;
  outcome: ReviewDecisionOutcome;
}> {
  const built = buildDecision(
    suggestion,
    decision,
    editTextFor(suggestion, state),
  );

  if (!built.ok) {
    return {
      state,
      outcome: {
        kind: 'refused',
        proposalId: suggestion.proposalId,
        message: built.message,
      },
    };
  }

  try {
    const result = await send(built.decision);

    return {
      state: clearEdit(state, suggestion.proposalId),
      outcome: {
        kind: 'decided',
        proposalId: suggestion.proposalId,
        message: decisionNotice(
          suggestion,
          decision,
          result,
        ),
      },
    };
  } catch (error) {
    return {
      state,
      outcome: {
        kind: 'refused',
        proposalId: suggestion.proposalId,
        message: describeFailure(error).message,
      },
    };
  }
}
