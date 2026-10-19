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

#[Fillable(['name', 'platform', 'policy', 'wifi', 'enrollment_agent_source', 'enrollment_agent_release_id'])]
class Configuration extends Model
{
    use SoftDeletes;
    use UsesUuid;

    protected $hidden = ['policy', 'wifi'];

    protected static function booted(): void
    {
        static::addGlobalScope('android', function (Builder $query): void {
            $query->whereIn($query->getModel()->qualifyColumn('platform'), ['android']);
        });
    }

    protected function casts(): array
    {
        return ['policy' => 'array', 'wifi' => 'encrypted:array'];
    }

    public function activeEnrollment(): HasOne
    {
        return $this->hasOne(Enrollment::class)->where('status', 'active');
    }

    public function devices(): HasMany
    {
        return $this->hasMany(Device::class);
    }

    public function enrollmentAgentRelease(): BelongsTo
    {
        return $this->belongsTo(AgentRelease::class, 'enrollment_agent_release_id');
    }
}
