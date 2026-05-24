# AdhanNow Android Rebuild Context for Android Studio Gemini

## Purpose of This Context

This is the current project handoff/context for Android Studio Gemini.

The goal is to finish the **Android rebuild of AdhanNow** without bringing back the previous broken Android login flow. The previous Android attempt failed mainly because Amazon Login was using the deprecated implicit grant flow (`response_type=token`) and the app/backend flow did not cleanly exchange an Amazon authorization code for a durable AdhanNow app session token.

Gemini should help verify, build, and debug Android, but should **not redesign the whole app** or rewrite unrelated backend/Alexa logic.

---

## Project Identity

**Project name:** AdhanNow  
**Also referenced as:** Adhan Now, AdhanApp Experimental, TheCoded AdhanApp  
**GitHub repo:** `hamzafareed01/TheCoded_AdhanApp`  
**Current branch:** `android-clean-rebuild`

AdhanNow is an Islamic prayer companion app with:

- Prayer times
- Onboarding flow
- Location setup
- Prayer calculation settings
- Mosque-based timing override
- Sect/madhhab-aware settings
- Adhan reciter selection
- After-Adhan dua/surah playback
- Alexa account connection
- Alexa skill linking
- Alexa playback target selection
- Alexa Smart Home style endpoint discovery
- Dashboard
- Settings
- Qiblah
- Dua/Quran features
- User manual/help support
- Future Android Play Store release path

The Android app should act as a mobile delivery channel for the same AdhanNow product. It should not become a separate product with separate business logic.

---

## High-Level Architecture

### Frontend

Path:

```text
backend/frontend
```

Stack:

```text
React + Vite + TypeScript + Capacitor
```

Important frontend files:

```text
backend/frontend/src/lib/api.ts
backend/frontend/src/lib/amazonLogin.ts
backend/frontend/src/components/onboarding/Step1Welcome.tsx
backend/frontend/src/components/onboarding/Step2ConnectAccounts.tsx
backend/frontend/src/components/onboarding/Step3Location.tsx
backend/frontend/src/components/onboarding/Step4PrayerSettings.tsx
backend/frontend/src/components/onboarding/Step5DevicesAdhan.tsx
backend/frontend/src/components/onboarding/Step6Summary.tsx
backend/frontend/src/components/settings/Settings.tsx
backend/frontend/src/components/dashboard/Dashboard.tsx
backend/frontend/src/components/alexa/AlexaSetup.tsx
backend/frontend/src/components/alexa/AlexaLinkAuthorize.tsx
```

Frontend production URL:

```text
https://nice-ground-009684610.1.azurestaticapps.net
```

Backend/API production URL:

```text
https://app-adhannow-api-prod-cdfdcsfeb5gtd7e9.centralus-01.azurewebsites.net
```

---

### Backend

Path:

```text
backend
```

Stack:

```text
Node.js + Express
```

Hosting:

```text
Azure App Service
```

Database:

```text
Azure SQL database: adhannow_prod
```

Important backend files:

```text
backend/index.js
backend/db/sql.js
backend/services/alexaOauth.js
backend/services/alexaPlaybackTargets.js
backend/services/alexaRoutineDispatch.js
backend/services/alexaSmartHome.js
backend/scripts/migrate.cjs
backend/package.json
```

Important backend routes:

```text
GET  /api/health
GET  /api/health/db

POST /api/integrations/alexa/login
POST /api/integrations/alexa/login-code
GET  /api/integrations

POST /api/alexa/account-linking/start
POST /api/alexa/account-linking/complete
GET  /api/alexa/account-linking/status

GET  /api/alexa/devices
GET  /api/alexa/endpoints
POST /api/alexa/endpoints/selections

GET  /api/user/settings
PUT  /api/user/settings
POST /api/user/settings
```

The backend and Azure SQL database remain the source of truth for user profile/settings, Alexa linking state, selected devices, playback targets, quiet-down policy, and prayer configuration.

---

## Current Git Status / Branch Context

The rebuild branch has already been created and pushed:

```text
android-clean-rebuild
```

Known important commits on this branch:

```text
677bb85 Reset to clean web baseline before Android rebuild
6dc9629 Preserve backend Alexa + API logic before Android rebuild
```

The old broken Android wrapper was removed before starting this clean rebuild. Any Android files now present should be treated as the **new clean Android rebuild**, not the old wrapper.

Do **not** push directly to `main`.

Do **not** commit until the user has verified:

```text
npm run build
npx cap sync android
Android Studio Gradle sync/build
Android login flow test
```

---

## What Went Wrong Before

The previous Android attempt failed because the app mixed multiple incompatible approaches:

1. Web/PWA Amazon login
2. Capacitor WebView callback behavior
3. `https://localhost` native callback assumptions
4. Production web callback assumptions
5. Amazon Login client ID mismatch risk
6. Attempts to put custom-scheme URLs directly into Amazon LWA Allowed Return URLs
7. Android app not reliably reclaiming the auth redirect
8. Use of deprecated Amazon implicit grant flow:
   ```text
   response_type=token
   ```

The visible Android error was:

```text
400 Bad Request
Implicit Grant (response_type=token) is no longer supported.
errorMsg=lwa-invalid-parameter-unauthorized-implicit-grant-request
```

The app must now use the future-safe Amazon Authorization Code Grant flow:

```text
response_type=code
```

---

## Critical Amazon Login Rule

Amazon Login with Amazon itself is **not deprecated**.

The deprecated part is the old implicit grant:

```text
response_type=token
```

The app must use:

```text
response_type=code
```

Do not use `response_type=token` anywhere.

Do not store an Amazon authorization code as a token.

Do not pass an Amazon authorization code into a function that expects an Amazon access token.

---

## Correct Android/Web Amazon Auth Flow

The desired production-safe flow is:

1. User opens Android app.
2. User reaches onboarding Step 2.
3. User taps “Connect Amazon”.
4. Android opens Amazon Login externally using Capacitor Browser or a system browser/custom tab.
5. The Amazon authorize URL uses:
   ```text
   response_type=code
   ```
6. Amazon returns to the allowed HTTPS callback:
   ```text
   https://nice-ground-009684610.1.azurestaticapps.net/onboarding/step2?code=...
   ```
7. Frontend sends the code to backend:
   ```text
   POST /api/integrations/alexa/login-code
   ```
8. Backend exchanges the Amazon authorization code with Amazon:
   ```text
   https://api.amazon.com/auth/o2/token
   ```
9. Backend receives an Amazon access token.
10. Backend fetches the Amazon user profile.
11. Backend creates or finds the AdhanNow user.
12. Backend creates a durable AdhanNow app session token:
   ```text
   adhapp_...
   ```
13. Backend returns:
   ```json
   {
     "ok": true,
     "userKey": "...",
     "sessionToken": "adhapp_...",
     "sessionExpiresAt": "...",
     "alexa": {...},
     "amazon": {...}
   }
   ```
14. Web callback redirects to Android:
   ```text
   com.thecoded.adhannow://auth?session_token=...
   ```
15. Android receives the deep link.
16. Android stores the AdhanNow `sessionToken`.
17. Step 2 shows Amazon/Alexa as connected.

The Android app should store the AdhanNow `sessionToken`, not an Amazon access token and not an authorization code.

---

## Important OAuth / Redirect Rule

Do **not** put this custom scheme into Amazon Login with Amazon Allowed Return URLs:

```text
com.thecoded.adhannow://auth
```

Amazon LWA web settings should use HTTPS or localhost callback URLs only.

Correct LWA Allowed Return URLs for the web/native relay should include:

```text
https://nice-ground-009684610.1.azurestaticapps.net/onboarding/step2
http://localhost:5173/onboarding/step2
```

The custom scheme belongs in Android:

```text
backend/frontend/android/app/src/main/AndroidManifest.xml
```

and in the app relay logic, not in the LWA web console return URLs.

---

## Amazon / Alexa Client Separation

This project has two different Amazon-related concerns.

### 1. Login with Amazon for user/app login

Used by Step 2 to connect the user’s Amazon account to AdhanNow.

Frontend variables:

```text
VITE_AMAZON_CLIENT_ID
VITE_AMAZON_RETURN_URL
VITE_API_BASE_URL
```

Known working LWA client ID for Step 2:

```text
amzn1.application-oa2-client.383c219cb1ca42fdbd844e17e11aa843
```

Backend variables for Amazon login/code exchange should include:

```text
AMAZON_LOGIN_CLIENT_ID
AMAZON_LOGIN_CLIENT_SECRET
AMAZON_LOGIN_REDIRECT_URIS
APP_SESSION_SECRET
APP_SESSION_TTL_MS
```

### 2. Alexa skill account linking / app-to-app linking

Handled by backend routes and Alexa developer console settings.

Backend variables include:

```text
ALEXA_OAUTH_CLIENT_ID
ALEXA_OAUTH_CLIENT_SECRET
ALEXA_OAUTH_REDIRECT_URIS

ALEXA_APP_LINK_CLIENT_ID
ALEXA_APP_LINK_CLIENT_SECRET
ALEXA_APP_LINK_REDIRECT_URIS

ALEXA_SKILL_ID
ALEXA_SKILL_STAGE
ALEXA_SKILL_INVOCATION_NAME
```

Do **not** mix:

```text
ALEXA_OAUTH_*
ALEXA_APP_LINK_*
AMAZON_LOGIN_*
```

Do not treat the Step 2 Amazon Login redirect as the Alexa skill account-linking redirect.

---

## Android Package and App Identity

Preferred Android package:

```text
com.thecoded.adhannow
```

App name:

```text
AdhanNow
```

Do not casually change package ID because it affects Android identity, Play Store identity, and deep links.

Capacitor config should use:

```json
{
  "appId": "com.thecoded.adhannow",
  "appName": "AdhanNow",
  "webDir": "build"
}
```

---

## Required Android Manifest Deep Link

File:

```text
backend/frontend/android/app/src/main/AndroidManifest.xml
```

Inside `MainActivity`, the app should handle:

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />

    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />

    <data
        android:scheme="com.thecoded.adhannow"
        android:host="auth" />
</intent-filter>
```

This means Android should open AdhanNow for URLs like:

```text
com.thecoded.adhannow://auth?session_token=...
```

`MainActivity` should remain a clean Capacitor activity:

```java
package com.thecoded.adhannow;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}
```

---

## Files Gemini Must Be Careful With

Gemini should avoid broad automatic rewrites. Make targeted edits only.

### Frontend Auth Files

```text
backend/frontend/src/lib/amazonLogin.ts
backend/frontend/src/components/onboarding/Step2ConnectAccounts.tsx
backend/frontend/src/lib/api.ts
```

Responsibilities:

- Use `response_type=code`, never `response_type=token`.
- Preserve web/PWA Step 2 behavior.
- Add Android behavior only inside native runtime checks.
- Use backend `/api/integrations/alexa/login-code` for code exchange.
- Prefer `sessionToken` over `accessToken` when storing durable app auth.
- Do not store authorization code as a token.
- Do not rely on popup flow in Android.
- Do not hardcode secrets.

### Backend Auth Files

```text
backend/index.js
backend/services/alexaOauth.js
backend/db/sql.js
```

Responsibilities:

- Preserve existing Amazon profile/user creation logic.
- Add/keep app session token support:
  ```text
  APP_SESSION_PREFIX = "adhapp_"
  createAppSessionToken()
  verifyAppSessionToken()
  getAppSessionSecret()
  getAppSessionTtlMs()
  ```
- `POST /api/integrations/alexa/login-code` should:
   - accept `{ code, redirectUri }`
   - exchange code with Amazon
   - fetch Amazon profile
   - ensure/create user
   - return `sessionToken`
- `requireAmazonAuth` should accept `adhapp_` app session tokens and avoid unnecessary Amazon profile calls when valid.
- Do not rewrite Alexa OAuth/Smart Home logic unless specifically required.

### Android / Capacitor Files

```text
backend/frontend/package.json
backend/frontend/package-lock.json
backend/frontend/capacitor.config.json
backend/frontend/android/app/src/main/AndroidManifest.xml
backend/frontend/android/app/build.gradle
backend/frontend/android/app/src/main/java/com/thecoded/adhannow/MainActivity.java
```

Responsibilities:

- Ensure Capacitor Android builds.
- Ensure `@capacitor/android`, `@capacitor/app`, `@capacitor/browser`, and `@capacitor/core` are present.
- Ensure deep link intent filter is present.
- Keep package ID stable.
- Do not add old wrapper hacks.
- Do not commit machine-specific Android files.

---

## Files That Must NOT Be Committed

Do not commit:

```text
backend/frontend/android/local.properties
backend/frontend/android/.gradle/
backend/frontend/android/app/build/
backend/frontend/build/
node_modules/
```

Avoid `git add .` until the final review. Stage specific files only.

---

## Environment Variables Needed

### Frontend

```text
VITE_API_BASE_URL=https://app-adhannow-api-prod-cdfdcsfeb5gtd7e9.centralus-01.azurewebsites.net
VITE_AMAZON_CLIENT_ID=amzn1.application-oa2-client.383c219cb1ca42fdbd844e17e11aa843
VITE_AMAZON_RETURN_URL=https://nice-ground-009684610.1.azurestaticapps.net/onboarding/step2
```

### Backend / Azure App Service

Do not commit secrets.

Required names:

```text
DB_SERVER
DB_NAME
DB_USER
DB_PASSWORD

APP_SESSION_SECRET
APP_SESSION_TTL_MS

AMAZON_LOGIN_CLIENT_ID
AMAZON_LOGIN_CLIENT_SECRET
AMAZON_LOGIN_REDIRECT_URIS

CORS_ORIGINS

ALEXA_OAUTH_CLIENT_ID
ALEXA_OAUTH_CLIENT_SECRET
ALEXA_OAUTH_REDIRECT_URIS

ALEXA_APP_LINK_CLIENT_ID
ALEXA_APP_LINK_CLIENT_SECRET
ALEXA_APP_LINK_REDIRECT_URIS

ALEXA_SKILL_ID
ALEXA_SKILL_STAGE
ALEXA_SKILL_INVOCATION_NAME
```

If the backend returns:

```text
Login failed for user 'HamzaAdhanApp'
```

that is an Azure SQL/backend configuration issue, not an Android issue. Check:

```text
GET /api/health/db
```

first.

---

## Build / Sync Commands

From repo root:

```powershell
cd backend/frontend
npm install
npm run build
npx cap sync android
npx cap open android
```

If Android dependencies are missing:

```powershell
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/app @capacitor/browser
```

---

## Acceptance Criteria

This Android auth rebuild phase is successful when:

- `npm run build` passes.
- `npx cap sync android` passes.
- Android Studio Gradle sync passes.
- Android app installs on emulator/device.
- App opens without blank screen.
- Step 2 loads.
- “Connect Amazon” opens Amazon login externally.
- Amazon auth URL uses:
  ```text
  response_type=code
  ```
- Amazon returns to HTTPS `/onboarding/step2`.
- Backend `/api/integrations/alexa/login-code` exchanges code successfully.
- Backend returns an AdhanNow `sessionToken` beginning with:
  ```text
  adhapp_
  ```
- Web callback redirects to:
  ```text
  com.thecoded.adhannow://auth?session_token=...
  ```
- Android catches the deep link.
- Step 2 shows Amazon connected.
- Web/PWA login still works.
- No secrets are committed.
- `backend/frontend/android/local.properties` is not committed.
- Branch remains:
  ```text
  android-clean-rebuild
  ```

---

## What Gemini Should NOT Do

Do not:

- Use `response_type=token`.
- Store an Amazon auth code as a token.
- Store only an Amazon access token as the long-term app token.
- Add `com.thecoded.adhannow://auth` to Amazon LWA Allowed Return URLs.
- Change Amazon client IDs casually.
- Mix `AMAZON_LOGIN_*`, `ALEXA_APP_LINK_*`, and `ALEXA_OAUTH_*`.
- Convert the project into a separate native-only Android app.
- Rewrite backend Alexa Smart Home/playback logic.
- Change database schema unless explicitly asked.
- Commit secrets.
- Run `npm audit fix --force` unless explicitly approved.
- Push directly to `main`.
- Pop old stashes unless explicitly asked.

---

## Immediate Next Step

A ChatGPT-generated patch ZIP may be applied first. After applying the patch, verify these files:

```text
backend/index.js
backend/frontend/src/components/onboarding/Step2ConnectAccounts.tsx
backend/frontend/src/lib/api.ts
backend/frontend/src/lib/amazonLogin.ts
backend/frontend/package.json
backend/frontend/package-lock.json
backend/frontend/capacitor.config.json
backend/frontend/android/app/src/main/AndroidManifest.xml
backend/frontend/android/app/src/main/java/com/thecoded/adhannow/MainActivity.java
```

Then run:

```powershell
cd backend/frontend
npm install
npm run build
npx cap sync android
```

Only after successful build/sync and Android login testing should changes be committed/pushed.

