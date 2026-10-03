import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { Colors, Spacing } from '@/constants/theme';

type Props = {
  uri: string | null;
  onCaptured: (asset: ImagePicker.ImagePickerAsset) => Promise<void>;
};

export function PhotoCapture({ uri, onCaptured }: Props) {
  async function capture(): Promise<void> {
    const permission =
      await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      await onCaptured(result.assets[0]);
    }
  }

  async function choose(): Promise<void> {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      return;
    }

    const result =
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });

    if (!result.canceled && result.assets[0]) {
      await onCaptured(result.assets[0]);
    }
  }

  return (
    <View style={styles.container}>
      {uri ? (
        <Image source={{ uri }} style={styles.preview} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            No product photo yet
          </Text>
        </View>
      )}

      <Pressable style={styles.primary} onPress={capture}>
        <Text style={styles.primaryText}>
          {uri ? 'Retake photo' : 'Add photo'}
        </Text>
      </Pressable>

      <Pressable style={styles.secondary} onPress={choose}>
        <Text style={styles.secondaryText}>Choose from library</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  placeholder: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: Colors.light.backgroundElement,
    borderRadius: Spacing.four,
    justifyContent: 'center',
  },
  placeholderText: {
    color: Colors.light.textSecondary,
    fontSize: 16,
  },
  preview: {
    aspectRatio: 1,
    borderRadius: Spacing.four,
    width: '100%',
  },
  primary: {
    alignItems: 'center',
    backgroundColor: Colors.light.text,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
  },
  primaryText: {
    color: Colors.light.background,
    fontSize: 16,
    fontWeight: '700',
  },
  secondary: {
    alignItems: 'center',
    borderColor: Colors.light.backgroundSelected,
    borderRadius: Spacing.three,
    borderWidth: 1,
    paddingVertical: Spacing.two,
  },
  secondaryText: {
    color: Colors.light.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
