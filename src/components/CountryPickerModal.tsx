import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  Platform,
} from 'react-native';
import { DismissableModal } from './DismissableModal';
import { AnimatedPressable } from './AnimatedPressable';
import { Icon } from './Icon';
import { colors, typography, spacing, borderRadius } from '../theme';
import { COUNTRIES, type Country } from '../utils/countries';

interface CountryPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (country: Country) => void;
  selectedCode: string;
}

export const CountryPickerModal: React.FC<CountryPickerModalProps> = ({
  visible,
  onClose,
  onSelect,
  selectedCode,
}) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return COUNTRIES;
    const q = query.toLowerCase();
    return COUNTRIES.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.dialCode.includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [query]);

  const handleSelect = useCallback(
    (country: Country) => {
      onSelect(country);
      setQuery('');
      onClose();
    },
    [onSelect, onClose],
  );

  const handleClose = useCallback(() => {
    setQuery('');
    onClose();
  }, [onClose]);

  const renderItem = useCallback(
    ({ item }: { item: Country }) => {
      const isSelected = item.code === selectedCode;
      return (
        <AnimatedPressable
          style={[styles.countryItem, isSelected && styles.countryItemSelected]}
          onPress={() => handleSelect(item)}
          hapticStyle="light"
        >
          <Text style={styles.flag}>{item.flag}</Text>
          <Text style={styles.countryName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.dialCode}>+{item.dialCode}</Text>
          {isSelected && <Icon name="check" size={18} color={colors.primary} />}
        </AnimatedPressable>
      );
    },
    [selectedCode, handleSelect],
  );

  return (
    <DismissableModal visible={visible} onClose={handleClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Select Country</Text>
          <AnimatedPressable style={styles.closeButton} onPress={handleClose}>
            <Icon name="x" size={24} color={colors.gray500} />
          </AnimatedPressable>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Icon name="search" size={18} color={colors.gray400} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by country or code..."
            placeholderTextColor={colors.gray400}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <AnimatedPressable onPress={() => setQuery('')}>
              <Icon name="x" size={16} color={colors.gray400} />
            </AnimatedPressable>
          )}
        </View>

        {/* Country list */}
        <FlatList
          data={filtered}
          keyExtractor={item => item.code}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No countries found</Text>
            </View>
          }
        />
      </View>
    </DismissableModal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: 60,
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.h3,
    color: colors.neutral,
  },
  closeButton: {
    padding: spacing.xs,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    ...typography.bodySmall,
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    color: colors.neutral,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.lg,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  countryItemSelected: {
    backgroundColor: colors.primaryOverlay,
  },
  flag: {
    fontSize: 22,
  },
  countryName: {
    ...typography.bodyLarge,
    color: colors.neutral,
    flex: 1,
  },
  dialCode: {
    ...typography.bodySmall,
    color: colors.gray400,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  emptyStateText: {
    ...typography.bodySmall,
    color: colors.gray400,
    textAlign: 'center',
  },
});
