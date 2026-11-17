import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, Timestamp, where } from 'firebase/firestore';
import { db, handleFirestoreError, isFirebaseConfigured, OperationType } from '../lib/firebase';
import type { CampusUser } from './useAuth';

const PUBLIC_PROFILES_COLLECTION = 'publicProfiles';

export interface PublicStudentProfile {
  uid: string;
  displayName: string;
  branch: string;
  semester: string;
  updatedAtMs: number;
}

function toMillis(value: unknown): number {
  return value instanceof Timestamp ? value.toMillis() : Date.now();
}

export function usePublicProfiles(user: CampusUser) {
  const [profiles, setProfiles] = useState<PublicStudentProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState<boolean>(
    Boolean(db && isFirebaseConfigured)
  );

  useEffect(() => {
    if (!db || !isFirebaseConfigured || !user.uid) {
      setProfilesLoading(false);
      return;
    }

    setProfilesLoading(true);
    const profilesQuery = query(
      collection(db, PUBLIC_PROFILES_COLLECTION),
      where('visibility', '==', 'campus')
    );

    const unsubscribe = onSnapshot(
      profilesQuery,
      (snapshot) => {
        const loaded: PublicStudentProfile[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            uid: typeof data.uid === 'string' ? data.uid : docSnap.id,
            displayName:
              typeof data.displayName === 'string' && data.displayName.trim()
                ? data.displayName.trim()
                : 'Campus Student',
            branch: typeof data.branch === 'string' ? data.branch.trim() : '',
            semester: typeof data.semester === 'string' ? data.semester.trim() : '',
            updatedAtMs: toMillis(data.updatedAt),
          };
        });

        setProfiles(loaded);
        setProfilesLoading(false);
      },
      (err) => {
        setProfilesLoading(false);
        try {
          handleFirestoreError(err, OperationType.LIST, PUBLIC_PROFILES_COLLECTION);
        } catch {
          // Structured error logged in handleFirestoreError
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user.uid]);

  const publicProfilesById = useMemo<Record<string, PublicStudentProfile>>(() => {
    const map: Record<string, PublicStudentProfile> = {};
    for (const profile of profiles) {
      if (profile.uid) {
        map[profile.uid] = profile;
      }
    }
    return map;
  }, [profiles]);

  return {
    publicProfiles: profiles,
    publicProfilesById,
    profilesLoading,
  };
}
