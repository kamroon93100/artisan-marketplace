import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import {
  resolveDiscoveryTransport,
  type DiscoveryPublishedProductResponse,
  type DiscoveryTransport,
} from '@/network/discovery-transport';
import { InquiryComposer } from '@/features/inquiry/InquiryComposer';
import type { InquiryTransport } from '@/network/inquiry-transport';

import { describeDiscoveryFailure, formatPublishedAt } from './discovery-display';

type Props = {
  productId: string;
  onBack: () => void;
  /**
   * Injected so the screen can be exercised without a network. Defaults to
   * the one shared transport, resolved through `useMemo` rather than
   * constructed here: a client built during render is a different object on
   * every render, which makes the load callback and then the effect that
   * calls it fire again, forever.
   */
  transport?: DiscoveryTransport;
  /**
   * The buyer's write surface against this listing. Injected for the same
   * reason as `transport`, and absent when the screen is shown where asking a
   * question makes no sense — there is nothing to ask about a listing that
   * will not load, and the composer is rendered only once the listing has.
   */
  inquiryTransport?: InquiryTransport;
};

/**
 * What the listing view is waiting on.
 */
type Phase =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      product: DiscoveryPublishedProductResponse;
    }
  | { kind: 'failed'; message: string; retryable: boolean };

export function ProductDetailScreen({
  productId,
  onBack,
  transport,
  inquiryTransport,
}: Props) {
  const client = useMemo(
    () => resolveDiscoveryTransport(transport),
    [transport],
  );
  const safeAreaInsets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  /**
   * A slow earlier response settling after a newer request (a double-tap on
   * retry) must not overwrite the newer state — every async write checks its
   * request is still the latest.
   */
  const requestSeqRef = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    /**
     * Supersede any in-flight request first — including before the blank-id
     * answer below, so a prop change to a blank id mid-flight cannot be
     * overwritten by the response for the previous id.
     */
    const seq = ++requestSeqRef.current;

    /**
     * A route without an id answers locally rather than on the network. The
     * request it would send has no id to send, and the response that comes
     * back would be about the wrong resource while looking like a legitimate
     * "no such product".
     */
    if (productId.trim() === '') {
      setPhase({
        kind: 'failed',
        message: 'This listing is not available.',
        retryable: false,
      });
      return;
    }

    setPhase({ kind: 'loading' });

    try {
      const result = await client.getProduct(productId);
      if (seq !== requestSeqRef.current) {
        return;
      }
      setPhase({ kind: 'ready', product: result.product });
    } catch (error) {
      if (seq !== requestSeqRef.current) {
        return;
      }
      const failure = describeDiscoveryFailure(error);
      setPhase({ kind: 'failed', ...failure });
    }
  }, [client, productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const renderBody = (): ReactElement => {
    if (phase.kind === 'loading') {
      return (
        <View style={styles.stateBlock}>
          <ActivityIndicator />
          <ThemedText type="small" themeColor="textSecondary">
            Loading this listing…
          </ThemedText>
        </View>
      );
    }

    if (phase.kind === 'failed') {
      return (
        <View style={styles.stateBlock}>
          <ThemedText type="small" style={styles.stateMessage}>
            {phase.message}
          </ThemedText>
          {phase.retryable ? (
            <Pressable
              onPress={() => void load()}
              accessibilityRole="button"
              accessibilityLabel="Try loading this listing again"
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <ThemedText type="smallBold" style={styles.buttonLabel}>
                Try again
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      );
    }

    const { product } = phase;

    return (
      <ScrollView
        contentContainerStyle={[
          styles.listing,
          {
            paddingBottom:
              safeAreaInsets.bottom + BottomTabInset + Spacing.four,
          },
        ]}>
        <ThemedText type="subtitle">{product.title}</ThemedText>

        <ThemedText type="small" themeColor="textSecondary">
          {`Published ${formatPublishedAt(product.publishedAt)} · version ${product.versionNumber}`}
        </ThemedText>

        {product.category !== null && product.category !== '' ? (
          <ThemedText type="small">Category: {product.category}</ThemedText>
        ) : null}

        {product.materials.length > 0 ? (
          <ThemedText type="small">
            {`Materials: ${product.materials.join(', ')}`}
          </ThemedText>
        ) : null}

        <ThemedText type="default" style={styles.description}>
          {product.description}
        </ThemedText>

        {inquiryTransport ? (
          <InquiryComposer
            productId={product.productId}
            onSend={(request) => inquiryTransport.create(request)}
          />
        ) : null}
      </ScrollView>
    );
  };

  return (
    <ThemedView
      style={[
        styles.root,
        { paddingTop: safeAreaInsets.top + Spacing.two },
      ]}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to the discovery list"
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <ThemedText type="small">Back</ThemedText>
        </Pressable>
      </View>

      {renderBody()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
    paddingRight: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
  button: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    backgroundColor: '#3c87f7',
  },
  buttonLabel: {
    color: '#ffffff',
  },
  stateBlock: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
  },
  stateMessage: {
    textAlign: 'center',
  },
  listing: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  description: {
    marginTop: Spacing.two,
  },
});
