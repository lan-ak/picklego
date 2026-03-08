import React from 'react';
import { Modal, Pressable, View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { colors } from '../theme';

interface DismissableModalProps {
  visible: boolean;
  onClose: () => void;
  animationType?: 'slide' | 'fade' | 'none';
  dismissOnBackdrop?: boolean;
  children: React.ReactNode;
  overlayStyle?: StyleProp<ViewStyle>;
}

export const DismissableModal: React.FC<DismissableModalProps> = ({
  visible,
  onClose,
  animationType = 'slide',
  dismissOnBackdrop = true,
  children,
  overlayStyle,
}) => {
  return (
    <Modal
      animationType={animationType}
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      {dismissOnBackdrop ? (
        <Pressable
          style={[styles.overlay, overlayStyle]}
          onPress={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          {children}
        </Pressable>
      ) : (
        <View style={[styles.overlay, overlayStyle]}>
          {children}
        </View>
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.backdrop,
  },
});
