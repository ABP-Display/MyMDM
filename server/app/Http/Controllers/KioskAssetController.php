<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\KioskAsset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class KioskAssetController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $platform = $request->validate([
            'platform' => ['nullable', Rule::in(['android'])],
        ])['platform'] ?? null;
        $assets = KioskAsset::query()
            ->when($platform, fn ($query) => $query->whereIn('platform', [$platform, 'all']))
            ->latest()
            ->get()
            ->map->present();

        return response()->json($assets);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'in:app,android_app,file'],
            'platform' => ['nullable', Rule::in(['android'])],
            'name' => ['required', 'string', 'max:255'],
            'package_name' => ['nullable', 'string', 'max:255'],
            'version_name' => ['nullable', 'string', 'max:100'],
            'version_code' => ['nullable', 'integer', 'min:0'],
            'source_url' => ['nullable', 'url:http,https', 'max:2048'],
            'file' => ['required', 'file', 'max:512000'],
        ]);

        $type = $data['type'] === 'app' ? 'android_app' : $data['type'];
        $platform = $data['platform'] ?? $this->platformForType($type);
        if ($type !== 'file' && $platform !== $this->platformForType($type)) {
            throw ValidationException::withMessages(['type' => 'Le type de paquet ne correspond pas à la plateforme sélectionnée.']);
        }
        $this->validateApplicationIdentifier($type, $data['package_name'] ?? null);

        $upload = $data['file'];
        $extension = strtolower($upload->getClientOriginalExtension());
        $this->validatePackageFile($type, $extension, $upload->getRealPath());

        $sha256 = hash_file('sha256', $upload->getRealPath());
        if (KioskAsset::withTrashed()->where('sha256', $sha256)->exists()) {
            throw ValidationException::withMessages(['file' => 'Ce fichier existe déjà dans la bibliothèque.']);
        }
        $originalName = basename($upload->getClientOriginalName());
        $safeName = Str::slug(pathinfo($originalName, PATHINFO_FILENAME)) ?: 'element';
        $safeName .= $extension === '' ? '' : '.'.$extension;
        $storagePath = 'kiosk-assets/'.$sha256.'/'.$safeName;
        $storedPath = $upload->storeAs('kiosk-assets/'.$sha256, $safeName, 'local');
        if ($storedPath !== $storagePath) {
            throw ValidationException::withMessages(['file' => 'Impossible de conserver ce fichier.']);
        }

        $isApplication = $type !== 'file';
        $sourceUrl = isset($data['source_url']) ? trim($data['source_url']) : null;

        $asset = KioskAsset::query()->create([
            'type' => $type,
            'platform' => $platform,
            'name' => trim($data['name']),
            'package_name' => $isApplication ? trim($data['package_name']) : null,
            'version_name' => $isApplication && isset($data['version_name']) ? trim($data['version_name']) : null,
            'version_code' => $type === 'android_app' ? ($data['version_code'] ?? null) : null,
            'source' => $this->sourceFromUrl($sourceUrl),
            'source_url' => $sourceUrl,
            'original_name' => $originalName,
            'mime_type' => $this->mimeType($type, $upload->getMimeType()),
            'sha256' => $sha256,
            'size_bytes' => $upload->getSize(),
            'storage_path' => $storagePath,
        ]);
        AuditLog::query()->create([
            'user_id' => $request->user()->id,
            'action' => 'KIOSK_ASSET_CREATED',
            'payload' => ['asset_id' => $asset->id, 'type' => $asset->type, 'sha256' => $asset->sha256],
        ]);

        return response()->json($asset->present(), 201);
    }

    public function destroy(Request $request, KioskAsset $kioskAsset): JsonResponse
    {
        $kioskAsset->delete();
        AuditLog::query()->create([
            'user_id' => $request->user()->id,
            'action' => 'KIOSK_ASSET_DELETED',
            'payload' => ['asset_id' => $kioskAsset->id, 'sha256' => $kioskAsset->sha256],
        ]);

        return response()->json(['ok' => true]);
    }

    public function download(string $sha256)
    {
        $asset = KioskAsset::withTrashed()->where('sha256', $sha256)->firstOrFail();
        abort_unless(Storage::disk('local')->exists($asset->storage_path), 404);

        return response()->download(Storage::disk('local')->path($asset->storage_path), $asset->original_name, [
            'Content-Type' => $asset->mime_type,
            'Cache-Control' => 'private, max-age=31536000, immutable',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function validateApplicationIdentifier(string $type, ?string $identifier): void
    {
        if ($type === 'file') {
            return;
        }
        if ($identifier === null || trim($identifier) === '') {
            throw ValidationException::withMessages(['package_name' => 'L’identifiant de l’application est requis.']);
        }
        $pattern = '/^[a-zA-Z0-9][a-zA-Z0-9_-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*)+$/D';
        if (! preg_match($pattern, $identifier) || ($type === 'android_app' && $identifier === 'org.mymdm.agent')) {
            throw ValidationException::withMessages(['package_name' => 'L’identifiant de l’application est invalide pour la plateforme choisie.']);
        }
    }

    private function validatePackageFile(string $type, string $extension, string $path): void
    {
        $extensions = [
            'android_app' => ['apk'],
        ];
        if ($type === 'file') {
            return;
        }
        if (! in_array($extension, $extensions[$type], true)) {
            $expected = strtoupper(implode(', ', $extensions[$type]));
            throw ValidationException::withMessages(['file' => "Format incorrect pour cette plateforme. Formats acceptés : {$expected}."]);
        }
        if ($extension === 'apk'
            && file_get_contents($path, false, null, 0, 2) !== 'PK') {
            throw ValidationException::withMessages(['file' => 'Le paquet téléchargé est illisible ou ne correspond pas au format sélectionné.']);
        }
    }

    private function sourceFromUrl(?string $sourceUrl): string
    {
        $host = strtolower((string) parse_url($sourceUrl ?? '', PHP_URL_HOST));
        if ($host === 'apkmirror.com' || str_ends_with($host, '.apkmirror.com')) {
            return 'apkmirror';
        }
        if ($host === 'apkpure.com' || str_ends_with($host, '.apkpure.com')) {
            return 'apkpure';
        }

        return $sourceUrl === null ? 'upload' : 'other';
    }

    private function mimeType(string $type, ?string $detected): string
    {
        return match ($type) {
            'android_app' => 'application/vnd.android.package-archive',
            default => $detected ?: 'application/octet-stream',
        };
    }

    private function platformForType(string $type): string
    {
        return match ($type) {
            'file' => 'all',
            default => 'android',
        };
    }
}
