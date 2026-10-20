<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\Device;
use App\Models\DeviceCommand;
use App\Models\DevicePolicyStatus;
use App\Models\Enrollment;
use App\Models\Organization;
use App\Services\AgentReleaseManager;
use App\Services\ConfigurationPolicyManager;
use App\Services\DevicePolicyHistory;
use App\Support\PolicyPayload;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class DeviceApiController extends Controller
{
    public function enroll(Request $request, ConfigurationPolicyManager $configurationPolicies)
    {
        $data = $request->validate([
            'enrollment_token' => ['required', 'string'],
            'manufacturer' => ['nullable', 'string'],
            'model' => ['nullable', 'string'],
            'android_version' => ['nullable', 'string'],
            'sdk_version' => ['nullable', 'integer'],
            'agent_version' => ['nullable', 'string'],
            'version_code' => ['nullable', 'integer', 'min:0'],
            'serial_number' => ['nullable', 'string', 'max:255'],
        ]);

        return DB::transaction(function () use ($data, $configurationPolicies) {
            $enrollment = Enrollment::query()
                ->where('token_hash', hash('sha256', $data['enrollment_token']))
                ->where('status', 'active')
                ->where(fn ($query) => $query->whereNull('expires_at')->orWhere('expires_at', '>', now()))
                ->lockForUpdate()
                ->first();

            if (! $enrollment) {
                abort(401, 'invalid enrollment token');
            }

            $deviceToken = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
            $manufacturer = $data['manufacturer'] ?? '';
            $model = $data['model'] ?? '';
            $name = trim($manufacturer.' '.$model) ?: 'Android device';
            $serialNumber = $this->normalizeSerialNumber($data['serial_number'] ?? null);
            $configuration = $enrollment->configuration;
            $sourcePolicy = $configuration?->policy ?? $enrollment->policy_snapshot ?? [];
            $policyAttributes = [
                'revision' => 1,
                ...$configurationPolicies->attributes($sourcePolicy),
            ];

            $device = $serialNumber === null ? null : Device::withTrashed()
                ->where('serial_number', $serialNumber)
                ->lockForUpdate()
                ->first();
            $reused = $device !== null;

            $attributes = [
                'organization_id' => $device?->organization_id ?? Organization::default()->id,
                'configuration_id' => $enrollment->configuration_id,
                'platform' => 'android',
                'serial_number' => $serialNumber,
                'manufacturer' => $manufacturer,
                'model' => $model,
                'android_version' => $data['android_version'] ?? '',
                'os_version' => $data['android_version'] ?? '',
                'sdk_version' => $data['sdk_version'] ?? 0,
                'agent_version' => $data['agent_version'] ?? '',
                'agent_version_code' => $data['version_code'] ?? 0,
                'credential_hash' => hash('sha256', $deviceToken),
                'enrollment_id' => $enrollment->id,
                'enrolled_at' => now(),
                'last_seen_at' => null,
                'revoked_at' => null,
                'reset_id' => null,
                'reset_status' => null,
                'reset_error' => null,
                'battery_level' => null,
                'battery_charging' => null,
                'volume_level' => null,
                'brightness_level' => null,
                'metrics' => $serialNumber === null ? null : ['serial' => $serialNumber],
                'screen_path' => null,
                'screen_updated_at' => null,
            ];

            if ($device) {
                if ($device->screen_path !== null) {
                    Storage::disk('local')->delete($device->screen_path);
                }
                $device->restore();
                $device->commands()->whereIn('status', ['pending', 'dispatched'])->update(['status' => 'cancelled', 'completed_at' => now()]);
                $device->policyStatus()->delete();
                $device->update($attributes);
                $policy = $device->policy()->updateOrCreate([], $policyAttributes);
            } else {
                $device = Device::query()->create(['name' => $name, ...$attributes]);
                $policy = $device->policy()->create($policyAttributes);
            }

            $enrollment->update([
                'status' => $enrollment->configuration_id ? 'active' : 'used',
                'used_at' => now(),
                'device_id' => $enrollment->configuration_id ? null : $device->id,
                'use_count' => $enrollment->use_count + 1,
            ]);

            AuditLog::query()->create([
                'device_id' => $device->id,
                'action' => $reused ? 'DEVICE_REENROLLED' : 'DEVICE_ENROLLED',
                'payload' => ['serial_number' => $serialNumber],
            ]);
            if ($enrollment->configuration_id) {
                app(DevicePolicyHistory::class)->record($device, [], 'DEVICE_CONFIGURATION_ASSIGNED', null,
                    ['configuration_id' => $enrollment->configuration_id, 'configuration_name' => $enrollment->configuration?->name]);
            }

            return response()->json([
                'device_id' => $device->id,
                'device_token' => $deviceToken,
                'reused' => $reused,
                'policy' => PolicyPayload::fromModel($policy, $device->organization?->name),
            ], 201);
        });
    }

    public function heartbeat(Request $request)
    {
        /** @var Device $device */
        $device = $request->attributes->get('device');
        $data = $request->validate([
            'agent_version' => ['nullable', 'string'],
            'version_code' => ['nullable', 'integer', 'min:0'],
            'android_version' => ['nullable', 'string'],
            'sdk_version' => ['nullable', 'integer'],
            'battery_level' => ['nullable', 'integer', 'min:0', 'max:100'],
            'battery_charging' => ['nullable', 'boolean'],
            'volume_level' => ['nullable', 'integer', 'min:0', 'max:100'],
            'brightness_level' => ['nullable', 'integer', 'min:0', 'max:100'],
            'kiosk_active' => ['nullable', 'boolean'],
            'policy_revision' => ['nullable', 'integer'],
            'metrics' => ['nullable', 'array'],
            'metrics.serial' => ['nullable', 'string', 'max:255'],
            'metrics.storage_total_bytes' => ['nullable', 'integer', 'min:0'],
            'metrics.storage_free_bytes' => ['nullable', 'integer', 'min:0'],
            'metrics.memory_total_bytes' => ['nullable', 'integer', 'min:0'],
            'metrics.memory_free_bytes' => ['nullable', 'integer', 'min:0'],
            'metrics.uptime_seconds' => ['nullable', 'integer', 'min:0'],
            'metrics.screen_width' => ['nullable', 'integer', 'min:0'],
            'metrics.screen_height' => ['nullable', 'integer', 'min:0'],
            'metrics.screen_density_dpi' => ['nullable', 'integer', 'min:0'],
            'metrics.installed_app_count' => ['nullable', 'integer', 'min:0'],
            'metrics.wifi_ssid' => ['nullable', 'string', 'max:255'],
            'metrics.wifi_rssi' => ['nullable', 'integer'],
            'metrics.wifi_link_mbps' => ['nullable', 'integer'],
            'metrics.device_owner' => ['nullable', 'boolean'],
            'metrics.location_latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'metrics.location_longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'metrics.location_accuracy_meters' => ['nullable', 'numeric', 'min:0'],
            'metrics.location_provider' => ['nullable', 'string', 'max:64'],
            'metrics.location_timestamp' => ['nullable', 'integer', 'min:0'],
            'metrics.location_permission_granted' => ['nullable', 'boolean'],
            'metrics.location_background_permission_granted' => ['nullable', 'boolean'],
            'metrics.location_enabled' => ['nullable', 'boolean'],
            'metrics.location_last_request_timestamp' => ['nullable', 'integer', 'min:0'],
            'metrics.location_last_success_timestamp' => ['nullable', 'integer', 'min:0'],
            'metrics.location_last_error' => ['nullable', 'string', 'max:500'],
            'metrics.location_providers' => ['nullable', 'string', 'max:255'],
            'metrics.location_strategy' => ['nullable', 'string', 'max:100'],
            'metrics.location_google_play_services_status' => ['nullable', 'integer'],
            'metrics.location_settings_status' => ['nullable', 'integer'],
            'metrics.location_foreground_session_started' => ['nullable', 'boolean'],
            'metrics.location_continuous_tracking' => ['nullable', 'boolean'],
        ]);

        $reportedSerialNumber = $this->normalizeSerialNumber($data['metrics']['serial'] ?? null);
        $serialNumber = $device->serial_number;
        if ($serialNumber === null && $reportedSerialNumber !== null) {
            $alreadyAssigned = Device::withTrashed()
                ->where('serial_number', $reportedSerialNumber)
                ->whereKeyNot($device->id)
                ->exists();
            if (! $alreadyAssigned) {
                $serialNumber = $reportedSerialNumber;
            }
        }

        $device->update([
            'serial_number' => $serialNumber,
            'last_seen_at' => now(),
            'agent_version' => ($data['agent_version'] ?? '') ?: $device->agent_version,
            'agent_version_code' => ($data['version_code'] ?? 0) > 0 ? $data['version_code'] : $device->agent_version_code,
            'android_version' => ($data['android_version'] ?? '') ?: $device->android_version,
            'os_version' => ($data['android_version'] ?? '') ?: $device->os_version,
            'sdk_version' => ($data['sdk_version'] ?? 0) > 0 ? $data['sdk_version'] : $device->sdk_version,
            'battery_level' => $data['battery_level'] ?? $device->battery_level,
            'battery_charging' => $data['battery_charging'] ?? $device->battery_charging,
            'volume_level' => $data['volume_level'] ?? $device->volume_level,
            'brightness_level' => $data['brightness_level'] ?? $device->brightness_level,
            'metrics' => $data['metrics'] ?? $device->metrics,
        ]);

        $device->commands()
            ->where('type', 'agent_update')
            ->whereIn('status', ['pending', 'dispatched'])
            ->get()
            ->filter(fn (DeviceCommand $command) => (int) ($command->payload['version_code'] ?? PHP_INT_MAX) <= $device->agent_version_code)
            ->each(fn (DeviceCommand $command) => $command->update(['status' => 'applied', 'completed_at' => now()]));

        $revision = $device->policy()->value('revision') ?? 1;
        $reportedRevision = (int) ($data['policy_revision'] ?? 0);
        if ($reportedRevision > 0 && $reportedRevision === (int) $revision) {
            $currentStatus = DevicePolicyStatus::query()->where('device_id', $device->id)->first();
            if ($currentStatus?->status !== 'failed' || (int) $currentStatus->revision !== $reportedRevision) {
                DevicePolicyStatus::query()->updateOrCreate(
                    ['device_id' => $device->id],
                    [
                        'revision' => $reportedRevision,
                        'status' => 'applied',
                        'error_message' => null,
                        'applied_at' => now(),
                    ],
                );
                app(DevicePolicyHistory::class)->acknowledge($device, $reportedRevision, 'applied', null);
            }
        }
        $command = $device->commands()->where('status', 'pending')->oldest()->first();

        return [
            'factory_reset' => $device->reset_status === 'pending' ? $device->reset_id : null,
            'command' => $command ? [
                'id' => $command->id,
                'type' => $command->type,
                'payload' => $command->payload,
            ] : null,
            'organization_name' => $device->organization?->name ?? config('mymdm.organization_name'),
            'current_policy_revision' => $revision,
            'policy_changed' => $revision !== $reportedRevision,
        ];
    }

    public function screenshot(Request $request)
    {
        $data = $request->validate([
            'screen' => ['required', 'file', 'mimetypes:image/jpeg', 'max:1536'],
        ]);
        /** @var Device $device */
        $device = $request->attributes->get('device');
        $contents = file_get_contents($data['screen']->getRealPath());
        abort_if($contents === false, 422, 'Unable to read the screenshot.');
        $path = 'device-screens/'.$device->id.'.jpg';
        Storage::disk('local')->put($path, $contents);
        $device->update(['screen_path' => $path, 'screen_updated_at' => now()]);

        return ['ok' => true, 'captured_at' => $device->screen_updated_at->toISOString()];
    }

    public function location(Request $request)
    {
        $data = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'accuracy_meters' => ['nullable', 'numeric', 'min:0'],
            'provider' => ['nullable', 'string', 'max:64'],
            'timestamp' => ['required', 'integer', 'min:0'],
        ]);
        /** @var Device $device */
        $device = $request->attributes->get('device');
        $metrics = array_merge($device->metrics ?? [], [
            'location_latitude' => (float) $data['latitude'],
            'location_longitude' => (float) $data['longitude'],
            'location_accuracy_meters' => isset($data['accuracy_meters']) ? (float) $data['accuracy_meters'] : null,
            'location_provider' => $data['provider'] ?? null,
            'location_timestamp' => (int) $data['timestamp'],
            'location_permission_granted' => true,
            'location_enabled' => true,
        ]);
        $device->update(['metrics' => $metrics, 'last_seen_at' => now()]);

        return ['ok' => true];
    }

    public function commandStatus(Request $request)
    {
        $data = $request->validate([
            'command_id' => ['required', 'uuid'],
            'status' => ['required', 'in:dispatched,applied,failed'],
            'error' => ['nullable', 'string', 'max:2000'],
            'metrics' => ['nullable', 'array:location_latitude,location_longitude,location_accuracy_meters,location_provider,location_timestamp,location_permission_granted,location_background_permission_granted,location_enabled,location_last_request_timestamp,location_last_success_timestamp,location_last_error,location_providers,location_strategy,location_google_play_services_status,location_settings_status,location_foreground_session_started,location_continuous_tracking'],
            'metrics.location_latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'metrics.location_longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'metrics.location_accuracy_meters' => ['nullable', 'numeric', 'min:0'],
            'metrics.location_provider' => ['nullable', 'string', 'max:64'],
            'metrics.location_timestamp' => ['nullable', 'integer', 'min:0'],
            'metrics.location_permission_granted' => ['nullable', 'boolean'],
            'metrics.location_background_permission_granted' => ['nullable', 'boolean'],
            'metrics.location_enabled' => ['nullable', 'boolean'],
            'metrics.location_last_request_timestamp' => ['nullable', 'integer', 'min:0'],
            'metrics.location_last_success_timestamp' => ['nullable', 'integer', 'min:0'],
            'metrics.location_last_error' => ['nullable', 'string', 'max:500'],
            'metrics.location_providers' => ['nullable', 'string', 'max:255'],
            'metrics.location_strategy' => ['nullable', 'string', 'max:100'],
            'metrics.location_google_play_services_status' => ['nullable', 'integer'],
            'metrics.location_settings_status' => ['nullable', 'integer'],
            'metrics.location_foreground_session_started' => ['nullable', 'boolean'],
            'metrics.location_continuous_tracking' => ['nullable', 'boolean'],
        ]);
        /** @var Device $device */
        $device = $request->attributes->get('device');

        return DB::transaction(function () use ($device, $data): array {
            $command = $device->commands()->lockForUpdate()->findOrFail($data['command_id']);
            abort_unless(in_array($command->status, ['pending', 'dispatched']), 409);
            abort_if($command->status === 'dispatched' && $data['status'] === 'dispatched', 409);
            $finished = in_array($data['status'], ['applied', 'failed']);
            $command->update([
                'status' => $data['status'],
                'error_message' => $data['status'] === 'failed' ? ($data['error'] ?? 'Android failure') : null,
                'dispatched_at' => $command->dispatched_at ?? now(),
                'completed_at' => $finished ? now() : null,
            ]);
            if (! empty($data['metrics'])) {
                $device->update(['metrics' => array_merge($device->metrics ?? [], $data['metrics'])]);
            }
            AuditLog::query()->create([
                'device_id' => $device->id,
                'action' => 'DEVICE_COMMAND_'.strtoupper($data['status']),
                'payload' => ['command_id' => $command->id, 'type' => $command->type, 'error' => $command->error_message],
            ]);

            return ['ok' => true];
        });
    }

    private function normalizeSerialNumber(?string $serialNumber): ?string
    {
        $normalized = strtoupper(trim((string) $serialNumber));

        return $normalized === '' || $normalized === 'UNKNOWN' ? null : $normalized;
    }

    public function resetStatus(Request $request)
    {
        $data = $request->validate(['reset_id' => ['required', 'uuid'], 'status' => ['required', 'in:dispatched,failed'], 'error' => ['nullable', 'string', 'max:2000']]);
        $device = $request->attributes->get('device');

        return DB::transaction(function () use ($device, $data): array {
            $device = Device::query()->lockForUpdate()->findOrFail($device->id);
            abort_unless($device->reset_id === $data['reset_id'] &&
                ($data['status'] === 'dispatched' ? $device->reset_status === 'pending' : in_array($device->reset_status, ['pending', 'dispatched'])), 409);
            $device->update(['reset_status' => $data['status'], 'reset_error' => $data['status'] === 'failed' ? ($data['error'] ?? 'Android failure') : null]);
            AuditLog::query()->create(['device_id' => $device->id, 'action' => 'DEVICE_RESET_'.strtoupper($data['status']), 'payload' => ['reset_id' => $device->reset_id, 'error' => $device->reset_error]]);

            return ['ok' => true];
        });
    }

    public function policy(Request $request)
    {
        /** @var Device $device */
        $device = $request->attributes->get('device');

        return PolicyPayload::fromModel($device->policy()->firstOrFail(), $device->organization?->name);
    }

    public function policyStatus(Request $request)
    {
        /** @var Device $device */
        $device = $request->attributes->get('device');
        $data = $request->validate([
            'revision' => ['required', 'integer'],
            'status' => ['required', 'string'],
            'error' => ['nullable', 'string'],
        ]);

        DevicePolicyStatus::query()->updateOrCreate(
            ['device_id' => $device->id],
            [
                'revision' => $data['revision'],
                'status' => $data['status'],
                'error_message' => $data['error'] ?? null,
                'applied_at' => $data['status'] === 'applied' ? now() : null,
            ],
        );
        app(DevicePolicyHistory::class)->acknowledge($device, (int) $data['revision'], $data['status'], $data['error'] ?? null);

        return ['ok' => true];
    }

    public function agentUpdate(Request $request, AgentReleaseManager $releases)
    {
        /** @var Device $device */
        $device = $request->attributes->get('device');
        $data = $request->validate([
            'command_id' => ['nullable', 'uuid'],
        ]);
        $commandQuery = $device->commands()
            ->where('type', 'agent_update')
            ->whereIn('status', ['pending', 'dispatched']);
        $command = isset($data['command_id'])
            ? $commandQuery->whereKey($data['command_id'])->first()
            : $commandQuery->latest()->first();
        if ($command === null) {
            return ['available' => false];
        }

        $release = $releases->source($device->platform ?: 'android');
        if (! ($release['available'] ?? false)) {
            return ['available' => false];
        }

        $targetVersionCode = (int) ($command->payload['version_code'] ?? 0);
        $targetVersion = (string) ($command->payload['version'] ?? '');
        $targetSha256 = (string) ($command->payload['apk_sha256'] ?? '');
        $releaseSha256 = (string) ($release['artifact_sha256'] ?? $release['apk_sha256'] ?? '');
        $matchesCommand = (int) $release['version_code'] === $targetVersionCode
            && (string) $release['version'] === $targetVersion
            && ($targetSha256 === '' || hash_equals($targetSha256, $releaseSha256));
        if (! $matchesCommand) {
            return ['available' => false];
        }

        $serverVersionCode = (int) $release['version_code'];
        $deviceVersionCode = (int) $request->query('version_code', 0);
        $serverVersion = (string) $release['version'];
        $deviceVersion = (string) $request->query('agent_version', '');
        $available = (bool) ($command->payload['forced'] ?? false) || ($deviceVersionCode > 0
            ? $serverVersionCode > $deviceVersionCode
            : ($deviceVersion !== '' && $serverVersion !== $deviceVersion));

        return [
            'available' => $available,
            'version' => $serverVersion,
            'version_code' => $serverVersionCode,
            'apk_sha256' => $releaseSha256,
            'size' => $release['artifact_size'] ?? $release['apk_size'],
            'download_url' => $releases->downloadUrl(),
        ];
    }
}
