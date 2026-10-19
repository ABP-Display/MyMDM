<?php

namespace App\Models;

use App\Models\Concerns\UsesUuid;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['token_hash', 'status', 'expires_at', 'used_at', 'device_id', 'configuration_id', 'qr_text', 'policy_snapshot', 'apk_sha256', 'use_count'])]
class Enrollment extends Model
{
    use UsesUuid;

    public $timestamps = false;

    protected $hidden = ['token_hash', 'qr_text', 'policy_snapshot'];

    public function configuration(): BelongsTo
    {
        return $this->belongsTo(Configuration::class)->withTrashed();
    }

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'used_at' => 'datetime',
            'created_at' => 'datetime',
            'qr_text' => 'encrypted',
            'policy_snapshot' => 'encrypted:array',
            'use_count' => 'integer',
        ];
    }
}
