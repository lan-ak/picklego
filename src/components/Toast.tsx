import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Animated, Text, StyleSheet, TouchableOpacity } from 'react-native';

type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastProps {
  visible: boolean;
  message: string;
  type: ToastType;
  duration?: number;
  onDismiss: () => void;
}

const COLORS: Record<ToastType, string> = {
  success: '#0D6B3E',
  error: '#F44336',
  info: '#1976D2',
};

const Toast: React.FC<ToastProps> = ({ visible, message, type, duration = 3000, onDismiss }) => {
  const translateY = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();

      const timer = setTimeout(() => {
        dismiss();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  const dismiss = () => {
    Animated.timing(translateY, {
      toValue: -100,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onDismiss());
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: COLORS[type], transform: [{ translateY }] },
      ]}
    >
      <TouchableOpacity onPress={dismiss} style={styles.content} activeOpacity={0.8}>
        <Text style={styles.text}>{message}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    borderRadius: 12,
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  content: {
    padding: 16,
    alignItems: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default Toast;
