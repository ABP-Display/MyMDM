<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['device_id', 'revision', 'status', 'error_message', 'applied_at'])]
class DevicePolicyStatus extends Model
{
    protected $table = 'device_policy_status';

    public $timestamps = false;

    public $incrementing = false;

    protected $primaryKey = 'device_id';

    protected $keyType = 'string';

    protected function casts(): array
    {
        return ['applied_at' => 'datetime'];
    }
}
