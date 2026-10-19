# Enrollment

MyMDM uses Android Enterprise QR provisioning for company-owned devices. The Configurations page creates a permanent, reusable QR for each configuration. Enrollments lets an administrator choose a configuration and retrieve exactly the saved QR, including after logout or a server restart.

Configuration changes are drafts for the next QR generation. Only the explicit regenerate action replaces the token, captures the saved policy and Wi-Fi settings, and selects the current APK. The previous token is then revoked for new enrollments; devices already registered retain their credentials and policies. The legacy enrollment API without a configuration ID remains available for existing one-shot clients.

Each permanent QR points to a retained copy at `/downloads/enrollment-apks/{sha256}.apk`. Preserve the database, the private storage volume (including `enrollment-apks`), and `APP_KEY` when migrating servers. When Docker starts without an explicit `APP_KEY`, it generates and reuses a key in the private storage volume. The public hostname and HTTPS availability must still be maintained for printed QR codes to work.

Build Android agent version `0.1.3-dev` (version code 4) for all kiosk modes below. Its output APK is the default server source; manual uploads remain optional overrides. Docker mounts the output directory from the server host, so builds performed elsewhere must be copied there, together with `output-metadata.json`.

Configurations and individual device policies offer three groups:
s
- Single content: `web_single` stays on the configured URL (path and query included; same-page anchors allowed); `app` automatically opens the one installed Android package listed in `allowed_apps`.
- Web navigation: `web_open` allows navigation to other HTTP(S) sites inside MyMDM, optionally restricted by `allowed_origins`. Android's existing cleartext policy still requires HTTPS for network loading. `web` retains the older initial-origin default for existing policies.
- App library: `launcher` displays only `allowed_apps`, resolving their names and icons on the tablet. Apps must already be installed. Home returns to MyMDM; a Close button suspends an app until reopened, without deleting its data. Leaving kiosk restores apps closed this way.

App modes require Android 11+ to block activities from non-allowlisted packages inside locked tasks. They restrict accessible packages, not the internal screens of third-party apps. The MyMDM home remains available for PIN-protected exit; five Back presses are handled on MyMDM's own screen, not inside another application's activities.

## QR Payload

The server returns a QR text containing JSON with keys expected by Android provisioning:

```json
{
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "fr.organisation.MyMDM/.admin.MyMDMDeviceAdminReceiver",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": "https://mdm.example.org/downloads/MyMDM-agent.apk",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM": "base64-url-sha256-apk",
  "android.app.extra.PROVISIONING_WIFI_SSID": "Company WiFi",
  "android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE": "WPA",
  "android.app.extra.PROVISIONING_WIFI_PASSWORD": "optional-wifi-password",
  "android.app.extra.PROVISIONING_WIFI_HIDDEN": false,
  "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
    "server_url": "https://mdm.example.org",
    "enrollment_token": "temporary-one-shot-token"
  }
}
```

The checksum is the SHA-256 digest of the APK bytes encoded with unpadded URL-safe base64, as required by Android provisioning.

Wi-Fi fields are optional and are not stored in MyMDM's database. They are only included in the generated QR response. Supported `PROVISIONING_WIFI_SECURITY_TYPE` values are `NONE`, `WPA`, `WEP`, and `EAP`; the MVP UI targets common WPA/WPA2-PSK onboarding.

Legacy one-shot QR codes point to `/downloads/MyMDM-agent.apk` on `MyMDM_BASE_URL`. This mutable endpoint also serves agent auto-updates. Permanent configuration QR codes use the retained, checksum-addressed APK endpoint instead.

## Flow

1. Admin creates an enrollment in `/enrollments`.
2. MyMDM generates a cryptographically random token, stores only its SHA-256 hash, and returns the token inside the QR payload.
3. The factory-reset tablet scans the QR during Setup Wizard.
4. Android downloads the APK from `/downloads/MyMDM-agent.apk`.
5. Android verifies the checksum and provisions `fr.organisation.MyMDM/.admin.MyMDMDeviceAdminReceiver`.
6. On Android 12+, `AdminPolicyComplianceActivity` reads the saved managed provisioning extras and waits for registration before returning success to Setup Wizard. On older devices, the provisioning-complete receiver saves the extras and opens `ProvisioningActivity`.
7. The app verifies it is Device Owner.
8. The app calls `POST /api/v1/device/enroll`.
9. The server validates the token, creates the device with the saved configuration policy at revision `1`, returns a unique device credential, links the device to the enrollment, and increments its use count. Permanent configuration tokens remain usable; only legacy one-shot tokens are consumed.
10. The app stores server URL, device ID, credential, and last valid policy in encrypted local storage.

Registration entry points are serialized in the agent so overlapping callbacks do not consume the one-shot token twice. Credentials and the initial policy are committed together before reporting success. The compliance screen displays registration errors and allows a retry; kiosk launch and periodic sync are deferred until control leaves that screen.

## Troubleshooting and validation

- Upload the rebuilt APK **before** generating a new QR. Permanent configuration QR codes retain that APK and survive later uploads. Legacy one-shot QR codes use a mutable APK URL and need replacing after an upload.
- Test on a factory-reset Samsung tablet and record its model, Android version, and exact failing setup step. Download/install failures precede the registration fixes in the agent.
- Verify the APK URL is accessible without login over HTTPS with a certificate trusted by the tablet.
- Test a normal enrollment: one device should appear on the server and Setup Wizard should complete only after registration succeeds.
- Interrupt network access at the registration screen: an error and retry button should remain visible. Restore connectivity and retry. Rotate the screen during registration to exercise overlapping activity instances; there should still be only one registration.
- Test an Android 9–11 device separately to validate the legacy provisioning-complete callback.
- The selected configuration supplies the kiosk type, initial URL or app library, orientation, allowed origins, screen setting, and maintenance PIN. Web modes use an embedded WebView. Legacy enrollment without a configuration still starts with kiosk disabled and an empty URL.

If the registration response never reaches the agent, a reusable configuration token can be retried, but this creates another device record. Legacy one-shot tokens instead return an invalid-token error after consumption. Recovering the same device credential across a lost response still requires a server-side enrollment recovery design.

## Development ADB Path

For local Device Owner testing:

```sh
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell dpm set-device-owner fr.organisation.MyMDM/.admin.MyMDMDeviceAdminReceiver
```

This does not provide QR admin extras. Use the in-app provisioning screen or QR flow for full enrollment.

