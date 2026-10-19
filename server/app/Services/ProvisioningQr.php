<?php

namespace App\Services;

use RuntimeException;

class ProvisioningQr
{
    public const PACKAGE = 'org.mymdm.agent';

    public const RECEIVER = 'org.mymdm.agent/.admin.MyMDMDeviceAdminReceiver';

    public function __construct(private readonly AgentReleaseManager $releases) {}

    /**
     * @param  array{ssid?: string, security_type?: string, password?: string, hidden?: bool}|null  $wifi
     */
    public function generate(string $enrollmentToken, ?array $wifi = null, ?string $apkPath = null, ?string $downloadUrl = null): string
    {
        $apkPath ??= $this->releases->activeApkPath();
        if (! is_file($apkPath)) {
            throw new RuntimeException("APK not found at {$apkPath}");
        }

        $payload = [
            'android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME' => self::RECEIVER,
            'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION' => $downloadUrl ?? $this->releases->downloadUrl(),
            'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM' => $this->apkProvisioningChecksum($apkPath),
            'android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE' => [
                'server_url' => rtrim(config('mymdm.base_url'), '/'),
                'enrollment_token' => $enrollmentToken,
            ],
        ];

        if ($wifi && ! empty($wifi['ssid'])) {
            $payload['android.app.extra.PROVISIONING_WIFI_SSID'] = $wifi['ssid'];
            $payload['android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE'] = $wifi['security_type'] ?? 'WPA';
            if (! empty($wifi['password'])) {
                $payload['android.app.extra.PROVISIONING_WIFI_PASSWORD'] = $wifi['password'];
            }
            if (! empty($wifi['hidden'])) {
                $payload['android.app.extra.PROVISIONING_WIFI_HIDDEN'] = true;
            }
        }

        return json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    }

    public function apkProvisioningChecksum(string $apkPath): string
    {
        $hash = hash_file('sha256', $apkPath, true);
        if ($hash === false) {
            throw new RuntimeException('Unable to hash APK');
        }

        return rtrim(strtr(base64_encode($hash), '+/', '-_'), '=');
    }

    public function apkSha256Hex(): string
    {
        $hash = hash_file('sha256', $this->releases->activeApkPath());
        if ($hash === false) {
            throw new RuntimeException('Unable to hash APK');
        }

        return $hash;
    }
}
