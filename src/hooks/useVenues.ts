import { useState, useEffect, useCallback } from 'react';
import { Venue, Coordinates } from '../types';
import {
  createVenueDocument,
  getVenuesForUser,
  updateVenueDocument,
  deleteVenueDocument,
} from '../config/venueFirestore';

export function useVenues(userId: string | undefined) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setVenues([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const results = await getVenuesForUser(userId);
        if (!cancelled) setVenues(results);
      } catch (error) {
        console.error('Failed to load venues:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const saveVenue = useCallback(
    async (venue: Omit<Venue, 'id' | 'createdAt' | 'createdBy'>) => {
      if (!userId) return null;
      const newVenue: Venue = {
        ...venue,
        id: Date.now().toString(),
        createdAt: Date.now(),
        createdBy: userId,
      };
      await createVenueDocument(newVenue);
      setVenues((prev) => [...prev, newVenue]);
      return newVenue;
    },
    [userId]
  );

  const removeVenue = useCallback(async (venueId: string) => {
    await deleteVenueDocument(venueId);
    setVenues((prev) => prev.filter((v) => v.id !== venueId));
  }, []);

  const toggleFavorite = useCallback(async (venueId: string) => {
    setVenues((prev) =>
      prev.map((v) =>
        v.id === venueId ? { ...v, isFavorite: !v.isFavorite } : v
      )
    );
    const venue = venues.find((v) => v.id === venueId);
    if (venue) {
      await updateVenueDocument(venueId, { isFavorite: !venue.isFavorite });
    }
  }, [venues]);

  return { venues, loading, saveVenue, removeVenue, toggleFavorite };
}
