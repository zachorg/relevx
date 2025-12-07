/**
 * User management for web app
 */

import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import type { User } from "firebase/auth";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  planId: string;
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
  lastLoginAt: Timestamp | string;
}

/**
 * Create or update a user document in Firestore
 * This should be called after successful authentication
 */
export async function createOrUpdateUser(user: User): Promise<UserProfile> {
  const userRef = doc(db, "users", user.uid);

  // Check if user document already exists
  const userDoc = await getDoc(userRef);

  if (userDoc.exists()) {
    const userData = userDoc.data();
    // User exists, update last login time
    await setDoc(
      userRef,
      {
        ...userData,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        planId: userData.planId ?? "",
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      },
      { merge: true }
    );
    return userData as UserProfile;
  } else {
    const userData = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      planId: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    }
    // New user, create document
    await setDoc(userRef, userData);
    return userData as UserProfile;
  }
}

/**
 * Get a user's profile from Firestore
 */
export async function getUserProfile(
  userId: string
): Promise<UserProfile | null> {
  const userRef = doc(db, "users", userId);
  const userDoc = await getDoc(userRef);

  if (!userDoc.exists()) {
    return null;
  }

  return userDoc.data() as UserProfile;
}
