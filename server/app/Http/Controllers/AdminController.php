<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\Configuration;
use App\Models\Device;
use App\Models\DeviceCommand;
use App\Models\DeviceGroup;
use App\Models\KioskAsset;
use App\Models\Organization;
use App\Services\AgentReleaseManager;
use App\Services\ConfigurationPolicyManager;
use App\Services\DevicePolicyHistory;
use App\Support\AdminPin;
use App\Support\PolicyPayload;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminController extends Controller
{
    public function version()
    {
        return ['version' => config('mymdm.version')];
    }

    public function dashboard(Request $request)
    {
        $devices = $this->scopedDevices($request);
        $thresholdHours = Organization::query()->find($this->selectedOrganizationId($request))?->non_sync_threshold_hours ?? 24;
        $total = (clone $devices)->whereNull('revoked_at')->count();
        $revoked = (clone $devices)->whereNotNull('revoked_at')->count();
        $online = (clone $devices)
            ->whereNull('revoked_at')
            ->where('last_seen_at', '>', now()->subMinutes(7))
            ->count();
        $syncedToday = (clone $devices)
            ->whereNull('revoked_at')
            ->where('last_seen_at', '>=', now()->startOfDay())
            ->count();
        $notSynced = (clone $devices)
            ->whereNull('revoked_at')
            ->where(fn ($query) => $query->whereNull('last_seen_at')->orWhere('last_seen_at', '<', now()->subHours($thresholdHours)))
            ->count();
        $platformCounts = (clone $devices)
            ->whereNull('revoked_at')
            ->selectRaw('platform, count(*) as aggregate')
            ->groupBy('platform')
            ->pluck('aggregate', 'platform');
        $platforms = collect(['android'])->mapWithKeys(fn (string $platform) => [
            $platform => [
                'count' => (int) ($platformCounts[$platform] ?? 0),
                'percentage' => $total > 0 ? round(((int) ($platformCounts[$platform] ?? 0) / $total) * 100, 1) : 0,
            ],
        ]);
        $resourceMetrics = $this->dashboardResourceMetrics($devices);

        return [
            'devices' => $total,
            'online' => $online,
            'offline' => max(0, $total - $online),
            'synced_today' => $syncedToday,
            'not_synced' => $notSynced,
            'revoked' => $revoked,
            'platforms' => $platforms,
            'resources' => $resourceMetrics,
            'version' => config('mymdm.version'),
        ];
    }

    private function dashboardResourceMetrics($devices): array
    {
        $values = ['cpu' => [], 'memory' => [], 'storage' => []];
        $platformValues = collect(['android'])
            ->mapWithKeys(fn (string $platform) => [$platform => ['devices' => 0, 'cpu' => [], 'memory' => [], 'storage' => []]])
            ->all();
        $rows = (clone $devices)->whereNull('revoked_at')->get(['platform', 'metrics']);

        $number = static fn (mixed $value): ?float => is_numeric($value) ? (float) $value : null;
        $percent = static function (?float $used, ?float $total): ?float {
            if ($used === null || $total === null || $total <= 0) {
                return null;
            }

            return max(0, min(100, ($used / $total) * 100));
        };
        foreach ($rows as $row) {
            $platform = array_key_exists($row->platform, $platformValues) ? $row->platform : 'android';
            $platformValues[$platform]['devices']++;
            $metrics = is_array($row->metrics) ? $row->metrics : [];
            $cpu = $number($metrics['cpu_percent'] ?? $metrics['performance']['cpu_percent'] ?? null);
            $memoryTotal = $number($metrics['memory_total_bytes'] ?? $metrics['system']['memory_total_bytes'] ?? null);
            $memoryUsed = $number($metrics['memory_used_bytes'] ?? $metrics['performance']['memory_used_bytes'] ?? null);
            if ($memoryUsed === null && $memoryTotal !== null) {
                $memoryFree = $number($metrics['memory_free_bytes'] ?? $metrics['performance']['memory_free_bytes'] ?? null);
                $memoryUsed = $memoryFree !== null ? max(0, $memoryTotal - $memoryFree) : null;
            }
            $storageTotal = $number($metrics['storage_total_bytes'] ?? $metrics['storage']['total_bytes'] ?? null);
            $storageFree = $number($metrics['storage_free_bytes'] ?? $metrics['storage']['free_bytes'] ?? null);
            $resourceValues = ['cpu' => $cpu === null ? null : max(0, min(100, $cpu)), 'memory' => $percent($memoryUsed, $memoryTotal), 'storage' => $percent($storageTotal !== null && $storageFree !== null ? $storageTotal - $storageFree : null, $storageTotal)];
            foreach ($resourceValues as $resource => $value) {
                if ($value !== null) {
                    $values[$resource][] = $value;
                    $platformValues[$platform][$resource][] = $value;
                }
            }
        }

        $aggregate = static function (array $items): array {
            if ($items === []) {
                return ['average_percent' => null, 'min_percent' => null, 'max_percent' => null, 'samples' => 0];
            }

            return ['average_percent' => round(array_sum($items) / count($items), 1), 'min_percent' => round(min($items), 1), 'max_percent' => round(max($items), 1), 'samples' => count($items)];
        };

        return [
            'cpu' => $aggregate($values['cpu']),
            'memory' => $aggregate($values['memory']),
            'storage' => $aggregate($values['storage']),
            'by_platform' => collect($platformValues)->map(fn (array $item) => [
                'devices' => $item['devices'],
                'cpu_percent' => $aggregate($item['cpu'])['average_percent'],
                'memory_percent' => $aggregate($item['memory'])['average_percent'],
                'storage_percent' => $aggregate($item['storage'])['average_percent'],
            ])->all(),
        ];
    }

    public function devices(Request $request)
    {
        return $this->scopedDevices($request)
            ->with(['organization', 'policy', 'policyStatus', 'group'])
            ->latest()
            ->get()
            ->map(fn (Device $device) => [
                'id' => $device->id,
                'organization' => $this->organizationData($device->organization),
                'group' => $this->groupData($device->group),
                'name' => $device->name,
                'platform' => $device->platform ?: 'android',
                'serial_number' => $device->serial_number,
                'manufacturer' => $device->manufacturer,
                'model' => $device->model,
                'android_version' => $device->android_version,
                'os_version' => $device->os_version ?: $device->android_version,
                'sdk_version' => $device->sdk_version,
                'agent_version' => $device->agent_version,
                'agent_version_code' => $device->agent_version_code,
                'management_channel' => 'android_dpc',
                'battery_level' => $device->battery_level,
                'battery_charging' => $device->battery_charging,
                'last_seen_at' => optional($device->last_seen_at)->toISOString(),
                'sync_state' => $this->managementSyncState($device),
                'non_sync_threshold_hours' => $device->organization?->non_sync_threshold_hours ?? 24,
                'status' => $this->status($device),
                'kiosk_enabled' => (bool) $device->policy?->kiosk_enabled,
                'kiosk_type' => $device->policy?->kiosk_type ?? 'web',
                'url' => $device->policy?->url ?? '',
            ]);
    }

    public function device(Device $device, AgentReleaseManager $releases)
    {
        $device->load(['organization', 'group', 'configuration', 'policy', 'policyStatus', 'commands' => fn ($query) => $query->latest('created_at')->latest('id')->limit(12)]);
        $availableAgent = $releases->source($device->platform ?: 'android');

        return [
            'device' => [
                'id' => $device->id,
                'organization_id' => $device->organization_id,
                'organization' => $this->organizationData($device->organization),
                'group_id' => $device->group_id,
                'group' => $this->groupData($device->group),
                'configuration_id' => $device->configuration_id,
                'configuration_name' => $device->configuration?->name,
                'name' => $device->name,
                'platform' => $device->platform ?: 'android',
                'serial_number' => $device->serial_number,
                'manufacturer' => $device->manufacturer,
                'model' => $device->model,
                'android_version' => $device->android_version,
                'os_version' => $device->os_version ?: $device->android_version,
                'sdk_version' => $device->sdk_version,
                'agent_version' => $device->agent_version,
                'agent_version_code' => $device->agent_version_code,
                'battery_level' => $device->battery_level,
                'battery_charging' => $device->battery_charging,
                'volume_level' => $device->volume_level,
                'brightness_level' => $device->brightness_level,
                'metrics' => $device->metrics ?? [],
                'screen' => [
                    'available' => $device->screen_path !== null && Storage::disk('local')->exists($device->screen_path),
                    'updated_at' => optional($device->screen_updated_at)->toISOString(),
                    'url' => '/api/v1/devices/'.$device->id.'/screenshot',
                ],
                'last_seen_at' => optional($device->last_seen_at)->toISOString(),
                'sync_state' => $this->managementSyncState($device),
                'non_sync_threshold_hours' => $device->organization?->non_sync_threshold_hours ?? 24,
                'enrolled_at' => optional($device->enrolled_at)->toISOString(),
                'revoked' => $device->revoked_at !== null,
                'reset_status' => $device->reset_status,
                'reset_error' => $device->reset_error,
            ],
            'policy' => PolicyPayload::fromModel($device->policy, $device->organization?->name),
            'policy_status' => $device->policyStatus ? [
                'revision' => $device->policyStatus->revision,
                'status' => $device->policyStatus->status,
                'error_message' => $device->policyStatus->error_message,
                'applied_at' => optional($device->policyStatus->applied_at)->toISOString(),
            ] : null,
            'available_agent' => $availableAgent,
            'update_available' => ($availableAgent['available'] ?? false) && (
                (int) ($availableAgent['version_code'] ?? 0) > $device->agent_version_code
                || ((int) ($availableAgent['version_code'] ?? 0) === $device->agent_version_code
                    && (string) ($availableAgent['version'] ?? '') !== $device->agent_version)
            ),
            'commands' => $device->commands->map(fn (DeviceCommand $command) => $this->commandData($command))->values(),
            'history' => $this->deviceHistory($device),
            'groups' => DeviceGroup::query()->orderBy('name')->get()->map(fn (DeviceGroup $group) => $this->groupData($group))->values(),
            'organizations' => Organization::query()->orderBy('name')->get()->map(fn (Organization $organization) => $this->organizationData($organization))->values(),
            'library_assets' => KioskAsset::query()->whereIn('platform', ['android', 'all'])->latest()->get()->map->present()->values(),
            'configurations' => Configuration::query()
                ->where('platform', $device->platform ?: 'android')
                ->orderBy('name')
                ->get(['id', 'name', 'platform'])
                ->values(),
        ];
    }

    private function deviceHistory(Device $device): array
    {
        $commands = $device->commands->map(fn (DeviceCommand $command) => [
            ...$this->commandData($command), 'kind' => 'command',
        ]);
        $events = AuditLog::query()->where('device_id', $device->id)->whereIn('action', DevicePolicyHistory::ACTIONS)
            ->latest('created_at')->latest('id')->limit(30)->get()->map(function (AuditLog $event) use ($device): array {
                $payload = $event->payload ?? [];
                $status = $payload['status'] ?? 'recorded';
                if ($status === 'pending' && ((int) ($payload['revision'] ?? 0) < (int) $device->policy->revision
                    || ($payload['enrollment_id'] ?? null) !== $device->enrollment_id)) {
                    $status = 'cancelled';
                }

                return [
                    'id' => $event->id, 'kind' => 'policy', 'type' => $event->action,
                    'status' => $status, 'payload' => $payload,
                    'error_message' => $payload['error'] ?? null,
                    'created_at' => $event->created_at?->toISOString(),
                ];
            });

        return $commands->concat($events)->sortByDesc(fn (array $entry) => ($entry['created_at'] ?? '').$entry['id'])
            ->take(30)->values()->all();
    }

    public function groups(Request $request)
    {
        return DeviceGroup::query()
            ->when($this->selectedOrganizationId($request), fn ($query, $organizationId) => $query->where('organization_id', $organizationId))
            ->withCount('devices')
            ->orderBy('name')
            ->get()
            ->map(fn (DeviceGroup $group) => $this->groupData($group));
    }

    public function createGroup(Request $request)
    {
        $organizationId = $this->selectedOrganizationId($request) ?? Organization::default()->id;
        $data = $request->validate(['name' => ['required', 'string', 'max:100', Rule::unique('device_groups', 'name')->where('organization_id', $organizationId)]]);
        $group = DeviceGroup::query()->create([
            'organization_id' => $organizationId,
            'name' => trim($data['name']),
        ]);
        AuditLog::query()->create(['user_id' => $request->user()->id, 'action' => 'DEVICE_GROUP_CREATED', 'payload' => ['group_id' => $group->id, 'name' => $group->name]]);

        return response()->json($this->groupData($group), 201);
    }

    public function updateGroup(Request $request, DeviceGroup $group)
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:100', Rule::unique('device_groups', 'name')->where('organization_id', $group->organization_id)->ignore($group->id)]]);
        $group->update(['name' => trim($data['name'])]);
        AuditLog::query()->create(['user_id' => $request->user()->id, 'action' => 'DEVICE_GROUP_UPDATED', 'payload' => ['group_id' => $group->id, 'name' => $group->name]]);

        return $this->groupData($group->loadCount('devices'));
    }

    public function deleteGroup(Request $request, DeviceGroup $group)
    {
        $payload = ['group_id' => $group->id, 'name' => $group->name, 'devices' => $group->devices()->count()];
        $group->delete();
        AuditLog::query()->create(['user_id' => $request->user()->id, 'action' => 'DEVICE_GROUP_DELETED', 'payload' => $payload]);

        return ['ok' => true];
    }

    public function updateDeviceIdentity(Request $request, Device $device, AgentReleaseManager $releases)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'organization_id' => ['sometimes', 'required', 'uuid', 'exists:organizations,id'],
            'group_id' => ['nullable', 'uuid', 'exists:device_groups,id'],
        ]);
        $organizationId = $data['organization_id'] ?? $device->organization_id ?? Organization::default()->id;
        $groupId = $data['group_id'] ?? null;
        if ($groupId && ! DeviceGroup::query()->whereKey($groupId)->where('organization_id', $organizationId)->exists()) {
            throw ValidationException::withMessages(['group_id' => 'Le groupe doit appartenir à la même organisation que l’appareil.']);
        }
        $device->update(['name' => trim($data['name']), 'organization_id' => $organizationId, 'group_id' => $groupId]);
        AuditLog::query()->create(['user_id' => $request->user()->id, 'device_id' => $device->id, 'action' => 'DEVICE_IDENTITY_UPDATED', 'payload' => ['name' => $device->name, 'organization_id' => $device->organization_id, 'group_id' => $device->group_id]]);

        return $this->device($device->refresh(), $releases);
    }

    public function command(Request $request, Device $device, AgentReleaseManager $releases)
    {
        $data = $request->validate([
            'type' => ['required', 'in:agent_update,set_volume,set_brightness'],
            'value' => ['nullable', 'integer', 'min:0', 'max:100'],
            'force' => ['nullable', 'boolean'],
        ]);
        abort_if($device->revoked_at !== null, 409, 'Un appareil révoqué ne peut pas recevoir de commande.');

        $payload = [];
        if ($data['type'] === 'agent_update') {
            $source = $releases->source($device->platform ?: 'android');
            if (! ($source['available'] ?? false)) {
                throw ValidationException::withMessages(['type' => 'Aucun agent n’est disponible pour cette plateforme.']);
            }
            $isNewer = (int) $source['version_code'] > $device->agent_version_code
                || ((int) $source['version_code'] === $device->agent_version_code
                    && (string) $source['version'] !== $device->agent_version);
            if (! $isNewer && ! ($data['force'] ?? false)) {
                throw ValidationException::withMessages(['type' => 'Cet appareil utilise déjà la dernière version.']);
            }
            $payload = [
                'version' => $source['version'],
                'version_code' => $source['version_code'],
                'apk_sha256' => $source['artifact_sha256'] ?? $source['apk_sha256'] ?? null,
                'forced' => (bool) ($data['force'] ?? false),
            ];
        } elseif (in_array($data['type'], ['set_volume', 'set_brightness'], true)) {
            if ($device->configuration_id !== null) {
                throw ValidationException::withMessages(['type' => 'Modifiez le volume et la luminosité dans la configuration principale de cet appareil.']);
            }
            if (! array_key_exists('value', $data)) {
                throw ValidationException::withMessages(['value' => 'Une valeur est requise.']);
            }
            $payload = ['value' => (int) $data['value']];
        }

        DB::transaction(function () use ($request, $device, $data, $payload): void {
            $device->commands()->where('type', $data['type'])->where('status', 'pending')->update([
                'status' => 'cancelled',
                'completed_at' => now(),
            ]);
            $command = $device->commands()->create([
                'user_id' => $request->user()->id,
                'type' => $data['type'],
                'payload' => $payload,
                'status' => 'pending',
            ]);
            AuditLog::query()->create([
                'user_id' => $request->user()->id,
                'device_id' => $device->id,
                'action' => 'DEVICE_COMMAND_CREATED',
                'payload' => ['command_id' => $command->id, 'type' => $command->type, 'payload' => $payload],
            ]);
        });

        return $this->device($device->refresh(), $releases);
    }

    public function screenshot(Device $device)
    {
        abort_if($device->screen_path === null || ! Storage::disk('local')->exists($device->screen_path), 404);

        return response()->file(Storage::disk('local')->path($device->screen_path), [
            'Content-Type' => 'image/jpeg',
            'Cache-Control' => 'private, no-store, max-age=0',
        ]);
    }

    public function updateDevice(Request $request, Device $device)
    {
        if ($device->configuration_id !== null) {
            throw ValidationException::withMessages([
                'configuration' => 'Désactivez le profil réutilisable avant de modifier directement la politique de cet appareil.',
            ]);
        }

        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'kiosk_enabled' => ['required', 'boolean'],
            'kiosk_type' => ['nullable', 'string'],
            'url' => ['nullable', 'string'],
            'allowed_origins' => ['nullable', 'array'],
            'allowed_origins.*' => ['string'],
            'allowed_apps' => ['nullable', 'array', 'max:100'],
            'allowed_apps.*' => ['string', 'max:255', 'distinct'],
            'library_item_ids' => ['nullable', 'array', 'max:100'],
            'library_item_ids.*' => ['uuid', 'distinct', 'exists:kiosk_assets,id'],
            'launcher_background_color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'launcher_background_image_id' => ['nullable', 'uuid', 'exists:kiosk_assets,id'],
            'launcher_auto_grant_permissions' => ['nullable', 'boolean'],
            'orientation' => ['nullable', 'string'],
            'keep_screen_on' => ['required', 'boolean'],
            'sync_interval_minutes' => ['nullable', 'integer', 'min:1', 'max:1440'],
            'default_volume' => ['nullable', 'integer', 'min:0', 'max:100'],
            'default_brightness' => ['nullable', 'integer', 'min:0', 'max:100'],
            'admin_pin' => ['nullable', 'string', 'regex:/^[0-9]{6,12}$/'],
        ]);

        $kioskType = $data['kiosk_type'] ?? 'web';
        $url = trim($data['url'] ?? '');
        $allowedOrigins = array_values($data['allowed_origins'] ?? []);
        $orientation = $data['orientation'] ?? 'auto';
        $syncIntervalMinutes = $data['sync_interval_minutes'] ?? $device->policy?->sync_interval_minutes ?? 5;
        $allowedApps = $data['allowed_apps'] ?? $device->policy?->allowed_apps ?? [];
        $librarySelectionProvided = $request->exists('library_item_ids');
        $libraryIds = $data['library_item_ids'] ?? collect($device->policy?->library_items ?? [])->pluck('id')->all();
        $libraryItems = $kioskType === 'launcher' ? $this->libraryItems($libraryIds) : [];
        $backgroundImageId = $request->exists('launcher_background_image_id')
            ? ($data['launcher_background_image_id'] ?? null)
            : data_get($device->policy?->launcher_background, 'id');
        $launcherBackground = $kioskType === 'launcher' ? $this->launcherBackground($backgroundImageId) : null;
        if ($kioskType === 'launcher' && $librarySelectionProvided) {
            $allowedApps = collect($libraryItems)->whereIn('type', ['app', 'android_app'])->pluck('package_name')->filter()->unique()->values()->all();
        }
        PolicyPayload::validate($kioskType, $url, $allowedOrigins, $orientation, $allowedApps, $libraryItems);

        DB::transaction(function () use ($request, $device, $data, $kioskType, $url, $allowedOrigins, $orientation, $syncIntervalMinutes, $allowedApps, $libraryItems, $launcherBackground): void {
            $previousPolicy = $device->policy()->firstOrFail()->toArray();
            if (trim($data['name'] ?? '') !== '') {
                $device->update(['name' => trim($data['name'])]);
            }
            $updates = [
                'revision' => DB::raw('revision + 1'),
                'kiosk_enabled' => $data['kiosk_enabled'],
                'kiosk_type' => $kioskType,
                'url' => $url,
                'allowed_origins' => $allowedOrigins,
                'allowed_apps' => $allowedApps,
                'library_items' => $libraryItems,
                'launcher_background_color' => strtoupper($data['launcher_background_color'] ?? $device->policy?->launcher_background_color ?? '#7E7F7B'),
                'launcher_background' => $launcherBackground,
                'launcher_auto_grant_permissions' => $data['launcher_auto_grant_permissions'] ?? $device->policy?->launcher_auto_grant_permissions ?? true,
                'orientation' => $orientation,
                'keep_screen_on' => $data['keep_screen_on'],
                'sync_interval_minutes' => $syncIntervalMinutes,
                'default_volume' => $request->exists('default_volume') ? ($data['default_volume'] ?? null) : $device->policy?->default_volume,
                'default_brightness' => $request->exists('default_brightness') ? ($data['default_brightness'] ?? null) : $device->policy?->default_brightness,
            ];

            if (! empty($data['admin_pin'])) {
                $updates['admin_pin_hash'] = AdminPin::hash($data['admin_pin']);
            }

            $device->policy()->update($updates);

            app(DevicePolicyHistory::class)->record($device, $previousPolicy, 'DEVICE_POLICY_UPDATED', $request->user()->id);
        });

        return $this->device($device->refresh(), app(AgentReleaseManager::class));
    }

    public function assignConfiguration(Request $request, Device $device, AgentReleaseManager $releases, ConfigurationPolicyManager $configurationPolicies)
    {
        $data = $request->validate([
            'configuration_id' => ['required', 'uuid', 'exists:configurations,id'],
        ]);
        $configuration = Configuration::query()->findOrFail($data['configuration_id']);
        if ($configuration->platform !== ($device->platform ?: 'android')) {
            throw ValidationException::withMessages(['configuration_id' => 'La configuration doit utiliser la même plateforme que l’appareil.']);
        }

        DB::transaction(function () use ($request, $device, $configuration, $configurationPolicies): void {
            $previousPolicy = $device->policy()->first()?->toArray() ?? [];
            $configurationPolicies->assign($configuration, $device);
            app(DevicePolicyHistory::class)->record($device, $previousPolicy, 'DEVICE_CONFIGURATION_ASSIGNED', $request->user()->id,
                ['configuration_id' => $configuration->id, 'configuration_name' => $configuration->name]);
        });

        return $this->device($device->refresh(), $releases);
    }

    public function detachConfiguration(Request $request, Device $device, AgentReleaseManager $releases)
    {
        DB::transaction(function () use ($request, $device): void {
            $configuration = $device->configuration;
            $device->update(['configuration_id' => null]);
            AuditLog::query()->create([
                'user_id' => $request->user()->id,
                'device_id' => $device->id,
                'action' => 'DEVICE_CONFIGURATION_DETACHED',
                'payload' => [
                    'configuration_id' => $configuration?->id,
                    'configuration_name' => $configuration?->name,
                ],
            ]);
        });

        return $this->device($device->refresh(), $releases);
    }

    public function revokeDevice(Request $request, Device $device)
    {
        $device->update(['revoked_at' => $device->revoked_at ?? now()]);

        AuditLog::query()->create([
            'user_id' => $request->user()->id,
            'device_id' => $device->id,
            'action' => 'DEVICE_REVOKED',
            'payload' => [],
        ]);

        return ['ok' => true];
    }

    public function deleteDevice(Request $request, Device $device)
    {
        $request->validate(['confirmation' => ['required', 'in:SUPPRIMER']]);
        DB::transaction(function () use ($request, $device): void {
            $device = Device::query()->lockForUpdate()->findOrFail($device->id);
            if ($device->reset_status === 'pending') {
                $device->update(['reset_status' => null, 'reset_id' => null, 'reset_error' => null]);
                AuditLog::query()->create(['user_id' => $request->user()->id, 'device_id' => $device->id, 'action' => 'DEVICE_RESET_CANCELLED', 'payload' => ['reason' => 'device_deleted']]);
            }
            if ($device->screen_path !== null) {
                Storage::disk('local')->delete($device->screen_path);
            }
            $device->update(['revoked_at' => now()]);
            $device->delete();
            AuditLog::query()->create(['user_id' => $request->user()->id, 'device_id' => $device->id, 'action' => 'DEVICE_DELETED', 'payload' => []]);
        });

        return ['ok' => true];
    }

    public function cancelReset(Request $request, Device $device)
    {
        DB::transaction(function () use ($request, $device): void {
            $device = Device::query()->lockForUpdate()->findOrFail($device->id);
            abort_unless($device->reset_status === 'pending', 409, 'La commande a déjà été transmise ou aucune commande n’attend.');
            $device->update(['reset_status' => null, 'reset_id' => null, 'reset_error' => null]);
            AuditLog::query()->create(['user_id' => $request->user()->id, 'device_id' => $device->id, 'action' => 'DEVICE_RESET_CANCELLED', 'payload' => []]);
        });

        return $this->device($device->refresh(), app(AgentReleaseManager::class));
    }

    public function resetDevice(Request $request, Device $device)
    {
        $request->validate(['confirmation' => ['required', 'in:REINITIALISER']]);
        DB::transaction(function () use ($request, $device): void {
            $device = Device::query()->lockForUpdate()->findOrFail($device->id);
            abort_if($device->revoked_at !== null, 409, 'Un appareil révoqué ne peut pas recevoir de commande.');
            if (in_array($device->reset_status, ['pending', 'dispatched'])) {
                return;
            }
            $device->update(['reset_id' => (string) Str::uuid(), 'reset_status' => 'pending', 'reset_error' => null]);
            AuditLog::query()->create(['user_id' => $request->user()->id, 'device_id' => $device->id, 'action' => 'DEVICE_RESET_REQUESTED', 'payload' => ['reset_id' => $device->reset_id]]);
        });

        return $this->device($device->refresh(), app(AgentReleaseManager::class));
    }

    private function status(Device $device): string
    {
        if ($device->revoked_at) {
            return 'Revoked';
        }

        return $device->last_seen_at && $device->last_seen_at->greaterThan(now()->subMinutes(7))
            ? 'Online'
            : 'Offline';
    }

    private function commandData(DeviceCommand $command): array
    {
        return [
            'id' => $command->id,
            'type' => $command->type,
            'payload' => $command->payload,
            'status' => $command->status,
            'error_message' => $command->error_message,
            'created_at' => $command->created_at->toISOString(),
            'completed_at' => optional($command->completed_at)->toISOString(),
        ];
    }

    private function groupData(?DeviceGroup $group): ?array
    {
        if ($group === null) {
            return null;
        }

        return [
            'id' => $group->id,
            'organization_id' => $group->organization_id,
            'name' => $group->name,
            'devices_count' => $group->devices_count ?? null,
        ];
    }

    private function organizationData(?Organization $organization): ?array
    {
        if ($organization === null) {
            return null;
        }

        return [
            'id' => $organization->id,
            'name' => $organization->name,
            'slug' => $organization->slug,
            'non_sync_threshold_hours' => $organization->non_sync_threshold_hours,
        ];
    }

    private function managementSyncState(Device $device): string
    {
        $thresholdHours = (int) ($device->organization?->non_sync_threshold_hours ?? 24);
        $lastActivity = $device->last_seen_at ?? $device->enrolled_at;
        if ($lastActivity === null || $lastActivity->lessThan(now()->subHours($thresholdHours))) {
            return 'not_synchronized';
        }

        $policyRevision = (int) ($device->policy?->revision ?? 1);
        $policyStatus = $device->policyStatus;
        if ($policyStatus?->status === 'applied' && (int) $policyStatus->revision >= $policyRevision) {
            return 'synchronized';
        }

        return 'pending';
    }

    private function selectedOrganizationId(Request $request): ?string
    {
        $organizationId = $request->header('X-Organization-Id');

        return $organizationId && Organization::query()->whereKey($organizationId)->exists()
            ? $organizationId
            : null;
    }

    private function scopedDevices(Request $request)
    {
        return Device::query()
            ->when($this->selectedOrganizationId($request), fn ($query, $organizationId) => $query->where('organization_id', $organizationId));
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
}
