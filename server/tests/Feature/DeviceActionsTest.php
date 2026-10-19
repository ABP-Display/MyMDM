<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeviceActionsTest extends TestCase
{
    use RefreshDatabase;

    private function device(): Device
    {
        $device = Device::query()->create(['name' => 'Tablet', 'credential_hash' => hash('sha256', 'device-secret')]);
        $device->policy()->create(['revision' => 1]);

        return $device;
    }

    public function test_delete_requires_confirmation_and_revokes_device_access(): void
    {
        $device = $this->device();
        $url = '/api/v1/devices/'.$device->id;
        $this->deleteJson($url, ['confirmation' => 'SUPPRIMER'])->assertUnauthorized();
        $this->actingAs(User::factory()->create());
        $this->deleteJson($url)->assertUnprocessable();
        $this->deleteJson($url, ['confirmation' => 'SUPPRIMER'])->assertOk();
        $this->assertSoftDeleted('devices', ['id' => $device->id]);
        $this->getJson($url)->assertNotFound();
        $this->getJson('/api/v1/devices')->assertExactJson([]);
        $this->withToken('device-secret')->postJson('/api/v1/device/heartbeat')->assertUnauthorized();
        $this->assertDatabaseHas('audit_logs', ['device_id' => $device->id, 'action' => 'DEVICE_DELETED']);
    }

    public function test_offline_device_can_be_deleted_with_a_pending_reset(): void
    {
        $device = $this->device();
        $url = '/api/v1/devices/'.$device->id;
        $this->actingAs(User::factory()->create());
        $this->postJson($url.'/factory-reset', ['confirmation' => 'REINITIALISER'])->assertOk();
        $resetId = $device->refresh()->reset_id;
        $this->deleteJson($url, ['confirmation' => 'SUPPRIMER'])->assertOk();
        $this->assertSoftDeleted('devices', ['id' => $device->id]);
        $this->assertDatabaseHas('devices', ['id' => $device->id, 'reset_id' => null, 'reset_status' => null]);
        $this->withToken('device-secret')->postJson('/api/v1/device/heartbeat')->assertUnauthorized();
        $this->postJson('/api/v1/device/reset/status', ['reset_id' => $resetId, 'status' => 'dispatched'])->assertUnauthorized();
        $this->assertDatabaseHas('audit_logs', ['device_id' => $device->id, 'action' => 'DEVICE_RESET_CANCELLED']);
    }

    public function test_reset_is_confirmed_delivered_once_and_failures_are_visible(): void
    {
        $device = $this->device();
        $url = '/api/v1/devices/'.$device->id;
        $this->postJson($url.'/factory-reset', ['confirmation' => 'REINITIALISER'])->assertUnauthorized();
        $this->actingAs(User::factory()->create());
        $this->postJson($url.'/factory-reset')->assertUnprocessable();
        $this->postJson($url.'/factory-reset', ['confirmation' => 'REINITIALISER'])->assertOk()->assertJsonPath('device.reset_status', 'pending');
        $id = $device->refresh()->reset_id;
        $this->postJson('/api/v1/device/reset/status', ['reset_id' => $id, 'status' => 'dispatched'])->assertUnauthorized();
        Device::query()->create(['name' => 'Other tablet', 'credential_hash' => hash('sha256', 'other-secret')]);
        $this->withToken('other-secret')->postJson('/api/v1/device/reset/status', ['reset_id' => $id, 'status' => 'dispatched'])->assertConflict();

        $this->postJson($url.'/factory-reset', ['confirmation' => 'REINITIALISER'])->assertOk();
        $this->assertSame($id, $device->refresh()->reset_id);
        $this->withToken('device-secret')->postJson('/api/v1/device/heartbeat')->assertOk()->assertJsonPath('factory_reset', $id);
        $this->postJson('/api/v1/device/reset/status', ['reset_id' => fake()->uuid(), 'status' => 'dispatched'])->assertConflict();
        $this->postJson('/api/v1/device/reset/status', ['reset_id' => $id, 'status' => 'dispatched'])->assertOk();
        $this->postJson('/api/v1/device/reset/status', ['reset_id' => $id, 'status' => 'dispatched'])->assertConflict();
        $this->postJson('/api/v1/device/heartbeat')->assertOk()->assertJsonPath('factory_reset', null);
        $this->deleteJson($url.'/factory-reset')->assertConflict();
        $this->postJson('/api/v1/device/reset/status', ['reset_id' => $id, 'status' => 'failed', 'error' => 'Not device owner'])->assertOk();
        $this->getJson($url)->assertOk()->assertJsonPath('device.reset_error', 'Not device owner');
        $this->postJson($url.'/factory-reset', ['confirmation' => 'REINITIALISER'])->assertOk();
        $this->assertNotSame($id, $device->refresh()->reset_id);
        $this->deleteJson($url.'/factory-reset')->assertOk();
        $this->postJson('/api/v1/device/heartbeat')->assertOk()->assertJsonPath('factory_reset', null);
        $device->update(['revoked_at' => now()]);
        $this->postJson($url.'/factory-reset', ['confirmation' => 'REINITIALISER'])->assertConflict();
    }
}
