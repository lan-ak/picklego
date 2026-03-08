import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { InvitePlayersModal } from '../components/InvitePlayersModal';
import { inviteCallbacks } from '../utils/inviteCallbacks';
import { colors, borderRadius } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'InvitePlayers'>;

/**
 * Navigation-based wrapper for InvitePlayersModal.
 * Renders the modal content as a full screen presented modally.
 *
 * Callbacks are passed via inviteCallbacks registry (set before navigating).
 */
const InvitePlayersScreen: React.FC<Props> = ({ navigation, route }) => {
  const { context = 'settings', teamLabel, excludePlayerIds } = route.params ?? {};
  const callbacks = inviteCallbacks.get();

  const handleClose = () => {
    inviteCallbacks.clear();
    navigation.goBack();
  };

  // Clean up callbacks on unmount
  useEffect(() => {
    return () => {
      inviteCallbacks.clear();
    };
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.handle} />
      <InvitePlayersModal
        visible={true}
        onClose={handleClose}
        context={context}
        teamLabel={teamLabel}
        excludePlayerIds={excludePlayerIds}
        onSelectExistingPlayer={(player) => {
          callbacks?.onSelectExistingPlayer?.(player);
          handleClose();
        }}
        onPlaceholderCreated={(player) => {
          callbacks?.onPlaceholderCreated?.(player);
          handleClose();
        }}
        renderAsScreen
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.gray300,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
});

export default InvitePlayersScreen;
