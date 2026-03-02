import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadProfilePicture } from '../config/firebase';

interface UseProfilePictureOptions {
  playerId: string | undefined;
  onUpdate: (playerId: string, data: { profilePic: string }) => Promise<void>;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function useProfilePicture({
  playerId,
  onUpdate,
  onSuccess,
  onError,
}: UseProfilePictureOptions) {
  const [uploading, setUploading] = useState(false);

  const pickAndUploadImage = useCallback(async () => {
    if (!playerId) return;

    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert(
        'Permission Required',
        'Please grant camera roll permissions to upload a photo.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return;
    }

    setUploading(true);
    try {
      const downloadURL = await uploadProfilePicture(playerId, result.assets[0].uri);
      await onUpdate(playerId, { profilePic: downloadURL });
      onSuccess?.();
    } catch (error: any) {
      if (onError) {
        onError(error);
      } else {
        Alert.alert('Error', 'Failed to update profile picture');
      }
    } finally {
      setUploading(false);
    }
  }, [playerId, onUpdate, onSuccess, onError]);

  return { pickAndUploadImage, uploading };
}
