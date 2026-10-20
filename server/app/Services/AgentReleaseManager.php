<?php

namespace App\Services;

use App\Models\AgentRelease;
use App\Models\Configuration;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

class AgentReleaseManager
{
    public const PLATFORMS = ['android'];

    private const EXTENSIONS = [
        'android' => ['apk'],
    ];

    public function active(string $platform = 'android'): ?AgentRelease
    {
        return AgentRelease::query()
            ->where('platform', $platform)
            ->where('active', true)
            ->latest('version_code')
            ->latest()
            ->first();
    }

    public function activeApkPath(): string
    {
        $release = $this->active('android');
        if ($release?->apk_path) {
            $path = $this->storedApkPath($release);
            if (is_file($path)) {
                return $path;
            }
        }

        return $this->fallbackApkPath();
    }

    public function fallbackApkPath(): string
    {
        $configured = config('mymdm.apk_path');

        return is_file($configured) ? $configured : config('mymdm.android_apk_path');
    }

    public function useDefault(string $platform = 'android'): void
    {
        if (! in_array($platform, ['android'], true)) {
            throw new RuntimeException('This platform does not have a bundled agent build.');
        }
        AgentRelease::query()->where('platform', $platform)->update(['active' => false]);
    }

    public function source(string $platform = 'android'): array
    {
        if ($platform !== 'android') {
            return ['platform' => $platform, 'source' => null, 'available' => false];
        }
        $active = $this->active($platform);
        if ($active && $this->isDownloadable($active)) {
            return [
                'id' => $active->id,
                'platform' => $platform,
                'source' => 'upload',
                'available' => true,
                'version' => $active->version,
                'version_code' => $active->version_code,
                'artifact_name' => $active->original_name,
                'artifact_size' => $active->apk_size,
                'artifact_sha256' => $active->apk_sha256,
                'apk_size' => $active->apk_size,
                'apk_sha256' => $active->apk_sha256,
                'download_url' => '/api/v1/agent/releases/'.$active->id.'/download',
            ];
        }

        if ($platform === 'android') {
            return array_merge($this->fallbackRelease(), ['platform' => 'android', 'source' => 'android']);
        }

        return ['platform' => $platform, 'source' => null, 'available' => false];
    }

    public function storedApkPath(AgentRelease $release): string
    {
        return Storage::disk('local')->path($release->apk_path);
    }

    public function isDownloadable(AgentRelease $release): bool
    {
        return $release->apk_path !== null && is_file($this->storedApkPath($release));
    }

    public function downloadUrl(): string
    {
        return rtrim(config('mymdm.base_url'), '/').'/downloads/mymdm-agent.apk';
    }

    public function store(UploadedFile $file, string $version, int $versionCode, string $platform = 'android'): AgentRelease
    {
        if (! in_array($platform, self::PLATFORMS, true)) {
            throw new RuntimeException('Unsupported platform.');
        }
        if ($versionCode < 1) {
            throw new RuntimeException('version_code must be greater than 0');
        }

        $extension = strtolower($file->getClientOriginalExtension());
        if (! in_array($extension, self::EXTENSIONS[$platform], true)) {
            throw new RuntimeException('The file format is not supported for the selected platform.');
        }

        $contents = file_get_contents($file->getRealPath());
        if ($contents === false) {
            throw new RuntimeException('Unable to read the agent file.');
        }

        $sha256 = hash('sha256', $contents);
        $existing = AgentRelease::query()->where('platform', $platform)->where('apk_sha256', $sha256)->first();
        if ($existing && $this->isDownloadable($existing)) {
            if ($existing->version !== $version || $existing->version_code !== $versionCode) {
                throw new RuntimeException(sprintf(
                    'This agent file is identical to version %s (build %d). Update its version and rebuild it.',
                    $existing->version,
                    $existing->version_code,
                ));
            }

            return DB::transaction(function () use ($existing, $platform): AgentRelease {
                AgentRelease::query()->where('platform', $platform)->update(['active' => false]);
                $existing->update(['active' => true]);

                return $existing->refresh();
            });
        }
        $path = sprintf('agents/%s/mymdm-agent-%d-%s.%s', $platform, $versionCode, substr($sha256, 0, 12), $extension);
        Storage::disk('local')->put($path, $contents);

        return DB::transaction(function () use ($file, $platform, $version, $versionCode, $sha256, $path, $contents): AgentRelease {
            AgentRelease::query()->where('platform', $platform)->update(['active' => false]);

            return AgentRelease::query()->create([
                'platform' => $platform,
                'version' => $version,
                'version_code' => $versionCode,
                'original_name' => $file->getClientOriginalName(),
                'apk_sha256' => $sha256,
                'apk_size' => strlen($contents),
                'apk_path' => $path,
                'download_url' => '',
                'active' => true,
            ]);
        });
    }

    public function activate(AgentRelease $release): AgentRelease
    {
        if (! $this->isDownloadable($release)) {
            throw new RuntimeException('The file for this release could not be found.');
        }

        return DB::transaction(function () use ($release): AgentRelease {
            AgentRelease::query()->where('platform', $release->platform)->update(['active' => false]);
            $release->update(['active' => true]);

            return $release->refresh();
        });
    }

    public function delete(AgentRelease $release): void
    {
        if (Configuration::query()->where('enrollment_agent_release_id', $release->id)->exists()) {
            throw new RuntimeException('This agent is used by an enrollment configuration. Choose another agent in that configuration before deleting it.');
        }
        if ($release->active) {
            throw new RuntimeException('Activate another release before deleting this one.');
        }
        if ($release->apk_path !== null) {
            Storage::disk('local')->delete($release->apk_path);
        }
        $release->delete();
    }

    public function fallbackRelease(): array
    {
        $path = $this->fallbackApkPath();
        if (! is_file($path)) {
            return ['available' => false];
        }

        $metadataFile = dirname($path).'/output-metadata.json';
        $metadata = is_file($metadataFile) ? json_decode(file_get_contents($metadataFile), true) : null;
        $element = collect($metadata['elements'] ?? [])->first(fn ($item) => ($item['outputFile'] ?? '') === basename($path));

        return [
            'available' => true,
            'artifact_name' => basename($path),
            'version' => (string) ($element['versionName'] ?? config('mymdm.agent_version')),
            'version_code' => (int) ($element['versionCode'] ?? config('mymdm.agent_version_code')),
            'apk_sha256' => hash_file('sha256', $path),
            'apk_size' => filesize($path),
            'artifact_size' => filesize($path),
            'artifact_sha256' => hash_file('sha256', $path),
            'download_url' => $this->downloadUrl(),
        ];
    }
}
