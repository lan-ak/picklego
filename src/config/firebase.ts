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
import { Player, Match } from '../types';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCEFYV8DMdlZlGdrXgGnznGjlpQsPYVWLE",
  authDomain: "picklego-1c5c7.firebaseapp.com",
  projectId: "picklego-1c5c7",
  storageBucket: "picklego-1c5c7.firebasestorage.app",
  messagingSenderId: "79098545592",
  appId: "1:79098545592:web:d15c855ea5c31fcc4afb4d",
  measurementId: "G-BV83RH77LX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});
const db = getFirestore(app);

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
      webClientId: '79098545592-mggm81d58hh9ruli271csod90jrblqut.apps.googleusercontent.com',
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