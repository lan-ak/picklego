import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { Venue } from '../types';

const db = getFirestore();

const stripUndefined = <T extends Record<string, any>>(obj: T): T => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  ) as T;
};

export const createVenueDocument = async (venue: Venue) => {
  try {
    await setDoc(doc(db, 'venues', venue.id), stripUndefined(venue));
  } catch (error: any) {
    throw new Error('Failed to create venue document: ' + error.message);
  }
};

export const getVenuesForUser = async (userId: string): Promise<Venue[]> => {
  try {
    const q = query(
      collection(db, 'venues'),
      where('createdBy', '==', userId)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((d) => d.data() as Venue);
  } catch (error: any) {
    throw new Error('Failed to get venues: ' + error.message);
  }
};

export const updateVenueDocument = async (
  venueId: string,
  data: Partial<Venue>
) => {
  try {
    await updateDoc(doc(db, 'venues', venueId), stripUndefined(data));
  } catch (error: any) {
    throw new Error('Failed to update venue document: ' + error.message);
  }
};

export const deleteVenueDocument = async (venueId: string) => {
  try {
    await deleteDoc(doc(db, 'venues', venueId));
  } catch (error: any) {
    throw new Error('Failed to delete venue document: ' + error.message);
  }
};
