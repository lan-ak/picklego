import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import MapView, { Marker, Callout, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import Layout from '../components/Layout';
import { Icon } from '../components/Icon';
import { colors, typography, spacing, borderRadius, shadows, layout } from '../theme';
import { useData } from '../context/DataContext';
import { useVenues } from '../hooks/useVenues';
import { searchNearbyCourts, PlaceResult } from '../services/placesService';
import { Coordinates } from '../types';

const DEFAULT_REGION: Region = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

const CourtsDiscoveryScreen = () => {
  const { currentUser } = useData();
  const { venues, loading: venuesLoading, saveVenue, removeVenue, toggleFavorite } = useVenues(currentUser?.id);

  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [courts, setCourts] = useState<PlaceResult[]>([]);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSearched, setHasSearched] = useState(false);
  const [showSearchButton, setShowSearchButton] = useState(false);
  const [currentRegion, setCurrentRegion] = useState<Region>(DEFAULT_REGION);

  const mapRef = useRef<MapView>(null);

  // Get user location and search for nearby courts on mount
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Location Permission',
            'Enable location access to find courts near you. You can still browse saved courts.',
          );
          setIsLoading(false);
          return;
        }

        const loc = await Location.getCurrentPositionAsync({});
        const coords: Coordinates = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        setUserLocation(coords);

        const region: Region = {
          ...coords,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        };
        setCurrentRegion(region);
        mapRef.current?.animateToRegion(region, 500);

        await searchCourts(coords);
      } catch (error) {
        console.error('Failed to get location:', error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const searchCourts = useCallback(async (location: Coordinates) => {
    setIsLoading(true);
    setShowSearchButton(false);
    try {
      const results = await searchNearbyCourts(location);
      setCourts(results);
      setHasSearched(true);
    } catch (error) {
      console.error('Failed to search courts:', error);
      Alert.alert('Error', 'Could not search for courts. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSearchThisArea = useCallback(() => {
    const center: Coordinates = {
      latitude: currentRegion.latitude,
      longitude: currentRegion.longitude,
    };
    searchCourts(center);
  }, [currentRegion, searchCourts]);

  const handleRegionChange = useCallback((region: Region) => {
    setCurrentRegion(region);
    if (hasSearched) {
      setShowSearchButton(true);
    }
  }, [hasSearched]);

  const handleSaveCourt = useCallback(async (court: PlaceResult) => {
    if (!court.coords) return;

    const existing = venues.find((v) => v.placeId === court.placeId);
    if (existing) {
      Alert.alert('Already Saved', `${court.name} is already in your saved courts.`);
      return;
    }

    try {
      await saveVenue({
        name: court.name,
        address: court.address,
        coords: court.coords,
        placeId: court.placeId,
        isFavorite: false,
      });
      Alert.alert('Saved', `${court.name} has been saved to your courts.`);
    } catch (error) {
      Alert.alert('Error', 'Could not save this court. Please try again.');
    }
  }, [venues, saveVenue]);

  const handleGetDirections = useCallback((coords: Coordinates, name: string) => {
    const label = encodeURIComponent(name);
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${coords.latitude},${coords.longitude}`,
      android: `geo:0,0?q=${coords.latitude},${coords.longitude}(${label})`,
    });
    if (url) Linking.openURL(url);
  }, []);

  const getDistance = useCallback((courtCoords: Coordinates): string | null => {
    if (!userLocation) return null;
    const R = 6371; // km
    const dLat = ((courtCoords.latitude - userLocation.latitude) * Math.PI) / 180;
    const dLon = ((courtCoords.longitude - userLocation.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((userLocation.latitude * Math.PI) / 180) *
        Math.cos((courtCoords.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const km = R * c;
    const miles = km * 0.621371;
    return miles < 0.1 ? 'Nearby' : `${miles.toFixed(1)} mi`;
  }, [userLocation]);

  const isCourtSaved = useCallback(
    (placeId: string) => venues.some((v) => v.placeId === placeId),
    [venues]
  );

  const handleMyLocation = useCallback(async () => {
    if (userLocation) {
      mapRef.current?.animateToRegion(
        { ...userLocation, latitudeDelta: 0.05, longitudeDelta: 0.05 },
        500
      );
    }
  }, [userLocation]);

  const renderCourtCard = useCallback(
    ({ item }: { item: PlaceResult }) => {
      const saved = isCourtSaved(item.placeId);
      const distance = item.coords ? getDistance(item.coords) : null;

      return (
        <View style={styles.courtCard}>
          <View style={styles.courtCardContent}>
            <View style={styles.courtInfo}>
              <Text style={styles.courtName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.courtAddress} numberOfLines={2}>
                {item.address}
              </Text>
              {distance && (
                <Text style={styles.courtDistance}>{distance}</Text>
              )}
            </View>
            <View style={styles.courtActions}>
              <TouchableOpacity
                onPress={() => {
                  if (saved) {
                    const venue = venues.find((v) => v.placeId === item.placeId);
                    if (venue) toggleFavorite(venue.id);
                  } else {
                    handleSaveCourt(item);
                  }
                }}
                activeOpacity={0.7}
                accessibilityLabel={saved ? 'Remove from saved' : 'Save court'}
                accessibilityRole="button"
              >
                <Icon
                  name="star"
                  size={24}
                  color={saved ? colors.action : colors.gray300}
                />
              </TouchableOpacity>
              {item.coords && (
                <TouchableOpacity
                  onPress={() => handleGetDirections(item.coords!, item.name)}
                  activeOpacity={0.7}
                  accessibilityLabel="Get directions"
                  accessibilityRole="button"
                >
                  <Icon name="navigation" size={22} color={colors.secondary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      );
    },
    [isCourtSaved, getDistance, handleSaveCourt, handleGetDirections, venues, toggleFavorite]
  );

  return (
    <Layout title="Find Courts" showBackButton>
      {/* View Mode Toggle */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[styles.toggleButton, viewMode === 'map' && styles.toggleButtonActive]}
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
              styles.toggleText,
              viewMode === 'map' && styles.toggleTextActive,
            ]}
          >
            Map
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, viewMode === 'list' && styles.toggleButtonActive]}
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
              styles.toggleText,
              viewMode === 'list' && styles.toggleTextActive,
            ]}
          >
            List
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading && !hasSearched ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Finding courts near you...</Text>
        </View>
      ) : viewMode === 'map' ? (
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={currentRegion}
            onRegionChangeComplete={handleRegionChange}
            showsUserLocation
            showsMyLocationButton={false}
          >
            {courts.map((court) =>
              court.coords ? (
                <Marker
                  key={court.placeId}
                  coordinate={court.coords}
                  pinColor={isCourtSaved(court.placeId) ? colors.action : colors.primary}
                >
                  <Callout onPress={() => handleSaveCourt(court)}>
                    <View style={styles.callout}>
                      <Text style={styles.calloutTitle} numberOfLines={1}>
                        {court.name}
                      </Text>
                      <Text style={styles.calloutAddress} numberOfLines={2}>
                        {court.address}
                      </Text>
                      {!isCourtSaved(court.placeId) && (
                        <Text style={styles.calloutSave}>Tap to save</Text>
                      )}
                    </View>
                  </Callout>
                </Marker>
              ) : null
            )}
          </MapView>

          {/* Search This Area Button */}
          {showSearchButton && (
            <TouchableOpacity
              style={styles.searchAreaButton}
              onPress={handleSearchThisArea}
              activeOpacity={0.7}
            >
              <Icon name="search" size={16} color={colors.white} />
              <Text style={styles.searchAreaText}>Search this area</Text>
            </TouchableOpacity>
          )}

          {/* My Location Button */}
          {userLocation && (
            <TouchableOpacity
              style={styles.myLocationButton}
              onPress={handleMyLocation}
              activeOpacity={0.7}
              accessibilityLabel="Center on my location"
              accessibilityRole="button"
            >
              <Icon name="crosshair" size={22} color={colors.primary} />
            </TouchableOpacity>
          )}

          {/* Loading indicator for searching */}
          {isLoading && (
            <View style={styles.mapLoadingOverlay}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}
        </View>
      ) : (
        <FlatList
          data={courts}
          keyExtractor={(item) => item.placeId}
          renderItem={renderCourtCard}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="map-pin" size={48} color={colors.gray300} />
              <Text style={styles.emptyTitle}>No courts found</Text>
              <Text style={styles.emptySubtitle}>
                Try searching in a different area
              </Text>
            </View>
          }
        />
      )}
    </Layout>
  );
};

const styles = StyleSheet.create({
  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.xs,
    ...shadows.sm,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  toggleButtonActive: {
    backgroundColor: colors.primary,
  },
  toggleText: {
    ...typography.button,
    color: colors.primary,
  },
  toggleTextActive: {
    color: colors.white,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.bodySmall,
    color: colors.gray400,
  },
  mapContainer: {
    flex: 1,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.md,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  callout: {
    minWidth: 150,
    maxWidth: 220,
    padding: spacing.xs,
  },
  calloutTitle: {
    ...typography.bodySmall,
    color: colors.neutral,
    fontWeight: '600',
  },
  calloutAddress: {
    ...typography.caption,
    color: colors.gray400,
    marginTop: spacing.xs,
  },
  calloutSave: {
    ...typography.caption,
    color: colors.primary,
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  searchAreaButton: {
    position: 'absolute',
    top: spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.pill,
    gap: spacing.sm,
    ...shadows.md,
  },
  searchAreaText: {
    ...typography.label,
    color: colors.white,
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
  mapLoadingOverlay: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    backgroundColor: colors.white,
    borderRadius: borderRadius.pill,
    padding: spacing.sm,
    ...shadows.sm,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  courtCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  courtCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  courtInfo: {
    flex: 1,
  },
  courtName: {
    ...typography.bodyLarge,
    color: colors.neutral,
  },
  courtAddress: {
    ...typography.caption,
    color: colors.gray400,
    marginTop: spacing.xs,
  },
  courtDistance: {
    ...typography.caption,
    color: colors.secondary,
    marginTop: spacing.xs,
    fontWeight: '600',
  },
  courtActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginLeft: spacing.md,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxxl,
    gap: spacing.md,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.gray400,
  },
  emptySubtitle: {
    ...typography.bodySmall,
    color: colors.gray400,
    textAlign: 'center',
  },
});

export default CourtsDiscoveryScreen;
