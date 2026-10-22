/**
 * The buyer's own inquiries, newest first.
 *
 * This is a read of the list the server owns: the buyer identity comes from
 * the authenticated session, so the client asks for no buyer and shows only
 * what came back. It exists because a question sent from a listing has to be
 * findable later — the buyer asked about a version of a listing, and the
 * list is where they check that the artisan has something to answer.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  INQUIRY_PAGE_SIZE_DEFAULT,
  InquiryTransportError,
  type Inquiry,
  type InquiryTransport,
} from '../../network/inquiry-transport';
import { resolveInquiryTransport } from './inquiry-transport-shared';

export type InquiryHistoryProps = {
  onBack: () => void;
  transport?: InquiryTransport;
};

type Phase =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      inquiries: readonly Inquiry[];
      total: number;
      hasMore: boolean;
    }
  | { kind: 'failed'; message: string; retryable: boolean };

function describeFailure(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof InquiryTransportError) {
    return { message: error.message, retryable: error.retryable };
  }

  return {
    message:
      error instanceof Error
        ? error.message
        : 'Your questions could not be loaded.',
    retryable: true,
  };
}

export function InquiryHistory({ onBack, transport }: InquiryHistoryProps) {
  const theme = useTheme();
  const safeAreaInsets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  // The shared transport is resolved once, outside render: a client built
  // during render would be a new object on every render, which re-fires the
  // load effect forever.
  const client = useMemo<InquiryTransport>(
    () => resolveInquiryTransport(transport),
    [transport],
  );

  const load = useCallback(async (): Promise<void> => {
    const seq = ++requestSeqRef.current;
    setPhase({ kind: 'loading' });
    setMoreError(null);
    setLoadingMore(false);

    try {
      const page = await client.listOwn({ limit: INQUIRY_PAGE_SIZE_DEFAULT });

      if (seq !== requestSeqRef.current) {
        return;
      }

      setPhase({
        kind: 'ready',
        inquiries: page.inquiries,
        total: page.total,
        hasMore: page.hasMore,
      });
    } catch (error) {
      if (seq !== requestSeqRef.current) {
        return;
      }

      setPhase({ kind: 'failed', ...describeFailure(error) });
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (phase.kind !== 'ready' || loadingMore) {
      return;
    }

    const seq = ++requestSeqRef.current;
    setLoadingMore(true);
    setMoreError(null);

    try {
      const page = await client.listOwn({
        limit: INQUIRY_PAGE_SIZE_DEFAULT,
        offset: phase.inquiries.length,
      });

      if (seq !== requestSeqRef.current) {
        return;
      }

      // Offset pages come from separate snapshots, so an inquiry can arrive
      // twice; a repeated id would break the list's key.
      const seen = new Set(phase.inquiries.map((inquiry) => inquiry.id));

      setPhase({
        kind: 'ready',
        inquiries: [
          ...phase.inquiries,
          ...page.inquiries.filter((inquiry) => !seen.has(inquiry.id)),
        ],
        total: page.total,
        hasMore: page.hasMore && page.inquiries.length > 0,
      });
    } catch (error) {
      if (seq !== requestSeqRef.current) {
        return;
      }

      setMoreError(describeFailure(error).message);
    } finally {
      if (seq === requestSeqRef.current) {
        setLoadingMore(false);
      }
    }
  }, [client, phase, loadingMore]);

  const renderEmpty = (): ReactElement => {
    if (phase.kind === 'loading') {
      return (
        <View style={styles.stateBlock} accessibilityRole="progressbar">
          <ActivityIndicator />
          <ThemedText type="small" themeColor="textSecondary">
            Loading your questions…
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
              accessibilityLabel="Try loading your questions again"
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <ThemedText type="smallBold" style={styles.buttonLabel}>
                Try again
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      );
    }

    return (
      <View style={styles.stateBlock}>
        <ThemedText type="small" themeColor="textSecondary">
          You have not asked an artisan anything yet.
        </ThemedText>
      </View>
    );
  };

  const renderFooter = (): ReactElement | null => {
    if (phase.kind !== 'ready') {
      return null;
    }

    if (loadingMore) {
      return (
        <View style={styles.footerBlock}>
          <ActivityIndicator size="small" />
          <ThemedText type="small" themeColor="textSecondary">
            Loading more…
          </ThemedText>
        </View>
      );
    }

    if (moreError !== null) {
      return (
        <View style={styles.footerBlock}>
          <ThemedText type="small" style={styles.stateMessage}>
            {moreError}
          </ThemedText>
          <Pressable
            onPress={() => void loadMore()}
            accessibilityRole="button"
            accessibilityLabel="Try loading more questions again"
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={styles.buttonLabel}>
              Try again
            </ThemedText>
          </Pressable>
        </View>
      );
    }

    if (phase.hasMore) {
      return (
        <View style={styles.footerBlock}>
          <Pressable
            onPress={() => void loadMore()}
            accessibilityRole="button"
            accessibilityLabel="Show more questions"
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={styles.buttonLabel}>
              Show more
            </ThemedText>
          </Pressable>
        </View>
      );
    }

    return null;
  };

  const inquiries = phase.kind === 'ready' ? phase.inquiries : [];

  return (
    <ThemedView
      style={[styles.root, { paddingTop: safeAreaInsets.top + Spacing.two }]}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <ThemedText type="small">Back</ThemedText>
        </Pressable>

        <ThemedText type="subtitle">Your questions</ThemedText>

        {phase.kind === 'ready' && phase.total > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {`Showing ${phase.inquiries.length} of ${phase.total}`}
          </ThemedText>
        ) : null}
      </View>

      <FlatList
        data={inquiries}
        keyExtractor={(inquiry) => inquiry.id}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingBottom:
              safeAreaInsets.bottom + BottomTabInset + Spacing.four,
          },
        ]}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        renderItem={({ item }) => (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" numberOfLines={3}>
              {item.message}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {`Sent ${new Date(item.createdAt).toLocaleDateString()} · listing version ${item.catalogVersion}`}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {item.status === 'NEW'
                ? 'Waiting for the artisan'
                : item.status}
            </ThemedText>
          </ThemedView>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
    paddingRight: Spacing.two,
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
  pressed: {
    opacity: 0.7,
  },
  listContent: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    flexGrow: 1,
  },
  card: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  stateBlock: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
  },
  stateMessage: {
    textAlign: 'center',
  },
  footerBlock: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
});

export default InquiryHistory;
