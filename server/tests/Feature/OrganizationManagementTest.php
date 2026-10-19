<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\DeviceGroup;
use App\Models\DevicePolicyStatus;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OrganizationManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_create_and_select_an_organization(): void
    {
        $this->actingAs(User::factory()->create());
        $default = Organization::query()->where('slug', 'default')->firstOrFail();
        $secondId = $this->postJson('/api/v1/organizations', ['name' => 'Agence Lyon'])
            ->assertCreated()
            ->assertJsonPath('slug', 'agence-lyon')
            ->json('id');

        Device::query()->create(['name' => 'Paris', 'organization_id' => $default->id, 'credential_hash' => hash('sha256', 'paris')]);
        Device::query()->create(['name' => 'Lyon', 'organization_id' => $secondId, 'credential_hash' => hash('sha256', 'lyon')]);

        $this->withHeader('X-Organization-Id', $secondId)
            ->getJson('/api/v1/devices')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.name', 'Lyon')
            ->assertJsonPath('0.organization.id', $secondId);

        $this->withHeader('X-Organization-Id', $secondId)
            ->getJson('/api/v1/dashboard')
            ->assertOk()
            ->assertJsonPath('devices', 1);
    }

    public function test_device_can_be_assigned_to_an_organization_and_its_group(): void
    {
        $this->actingAs(User::factory()->create());
        $target = Organization::factory()->create();
        $group = DeviceGroup::query()->create(['organization_id' => $target->id, 'name' => 'Atelier']);
        $device = Device::query()->create(['name' => 'Sans affectation', 'credential_hash' => hash('sha256', 'device')]);
        $device->policy()->create(['revision' => 1]);

        $this->patchJson('/api/v1/devices/'.$device->id.'/identity', [
            'name' => 'Poste atelier',
            'organization_id' => $target->id,
            'group_id' => $group->id,
        ])->assertOk()
            ->assertJsonPath('device.organization.id', $target->id)
            ->assertJsonPath('device.group.id', $group->id);

        $this->assertDatabaseHas('devices', [
            'id' => $device->id,
            'organization_id' => $target->id,
            'group_id' => $group->id,
        ]);
    }

    public function test_bulk_command_endpoint_is_not_available(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $firstOrganization = Organization::factory()->create();
        $secondOrganization = Organization::factory()->create();
        $first = Device::query()->create(['name' => 'Premier', 'organization_id' => $firstOrganization->id, 'credential_hash' => hash('sha256', 'first')]);
        $second = Device::query()->create(['name' => 'Second', 'organization_id' => $secondOrganization->id, 'credential_hash' => hash('sha256', 'second')]);
        $unselected = Device::query()->create(['name' => 'Non sélectionné', 'organization_id' => $firstOrganization->id, 'credential_hash' => hash('sha256', 'unselected')]);

        $this->withHeader('X-Organization-Id', $firstOrganization->id)
            ->postJson('/api/v1/devices/bulk-commands', [
                'device_ids' => [$first->id, $second->id],
                'type' => 'set_volume',
                'value' => 35,
            ])->assertNotFound();

        $this->assertDatabaseMissing('device_commands', ['device_id' => $first->id]);
        $this->assertDatabaseMissing('device_commands', ['device_id' => $second->id]);
        $this->assertDatabaseMissing('device_commands', ['device_id' => $unselected->id]);
    }

    public function test_admin_can_update_and_delete_an_empty_organization(): void
    {
        $this->actingAs(User::factory()->create());
        $organization = Organization::factory()->create();

        $this->patchJson('/api/v1/organizations/'.$organization->id, [
            'name' => 'Site Bordeaux',
            'description' => 'Parc de Bordeaux',
            'non_sync_threshold_hours' => 36,
        ])->assertOk()
            ->assertJsonPath('name', 'Site Bordeaux')
            ->assertJsonPath('non_sync_threshold_hours', 36);

        $this->deleteJson('/api/v1/organizations/'.$organization->id)->assertOk();
        $this->assertDatabaseMissing('organizations', ['id' => $organization->id]);
        $this->deleteJson('/api/v1/organizations/'.Organization::default()->id)->assertConflict();
    }

    public function test_device_sync_state_combines_policy_revision_and_organization_deadline(): void
    {
        $this->actingAs(User::factory()->create());
        $organization = Organization::factory()->create(['non_sync_threshold_hours' => 6]);
        $device = Device::query()->create([
            'name' => 'Accueil',
            'organization_id' => $organization->id,
            'credential_hash' => hash('sha256', 'sync-device'),
            'last_seen_at' => now(),
        ]);
        $device->policy()->create(['revision' => 2]);
        DevicePolicyStatus::query()->create(['device_id' => $device->id, 'revision' => 1, 'status' => 'applied', 'applied_at' => now()]);

        $endpoint = $this->withHeader('X-Organization-Id', $organization->id);
        $endpoint->getJson('/api/v1/devices')->assertJsonPath('0.sync_state', 'pending');

        DevicePolicyStatus::query()->where('device_id', $device->id)->update(['revision' => 2]);
        $endpoint->getJson('/api/v1/devices')->assertJsonPath('0.sync_state', 'synchronized');

        $device->update(['last_seen_at' => now()->subHours(7)]);
        $endpoint->getJson('/api/v1/devices')->assertJsonPath('0.sync_state', 'not_synchronized');
    }
    public function test_device_receives_its_configured_organization_name_and_later_changes(): void
    {
        $organization = Organization::factory()->create(['name' => 'Atelier & Équipe']);
        $device = Device::query()->create([
            'name' => 'Accueil', 'organization_id' => $organization->id,
            'credential_hash' => hash('sha256', 'organization-device'),
        ]);
        $device->policy()->create(['revision' => 1]);
        $this->withHeader('Authorization', 'Bearer organization-device')
            ->getJson('/api/v1/device/policy')->assertOk()->assertJsonPath('organization_name', 'Atelier & Équipe');
        $this->postJson('/api/v1/device/heartbeat', ['policy_revision' => 1])
            ->assertOk()->assertJsonPath('organization_name', 'Atelier & Équipe');

        $this->actingAs(User::factory()->create())->patchJson('/api/v1/organizations/'.$organization->id, [
            'name' => 'Nouvelle organisation', 'non_sync_threshold_hours' => 24,
        ])->assertOk();
        $this->getJson('/api/v1/device/policy')->assertOk()->assertJsonPath('organization_name', 'Nouvelle organisation');
        $this->postJson('/api/v1/device/heartbeat', ['policy_revision' => 1])
            ->assertOk()->assertJsonPath('organization_name', 'Nouvelle organisation');
    }

    public function test_default_organization_uses_the_instance_configuration(): void
    {
        Organization::query()->where('slug', 'default')->delete();
        config(['mymdm.organization_name' => 'Organisation configurée']);
        $this->assertSame('Organisation configurée', Organization::default()->name);
    }

    public function test_renamed_initial_migration_preserves_existing_tables_and_rollback(): void
    {
        $user = User::factory()->create();
        \Illuminate\Support\Facades\DB::table('migrations')
            ->where('migration', '2026_09_04_000000_create_mymdm_tables')
            ->update(['migration' => '2026_09_04_000000_create_previous_tables']);
        $this->artisan('migrate', ['--force' => true, '--no-interaction' => true])->assertSuccessful();
        $this->assertDatabaseHas('users', ['id' => $user->id]);
        $this->artisan('migrate:rollback', ['--step' => 1, '--force' => true, '--no-interaction' => true])->assertSuccessful();
        $this->assertDatabaseHas('users', ['id' => $user->id]);
    }

}
