<?php

namespace App\Support;

use App\Models\DevicePolicy;
use Illuminate\Validation\ValidationException;

class PolicyPayload
{
    public static function fromModel(DevicePolicy $policy, ?string $organizationName = null): array
    {
        return [
            'organization_name' => $organizationName ?? config('mymdm.organization_name'),
            'revision' => $policy->revision,
            'kiosk_enabled' => $policy->kiosk_enabled,
            'kiosk_type' => $policy->kiosk_type,
            'url' => $policy->url,
            'allowed_origins' => $policy->allowed_origins ?? [],
            'allowed_apps' => $policy->allowed_apps ?? [],
            'library_items' => $policy->library_items ?? [],
            'launcher_background_color' => $policy->launcher_background_color ?? '#7E7F7B',
            'launcher_background' => $policy->launcher_background,
            'launcher_auto_grant_permissions' => $policy->launcher_auto_grant_permissions ?? true,
            'orientation' => $policy->orientation,
            'keep_screen_on' => $policy->keep_screen_on,
            'sync_interval_minutes' => $policy->sync_interval_minutes,
            'default_volume' => $policy->default_volume,
            'default_brightness' => $policy->default_brightness,
            'admin_pin_enabled' => $policy->admin_pin_hash !== null,
            'admin_pin_hash' => $policy->admin_pin_hash,
        ];
    }

    public static function validate(string $kioskType, string $url, array $allowedOrigins, string $orientation, array $allowedApps = [], array $libraryItems = []): void
    {
        if (! in_array($kioskType, ['web', 'web_single', 'web_open', 'app', 'launcher'], true)) {
            throw ValidationException::withMessages(['kiosk_type' => 'Type de kiosque inconnu.']);
        }

        if ($kioskType === 'app' && count($allowedApps) !== 1) {
            throw ValidationException::withMessages(['allowed_apps' => 'Sélectionnez exactement une application.']);
        }
        if ($kioskType === 'launcher' && count($allowedApps) === 0 && count($libraryItems) === 0) {
            throw ValidationException::withMessages(['library_item_ids' => 'Ajoutez au moins une application ou un fichier à la bibliothèque.']);
        }
        foreach ($allowedApps as $package) {
            if (! is_string($package) || ! preg_match('/^[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z][a-zA-Z0-9_]*)+$/D', $package) || $package === 'org.mymdm.agent') {
                throw ValidationException::withMessages(['allowed_apps' => 'Identifiant d’application Android invalide.']);
            }
        }

        if (! in_array($orientation, ['auto', 'portrait', 'landscape'], true)) {
            throw ValidationException::withMessages(['orientation' => 'orientation must be auto, portrait, or landscape']);
        }

        if ($url !== '' && ! self::isHttpUrl($url)) {
            throw ValidationException::withMessages(['url' => 'url must be absolute http or https URL']);
        }

        foreach ($allowedOrigins as $origin) {
            if (! is_string($origin) || ! self::isHttpUrl($origin)) {
                throw ValidationException::withMessages(['allowed_origins' => 'allowed_origins contains invalid origin']);
            }
        }
    }

    private static function isHttpUrl(string $value): bool
    {
        $parts = parse_url($value);

        return is_array($parts)
            && in_array($parts['scheme'] ?? '', ['http', 'https'], true)
            && ! empty($parts['host'])
            && ! isset($parts['user']);
    }
}
