<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Configuration;
use App\Models\Device;
use App\Models\User;
use App\Services\ConfigurationPolicyManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DevicePolicyHistoryTest extends TestCase
{
    use RefreshDatabase;

    private function policy(array $overrides = []): array
    {
        return array_replace([
            'kiosk_enabled' => false, 'kiosk_type' => 'web_open', 'url' => 'https://example.org',
            'allowed_origins' => [], 'orientation' => 'auto', 'keep_screen_on' => true,
            'sync_interval_minutes' => 5, 'default_volume' => 10, 'default_brightness' => 20,
        ], $overrides);
    }

    private function device(): Device
    {
        $device = Device::query()->create(['name' => 'Appareil de test', 'credential_hash' => hash('sha256', 'history-device')]);
        $device->policy()->create(['revision' => 1, ...app(ConfigurationPolicyManager::class)->attributes($this->policy())]);
        $this->actingAs(User::factory()->create());

        return $device;
    }

    public function test_personal_history_contains_only_changed_parameters_and_hides_the_maintenance_code(): void
    {
        $device = $this->device();
        $device->commands()->create(['type' => 'agent_update', 'status' => 'pending', 'payload' => []]);
        $other = Device::query()->create(['name' => 'Autre appareil', 'credential_hash' => hash('sha256', 'other-device')]);
        AuditLog::query()->create(['device_id' => $other->id, 'action' => 'DEVICE_CONFIGURATION_ASSIGNED', 'payload' => ['configuration_name' => 'Autre profil']]);
        $response = $this->patchJson('/api/v1/devices/'.$device->id, $this->policy([
            'orientation' => 'portrait', 'default_volume' => 30, 'default_brightness' => 60, 'admin_pin' => '123456',
        ]))->assertOk();
        $history = collect($response->json('history'));
        $event = $history->where('type', 'DEVICE_POLICY_UPDATED')->sole();
        $this->assertSame('pending', $event['status']);
        $this->assertSame(2, $event['payload']['revision']);
        $this->assertEqualsCanonicalizing(['orientation', 'default_volume', 'default_brightness', 'admin_pin'], array_keys($event['payload']['changes']));
        $this->assertSame(['from' => 10, 'to' => 30], $event['payload']['changes']['default_volume']);
        $this->assertSame('Changed', $event['payload']['changes']['admin_pin']['to']);
        $this->assertStringNotContainsString('123456', json_encode($history));
        $this->assertStringNotContainsString('pbkdf2', json_encode($history));
        $this->assertCount(2, $history);
        $this->assertSame('command', $history->where('type', 'agent_update')->sole()['kind']);

        $this->withToken('history-device')->postJson('/api/v1/device/policy/status', ['revision' => 2, 'status' => 'failed', 'error' => 'Test erreur'])->assertOk();
        $failed = collect($this->getJson('/api/v1/devices/'.$device->id)->assertOk()->json('history'))->where('id', $event['id'])->sole();
        $this->assertSame('failed', $failed['status']);
        $this->assertSame('Test erreur', $failed['error_message']);
        $this->withToken('history-device')->postJson('/api/v1/device/policy/status', ['revision' => 2, 'status' => 'applied'])->assertOk();
        $this->patchJson('/api/v1/devices/'.$device->id, $this->policy(['orientation' => 'portrait', 'default_volume' => 40, 'default_brightness' => 60]))->assertOk();
        $this->withToken('history-device')->postJson('/api/v1/device/heartbeat', ['policy_revision' => 3])->assertOk();
        $events = collect($this->getJson('/api/v1/devices/'.$device->id)->assertOk()->json('history'))->where('type', 'DEVICE_POLICY_UPDATED');
        $this->assertSame(['applied'], $events->pluck('status')->unique()->values()->all());
        $this->assertNull($events->where('id', $event['id'])->sole()['error_message']);
    }

    public function test_profile_assignment_changes_and_detachment_are_visible_on_the_device_history(): void
    {
        $device = $this->device();
        $configuration = Configuration::query()->create(['name' => 'Accueil', 'platform' => 'android', 'policy' => $this->policy()]);
        $this->postJson('/api/v1/devices/'.$device->id.'/configuration', ['configuration_id' => $configuration->id])
            ->assertOk()->assertJsonPath('history.0.type', 'DEVICE_CONFIGURATION_ASSIGNED')
            ->assertJsonPath('history.0.payload.configuration_name', 'Accueil');
        $this->patchJson('/api/v1/configurations/'.$configuration->id, [
            'name' => 'Accueil', ...$this->policy(['default_volume' => 75]), 'wifi_security_type' => 'WPA', 'wifi_hidden' => false,
        ])->assertOk();
        $history = collect($this->getJson('/api/v1/devices/'.$device->id)->assertOk()->json('history'));
        $this->assertSame('cancelled', $history->where('type', 'DEVICE_CONFIGURATION_ASSIGNED')->sole()['status']);
        $updated = $history->where('type', 'DEVICE_CONFIGURATION_UPDATED')->sole();
        $this->assertSame('Accueil', $updated['payload']['configuration_name']);
        $this->assertSame(['default_volume' => ['from' => 10, 'to' => 75]], $updated['payload']['changes']);
        $this->deleteJson('/api/v1/devices/'.$device->id.'/configuration')->assertOk();
        $history = collect($this->getJson('/api/v1/devices/'.$device->id)->assertOk()->json('history'));
        $this->assertSame('recorded', $history->where('type', 'DEVICE_CONFIGURATION_DETACHED')->sole()['status']);
        $this->patchJson('/api/v1/configurations/'.$configuration->id, [
            'name' => 'Accueil', ...$this->policy(['default_volume' => 80]), 'wifi_security_type' => 'WPA', 'wifi_hidden' => false,
        ])->assertOk();
        $this->assertSame(1, AuditLog::query()->where('device_id', $device->id)->where('action', 'DEVICE_CONFIGURATION_UPDATED')->count());
    }

    public function test_a_new_enrollment_does_not_acknowledge_an_old_policy_with_the_same_revision(): void
    {
        $device = $this->device();
        $old = AuditLog::query()->create([
            'device_id' => $device->id, 'action' => 'DEVICE_CONFIGURATION_ASSIGNED',
            'payload' => ['revision' => 1, 'status' => 'pending', 'enrollment_id' => 'old-enrollment'],
        ]);
        $this->withToken('history-device')->postJson('/api/v1/device/heartbeat', ['policy_revision' => 1])->assertOk();
        $this->assertSame('pending', $old->refresh()->payload['status']);
        $this->getJson('/api/v1/devices/'.$device->id)->assertOk()->assertJsonPath('history.0.status', 'cancelled');
    }
}
