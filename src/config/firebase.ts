import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { Player } from '../types';

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
const auth = getAuth(app);
const db = getFirestore(app);

// Firestore helper functions
export const createPlayerDocument = async (player: Player) => {
  try {
    await setDoc(doc(db, 'players', player.id), {
      ...player,
      password: undefined // Don't store password in Firestore
    });
  } catch (error: any) {
    throw new Error('Failed to create player document: ' + error.message);
  }
};

export const updatePlayerDocument = async (playerId: string, data: Partial<Player>) => {
  try {
    await updateDoc(doc(db, 'players', playerId), {
      ...data,
      updatedAt: Date.now()
    });
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