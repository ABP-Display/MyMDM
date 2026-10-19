<?php

namespace App\Models;

use App\Models\Concerns\UsesUuid;
use Database\Factories\DeviceGroupFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['organization_id', 'name'])]
class DeviceGroup extends Model
{
    /** @use HasFactory<DeviceGroupFactory> */
    use HasFactory;

    use UsesUuid;

    public function devices(): HasMany
    {
        return $this->hasMany(Device::class, 'group_id');
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }
}
