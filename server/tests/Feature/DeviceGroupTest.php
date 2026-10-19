<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\DeviceGroup;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeviceGroupTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_admin_can_manage_groups_and_assign_a_device(): void
    {
        $device = Device::query()->create(['name' => 'Tablette accueil', 'credential_hash' => hash('sha256', 'device-secret')]);
        $device->policy()->create(['revision' => 1]);
        $this->actingAs(User::factory()->create());

        $groupId = $this->postJson('/api/v1/device-groups', ['name' => 'Accueil'])
            ->assertCreated()
            ->json('id');

        $this->patchJson('/api/v1/devices/'.$device->id.'/identity', ['name' => 'Tablette formation', 'group_id' => $groupId])
            ->assertOk()
            ->assertJsonPath('device.name', 'Tablette formation')
            ->assertJsonPath('device.group.name', 'Accueil');

        $this->getJson('/api/v1/devices')
            ->assertOk()
            ->assertJsonPath('0.group.id', $groupId);
        $this->getJson('/api/v1/device-groups')
            ->assertOk()
            ->assertJsonPath('0.devices_count', 1);

        $this->patchJson('/api/v1/device-groups/'.$groupId, ['name' => 'Formation'])
            ->assertOk()
            ->assertJsonPath('name', 'Formation');
        $this->deleteJson('/api/v1/device-groups/'.$groupId)->assertOk();

        $this->assertNull($device->refresh()->group_id);
        $this->assertDatabaseMissing('device_groups', ['id' => $groupId]);
    }

    public function test_group_management_requires_authentication_and_valid_data(): void
    {
        $group = DeviceGroup::factory()->create();

        $this->getJson('/api/v1/device-groups')->assertUnauthorized();
        $this->actingAs(User::factory()->create());
        $this->postJson('/api/v1/device-groups', ['name' => ''])->assertUnprocessable();
        $this->postJson('/api/v1/device-groups', ['name' => $group->name])->assertUnprocessable();
        $this->patchJson('/api/v1/devices/'.fake()->uuid().'/identity', ['name' => 'Test', 'group_id' => fake()->uuid()])->assertNotFound();
    }
}
