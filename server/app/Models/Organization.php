<?php

namespace App\Models;

use App\Models\Concerns\UsesUuid;
use Database\Factories\OrganizationFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'slug', 'description', 'non_sync_threshold_hours'])]
class Organization extends Model
{
    /** @use HasFactory<OrganizationFactory> */
    use HasFactory;

    use UsesUuid;

    protected function casts(): array
    {
        return ['non_sync_threshold_hours' => 'integer'];
    }

    public static function default(): self
    {
        return self::query()->firstOrCreate(
            ['slug' => 'default'],
            ['name' => config('mymdm.organization_name')],
        );
    }

    public function devices(): HasMany
    {
        return $this->hasMany(Device::class);
    }

    public function groups(): HasMany
    {
        return $this->hasMany(DeviceGroup::class);
    }
}
