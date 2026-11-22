import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CraftEntrance, CraftPressButton, CraftStatusPill } from '@/components/craft-motion';
import { Colors, Spacing, CraftRadii, Typography, FontSizes, LineHeights, FontWeights, LetterSpacings, Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const STAGGER_DELAY = 60;
const CARD_SPRING = { damping: 20, stiffness: 280 } as const;

interface Category {
  id: string;
  label: string;
  icon: string;
}

interface Artisan {
  id: string;
  name: string;
  studio: string;
  location: string;
  avatar: string;
  specialties: string[];
}

interface Product {
  id: string;
  title: string;
  artisan: string;
  studio: string;
  price: number;
  originalPrice?: number;
  image: string;
  category: string;
  materials: string[];
  rating: number;
  reviewCount: number;
  isNew: boolean;
}

const CATEGORIES: Category[] = [
  { id: 'all', label: 'All', icon: 'apps' },
  { id: 'ceramics', label: 'Ceramics', icon: 'category' },
  { id: 'textiles', label: 'Textiles', icon: 'fabric_new' },
  { id: 'woodwork', label: 'Woodwork', icon: 'forest' },
  { id: 'glass', label: 'Glass', icon: 'wine_bar' },
  { id: 'jewelry', label: 'Jewelry', icon: 'diamond' },
];

const FEATURED_ARTISANS: Artisan[] = [
  {
    id: '1',
    name: 'Mei Lin',
    studio: 'Mei Lin Ceramics',
    location: 'Kyoto, Japan',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC7Pj_wuzWpXTUYFHMLI0zHJAXFfyKcmRfgvmSAVdculWheC4UrmLUgug55QF0M56085MVteVvra4NYbeU0qRh787bnSq6Gbbl0OtJRz7QYWTHJxxHZsHl59E-P0uu68keTRZI42SwNlnGgEK7FCjlU7Q1cc-yLDjPZ59dv6ssffIUVb-4Yg3W0vYXA_AzeyF0oV1y7k4RWzN_36-7URfjsABRtJhrSjibzjI6cPD-A',
    specialties: ['Wood-fired ceramics', 'Natural glazes'],
  },
  {
    id: '2',
    name: 'Neva',
    studio: 'Atelier Neva',
    location: 'Portland, USA',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB87GwiRJYHxpsxVqLfo_exlHy4Zbd1FaDPThFW5CGBKPyXDf1tJpMl-kymq626ILbuGvndWKe_KjDBhEuG7MAKpB4IiHDupiNpMrvpnHJnix39x7VA0ClnQBBSxsdgJRuOyHmB4nUjKIisQ1P4iOiSLlGywZ3KTslM8DfziezDBmjXVJzHv1d-QNw5m_FJN4FvmSb9QJVyqzL97BbmeFShiYacoCR_R5RUyxF2V5Ph',
    specialties: ['Handwoven textiles', 'Natural dyes'],
  },
  {
    id: '3',
    name: 'Hiro Tanaka',
    studio: 'Tanaka Woodworks',
    location: 'Takayama, Japan',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuALajplnod2fF_-3x1XNxcoVL5OjEKMMPteoyQdY4zLC5oBHd006pN_VdcyloYCmq5wAjiZT08lTCea7dH0V25H6JjesMwUUyRLA7Dan2mEVTez6sEm9pqgkQ7JN5fqgBirX-zo3gAUZcP-9-dkELROadTvn6b7-pZoE2HzTGauFfHo7zqSyNTFs3UQi2zXD-gKn1IU6jMdEWsau17L5HlaDcct-24LNEqiS4cs1db4',
    specialties: ['Traditional joinery', 'Hinoki cypress'],
  },
];

const NEW_ARRIVALS: Product[] = [
  {
    id: '1',
    title: 'Handmade Daisy Ceramic Vase',
    artisan: 'Mei Lin',
    studio: 'Mei Lin Ceramics',
    price: 42.50,
    originalPrice: 58.00,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAkm4reedw5ms0OOwoh27x92LNOaifSmv2GyPmmNQJG1618rFtM37nRMuKb-nSr72QRGn1KGYHtLLSZSJHaEO3uO-2ByKdHaktRZfpNv-YUiiifTJCTfgZYnI7zkPAxAk-McHf7DgFflr9Oj5I2m9dnnJzeU6_v4fjhvwaAsvYdlOnBKJD7atPtSFMWgKJqsYQE-jo_jVa_Nc59sXqFvysm3f23dr9zHfk_NNmhkVPq',
    category: 'Ceramics',
    materials: ['Stoneware', 'Wood-ash glaze'],
    rating: 4.9,
    reviewCount: 128,
    isNew: true,
  },
  {
    id: '2',
    title: 'Aida Cotton Hobo Bag',
    artisan: 'Neva',
    studio: 'Atelier Neva',
    price: 54.00,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAEwZIll0LZci8mQeHYncHGQ3IFq6F7Xd71q1GfH-HMaaAINy9xjbo5yyJEtEXQ7tWKw7Arx6EBbGvPcM9k4k39VutWFYqez4-M9s0lWsqZUzcQMqdUZXgcyTAwdmjxYTv_q1zlGywCXKUom79uV2rhepZHyQIOOo6Hz3Nyn8RVN2g5KrvBNPfDEHNiF4v5lawfijdPPHIZVhsixelXLfg48vKHfYWOPCybNCj3gXxn',
    category: 'Textiles',
    materials: ['Organic cotton', 'Handwoven'],
    rating: 4.8,
    reviewCount: 87,
    isNew: true,
  },
  {
    id: '3',
    title: 'Raw Blossom Ring Dish',
    artisan: 'Wabi Earth Studio',
    studio: 'Wabi Earth Studio',
    price: 28.00,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA4B5Cxg6z-XPeWfGUDuKWvhpv7JC-tEOGlllhIAW788p3feEw2r0Xkk9xHtkF558FBpRdJRhCxzscWpBWWs39698vkGBSYNnh4qqhMm4N0uvVzio2e8Z7utFU70AEXAdtdG0agTfej_-IdRS4emxmBaTdGjJaMinIkJLKAF0XyX1NbpWjClRNJsN1nAHyVa_v2EkHLyEZY8zIB0aEDIoAhilqjjQmSJzWr0thLtlum',
    category: 'Ceramics',
    materials: ['Terracotta', 'Botanical impressions'],
    rating: 4.7,
    reviewCount: 54,
    isNew: true,
  },
  {
    id: '4',
    title: 'Hinoki Cutting Board',
    artisan: 'Hiro Tanaka',
    studio: 'Tanaka Woodworks',
    price: 89.00,
    originalPrice: 110.00,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBDMFhPy3j8A71rKc9d9VzP6hkyMDi6L3YI-BCE2haDMX6UQrkSQ3HmHuP4Z1qVDH-Ed4sA9pKXr78tdKAeRzGG2Kyan3kD7Pt1-HvKR0JnCdifBC00At1kosqprL7JjDnbyWFWj85p7zeXlfej0QVNhhjWKCllxMiJwf3xjvClyNz1Ng-wl4ABoi_kbjuKjHmkd0MNTOoBqY3O1W61IsjTKv6oyQ0T0-PrjlqOOwBj',
    category: 'Woodwork',
    materials: ['Hinoki cypress', 'Food-safe finish'],
    rating: 4.9,
    reviewCount: 203,
    isNew: false,
  },
];

const EDITORS_PICKS: Product[] = [
  {
    id: '5',
    title: 'Blown Glass Tumbler Set',
    artisan: 'Sofia Andersson',
    studio: 'Nordic Glass',
    price: 65.00,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAj2jBkkeH3uc0LvnvCC0o-xJB1MV3mpuk-WFPKIgpjsmMKK8rc9L7W2o2RqnmtiamxNQf2Y9RNUnYotxW0WpDVExr2ikap6zWWJsBO-cWH1fJ48YCyzAU1xMVOSjU8M4fse70fU7BaNcOLDzGuJGctFxF__mZhaxeqem9b-orW1bSiHYkZVEB1vZ8di6m-N4pearH_SmeTuK-cGOb2IQ4ynJlo1bnxRDxyvplBvMYS',
    category: 'Glass',
    materials: ['Recycled glass', 'Hand-blown'],
    rating: 4.8,
    reviewCount: 92,
    isNew: false,
  },
  {
    id: '6',
    title: 'Silver Filigree Pendant',
    artisan: 'Elena Rossi',
    studio: 'Rossi Gioielli',
    price: 145.00,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB2yQCqBmOz6in-Qu__ZLzS7RjT8mwn52xEE4Ntlq0_BaTiz5mTdRNcTcBVsv-kBpv-9HC0mOUFBe0mHE0lIhP0Bq1eFb8Cf9mBXqmqNx1zm1slXh20wqy-l8ARo5--UuyBOEMoHj8iqlL0kthBkVwI2spkBhe7p8F_Ivqa92Tja_57CkajZelVvpxaOiLNMeMy5J15LaUMdoMqjavPdsJ7pkeSgx6jtp1nkOj0Idb9',
    category: 'Jewelry',
    materials: ['Sterling silver', 'Filigree'],
    rating: 4.9,
    reviewCount: 67,
    isNew: true,
  },
];

export function MarketplaceHomeFeed({
  onOpenProduct,
  onOpenArtisan,
  onOpenCart,
  onOpenSearch,
}: {
  onOpenProduct: (productId: string) => void;
  onOpenArtisan: (artisanId: string) => void;
  onOpenCart: () => void;
  onOpenSearch: () => void;
}) {
  const theme = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchText, setSearchText] = useState('');

  // Animation values for staggered entrance
  const headerAnim = useSharedValue(0);
  const searchAnim = useSharedValue(0);
  const categoriesAnim = useSharedValue(0);
  const featuredAnim = useSharedValue(0);
  const newArrivalsAnim = useSharedValue(0);
  const editorsPicksAnim = useSharedValue(0);

  useEffect(() => {
    headerAnim.value = withDelay(0, withSpring(1, CARD_SPRING));
    searchAnim.value = withDelay(STAGGER_DELAY, withSpring(1, CARD_SPRING));
    categoriesAnim.value = withDelay(STAGGER_DELAY * 2, withSpring(1, CARD_SPRING));
    featuredAnim.value = withDelay(STAGGER_DELAY * 3, withSpring(1, CARD_SPRING));
    newArrivalsAnim.value = withDelay(STAGGER_DELAY * 4, withSpring(1, CARD_SPRING));
    editorsPicksAnim.value = withDelay(STAGGER_DELAY * 5, withSpring(1, CARD_SPRING));
  }, []);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerAnim.value,
    transform: [{ translateY: withSpring(0, CARD_SPRING) }],
  }));

  const searchStyle = useAnimatedStyle(() => ({
    opacity: searchAnim.value,
    transform: [{ translateY: withSpring(0, CARD_SPRING) }],
  }));

  const categoriesStyle = useAnimatedStyle(() => ({
    opacity: categoriesAnim.value,
    transform: [{ translateY: withSpring(0, CARD_SPRING) }],
  }));

  const featuredStyle = useAnimatedStyle(() => ({
    opacity: featuredAnim.value,
    transform: [{ translateY: withSpring(0, CARD_SPRING) }],
  }));

  const newArrivalsStyle = useAnimatedStyle(() => ({
    opacity: newArrivalsAnim.value,
    transform: [{ translateY: withSpring(0, CARD_SPRING) }],
  }));

  const editorsPicksStyle = useAnimatedStyle(() => ({
    opacity: editorsPicksAnim.value,
    transform: [{ translateY: withSpring(0, CARD_SPRING) }],
  }));

  const renderCategory = useCallback(
    ({ item, index }: { item: Category; index: number }) => {
      const isSelected = selectedCategory === item.id;

      return (
        <CraftEntrance delayMs={index * 40} style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}>
          <Pressable
            onPress={() => setSelectedCategory(item.id)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: isSelected }}
            hitSlop={8}
          >
            <ThemedText
              type="labelSm"
              themeColor={isSelected ? 'background' : 'textSecondary'}
              style={[
                styles.categoryChipText,
                isSelected && { color: theme.background, fontWeight: FontWeights.semibold },
              ]}>
              {item.label}
            </ThemedText>
          </Pressable>
        </CraftEntrance>
      );
    },
    [selectedCategory, theme.background],
  );

  const renderArtisan = useCallback(
    ({ item, index }: { item: Artisan; index: number }) => {

      return (
        <CraftEntrance delayMs={index * 60} style={styles.artisanCard} key={item.id}>
          <Pressable
            onPress={() => onOpenArtisan(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`View ${item.name}'s studio`}
            style={({ pressed }) => [styles.artisanCardInner, pressed && styles.pressed]}
          >
            <View style={styles.artisanAvatarWrapper}>
              <ThemedView type="backgroundElement" style={styles.artisanAvatar}>
                <ImageWithPlaceholder
                  source={{ uri: item.avatar }}
                  style={styles.artisanAvatarImage}
                  placeholder={item.name.charAt(0)}
                />
              </ThemedView>
              <CraftStatusPill text="Verified" tone="accent" style={styles.verifiedBadge} />
            </View>
            <ThemedText type="labelMd" themeColor="text" style={styles.artisanName} numberOfLines={1}>
              {item.name}
            </ThemedText>
            <ThemedText type="bodySm" themeColor="textSecondary" style={styles.artisanStudio} numberOfLines={1}>
              {item.studio}
            </ThemedText>
            <ThemedText type="labelSm" themeColor="textSecondary" style={styles.artisanLocation}>
              {item.location}
            </ThemedText>
            <View style={styles.specialtiesRow}>
              {item.specialties.slice(0, 2).map((specialty, i) => (
                <ThemedView key={i} type="backgroundSelected" style={styles.specialtyChip}>
                  <ThemedText type="labelSm" themeColor="textSecondary" numberOfLines={1}>
                    {specialty}
                  </ThemedText>
                </ThemedView>
              ))}
            </View>
          </Pressable>
        </CraftEntrance>
      );
    },
    [onOpenArtisan],
  );

  const renderProduct = useCallback(
    ({ item, index }: { item: Product; index: number }) => {

      const hasDiscount = item.originalPrice && item.originalPrice > item.price;
      const discountPercent = hasDiscount
        ? Math.round(((item.originalPrice! - item.price) / item.originalPrice!) * 100)
        : 0;

      return (
        <CraftEntrance delayMs={index * 50} style={styles.productCard} key={item.id}>
          <Pressable
            onPress={() => onOpenProduct(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`View ${item.title}`}
            style={({ pressed }) => [styles.productCardInner, pressed && styles.pressed]}
          >
            <ThemedView type="backgroundElement" style={styles.productImageWrapper}>
              <ImageWithPlaceholder
                source={{ uri: item.image }}
                style={styles.productImage}
                placeholder={item.category.charAt(0)}
              />
              {item.isNew && (
                <ThemedView type="primary" style={styles.newBadge}>
                  <ThemedText type="labelSm" themeColor="onPrimary">New</ThemedText>
                </ThemedView>
              )}
              {hasDiscount && (
                <ThemedView type="tertiary" style={styles.discountBadge}>
                  <ThemedText type="labelSm" themeColor="onTertiary">-{discountPercent}%</ThemedText>
                </ThemedView>
              )}
            </ThemedView>
            <View style={styles.productInfo}>
              <ThemedText type="labelSm" themeColor="secondary" style={styles.productCategory}>
                {item.category}
              </ThemedText>
              <ThemedText type="headlineSm" themeColor="text" style={styles.productTitle} numberOfLines={2}>
                {item.title}
              </ThemedText>
              <ThemedText type="bodySm" themeColor="textSecondary" style={styles.productArtisan} numberOfLines={1}>
                {item.artisan} · {item.studio}
              </ThemedText>
              <View style={styles.productFooter}>
                <View style={styles.priceRow}>
                  <ThemedText type="labelLg" themeColor="primary" style={styles.currentPrice}>
                    ${item.price.toFixed(2)}
                  </ThemedText>
                  {hasDiscount && (
                    <ThemedText type="bodySm" themeColor="textSecondary" style={styles.originalPrice}>
                      ${item.originalPrice!.toFixed(2)}
                    </ThemedText>
                  )}
                </View>
                <View style={styles.ratingRow}>
                  <ThemedText type="labelSm" themeColor="tertiary" style={styles.ratingText}>
                    {item.rating.toFixed(1)}
                  </ThemedText>
                  <ThemedText type="labelSm" themeColor="textSecondary" style={styles.reviewCount}>
                    ({item.reviewCount})
                  </ThemedText>
                </View>
              </View>
            </View>
          </Pressable>
        </CraftEntrance>
      );
    },
    [onOpenProduct],
  );

  const renderEditorPick = useCallback(
    ({ item, index }: { item: Product; index: number }) => {

      return (
        <CraftEntrance delayMs={index * 60} style={styles.editorPickCard} key={item.id}>
          <Pressable
            onPress={() => onOpenProduct(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`View ${item.title}`}
            style={({ pressed }) => [styles.editorPickCardInner, pressed && styles.pressed]}
          >
            <ThemedView type="backgroundElement" style={styles.editorPickImageWrapper}>
              <ImageWithPlaceholder
                source={{ uri: item.image }}
                style={styles.editorPickImage}
                placeholder={item.category.charAt(0)}
              />
            </ThemedView>
            <View style={styles.editorPickInfo}>
              <ThemedText type="labelSm" themeColor="secondary" style={styles.editorPickCategory}>
                {item.category}
              </ThemedText>
              <ThemedText type="headlineSm" themeColor="text" style={styles.editorPickTitle} numberOfLines={2}>
                {item.title}
              </ThemedText>
              <ThemedText type="bodySm" themeColor="textSecondary" style={styles.editorPickArtisan} numberOfLines={1}>
                {item.artisan} · {item.studio}
              </ThemedText>
              <ThemedText type="labelLg" themeColor="primary" style={styles.editorPickPrice}>
                ${item.price.toFixed(2)}
              </ThemedText>
            </View>
          </Pressable>
        </CraftEntrance>
      );
    },
    [onOpenProduct],
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: safeAreaInsets.top, paddingBottom: safeAreaInsets.bottom + Spacing['2xl'] },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with search, notifications, cart */}
        <Animated.View style={[styles.header, headerStyle]}>
          <Pressable
            onPress={onOpenSearch}
            accessibilityRole="button"
            accessibilityLabel="Search marketplace"
            style={styles.searchButton}
          >
            <ThemedView type="backgroundElement" style={styles.searchButtonInner}>
              <ThemedText type="labelMd" themeColor="textSecondary" style={styles.searchIcon}>
                🔍
              </ThemedText>
              <ThemedText type="labelMd" themeColor="textSecondary">
                Search handmade treasures
              </ThemedText>
            </ThemedView>
          </Pressable>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              style={styles.iconButton}
              hitSlop={12}
            >
              <ThemedText type="labelLg" themeColor="text">🔔</ThemedText>
            </Pressable>
            <Pressable
              onPress={onOpenCart}
              accessibilityRole="button"
              accessibilityLabel="View cart (3 items)"
              style={styles.cartButton}
              hitSlop={12}
            >
              <ThemedText type="labelLg" themeColor="text">🛍</ThemedText>
              <ThemedView type="primary" style={styles.cartBadge}>
                <ThemedText type="labelSm" themeColor="onPrimary" style={styles.cartBadgeText}>
                  3
                </ThemedText>
              </ThemedView>
            </Pressable>
          </View>
        </Animated.View>

        {/* Welcome Section */}
        <Animated.View style={[styles.welcomeSection, searchStyle]}>
          <ThemedText type="headlineLgMobile" themeColor="text" style={styles.welcomeTitle}>
            Good morning, Maxwell
          </ThemedText>
          <ThemedText type="bodyMd" themeColor="textSecondary" style={styles.welcomeSubtitle}>
            Discover 2,847 handmade treasures from 312 artisans worldwide
          </ThemedText>
        </Animated.View>

        {/* Categories Carousel */}
        <Animated.View style={[styles.section, categoriesStyle]}>
          <View style={styles.sectionHeader}>
            <ThemedText type="headlineSm" themeColor="text">Shop by Category</ThemedText>
          </View>
          <FlatList
            data={CATEGORIES}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={renderCategory}
            contentContainerStyle={styles.categoriesContent}
            snapToInterval={100}
            decelerationRate="fast"
          />
        </Animated.View>

        {/* Featured Artisans */}
        <Animated.View style={[styles.section, featuredStyle]}>
          <View style={styles.sectionHeader}>
            <ThemedText type="headlineSm" themeColor="text">Featured Artisans</ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View all artisans"
              style={styles.viewAllButton}
              hitSlop={8}
            >
              <ThemedText type="labelMd" themeColor="primary">View All</ThemedText>
              <ThemedText type="labelMd" themeColor="primary">→</ThemedText>
            </Pressable>
          </View>
          <FlatList
            data={FEATURED_ARTISANS}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={renderArtisan}
            contentContainerStyle={styles.featuredContent}
            snapToInterval={200}
            decelerationRate="fast"
          />
        </Animated.View>

        {/* New Arrivals */}
        <Animated.View style={[styles.section, newArrivalsStyle]}>
          <View style={styles.sectionHeader}>
            <ThemedText type="headlineSm" themeColor="text">New Arrivals</ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View all new arrivals"
              style={styles.viewAllButton}
              hitSlop={8}
            >
              <ThemedText type="labelMd" themeColor="primary">View All</ThemedText>
              <ThemedText type="labelMd" themeColor="primary">→</ThemedText>
            </Pressable>
          </View>
          <FlatList
            data={NEW_ARRIVALS}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={renderProduct}
            contentContainerStyle={styles.productsContent}
            snapToInterval={180}
            decelerationRate="fast"
          />
        </Animated.View>

        {/* Editor&apos;s Picks */}
        <Animated.View style={[styles.section, editorsPicksStyle]}>
          <View style={styles.sectionHeader}>
            <ThemedText type="headlineSm" themeColor="text">Editor&apos;s Picks</ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View all editor picks"
              style={styles.viewAllButton}
              hitSlop={8}
            >
              <ThemedText type="labelMd" themeColor="primary">View All</ThemedText>
              <ThemedText type="labelMd" themeColor="primary">→</ThemedText>
            </Pressable>
          </View>
          <FlatList
            data={EDITORS_PICKS}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={renderEditorPick}
            contentContainerStyle={styles.editorPicksContent}
            snapToInterval={280}
            decelerationRate="fast"
          />
        </Animated.View>

        {/* Sustainability Banner */}
        <Animated.View style={[styles.sustainabilityBanner, editorsPicksStyle]}>
          <ThemedView type="secondaryContainer" style={styles.sustainabilityCard}>
            <View style={styles.sustainabilityIconWrapper}>
              <ThemedText type="headlineMd" themeColor="secondary">🌿</ThemedText>
            </View>
            <View style={styles.sustainabilityText}>
              <ThemedText type="labelMd" themeColor="secondary" style={styles.sustainabilityTitle}>
                Every purchase plants a tree
              </ThemedText>
              <ThemedText type="bodySm" themeColor="onSecondaryContainer" style={styles.sustainabilityDesc}>
                We&apos;ve planted 47,823 trees through Eden Reforestation Projects. Your order helps restore forests.
              </ThemedText>
            </View>
            <CraftPressButton
              label="Learn More"
              variant="outline"
              style={styles.sustainabilityButton}
              onPress={() => {}}
            />
          </ThemedView>
        </Animated.View>
      </ScrollView>
    </ThemedView>
  );
}

// Simple image component with placeholder
function ImageWithPlaceholder({
  source,
  style,
  placeholder,
}: {
  source: { uri: string };
  style: any;
  placeholder: string;
}) {
  return (
    <ThemedView type="backgroundElement" style={style}>
      <ThemedText type="headlineMd" themeColor="textSecondary" style={styles.imagePlaceholder}>
        {placeholder}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scrollContent: {
    flexGrow: 1,
    gap: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.margin,
    paddingVertical: Spacing.md,
  },
  searchButton: {
    flex: 1,
    marginRight: Spacing.md,
  },
  searchButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: CraftRadii.pill,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundElement,
  },
  searchIcon: {
    fontSize: 18,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: CraftRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartButton: {
    position: 'relative',
  },
  cartBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: CraftRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    fontSize: 10,
    fontWeight: FontWeights.semibold,
  },
  welcomeSection: {
    paddingHorizontal: Spacing.margin,
    gap: Spacing.xs,
  },
  welcomeTitle: {
    fontSize: FontSizes.headlineLgMobile,
    lineHeight: LineHeights.headlineLgMobile,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.serif,
    letterSpacing: LetterSpacings.headlineLg,
  },
  welcomeSubtitle: {
    fontSize: FontSizes.bodyMd,
    lineHeight: LineHeights.bodyMd,
    fontFamily: Fonts.sans,
  },
  section: {
    paddingHorizontal: Spacing.margin,
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  categoriesContent: {
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
  },
  categoryChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: CraftRadii.pill,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundElement,
    minWidth: 80,
    alignItems: 'center',
  },
  categoryChipSelected: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  categoryChipText: {
    fontSize: FontSizes.labelMd,
    lineHeight: LineHeights.labelMd,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelMd,
    textTransform: 'uppercase',
  },
  featuredContent: {
    paddingVertical: Spacing.xs,
    gap: Spacing.md,
  },
  artisanCard: {
    width: 180,
    minWidth: 180,
  },
  artisanCardInner: {
    gap: Spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  artisanAvatarWrapper: {
    position: 'relative',
    alignItems: 'center',
  },
  artisanAvatar: {
    width: 64,
    height: 64,
    borderRadius: CraftRadii.pill,
    overflow: 'hidden',
  },
  artisanAvatarImage: {
    width: '100%',
    height: '100%',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -4,
    alignSelf: 'center',
  },
  artisanName: {
    textAlign: 'center',
  },
  artisanStudio: {
    textAlign: 'center',
  },
  artisanLocation: {
    textAlign: 'center',
  },
  specialtiesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xs,
    flexWrap: 'wrap',
    marginTop: Spacing.xs,
  },
  specialtyChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: CraftRadii.pill,
  },
  productsContent: {
    paddingVertical: Spacing.xs,
    gap: Spacing.md,
  },
  productCard: {
    width: 170,
    minWidth: 170,
  },
  productCardInner: {
    gap: Spacing.sm,
  },
  productImageWrapper: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1,
    borderRadius: CraftRadii.lg,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  newBadge: {
    position: 'absolute',
    top: Spacing.xs,
    left: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: CraftRadii.pill,
  },
  discountBadge: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: CraftRadii.pill,
  },
  productInfo: {
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  productCategory: {
    fontSize: FontSizes.labelSm,
    lineHeight: LineHeights.labelSm,
    fontWeight: FontWeights.medium,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelSm,
    textTransform: 'uppercase',
  },
  productTitle: {
    fontSize: FontSizes.headlineSm,
    lineHeight: LineHeights.headlineSm,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.serif,
    letterSpacing: LetterSpacings.headlineSm,
  },
  productArtisan: {
    fontSize: FontSizes.bodySm,
    lineHeight: LineHeights.bodySm,
    fontFamily: Fonts.sans,
  },
  productFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
  },
  currentPrice: {
    fontSize: FontSizes.labelLg,
    lineHeight: LineHeights.labelLg,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelLg,
  },
  originalPrice: {
    textDecorationLine: 'line-through',
    fontSize: FontSizes.bodySm,
    lineHeight: LineHeights.bodySm,
    fontFamily: Fonts.sans,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingText: {
    fontSize: FontSizes.labelSm,
    lineHeight: LineHeights.labelSm,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelSm,
  },
  reviewCount: {
    fontSize: FontSizes.labelSm,
    lineHeight: LineHeights.labelSm,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelSm,
  },
  editorPicksContent: {
    paddingVertical: Spacing.xs,
    gap: Spacing.md,
  },
  editorPickCard: {
    width: 260,
    minWidth: 260,
  },
  editorPickCardInner: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  editorPickImageWrapper: {
    width: 80,
    height: 80,
    borderRadius: CraftRadii.md,
    overflow: 'hidden',
    flexShrink: 0,
  },
  editorPickImage: {
    width: '100%',
    height: '100%',
  },
  editorPickInfo: {
    flex: 1,
    justifyContent: 'space-between',
    gap: Spacing.xs,
    minWidth: 0,
  },
  editorPickCategory: {
    fontSize: FontSizes.labelSm,
    lineHeight: LineHeights.labelSm,
    fontWeight: FontWeights.medium,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelSm,
    textTransform: 'uppercase',
  },
  editorPickTitle: {
    fontSize: FontSizes.headlineSm,
    lineHeight: LineHeights.headlineSm,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.serif,
    letterSpacing: LetterSpacings.headlineSm,
  },
  editorPickArtisan: {
    fontSize: FontSizes.bodySm,
    lineHeight: LineHeights.bodySm,
    fontFamily: Fonts.sans,
  },
  editorPickPrice: {
    fontSize: FontSizes.labelLg,
    lineHeight: LineHeights.labelLg,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelLg,
  },
  sustainabilityBanner: {
    paddingHorizontal: Spacing.margin,
  },
  sustainabilityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: CraftRadii.xl,
    minHeight: 88,
  },
  sustainabilityIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: CraftRadii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.secondary,
  },
  sustainabilityText: {
    flex: 1,
    gap: Spacing.xs,
  },
  sustainabilityTitle: {
    fontSize: FontSizes.labelMd,
    lineHeight: LineHeights.labelMd,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelMd,
  },
  sustainabilityDesc: {
    fontSize: FontSizes.bodySm,
    lineHeight: LineHeights.bodySm,
    fontFamily: Fonts.sans,
  },
  sustainabilityButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: CraftRadii.md,
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 48,
  },
});

export default MarketplaceHomeFeed;