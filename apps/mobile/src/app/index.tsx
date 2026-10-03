import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';

import { Colors, Spacing } from '@/constants/theme';
import { CreateProductScreen } from '@/features/capture/CreateProductScreen';
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

  async function loadLatest(): Promise<void> {
    const drafts = await listLocalProductDrafts();
    setDraft(drafts[0] ?? null);
  }

  useEffect(() => {
    void loadLatest();
  }, []);

  async function startCreate(): Promise<void> {
    setCreating(true);

    try {
      const next = await createLocalProductDraft();
      setDraft(next);
      setActive(true);
    } finally {
      setCreating(false);
    }
  }

  if (active && draft) {
    return (
      <CreateProductScreen
        draftId={draft.localId}
        onBack={() => {
          setActive(false);
          void loadLatest();
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
          Take one photo. Record your description. We’ll save
          the work on this phone first.
        </Text>
      </View>

      <Pressable
        disabled={creating}
        onPress={() => void startCreate()}
        style={styles.primary}>
        <Text style={styles.primaryText}>
          {creating ? 'Creating…' : 'Create Product'}
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
