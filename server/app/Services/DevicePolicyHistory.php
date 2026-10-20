<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Device;

class DevicePolicyHistory
{
    public const ACTIONS = ['DEVICE_POLICY_UPDATED', 'DEVICE_CONFIGURATION_ASSIGNED', 'DEVICE_CONFIGURATION_UPDATED', 'DEVICE_CONFIGURATION_DETACHED', 'KIOSK_ENABLED', 'KIOSK_DISABLED'];

    public function record(Device $device, array $before, string $action, ?string $userId = null, array $context = []): void
    {
        $policy = $device->policy()->firstOrFail();
        $after = $policy->toArray();
        $changes = [];
        $previousValues = $this->snapshot($before);
        foreach ($this->snapshot($after) as $field => $value) {
            $previous = $previousValues[$field] ?? null;
            if ($previous !== $value) {
                $changes[$field] = ['from' => $previous, 'to' => $value];
            }
        }
        if (($before['admin_pin_hash'] ?? null) !== ($after['admin_pin_hash'] ?? null)) {
            $changes['admin_pin'] = ['from' => null, 'to' => 'Changed'];
        }
        if ($action === 'DEVICE_POLICY_UPDATED' && $changes === []) {
            return;
        }

        AuditLog::query()->create([
            'user_id' => $userId,
            'device_id' => $device->id,
            'action' => $action,
            'payload' => [...$context, 'enrollment_id' => $device->enrollment_id, 'revision' => $policy->revision, 'status' => 'pending', 'changes' => $changes],
        ]);
    }

    public function acknowledge(Device $device, int $revision, string $status, ?string $error): void
    {
        if (! in_array($status, ['applied', 'failed'], true)) {
            return;
        }
        $events = AuditLog::query()->where('device_id', $device->id)->whereIn('action', self::ACTIONS)
            ->where('payload->revision', $revision)->where('payload->enrollment_id', $device->enrollment_id)->get();
        foreach ($events as $event) {
            if (($event->payload['status'] ?? null) !== $status || ($event->payload['error'] ?? null) !== $error) {
                $event->update(['payload' => [...$event->payload, 'status' => $status, 'error' => $error]]);
            }
        }
    }

    private function snapshot(array $policy): array
    {
        return [
            ...array_intersect_key($policy, array_flip(['kiosk_enabled', 'kiosk_type', 'url', 'allowed_origins', 'allowed_apps', 'orientation', 'keep_screen_on', 'sync_interval_minutes', 'default_volume', 'default_brightness', 'launcher_background_color', 'launcher_auto_grant_permissions'])),
            'library_items' => collect($policy['library_items'] ?? [])->map(fn (array $item) => ['id' => $item['id'], 'name' => $item['name']])->all(),
            'launcher_background' => isset($policy['launcher_background']) ? ['id' => $policy['launcher_background']['id'], 'name' => $policy['launcher_background']['name']] : null,
        ];
    }
}
