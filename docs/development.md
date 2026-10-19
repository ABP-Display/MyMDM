# Development

## Server

```sh
cd server
composer install
php artisan migrate
php artisan MyMDM:bootstrap-admin
php artisan serve --host=127.0.0.1 --port=8080
```

Docker runs migrations at startup and bootstraps the first admin from `MyMDM_BOOTSTRAP_ADMIN_EMAIL` and `MyMDM_BOOTSTRAP_ADMIN_PASSWORD` when the `users` table is empty.

## Web

```sh
cd server
npm install
npm run dev
npm run build
```

The admin console is Inertia React inside Laravel. During Docker builds, Vite assets are compiled and copied into the PHP image.

## Android

```sh
cd android
gradle assembleDebug
gradle test
```

Use JDK 17 and a recent Android SDK. The app package is `fr.organisation.MyMDM`, `minSdk` is `28`, and version name is `0.1.0-dev`.

For auto-update tests, increment `versionCode`, rebuild the APK, open `APK agent` in the admin console, then upload the APK with the same version metadata. The upload is stored in the Laravel private storage volume and becomes the active release.

## Docker

```sh
cp .env.example .env
docker compose config
docker compose up --build
```

Docker mounts `android/app/build/outputs/apk/debug` read-only. Build the APK there or copy `app-debug.apk` and `output-metadata.json` from your build machine. The server exposes the selected APK through `/downloads/MyMDM-agent.apk`.

An admin upload overrides the Android build. Uploaded APKs are persisted in the `server-storage` Docker volume.
