import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  isAllowedCampusEmail,
  isBootstrappedAdminEmail,
  isFirebaseConfigured,
  mapAuthError,
  OperationType,
  type AuthFeedback,
} from '../lib/firebase';
import {
  STUDENT_PROFILE_LIMITS,
  validateStudentProfile,
  type StudentProfileInput,
} from '../lib/profileUtils';

export interface CampusUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  emailVerified: boolean;
  photoURL: string | null;
}

export interface StudentProfile {
  uid: string;
  displayName: string;
  branch: string;
  semester: string;
  phoneNumber: string;
}

const DOMAIN_RESTRICTION_ERROR: AuthFeedback = {
  code: 'auth/jdcoem-domain-required',
  title: 'JDCOEM campus email required',
  message:
    'Only verified college Google accounts ending with @jdcoem.ac.in or .jdcoem.in can sign in to CampusConnect.',
  isCancellation: false,
};

function toCampusUser(firebaseUser: User, overrideName?: string | null): CampusUser {
  return {
    uid: firebaseUser.uid,
    displayName: overrideName?.trim() || firebaseUser.displayName,
    email: firebaseUser.email,
    emailVerified: firebaseUser.emailVerified,
    photoURL: firebaseUser.photoURL,
  };
}

function isProfileComplete(profile: StudentProfile | null): boolean {
  if (!profile) return false;
  return (
    profile.displayName.trim().length >= STUDENT_PROFILE_LIMITS.displayNameMin &&
    profile.branch.trim().length >= STUDENT_PROFILE_LIMITS.branchMin &&
    profile.semester.trim().length >= STUDENT_PROFILE_LIMITS.semesterMin &&
    profile.phoneNumber.trim().length >= STUDENT_PROFILE_LIMITS.phoneMin
  );
}

export function useAuth() {
  const [user, setUser] = useState<CampusUser | null>(null);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [initializing, setInitializing] = useState<boolean>(isFirebaseConfigured);
  const [profileLoading, setProfileLoading] = useState<boolean>(false);
  const [signingIn, setSigningIn] = useState<boolean>(false);
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [signingOut, setSigningOut] = useState<boolean>(false);
  const [error, setError] = useState<AuthFeedback | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setInitializing(false);
      return;
    }

    const firebaseAuth = auth;
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      async (firebaseUser) => {
        if (cancelled) return;

        if (!firebaseUser) {
          setUser(null);
          setStudentProfile(null);
          setPhoneNumber(null);
          setIsAdmin(false);
          setProfileLoading(false);
          setInitializing(false);
          return;
        }

        if (!firebaseUser.emailVerified || !isAllowedCampusEmail(firebaseUser.email)) {
          await signOut(firebaseAuth).catch(() => undefined);
          if (cancelled) return;
          setUser(null);
          setStudentProfile(null);
          setPhoneNumber(null);
          setIsAdmin(false);
          setError(DOMAIN_RESTRICTION_ERROR);
          setProfileLoading(false);
          setInitializing(false);
          return;
        }

        const nextUser = toCampusUser(firebaseUser);
        setUser(nextUser);
        setProfileLoading(true);
        setInitializing(false);

        if (!db) {
          setIsAdmin(false);
          setProfileLoading(false);
          return;
        }

        const userPath = `users/${firebaseUser.uid}`;
        const publicPath = `publicProfiles/${firebaseUser.uid}`;
        try {
          const [userSnap, publicSnap, adminSnap] = await Promise.all([
            getDoc(doc(db, 'users', firebaseUser.uid)),
            getDoc(doc(db, 'publicProfiles', firebaseUser.uid)).catch(() => null),
            getDoc(doc(db, 'admins', firebaseUser.uid)).catch(() => null),
          ]);
          if (cancelled) return;

          const isBootstrappedAdmin = Boolean(
            firebaseUser.emailVerified && isBootstrappedAdminEmail(firebaseUser.email)
          );
          setIsAdmin(isBootstrappedAdmin || Boolean(adminSnap && adminSnap.exists()));

          if (userSnap.exists()) {
            const data = userSnap.data();
            const storedName =
              typeof data.displayName === 'string' && data.displayName.trim()
                ? data.displayName.trim()
                : firebaseUser.displayName?.trim() || 'Campus Student';
            const storedBranch =
              typeof data.branch === 'string' ? data.branch.trim() : '';
            const storedSemester =
              typeof data.semester === 'string' ? data.semester.trim() : '';
            const storedPhone =
              typeof data.phoneNumber === 'string' && data.phoneNumber.trim().length >= 7
                ? data.phoneNumber.trim()
                : '';

            const loadedProfile: StudentProfile = {
              uid: firebaseUser.uid,
              displayName: storedName,
              branch: storedBranch,
              semester: storedSemester,
              phoneNumber: storedPhone,
            };

            setUser(toCampusUser(firebaseUser, storedName));
            setStudentProfile(loadedProfile);
            setPhoneNumber(storedPhone || null);

            if (isProfileComplete(loadedProfile) && (!publicSnap || !publicSnap.exists())) {
              setDoc(doc(db, 'publicProfiles', firebaseUser.uid), {
                uid: firebaseUser.uid,
                displayName: loadedProfile.displayName,
                branch: loadedProfile.branch,
                semester: loadedProfile.semester,
                visibility: 'campus',
                updatedAt: serverTimestamp(),
              }).catch((syncErr) => {
                try {
                  handleFirestoreError(syncErr, OperationType.CREATE, publicPath);
                } catch {
                  // Structured error logged in handleFirestoreError
                }
              });
            }
          } else {
            setStudentProfile(null);
            setPhoneNumber(null);
          }
        } catch (err) {
          if (!cancelled) {
            setIsAdmin(false);
            setStudentProfile(null);
            setPhoneNumber(null);
            setProfileError(
              'We could not load your student profile. Please enter your details to continue.'
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
    setProfileError(null);
    setSigningIn(true);

    try {
      const credential = await signInWithPopup(auth, googleProvider);
      if (!credential.user.emailVerified || !isAllowedCampusEmail(credential.user.email)) {
        await signOut(auth).catch(() => undefined);
        setUser(null);
        setStudentProfile(null);
        setPhoneNumber(null);
        setIsAdmin(false);
        setError(DOMAIN_RESTRICTION_ERROR);
        return;
      }

      setUser(toCampusUser(credential.user));
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setSigningIn(false);
    }
  }, []);

  const saveProfile = useCallback(
    async (input: StudentProfileInput): Promise<boolean> => {
      if (!user) return false;

      const validation = validateStudentProfile(input);
      if (!validation.valid) {
        setProfileError(validation.error || 'Complete all student profile fields.');
        return false;
      }

      if (!db) {
        setProfileError('Cloud Firestore is not configured yet in this environment.');
        return false;
      }

      setSavingProfile(true);
      setProfileError(null);

      const userRef = doc(db, 'users', user.uid);
      const publicRef = doc(db, 'publicProfiles', user.uid);
      const userPath = `users/${user.uid}`;

      try {
        const [existingSnap, existingPublicSnap] = await Promise.all([
          getDoc(userRef),
          getDoc(publicRef),
        ]);

        const batch = writeBatch(db);

        if (existingSnap.exists()) {
          batch.update(userRef, {
            displayName: validation.values.displayName,
            branch: validation.values.branch,
            semester: validation.values.semester,
            phoneNumber: validation.values.phoneNumber,
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.set(userRef, {
            uid: user.uid,
            displayName: validation.values.displayName,
            branch: validation.values.branch,
            semester: validation.values.semester,
            phoneNumber: validation.values.phoneNumber,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        if (existingPublicSnap.exists()) {
          batch.update(publicRef, {
            displayName: validation.values.displayName,
            branch: validation.values.branch,
            semester: validation.values.semester,
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.set(publicRef, {
            uid: user.uid,
            displayName: validation.values.displayName,
            branch: validation.values.branch,
            semester: validation.values.semester,
            visibility: 'campus',
            updatedAt: serverTimestamp(),
          });
        }

        await batch.commit();

        const nextProfile: StudentProfile = {
          uid: user.uid,
          displayName: validation.values.displayName,
          branch: validation.values.branch,
          semester: validation.values.semester,
          phoneNumber: validation.values.phoneNumber,
        };

        setStudentProfile(nextProfile);
        setPhoneNumber(validation.values.phoneNumber);
        setUser((prev) =>
          prev
            ? {
                ...prev,
                displayName: validation.values.displayName,
              }
            : prev
        );
        return true;
      } catch (err) {
        const errCode =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code?: unknown }).code)
            : '';
        if (errCode === 'permission-denied') {
          setProfileError(
            'Permission denied while saving your profile. Please sign out and sign back in with a verified @jdcoem.ac.in or .jdcoem.in Google account.'
          );
        } else if (errCode === 'unavailable') {
          setProfileError(
            'Cloud Firestore is temporarily unreachable. Check your internet connection and try again.'
          );
        } else {
          setProfileError(
            'Could not save your student profile right now. Please try again in a moment.'
          );
        }
        try {
          handleFirestoreError(err, OperationType.WRITE, userPath);
        } catch {
          // Structured error logged in handleFirestoreError
        }
        return false;
      } finally {
        setSavingProfile(false);
      }
    },
    [user]
  );

  const signOutUser = useCallback(async () => {
    if (!auth) {
      setUser(null);
      setStudentProfile(null);
      setPhoneNumber(null);
      setIsAdmin(false);
      return;
    }

    setError(null);
    setProfileError(null);
    setSigningOut(true);

    try {
      await signOut(auth);
      setUser(null);
      setStudentProfile(null);
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

  const clearProfileError = useCallback(() => {
    setProfileError(null);
  }, []);

  const hasCompleteProfile = useMemo(
    () => isProfileComplete(studentProfile),
    [studentProfile]
  );

  return {
    user,
    studentProfile,
    phoneNumber,
    hasCompleteProfile,
    isAdmin,
    initializing,
    profileLoading,
    signingIn,
    savingProfile,
    signingOut,
    error,
    profileError,
    isConfigured: isFirebaseConfigured,
    signInWithGoogle,
    saveProfile,
    signOutUser,
    clearError,
    clearProfileError,
  };
}
