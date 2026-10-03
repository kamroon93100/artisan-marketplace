import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

import { Colors, Spacing } from '@/constants/theme';

type Props = {
  uri: string | null;
  onRecorded: (uri: string) => Promise<void>;
};

export function VoiceRecorder({ uri, onRecorded }: Props) {
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    directory: 'document',
  });
  const state = useAudioRecorderState(recorder);
  const player = useAudioPlayer(uri);
  const playerStatus = useAudioPlayerStatus(player);

  async function startRecording(): Promise<void> {
    const permission =
      await requestRecordingPermissionsAsync();

    if (!permission.granted) {
      return;
    }

    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  async function stopRecording(): Promise<void> {
    await recorder.stop();

    if (recorder.uri) {
      await onRecorded(recorder.uri);
    }
  }

  function togglePlayback(): void {
    if (playerStatus.playing) {
      player.pause();
    } else {
      player.play();
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Voice description</Text>
      <Text style={styles.hint}>
        Record how you would describe this product.
      </Text>

      <View style={styles.controls}>
        {state.isRecording ? (
          <Pressable
            style={styles.primary}
            onPress={() => void stopRecording()}>
            <Text style={styles.primaryText}>Stop recording</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.primary}
            onPress={() => void startRecording()}>
            <Text style={styles.primaryText}>
              {uri ? 'Record again' : 'Start recording'}
            </Text>
          </Pressable>
        )}

        {uri ? (
          <Pressable
            style={styles.secondary}
            onPress={togglePlayback}>
            <Text style={styles.secondaryText}>
              {playerStatus.playing ? 'Pause' : 'Play'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.duration}>
        {state.isRecording
          ? `Recording ${Math.round(state.durationMillis / 1000)}s`
          : uri
            ? 'Voice description saved'
            : 'No voice description yet'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  controls: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  duration: {
    color: Colors.light.textSecondary,
    fontSize: 13,
  },
  hint: {
    color: Colors.light.textSecondary,
    fontSize: 14,
  },
  primary: {
    alignItems: 'center',
    backgroundColor: Colors.light.text,
    borderRadius: Spacing.three,
    flex: 1,
    paddingVertical: Spacing.three,
  },
  primaryText: {
    color: Colors.light.background,
    fontSize: 15,
    fontWeight: '700',
  },
  secondary: {
    alignItems: 'center',
    borderColor: Colors.light.backgroundSelected,
    borderRadius: Spacing.three,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 90,
    paddingHorizontal: Spacing.three,
  },
  secondaryText: {
    color: Colors.light.text,
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    color: Colors.light.text,
    fontSize: 18,
    fontWeight: '700',
  },
});
