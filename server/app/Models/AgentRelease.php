<?php

namespace App\Models;

use App\Models\Concerns\UsesUuid;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['platform', 'version', 'version_code', 'original_name', 'apk_sha256', 'apk_size', 'apk_path', 'download_url', 'active'])]
class AgentRelease extends Model
{
    use UsesUuid;

    protected static function booted(): void
    {
        static::addGlobalScope('android', function (Builder $query): void {
            $query->whereIn($query->getModel()->qualifyColumn('platform'), ['android']);
        });
    }

    protected function casts(): array
    {
        return ['active' => 'boolean'];
    }
}
