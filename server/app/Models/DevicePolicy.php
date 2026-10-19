<?php

namespace App\Models;

use App\Models\Concerns\UsesUuid;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['device_id', 'revision', 'kiosk_enabled', 'kiosk_type', 'url', 'allowed_origins', 'allowed_apps', 'library_items', 'launcher_background_color', 'launcher_background', 'launcher_auto_grant_permissions', 'orientation', 'keep_screen_on', 'sync_interval_minutes', 'default_volume', 'default_brightness', 'admin_pin_hash'])]
class DevicePolicy extends Model
{
    use UsesUuid;

    protected function casts(): array
    {
        return [
            'kiosk_enabled' => 'boolean',
            'allowed_origins' => 'array',
            'allowed_apps' => 'array',
            'library_items' => 'array',
            'launcher_background' => 'array',
            'launcher_auto_grant_permissions' => 'boolean',
            'keep_screen_on' => 'boolean',
            'sync_interval_minutes' => 'integer',
            'default_volume' => 'integer',
            'default_brightness' => 'integer',
        ];
    }
}
