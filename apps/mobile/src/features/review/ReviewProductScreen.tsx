import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Colors, Spacing } from '@/constants/theme';
import {
  type ClientProductReview,
  type ClientReviewSuggestion,
  type ProposalDecision,
  type ReviewTransport,
} from '@/network/review-contract';
import { resolveReviewTransport } from '@/network/review-transport';
import {
  NO_EDITS,
  clearEdit,
  describeFailure,
  editSeed,
  editTextFor,
  fieldLabel,
  setEditText,
  submitDecision,
  type ReviewEditState,
} from './review-decision';

type Props = {
  remoteProductId: string;
  onBack: () => void;
  /**
   * Injected so the screen can be exercised without a network, and so a test
   * can supply refusals the real transport has to survive. Defaults to the
   * one shared transport, resolved through `useMemo` rather than constructed
   * here: a client built during render is a different object on every render,
   * which makes the load callback and then the effect that calls it fire
   * again, forever.
   */
  transport?: ReviewTransport;
};

/**
 * What the screen is waiting on.
 *
 * A decision carries the proposal it is for, so the control that was pressed
 * can show progress and the others can stay disabled without a second piece
 * of state that could disagree with this one.
 */
type Working =
  | 'none'
  | 'approve'
  | 'publish'
  | { decide: string };

type Phase =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      review: ClientProductReview;
      notice: string | null;
      working: Working;
    }
  | { kind: 'failed'; message: string; retryable: boolean };

function describeValue(
  value: string | readonly string[] | null,
): string {
  if (value === null) {
    return 'not set yet';
  }

  if (typeof value !== 'string') {
    return value.join(', ');
  }

  return value.trim() === '' ? 'not set yet' : value;
}

/**
 * Why a suggestion is being shown the way it is.
 *
 * Staleness is stated plainly rather than as a warning badge, because a stale
 * suggestion is not a problem to fix — it is the reason the artisan should
 * read the current value before taking the suggestion. A risk level is shown
 * only when it is above LOW, since a low-risk note on every suggestion would
 * be noise that trains the reader to skip it.
 */
function suggestionNote(
  suggestion: ClientReviewSuggestion,
): string | null {
  if (suggestion.stale) {
    return 'Made before your last edit. Read the current value before accepting.';
  }

  if (suggestion.riskLevel === 'MEDIUM' || suggestion.riskLevel === 'HIGH') {
    const reasons = suggestion.riskReasons.join(', ');

    return reasons
      ? `Needs care: ${reasons}.`
      : 'Needs care before publishing.';
  }

  return null;
}

export function ReviewProductScreen({
  remoteProductId,
  onBack,
  transport,
}: Props) {
  const [phase, setPhase] = useState<Phase>({
    kind: 'loading',
  });
  const [edits, setEdits] =
    useState<ReviewEditState>(NO_EDITS);

  /**
   * The one client for this screen, kept for as long as the injected
   * transport is the same one.
   *
   * This is the whole of the fetch loop fix. `load` below is a callback over
   * `client` and the effect that calls it is a callback over `load`, so
   * anything that changes their identity on every render re-runs the request
   * that caused the re-render. The default is a module-level instance, so the
   * default path produces one object for the life of the app.
   */
  const client = useMemo(
    () => resolveReviewTransport(transport),
    [transport],
  );

  const load = useCallback(async (): Promise<void> => {
    setPhase({ kind: 'loading' });

    try {
      const review = await client.getReview(remoteProductId);

      setPhase({
        kind: 'ready',
        review,
        notice: null,
        working: 'none',
      });
    } catch (error) {
      setPhase(failedFrom(error));
    }
  }, [client, remoteProductId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * The artisan's typed value is the screen's own state and is never cleared
   * by a request failing. A refusal is a fact about the server, not a reason
   * to discard something a person typed.
   */
  async function run(
    working: 'approve' | 'publish',
    action: () => Promise<string | null>,
  ): Promise<void> {
    setPhase((current) =>
      current.kind === 'ready'
        ? { ...current, working, notice: null }
        : current,
    );

    try {
      const notice = await action();

      await load();

      setPhase((current) =>
        current.kind === 'ready'
          ? { ...current, notice }
          : current,
      );
    } catch (error) {
      const failed = failedFrom(error);

      setPhase((current) =>
        current.kind === 'ready'
          ? {
              ...current,
              working: 'none',
              notice: failed.message,
            }
          : failed,
      );
    }
  }

  /**
   * Records one decision about one suggestion.
   *
   * Approval and publication are not reachable from here: this only reaches
   * the decision route, so accepting every suggestion still leaves the product
   * unapproved until the artisan says so. That is the two-act rule in
   * `docs/architecture/ai-contract.md`, and a screen that collapsed them
   * would make the rule unenforceable from the client side.
   *
   * The typed value is only discarded when the decision was carried out.
   * `submitDecision` returns the state to keep along with the message, so a
   * refusal cannot reach the store at all.
   */
  async function decide(
    suggestion: ClientReviewSuggestion,
    decision: ProposalDecision,
  ): Promise<void> {
    setPhase((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            working: { decide: suggestion.proposalId },
            notice: null,
          }
        : current,
    );

    try {
      const { state, outcome } = await submitDecision(
        edits,
        suggestion,
        decision,
        (input) =>
          client.decideProposal(suggestion.jobId, input),
      );

      /**
       * The state to keep is the one the decision produced: unchanged after a
       * refusal, with the draft dropped after a decision that was carried
       * out. The screen has no opinion of its own to add here, which is what
       * makes a failed request costing the artisan their typing impossible to
       * write in the first place.
       */
      setEdits(state);

      /**
       * The review surface is re-read either way, and after a refusal that is
       * not tidiness. The server records a decision before it writes the
       * value, so a response lost in transit leaves the value on the product
       * and nothing to show for it. Re-reading is the only way to tell that
       * apart from a decision that truly did not land: if the suggestion is
       * gone it did, and if it is still listed the artisan's text is still in
       * the editor. Drafts survive this, because `load` does not touch them.
       */
      await load();

      setPhase((current) =>
        current.kind === 'ready'
          ? { ...current, notice: outcome.message }
          : current,
      );
    } catch (error) {
      /**
       * `submitDecision` does not throw, so this is a net for a fault in this
       * screen rather than a path an expected failure takes. Without it an
       * unexpected throw would leave every control disabled with nothing on
       * screen to say so.
       */
      const failed = failedFrom(error);

      setPhase((current) =>
        current.kind === 'ready'
          ? {
              ...current,
              working: 'none',
              notice: failed.message,
            }
          : failed,
      );
    }
  }

  if (phase.kind === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.muted}>
          Loading your product
        </Text>
      </View>
    );
  }

  if (phase.kind === 'failed') {
    return (
      <View style={styles.centered}>
        <Text style={styles.heading}>
          Could not load this product
        </Text>
        <Text style={styles.muted}>{phase.message}</Text>
        {phase.retryable ? (
          <Pressable
            onPress={() => void load()}
            style={styles.primary}
            accessibilityRole="button">
            <Text style={styles.primaryText}>Try again</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onBack}
          style={styles.secondary}
          accessibilityRole="button">
          <Text style={styles.secondaryText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const { review, notice, working } = phase;
  const published = review.product.state === 'PUBLISHED';
  const approved = review.product.state === 'APPROVED';

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button">
          <Text style={styles.back}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Review your product</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {review.product.title?.trim() ||
            'This product has no title yet'}
        </Text>
        <Text style={styles.muted}>
          {review.product.description?.trim() ||
            'This product has no description yet'}
        </Text>
        <Text style={styles.status}>
          {stateLabel(review.product.state)}
        </Text>
      </View>

      {notice ? (
        <View
          style={styles.notice}
          accessibilityLiveRegion="polite">
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      {review.suggestions.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Suggestions to check
          </Text>
          <Text style={styles.muted}>
            Nothing here is used until you accept, change, or
            reject it. Deciding is not the same as approving.
          </Text>

          {review.suggestions.map((suggestion) => {
            const note = suggestionNote(suggestion);
            const field = fieldLabel(suggestion.field);
            const editing =
              edits.drafts[suggestion.proposalId] !==
              undefined;
            const deciding =
              typeof working === 'object' &&
              working.decide === suggestion.proposalId;
            const busy = working !== 'none';

            /**
             * A screen reader announces one button at a time, and every
             * suggestion here has an Accept, a Change it and a Reject. Left
             * as bare verbs they are announced as "Accept, button" three
             * times over, and which field a decision applies to — the one
             * thing that distinguishes them — is lost. Naming the field in
             * each label is what makes the three distinguishable off screen,
             * which is also where the cost of a wrong tap is highest.
             */
            const forField = (action: string) =>
              `${action} the ${field.toLowerCase()} suggestion`;

            return (
              <View
                key={suggestion.proposalId}
                style={styles.suggestion}>
                <Text style={styles.suggestionField}>
                  {field}
                </Text>
                {/*
                  * Which value is which, because the controls below act on
                  * them: "Accept" applies the suggestion, and a suggestion the
                  * artisan cannot tell apart from their own current value is a
                  * decision they have not actually made.
                  */}
                <Text style={styles.suggestionCaption}>
                  Now
                </Text>
                <Text style={styles.suggestionLabel}>
                  {describeValue(suggestion.currentValue)}
                </Text>
                <Text style={styles.suggestionCaption}>
                  Suggested
                </Text>
                <Text style={styles.suggestionValue}>
                  {describeValue(suggestion.proposedValue)}
                </Text>
                {note ? (
                  <Text style={styles.suggestionNote}>
                    {note}
                  </Text>
                ) : null}

                {editing ? (
                  <View style={styles.editor}>
                    <Text style={styles.editorLabel}>
                      Your version of the{' '}
                      {field.toLowerCase()}
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={editTextFor(
                        suggestion,
                        edits,
                      )}
                      onChangeText={(text) =>
                        setEdits((current) =>
                          setEditText(
                            current,
                            suggestion.proposalId,
                            text,
                          ),
                        )
                      }
                      multiline={
                        suggestion.field === 'description'
                      }
                      editable={!busy}
                      accessibilityLabel={`Your version of the ${field.toLowerCase()}`}
                    />
                    <View style={styles.controls}>
                      <Pressable
                        onPress={() =>
                          void decide(suggestion, 'EDITED')
                        }
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityLabel={forField(
                          'Save your version of',
                        )}
                        style={[
                          styles.control,
                          busy ? styles.disabled : null,
                        ]}>
                        <Text
                          style={styles.controlText}>
                          Save mine
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          setEdits((current) =>
                            clearEdit(
                              current,
                              suggestion.proposalId,
                            ),
                          )
                        }
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityLabel={`Close the editor for the ${field.toLowerCase()} suggestion`}
                        style={[
                          styles.control,
                          busy ? styles.disabled : null,
                        ]}>
                        <Text
                          style={styles.controlText}>
                          Cancel
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                {deciding ? (
                  <View style={styles.controls}>
                    <ActivityIndicator size="small" />
                    <Text style={styles.muted}>
                      Saving your decision
                    </Text>
                  </View>
                ) : (
                  <View style={styles.controls}>
                    <Pressable
                      onPress={() =>
                        void decide(suggestion, 'ACCEPTED')
                      }
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={forField(
                        'Accept',
                      )}
                      style={[
                        styles.control,
                        busy ? styles.disabled : null,
                      ]}>
                      <Text style={styles.controlText}>
                        Accept
                      </Text>
                    </Pressable>
                    {!editing ? (
                      <Pressable
                        onPress={() =>
                          setEdits((current) =>
                            setEditText(
                              current,
                              suggestion.proposalId,
                              editSeed(suggestion),
                            ),
                          )
                        }
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit the ${field.toLowerCase()} suggestion`}
                        style={[
                          styles.control,
                          busy ? styles.disabled : null,
                        ]}>
                        <Text style={styles.controlText}>
                          Change it
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() =>
                        void decide(suggestion, 'REJECTED')
                      }
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={forField(
                        'Reject',
                      )}
                      style={[
                        styles.control,
                        busy ? styles.disabled : null,
                      ]}>
                      <Text style={styles.controlText}>
                        Reject
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      ) : null}

      {review.blocking.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Before this can be published
          </Text>
          {review.blocking.map((entry, index) => (
            <Text
              key={`${entry.reason}-${entry.field ?? index}`}
              style={styles.blocking}>
              {entry.message}
            </Text>
          ))}
        </View>
      ) : null}

      {/*
        * Approval is only offered when the server said the product is ready.
        * Deriving that from the blocking list as well means a response whose
        * flag was missing or false cannot enable a button the next call
        * would refuse.
        */}
      {!published && !approved ? (
        <Pressable
          onPress={() =>
            void run('approve', async () => {
              const result = await client.approve(
                remoteProductId,
              );

              return result.deduplicated
                ? 'This product was already approved.'
                : 'Approved. You can publish it now.';
            })
          }
          disabled={working !== 'none'}
          accessibilityRole="button"
          style={[
            styles.primary,
            !review.readyForApproval ||
              review.blocking.length > 0
              ? styles.disabled
              : null,
          ]}>
          {working === 'approve' ? (
            <ActivityIndicator
              color={Colors.light.background}
            />
          ) : (
            <Text style={styles.primaryText}>
              {review.readyForApproval &&
              review.blocking.length === 0
                ? 'Approve this product'
                : 'Not ready to approve'}
            </Text>
          )}
        </Pressable>
      ) : null}

      {!published ? (
        <Pressable
          onPress={() =>
            void run('publish', async () => {
              const result = await client.publish(
                remoteProductId,
                `publish:${remoteProductId}:${
                  review.product.publishedVersion ?? 0
                }`,
              );

              return `Published as version ${result.versionNumber}.`;
            })
          }
          disabled={working !== 'none' || !approved}
          accessibilityRole="button"
          style={[
            styles.primary,
            approved ? null : styles.disabled,
          ]}>
          {working === 'publish' ? (
            <ActivityIndicator
              color={Colors.light.background}
            />
          ) : (
            <Text style={styles.primaryText}>
              {approved
                ? 'Publish this product'
                : 'Approve this product first'}
            </Text>
          )}
        </Pressable>
      ) : null}

      {published ? (
        <View
          style={styles.published}
          accessibilityLiveRegion="polite">
          <Text style={styles.publishedTitle}>
            Published
          </Text>
          <Text style={styles.muted}>
            Buyers can see version{' '}
            {review.product.publishedVersion ?? 1}. Changes
            create a new version and never rewrite this one.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function stateLabel(state: string): string {
  return state
    .split('_')
    .map((part) =>
      part.charAt(0) + part.slice(1).toLowerCase(),
    )
    .join(' ');
}

function failedFrom(error: unknown): {
  kind: 'failed';
  message: string;
  retryable: boolean;
} {
  return {
    kind: 'failed',
    ...describeFailure(error),
  };
}

const styles = StyleSheet.create({
  back: {
    color: Colors.light.text,
    fontSize: 15,
    fontWeight: '600',
  },
  blocking: {
    color: Colors.light.text,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: Colors.light.backgroundElement,
    borderRadius: Spacing.three,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  cardTitle: {
    color: Colors.light.text,
    fontSize: 18,
    fontWeight: '700',
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    gap: Spacing.three,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  content: {
    gap: Spacing.four,
    padding: Spacing.four,
    paddingBottom: Spacing.six,
  },
  control: {
    alignItems: 'center',
    borderColor: Colors.light.backgroundSelected,
    borderRadius: Spacing.two,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: Spacing.three,
  },
  controlText: {
    color: Colors.light.text,
    fontSize: 14,
    fontWeight: '600',
  },
  controls: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  disabled: {
    opacity: 0.5,
  },
  editor: {
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  editorLabel: {
    color: Colors.light.textSecondary,
    fontSize: 13,
  },
  header: {
    gap: Spacing.two,
  },
  heading: {
    color: Colors.light.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  input: {
    borderColor: Colors.light.backgroundSelected,
    borderRadius: Spacing.two,
    borderWidth: 1,
    color: Colors.light.text,
    fontSize: 15,
    minHeight: 44,
    padding: Spacing.two,
  },
  muted: {
    color: Colors.light.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  notice: {
    backgroundColor: Colors.light.backgroundSelected,
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  noticeText: {
    color: Colors.light.text,
    fontSize: 14,
    lineHeight: 20,
  },
  primary: {
    alignItems: 'center',
    backgroundColor: Colors.light.text,
    borderRadius: Spacing.two,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  primaryText: {
    color: Colors.light.background,
    fontSize: 16,
    fontWeight: '700',
  },
  published: {
    backgroundColor: Colors.light.backgroundElement,
    borderRadius: Spacing.three,
    gap: Spacing.one,
    padding: Spacing.three,
  },
  publishedTitle: {
    color: Colors.light.text,
    fontSize: 16,
    fontWeight: '700',
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    color: Colors.light.text,
    fontSize: 16,
    fontWeight: '700',
  },
  secondary: {
    alignItems: 'center',
    borderColor: Colors.light.backgroundSelected,
    borderRadius: Spacing.two,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: Spacing.four,
  },
  secondaryText: {
    color: Colors.light.text,
    fontSize: 15,
    fontWeight: '600',
  },
  status: {
    color: Colors.light.textSecondary,
    fontSize: 13,
  },
  suggestion: {
    backgroundColor: Colors.light.backgroundElement,
    borderRadius: Spacing.two,
    gap: Spacing.one,
    padding: Spacing.three,
  },
  suggestionCaption: {
    color: Colors.light.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  suggestionField: {
    color: Colors.light.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  suggestionLabel: {
    color: Colors.light.textSecondary,
    fontSize: 13,
  },
  suggestionNote: {
    color: Colors.light.text,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  suggestionValue: {
    color: Colors.light.text,
    fontSize: 15,
    lineHeight: 21,
  },
  title: {
    color: Colors.light.text,
    fontSize: 28,
    fontWeight: '800',
  },
});
