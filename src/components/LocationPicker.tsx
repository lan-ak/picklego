import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Alert,
  ScrollView,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { Coordinates, Venue } from '../types';
import { searchPlaces, getPlaceDetails, PlaceResult } from '../services/placesService';

type LocationPickerProps = {
  initialLocation?: string;
  initialCoords?: Coordinates;
  savedVenues: Venue[];
  onLocationConfirmed: (location: string, coords: Coordinates) => void;
  onCancel: () => void;
};

const DEFAULT_REGION: Region = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const DEBOUNCE_MS = 300;

const LocationPicker: React.FC<LocationPickerProps> = ({
  initialLocation,
  initialCoords,
  savedVenues,
  onLocationConfirmed,
  onCancel,
}) => {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(initialLocation || '');
  const [selectedCoords, setSelectedCoords] = useState<Coordinates | undefined>(initialCoords);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');

  const mapRef = useRef<MapView>(null);
  const debounceRef = useRef<NodeJS.Timeout>(null);
  const searchInputRef = useRef<TextInput>(null);

  const initialRegion: Region = initialCoords
    ? { ...initialCoords, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : DEFAULT_REGION;

  // Request location on mount to center the map
  useEffect(() => {
    if (!initialCoords) {
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          mapRef.current?.animateToRegion(
            {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            },
            500
          );
        }
      })();
    }
  }, [initialCoords]);

  const handleSearch = useCallback(
    (text: string) => {
      setSearchQuery(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (viewMode === 'list') {
        setSearchResults([]);
        setShowResults(false);
        return;
      }

      if (text.trim().length < 2) {
        setSearchResults([]);
        setShowResults(false);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          const results = await searchPlaces(text, selectedCoords);
          setSearchResults(results);
          setShowResults(true);
        } catch (error) {
          console.error('Search failed:', error);
        } finally {
          setIsSearching(false);
        }
      }, DEBOUNCE_MS);
    },
    [selectedCoords, viewMode]
  );

  const filteredVenues = useMemo(() => {
    if (!searchQuery.trim()) return savedVenues;
    const q = searchQuery.toLowerCase().trim();
    return savedVenues.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.address.toLowerCase().includes(q)
    );
  }, [savedVenues, searchQuery]);

  const handleSelectPlace = useCallback(async (place: PlaceResult) => {
    Keyboard.dismiss();
    setShowResults(false);
    setSearchQuery('');
    setIsSearching(true);

    try {
      if (place.coords) {
        setSelectedLocation(place.name);
        setSelectedCoords(place.coords);
        mapRef.current?.animateToRegion(
          { ...place.coords, latitudeDelta: 0.01, longitudeDelta: 0.01 },
          500
        );
      } else {
        const details = await getPlaceDetails(place.placeId);
        setSelectedLocation(details.name);
        setSelectedCoords(details.coords);
        mapRef.current?.animateToRegion(
          { ...details.coords, latitudeDelta: 0.01, longitudeDelta: 0.01 },
          500
        );
      }
    } catch (error) {
      console.error('Failed to get place details:', error);
      Alert.alert('Error', 'Could not load location details. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSelectVenue = useCallback((venue: Venue) => {
    setSelectedLocation(venue.name);
    setSelectedCoords(venue.coords);
    mapRef.current?.animateToRegion(
      { ...venue.coords, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      500
    );
  }, []);

  const handleMapPress = useCallback(async (e: any) => {
    const coords: Coordinates = e.nativeEvent.coordinate;
    setSelectedCoords(coords);

    try {
      const [result] = await Location.reverseGeocodeAsync(coords);
      if (result) {
        const parts = [result.name, result.city, result.region].filter(Boolean);
        setSelectedLocation(parts.join(', '));
      } else {
        setSelectedLocation(`${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`);
      }
    } catch {
      setSelectedLocation(`${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`);
    }
  }, []);

  const handleUseMyLocation = useCallback(async () => {
    setIsLoadingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission',
          'Please enable location access in your device settings to use this feature.'
        );
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      const coords: Coordinates = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      setSelectedCoords(coords);

      mapRef.current?.animateToRegion(
        { ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        500
      );

      try {
        const [result] = await Location.reverseGeocodeAsync(coords);
        if (result) {
          const parts = [result.name, result.city, result.region].filter(Boolean);
          setSelectedLocation(parts.join(', '));
        }
      } catch {
        setSelectedLocation(`${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`);
      }
    } catch (error) {
      Alert.alert('Error', 'Could not get your location. Please try again.');
    } finally {
      setIsLoadingLocation(false);
    }
  }, []);

  const handleConfirm = useCallback(() => {
    if (selectedCoords && selectedLocation) {
      onLocationConfirmed(selectedLocation, selectedCoords);
    }
  }, [selectedCoords, selectedLocation, onLocationConfirmed]);

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <TouchableOpacity
          onPress={onCancel}
          style={styles.headerButton}
          accessibilityLabel="Cancel"
          accessibilityRole="button"
        >
          <Icon name="x" size={24} color={colors.neutral} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select Location</Text>
        <View style={styles.headerButton} />
      </View>

      {/* Saved venues quick-pick */}
      {savedVenues.length > 0 && (
        <View style={styles.venuesSection}>
          <Text style={styles.venuesLabel}>Saved Locations</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.venuesScroll}
          >
            {savedVenues.map((venue) => (
              <TouchableOpacity
                key={venue.id}
                style={[
                  styles.venueChip,
                  selectedLocation === venue.name && styles.venueChipSelected,
                ]}
                onPress={() => handleSelectVenue(venue)}
                activeOpacity={0.7}
              >
                <Icon
                  name={venue.isFavorite ? 'star' : 'map-pin'}
                  size={14}
                  color={selectedLocation === venue.name ? colors.white : colors.primary}
                />
                <Text
                  style={[
                    styles.venueChipText,
                    selectedLocation === venue.name && styles.venueChipTextSelected,
                  ]}
                  numberOfLines={1}
                >
                  {venue.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Icon name="search" size={18} color={colors.gray400} />
        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={handleSearch}
          placeholder="Search for a place..."
          placeholderTextColor={colors.gray400}
          returnKeyType="search"
          accessibilityLabel="Search for a location"
        />
        {isSearching && <ActivityIndicator size="small" color={colors.primary} />}
        {searchQuery.length > 0 && !isSearching && (
          <TouchableOpacity
            onPress={() => {
              setSearchQuery('');
              setSearchResults([]);
              setShowResults(false);
            }}
          >
            <Icon name="x" size={18} color={colors.gray400} />
          </TouchableOpacity>
        )}
      </View>

      {/* View Mode Toggle */}
      <View style={styles.viewToggleContainer}>
        <TouchableOpacity
          style={[styles.viewToggleButton, viewMode === 'map' && styles.viewToggleButtonActive]}
          onPress={() => setViewMode('map')}
          activeOpacity={0.7}
          accessibilityLabel="Map view"
          accessibilityRole="button"
        >
          <Icon
            name="map"
            size={18}
            color={viewMode === 'map' ? colors.white : colors.primary}
          />
          <Text
            style={[
              styles.viewToggleText,
              viewMode === 'map' && styles.viewToggleTextActive,
            ]}
          >
            Map
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewToggleButton, viewMode === 'list' && styles.viewToggleButtonActive]}
          onPress={() => setViewMode('list')}
          activeOpacity={0.7}
          accessibilityLabel="List view"
          accessibilityRole="button"
        >
          <Icon
            name="list"
            size={18}
            color={viewMode === 'list' ? colors.white : colors.primary}
          />
          <Text
            style={[
              styles.viewToggleText,
              viewMode === 'list' && styles.viewToggleTextActive,
            ]}
          >
            List
          </Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'map' ? (
        <>
          {/* Search results dropdown */}
          {showResults && searchResults.length > 0 && (
            <View style={styles.resultsContainer}>
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.placeId}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.resultItem}
                    onPress={() => handleSelectPlace(item)}
                    activeOpacity={0.7}
                  >
                    <Icon name="map-pin" size={16} color={colors.gray400} />
                    <View style={styles.resultTextContainer}>
                      <Text style={styles.resultName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.resultAddress} numberOfLines={1}>
                        {item.address}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {/* Map */}
          <View style={styles.mapContainer}>
            <MapView
              ref={mapRef}
              style={styles.map}
              initialRegion={initialRegion}
              onPress={handleMapPress}
              showsUserLocation
              showsMyLocationButton={false}
            >
              {selectedCoords && (
                <Marker
                  coordinate={selectedCoords}
                  draggable
                  onDragEnd={handleMapPress}
                />
              )}
            </MapView>

            {/* My Location FAB */}
            <TouchableOpacity
              style={styles.myLocationButton}
              onPress={handleUseMyLocation}
              disabled={isLoadingLocation}
              activeOpacity={0.7}
              accessibilityLabel="Use my current location"
              accessibilityRole="button"
            >
              {isLoadingLocation ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Icon name="crosshair" size={22} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>
        </>
      ) : (
        /* List View */
        <FlatList
          data={filteredVenues}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.venueListContent}
          renderItem={({ item }) => {
            const isSelected = selectedLocation === item.name;
            return (
              <TouchableOpacity
                style={[styles.venueCard, isSelected && styles.venueCardSelected]}
                onPress={() => handleSelectVenue(item)}
                activeOpacity={0.7}
                accessibilityLabel={`Select ${item.name}`}
                accessibilityRole="button"
              >
                <View style={styles.venueCardIcon}>
                  <Icon
                    name={item.isFavorite ? 'star' : 'map-pin'}
                    size={20}
                    color={item.isFavorite ? colors.action : colors.primary}
                  />
                </View>
                <View style={styles.venueCardInfo}>
                  <Text style={styles.venueCardName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.venueCardAddress} numberOfLines={2}>
                    {item.address}
                  </Text>
                </View>
                {isSelected && (
                  <Icon name="check-circle" size={22} color={colors.primary} />
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyListContainer}>
              <Icon name="map-pin" size={48} color={colors.gray300} />
              <Text style={styles.emptyListTitle}>
                {searchQuery.trim() ? 'No matching locations' : 'No saved locations'}
              </Text>
              <Text style={styles.emptyListSubtitle}>
                {searchQuery.trim()
                  ? 'Try a different search term'
                  : 'Locations you use in matches will appear here'}
              </Text>
            </View>
          }
        />
      )}

      {/* Bottom confirm bar */}
      <View style={styles.confirmBar}>
        <View style={styles.selectedInfo}>
          <Icon name="map-pin" size={18} color={colors.primary} />
          <Text style={styles.selectedText} numberOfLines={2}>
            {selectedLocation || (viewMode === 'map'
              ? 'Tap on the map or search for a location'
              : 'Select a location from the list')}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.confirmButton,
            (!selectedCoords || !selectedLocation) && styles.confirmButtonDisabled,
          ]}
          onPress={handleConfirm}
          disabled={!selectedCoords || !selectedLocation}
          activeOpacity={0.7}
          accessibilityLabel="Confirm location"
          accessibilityRole="button"
        >
          <Text style={styles.confirmButtonText}>Confirm</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerButton: {
    width: spacing.xxxxl,
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.h3,
    color: colors.primary,
    textAlign: 'center',
    flex: 1,
  },
  venuesSection: {
    backgroundColor: colors.white,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  venuesLabel: {
    ...typography.caption,
    color: colors.gray400,
    marginBottom: spacing.xs,
  },
  venuesScroll: {
    paddingRight: spacing.lg,
    gap: spacing.sm,
  },
  venueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryOverlay,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.pill,
    gap: spacing.xs,
  },
  venueChipSelected: {
    backgroundColor: colors.primary,
  },
  venueChipText: {
    ...typography.caption,
    color: colors.primary,
    maxWidth: 120,
  },
  venueChipTextSelected: {
    color: colors.white,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    gap: spacing.sm,
    zIndex: 10,
  },
  searchInput: {
    flex: 1,
    ...typography.bodySmall,
    color: colors.neutral,
    paddingVertical: spacing.xs,
  },
  resultsContainer: {
    position: 'absolute',
    top: 160,
    left: spacing.lg,
    right: spacing.lg,
    maxHeight: 200,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    ...shadows.lg,
    zIndex: 20,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    gap: spacing.md,
  },
  resultTextContainer: {
    flex: 1,
  },
  resultName: {
    ...typography.bodySmall,
    color: colors.neutral,
  },
  resultAddress: {
    ...typography.caption,
    color: colors.gray400,
  },
  mapContainer: {
    flex: 1,
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.md,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  myLocationButton: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.lg,
    width: spacing.xxxxl,
    height: spacing.xxxxl,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  confirmBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: spacing.md,
  },
  selectedInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  selectedText: {
    ...typography.bodySmall,
    color: colors.neutral,
    flex: 1,
  },
  confirmButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    ...shadows.sm,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    ...typography.button,
    color: colors.white,
  },
  viewToggleContainer: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.xs,
    ...shadows.sm,
  },
  viewToggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  viewToggleButtonActive: {
    backgroundColor: colors.primary,
  },
  viewToggleText: {
    ...typography.button,
    color: colors.primary,
  },
  viewToggleTextActive: {
    color: colors.white,
  },
  venueListContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  venueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
    gap: spacing.md,
  },
  venueCardSelected: {
    backgroundColor: colors.primaryOverlay,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  venueCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  venueCardInfo: {
    flex: 1,
  },
  venueCardName: {
    ...typography.bodyLarge,
    color: colors.neutral,
  },
  venueCardAddress: {
    ...typography.caption,
    color: colors.gray400,
    marginTop: spacing.xs,
  },
  emptyListContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxxl,
    gap: spacing.md,
  },
  emptyListTitle: {
    ...typography.h3,
    color: colors.gray400,
  },
  emptyListSubtitle: {
    ...typography.bodySmall,
    color: colors.gray400,
    textAlign: 'center',
  },
});

export default LocationPicker;
