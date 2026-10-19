<?php

namespace App\Http\Controllers;

use App\Models\AgentRelease;
use App\Models\AuditLog;
use App\Models\Configuration;
use App\Models\KioskAsset;
use App\Services\AgentReleaseManager;
use App\Services\ConfigurationEnrollment;
use App\Services\ConfigurationPolicyManager;
use App\Support\AdminPin;
use App\Support\PolicyPayload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ConfigurationController extends Controller
{
    /** @var array<string, string|false> */
    private array $agentHashes = [];

    public function index(): JsonResponse
    {
        return response()->json(Configuration::query()->with(['activeEnrollment', 'enrollmentAgentRelease'])->withCount('devices')->latest()->get()->map($this->present(...)));
    }

    public function store(Request $request, ConfigurationEnrollment $generator): JsonResponse
    {
        $values = $this->validated($request);
        $configuration = DB::transaction(function () use ($values, $request, $generator): Configuration {
            $configuration = Configuration::query()->create($values);
            $enrollment = $configuration->platform === 'android' ? $generator->generate($configuration) : null;
            $this->audit($request, 'CONFIGURATION_CREATED', $configuration, $enrollment?->id);

            return $configuration;
        });

        return response()->json($this->present($configuration->load('activeEnrollment')), 201);
    }

    public function update(Request $request, Configuration $configuration, ConfigurationPolicyManager $configurationPolicies): JsonResponse
    {
        DB::transaction(function () use ($request, $configuration, $configurationPolicies): void {
            $locked = Configuration::query()->lockForUpdate()->findOrFail($configuration->id);
            $locked->update($this->validated($request, $locked));
            if ($locked->wasChanged('policy')) {
                $configurationPolicies->synchronizeLinkedDevices($locked, $request->user()->id);
            }
            $this->audit($request, 'CONFIGURATION_UPDATED', $locked);
        });

        return response()->json($this->present($configuration->refresh()->load('activeEnrollment')->loadCount('devices')));
    }

    public function regenerate(Request $request, Configuration $configuration, ConfigurationEnrollment $generator): JsonResponse
    {
        if ($configuration->platform !== 'android') {
            throw ValidationException::withMessages(['platform' => 'Le QR Android est disponible uniquement pour les configurations Android.']);
        }
        DB::transaction(function () use ($request, $configuration, $generator): void {
            $enrollment = $generator->generate($configuration);
            $this->audit($request, 'CONFIGURATION_QR_REGENERATED', $configuration, $enrollment->id);
        });

        return response()->json($this->present($configuration->refresh()->load('activeEnrollment')->loadCount('devices')));
    }

    public function destroy(Request $request, Configuration $configuration): JsonResponse
    {
        DB::transaction(function () use ($request, $configuration): void {
            $locked = Configuration::query()->lockForUpdate()->findOrFail($configuration->id);
            $locked->activeEnrollment()->update(['status' => 'revoked']);
            $locked->devices()->update(['configuration_id' => null]);
            $this->audit($request, 'CONFIGURATION_DELETED', $locked);
            $locked->delete();
        });

        return response()->json(['ok' => true]);
    }

    private function present(Configuration $configuration): array
    {
        $platform = $configuration->platform ?: 'android';
        $policy = $platform === 'android'
            ? [
                'sync_interval_minutes' => 5,
                'launcher_background_color' => '#7E7F7B',
                'launcher_background' => null,
                'launcher_auto_grant_permissions' => true,
                'default_volume' => null,
                'default_brightness' => null,
                ...$configuration->policy,
            ]
            : [
                'management_mode' => 'fully_managed',
                'sync_interval_minutes' => 60,
                'notes' => '',
                ...$configuration->policy,
            ];
        if ($platform === 'android') {
            $policy['admin_pin_enabled'] = ! empty($policy['admin_pin_hash']);
            unset($policy['admin_pin_hash']);
        }
        $wifi = $configuration->wifi ?? [];
        $enrollment = $configuration->activeEnrollment;
        $qrWifi = $enrollment ? json_decode($enrollment->qr_text, true) : [];
        $snapshotWifi = $qrWifi['android.app.extra.PROVISIONING_WIFI_SSID'] ?? '';
        $wifiChanged = $snapshotWifi !== ($wifi['ssid'] ?? '')
            || ($qrWifi['android.app.extra.PROVISIONING_WIFI_PASSWORD'] ?? '') !== ($wifi['password'] ?? '')
            || ($qrWifi['android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE'] ?? 'WPA') !== ($wifi['security_type'] ?? 'WPA')
            || ($qrWifi['android.app.extra.PROVISIONING_WIFI_HIDDEN'] ?? false) !== ($wifi['hidden'] ?? false);

        $agentChanged = false;
        if ($platform === 'android' && $enrollment) {
            try {
                $agentPath = app(ConfigurationEnrollment::class)->agentPath($configuration);
                $agentChanged = ! is_file($agentPath) || ($this->agentHashes[$agentPath] ??= hash_file('sha256', $agentPath)) !== $enrollment->apk_sha256;
            } catch (ValidationException) {
                $agentChanged = true;
            }
        }

        return [
            'id' => $configuration->id,
            'name' => $configuration->name,
            'platform' => $platform,
            'enrollment_agent_source' => $configuration->enrollment_agent_source ?? 'active',
            'enrollment_agent_release_id' => $configuration->enrollment_agent_release_id,
            'qr_apk_sha256' => $enrollment?->apk_sha256,
            'policy' => $policy,
            'wifi_ssid' => $wifi['ssid'] ?? '',
            'wifi_security_type' => $wifi['security_type'] ?? 'WPA',
            'wifi_hidden' => $wifi['hidden'] ?? false,
            'wifi_password_enabled' => ! empty($wifi['password']),
            'has_pending_changes' => $platform === 'android' && $enrollment && ($wifiChanged || $agentChanged),
            'enrollment_id' => $enrollment?->id,
            'qr_created_at' => $enrollment?->created_at?->toISOString(),
            'use_count' => $enrollment?->use_count ?? 0,
            'managed_devices_count' => (int) ($configuration->devices_count ?? 0),
        ];
    }

    private function validated(Request $request, ?Configuration $configuration = null): array
    {
        $requestedPlatform = (string) $request->input('platform', $configuration?->platform ?? 'android');
        $androidRequired = Rule::requiredIf($requestedPlatform === 'android');
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'platform' => ['nullable', Rule::in(['android'])],
            'enrollment_agent_source' => ['nullable', Rule::in(['active', 'android', 'release'])],
            'enrollment_agent_release_id' => ['nullable', 'uuid', 'exists:agent_releases,id'],
            'management_mode' => ['nullable', Rule::in(['fully_managed', 'supervised', 'corporate', 'standard'])],
            'notes' => ['nullable', 'string', 'max:4000'],
            'kiosk_enabled' => [$androidRequired, 'boolean'],
            'kiosk_type' => ['nullable', 'string'],
            'allowed_apps' => ['nullable', 'array', 'max:100'],
            'allowed_apps.*' => ['string', 'max:255', 'distinct'],
            'library_item_ids' => ['nullable', 'array', 'max:100'],
            'library_item_ids.*' => ['uuid', 'distinct', 'exists:kiosk_assets,id'],
            'launcher_background_color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'launcher_background_image_id' => ['nullable', 'uuid', 'exists:kiosk_assets,id'],
            'launcher_auto_grant_permissions' => ['nullable', 'boolean'],
            'url' => ['nullable', 'string', 'max:2048'],
            'allowed_origins' => [$requestedPlatform === 'android' ? 'present' : 'nullable', 'array', 'max:100'],
            'allowed_origins.*' => ['string', 'max:2048'],
            'orientation' => [$androidRequired, 'in:auto,portrait,landscape'],
            'keep_screen_on' => [$androidRequired, 'boolean'],
            'sync_interval_minutes' => ['nullable', 'integer', 'min:1', 'max:1440'],
            'default_volume' => ['nullable', 'integer', 'min:0', 'max:100'],
            'default_brightness' => ['nullable', 'integer', 'min:0', 'max:100'],
            'admin_pin' => ['nullable', 'string', 'regex:/^[0-9]{6,12}$/'],
            'wifi_ssid' => ['nullable', 'string', 'max:32'],
            'wifi_security_type' => [$androidRequired, 'in:WPA,NONE'],
            'wifi_password' => ['nullable', 'string', 'max:63'],
            'wifi_hidden' => [$androidRequired, 'boolean'],
        ]);
        $platform = $data['platform'] ?? $configuration?->platform ?? 'android';
        if ($configuration !== null && $platform !== $configuration->platform) {
            throw ValidationException::withMessages(['platform' => 'La plateforme d’une configuration existante ne peut pas être modifiée.']);
        }
        $agentSource = $data['enrollment_agent_source'] ?? $configuration?->enrollment_agent_source ?? 'active';
        $agentReleaseId = $request->exists('enrollment_agent_release_id')
            ? ($data['enrollment_agent_release_id'] ?? null)
            : $configuration?->enrollment_agent_release_id;
        if ($agentSource === 'android' && $platform !== 'android') {
            throw ValidationException::withMessages(['enrollment_agent_source' => 'La compilation Android est réservée à Android.']);
        }
        if ($agentSource === 'release') {
            $release = $agentReleaseId ? AgentRelease::query()->find($agentReleaseId) : null;
            if ($release === null || $release->platform !== $platform || ! app(AgentReleaseManager::class)->isDownloadable($release)) {
                throw ValidationException::withMessages(['enrollment_agent_release_id' => 'Choisissez un agent disponible pour cette plateforme.']);
            }
        }
        $agentSelection = [
            'enrollment_agent_source' => $agentSource,
            'enrollment_agent_release_id' => $agentSource === 'release' ? $agentReleaseId : null,
        ];
        $url = trim($data['url'] ?? '');
        $type = $data['kiosk_type'] ?? $configuration?->policy['kiosk_type'] ?? 'web';
        $apps = $data['allowed_apps'] ?? $configuration?->policy['allowed_apps'] ?? [];
        $librarySelectionProvided = $request->exists('library_item_ids');
        $libraryIds = $data['library_item_ids'] ?? collect($configuration?->policy['library_items'] ?? [])->pluck('id')->all();
        $libraryItems = $type === 'launcher' ? $this->libraryItems($libraryIds) : [];
        $backgroundImageId = $request->exists('launcher_background_image_id')
            ? ($data['launcher_background_image_id'] ?? null)
            : data_get($configuration?->policy, 'launcher_background.id');
        $launcherBackground = $type === 'launcher' ? $this->launcherBackground($backgroundImageId) : null;
        if ($type === 'launcher' && $librarySelectionProvided) {
            $apps = collect($libraryItems)->whereIn('type', ['app', 'android_app'])->pluck('package_name')->filter()->unique()->values()->all();
        }
        PolicyPayload::validate($type, $url, $data['allowed_origins'], $data['orientation'], $apps, $libraryItems);
        $pin = ! empty($data['admin_pin']) ? AdminPin::hash($data['admin_pin']) : ($configuration?->policy['admin_pin_hash'] ?? null);
        if ($data['kiosk_enabled'] && ((in_array($type, ['web', 'web_single', 'web_open'], true) && $url === '') || $pin === null)) {
            throw ValidationException::withMessages(['kiosk_enabled' => 'Le kiosque nécessite un code de maintenance et, pour le web, une URL.']);
        }
        $wifi = null;
        if (trim($data['wifi_ssid'] ?? '') !== '') {
            $password = $data['wifi_password'] ?? $configuration?->wifi['password'] ?? '';
            if ($data['wifi_security_type'] === 'WPA' && strlen($password) < 8) {
                throw ValidationException::withMessages(['wifi_password' => 'Le mot de passe WPA doit contenir au moins 8 caractères.']);
            }
            $wifi = [
                'ssid' => trim($data['wifi_ssid']),
                'security_type' => $data['wifi_security_type'],
                'password' => $data['wifi_security_type'] === 'NONE' ? '' : $password,
                'hidden' => $data['wifi_hidden'],
            ];
        }

        return [...$agentSelection, 'name' => trim($data['name']), 'platform' => 'android', 'wifi' => $wifi, 'policy' => [
            'kiosk_enabled' => $data['kiosk_enabled'],
            'kiosk_type' => $type,
            'allowed_apps' => array_values($apps),
            'library_items' => $libraryItems,
            'launcher_background_color' => strtoupper($data['launcher_background_color'] ?? $configuration?->policy['launcher_background_color'] ?? '#7E7F7B'),
            'launcher_background' => $launcherBackground,
            'launcher_auto_grant_permissions' => $data['launcher_auto_grant_permissions'] ?? $configuration?->policy['launcher_auto_grant_permissions'] ?? true,
            'url' => $url,
            'allowed_origins' => $data['allowed_origins'],
            'orientation' => $data['orientation'],
            'keep_screen_on' => $data['keep_screen_on'],
            'sync_interval_minutes' => $data['sync_interval_minutes'] ?? $configuration?->policy['sync_interval_minutes'] ?? 5,
            'default_volume' => $request->exists('default_volume') ? ($data['default_volume'] ?? null) : ($configuration?->policy['default_volume'] ?? null),
            'default_brightness' => $request->exists('default_brightness') ? ($data['default_brightness'] ?? null) : ($configuration?->policy['default_brightness'] ?? null),
            'admin_pin_hash' => $pin,
        ]];
    }

    /** @return array<int, array<string, mixed>> */
    private function libraryItems(array $ids): array
    {
        $assets = KioskAsset::query()->whereIn('id', $ids)->whereIn('platform', ['android', 'all'])->whereIn('type', ['app', 'android_app', 'file'])->get()->keyBy('id');

        return collect($ids)->map(fn (string $id) => $assets->get($id)?->policyPayload())->filter()->values()->all();
    }

    private function launcherBackground(?string $id): ?array
    {
        if ($id === null) {
            return null;
        }

        $asset = KioskAsset::withTrashed()->find($id);
        if ($asset === null || $asset->type !== 'file' || ! in_array($asset->mime_type, ['image/jpeg', 'image/png', 'image/webp'], true)) {
            throw ValidationException::withMessages([
                'launcher_background_image_id' => 'Sélectionnez une image PNG, JPEG ou WebP de la bibliothèque.',
            ]);
        }

        return $asset->policyPayload();
    }

    private function audit(Request $request, string $action, Configuration $configuration, ?string $enrollmentId = null): void
    {
        AuditLog::query()->create([
            'user_id' => $request->user()->id,
            'action' => $action,
            'payload' => ['configuration_id' => $configuration->id, 'enrollment_id' => $enrollmentId],
        ]);
    }
}
