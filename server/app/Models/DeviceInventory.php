<?php

namespace App\Models;

use App\Models\Concerns\UsesUuid;
use Database\Factories\DeviceInventoryFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['device_id', 'category', 'payload', 'collected_at'])]
class DeviceInventory extends Model
{
    /** @use HasFactory<DeviceInventoryFactory> */
    use HasFactory;

    use UsesUuid;

    protected function casts(): array
    {
        return ['payload' => 'array', 'collected_at' => 'datetime'];
    }
}
