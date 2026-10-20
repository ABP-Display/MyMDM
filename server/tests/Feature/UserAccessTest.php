<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\DeviceGroup;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class UserAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_upgrade_preserves_existing_administrators_and_renames_the_default_organization(): void
    {
        $legacy = User::factory()->create();
        $migration = require database_path('migrations/2026_10_20_090000_add_user_organization_permissions.php');
        $migration->down();
        Organization::default()->update(['name' => 'Previous name']);
        $migration->up();
        $this->assertTrue($legacy->fresh()->is_admin);
        $this->assertTrue($legacy->fresh()->is_active);
        $this->assertSame('Default', Organization::default()->name);
        $newUser = User::query()->create(['name' => 'New member', 'email' => 'member@example.test', 'password' => 'long-test-password']);
        $this->assertFalse($newUser->is_admin);
    }

    public function test_admin_manages_users_passwords_and_organization_permissions(): void
    {
        $admin = User::factory()->create();
        $organization = Organization::default();
        $this->assertSame('Default', $organization->name);
        $this->actingAs($admin);
        $id = $this->postJson('/api/v1/users', [
            'name' => 'Operator', 'email' => 'OPERATOR@example.test', 'password' => 'a-long-test-password',
            'is_admin' => false, 'is_active' => true,
            'organizations' => [['id' => $organization->id, 'permissions' => ['view', 'update']]],
        ])->assertCreated()->assertJsonPath('email', 'operator@example.test')->assertJsonMissingPath('password')->json('id');
        $user = User::query()->findOrFail($id);
        $this->assertTrue(Hash::check('a-long-test-password', $user->password));
        $this->assertTrue($user->canAccessOrganization($organization->id, 'update'));
        $this->assertFalse($user->canAccessOrganization($organization->id, 'delete'));
        $this->patchJson('/api/v1/users/'.$id, [
            'name' => 'Reader', 'email' => 'operator@example.test', 'is_admin' => false, 'is_active' => true,
            'organizations' => [['id' => $organization->id, 'permissions' => ['view']]],
        ])->assertOk();
        $this->assertTrue(Hash::check('a-long-test-password', $user->refresh()->password));
        $this->assertFalse($user->canAccessOrganization($organization->id, 'update'));
        $this->getJson('/api/v1/users')->assertOk()->assertJsonCount(2)->assertJsonMissingPath('0.password');
        $this->deleteJson('/api/v1/users/'.$id)->assertOk();
        $this->assertDatabaseMissing('organization_user', ['user_id' => $id]);
    }

    public function test_members_cannot_read_other_organizations_or_escalate_privileges(): void
    {
        $allowed = Organization::default();
        $other = Organization::factory()->create();
        $user = User::factory()->create(['is_admin' => false]);
        $user->organizations()->attach($allowed->id, ['permissions' => json_encode(['view'])]);
        $ownDevice = $this->device($allowed, 'Allowed');
        $otherDevice = $this->device($other, 'Private');
        $otherGroup = DeviceGroup::query()->create(['name' => 'Private group', 'organization_id' => $other->id]);
        $this->actingAs($user);
        $this->getJson('/api/v1/organizations')->assertOk()->assertJsonCount(1)->assertJsonPath('0.id', $allowed->id);
        $this->getJson('/api/v1/devices')->assertOk()->assertJsonCount(1)->assertJsonPath('0.id', $ownDevice->id);
        $this->getJson('/api/v1/dashboard')->assertOk()->assertJsonPath('devices', 1);
        $this->getJson('/api/v1/devices/'.$ownDevice->id)->assertOk()->assertJsonCount(1, 'organizations')->assertJsonPath('permissions', ['view']);
        $this->getJson('/api/v1/devices/'.$otherDevice->id)->assertForbidden();
        $this->getJson('/api/v1/devices/'.$otherDevice->id.'/screenshot')->assertForbidden();
        $this->getJson('/api/v1/devices', ['X-Organization-Id' => $other->id])->assertForbidden();
        $this->getJson('/api/v1/devices', ['X-Organization-Id' => 'invalid'])->assertForbidden();
        $this->patchJson('/api/v1/devices/'.$ownDevice->id.'/identity', ['name' => 'Denied'])->assertForbidden();
        $this->postJson('/api/v1/devices/'.$ownDevice->id.'/commands', ['type' => 'set_volume', 'value' => 20])->assertForbidden();
        $this->deleteJson('/api/v1/devices/'.$ownDevice->id, ['confirmation' => 'DELETE'])->assertForbidden();
        $this->deleteJson('/api/v1/device-groups/'.$otherGroup->id)->assertForbidden();
        foreach (['users', 'configurations', 'enrollments'] as $path) {
            $this->getJson('/api/v1/'.$path)->assertForbidden();
            $this->postJson('/api/v1/'.$path, [])->assertForbidden();
        }
        $this->postJson('/api/v1/organizations', ['name' => 'Denied'])->assertForbidden();
        $this->patchJson('/api/v1/users/'.$user->id, ['is_admin' => true])->assertForbidden();
        $this->postJson('/api/v1/agent/use-default')->assertForbidden();
        $this->postJson('/api/v1/kiosk-assets')->assertForbidden();
    }

    public function test_granular_permissions_and_destination_checks_are_enforced(): void
    {
        $organization = Organization::default();
        $other = Organization::factory()->create();
        $user = User::factory()->create(['is_admin' => false]);
        $user->organizations()->attach($organization->id, ['permissions' => json_encode(['view', 'create', 'update', 'commands'])]);
        $device = $this->device($organization, 'Managed');
        $this->actingAs($user);
        $this->postJson('/api/v1/device-groups', ['name' => 'Reception'])->assertCreated();
        $this->patchJson('/api/v1/devices/'.$device->id.'/identity', ['name' => 'Updated'])->assertOk();
        $this->postJson('/api/v1/devices/'.$device->id.'/commands', ['type' => 'set_volume', 'value' => 30])->assertOk();
        $this->patchJson('/api/v1/devices/'.$device->id.'/identity', ['name' => 'Moved', 'organization_id' => $other->id])->assertForbidden();
        $this->postJson('/api/v1/devices/'.$device->id.'/configuration', [])->assertForbidden();
        $this->postJson('/api/v1/devices/'.$device->id.'/factory-reset', ['confirmation' => 'RESET'])->assertForbidden();
        $this->deleteJson('/api/v1/devices/'.$device->id, ['confirmation' => 'DELETE'])->assertForbidden();
        $user->organizations()->updateExistingPivot($organization->id, ['permissions' => json_encode(['view', 'delete'])]);
        $this->deleteJson('/api/v1/devices/'.$device->id, ['confirmation' => 'DELETE'])->assertOk();
    }

    public function test_disabled_accounts_and_accounts_without_memberships_cannot_access_the_fleet(): void
    {
        $user = User::factory()->create(['is_admin' => false]);
        $this->actingAs($user)->getJson('/api/v1/dashboard')->assertForbidden();
        $this->getJson('/api/v1/devices')->assertForbidden();
        $this->getJson('/api/v1/organizations')->assertOk()->assertJsonCount(0);
        $user->update(['is_active' => false]);
        $this->getJson('/api/v1/auth/me')->assertUnauthorized();
        $this->postJson('/api/v1/auth/logout')->assertOk();
        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'password'])->assertUnauthorized();
    }

    public function test_administrator_cannot_delete_disable_or_demote_their_own_account(): void
    {
        $admin = User::factory()->create();
        $this->actingAs($admin);
        $this->deleteJson('/api/v1/users/'.$admin->id)->assertConflict();
        foreach ([['is_admin' => false, 'is_active' => true], ['is_admin' => true, 'is_active' => false]] as $flags) {
            $this->patchJson('/api/v1/users/'.$admin->id, [...$flags, 'name' => $admin->name, 'email' => $admin->email, 'organizations' => []])->assertConflict();
        }
        $this->postJson('/api/v1/users', ['name' => 'Invalid', 'email' => 'invalid@example.test', 'password' => 'short', 'is_admin' => false, 'is_active' => true, 'organizations' => []])->assertUnprocessable();
    }

    private function device(Organization $organization, string $name): Device
    {
        $device = Device::query()->create(['name' => $name, 'organization_id' => $organization->id, 'credential_hash' => hash('sha256', $name)]);
        $device->policy()->create(['revision' => 1]);

        return $device;
    }
}
