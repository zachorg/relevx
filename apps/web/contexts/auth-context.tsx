"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { RelevxUser } from "core/models/users";
import { createOrUpdateUser } from "@/lib/auth";

interface AuthContextType {
  user: User | null;
  userProfile: RelevxUser | null;
  loading: boolean;

  reloadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<RelevxUser | null>(null);
  const [loading, setLoading] = useState(true);

  const reloadUser = async () => {
    try {
      const userProfile = await createOrUpdateUser();
      setUserProfile(userProfile);
    } catch (error) {
      console.error("Error creating/updating user document:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (newUser) => {
      if (newUser) {
        // Ensure user document exists in Firestore
        try {
          const userProfile = await createOrUpdateUser();
          setUserProfile(userProfile);
        } catch (error) {
          console.error("Error creating/updating user document:", error);
        }
      }
      setUser(newUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, reloadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
