import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  isFirebaseConfigured,
  mapAuthError,
  OperationType,
  type AuthFeedback,
} from '../lib/firebase';
import { validatePhoneNumber } from '../lib/phoneUtils';

export interface CampusUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  emailVerified: boolean;
  photoURL: string | null;
}

const BOOTSTRAPPED_ADMIN_EMAIL = 'daiviktiwari28@gmail.com';

function toCampusUser(firebaseUser: User): CampusUser {
  return {
    uid: firebaseUser.uid,
    displayName: firebaseUser.displayName,
    email: firebaseUser.email,
    emailVerified: firebaseUser.emailVerified,
    photoURL: firebaseUser.photoURL,
  };
}

export function useAuth() {
  const [user, setUser] = useState<CampusUser | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [initializing, setInitializing] = useState<boolean>(isFirebaseConfigured);
  const [profileLoading, setProfileLoading] = useState<boolean>(false);
  const [signingIn, setSigningIn] = useState<boolean>(false);
  const [savingPhone, setSavingPhone] = useState<boolean>(false);
  const [signingOut, setSigningOut] = useState<boolean>(false);
  const [error, setError] = useState<AuthFeedback | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setInitializing(false);
      return;
    }

    let cancelled = false;

    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (cancelled) return;

        if (!firebaseUser) {
          setUser(null);
          setPhoneNumber(null);
          setIsAdmin(false);
          setProfileLoading(false);
          setInitializing(false);
          return;
        }

        const nextUser = toCampusUser(firebaseUser);
        setUser(nextUser);
        setProfileLoading(true);
        setInitializing(false);

        const isBootstrappedAdmin =
          firebaseUser.emailVerified && firebaseUser.email === BOOTSTRAPPED_ADMIN_EMAIL;

        if (!db) {
          setIsAdmin(isBootstrappedAdmin);
          setProfileLoading(false);
          return;
        }

        const userPath = `users/${firebaseUser.uid}`;
        try {
          const [userSnap, adminSnap] = await Promise.all([
            getDoc(doc(db, 'users', firebaseUser.uid)),
            getDoc(doc(db, 'admins', firebaseUser.uid)).catch(() => null),
          ]);
          if (cancelled) return;

          setIsAdmin(isBootstrappedAdmin || Boolean(adminSnap && adminSnap.exists()));

          if (userSnap.exists()) {
            const data = userSnap.data();
            const storedPhone =
              typeof data.phoneNumber === 'string' && data.phoneNumber.trim().length >= 7
                ? data.phoneNumber.trim()
                : null;
            setPhoneNumber(storedPhone);
          } else {
            setPhoneNumber(null);
          }
        } catch (err) {
          if (!cancelled) {
            setIsAdmin(isBootstrappedAdmin);
            setPhoneNumber(null);
            setPhoneError(
              'We could not check your saved phone number. Please enter your phone number to continue.'
            );
          }
          try {
            handleFirestoreError(err, OperationType.GET, userPath);
          } catch {
            // Structured error logged in handleFirestoreError
          }
        } finally {
          if (!cancelled) {
            setProfileLoading(false);
          }
        }
      },
      (observerError) => {
        if (cancelled) return;
        setError(mapAuthError(observerError));
        setProfileLoading(false);
        setInitializing(false);
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!isFirebaseConfigured || !auth || !googleProvider) {
      setError({
        code: 'auth/not-configured',
        title: 'Google Sign-In is not configured yet',
        message:
          'Add valid Firebase project credentials to firebase-applet-config.json and enable the Google provider in Firebase Authentication.',
        isCancellation: false,
      });
      return;
    }

    setError(null);
    setPhoneError(null);
    setSigningIn(true);

    try {
      const credential = await signInWithPopup(auth, googleProvider);
      setUser(toCampusUser(credential.user));
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setSigningIn(false);
    }
  }, []);

  const savePhoneNumber = useCallback(
    async (rawPhone: string): Promise<boolean> => {
      if (!user) return false;

      const validation = validatePhoneNumber(rawPhone);
      if (!validation.valid) {
        setPhoneError(validation.error || 'Enter a valid phone number.');
        return false;
      }

      if (!db) {
        setPhoneError('Cloud Firestore is not configured yet in this environment.');
        return false;
      }

      setSavingPhone(true);
      setPhoneError(null);

      const userRef = doc(db, 'users', user.uid);
      const userPath = `users/${user.uid}`;
      const safeDisplayName = (user.displayName?.trim() || 'Campus Student').slice(0, 80);

      try {
        const existingSnap = await getDoc(userRef);

        if (existingSnap.exists()) {
          await updateDoc(userRef, {
            displayName: safeDisplayName,
            phoneNumber: validation.formatted,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(userRef, {
            uid: user.uid,
            displayName: safeDisplayName,
            phoneNumber: validation.formatted,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        setPhoneNumber(validation.formatted);
        return true;
      } catch (err) {
        setPhoneError(
          'Could not save your phone number right now. Please try again in a moment.'
        );
        try {
          handleFirestoreError(err, OperationType.WRITE, userPath);
        } catch {
          // Structured error logged in handleFirestoreError
        }
        return false;
      } finally {
        setSavingPhone(false);
      }
    },
    [user]
  );

  const signOutUser = useCallback(async () => {
    if (!auth) {
      setUser(null);
      setPhoneNumber(null);
      setIsAdmin(false);
      return;
    }

    setError(null);
    setPhoneError(null);
    setSigningOut(true);

    try {
      await signOut(auth);
      setUser(null);
      setPhoneNumber(null);
      setIsAdmin(false);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setSigningOut(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearPhoneError = useCallback(() => {
    setPhoneError(null);
  }, []);

  return {
    user,
    phoneNumber,
    isAdmin,
    initializing,
    profileLoading,
    signingIn,
    savingPhone,
    signingOut,
    error,
    phoneError,
    isConfigured: isFirebaseConfigured,
    signInWithGoogle,
    savePhoneNumber,
    signOutUser,
    clearError,
    clearPhoneError,
  };
}
