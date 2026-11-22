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
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CraftEntrance, CraftPressButton, CraftStatusPill } from '@/components/craft-motion';
import { Colors, Spacing, CraftRadii, Typography, FontSizes, LineHeights, FontWeights, LetterSpacings, Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const STAGGER_DELAY = 60;
const CARD_SPRING = { damping: 20, stiffness: 280 } as const;

interface FinishOption {
  id: string;
  label: string;
  color: string;
  colorName: string;
}

interface SizeOption {
  id: string;
  label: string;
  dimensions: string;
}

interface Review {
  id: string;
  author: string;
  avatar: string;
  rating: number;
  date: string;
  text: string;
  verified: boolean;
}

const FINISH_OPTIONS: FinishOption[] = [
  { id: 'sand', label: 'Natural Sand', color: '#E5D7C7', colorName: 'Natural Sand' },
  { id: 'blush', label: 'Blush Clay', color: '#D97D64', colorName: 'Terracotta Blush' },
  { id: 'ash', label: 'Wood Ash', color: '#F3EDE2', colorName: 'Wood-Ash Cream' },
];

const SIZE_OPTIONS: SizeOption[] = [
  { id: 'standard', label: 'Standard Meadow', dimensions: '7.5" H × 5.2" W' },
  { id: 'mini', label: 'Mini Petal Bud', dimensions: '4.5" H × 3.6" W' },
];

const THUMBNAIL_IMAGES = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAj2jBkkeH3uc0LvnvCC0o-xJB1MV3mpuk-WFPKIgpjsmMKK8rc9L7W2o2RqnmtiamxNQf2Y9RNUnYotxW0WpDVExr2ikap6zWWJsBO-cWH1fJ48YCyzAU1xMVOSjU8M4fse70fU7BaNcOLDzGuJGctFxF__mZhaxeqem9b-orW1bSiHYkZVEB1vZ8di6m-N4pearH_SmeTuK-cGOb2IQ4ynJlo1bnxRDxyvplBvMYS',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuB2yQCqBmOz6in-Qu__ZLzS7RjT8mwn52xEE4Ntlq0_BaTiz5mTdRNcTcBVsv-kBpv-9HC0mOUFBe0mHE0lIhP0Bq1eFb8Cf9mBXqmqNx1zm1slXh20wqy-l8ARo5--UuyBOEMoHj8iqlL0kthBkVwI2spkBhe7p8F_Ivqa92Tja_57CkajZelVvpxaOiLNMeMy5J15LaUMdoMqjavPdsJ7pkeSgx6jtp1nkOj0Idb9',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuC9AF9nbeSNnEZPppP433xMya8-khg8yfnuNKH0w6W6Snz_1qlCVU8-YrUucZ1q951U1i7G_b0EO3e1M30m9DTvPTbmZAhTcZJc6JVAb468CJfLCrr9u0JePdPmJ3dDRs_S6-wE76aQb_GEbWtYpXmZnYkX9N5XRi6SVuLygbBX8i4wgKRMHMH4PYH0icedWYkWmEV1QmHbc2kGzd_YEV5bHbsWFSgH_DLkNd0fuOUN',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBzL-Zw6ocFEWQqqibDmbuOtua9e-Y5LVhQicno8TJ60Sc_rfc47Lu28xavs2EFi0b7OtoVIpOjcCtbzo11OJC7pt2Yo956N86k1v3tUv0-Xeme_obGxL9PEEAig7qn2MR6Dj_RaJ2TaA1VyzDOWEu1aIamGNZLSz9RaCyF-M72qEQRHQP0PzwuYzz5nr1Iex7g4fcJs0fnQJdVJHzsdWI2CNlu3k2P92tRZXVBpPBI',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCHwqnNy3s0mTCaz216yoVBkaQ_aidqyDOpsyw0DZzKO6R3m_lgtOJg2dInoRU9wUzOho74SXbqJXhn6lsDWTZd9F5xv2JWjP15InBi17ajeAi5TRkBKZqt44wbhSDr0w4uFhqaC34kCF4Tw5pphQQKIIvhAGF1-ObC2lGRIyxDAzCmYuTT3EhcBS3ZJ-cX3ZsApvpZE2h8E2tVFVBH2MykgmfQ1-5QrjmnUf5WI7eM',
];

const MAIN_IMAGE = 'https://lh3.googleusercontent.com/aida-public/AB6AXuAkm4reedw5ms0OOwoh27x92LNOaifSmv2GyPmmNQJG1618rFtM37nRMuKb-nSr72QRGn1KGYHtLLSZSJHaEO3uO-2ByKdHaktRZfpNv-YUiiifTJCTfgZYnI7zkPAxAk-McHf7DgFflr9Oj5I2m9dnnJzeU6_v4fjhvwaAsvYdlOnBKJD7atPtSFMWgKJqsYQE-jo_jVa_Nc59sXqFvysm3f23dr9zHfk_NNmhkVPq';

const ARTISAN_AVATAR = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCD1HTGzkkUZtim5kfv3p4ooOD0QN80u5mLy7FbQmaJDJs-P8MEgJwyBkJvzAy4HPCIlaG-WDqgiuWxgyLpE-z19tz3IwmJXq5QtUoRucn1ip-V1OKBY2oqurlqAtDCz-jfdJ6uuC7k4Q7lIQ9NtSTW0Mu4CgHgyTzi29UMnRMj_sylWtZ7s1wjcvvBgSCOvsRLd8p-26jhUPZqrHFa3JP-Hj3XA5hsef6Ce2KBwSwt';

const MAKER_AVATAR = 'https://lh3.googleusercontent.com/aida-public/AB6AXuALajplnod2fF_-3x1XNxcoVL5OjEKMMPteoyQdY4zLC5oBHd006pN_VdcyloYCmq5wAjiZT08lTCea7dH0V25H6JjesMwUUyRLA7Dan2mEVTez6sEm9pqgkQ7JN5fqgBirX-zo3gAUZcP-9-dkELROadTvn6b7-pZoE2HzTGauFfHo7zqSyNTFs3UQi2zXD-gKn1IU6jMdEWsau17L5HlaDcct-24LNEqiS4cs1db4';

const REVIEWS: Review[] = [
  {
    id: '1',
    author: 'Sarah K.',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA7u5wVpUlmT78X_WLA-mm7EEGwe0ZloXxX6HmyMrngxlmeIf2q_NebeQ7yEKuvhCLQgXom9-Q0NzzT2oUxLufQLQ4lCDiM90lj1zUR7kgrf31PQwhyn4-os91oYVreOyeRWSOeLUrpJ-h1ZIdQ6K_l4HvWuL6qyFmPf29aWhOJTN_Utci6hDk0n6FIXcZ7jWLuf6GhQiUkLfJ61QkhrcFYeAteAj2YyX6HuWSP_CsZ',
    rating: 5,
    date: '2 days ago',
    text: 'The natural clay texture is breathtaking in morning sunlight. It feels like holding a piece of art rather than a commercial product. The wild daisies stand effortlessly in the fluted folds.',
    verified: true,
  },
];

const SPECS = [
  { label: 'Clay Origin', value: 'Shigaraki Regional Sand Clay' },
  { label: 'Firing Technique', value: 'Noborigama Wood Kiln (Cone 10)' },
  { label: 'Weight', value: '620g (Approx. 1.36 lbs)' },
  { label: 'Stem Capacity', value: '8 - 14 Fresh Wildflower Stems' },
];

const FEATURES = [
  { icon: 'water_drop', label: '100% Watertight Seal' },
  { icon: 'spa', label: 'Non-Toxic Mineral Glaze' },
  { icon: 'local_laundry_service', label: 'Gentle Dishwasher Safe' },
  { icon: 'edit_note', label: 'Hand-Signed Studio Base' },
];

const SHIPPING_FEATURES = [
  {
    icon: 'nest_eco_leaf',
    title: 'Seed Paper Protection',
    desc: 'Wrapped in plantable paper embedded with wildflower seeds. Plant the wrapping in soil to grow daisies.',
  },
  {
    icon: 'all_inclusive',
    title: 'Zero-Break Guarantee',
    desc: 'Custom honeycomb cushion cells protect each piece during transit. If damaged, we craft a replacement free.',
  },
];

const RATING_BREAKDOWN = [
  { stars: 5, percent: 92 },
  { stars: 4, percent: 6 },
  { stars: 3, percent: 2 },
];

const CERTIFICATIONS = [
  { icon: 'energy_savings_leaf', label: 'Carbon Neutral' },
  { icon: 'inventory_2', label: 'Zero Plastic' },
  { icon: 'verified_user', label: 'Living Wage' },
];

const TIMELINE_STEPS = [
  { icon: 'check', title: 'Order Placed & Notified', desc: 'Mei Lin Studio accepted your order', status: 'completed' },
  { icon: 'palette', title: 'Studio Handcrafting & Curing', desc: 'Glaze setting & quality inspection in progress', status: 'active' },
  { icon: 'package_2', title: 'Plastic-Free Dispatch', desc: 'Curled paper & plant-wax sealed parcel', status: 'pending' },
  { icon: 'home', title: 'Delivered to Your Door', desc: 'Signature required upon arrival', status: 'pending' },
];

export function ProductDetailScreen({
  productId,
  onBack,
  onAddToCart,
  onToggleFavorite,
  onShare,
  onOpenArtisan,
  onOpenReviews,
}: {
  productId: string;
  onBack?: () => void;
  onAddToCart: (quantity: number, finish: string, size: string) => void;
  onToggleFavorite: () => void;
  onShare: () => void;
  onOpenArtisan: () => void;
  onOpenReviews: () => void;
}) {
  const theme = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const [selectedFinish, setSelectedFinish] = useState(FINISH_OPTIONS[0].id);
  const [selectedSize, setSelectedSize] = useState(SIZE_OPTIONS[0].id);
  const [activeTab, setActiveTab] = useState<'story' | 'specs' | 'shipping'>('story');
  const [quantity, setQuantity] = useState(1);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showAddedFeedback, setShowAddedFeedback] = useState(false);

  // Animation values for staggered entrance
  const heroAnim = useSharedValue(0);
  const infoAnim = useSharedValue(0);
  const selectorsAnim = useSharedValue(0);
  const tabsAnim = useSharedValue(0);
  const impactAnim = useSharedValue(0);
  const artisanAnim = useSharedValue(0);
  const reviewsAnim = useSharedValue(0);
  const bottomBarAnim = useSharedValue(0);

  useEffect(() => {
    heroAnim.value = withDelay(0, withSpring(1, CARD_SPRING));
    infoAnim.value = withDelay(STAGGER_DELAY, withSpring(1, CARD_SPRING));
    selectorsAnim.value = withDelay(STAGGER_DELAY * 2, withSpring(1, CARD_SPRING));
    tabsAnim.value = withDelay(STAGGER_DELAY * 3, withSpring(1, CARD_SPRING));
    impactAnim.value = withDelay(STAGGER_DELAY * 4, withSpring(1, CARD_SPRING));
    artisanAnim.value = withDelay(STAGGER_DELAY * 5, withSpring(1, CARD_SPRING));
    reviewsAnim.value = withDelay(STAGGER_DELAY * 6, withSpring(1, CARD_SPRING));
    bottomBarAnim.value = withDelay(STAGGER_DELAY * 7, withSpring(1, CARD_SPRING));
  }, []);

  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroAnim.value,
    transform: [{ translateY: withSpring(0, CARD_SPRING) }],
  }));

  const infoStyle = useAnimatedStyle(() => ({
    opacity: infoAnim.value,
    transform: [{ translateY: withSpring(0, CARD_SPRING) }],
  }));

  const selectorsStyle = useAnimatedStyle(() => ({
    opacity: selectorsAnim.value,
    transform: [{ translateY: withSpring(0, CARD_SPRING) }],
  }));

  const tabsStyle = useAnimatedStyle(() => ({
    opacity: tabsAnim.value,
    transform: [{ translateY: withSpring(0, CARD_SPRING) }],
  }));

  const impactStyle = useAnimatedStyle(() => ({
    opacity: impactAnim.value,
    transform: [{ translateY: withSpring(0, CARD_SPRING) }],
  }));

  const artisanStyle = useAnimatedStyle(() => ({
    opacity: artisanAnim.value,
    transform: [{ translateY: withSpring(0, CARD_SPRING) }],
  }));

  const reviewsStyle = useAnimatedStyle(() => ({
    opacity: reviewsAnim.value,
    transform: [{ translateY: withSpring(0, CARD_SPRING) }],
  }));

  const bottomBarStyle = useAnimatedStyle(() => ({
    opacity: bottomBarAnim.value,
    transform: [{ translateY: withSpring(0, CARD_SPRING) }],
  }));

  const handleAddToCart = useCallback(() => {
    const finish = FINISH_OPTIONS.find(f => f.id === selectedFinish)?.colorName ?? 'Natural Sand';
    const size = SIZE_OPTIONS.find(s => s.id === selectedSize)?.label ?? 'Standard Meadow';
    onAddToCart(quantity, finish, size);
    setShowAddedFeedback(true);
    setTimeout(() => setShowAddedFeedback(false), 2200);
  }, [quantity, selectedFinish, selectedSize, onAddToCart]);

  const handleToggleFavorite = useCallback(() => {
    setIsFavorite(prev => !prev);
    onToggleFavorite();
  }, [onToggleFavorite]);

  const renderFinishOption = useCallback(
    ({ item }: { item: FinishOption }) => {
      const isSelected = selectedFinish === item.id;
      return (
        <Pressable
          onPress={() => setSelectedFinish(item.id)}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          accessibilityState={{ selected: isSelected }}
          style={({ pressed }) => [
            styles.finishOption,
            isSelected && styles.finishOptionSelected,
            pressed && styles.pressed,
          ]}
          hitSlop={8}
        >
          <ThemedView
            type={isSelected ? 'primaryFixed' : 'backgroundElement'}
            style={[
              styles.finishSwatch,
              { backgroundColor: item.color },
            ]}
          />
          <ThemedText
            type="labelMd"
            themeColor={isSelected ? 'onPrimaryFixed' : 'textSecondary'}
            style={styles.finishLabel}
          >
            {item.label}
          </ThemedText>
        </Pressable>
      );
    },
    [selectedFinish],
  );

  const renderSizeOption = useCallback(
    ({ item }: { item: SizeOption }) => {
      const isSelected = selectedSize === item.id;
      return (
        <Pressable
          onPress={() => setSelectedSize(item.id)}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          accessibilityState={{ selected: isSelected }}
          style={({ pressed }) => [
            styles.sizeOption,
            isSelected && styles.sizeOptionSelected,
            pressed && styles.pressed,
          ]}
          hitSlop={8}
        >
          <View style={styles.sizeInfo}>
            <ThemedText type="labelMd" themeColor={isSelected ? 'onSecondaryContainer' : 'text'} style={styles.sizeLabel}>
              {item.label}
            </ThemedText>
            <ThemedText type="bodySm" themeColor={isSelected ? 'onSecondaryContainer' : 'textSecondary'} style={styles.sizeDimensions}>
              {item.dimensions}
            </ThemedText>
          </View>
          <ThemedText
            type="labelLg"
            themeColor={isSelected ? 'onSecondaryContainer' : 'textSecondary'}
            style={styles.sizeCheck}
          >
            {isSelected ? '✓' : '○'}
          </ThemedText>
        </Pressable>
      );
    },
    [selectedSize],
  );

  const renderTab = useCallback(
    (tab: { id: 'story' | 'specs' | 'shipping'; label: string }) => {
      const isActive = activeTab === tab.id;
      return (
        <Pressable
          key={tab.id}
          onPress={() => setActiveTab(tab.id)}
          accessibilityRole="tab"
          accessibilityState={{ selected: isActive }}
          style={({ pressed }) => [
            styles.tabButton,
            isActive && styles.tabButtonActive,
            pressed && styles.pressed,
          ]}
          hitSlop={8}
        >
          <ThemedText
            type="labelMd"
            themeColor={isActive ? 'primary' : 'textSecondary'}
            style={styles.tabButtonText}
          >
            {tab.label}
          </ThemedText>
        </Pressable>
      );
    },
    [activeTab],
  );

  const renderReview = useCallback(
    ({ item }: { item: Review }) => (
      <ThemedView type="backgroundElement" style={styles.reviewCard}>
        <View style={styles.reviewHeader}>
          <View style={styles.reviewAuthor}>
            <ThemedView type="backgroundElement" style={styles.reviewAvatar}>
              <ThemedText type="headlineSm" themeColor="textSecondary" style={styles.reviewAvatarText}>
                {item.author.charAt(0)}
              </ThemedText>
            </ThemedView>
            <View style={styles.reviewAuthorInfo}>
              <ThemedText type="labelMd" themeColor="text" style={styles.reviewAuthorName}>
                {item.author}
              </ThemedText>
              {item.verified && (
                <ThemedText type="labelSm" themeColor="primary" style={styles.verifiedBadge}>
                  Verified Collector
                </ThemedText>
              )}
            </View>
          </View>
          <ThemedText type="labelSm" themeColor="textSecondary" style={styles.reviewDate}>
            {item.date}
          </ThemedText>
        </View>
        <View style={styles.reviewStars}>
          {Array.from({ length: 5 }).map((_, i) => (
            <ThemedText key={i} type="labelMd" themeColor={i < item.rating ? 'tertiary' : 'border'} style={styles.star}>
              ★
            </ThemedText>
          ))}
        </View>
        <ThemedText type="bodyMd" themeColor="textSecondary" style={styles.reviewText}>
          {item.text}
        </ThemedText>
      </ThemedView>
    ),
    [],
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: safeAreaInsets.bottom + 140 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View style={[styles.header, heroStyle]}>
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.backButton}
            hitSlop={12}
          >
            <ThemedText type="labelLg" themeColor="text">←</ThemedText>
          </Pressable>
          <ThemedText type="headlineSm" themeColor="text" style={styles.headerTitle}>
            Product Details
          </ThemedText>
          <View style={styles.headerActions}>
            <Pressable
              onPress={onToggleFavorite}
              accessibilityRole="button"
              accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
              style={styles.iconButton}
              hitSlop={12}
            >
              <ThemedText type="labelLg" themeColor={isFavorite ? 'primary' : 'text'} style={styles.favoriteIcon}>
                {isFavorite ? '♥' : '♡'}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={onShare}
              accessibilityRole="button"
              accessibilityLabel="Share product"
              style={styles.iconButton}
              hitSlop={12}
            >
              <ThemedText type="labelLg" themeColor="text">⤴</ThemedText>
            </Pressable>
          </View>
        </Animated.View>

        {/* Hero Gallery */}
        <Animated.View style={[styles.heroSection, heroStyle]}>
          <ThemedView type="backgroundElement" style={styles.heroCard}>
            {/* Status Badges */}
            <View style={styles.statusBadges}>
              <ThemedView type="background" style={styles.statusBadge}>
                <ThemedView type="primary" style={styles.pulseDot} />
                <ThemedText type="labelSm" themeColor="text">Small Batch (Only 6 Left)</ThemedText>
              </ThemedView>
              <ThemedView type="background" style={styles.statusBadge}>
                <ThemedText type="labelSm" themeColor="tertiary" style={styles.ratingBadge}>
                  ★ 4.9 (128)
                </ThemedText>
              </ThemedView>
            </View>

            {/* Main Image */}
            <ThemedView type="backgroundElement" style={styles.mainImageWrapper}>
              <ThemedView type="backgroundElement" style={styles.mainImage}>
                <ThemedText type="headlineMd" themeColor="textSecondary" style={styles.imagePlaceholder}>
                  🏺
                </ThemedText>
              </ThemedView>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Zoom in"
                style={styles.zoomButton}
                hitSlop={12}
              >
                <ThemedText type="labelLg" themeColor="text">🔍</ThemedText>
              </Pressable>
            </ThemedView>

            {/* Thumbnails */}
            <FlatList
              data={THUMBNAIL_IMAGES}
              keyExtractor={(_, i) => String(i)}
              horizontal
              showsHorizontalScrollIndicator={false}
              renderItem={({ item, index }) => {
                const isActive = index === 0;
                return (
                  <Pressable
                    key={index}
                    onPress={() => {}}
                    accessibilityRole="button"
                    accessibilityLabel={`View image ${index + 1}`}
                    style={({ pressed }) => [
                      styles.thumbnail,
                      isActive && styles.thumbnailActive,
                      pressed && styles.pressed,
                    ]}
                    hitSlop={4}
                  >
                    <ThemedView
                      type={isActive ? 'primary' : 'surfaceContainerHigh'}
                      style={[
                        styles.thumbnailInner,
                        isActive && { padding: 2 },
                      ]}
                    >
                      <ThemedView type="backgroundElement" style={styles.thumbnailImage}>
                        <ThemedText type="headlineMd" themeColor="textSecondary" style={styles.imagePlaceholder}>
                          🖼
                        </ThemedText>
                      </ThemedView>
                    </ThemedView>
                  </Pressable>
                );
              }}
              contentContainerStyle={styles.thumbnailsContent}
            />
          </ThemedView>
        </Animated.View>

        {/* Primary Info Block */}
        <Animated.View style={[styles.infoSection, infoStyle]}>
          {/* Studio Attribution */}
          <View style={styles.studioAttribution}>
            <ThemedView type="backgroundElement" style={styles.studioAvatar}>
              <ThemedText type="headlineMd" themeColor="textSecondary" style={styles.imagePlaceholder}>
                👤
              </ThemedText>
            </ThemedView>
            <View style={styles.studioInfo}>
              <ThemedText type="bodySm" themeColor="textSecondary" style={styles.studioName}>
                Clay & Hearth Studio • Kyoto, Japan
              </ThemedText>
              <ThemedText type="bodySm" themeColor="primary" style={styles.verifiedIcon}>
                ✓ Verified
              </ThemedText>
            </View>
          </View>

          {/* Product Title */}
          <ThemedText type="headlineLgMobile" themeColor="text" style={styles.productTitle}>
            Handmade Daisy Ceramic Vase
          </ThemedText>

          {/* Price */}
          <View style={styles.priceRow}>
            <ThemedText type="headlineMd" themeColor="primary" style={styles.currentPrice}>
              $42.50
            </ThemedText>
            <ThemedText type="bodySm" themeColor="textSecondary" style={styles.originalPrice}>
              $58.00
            </ThemedText>
            <ThemedView type="secondaryContainer" style={styles.discountPill}>
              <ThemedText type="labelSm" themeColor="onSecondaryContainer" style={styles.discountText}>
                27% Off
              </ThemedText>
            </ThemedView>
          </View>

          {/* First Order Perk */}
          <ThemedView type="surfaceContainerLow" style={styles.perkCard}>
            <ThemedText type="labelLg" themeColor="primary" style={styles.perkIcon}>
              ⚡
            </ThemedText>
            <ThemedText type="bodySm" themeColor="textSecondary" style={styles.perkText}>
              Eligible for <ThemedText type="bodySm" themeColor="text" style={styles.perkHighlight}>$15 off</ThemedText> with code{' '}
              <ThemedView type="background" style={styles.promoCode}>
                <ThemedText type="labelSm" themeColor="primary" style={styles.promoCodeText}>
                  WELCOME15
                </ThemedText>
              </ThemedView>
            </ThemedText>
          </ThemedView>
        </Animated.View>

        {/* Selectors Section */}
        <Animated.View style={[styles.selectorsSection, selectorsStyle]}>
          {/* Finish Selector */}
          <View style={styles.selectorGroup}>
            <View style={styles.selectorHeader}>
              <ThemedText type="labelLg" themeColor="text" style={styles.selectorLabel}>
                Ceramic Finish
              </ThemedText>
              <ThemedText type="bodySm" themeColor="primary" style={styles.selectedFinishLabel}>
                {FINISH_OPTIONS.find(f => f.id === selectedFinish)?.colorName ?? 'Natural Sand'}
              </ThemedText>
            </View>
            <FlatList
              data={FINISH_OPTIONS}
              keyExtractor={item => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              renderItem={renderFinishOption}
              contentContainerStyle={styles.finishOptionsContent}
            />
          </View>

          {/* Size Selector */}
          <View style={styles.selectorGroup}>
            <View style={styles.selectorHeader}>
              <ThemedText type="labelLg" themeColor="text" style={styles.selectorLabel}>
                Vase Dimensions
              </ThemedText>
              <ThemedText type="bodySm" themeColor="textSecondary" style={styles.selectorSubtext}>
                Wheel-thrown scale
              </ThemedText>
            </View>
            <FlatList
              data={SIZE_OPTIONS}
              keyExtractor={item => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              renderItem={renderSizeOption}
              contentContainerStyle={styles.sizeOptionsContent}
            />
          </View>
        </Animated.View>

        {/* Tabs Section */}
        <Animated.View style={[styles.tabsSection, tabsStyle]}>
          <View style={styles.tabsContainer}>
            {[
              { id: 'story', label: 'Story & Maker' },
              { id: 'specs', label: 'Specifications' },
              { id: 'shipping', label: 'Shipping & Eco Care' },
            ].map(renderTab)}
          </View>

          {/* Tab Content */}
          {activeTab === 'story' && (
            <View style={styles.tabContent}>
              <ThemedText type="bodyMd" themeColor="textSecondary" style={styles.storyText}>
                Hand-thrown from rich Kyoto stoneware clay and fired in a high-temperature wood-burning kiln. The organic petal fluted rim is hand-pinched while the clay is leather-hard, creating a gentle daisy silhouette inspired by Japanese springtime meadow flowers.
              </ThemedText>
              <View style={styles.featuresGrid}>
                {FEATURES.map((feature, i) => (
                  <ThemedView key={i} type="surfaceContainerLow" style={styles.featureCard}>
                    <ThemedText type="labelLg" themeColor="primary" style={styles.featureIcon}>
                      {feature.icon === 'water_drop' ? '💧' : feature.icon === 'spa' ? '🧪' : feature.icon === 'local_laundry_service' ? '🧺' : '✍️'}
                    </ThemedText>
                    <ThemedText type="labelSm" themeColor="text" style={styles.featureLabel}>
                      {feature.label}
                    </ThemedText>
                  </ThemedView>
                ))}
              </View>
            </View>
          )}

          {activeTab === 'specs' && (
            <View style={styles.tabContent}>
              <ThemedView type="surfaceContainerLow" style={styles.specsCard}>
                {SPECS.map((spec, i) => (
                  <View key={i} style={styles.specRow}>
                    <ThemedText type="bodySm" themeColor="textSecondary" style={styles.specLabel}>
                      {spec.label}
                    </ThemedText>
                    <ThemedText type="labelMd" themeColor="text" style={styles.specValue}>
                      {spec.value}
                    </ThemedText>
                  </View>
                ))}
              </ThemedView>
            </View>
          )}

          {activeTab === 'shipping' && (
            <View style={styles.tabContent}>
              <ThemedView type="surfaceContainerLow" style={styles.shippingCard}>
                {SHIPPING_FEATURES.map((feature, i) => (
                  <View key={i} style={styles.shippingFeature}>
                    <ThemedText type="labelLg" themeColor="primary" style={styles.shippingIcon}>
                      {feature.icon === 'nest_eco_leaf' ? '🌱' : '🛡'}
                    </ThemedText>
                    <View style={styles.shippingInfo}>
                      <ThemedText type="labelMd" themeColor="text" style={styles.shippingTitle}>
                        {feature.title}
                      </ThemedText>
                      <ThemedText type="bodySm" themeColor="textSecondary" style={styles.shippingDesc}>
                        {feature.desc}
                      </ThemedText>
                    </View>
                  </View>
                ))}
              </ThemedView>
            </View>
          )}
        </Animated.View>

        {/* Maker Impact */}
        <Animated.View style={[styles.impactSection, impactStyle]}>
          <ThemedView type="surfaceContainer" style={styles.impactCard}>
            <View style={styles.impactHeader}>
              <View style={styles.impactTitleWrapper}>
                <ThemedText type="labelLg" themeColor="primary" style={styles.impactIcon}>
                  🤝
                </ThemedText>
                <ThemedText type="labelMd" themeColor="text" style={styles.impactTitle}>
                  Direct Maker Impact
                </ThemedText>
              </View>
              <ThemedView type="primary" style={styles.impactPercent}>
                <ThemedText type="labelSm" themeColor="onPrimary" style={styles.impactPercentText}>
                  88% to Studio
                </ThemedText>
              </ThemedView>
            </View>
            <ThemedText type="bodySm" themeColor="textSecondary" style={styles.impactDesc}>
              <ThemedText type="bodySm" themeColor="text" style={styles.impactAmount}>
                $37.40
              </ThemedText>{' '}
              of this purchase is routed directly to Mei & Hiro Lin's independent workshop to fund non-toxic kiln fuels and studio apprenticeships.
            </ThemedText>
            <ThemedView type="surfaceContainerHighest" style={styles.impactMeter}>
              <ThemedView type="primary" style={[styles.impactMeterFill, { width: '88%' }]} />
            </ThemedView>
            <View style={styles.certificationsRow}>
              {CERTIFICATIONS.map((cert, i) => (
                <View key={i} style={styles.certItem}>
                  <ThemedText type="labelSm" themeColor="tertiary" style={styles.certIcon}>
                    {cert.icon === 'energy_savings_leaf' ? '🌿' : cert.icon === 'inventory_2' ? '📦' : '✅'}
                  </ThemedText>
                  <ThemedText type="labelSm" themeColor="textSecondary" style={styles.certLabel}>
                    {cert.label}
                  </ThemedText>
                </View>
              ))}
            </View>
          </ThemedView>
        </Animated.View>

        {/* Artisan Profile */}
        <Animated.View style={[styles.artisanSection, artisanStyle]}>
          <ThemedView type="surfaceContainerLow" style={styles.artisanCard}>
            <View style={styles.artisanHeader}>
              <View style={styles.artisanProfile}>
                <ThemedView type="backgroundElement" style={styles.artisanAvatar}>
                  <ThemedText type="headlineMd" themeColor="textSecondary" style={styles.imagePlaceholder}>
                    👥
                  </ThemedText>
                </ThemedView>
                <View style={styles.artisanProfileInfo}>
                  <ThemedText type="headlineSm" themeColor="text" style={styles.artisanNames}>
                    Mei & Hiro Lin
                  </ThemedText>
                  <ThemedText type="bodySm" themeColor="textSecondary" style={styles.artisanTitle}>
                    Master Ceramicists • 14 yrs studio practice
                  </ThemedText>
                </View>
              </View>
            </View>
            <ThemedText type="bodySm" themeColor="textSecondary" style={styles.artisanQuote}>
              "Each vase is shaped individually on the wheel — no two petal rims are identical. It carries the pulse of morning calm into your home."
            </ThemedText>
            <CraftPressButton
              label="Ask the Makers a Question"
              variant="outline"
              style={styles.askButton}
              onPress={onOpenArtisan}
            >
              <ThemedText type="labelMd" themeColor="primary" style={styles.askButtonIcon}>
                💬
              </ThemedText>
            </CraftPressButton>
          </ThemedView>
        </Animated.View>

        {/* Reviews */}
        <Animated.View style={[styles.reviewsSection, reviewsStyle]}>
          <View style={styles.reviewsHeader}>
            <ThemedText type="headlineSm" themeColor="text" style={styles.reviewsTitle}>
              Collector Reviews
            </ThemedText>
            <Pressable
              onPress={onOpenReviews}
              accessibilityRole="button"
              accessibilityLabel="See all 128 reviews"
              style={styles.viewAllButton}
              hitSlop={8}
            >
              <ThemedText type="labelMd" themeColor="primary" style={styles.viewAllText}>
                See all 128 →
              </ThemedText>
            </Pressable>
          </View>
          <ThemedView type="surfaceContainerLow" style={styles.ratingSummary}>
            <View style={styles.ratingOverview}>
              <ThemedText type="headlineLgMobile" themeColor="text" style={styles.overallRating}>
                4.9
              </ThemedText>
              <View style={styles.starsRow}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <ThemedText key={i} type="labelMd" themeColor="tertiary" style={styles.star}>
                    ★
                  </ThemedText>
                ))}
              </View>
              <ThemedText type="labelSm" themeColor="textSecondary" style={styles.verifiedBuyers}>
                Verified Buyers
              </ThemedText>
            </View>
            <View style={styles.ratingBars}>
              {RATING_BREAKDOWN.map((rating, i) => (
                <View key={i} style={styles.ratingBarRow}>
                  <ThemedText type="labelSm" themeColor="textSecondary" style={styles.barLabel}>
                    {rating.stars}
                  </ThemedText>
                  <ThemedView type="surfaceContainer" style={styles.barTrack}>
                    <ThemedView type="primary" style={[styles.barFill, { width: `${rating.percent}%` }]} />
                  </ThemedView>
                  <ThemedText type="labelSm" themeColor="textSecondary" style={styles.barPercent}>
                    {rating.percent}%
                  </ThemedText>
                </View>
              ))}
            </View>
          </ThemedView>
          <FlatList
            data={REVIEWS}
            keyExtractor={item => item.id}
            renderItem={renderReview}
            ListFooterComponent={() => (
              <ThemedView type="surfaceContainer" style={styles.reviewHighlight}>
                <View style={styles.reviewHighlightHeader}>
                  <View style={styles.reviewHighlightAuthor}>
                    <ThemedText type="labelMd" themeColor="text" style={styles.reviewHighlightName}>
                      Sarah K.
                    </ThemedText>
                    <ThemedView type="secondaryContainer" style={styles.verifiedBadgeHighlight}>
                      <ThemedText type="labelSm" themeColor="onSecondaryContainer" style={styles.verifiedBadgeText}>
                        Verified Collector
                      </ThemedText>
                    </ThemedView>
                  </View>
                  <ThemedText type="labelSm" themeColor="textSecondary" style={styles.reviewHighlightDate}>
                    2 days ago
                  </ThemedText>
                </View>
                <ThemedText type="bodyMd" themeColor="textSecondary" style={styles.reviewHighlightText}>
                  "The natural clay texture is breathtaking in morning sunlight. It feels like holding a piece of art rather than a commercial product. The wild daisies stand effortlessly in the fluted folds."
                </ThemedText>
              </ThemedView>
            )}
          />
        </Animated.View>
      </ScrollView>

      {/* Sticky Bottom Bar */}
      <Animated.View style={[styles.bottomBar, bottomBarStyle]}>
        <ThemedView type="background" style={styles.bottomBarInner}>
          <View style={styles.quantityStepper}>
            <Pressable
              onPress={() => setQuantity(Math.max(1, quantity - 1))}
              accessibilityRole="button"
              accessibilityLabel="Decrease quantity"
              style={styles.qtyButton}
              hitSlop={8}
            >
              <ThemedText type="labelLg" themeColor="text">−</ThemedText>
            </Pressable>
            <ThemedText type="labelLg" themeColor="text" style={styles.qtyValue}>
              {quantity}
            </ThemedText>
            <Pressable
              onPress={() => setQuantity(Math.min(6, quantity + 1))}
              accessibilityRole="button"
              accessibilityLabel="Increase quantity"
              style={styles.qtyButton}
              hitSlop={8}
            >
              <ThemedText type="labelLg" themeColor="text">+</ThemedText>
            </Pressable>
          </View>
          <CraftPressButton
            label={showAddedFeedback ? 'Added to Artisan Basket!' : `Add to Bag • $${(42.50 * quantity).toFixed(2)}`}
            variant="primary"
            loading={showAddedFeedback}
            style={styles.addToCartButton}
            onPress={showAddedFeedback ? undefined : handleAddToCart}
            textStyle={{ color: theme.background }}
          >
            {showAddedFeedback && (
              <ThemedText type="labelLg" themeColor="onPrimary" style={styles.addedIcon}>
                ✓
              </ThemedText>
            )}
          </CraftPressButton>
          <Pressable
            onPress={handleToggleFavorite}
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? 'Remove from wishlist' : 'Add to wishlist'}
            style={styles.favoriteButton}
            hitSlop={8}
          >
            <ThemedText type="labelLg" themeColor={isFavorite ? 'primary' : 'text'} style={styles.favoriteButtonIcon}>
              {isFavorite ? '♥' : '♡'}
            </ThemedText>
          </Pressable>
          <ThemedText type="labelSm" themeColor="textSecondary" style={styles.trustText}>
            🚚 Hand-packed with care • Free 30-day artisan return guarantee
          </ThemedText>
        </ThemedView>
      </Animated.View>
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
  headerTitle: {
    fontSize: FontSizes.headlineSm,
    lineHeight: LineHeights.headlineSm,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.serif,
    letterSpacing: LetterSpacings.headlineSm,
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
    backgroundColor: Colors.light.backgroundElement,
  },
  favoriteIcon: {
    fontSize: 22,
  },
  heroSection: {
    paddingHorizontal: Spacing.margin,
  },
  heroCard: {
    borderRadius: CraftRadii.xl,
    overflow: 'hidden',
    backgroundColor: Colors.light.surfaceContainerLow,
  },
  statusBadges: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: CraftRadii.pill,
    backgroundColor: Colors.light.backgroundElement,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.light.primary,
  },
  ratingBadge: {
    fontWeight: FontWeights.semibold,
  },
  mainImageWrapper: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1,
  },
  mainImage: {
    width: '100%',
    height: '100%',
    borderRadius: CraftRadii.xl,
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 48,
  },
  zoomButton: {
    position: 'absolute',
    bottom: Spacing.md,
    right: Spacing.md,
    width: 40,
    height: 40,
    borderRadius: CraftRadii.pill,
    backgroundColor: Colors.light.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailsContent: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: CraftRadii.md,
    overflow: 'hidden',
  },
  thumbnailActive: {
    borderWidth: 2,
    borderColor: Colors.light.primary,
    padding: 2,
  },
  thumbnailInner: {
    width: '100%',
    height: '100%',
    borderRadius: CraftRadii.sm,
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  infoSection: {
    paddingHorizontal: Spacing.margin,
    gap: Spacing.md,
  },
  studioAttribution: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  studioAvatar: {
    width: 40,
    height: 40,
    borderRadius: CraftRadii.pill,
    overflow: 'hidden',
  },
  studioInfo: {
    gap: 2,
  },
  studioName: {
    fontSize: FontSizes.bodySm,
    lineHeight: LineHeights.bodySm,
    fontFamily: Fonts.sans,
  },
  verifiedIcon: {
    fontSize: FontSizes.labelSm,
    lineHeight: LineHeights.labelSm,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelSm,
  },
  productTitle: {
    fontSize: FontSizes.headlineLgMobile,
    lineHeight: LineHeights.headlineLgMobile,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.serif,
    letterSpacing: LetterSpacings.headlineLg,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  currentPrice: {
    fontSize: FontSizes.headlineMd,
    lineHeight: LineHeights.headlineMd,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.headlineMd,
  },
  originalPrice: {
    textDecorationLine: 'line-through',
    fontSize: FontSizes.bodySm,
    lineHeight: LineHeights.bodySm,
    fontFamily: Fonts.sans,
  },
  discountPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: CraftRadii.pill,
  },
  discountText: {
    fontSize: FontSizes.labelSm,
    lineHeight: LineHeights.labelSm,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelSm,
  },
  perkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: CraftRadii.md,
  },
  perkIcon: {
    fontSize: 20,
  },
  perkText: {
    flex: 1,
    fontSize: FontSizes.bodySm,
    lineHeight: LineHeights.bodySm,
    fontFamily: Fonts.sans,
  },
  perkHighlight: {
    fontWeight: FontWeights.semibold,
  },
  promoCode: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: CraftRadii.sm,
  },
  promoCodeText: {
    fontSize: FontSizes.labelSm,
    lineHeight: LineHeights.labelSm,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelSm,
  },
  selectorsSection: {
    paddingHorizontal: Spacing.margin,
    gap: Spacing.lg,
  },
  selectorGroup: {
    gap: Spacing.sm,
  },
  selectorHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  selectorLabel: {
    fontSize: FontSizes.labelLg,
    lineHeight: LineHeights.labelLg,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelLg,
  },
  selectorSubtext: {
    fontSize: FontSizes.bodySm,
    lineHeight: LineHeights.bodySm,
    fontFamily: Fonts.sans,
  },
  selectedFinishLabel: {
    fontSize: FontSizes.bodySm,
    lineHeight: LineHeights.bodySm,
    fontWeight: FontWeights.medium,
    fontFamily: Fonts.sans,
  },
  finishOptionsContent: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  finishOption: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: Spacing.xs,
    padding: Spacing.md,
    borderRadius: CraftRadii.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundElement,
    minWidth: 80,
  },
  finishOptionSelected: {
    backgroundColor: Colors.light.primaryFixed,
    borderColor: Colors.light.primary,
  },
  finishSwatch: {
    width: 32,
    height: 32,
    borderRadius: CraftRadii.pill,
  },
  finishLabel: {
    fontSize: FontSizes.labelMd,
    lineHeight: LineHeights.labelMd,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelMd,
  },
  sizeOptionsContent: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  sizeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: CraftRadii.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundElement,
    minWidth: 140,
  },
  sizeOptionSelected: {
    backgroundColor: Colors.light.secondaryContainer,
    borderColor: Colors.light.secondary,
  },
  sizeInfo: {
    flex: 1,
    gap: 2,
  },
  sizeLabel: {
    fontSize: FontSizes.labelMd,
    lineHeight: LineHeights.labelMd,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelMd,
  },
  sizeDimensions: {
    fontSize: FontSizes.bodySm,
    lineHeight: LineHeights.bodySm,
    fontFamily: Fonts.sans,
  },
  sizeCheck: {
    fontSize: FontSizes.labelLg,
    lineHeight: LineHeights.labelLg,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelLg,
  },
  tabsSection: {
    paddingHorizontal: Spacing.margin,
    gap: Spacing.md,
  },
  tabsContainer: {
    flexDirection: 'row',
    gap: Spacing.xs,
    padding: Spacing.xs,
    borderRadius: CraftRadii.pill,
    backgroundColor: Colors.light.surfaceContainerLow,
    overflowX: 'auto',
  },
  tabButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: CraftRadii.pill,
    minWidth: 100,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: Colors.light.background,
    shadowColor: '#2D2421',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  tabButtonText: {
    fontSize: FontSizes.labelMd,
    lineHeight: LineHeights.labelMd,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelMd,
  },
  tabContent: {
    gap: Spacing.md,
  },
  storyText: {
    fontSize: FontSizes.bodyMd,
    lineHeight: LineHeights.bodyMd,
    fontFamily: Fonts.sans,
    fontStyle: 'italic',
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: CraftRadii.md,
    flex: 1,
    minWidth: '45%',
  },
  featureIcon: {
    fontSize: 20,
  },
  featureLabel: {
    fontSize: FontSizes.labelSm,
    lineHeight: LineHeights.labelSm,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelSm,
  },
  specsCard: {
    padding: Spacing.md,
    borderRadius: CraftRadii.md,
    gap: Spacing.sm,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  specLabel: {
    fontSize: FontSizes.bodySm,
    lineHeight: LineHeights.bodySm,
    fontFamily: Fonts.sans,
  },
  specValue: {
    fontSize: FontSizes.labelMd,
    lineHeight: LineHeights.labelMd,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelMd,
  },
  shippingCard: {
    padding: Spacing.md,
    borderRadius: CraftRadii.md,
    gap: Spacing.md,
  },
  shippingFeature: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  shippingIcon: {
    fontSize: 22,
    marginTop: 2,
  },
  shippingInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  shippingTitle: {
    fontSize: FontSizes.labelMd,
    lineHeight: LineHeights.labelMd,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelMd,
  },
  shippingDesc: {
    fontSize: FontSizes.bodySm,
    lineHeight: LineHeights.bodySm,
    fontFamily: Fonts.sans,
  },
  impactSection: {
    paddingHorizontal: Spacing.margin,
  },
  impactCard: {
    padding: Spacing.md,
    borderRadius: CraftRadii.lg,
    gap: Spacing.md,
  },
  impactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  impactTitleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  impactIcon: {
    fontSize: 20,
  },
  impactTitle: {
    fontSize: FontSizes.labelMd,
    lineHeight: LineHeights.labelMd,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelMd,
  },
  impactPercent: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: CraftRadii.pill,
  },
  impactPercentText: {
    fontSize: FontSizes.labelSm,
    lineHeight: LineHeights.labelSm,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelSm,
  },
  impactDesc: {
    fontSize: FontSizes.bodySm,
    lineHeight: LineHeights.bodySm,
    fontFamily: Fonts.sans,
  },
  impactAmount: {
    fontWeight: FontWeights.semibold,
  },
  impactMeter: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  impactMeterFill: {
    height: '100%',
    borderRadius: 2,
  },
  certificationsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingTop: Spacing.xs,
  },
  certItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  certIcon: {
    fontSize: 16,
  },
  certLabel: {
    fontSize: FontSizes.labelSm,
    lineHeight: LineHeights.labelSm,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelSm,
  },
  artisanSection: {
    paddingHorizontal: Spacing.margin,
  },
  artisanCard: {
    padding: Spacing.md,
    borderRadius: CraftRadii.lg,
    gap: Spacing.md,
  },
  artisanHeader: {
    gap: Spacing.md,
  },
  artisanProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  artisanAvatar: {
    width: 48,
    height: 48,
    borderRadius: CraftRadii.pill,
    overflow: 'hidden',
  },
  artisanProfileInfo: {
    gap: 2,
  },
  artisanNames: {
    fontSize: FontSizes.headlineSm,
    lineHeight: LineHeights.headlineSm,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.serif,
    letterSpacing: LetterSpacings.headlineSm,
  },
  artisanTitle: {
    fontSize: FontSizes.bodySm,
    lineHeight: LineHeights.bodySm,
    fontFamily: Fonts.sans,
  },
  artisanQuote: {
    fontSize: FontSizes.bodySm,
    lineHeight: LineHeights.bodySm,
    fontFamily: Fonts.sans,
    fontStyle: 'italic',
    padding: Spacing.md,
    borderRadius: CraftRadii.md,
    backgroundColor: Colors.light.background,
  },
  askButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: CraftRadii.pill,
  },
  askButtonIcon: {
    fontSize: 18,
  },
  reviewsSection: {
    paddingHorizontal: Spacing.margin,
    gap: Spacing.md,
  },
  reviewsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reviewsTitle: {
    fontSize: FontSizes.headlineSm,
    lineHeight: LineHeights.headlineSm,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.serif,
    letterSpacing: LetterSpacings.headlineSm,
  },
  viewAllButton: {
    paddingVertical: Spacing.xs,
  },
  viewAllText: {
    fontSize: FontSizes.labelMd,
    lineHeight: LineHeights.labelMd,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelMd,
  },
  ratingSummary: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.lg,
    padding: Spacing.md,
    borderRadius: CraftRadii.lg,
  },
  ratingOverview: {
    gap: Spacing.xs,
    alignItems: 'center',
  },
  overallRating: {
    fontSize: FontSizes.headlineLgMobile,
    lineHeight: LineHeights.headlineLgMobile,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.serif,
    letterSpacing: LetterSpacings.headlineLg,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  star: {
    fontSize: 16,
  },
  verifiedBuyers: {
    fontSize: FontSizes.labelSm,
    lineHeight: LineHeights.labelSm,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelSm,
  },
  ratingBars: {
    flex: 1,
    gap: Spacing.xs,
  },
  ratingBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  barLabel: {
    width: 16,
    fontSize: FontSizes.labelSm,
    lineHeight: LineHeights.labelSm,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelSm,
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  barPercent: {
    width: 32,
    textAlign: 'right',
    fontSize: FontSizes.labelSm,
    lineHeight: LineHeights.labelSm,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelSm,
  },
  reviewCard: {
    padding: Spacing.md,
    borderRadius: CraftRadii.md,
    gap: Spacing.sm,
    backgroundColor: Colors.light.backgroundElement,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  reviewAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  reviewAvatar: {
    width: 32,
    height: 32,
    borderRadius: CraftRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewAvatarText: {
    fontSize: FontSizes.headlineSm,
    lineHeight: LineHeights.headlineSm,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.serif,
    letterSpacing: LetterSpacings.headlineSm,
  },
  reviewAuthorInfo: {
    gap: 2,
  },
  reviewAuthorName: {
    fontSize: FontSizes.labelMd,
    lineHeight: LineHeights.labelMd,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelMd,
  },
  verifiedBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 1,
    borderRadius: CraftRadii.pill,
    fontSize: FontSizes.labelSm,
    lineHeight: LineHeights.labelSm,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelSm,
  },
  reviewDate: {
    fontSize: FontSizes.labelSm,
    lineHeight: LineHeights.labelSm,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelSm,
  },
  reviewStars: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewText: {
    fontSize: FontSizes.bodyMd,
    lineHeight: LineHeights.bodyMd,
    fontFamily: Fonts.sans,
  },
  reviewHighlight: {
    padding: Spacing.md,
    borderRadius: CraftRadii.md,
    gap: Spacing.md,
  },
  reviewHighlightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reviewHighlightAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  reviewHighlightName: {
    fontSize: FontSizes.labelMd,
    lineHeight: LineHeights.labelMd,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelMd,
  },
  verifiedBadgeHighlight: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: CraftRadii.pill,
  },
  verifiedBadgeText: {
    fontSize: FontSizes.labelSm,
    lineHeight: LineHeights.labelSm,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelSm,
  },
  reviewHighlightDate: {
    fontSize: FontSizes.labelSm,
    lineHeight: LineHeights.labelSm,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelSm,
  },
  reviewHighlightText: {
    fontSize: FontSizes.bodyMd,
    lineHeight: LineHeights.bodyMd,
    fontFamily: Fonts.sans,
    fontStyle: 'italic',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  bottomBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    paddingHorizontal: Spacing.margin,
    paddingBottom: Spacing.lg,
    backgroundColor: Colors.light.background,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    shadowColor: '#2D2421',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  quantityStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.light.surfaceContainerHigh,
    borderRadius: CraftRadii.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    minWidth: 104,
  },
  qtyButton: {
    width: 40,
    height: 40,
    borderRadius: CraftRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: {
    fontSize: FontSizes.labelLg,
    lineHeight: LineHeights.labelLg,
    fontWeight: FontWeights.semibold,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelLg,
    paddingHorizontal: Spacing.sm,
  },
  addToCartButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: CraftRadii.pill,
  },
  addedIcon: {
    marginLeft: Spacing.sm,
  },
  favoriteButton: {
    width: 50,
    height: 50,
    borderRadius: CraftRadii.pill,
    backgroundColor: Colors.light.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteButtonIcon: {
    fontSize: 22,
  },
  trustText: {
    textAlign: 'center',
    paddingTop: Spacing.xs,
    fontSize: FontSizes.labelSm,
    lineHeight: LineHeights.labelSm,
    fontFamily: Fonts.sans,
    letterSpacing: LetterSpacings.labelSm,
  },
  pressed: {
    opacity: 0.7,
  },
});

export default ProductDetailScreen;