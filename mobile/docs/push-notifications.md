# Push Notifications Architecture (Kardeşler Cihangir Mobile)

## Client Implementation
1. **Permission Strategy**: Contextual permission request triggered on first order or when enabling marketing notifications in Profile (`registerForPushNotificationsIfPermitted()` in `src/features/notifications/notifications.service.ts`).
2. **Android Notification Channel**: `orders` channel configured with `AndroidImportance.MAX`.
3. **Token Registration & Rotation**:
   - Retrieves Expo Push Token (`ExponentPushToken[...]`) via `Notifications.getExpoPushTokenAsync`.
   - Compares against the last registered token stored in `expo-secure-store` (`kc_last_push_token`).
   - Sends `POST /api/v1/devices` with `{ pushToken, platform, appVersion }` whenever the token is new or rotated.
4. **Notification Tap Routing (Foreground, Background, Terminated)**:
   - Handled in `DeepLinkAndNotificationBridge` (`app/_layout.tsx`) via `addNotificationResponseReceivedListener` and `getLastNotificationResponseAsync`.
   - Every payload URL/orderId is validated against the strict whitelist in `parseSafeDeepLink()` before navigating.
5. **Consent Tracking**:
   - Marketing push toggle in Profile persists opt-in/opt-out via `POST /api/v1/consents`.

## Backend Requirements (See `backend-gaps.md`)
- Replace `FakePushProvider` in `backend/src/adapters/composition-root.ts` with an Expo Push Service adapter (`https://exp.host/--/api/v2/push/send`) + push ticket/receipt polling.
- Enqueue customer push notifications on `OrdersUseCases.transitionOrderAsStaff`.
- Add `DELETE /api/v1/devices` so logout can deactivate the token server-side.

