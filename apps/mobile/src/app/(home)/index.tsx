import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';

import { Colors, Spacing } from '@/constants/theme';
import { CreateProductScreen } from '@/features/capture/CreateProductScreen';
import { useAuth } from '@/features/auth/session-provider';
import { inquiryHistoryAction } from '@/features/inquiry/inquiry-navigation';
import {
  createLocalProductDraft,
  listLocalProductDrafts,
  type LocalProductDraft,
} from '@/storage/product-drafts';

export default function HomeScreen() {
  const [draft, setDraft] =
    useState<LocalProductDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const [active, setActive] = useState(false);
  const { state, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const questions = inquiryHistoryAction();

  /**
   * Local drafts are owned by the authenticated server actor. Without a
   * session there is no owner to read or write them for, and guessing one
   * would either expose another account's work or create an unowned row.
   */
  const ownerId = state.session?.actorId ?? null;

  async function loadLatest(owner: string): Promise<void> {
    const drafts = await listLocalProductDrafts(owner);
    setDraft(drafts[0] ?? null);
  }

  useEffect(() => {
    let cancelled = false;

    // Clear immediately so a draft from the previous account is never
    // shown while the new account's records are being read.
    setDraft(null);
    setActive(false);

    if (!ownerId) {
      return;
    }

    void listLocalProductDrafts(ownerId).then((drafts) => {
      if (!cancelled) {
        setDraft(drafts[0] ?? null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  async function startCreate(): Promise<void> {
    if (!ownerId) {
      return;
    }

    setCreating(true);

    try {
      const next = await createLocalProductDraft(ownerId);
      setDraft(next);
      setActive(true);
    } finally {
      setCreating(false);
    }
  }

  async function confirmSignOut(): Promise<void> {
    setSigningOut(true);

    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  if (active && draft && ownerId) {
    return (
      <CreateProductScreen
        draftId={draft.localId}
        ownerId={ownerId}
        onBack={() => {
          setActive(false);
          void loadLatest(ownerId);
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>ARTISAN CATALOG</Text>
        <Text style={styles.title}>
          Make a product draft.
        </Text>
        <Text style={styles.subtitle}>
          Take one photo. Record your description. We�ll save
          the work on this phone first.
        </Text>
      </View>

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
            {signingOut ? 'Signing out…' : 'Sign out'}
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
        disabled={creating}
        onPress={() => void startCreate()}
        style={styles.primary}>
        <Text style={styles.primaryText}>
          {creating ? 'Creating�' : 'Create Product'}
        </Text>
      </Pressable>

      {draft ? (
        <Pressable
          onPress={() => setActive(true)}
          style={styles.existing}>
          <View style={styles.existingCopy}>
            <Text style={styles.existingTitle}>
              Continue your latest draft
            </Text>
            <Text style={styles.existingText}>
              Saved on this phone
            </Text>
          </View>
          <Text style={styles.arrow}>?</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  account: {
    alignItems: 'center',
    borderColor: Colors.light.backgroundSelected,
    borderRadius: Spacing.three,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  accountCopy: {
    flex: 1,
    gap: Spacing.one,
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
    padding: Spacing.four,
    paddingBottom: Spacing.six,
  },
  copy: {
    gap: Spacing.three,
    paddingTop: Spacing.six,
  },
  eyebrow: {
    color: Colors.light.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  existing: {
    alignItems: 'center',
    borderColor: Colors.light.backgroundSelected,
    borderRadius: Spacing.three,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  existingCopy: {
    flex: 1,
    gap: Spacing.one,
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
    borderRadius: Spacing.three,
    paddingVertical: Spacing.four,
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
    borderRadius: Spacing.three,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  questionsCopy: {
    flex: 1,
    gap: Spacing.one,
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
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  signOutText: {
    color: Colors.light.text,
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.light.textSecondary,
    fontSize: 16,
    lineHeight: 24,
  },
  title: {
    color: Colors.light.text,
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1,
  },
});
