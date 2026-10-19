<?php

namespace App\Models;

use App\Models\Concerns\UsesUuid;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

#[Fillable(['organization_id', 'group_id', 'configuration_id', 'name', 'platform', 'serial_number', 'manufacturer', 'model', 'android_version', 'os_version', 'sdk_version', 'agent_version', 'agent_version_code', 'battery_level', 'battery_charging', 'volume_level', 'brightness_level', 'metrics', 'screen_path', 'screen_updated_at', 'credential_hash', 'last_seen_at', 'enrolled_at', 'revoked_at', 'enrollment_id', 'reset_id', 'reset_status', 'reset_error'])]
class Device extends Model
{
    use SoftDeletes;
    use UsesUuid;

    protected static function booted(): void
    {
        static::addGlobalScope('android', function (Builder $query): void {
            $query->whereIn($query->getModel()->qualifyColumn('platform'), ['android']);
        });
    }

    protected function casts(): array
    {
        return [
            'last_seen_at' => 'datetime',
            'enrolled_at' => 'datetime',
            'revoked_at' => 'datetime',
            'battery_charging' => 'boolean',
            'metrics' => 'array',
            'screen_updated_at' => 'datetime',
        ];
    }

    public function policy(): HasOne
    {
        return $this->hasOne(DevicePolicy::class);
    }

    public function group(): BelongsTo
    {
        return $this->belongsTo(DeviceGroup::class, 'group_id');
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function configuration(): BelongsTo
    {
        return $this->belongsTo(Configuration::class);
    }

    public function policyStatus(): HasOne
    {
        return $this->hasOne(DevicePolicyStatus::class);
    }

    public function commands(): HasMany
    {
        return $this->hasMany(DeviceCommand::class);
    }

    public function inventories(): HasMany
    {
        return $this->hasMany(DeviceInventory::class);
    }
}
