<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class DeviceControlTest extends TestCase
{
    use RefreshDatabase;

    public function test_telemetry_and_remote_commands_are_scoped_and_tracked(): void
    {
        config(['mymdm.apk_path' => '/missing-agent.apk', 'mymdm.android_apk_path' => '/missing-android-agent.apk']);
        $device = Device::query()->create(['name' => 'Tablet', 'credential_hash' => hash('sha256', 'device-secret')]);
        $device->policy()->create(['revision' => 1]);
        $other = Device::query()->create(['name' => 'Other', 'credential_hash' => hash('sha256', 'other-secret')]);
        $other->policy()->create(['revision' => 1]);

        $this->withToken('device-secret')->postJson('/api/v1/device/heartbeat', [
            'agent_version' => '0.2.0-dev', 'version_code' => 8, 'battery_level' => 67,
            'battery_charging' => true, 'volume_level' => 42, 'brightness_level' => 73,
            'metrics' => ['serial' => 'ABC123', 'storage_total_bytes' => 128000000000, 'device_owner' => true, 'location_latitude' => 48.8566, 'location_longitude' => 2.3522, 'location_accuracy_meters' => 18.0, 'location_timestamp' => 1788868800000, 'location_permission_granted' => true, 'location_background_permission_granted' => true, 'location_enabled' => true, 'location_last_request_timestamp' => 1788868770000, 'location_last_success_timestamp' => 1788868805000, 'location_last_error' => null, 'location_providers' => 'fused, network, gps', 'location_strategy' => 'foreground_google_fused_updates+android', 'location_google_play_services_status' => 0, 'location_settings_status' => 0, 'location_foreground_session_started' => true],
        ])->assertOk()->assertJsonPath('command', null);
        $this->assertDatabaseHas('devices', [
            'id' => $device->id, 'serial_number' => 'ABC123', 'agent_version_code' => 8, 'battery_level' => 67,
            'battery_charging' => true, 'volume_level' => 42, 'brightness_level' => 73,
        ]);
        $this->assertSame('ABC123', $device->refresh()->metrics['serial']);

        $url = '/api/v1/devices/'.$device->id.'/commands';
        $this->postJson($url, ['type' => 'set_volume', 'value' => 25])->assertUnauthorized();
        $this->actingAs(User::factory()->create());
        $this->postJson($url, ['type' => 'set_volume'])->assertUnprocessable();
        $this->postJson($url, ['type' => 'set_volume', 'value' => 25])->assertOk();
        $first = $device->commands()->where('status', 'pending')->sole()->id;
        $this->postJson($url, ['type' => 'set_volume', 'value' => 80])->assertOk();
        $second = $device->commands()->where('status', 'pending')->sole()->id;
        $this->assertDatabaseHas('device_commands', ['id' => $first, 'status' => 'cancelled']);

        $this->withToken('device-secret')->postJson('/api/v1/device/heartbeat')->assertOk()
            ->assertJsonPath('command.id', $second)->assertJsonPath('command.payload.value', 80);
        $this->withToken('other-secret')->postJson('/api/v1/device/command/status', ['command_id' => $second, 'status' => 'applied'])->assertNotFound();
        $this->withToken('device-secret')->postJson('/api/v1/device/command/status', ['command_id' => $second, 'status' => 'applied'])->assertOk();
        $this->assertDatabaseHas('device_commands', ['id' => $second, 'status' => 'applied']);

        $this->getJson('/api/v1/devices/'.$device->id)->assertOk()
            ->assertJsonPath('device.metrics.location_latitude', 48.8566)
            ->assertJsonPath('device.metrics.location_permission_granted', true)
            ->assertJsonPath('device.metrics.location_background_permission_granted', true)
            ->assertJsonPath('device.metrics.location_strategy', 'foreground_google_fused_updates+android')
            ->assertJsonPath('device.metrics.location_foreground_session_started', true)
            ->assertJsonPath('device.metrics.location_providers', 'fused, network, gps');
        $this->postJson($url, ['type' => 'request_location'])->assertUnprocessable();
        $this->postJson($url, ['type' => 'capture_screen'])->assertUnprocessable();
        $this->withToken('device-secret')->postJson('/api/v1/device/location', [
            'latitude' => 43.2965,
            'longitude' => 5.3698,
            'accuracy_meters' => 12,
            'provider' => 'network',
            'timestamp' => 1788955200000,
        ])->assertOk();
        $this->getJson('/api/v1/devices/'.$device->id)->assertOk()
            ->assertJsonPath('device.metrics.location_latitude', 43.2965)
            ->assertJsonPath('device.metrics.location_provider', 'network')
            ->assertJsonPath('device.metrics.serial', 'ABC123');
        $this->postJson($url, ['type' => 'agent_update'])->assertUnprocessable();
    }

    public function test_kiosk_screenshot_is_private_and_scoped_to_the_device(): void
    {
        Storage::fake('local');
        $device = Device::query()->create(['name' => 'Tablet', 'credential_hash' => hash('sha256', 'device-secret')]);
        $device->policy()->create(['revision' => 1]);
        $upload = static fn () => UploadedFile::fake()->create('kiosk.jpg', 24, 'image/jpeg');

        $this->post('/api/v1/device/screenshot', ['screen' => $upload()])->assertUnauthorized();
        $this->withToken('device-secret')->post('/api/v1/device/screenshot', ['screen' => $upload()])->assertOk();
        $device->refresh();
        $this->assertNotNull($device->screen_updated_at);
        Storage::disk('local')->assertExists($device->screen_path);

        $this->get('/api/v1/devices/'.$device->id.'/screenshot')->assertUnauthorized();
        $this->actingAs(User::factory()->create())
            ->get('/api/v1/devices/'.$device->id.'/screenshot')
            ->assertOk()
            ->assertHeader('Content-Type', 'image/jpeg');
    }

    public function test_agent_update_targets_the_active_apk(): void
    {
        Storage::fake('local');
        $disk = Storage::disk('local');
        $disk->put('output/app-debug.apk', 'new-agent');
        $disk->put('output/output-metadata.json', json_encode(['elements' => [['outputFile' => 'app-debug.apk', 'versionName' => '0.2.0-dev', 'versionCode' => 8]]]));
        config(['mymdm.apk_path' => $disk->path('missing.apk'), 'mymdm.android_apk_path' => $disk->path('output/app-debug.apk')]);
        $device = Device::query()->create(['name' => 'Tablet', 'agent_version_code' => 7, 'credential_hash' => hash('sha256', 'device-secret')]);
        $device->policy()->create(['revision' => 1]);
        $other = Device::query()->create(['name' => 'Other', 'agent_version_code' => 7, 'credential_hash' => hash('sha256', 'other-secret')]);
        $this->actingAs(User::factory()->create());

        $this->withToken('device-secret')->getJson('/api/v1/device/agent/update?agent_version=0.1.0-dev&version_code=7')->assertOk()->assertJsonPath('available', false);
        $this->postJson('/api/v1/devices/'.$device->id.'/commands', ['type' => 'agent_update'])->assertOk();
        $commandId = $device->commands()->sole()->id;
        $this->assertDatabaseHas('device_commands', ['id' => $commandId, 'type' => 'agent_update', 'status' => 'pending']);
        $this->withToken('other-secret')->getJson('/api/v1/device/agent/update?agent_version=0.1.0-dev&version_code=7&force=1')->assertOk()->assertJsonPath('available', false);
        $this->assertDatabaseMissing('device_commands', ['device_id' => $other->id]);
        $this->withToken('other-secret')->getJson('/api/v1/device/agent/update?agent_version=0.1.0-dev&version_code=7&command_id='.$commandId)->assertOk()->assertJsonPath('available', false);
        $this->withToken('device-secret')->getJson('/api/v1/device/agent/update?agent_version=0.1.0-dev&version_code=7&command_id='.$commandId)->assertOk()->assertJsonPath('available', true);
        $this->withToken('device-secret')->postJson('/api/v1/device/heartbeat')->assertOk()->assertJsonPath('command.payload.version_code', 8);
        $this->withToken('device-secret')->postJson('/api/v1/device/command/status', ['command_id' => $commandId, 'status' => 'dispatched'])->assertOk();
        $this->withToken('device-secret')->postJson('/api/v1/device/heartbeat', ['version_code' => 8])->assertOk()->assertJsonPath('command', null);
        $this->assertDatabaseHas('device_commands', ['id' => $commandId, 'status' => 'applied']);

        $device->update(['agent_version_code' => 7]);
        $pendingCommand = $device->commands()->create([
            'type' => 'agent_update',
            'payload' => ['version' => '0.2.0-dev', 'version_code' => 8],
            'status' => 'pending',
        ]);
        $this->withToken('device-secret')->postJson('/api/v1/device/heartbeat', ['version_code' => 8])->assertOk()->assertJsonPath('command', null);
        $this->assertDatabaseHas('device_commands', ['id' => $pendingCommand->id, 'status' => 'applied']);

        $device->update(['agent_version' => '0.2.0-dev', 'agent_version_code' => 8]);
        $this->postJson('/api/v1/devices/'.$device->id.'/commands', ['type' => 'agent_update'])->assertUnprocessable();
        $this->postJson('/api/v1/devices/'.$device->id.'/commands', ['type' => 'agent_update', 'force' => true])->assertOk();
    }
}
