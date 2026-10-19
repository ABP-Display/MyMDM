<?php

namespace App\Services;

use App\Models\Configuration;
use App\Models\Device;
use Illuminate\Support\Facades\DB;
use LogicException;

class ConfigurationPolicyManager
{
    public function assign(Configuration $configuration, Device $device): void
    {
        if (($device->platform ?: 'android') !== ($configuration->platform ?: 'android')) {
            throw new LogicException('La configuration doit utiliser la même plateforme que l’appareil.');
        }

        $device->update(['configuration_id' => $configuration->id]);
        $attributes = $this->attributes($configuration->policy ?? []);
        if ($device->policy()->exists()) {
            $device->policy()->update(['revision' => DB::raw('revision + 1'), ...$attributes]);
        } else {
            $device->policy()->create(['revision' => 1, ...$attributes]);
        }
    }

    public function synchronizeLinkedDevices(Configuration $configuration, ?string $userId = null): int
    {
        $devices = $configuration->devices()->with('policy')->get();
        foreach ($devices as $device) {
            $previousPolicy = $device->policy?->toArray() ?? [];
            $this->assign($configuration, $device);
            app(DevicePolicyHistory::class)->record($device, $previousPolicy, 'DEVICE_CONFIGURATION_UPDATED', $userId,
                ['configuration_id' => $configuration->id, 'configuration_name' => $configuration->name]);
        }

        return $devices->count();
    }

    /** @return array<string, mixed> */
    public function attributes(array $policy): array
    {
        return [
            'kiosk_enabled' => $policy['kiosk_enabled'] ?? false,
            'kiosk_type' => $policy['kiosk_type'] ?? 'web',
            'url' => $policy['url'] ?? '',
            'allowed_origins' => $policy['allowed_origins'] ?? [],
            'allowed_apps' => $policy['allowed_apps'] ?? [],
            'library_items' => $policy['library_items'] ?? [],
            'launcher_background_color' => $policy['launcher_background_color'] ?? '#7E7F7B',
            'launcher_background' => $policy['launcher_background'] ?? null,
            'launcher_auto_grant_permissions' => $policy['launcher_auto_grant_permissions'] ?? true,
            'orientation' => $policy['orientation'] ?? 'auto',
            'keep_screen_on' => $policy['keep_screen_on'] ?? true,
            'sync_interval_minutes' => $policy['sync_interval_minutes'] ?? 5,
            'default_volume' => $policy['default_volume'] ?? null,
            'default_brightness' => $policy['default_brightness'] ?? null,
            'admin_pin_hash' => $policy['admin_pin_hash'] ?? null,
        ];
    }
}
