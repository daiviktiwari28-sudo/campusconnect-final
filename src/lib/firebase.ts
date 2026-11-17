import { FirebaseError, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore, type Firestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export interface AuthFeedback {
  code: string;
  title: string;
  message: string;
  isCancellation: boolean;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function isNonEmptyConfigValue(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  const placeholderValues = [
    'remixed-project-id',
    'YOUR_API_KEY',
    'YOUR_PROJECT_ID',
    'YOUR_APP_ID',
    'MY_API_KEY',
  ];
  return !placeholderValues.includes(trimmed);
}

export const isFirebaseConfigured = Boolean(
  isNonEmptyConfigValue(firebaseConfig?.apiKey) &&
    isNonEmptyConfigValue(firebaseConfig?.authDomain) &&
    isNonEmptyConfigValue(firebaseConfig?.projectId) &&
    isNonEmptyConfigValue(firebaseConfig?.appId)
);

export const CAMPUS_EMAIL_DOMAIN = 'jdcoem.ac.in';
export const BOOTSTRAPPED_ADMIN_EMAIL = 'daiviktiwari28@gmail.com';
const ALLOWED_CAMPUS_EMAIL_PATTERN = /^[^@\s]+@([a-z0-9-]+\.)*jdcoem\.(ac\.)?in$/;

export function isBootstrappedAdminEmail(email: string | null | undefined): boolean {
  if (typeof email !== 'string') return false;
  return email.trim().toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;
}

export function isAllowedCampusEmail(email: string | null | undefined): boolean {
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  return ALLOWED_CAMPUS_EMAIL_PATTERN.test(normalized) || normalized === BOOTSTRAPPED_ADMIN_EMAIL;
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let googleProvider: GoogleAuthProvider | null = null;

if (isFirebaseConfigured) {
  app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = firebaseConfig.firestoreDatabaseId
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({
    prompt: 'select_account',
  });
}

async function testFirestoreConnection() {
  if (!db) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testFirestoreConnection();

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export { app, auth, db, googleProvider };

export function mapAuthError(error: unknown): AuthFeedback {
  const code = error instanceof FirebaseError ? error.code : 'auth/unknown';

  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return {
        code,
        title: 'Sign-in was cancelled',
        message:
          'You closed the Google sign-in window before finishing. Click Continue with Google whenever you are ready to try again.',
        isCancellation: true,
      };
    case 'auth/popup-blocked':
      return {
        code,
        title: 'Pop-up window blocked',
        message:
          'Your browser blocked the Google sign-in window. Allow pop-ups for this page in your browser settings and try again.',
        isCancellation: false,
      };
    case 'auth/network-request-failed':
      return {
        code,
        title: 'Connection problem',
        message:
          'We could not reach Google right now. Check your internet connection and try signing in again.',
        isCancellation: false,
      };
    case 'auth/unauthorized-domain':
      return {
        code,
        title: 'Domain not authorized yet',
        message:
          'This preview domain needs to be listed under Authorized domains in your Firebase Authentication settings before Google Sign-In can complete.',
        isCancellation: false,
      };
    case 'auth/operation-not-allowed':
      return {
        code,
        title: 'Google Sign-In is not enabled',
        message:
          'Enable the Google sign-in provider in Firebase Authentication to let students sign in here.',
        isCancellation: false,
      };
    case 'auth/user-disabled':
      return {
        code,
        title: 'Account unavailable',
        message:
          'This account has been disabled. Please try signing in with a different Google account.',
        isCancellation: false,
      };
    default:
      return {
        code,
        title: 'Unable to sign in right now',
        message:
          'Something unexpected happened while connecting with Google. Please try again in a moment.',
        isCancellation: false,
      };
  }
}
