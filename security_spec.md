# CampusConnect Shared Data Firestore Security Specification

## 1. Data Invariants
1. Unauthenticated users (`request.auth == null`) cannot read or write any collection.
2. `/users/{userId}` is strictly owner-only for `get`, `create`, and `update`. Listing `/users` is denied.
3. `/admins/{adminId}` allows self-lookup (`adminId == request.auth.uid`) and grants read/list/create/delete strictly to verified admins (`isAdmin()` — either the verified bootstrapped admin or an existing `/admins/{uid}` member). Non-admin users cannot list or modify `/admins`.
4. `/campusItems/{itemId}` allows signed-in reads/lists scoped to `visibility == 'campus'`, requires a verified user with a saved `/users/{uid}` phone number matching `authorPhone` on `create`, forbids non-purchase `update`, and restricts `delete` to `authorId == request.auth.uid || isAdmin()`.
5. `/campusRequests/{requestId}` allows signed-in reads/lists scoped to `visibility == 'campus'`, requires `status == 'Open'`, `acceptedById == null`, `borrowerFulfilled == false`, `lenderFulfilled == false`, `requesterId == request.auth.uid`, and saved phone number on `create`.
6. `/campusRequests/{requestId}` updates are strictly action-based and wrapped with `isValidCampusRequest(incoming())` + terminal state lock (`existing().status != 'Fulfilled'`):
   - **Accept**: Only when `existing().status == 'Open'`, `existing().acceptedById == null`, `incoming().status == 'Accepted'`, `incoming().borrowerFulfilled == false`, `incoming().lenderFulfilled == false`, `request.auth.uid != existing().requesterId`, `incoming().acceptedById == request.auth.uid`, and user has a saved phone number.
   - **Borrower Fulfill**: Only when `existing().status == 'Accepted'`, `request.auth.uid == existing().requesterId`, `borrowerFulfilled` transitions from `false` to `true` without altering `lenderFulfilled`, and `status` becomes `'Fulfilled'` ONLY if `lenderFulfilled` was already `true` (otherwise remains `'Accepted'`).
   - **Lender Fulfill**: Only when `existing().status == 'Accepted'`, `request.auth.uid == existing().acceptedById`, `lenderFulfilled` transitions from `false` to `true` without altering `borrowerFulfilled`, and `status` becomes `'Fulfilled'` ONLY if `borrowerFulfilled` was already `true` (otherwise remains `'Accepted'`).
7. Direct transitions from `'Open'` to `'Fulfilled'`, single-party fulfillment without both `borrowerFulfilled == true` and `lenderFulfilled == true`, forging the other participant's fulfillment flag, and overwriting an existing `acceptedById` are mathematically impossible.
8. `/exchangeRatings/{ratingId}` allows signed-in reads/lists scoped to `visibility == 'campus'` and stores no private phone numbers or emails.
9. `/exchangeRatings/{ratingId}` requires deterministic ID `ratingId == requestId + '_' + request.auth.uid`, ensuring at most one rating per participant per exchange.
10. `/exchangeRatings/{ratingId}` creation requires the referenced `/campusRequests/{requestId}` document to have `status == 'Fulfilled'` (which requires both `borrowerFulfilled == true` and `lenderFulfilled == true`), enforces `raterId == request.auth.uid`, forbids self-rating (`raterId != rateeId`), and restricts `(raterId, rateeId)` strictly to `(requesterId, acceptedById)` with `raterRole == 'borrower'` or `(acceptedById, requesterId)` with `raterRole == 'lender'`.
11. `/exchangeRatings/{ratingId}` updates are allowed only for the rating author (`request.auth.uid == existing().raterId`) within 24 hours of `createdAt` (`request.time < existing().createdAt + duration.value(24, 'h')`), changing only `score`, `comment`, `isEdited: true`, and `updatedAt == request.time`. Deletion is forbidden (`allow delete: if false`).
12. All reads and writes across every collection require a verified Firebase user whose email ends with `@jdcoem.ac.in`, `.jdcoem.ac.in`, `@jdcoem.in`, `.jdcoem.in`, or is the verified bootstrapped admin email (`isCampusEmail()`).
13. `/publicProfiles/{userId}` stores only non-private profile fields (`uid`, `displayName`, `branch`, `semester`, `visibility == 'campus'`, `updatedAt`) readable by verified JDCOEM users and writable strictly by `userId == request.auth.uid`.
14. `/campusItems/{itemId}` supports `listingType: 'lend' | 'sell'`, requires `price == 0` for `'lend'` and `price >= 1 && price <= 100000` for `'sell'`, starts with `status == 'Available'`, and only transitions from `'Available'` to `'Sold'` for `'sell'` items when `getAfter(/databases/$(database)/documents/payments/$(incoming().paymentId)).data.status == 'Successful'` matches `itemId` and `buyerId == request.auth.uid`.
15. `/payments/{paymentId}` is readable (`get` and `list`) strictly by the associated `buyerId == request.auth.uid || sellerId == request.auth.uid`, never by unrelated students.
16. `/payments/{paymentId}` creation requires `status == 'Pending'`, `verifiedByBackend == false`, `buyerId == request.auth.uid`, `buyerId != sellerId`, and verifies live `/campusItems/{itemId}` has `listingType == 'sell'`, `status == 'Available'`, `authorId == sellerId`, and `price == amount`.
17. `/payments/{paymentId}` updates are allowed strictly from `'Pending'` to `'Successful'` or `'Failed'` with `verifiedByBackend == true` and immutable `amount`, `buyerId`, `sellerId`, `itemId`, `transactionRef`, and `createdAt`. Deletion is forbidden (`allow delete: if false`).
18. `/purchaseRequests/{requestId}` is strictly private: `get` and `list` are allowed ONLY when `existing().borrowerId == request.auth.uid || existing().lenderId == request.auth.uid`, ensuring private borrower and lender phone numbers are never exposed to any other student.
19. `/purchaseRequests/{requestId}` creation applies to permanent-sale (`listingType == 'sell'`, `status == 'Available'`) items only, forbids self-purchase (`borrowerId != lenderId`), verifies borrower's saved phone number, initializes `status == 'Pending'`, `borrowerConfirmed == false`, `lenderConfirmed == false`, `finalAmount == listedPrice`, and atomically creates `/purchaseRequestLocks/{itemId}_{borrowerId}` (`!exists` before, `existsAfter` after) to prevent duplicate active purchase requests for the same item.
20. `/purchaseRequests/{requestId}` updates are terminal-state locked (`existing().status == 'Pending'`) and split into three strict actions:
    - **Borrower Confirm (`Payment made`)**: Only by `borrowerId`; records `borrowerConfirmed: true`, `borrowerConfirmedAt: request.time`; completes (`status: 'Completed'`, `completedAt: request.time`) and atomically marks `/campusItems/{itemId}` `Sold` and deletes the lock ONLY if `lenderConfirmed` was already `true`.
    - **Lender Confirm (`Payment received`)**: Only by `lenderId`; records `lenderConfirmed: true`, `lenderConfirmedAt: request.time`; completes (`status: 'Completed'`, `completedAt: request.time`) and atomically marks `/campusItems/{itemId}` `Sold` and deletes the lock ONLY if `borrowerConfirmed` was already `true`.
    - **Cancel Request**: Allowed by either `borrowerId` or `lenderId` while `status == 'Pending'`; records `status: 'Cancelled'`, `cancelledAt: request.time`, `cancelledById: request.auth.uid`, `cancelledByRole`, and atomically deletes `/purchaseRequestLocks/{itemId}_{borrowerId}`.
21. `/purchaseRequests/{requestId}` forbids deletion (`allow delete: if false`) so a full timestamped audit trail of requests, confirmations, cancellations, and completion is preserved.

## 2. Adversarial Payloads Covered
1. Unauthenticated read/list on `/campusItems`, `/campusRequests`, `/exchangeRatings`, `/publicProfiles`, `/payments`, or `/purchaseRequests` -> `PERMISSION_DENIED`.
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
20. Marking a `/campusItems` `'sell'` item `'Sold'` without a `'Successful'` payment or `'Completed'` purchase request for that `itemId` and `buyerId` in the same atomic commit (`getAfter`) -> `PERMISSION_DENIED`.
21. Updating a `'Successful'` or `'Failed'` payment record after completion, or deleting a payment record -> `PERMISSION_DENIED`.
22. Purchasing a `'lend'` item or purchasing your own `'sell'` item -> `PERMISSION_DENIED`.
23. Third-party student attempting to `get` or `list` another pair's `/purchaseRequests` or `/purchaseRequestLocks` -> `PERMISSION_DENIED`.
24. Borrower sending a duplicate `/purchaseRequests` document while `/purchaseRequestLocks/{itemId}_{borrowerId}` already exists -> `PERMISSION_DENIED`.
25. Borrower marking a `/purchaseRequests` document `'Completed'` before `lenderConfirmed == true`, or forging `lenderConfirmed: true` -> `PERMISSION_DENIED`.
26. Lender marking a `/purchaseRequests` document `'Completed'` before `borrowerConfirmed == true`, or altering `finalAmount` after the first confirmation -> `PERMISSION_DENIED`.
27. Modifying or cancelling a `'Completed'` or `'Cancelled'` purchase request, or deleting a purchase request -> `PERMISSION_DENIED`.
28. Sending a purchase request for a `'lend'` item or for an already `'Sold'` item -> `PERMISSION_DENIED`.
