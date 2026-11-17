# CampusConnect Shared Data Firestore Security Specification

## 1. Data Invariants
1. Unauthenticated users (`request.auth == null`) cannot read or write any collection.
2. `/users/{userId}` is strictly owner-only for `get`, `create`, and `update`. Listing `/users` is denied.
3. `/admins/{adminId}` allows only self-lookup (`adminId == request.auth.uid`) and denies all client writes.
4. `/campusItems/{itemId}` allows signed-in reads/lists scoped to `visibility == 'campus'`, requires a verified user with a saved `/users/{uid}` phone number matching `authorPhone` on `create`, forbids `update`, and restricts `delete` to `authorId == request.auth.uid || isAdmin()`.
5. `/campusRequests/{requestId}` allows signed-in reads/lists scoped to `visibility == 'campus'`, requires `status == 'Open'`, `acceptedById == null`, `requesterId == request.auth.uid`, and saved phone number on `create`.
6. `/campusRequests/{requestId}` updates are strictly action-based and wrapped with `isValidCampusRequest(incoming())` + terminal state lock (`existing().status != 'Fulfilled'`):
   - **Accept**: Only when `existing().status == 'Open'`, `existing().acceptedById == null`, `incoming().status == 'Accepted'`, `request.auth.uid != existing().requesterId`, `incoming().acceptedById == request.auth.uid`, and user has a saved phone number.
   - **Fulfill**: Only when `existing().status == 'Accepted'`, `incoming().status == 'Fulfilled'`, and `request.auth.uid == existing().requesterId || request.auth.uid == existing().acceptedById`.
7. Direct transitions from `'Open'` to `'Fulfilled'` and overwriting an existing `acceptedById` are mathematically impossible.
8. `/exchangeRatings/{ratingId}` allows signed-in reads/lists scoped to `visibility == 'campus'` and stores no private phone numbers or emails.
9. `/exchangeRatings/{ratingId}` requires deterministic ID `ratingId == requestId + '_' + request.auth.uid`, ensuring at most one rating per participant per exchange.
10. `/exchangeRatings/{ratingId}` creation requires the referenced `/campusRequests/{requestId}` document to have `status == 'Fulfilled'`, enforces `raterId == request.auth.uid`, forbids self-rating (`raterId != rateeId`), and restricts `(raterId, rateeId)` strictly to `(requesterId, acceptedById)` with `raterRole == 'borrower'` or `(acceptedById, requesterId)` with `raterRole == 'lender'`.
11. `/exchangeRatings/{ratingId}` updates are allowed only for the rating author (`request.auth.uid == existing().raterId`) within 24 hours of `createdAt` (`request.time < existing().createdAt + duration.value(24, 'h')`), changing only `score`, `comment`, `isEdited: true`, and `updatedAt == request.time`. Deletion is forbidden (`allow delete: if false`).
12. All reads and writes across every collection require a verified Firebase user whose email ends with `@jdcoem.ac.in`, `.jdcoem.ac.in`, `@jdcoem.in`, or `.jdcoem.in` (`isCampusEmail()`).
13. `/publicProfiles/{userId}` stores only non-private profile fields (`uid`, `displayName`, `branch`, `semester`, `visibility == 'campus'`, `updatedAt`) readable by verified JDCOEM users and writable strictly by `userId == request.auth.uid`.
14. `/campusItems/{itemId}` supports `listingType: 'lend' | 'sell'`, requires `price == 0` for `'lend'` and `price >= 1 && price <= 100000` for `'sell'`, starts with `status == 'Available'`, and only transitions from `'Available'` to `'Sold'` for `'sell'` items when `getAfter(/databases/$(database)/documents/payments/$(incoming().paymentId)).data.status == 'Successful'` matches `itemId` and `buyerId == request.auth.uid`.
15. `/payments/{paymentId}` is readable (`get` and `list`) strictly by the associated `buyerId == request.auth.uid || sellerId == request.auth.uid`, never by unrelated students.
16. `/payments/{paymentId}` creation requires `status == 'Pending'`, `verifiedByBackend == false`, `buyerId == request.auth.uid`, `buyerId != sellerId`, and verifies live `/campusItems/{itemId}` has `listingType == 'sell'`, `status == 'Available'`, `authorId == sellerId`, and `price == amount`.
17. `/payments/{paymentId}` updates are allowed strictly from `'Pending'` to `'Successful'` or `'Failed'` with `verifiedByBackend == true` and immutable `amount`, `buyerId`, `sellerId`, `itemId`, `transactionRef`, and `createdAt`. Deletion is forbidden (`allow delete: if false`).

## 2. Adversarial Payloads Covered
1. Unauthenticated read/list on `/campusItems`, `/campusRequests`, `/exchangeRatings`, `/publicProfiles`, or `/payments` -> `PERMISSION_DENIED`.
2. Verified non-JDCOEM email (e.g., `@gmail.com`, `@notjdcoem.ac.in`, or `@notjdcoem.in`) attempting any read or write -> `PERMISSION_DENIED`.
3. Creating an item or request without a saved `/users/{uid}` phone number -> `PERMISSION_DENIED`.
4. Creating a `/campusRequests` doc with initial status `'Accepted'` or `'Fulfilled'` -> `PERMISSION_DENIED`.
5. Requester attempting to accept their own `'Open'` request -> `PERMISSION_DENIED`.
6. Second user attempting to overwrite `acceptedById` on an already `'Accepted'` request -> `PERMISSION_DENIED`.
7. Jumping a request directly from `'Open'` to `'Fulfilled'` -> `PERMISSION_DENIED`.
8. Unrelated third user attempting to mark an `'Accepted'` request `'Fulfilled'` -> `PERMISSION_DENIED`.
9. Non-creator non-admin attempting to delete someone else's `/campusItems` doc -> `PERMISSION_DENIED`.
10. Modifying any `'Fulfilled'` request -> `PERMISSION_DENIED`.
11. Unverified email spoofing admin email or domain -> `PERMISSION_DENIED`.
12. Injecting shadow fields, private `phoneNumber` into `/publicProfiles`, or oversized strings -> `PERMISSION_DENIED`.
13. Backdating or forging `createdAt` / `updatedAt` timestamps -> `PERMISSION_DENIED`.
14. Rating an `'Open'` or `'Accepted'` (unfulfilled) request -> `PERMISSION_DENIED`.
15. Non-participant third party attempting to rate an exchange, or participant attempting to rate themselves -> `PERMISSION_DENIED`.
16. Submitting a duplicate rating with a non-deterministic document ID -> `PERMISSION_DENIED`.
17. Editing another user's rating, editing after the 24-hour window, or deleting any rating -> `PERMISSION_DENIED`.
18. Creating a `/payments` document directly with `status: 'Successful'` or a tampered `amount != item.price` -> `PERMISSION_DENIED`.
19. Reading or listing another student's `/payments` document when neither `buyerId` nor `sellerId` -> `PERMISSION_DENIED`.
20. Marking a `/campusItems` `'sell'` item `'Sold'` without a `'Successful'` payment for that `itemId` and `buyerId` in the same atomic commit (`getAfter`) -> `PERMISSION_DENIED`.
21. Updating a `'Successful'` or `'Failed'` payment record after completion, or deleting a payment record -> `PERMISSION_DENIED`.
22. Purchasing a `'lend'` item or purchasing your own `'sell'` item -> `PERMISSION_DENIED`.
