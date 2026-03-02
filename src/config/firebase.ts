import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  // @ts-ignore - getReactNativePersistence exists at runtime but is missing from TS declarations
  getReactNativePersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
} from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Player, Match } from '../types';

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? "",
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});
const db = getFirestore(app);
const storage = getStorage(app);

// Strip undefined values from an object before passing to Firestore
const stripUndefined = <T extends Record<string, any>>(obj: T): T => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  ) as T;
};

// Firestore helper functions
export const createPlayerDocument = async (player: Player) => {
  try {
    const { password, ...playerData } = player;
    await setDoc(doc(db, 'players', player.id), stripUndefined(playerData));
  } catch (error: any) {
    throw new Error('Failed to create player document: ' + error.message);
  }
};

export const updatePlayerDocument = async (playerId: string, data: Partial<Player>) => {
  try {
    await updateDoc(doc(db, 'players', playerId), stripUndefined({
      ...data,
      updatedAt: Date.now()
    }));
  } catch (error: any) {
    throw new Error('Failed to update player document: ' + error.message);
  }
};

export const uploadProfilePicture = async (
  playerId: string,
  localUri: string
): Promise<string> => {
  try {
    const response = await fetch(localUri);
    const blob = await response.blob();
    const storageRef = ref(storage, `profilePics/${playerId}`);
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
  } catch (error: any) {
    throw new Error('Failed to upload profile picture: ' + error.message);
  }
};

export const getPlayerDocument = async (playerId: string) => {
  try {
    const docSnap = await getDoc(doc(db, 'players', playerId));
    if (docSnap.exists()) {
      return docSnap.data() as Player;
    }
    return null;
  } catch (error: any) {
    throw new Error('Failed to get player document: ' + error.message);
  }
};

export const getPlayerByEmail = async (email: string) => {
  try {
    const q = query(collection(db, 'players'), where('email', '==', email));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].data() as Player;
    }
    return null;
  } catch (error: any) {
    throw new Error('Failed to get player by email: ' + error.message);
  }
};

// Authentication functions
export const signUpWithEmail = async (email: string, password: string) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error: any) {
    throw new Error(error.message);
  }
};

export const signInWithEmail = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error: any) {
    throw new Error(error.message);
  }
};

export const signOut = async () => {
  try {
    await firebaseSignOut(auth);
  } catch (error: any) {
    throw new Error(error.message);
  }
};

export const getCurrentUser = () => {
  return auth.currentUser;
};

export const onAuthStateChanged = (callback: (user: any) => void) => {
  return firebaseOnAuthStateChanged(auth, callback);
};

// Match CRUD functions
export const createMatchDocument = async (match: Match) => {
  try {
    await setDoc(doc(db, 'matches', match.id), stripUndefined(match));
  } catch (error: any) {
    throw new Error('Failed to create match document: ' + error.message);
  }
};

export const updateMatchDocument = async (matchId: string, data: Partial<Match>) => {
  try {
    await updateDoc(doc(db, 'matches', matchId), stripUndefined(data));
  } catch (error: any) {
    throw new Error('Failed to update match document: ' + error.message);
  }
};

export const deleteMatchDocument = async (matchId: string) => {
  try {
    await deleteDoc(doc(db, 'matches', matchId));
  } catch (error: any) {
    throw new Error('Failed to delete match document: ' + error.message);
  }
};

export const getMatchesForPlayer = async (playerId: string): Promise<Match[]> => {
  try {
    const q = query(
      collection(db, 'matches'),
      where('allPlayerIds', 'array-contains', playerId)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Match);
  } catch (error: any) {
    throw new Error('Failed to get matches for player: ' + error.message);
  }
};

export const deletePlayerDocument = async (playerId: string) => {
  try {
    await deleteDoc(doc(db, 'players', playerId));
  } catch (error: any) {
    throw new Error('Failed to delete player document: ' + error.message);
  }
};

// Password reset
export const sendPasswordReset = async (email: string) => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error: any) {
    throw new Error(error.message);
  }
};

// Social authentication

export const signInWithGoogle = async () => {
  try {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
    });
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    const idToken = response.data?.idToken;
    if (!idToken) {
      throw new Error('No ID token returned from Google Sign-In');
    }
    const credential = GoogleAuthProvider.credential(idToken);
    const userCredential = await signInWithCredential(auth, credential);
    return userCredential.user;
  } catch (error: any) {
    if (error.code === 'SIGN_IN_CANCELLED') {
      throw { cancelled: true, message: 'Google Sign-In was cancelled' };
    }
    throw new Error('Google Sign-In failed: ' + error.message);
  }
};

export const signInWithApple = async () => {
  try {
    const AppleAuthentication = require('expo-apple-authentication');
    const Crypto = require('expo-crypto');

    const rawNonce = Math.random().toString(36).substring(2, 10) +
      Math.random().toString(36).substring(2, 10);
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );

    const appleCredential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    const { identityToken, fullName } = appleCredential;
    if (!identityToken) {
      throw new Error('No identity token returned from Apple Sign-In');
    }

    const provider = new OAuthProvider('apple.com');
    const oAuthCredential = provider.credential({
      idToken: identityToken,
      rawNonce: rawNonce,
    });

    const userCredential = await signInWithCredential(auth, oAuthCredential);

    // Apple only provides the name on the very first sign-in
    const displayName = fullName
      ? [fullName.givenName, fullName.familyName].filter(Boolean).join(' ')
      : null;

    return {
      user: userCredential.user,
      displayName,
    };
  } catch (error: any) {
    if (error.code === 'ERR_REQUEST_CANCELED') {
      throw { cancelled: true, message: 'Apple Sign-In was cancelled' };
    }
    throw new Error('Apple Sign-In failed: ' + error.message);
  }
}; 