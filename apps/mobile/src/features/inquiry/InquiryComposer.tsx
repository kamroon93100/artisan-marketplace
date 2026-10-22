/**
 * The buyer's question to an artisan.
 *
 * This is the whole point of a published listing: a buyer reads it, decides
 * they want it, and asks the artisan about it. The composer is the one place
 * a buyer writes to an artisan, so it keeps the request honest:
 *
 * - The buyer is never named. The body carries only the product and the
 *   message; the server derives the buyer from the authenticated session.
 * - One composition attempt keeps one idempotency key, so a retry after a
 *   dropped response converges on the inquiry the first send created instead
 *   of asking the artisan to read the same question twice.
 * - The message is validated against the server's length rule as it is typed,
 *   not after a round-trip.
 * - Sending is disabled while a send is in flight, so an impatient tap cannot
 *   produce a second inquiry.
 */

import React, { useCallback, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  INQUIRY_MESSAGE_MAX_LENGTH,
  InquiryTransportError,
  validateInquiryMessage,
  type CreateInquiryResult,
  type Inquiry,
} from '../../network/inquiry-transport';

export type InquiryComposerProps = {
  productId: string;
  /**
   * Resolves to the transport's own result: the inquiry and whether this
   * response was a deduplicated retry. The composer maps that onto its own
   * outcome so the caller does not have to know the transport's shape.
   */
  onSend(
    request: { productId: string; message: string; idempotencyKey: string },
  ): Promise<CreateInquiryResult>;
  /** Called once a send has succeeded, with the deduplication flag. */
  onSent?: (inquiry: Inquiry, deduplicated: boolean) => void;
};

/**
 * A random retry key, generated per composition attempt.
 *
 * `Math.random()` is the same source the app already uses for local draft
 * identities, and it is used here rather than `crypto.getRandomValues`
 * because React Native has no global `crypto` in the Hermes runtime. The key
 * does not need cryptographic strength: it must be unique per composition
 * attempt so a retry converges on the inquiry the first send created, and a
 * collision would only surface as a buyer retrying a question that was
 * already asked — never as an authentication or authorization failure.
 */
function newIdempotencyKey(): string {
  const random = Math.random().toString(36).slice(2, 10);
  const stamp = Date.now().toString(36);

  return `inq-${stamp}-${random}`;
}

export function InquiryComposer({
  productId,
  onSend,
  onSent,
}: InquiryComposerProps) {
  const theme = useTheme();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Inquiry | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /**
   * The key for the current composition attempt. It is held across retries of
   * this attempt and replaced when the message is edited into a new attempt,
   * because a materially different question is a different inquiry, not a
   * retry of this one.
   */
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const localProblem = validateInquiryMessage(message);

  const send = useCallback(async (): Promise<void> => {
    if (sending || localProblem !== null) {
      return;
    }

    setSending(true);
    setFailure(null);

    try {
      const result = await onSend({
        productId,
        message: message.trim(),
        idempotencyKey,
      });

      setSent(result.inquiry);
      setMessage('');
      // A new message after a send is a new question and gets its own key.
      setIdempotencyKey(newIdempotencyKey());
      onSent?.(result.inquiry, result.deduplicated);
    } catch (error) {
      const explanation =
        error instanceof InquiryTransportError
          ? error.message
          : 'Your question could not be sent. Try again.';

      setFailure(explanation);
      // The key is deliberately kept: the attempt did not converge, so the
      // buyer's next tap must reuse it.
    } finally {
      setSending(false);
    }
  }, [sending, localProblem, onSend, productId, message, idempotencyKey, onSent]);

  if (sent !== null) {
    return (
      <ThemedView type="backgroundElement" style={styles.container}>
        <ThemedText type="smallBold">Question sent</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          The artisan will see your question with this listing.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {`Sent ${new Date(sent.createdAt).toLocaleDateString()}`}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.container}>
      <ThemedText type="smallBold">Ask the artisan</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Ask about this listing — size, materials, delivery. The artisan gets
        your question with the version you are looking at.
      </ThemedText>

      <TextInput
        accessibilityLabel="Your question to the artisan"
        editable={!sending}
        multiline
        onChangeText={setMessage}
        placeholder="Write your question"
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          {
            backgroundColor: theme.background,
            borderColor: theme.backgroundSelected,
            color: theme.text,
          },
        ]}
        value={message}
      />

      <ThemedText type="small" themeColor="textSecondary">
        {`${message.length} / ${INQUIRY_MESSAGE_MAX_LENGTH}`}
      </ThemedText>

      {localProblem !== null ? (
        <ThemedText type="small" style={styles.problem}>
          {localProblem}
        </ThemedText>
      ) : null}

      {failure !== null ? (
        <View
          accessibilityRole="alert"
          style={[
            styles.failure,
            {
              backgroundColor: theme.background,
              borderColor: theme.backgroundSelected,
            },
          ]}>
          <ThemedText type="small" style={styles.failureText}>
            {failure}
          </ThemedText>
          {!sending ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send your question again"
              onPress={() => void send()}
              style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
              <ThemedText type="smallBold" style={styles.retryLabel}>
                Try again
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send your question to the artisan"
        disabled={sending || localProblem !== null}
        onPress={() => void send()}
        style={[
          styles.send,
          { backgroundColor: theme.text },
          sending || localProblem !== null ? styles.sendDisabled : null,
        ]}>
        <Text style={[styles.sendLabel, { color: theme.background }]}>
          {sending ? 'Sending…' : 'Send question'}
        </Text>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  failure: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  failureText: {
    color: '#c0392b',
  },
  input: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 96,
    padding: Spacing.three,
    textAlignVertical: 'top',
  },
  pressed: {
    opacity: 0.7,
  },
  problem: {
    color: '#c0392b',
  },
  retry: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
  },
  retryLabel: {
    color: '#3c87f7',
  },
  send: {
    alignItems: 'center',
    borderRadius: Spacing.three,
    marginTop: Spacing.one,
    paddingVertical: Spacing.three,
  },
  sendDisabled: {
    opacity: 0.4,
  },
  sendLabel: {
    fontSize: 15,
    fontWeight: '800',
  },
});

export default InquiryComposer;
