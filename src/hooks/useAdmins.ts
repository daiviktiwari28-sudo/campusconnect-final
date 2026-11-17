import { useCallback, useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, isFirebaseConfigured, OperationType } from '../lib/firebase';

const ADMINS_COLLECTION = 'admins';
const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export function useAdmins(isAdmin: boolean) {
  const [adminUids, setAdminUids] = useState<string[]>([]);
  const [adminsLoading, setAdminsLoading] = useState<boolean>(false);
  const [managingAdminUid, setManagingAdminUid] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminStatusMessage, setAdminStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !isFirebaseConfigured || !isAdmin) {
      setAdminUids([]);
      setAdminsLoading(false);
      return;
    }

    setAdminsLoading(true);
    const adminsRef = collection(db, ADMINS_COLLECTION);

    const unsubscribe = onSnapshot(
      adminsRef,
      (snapshot) => {
        const uids = snapshot.docs
          .map((docSnap) => docSnap.id)
          .filter((id) => VALID_ID_PATTERN.test(id))
          .sort();
        setAdminUids(uids);
        setAdminsLoading(false);
      },
      (err) => {
        setAdminsLoading(false);
        try {
          handleFirestoreError(err, OperationType.LIST, ADMINS_COLLECTION);
        } catch {
          // Structured error logged in handleFirestoreError
        }
      }
    );

    return () => unsubscribe();
  }, [isAdmin]);

  const grantAdmin = useCallback(
    async (rawUid: string): Promise<boolean> => {
      if (!isAdmin || !db || !isFirebaseConfigured) {
        setAdminError('Admin access is required to manage administrators.');
        return false;
      }

      const uid = rawUid.trim();
      if (!VALID_ID_PATTERN.test(uid)) {
        setAdminError('Enter a valid Firebase user UID (letters, numbers, underscores, or hyphens).');
        return false;
      }

      setManagingAdminUid(uid);
      setAdminError(null);
      setAdminStatusMessage(null);

      try {
        await setDoc(doc(db, ADMINS_COLLECTION, uid), { uid });
        setAdminStatusMessage(`Granted admin access to UID ${uid}.`);
        return true;
      } catch (err) {
        setAdminError('Could not grant admin access. Verify permissions and UID format.');
        try {
          handleFirestoreError(err, OperationType.CREATE, `${ADMINS_COLLECTION}/${uid}`);
        } catch {
          // Structured error logged in handleFirestoreError
        }
        return false;
      } finally {
        setManagingAdminUid(null);
      }
    },
    [isAdmin]
  );

  const revokeAdmin = useCallback(
    async (uid: string): Promise<boolean> => {
      if (!isAdmin || !db || !isFirebaseConfigured) {
        setAdminError('Admin access is required to manage administrators.');
        return false;
      }

      if (!VALID_ID_PATTERN.test(uid)) {
        return false;
      }

      setManagingAdminUid(uid);
      setAdminError(null);
      setAdminStatusMessage(null);

      try {
        await deleteDoc(doc(db, ADMINS_COLLECTION, uid));
        setAdminStatusMessage(`Revoked admin access for UID ${uid}.`);
        return true;
      } catch (err) {
        setAdminError('Could not revoke admin access right now.');
        try {
          handleFirestoreError(err, OperationType.DELETE, `${ADMINS_COLLECTION}/${uid}`);
        } catch {
          // Structured error logged in handleFirestoreError
        }
        return false;
      } finally {
        setManagingAdminUid(null);
      }
    },
    [isAdmin]
  );

  const clearAdminMessages = useCallback(() => {
    setAdminError(null);
    setAdminStatusMessage(null);
  }, []);

  return {
    adminUids,
    adminsLoading,
    managingAdminUid,
    adminError,
    adminStatusMessage,
    grantAdmin,
    revokeAdmin,
    clearAdminMessages,
  };
}
