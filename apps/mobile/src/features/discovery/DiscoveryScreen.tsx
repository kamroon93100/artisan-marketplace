import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  DISCOVERY_PAGE_SIZE_DEFAULT,
  DISCOVERY_SEARCH_MAX_LENGTH,
  resolveDiscoveryTransport,
  type DiscoveryPublishedProductResponse,
  type DiscoveryTransport,
} from '@/network/discovery-transport';

import { describeDiscoveryFailure, formatPublishedAt } from './discovery-display';

type Props = {
  onBack: () => void;
  onOpenProduct: (productId: string) => void;
  /**
   * Injected so the screen can be exercised without a network, and so a test
   * can supply refusals the real transport has to survive. Defaults to the
   * one shared transport, resolved through `useMemo` rather than constructed
   * here: a client built during render is a different object on every render,
   * which makes the load callback and then the effect that calls it fire
   * again, forever.
   */
  transport?: DiscoveryTransport;
};

/**
 * What the list is waiting on.
 *
 * `forSearch` records the search the loaded rows were produced by. The header
 * status reads the label from the page itself rather than from the input
 * state, so a result set and the query that produced it cannot drift apart
 * even while a later request is in flight.
 */
type Phase =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      products: readonly DiscoveryPublishedProductResponse[];
      total: number;
      hasMore: boolean;
      forSearch: string | null;
    }
  | { kind: 'failed'; message: string; retryable: boolean };

type MoreError = { message: string; retryable: boolean };

export function DiscoveryScreen({
  onBack,
  onOpenProduct,
  transport,
}: Props) {
  const client = useMemo(
    () => resolveDiscoveryTransport(transport),
    [transport],
  );
  const theme = useTheme();
  const safeAreaInsets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [searchText, setSearchText] = useState('');
  /**
   * The search the current page was loaded for — `null` means no search.
   * Applying a search only when it is submitted, rather than on every
   * keystroke, keeps one page load per intent instead of one per character.
   */
  const [appliedSearch, setAppliedSearch] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<MoreError | null>(null);
  /**
   * The next offset as the server consumed it (rows the server returned so
   * far for this query), not the length of the deduped on-screen list:
   * duplicates dropped from the display would otherwise freeze the offset
   * and make "Show more" re-request the same window forever.
   */
  const [nextOffset, setNextOffset] = useState(0);
  /**
   * Monotonic token for in-flight requests. On a weak connection a slow
   * earlier response can settle after a newer one; every async write checks
   * that its request is still the latest, so a superseded response or
   * failure can never overwrite the state of the request that replaced it.
   */
  const requestSeqRef = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const seq = ++requestSeqRef.current;
    setPhase({ kind: 'loading' });
    setMoreError(null);
    setLoadingMore(false);

    try {
      const page = await client.searchProducts({
        ...(appliedSearch === null ? {} : { search: appliedSearch }),
        limit: DISCOVERY_PAGE_SIZE_DEFAULT,
      });

      if (seq !== requestSeqRef.current) {
        return;
      }

      setPhase({
        kind: 'ready',
        products: page.products,
        total: page.total,
        hasMore: page.hasMore,
        forSearch: appliedSearch,
      });
      setNextOffset(page.products.length);
    } catch (error) {
      if (seq !== requestSeqRef.current) {
        return;
      }

      const failure = describeDiscoveryFailure(error);
      setPhase({ kind: 'failed', ...failure });
    }
  }, [client, appliedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (phase.kind !== 'ready' || loadingMore) {
      return;
    }

    const seq = ++requestSeqRef.current;
    const offset = nextOffset;
    setLoadingMore(true);
    setMoreError(null);

    try {
      const page = await client.searchProducts({
        ...(appliedSearch === null ? {} : { search: appliedSearch }),
        limit: DISCOVERY_PAGE_SIZE_DEFAULT,
        offset,
      });

      if (seq !== requestSeqRef.current) {
        return;
      }

      /**
       * Offset pages are assembled from separate snapshots, so a listing can
       * arrive twice when the catalog shifts between them. A repeated id
       * would break the list's key and show the buyer the same listing
       * twice, so the page is folded onto what is already on screen rather
       * than appended blindly.
       */
      const seen = new Set(
        phase.products.map((product) => product.productId),
      );

      setPhase({
        kind: 'ready',
        products: [
          ...phase.products,
          ...page.products.filter(
            (product) => !seen.has(product.productId),
          ),
        ],
        total: page.total,
        /**
         * A page that returned no rows cannot advance the window, so the
         * server's hasMore claim would put "Show more" on a loop that never
         * makes progress. An empty page ends the list regardless of claim.
         */
        hasMore: page.hasMore && page.products.length > 0,
        forSearch: phase.forSearch,
      });
      setNextOffset(offset + page.products.length);
    } catch (error) {
      if (seq !== requestSeqRef.current) {
        return;
      }

      setMoreError(describeDiscoveryFailure(error));
    } finally {
      if (seq === requestSeqRef.current) {
        setLoadingMore(false);
      }
    }
  }, [client, phase, loadingMore, appliedSearch, nextOffset]);

  const applySearch = useCallback((): void => {
    const trimmed = searchText.trim();
    setAppliedSearch(trimmed === '' ? null : trimmed);
  }, [searchText]);

  const clearSearch = useCallback((): void => {
    setSearchText('');
    setAppliedSearch(null);
  }, []);

  const products = phase.kind === 'ready' ? phase.products : [];

  const statusLine =
    phase.kind === 'ready' && phase.total > 0
      ? phase.forSearch === null
        ? `Showing ${phase.products.length} of ${phase.total}`
        : `Showing ${phase.products.length} of ${phase.total} for "${phase.forSearch}"`
      : null;

  const renderEmpty = (): ReactElement => {
    if (phase.kind === 'loading') {
      return (
        <View style={styles.stateBlock} accessibilityRole="progressbar">
          <ActivityIndicator />
          <ThemedText type="small" themeColor="textSecondary">
            Loading published products…
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
              accessibilityLabel="Try loading the catalog again"
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <ThemedText type="smallBold" style={styles.buttonLabel}>Try again</ThemedText>
            </Pressable>
          ) : null}
        </View>
      );
    }

    return (
      <View style={styles.stateBlock}>
        <ThemedText type="small" themeColor="textSecondary">
          {phase.forSearch === null
            ? 'No published products yet. Published work will appear here.'
            : `No published products match "${phase.forSearch}".`}
        </ThemedText>
        {phase.forSearch !== null ? (
          <Pressable
            onPress={clearSearch}
            accessibilityRole="button"
            accessibilityLabel="Clear the search and show everything"
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={styles.buttonLabel}>
              Clear search
            </ThemedText>
          </Pressable>
        ) : null}
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
            {moreError.message}
          </ThemedText>
          {moreError.retryable ? (
            <Pressable
              onPress={() => void loadMore()}
              accessibilityRole="button"
              accessibilityLabel="Try loading more products again"
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <ThemedText type="smallBold" style={styles.buttonLabel}>
                Try again
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      );
    }

    if (phase.hasMore) {
      return (
        <View style={styles.footerBlock}>
          <Pressable
            onPress={() => void loadMore()}
            accessibilityRole="button"
            accessibilityLabel="Show more published products"
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
          accessibilityLabel="Back to Explore"
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <ThemedText type="small">Back</ThemedText>
        </Pressable>

        <ThemedText type="subtitle">Discover</ThemedText>

        <View style={styles.searchRow}>
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={applySearch}
            placeholder="Search published products"
            placeholderTextColor={theme.textSecondary}
            maxLength={DISCOVERY_SEARCH_MAX_LENGTH}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search published products"
            style={[
              styles.searchInput,
              {
                color: theme.text,
                backgroundColor: theme.backgroundElement,
                borderColor: theme.textSecondary,
              },
            ]}
          />
          <Pressable
            onPress={applySearch}
            accessibilityRole="button"
            accessibilityLabel="Run the search"
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={styles.buttonLabel}>
              Search
            </ThemedText>
          </Pressable>
        </View>

        {appliedSearch !== null ? (
          <View style={styles.appliedRow}>
            <ThemedText type="small" themeColor="textSecondary">
              {`Searching for "${appliedSearch}"`}
            </ThemedText>
            <Pressable
              onPress={clearSearch}
              accessibilityRole="button"
              accessibilityLabel="Clear the search"
              hitSlop={8}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedText type="small">Clear</ThemedText>
            </Pressable>
          </View>
        ) : null}

        {statusLine !== null ? (
          <ThemedText type="small" themeColor="textSecondary">
            {statusLine}
          </ThemedText>
        ) : null}
      </View>

      <FlatList
        data={products}
        keyExtractor={(product) => product.productId}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingBottom:
              safeAreaInsets.bottom + BottomTabInset + Spacing.three,
          },
        ]}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        renderItem={({ item }) => {
          /**
           * The category line only renders when there is one. An empty
           * meta line would read as a missing separator rather than as
           * "the artisan filed this under nothing".
           */
          const meta = [item.category ?? '', ...item.materials]
            .filter((entry) => entry.trim() !== '')
            .join(' · ');

          return (
            <Pressable
              onPress={() => onOpenProduct(item.productId)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.title}`}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">{item.title}</ThemedText>

                {meta !== '' ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {meta}
                  </ThemedText>
                ) : null}

                <ThemedText type="small" numberOfLines={2}>
                  {item.description}
                </ThemedText>

                <ThemedText type="small" themeColor="textSecondary">
                  Published {formatPublishedAt(item.publishedAt)}
                </ThemedText>
              </ThemedView>
            </Pressable>
          );
        }}
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
  searchRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  appliedRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
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
