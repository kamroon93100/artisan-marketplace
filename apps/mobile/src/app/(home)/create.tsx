import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/session-provider';
import { CreateProductScreen } from '@/features/capture/CreateProductScreen';
import {
  createLocalProductDraft,
  getLocalProductDraft,
  type LocalProductDraft,
} from '@/storage/product-drafts';

export default function CreateProductRoute() {
  const { state } = useAuth();
  const params = useLocalSearchParams<{ draftId?: string }>();
  const requestedDraftId =
    typeof params.draftId === 'string' ? params.draftId : undefined;

  const ownerId = state.session?.actorId ?? null;
  const [draft, setDraft] = useState<LocalProductDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setDraft(null);
    setError(null);

    if (!ownerId) {
      setError('Sign in before creating a product.');
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const nextDraft = requestedDraftId
        ? await getLocalProductDraft(ownerId, requestedDraftId)
        : await createLocalProductDraft(ownerId);

      if (!nextDraft) {
        throw new Error('This saved draft could not be found for your account.');
      }

      if (!cancelled) setDraft(nextDraft);
    })().catch((cause: unknown) => {
      if (!cancelled) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not load your product draft.',
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [ownerId, requestedDraftId]);

  if (!ownerId || error) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>
          {error ?? 'Sign in before creating a product.'}
        </Text>
        <Text style={styles.back} onPress={() => router.replace('/' as any)}>
          Go back
        </Text>
      </View>
    );
  }

  if (!draft) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.light.text} />
        <Text style={styles.message}>Preparing your product draft...</Text>
      </View>
    );
  }

  return (
    <CreateProductScreen
      draftId={draft.localId}
      ownerId={ownerId}
      onBack={() => router.replace('/' as any)}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
    backgroundColor: Colors.light.background,
  },
  message: {
    color: Colors.light.text,
    fontSize: 15,
    textAlign: 'center',
  },
  back: {
    color: Colors.light.text,
    fontSize: 15,
    fontWeight: '700',
    padding: Spacing.md,
  },
});