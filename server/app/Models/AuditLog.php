<?php

namespace App\Models;

use App\Models\Concerns\UsesUuid;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['user_id', 'device_id', 'action', 'payload'])]
class AuditLog extends Model
{
    use UsesUuid;

    public $timestamps = false;

    protected function casts(): array
    {
        return ['payload' => 'array', 'created_at' => 'datetime'];
    }
}
