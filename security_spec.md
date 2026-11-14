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

## 2. Adversarial Payloads Covered
1. Unauthenticated read/list on `/campusItems` or `/campusRequests` -> `PERMISSION_DENIED`.
2. Creating an item or request without a saved `/users/{uid}` phone number -> `PERMISSION_DENIED`.
3. Creating a `/campusRequests` doc with initial status `'Accepted'` or `'Fulfilled'` -> `PERMISSION_DENIED`.
4. Requester attempting to accept their own `'Open'` request -> `PERMISSION_DENIED`.
5. Second user attempting to overwrite `acceptedById` on an already `'Accepted'` request -> `PERMISSION_DENIED`.
6. Jumping a request directly from `'Open'` to `'Fulfilled'` -> `PERMISSION_DENIED`.
7. Unrelated third user attempting to mark an `'Accepted'` request `'Fulfilled'` -> `PERMISSION_DENIED`.
8. Non-creator non-admin attempting to delete someone else's `/campusItems` doc -> `PERMISSION_DENIED`.
9. Modifying any `'Fulfilled'` request -> `PERMISSION_DENIED`.
10. Unverified email spoofing admin email -> `PERMISSION_DENIED`.
11. Injecting shadow fields or oversized strings (`> 250000` photoUrl, `> 400` description) -> `PERMISSION_DENIED`.
12. Backdating or forging `createdAt` / `updatedAt` timestamps -> `PERMISSION_DENIED`.
