import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FirebaseClientConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseConfig(): FirebaseClientConfig | null {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8');
    const parsed = JSON.parse(raw) as Partial<FirebaseClientConfig>;
    if (!parsed.projectId || !parsed.apiKey) return null;
    return {
      projectId: parsed.projectId,
      apiKey: parsed.apiKey,
      firestoreDatabaseId: parsed.firestoreDatabaseId || '(default)',
    };
  } catch {
    return null;
  }
}

const BOOTSTRAPPED_ADMIN_EMAIL = 'daiviktiwari28@gmail.com';
const ALLOWED_CAMPUS_EMAIL_PATTERN = /^[^@\s]+@([a-z0-9-]+\.)*jdcoem\.(ac\.)?in$/;
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

const CONFIGURED_PAYMENT_METHODS = [
  {
    id: 'Campus UPI',
    label: 'Campus UPI',
    description: 'Pay using your college or personal UPI ID and verify transaction reference.',
  },
  {
    id: 'Campus Direct Pay',
    label: 'Campus Direct Pay',
    description: 'Confirm direct campus settlement with backend transaction verification.',
  },
] as const;

type PaymentMethodId = (typeof CONFIGURED_PAYMENT_METHODS)[number]['id'];

function isAllowedPaymentMethod(value: unknown): value is PaymentMethodId {
  return value === 'Campus UPI' || value === 'Campus Direct Pay';
}

interface VerifiedUser {
  uid: string;
  email: string;
  displayName: string;
}

async function verifyFirebaseBearerToken(
  authHeader: string | undefined,
  apiKey: string
): Promise<{ ok: true; user: VerifiedUser; idToken: string } | { ok: false; status: number; error: string }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Missing Firebase authorization token.' };
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    return { ok: false, status: 401, error: 'Empty authorization token.' };
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!response.ok) {
    return { ok: false, status: 401, error: 'Your sign-in session could not be verified. Sign in again.' };
  }

  const payload = (await response.json()) as {
    users?: Array<{
      localId?: string;
      email?: string;
      emailVerified?: boolean;
      displayName?: string;
    }>;
  };

  const account = payload.users?.[0];
  if (!account || !account.localId || !account.email) {
    return { ok: false, status: 401, error: 'Invalid Firebase user session.' };
  }

  const normalizedEmail = account.email.trim().toLowerCase();
  const isAllowedEmail =
    ALLOWED_CAMPUS_EMAIL_PATTERN.test(normalizedEmail) ||
    normalizedEmail === BOOTSTRAPPED_ADMIN_EMAIL;
  if (!account.emailVerified || !isAllowedEmail) {
    return {
      ok: false,
      status: 403,
      error: 'Only verified @jdcoem.ac.in or .jdcoem.in accounts can process CampusConnect payments.',
    };
  }

  return {
    ok: true,
    idToken,
    user: {
      uid: account.localId,
      email: normalizedEmail,
      displayName: account.displayName?.trim() || 'Campus Student',
    },
  };
}

type FirestorePrimitive = string | number | boolean | null;
type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string };

function encodeValue(value: FirestorePrimitive): FirestoreValue {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  return { stringValue: String(value) };
}

function encodeFields(record: Record<string, FirestorePrimitive>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [key, val] of Object.entries(record)) {
    fields[key] = encodeValue(val);
  }
  return fields;
}

function decodeValue(value: FirestoreValue | undefined): FirestorePrimitive {
  if (!value) return null;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('stringValue' in value) return String(value.stringValue);
  if ('timestampValue' in value) return String(value.timestampValue);
  return null;
}

function decodeFields(
  fields: Record<string, FirestoreValue> | undefined
): Record<string, FirestorePrimitive> {
  const result: Record<string, FirestorePrimitive> = {};
  if (!fields) return result;
  for (const [key, value] of Object.entries(fields)) {
    result[key] = decodeValue(value);
  }
  return result;
}

async function firestoreGetDoc(
  config: FirebaseClientConfig,
  idToken: string,
  collectionName: string,
  docId: string
): Promise<{
  exists: boolean;
  updateTime?: string;
  fields: Record<string, FirestorePrimitive>;
}> {
  const dbId = config.firestoreDatabaseId || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    config.projectId
  )}/databases/${encodeURIComponent(dbId)}/documents/${encodeURIComponent(
    collectionName
  )}/${encodeURIComponent(docId)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (res.status === 404) {
    return { exists: false, fields: {} };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Firestore read failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as {
    updateTime?: string;
    fields?: Record<string, FirestoreValue>;
  };

  return {
    exists: true,
    updateTime: data.updateTime,
    fields: decodeFields(data.fields),
  };
}

interface CommitWrite {
  update: {
    name: string;
    fields: Record<string, FirestoreValue>;
  };
  updateMask?: { fieldPaths: string[] };
  updateTransforms?: Array<{ fieldPath: string; setToServerValue: 'REQUEST_TIME' }>;
  currentDocument?: { exists?: boolean; updateTime?: string };
}

async function firestoreCommit(
  config: FirebaseClientConfig,
  idToken: string,
  writes: CommitWrite[]
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const dbId = config.firestoreDatabaseId || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    config.projectId
  )}/databases/${encodeURIComponent(dbId)}/documents:commit`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    return { ok: false, status: res.status, message: bodyText || 'Commit failed.' };
  }

  return { ok: true };
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  const firebaseConfig = loadFirebaseConfig();

  app.get('/api/payments/methods', (_req: Request, res: Response) => {
    res.json({
      currency: 'INR',
      configured: Boolean(firebaseConfig),
      methods: CONFIGURED_PAYMENT_METHODS,
    });
  });

  app.post('/api/payments/initiate', async (req: Request, res: Response) => {
    if (!firebaseConfig) {
      res.status(503).json({ error: 'Firebase is not configured for payments.' });
      return;
    }

    const authResult = await verifyFirebaseBearerToken(
      req.headers.authorization,
      firebaseConfig.apiKey
    );
    if (!authResult.ok) {
      res.status(authResult.status).json({ error: authResult.error });
      return;
    }

    const body = (req.body || {}) as {
      itemId?: unknown;
      paymentMethod?: unknown;
      payerAccountRef?: unknown;
    };

    const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : '';
    if (!SAFE_ID_PATTERN.test(itemId)) {
      res.status(400).json({ error: 'Invalid item identifier.' });
      return;
    }

    const paymentMethod = body.paymentMethod;
    if (!isAllowedPaymentMethod(paymentMethod)) {
      res.status(400).json({ error: 'Select a configured CampusConnect payment method.' });
      return;
    }

    const rawAccountRef = typeof body.payerAccountRef === 'string' ? body.payerAccountRef.trim() : '';
    if (paymentMethod === 'Campus UPI' && rawAccountRef.length < 3) {
      res.status(400).json({ error: 'Enter your UPI ID or reference before continuing.' });
      return;
    }
    const payerAccountRef = (rawAccountRef || 'JDCOEM Campus Direct').slice(0, 80);

    try {
      const [itemDoc, buyerDoc] = await Promise.all([
        firestoreGetDoc(firebaseConfig, authResult.idToken, 'campusItems', itemId),
        firestoreGetDoc(firebaseConfig, authResult.idToken, 'users', authResult.user.uid),
      ]);

      if (!itemDoc.exists) {
        res.status(404).json({ error: 'This item could not be found.' });
        return;
      }

      if (!buyerDoc.exists || typeof buyerDoc.fields.phoneNumber !== 'string') {
        res.status(400).json({ error: 'Complete your student profile before making a payment.' });
        return;
      }

      const listingType = itemDoc.fields.listingType;
      const itemStatus = itemDoc.fields.status;
      const sellerId = typeof itemDoc.fields.authorId === 'string' ? itemDoc.fields.authorId : '';
      const sellerName =
        typeof itemDoc.fields.authorName === 'string' && itemDoc.fields.authorName.trim()
          ? itemDoc.fields.authorName.trim().slice(0, 80)
          : 'Campus Seller';
      const itemTitle =
        typeof itemDoc.fields.title === 'string' && itemDoc.fields.title.trim()
          ? itemDoc.fields.title.trim().slice(0, 100)
          : 'Campus Item';
      const authoritativePrice = Number(itemDoc.fields.price);

      if (listingType !== 'sell') {
        res.status(400).json({
          error: 'Only permanent-sale items require payment. Use Request for lending/borrowing items.',
        });
        return;
      }

      if (itemStatus !== 'Available') {
        res.status(409).json({ error: 'This item has already been sold.' });
        return;
      }

      if (!sellerId || sellerId === authResult.user.uid) {
        res.status(400).json({ error: 'You cannot purchase your own listed item.' });
        return;
      }

      if (!Number.isFinite(authoritativePrice) || authoritativePrice < 1 || authoritativePrice > 100000) {
        res.status(400).json({ error: 'Item price is invalid.' });
        return;
      }

      const buyerName =
        (typeof buyerDoc.fields.displayName === 'string' && buyerDoc.fields.displayName.trim()) ||
        authResult.user.displayName;
      const paymentId = `pay_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const transactionRef = `CC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const challengeToken = crypto.randomBytes(24).toString('hex');
      const challengeHash = sha256Hex(
        `${challengeToken}:${paymentId}:${authResult.user.uid}:${authoritativePrice}`
      );

      const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
      const docPrefix = `projects/${firebaseConfig.projectId}/databases/${dbId}/documents`;

      const commitResult = await firestoreCommit(firebaseConfig, authResult.idToken, [
        {
          update: {
            name: `${docPrefix}/payments/${paymentId}`,
            fields: encodeFields({
              transactionRef,
              itemId,
              itemTitle,
              listingType: 'sell',
              amount: authoritativePrice,
              currency: 'INR',
              paymentMethod,
              payerAccountRef,
              status: 'Pending',
              verifiedByBackend: false,
              verificationCode: challengeHash,
              failureReason: null,
              buyerId: authResult.user.uid,
              buyerName: buyerName.slice(0, 80),
              sellerId,
              sellerName,
              visibility: 'private',
            }),
          },
          updateTransforms: [
            { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
            { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
          ],
          currentDocument: { exists: false },
        },
      ]);

      if (!commitResult.ok) {
        res.status(403).json({
          error: 'Could not initialize payment record. Make sure your student profile is saved.',
        });
        return;
      }

      res.status(201).json({
        paymentId,
        transactionRef,
        itemId,
        itemTitle,
        amount: authoritativePrice,
        currency: 'INR',
        paymentMethod,
        payerAccountRef,
        status: 'Pending',
        sellerId,
        sellerName,
        challengeToken,
      });
    } catch (error) {
      console.error('Payment initiation error:', error);
      res.status(500).json({ error: 'Unable to initiate payment right now.' });
    }
  });

  app.post('/api/payments/verify', async (req: Request, res: Response) => {
    if (!firebaseConfig) {
      res.status(503).json({ error: 'Firebase is not configured for payments.' });
      return;
    }

    const authResult = await verifyFirebaseBearerToken(
      req.headers.authorization,
      firebaseConfig.apiKey
    );
    if (!authResult.ok) {
      res.status(authResult.status).json({ error: authResult.error });
      return;
    }

    const body = (req.body || {}) as {
      paymentId?: unknown;
      itemId?: unknown;
      challengeToken?: unknown;
      outcome?: unknown;
      confirmationRef?: unknown;
    };

    const paymentId = typeof body.paymentId === 'string' ? body.paymentId.trim() : '';
    const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : '';
    const challengeToken = typeof body.challengeToken === 'string' ? body.challengeToken.trim() : '';
    const requestedOutcome = body.outcome === 'fail' ? 'fail' : 'confirm';
    const confirmationRef =
      typeof body.confirmationRef === 'string' ? body.confirmationRef.trim() : '';

    if (!SAFE_ID_PATTERN.test(paymentId) || !SAFE_ID_PATTERN.test(itemId) || !challengeToken) {
      res.status(400).json({ error: 'Missing required backend payment verification details.' });
      return;
    }

    try {
      const [paymentDoc, itemDoc] = await Promise.all([
        firestoreGetDoc(firebaseConfig, authResult.idToken, 'payments', paymentId),
        firestoreGetDoc(firebaseConfig, authResult.idToken, 'campusItems', itemId),
      ]);

      if (!paymentDoc.exists) {
        res.status(404).json({ error: 'Payment transaction record not found.' });
        return;
      }

      if (paymentDoc.fields.buyerId !== authResult.user.uid) {
        res.status(403).json({ error: 'You are not authorized to verify this payment.' });
        return;
      }

      if (paymentDoc.fields.itemId !== itemId) {
        res.status(400).json({ error: 'Payment record does not match this item.' });
        return;
      }

      if (paymentDoc.fields.status !== 'Pending') {
        res.status(200).json({
          ok: paymentDoc.fields.status === 'Successful',
          status: paymentDoc.fields.status,
          transactionRef: paymentDoc.fields.transactionRef,
          amount: paymentDoc.fields.amount,
          failureReason: paymentDoc.fields.failureReason,
          message:
            paymentDoc.fields.status === 'Successful'
              ? 'This payment was already verified.'
              : 'This payment already ended in failure.',
        });
        return;
      }

      const authoritativeAmount = Number(paymentDoc.fields.amount);
      const storedChallengeHash =
        typeof paymentDoc.fields.verificationCode === 'string'
          ? paymentDoc.fields.verificationCode
          : '';
      const expectedChallengeHash = sha256Hex(
        `${challengeToken}:${paymentId}:${authResult.user.uid}:${authoritativeAmount}`
      );

      if (!storedChallengeHash || !safeEqualHex(storedChallengeHash, expectedChallengeHash)) {
        res.status(403).json({ error: 'Payment verification challenge mismatch.' });
        return;
      }

      const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
      const docPrefix = `projects/${firebaseConfig.projectId}/databases/${dbId}/documents`;

      const markPaymentFailed = async (reason: string) => {
        const failedCode = `FAILED_${sha256Hex(`${paymentId}:${reason}`).slice(0, 48)}`;
        await firestoreCommit(firebaseConfig, authResult.idToken, [
          {
            update: {
              name: `${docPrefix}/payments/${paymentId}`,
              fields: encodeFields({
                status: 'Failed',
                verifiedByBackend: true,
                verificationCode: failedCode,
                failureReason: reason.slice(0, 200),
              }),
            },
            updateMask: {
              fieldPaths: ['status', 'verifiedByBackend', 'verificationCode', 'failureReason'],
            },
            updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
            currentDocument: { updateTime: paymentDoc.updateTime },
          },
        ]);

        res.status(200).json({
          ok: false,
          status: 'Failed',
          paymentId,
          transactionRef: paymentDoc.fields.transactionRef,
          amount: authoritativeAmount,
          failureReason: reason,
          message: reason,
        });
      };

      if (requestedOutcome === 'fail') {
        await markPaymentFailed('Payment authorization was declined or cancelled during verification.');
        return;
      }

      if (
        paymentDoc.fields.paymentMethod === 'Campus UPI' &&
        confirmationRef.length > 0 &&
        confirmationRef.length < 4
      ) {
        await markPaymentFailed('Invalid UPI confirmation reference provided.');
        return;
      }

      if (!itemDoc.exists || itemDoc.fields.listingType !== 'sell') {
        await markPaymentFailed('This item is no longer listed for permanent sale.');
        return;
      }

      if (itemDoc.fields.status !== 'Available') {
        await markPaymentFailed('Item was already purchased by another student.');
        return;
      }

      const itemPrice = Number(itemDoc.fields.price);
      if (itemPrice !== authoritativeAmount) {
        await markPaymentFailed('Item price changed before verification completed.');
        return;
      }

      const buyerName =
        (typeof paymentDoc.fields.buyerName === 'string' && paymentDoc.fields.buyerName) ||
        authResult.user.displayName;
      const receiptCode = `VERIFIED_${sha256Hex(
        `${paymentId}:${paymentDoc.fields.transactionRef}:${authResult.user.uid}:${authoritativeAmount}`
      ).slice(0, 48)}`;

      const commitResult = await firestoreCommit(firebaseConfig, authResult.idToken, [
        {
          update: {
            name: `${docPrefix}/payments/${paymentId}`,
            fields: encodeFields({
              status: 'Successful',
              verifiedByBackend: true,
              verificationCode: receiptCode,
              failureReason: null,
            }),
          },
          updateMask: {
            fieldPaths: ['status', 'verifiedByBackend', 'verificationCode', 'failureReason'],
          },
          updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
          currentDocument: { updateTime: paymentDoc.updateTime },
        },
        {
          update: {
            name: `${docPrefix}/campusItems/${itemId}`,
            fields: encodeFields({
              status: 'Sold',
              soldToId: authResult.user.uid,
              soldToName: buyerName.slice(0, 80),
              paymentId,
            }),
          },
          updateMask: {
            fieldPaths: ['status', 'soldToId', 'soldToName', 'paymentId'],
          },
          updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
          currentDocument: { updateTime: itemDoc.updateTime },
        },
      ]);

      if (!commitResult.ok) {
        await markPaymentFailed(
          'Could not finalize purchase because the item state changed concurrently.'
        );
        return;
      }

      res.status(200).json({
        ok: true,
        status: 'Successful',
        paymentId,
        transactionRef: paymentDoc.fields.transactionRef,
        verificationCode: receiptCode,
        amount: authoritativeAmount,
        currency: 'INR',
        message: 'Payment verified by backend and item purchase completed.',
      });
    } catch (error) {
      console.error('Payment verification error:', error);
      res.status(500).json({ error: 'Unable to verify payment right now.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`CampusConnect server running on http://0.0.0.0:${port}`);
  });
}

void startServer();
