<?php

namespace App\Models;

use App\Models\Concerns\UsesUuid;
use Database\Factories\KioskAssetFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

#[Fillable(['type', 'platform', 'name', 'package_name', 'version_name', 'version_code', 'source', 'source_url', 'original_name', 'mime_type', 'sha256', 'size_bytes', 'storage_path'])]
class KioskAsset extends Model
{
    /** @use HasFactory<KioskAssetFactory> */
    use HasFactory;

    use SoftDeletes;
    use UsesUuid;

    protected static function booted(): void
    {
        static::addGlobalScope('android', function (Builder $query): void {
            $query->whereIn($query->getModel()->qualifyColumn('platform'), ['android', 'all']);
        });
    }

    protected function casts(): array
    {
        return [
            'version_code' => 'integer',
            'size_bytes' => 'integer',
        ];
    }

    /** @return array<string, mixed> */
    public function policyPayload(): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'platform' => $this->platform,
            'name' => $this->name,
            'package_name' => $this->package_name,
            'version_name' => $this->version_name,
            'version_code' => $this->version_code,
            'file_name' => $this->original_name,
            'mime_type' => $this->mime_type,
            'sha256' => $this->sha256,
            'size_bytes' => $this->size_bytes,
        ];
    }

    /** @return array<string, mixed> */
    public function present(): array
    {
        return [
            ...$this->policyPayload(),
            'source' => $this->source,
            'source_url' => $this->source_url,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
