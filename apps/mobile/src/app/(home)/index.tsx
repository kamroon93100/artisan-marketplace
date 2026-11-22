import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing, CraftRadii } from '@/constants/theme';
import { useAuth } from '@/features/auth/session-provider';
import { inquiryHistoryAction } from '@/features/inquiry/inquiry-navigation';
import {
  listLocalProductDrafts,
  type LocalProductDraft,
} from '@/storage/product-drafts';
import { DiscoveryScreen } from '@/features/discovery/DiscoveryScreen';

export default function HomeScreen() {
  const [draft, setDraft] = useState<LocalProductDraft | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const { state, signOut } = useAuth();
  const questions = inquiryHistoryAction();

  const ownerId = state.session?.actorId ?? null;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setDraft(null);

      if (!ownerId) {
        return () => {
          cancelled = true;
        };
      }

      void listLocalProductDrafts(ownerId)
        .then((drafts) => {
          if (!cancelled) setDraft(drafts[0] ?? null);
        })
        .catch(() => {
          if (!cancelled) setDraft(null);
        });

      return () => {
        cancelled = true;
      };
    }, [ownerId]),
  );

  async function confirmSignOut(): Promise<void> {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  const handleOpenProduct = (productId: string) => {
    router.push({
      pathname: '/product/[productId]',
      params: { productId },
    } as any);
  };

  function openNewProduct(): void {
    router.push('/create' as any);
  }

  function continueDraft(): void {
    if (!draft) return;
    router.push({
      pathname: '/create',
      params: { draftId: draft.localId },
    } as any);
  }

  return (
    <View style={styles.container}>
      <DiscoveryScreen onOpenProduct={handleOpenProduct} />

      <View style={styles.account}>
        <View style={styles.accountCopy}>
          <Text style={styles.accountLabel}>SIGNED IN AS</Text>
          <Text style={styles.accountName}>
            {state.session?.username ?? 'Not signed in'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={signingOut}
          onPress={() => void confirmSignOut()}
          style={styles.signOut}>
          <Text style={styles.signOutText}>
            {signingOut ? 'Signing out...' : 'Sign out'}
          </Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={questions.accessibilityLabel}
        onPress={() => router.push(questions.href)}
        style={({ pressed }) => [styles.questions, pressed && styles.pressed]}>
        <View style={styles.questionsCopy}>
          <Text style={styles.questionsTitle}>{questions.title}</Text>
          <Text style={styles.questionsText}>{questions.subtitle}</Text>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={openNewProduct}
        style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
        <Text style={styles.primaryText}>Create Product</Text>
      </Pressable>

      {draft ? (
        <Pressable
          accessibilityRole="button"
          onPress={continueDraft}
          style={({ pressed }) => [styles.existing, pressed && styles.pressed]}>
          <View style={styles.existingCopy}>
            <Text style={styles.existingTitle}>Continue your latest draft</Text>
            <Text style={styles.existingText}>Saved on this phone</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  account: {
    alignItems: 'center',
    borderColor: Colors.light.backgroundSelected,
    borderRadius: CraftRadii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  accountCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  accountLabel: {
    color: Colors.light.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  accountName: {
    color: Colors.light.text,
    fontSize: 16,
    fontWeight: '700',
  },
  arrow: {
    color: Colors.light.text,
    fontSize: 22,
  },
  container: {
    backgroundColor: Colors.light.background,
    flex: 1,
    justifyContent: 'space-between',
    padding: Spacing.lg,
    paddingBottom: Spacing['2xl'],
  },
  existing: {
    alignItems: 'center',
    borderColor: Colors.light.backgroundSelected,
    borderRadius: CraftRadii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  existingCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  existingText: {
    color: Colors.light.textSecondary,
    fontSize: 13,
  },
  existingTitle: {
    color: Colors.light.text,
    fontSize: 16,
    fontWeight: '700',
  },
  primary: {
    alignItems: 'center',
    backgroundColor: Colors.light.text,
    borderRadius: CraftRadii.lg,
    paddingVertical: Spacing.lg,
  },
  primaryText: {
    color: Colors.light.background,
    fontSize: 17,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.7,
  },
  questions: {
    alignItems: 'center',
    borderColor: Colors.light.backgroundSelected,
    borderRadius: CraftRadii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  questionsCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  questionsText: {
    color: Colors.light.textSecondary,
    fontSize: 13,
  },
  questionsTitle: {
    color: Colors.light.text,
    fontSize: 16,
    fontWeight: '700',
  },
  signOut: {
    borderRadius: CraftRadii.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  signOutText: {
    color: Colors.light.text,
    fontSize: 14,
    fontWeight: '700',
  },
});