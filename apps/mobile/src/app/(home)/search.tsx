import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useState, useEffect } from 'react';

import { Colors, Spacing, CraftRadii } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CraftPressButton } from '@/components/craft-motion';
import { useTheme } from '@/hooks/use-theme';

const RECENT_SEARCHES = ['ceramics', 'handwoven textiles', 'wood carving', 'blown glass', 'silver jewelry'];
const TRENDING_SEARCHES = ['daisy vase', 'hobo bag', 'cutting board', 'tumbler set', 'filigree pendant'];

export default function SearchScreen() {
  const theme = useTheme();
  const [searchText, setSearchText] = useState('');
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowResults(searchText.trim().length > 0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const handleSearch = () => {
    if (searchText.trim()) {
      // TODO: Navigate to search results
      console.log('Search for:', searchText);
    }
  };

  const handleRecentPress = (term: string) => {
    setSearchText(term);
    handleSearch();
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}
          hitSlop={12}>
          <ThemedText type="labelLg" themeColor="text">←</ThemedText>
        </Pressable>
        <ThemedView type="backgroundElement" style={styles.searchWrapper}>
          <ThemedText type="labelMd" themeColor="textSecondary" style={styles.searchIcon}>
            🔍
          </ThemedText>
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={handleSearch}
            placeholder="Search handmade treasures"
            placeholderTextColor={theme.textSecondary}
            autoFocus
            style={styles.searchInput}
          />
        </ThemedView>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {searchText.trim() === '' ? (
          <>
            {RECENT_SEARCHES.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <ThemedText type="labelMd" themeColor="text" style={styles.sectionTitle}>
                    Recent Searches
                  </ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear recent searches"
                    style={styles.clearButton}
                    hitSlop={8}>
                    <ThemedText type="labelSm" themeColor="primary" style={styles.clearText}>
                      Clear all
                    </ThemedText>
                  </Pressable>
                </View>
                <View style={styles.recentList}>
                  {RECENT_SEARCHES.map((term, i) => (
                    <Pressable
                      key={i}
                      onPress={() => handleRecentPress(term)}
                      accessibilityRole="button"
                      accessibilityLabel={`Search for ${term}`}
                      style={styles.recentItem}
                      hitSlop={8}>
                      <ThemedText type="labelMd" themeColor="textSecondary" style={styles.recentIcon}>
                        🕐
                      </ThemedText>
                      <ThemedText type="bodyMd" themeColor="text" style={styles.recentText}>
                        {term}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {TRENDING_SEARCHES.length > 0 && (
              <View style={styles.section}>
                <ThemedText type="labelMd" themeColor="text" style={styles.sectionTitle}>
                  Trending Now
                </ThemedText>
                <View style={styles.trendingGrid}>
                  {TRENDING_SEARCHES.map((term, i) => (
                    <Pressable
                      key={i}
                      onPress={() => handleRecentPress(term)}
                      accessibilityRole="button"
                      accessibilityLabel={`Search for ${term}`}
                      style={styles.trendingChip}
                      hitSlop={8}>
                      <ThemedText type="labelSm" themeColor="primary" style={styles.trendingIcon}>
                        🔥
                      </ThemedText>
                      <ThemedText type="labelSm" themeColor="text" style={styles.trendingText}>
                        {term}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </>
        ) : (
          <View style={styles.results}>
            <ThemedText type="labelMd" themeColor="textSecondary" style={styles.resultsLabel}>
              Showing results for &ldquo;{searchText}&rdquo;
            </ThemedText>
            <ThemedText type="bodyMd" themeColor="textSecondary" style={styles.resultsDesc}>
              Search results would appear here. Connect to discovery API to load products.
            </ThemedText>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.margin,
    paddingVertical: Spacing.md,
    paddingTop: Spacing.lg,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: CraftRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.backgroundElement,
  },
  searchWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    height: 48,
    borderRadius: CraftRadii.pill,
    backgroundColor: Colors.light.backgroundElement,
  },
  searchIcon: {
    fontSize: 18,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: Colors.light.text,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.margin,
    paddingBottom: Spacing['2xl'],
    gap: Spacing.xl,
  },
  section: {
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    // Font handled by ThemedText type="labelMd"
  },
  clearButton: {
    paddingVertical: Spacing.xs,
  },
  clearText: {
    // Font handled by ThemedText type="labelSm"
  },
  recentList: {
    gap: Spacing.xs,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: CraftRadii.md,
    backgroundColor: Colors.light.backgroundElement,
  },
  recentIcon: {
    fontSize: 18,
  },
  recentText: {
    // Font handled by ThemedText type="bodyMd"
    flex: 1,
  },
  trendingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  trendingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: CraftRadii.pill,
    backgroundColor: Colors.light.backgroundElement,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  trendingIcon: {
    fontSize: 14,
  },
  trendingText: {
    // Font handled by ThemedText type="labelSm"
  },
  results: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['2xl'],
    gap: Spacing.md,
  },
  resultsLabel: {
    // Font handled by ThemedText type="labelMd"
  },
  resultsDesc: {
    // Font handled by ThemedText type="bodyMd"
    textAlign: 'center',
    maxWidth: '80%',
  },
});