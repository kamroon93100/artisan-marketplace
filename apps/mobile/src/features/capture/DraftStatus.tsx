import { StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import type { LocalProductState } from '@/storage/product-drafts';

type Props = {
  state: LocalProductState;
  syncing: boolean;
  hasAttention: boolean;
  /**
   * Live byte progress for the in-flight upload, when one is running.
   * The artisan can otherwise not tell an upload apart from a stall.
   */
  uploading?: {
    bytesSent: number;
    totalBytes: number;
  } | null;
};

function formatPercent(progress: {
  bytesSent: number;
  totalBytes: number;
}): string {
  if (
    !Number.isFinite(progress.totalBytes) ||
    progress.totalBytes <= 0
  ) {
    return 'Uploading';
  }

  const ratio = Math.min(
    Math.max(progress.bytesSent / progress.totalBytes, 0),
    1,
  );

  return `Uploading ${Math.floor(ratio * 100)}%`;
}

export function DraftStatus({
  state,
  syncing,
  hasAttention,
  uploading,
}: Props) {
  const text = hasAttention
    ? 'Needs attention'
    : uploading
      ? formatPercent(uploading)
      : syncing
        ? 'Syncing'
        : state === 'SYNCED'
          ? 'Synced'
          : state === 'PENDING_SYNC'
            ? 'Waiting to sync'
            : 'Saved on this phone';

  return (
    <View style={styles.container}>
      <View style={styles.dot} />
      <Text
        style={styles.text}
        accessibilityRole="text"
        accessibilityLiveRegion="polite">
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  dot: {
    backgroundColor: Colors.light.textSecondary,
    borderRadius: 99,
    height: 8,
    width: 8,
  },
  text: {
    color: Colors.light.textSecondary,
    fontSize: 14,
  },
});
