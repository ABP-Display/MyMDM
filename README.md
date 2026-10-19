# MyMDM

MyMDM `0.4.0` is a self-hosted device and kiosk management platform. The Android agent enrolls company-owned devices through Android Enterprise QR provisioning. This edition supports Android only. iOS / iPadOS: Not available.

## Prerequisites

- Docker Compose
- PHP 8.3+ and Composer for local server development
- Node.js 24+ for the Inertia React console
- Android Studio or Android SDK with JDK 17 for the Android agent
- An HTTPS public URL for the server. TLS may terminate at an external reverse proxy, but `MYMDM_BASE_URL` must be HTTPS for real QR provisioning.

## Run The Server

```sh
cp .env.example .env
docker compose up --build
```

The Laravel server listens on `:8080` inside the container and is published as `http://127.0.0.1:8380` by default. Configure your reverse proxy to forward HTTPS traffic to it.

## Create The First Admin

On the first server start only, if the `users` table is empty, MyMDM creates the bootstrap admin from:

```env
MYMDM_BOOTSTRAP_ADMIN_EMAIL=admin@example.org
MYMDM_BOOTSTRAP_ADMIN_PASSWORD=change-me
```

Remove those values after the account exists.

## Organizations

The sidebar organization selector scopes the dashboard, device list, and groups. Existing devices and groups are assigned to `Organisation principale` by the `0.4.0` migration. The `Paramètres` page manages organizations, their groups, and the per-organization delay used to mark inactive devices as non-synchronized. Administrators can reassign a device from its detail page.

An enrolled device remains linked to the reusable configuration selected by its enrollment QR. Saving that configuration increments the policy revision of every linked device so each agent applies the new values on its next synchronization. Disable the reusable profile from the device page before applying device-specific kiosk settings; detaching keeps the current policy as the starting point.

## Build The APK

```sh
cd android
bash ./gradlew assembleDebug
```

MyMDM uses `android/app/build/outputs/apk/debug/app-debug.apk` by default. Docker Compose mounts this output directory read-only, including `output-metadata.json`, from the machine running Docker. If you build on another machine, copy both files to that directory on the server. A Git pull does not transfer build artifacts. There is no longer a separate copy to `data/mymdm-agent.apk`.

The `Agent MDM` page shows whether the current source is the Android build or a manual upload. An uploaded APK takes priority; `Utiliser l’APK Android par défaut` switches back explicitly. Version metadata comes from Gradle's adjacent `output-metadata.json`. Provisioning checksums are computed from the selected APK bytes.

For agent auto-update, bump Android metadata before building a newer APK:

```kotlin
// android/app/build.gradle.kts
versionCode = 44
versionName = "0.4.4-dev"
```

Rebuild the Android output or optionally upload a generated APK in `Agent MDM` with the same `versionName` and `versionCode`. This changes the active download and update source. Existing configuration QR codes retain their saved APK until explicitly regenerated.

After the first APK version containing the updater is installed as Device Owner, an enrolled device installs a newer version only after receiving an explicit `agent_update` command. The server verifies that the command belongs to that device and targets the exact active build before returning the APK metadata. The agent then verifies the APK SHA-256 and installs it through Android `PackageInstaller`.

