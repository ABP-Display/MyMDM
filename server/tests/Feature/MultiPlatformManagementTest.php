<?php

namespace Tests\Feature;

use App\Models\AgentRelease;
use App\Models\Configuration;
use App\Models\Device;
use App\Models\KioskAsset;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class MultiPlatformManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_android_devices_are_listed_and_counted_and_old_devices_cannot_be_managed(): void
    {
        $this->actingAs(User::factory()->create());
        Device::query()->create(['name' => 'Android', 'platform' => 'android', 'credential_hash' => hash('sha256', 'android')]);
        foreach (['windows', 'linux', 'macos', 'ios'] as $platform) {
            $device = Device::query()->create(['name' => $platform, 'platform' => $platform, 'credential_hash' => hash('sha256', $platform)]);
            $this->getJson('/api/v1/devices/'.$device->id)->assertNotFound();
            $this->patchJson('/api/v1/devices/'.$device->id.'/identity', ['name' => 'Changed'])->assertNotFound();
            $this->deleteJson('/api/v1/devices/'.$device->id)->assertNotFound();
            $this->assertDatabaseHas('devices', ['id' => $device->id, 'name' => $platform, 'deleted_at' => null]);
        }
        $this->getJson('/api/v1/devices')->assertOk()->assertJsonCount(1)->assertJsonPath('0.platform', 'android');
        $this->getJson('/api/v1/dashboard')->assertOk()
            ->assertJsonPath('devices', 1)->assertJsonPath('platforms.android.count', 1)
            ->assertJsonPath('platforms.android.percentage', 100)->assertJsonMissingPath('platforms.windows');
    }

    public function test_unsupported_platforms_cannot_create_configurations_or_upload_agents_or_assets(): void
    {
        $this->actingAs(User::factory()->create());
        foreach (['windows', 'linux', 'macos', 'ios'] as $platform) {
            $this->postJson('/api/v1/configurations', ['name' => 'Unavailable', 'platform' => $platform])
                ->assertUnprocessable()->assertJsonValidationErrors('platform');
            $this->postJson('/api/v1/agent/releases', [
                'platform' => $platform, 'version' => '1.0', 'version_code' => 1,
                'artifact' => UploadedFile::fake()->createWithContent('agent.apk', 'fixture'),
            ])->assertUnprocessable()->assertJsonValidationErrors('platform');
            $this->postJson('/api/v1/kiosk-assets', [
                'platform' => $platform, 'type' => $platform.'_app', 'name' => 'Unavailable',
                'file' => UploadedFile::fake()->createWithContent('app.apk', 'fixture'),
            ])->assertUnprocessable()->assertJsonValidationErrors(['platform', 'type']);
            $this->getJson('/api/v1/agent/source?platform='.$platform)->assertUnprocessable();
            $this->getJson('/api/v1/kiosk-assets?platform='.$platform)->assertUnprocessable();
        }
        $this->assertDatabaseCount('configurations', 0);
        $this->assertDatabaseCount('agent_releases', 0);
        $this->assertDatabaseCount('kiosk_assets', 0);
    }

    public function test_old_configuration_release_and_library_ids_are_inaccessible_without_deleting_data(): void
    {
        $this->actingAs(User::factory()->create());
        $configuration = Configuration::query()->create(['name' => 'Old Windows', 'platform' => 'windows', 'policy' => []]);
        $release = AgentRelease::query()->create(['platform' => 'windows', 'version' => '1.0', 'version_code' => 1, 'apk_sha256' => str_repeat('a', 64), 'apk_size' => 1, 'download_url' => '', 'active' => true]);
        $asset = KioskAsset::factory()->create(['platform' => 'windows', 'type' => 'windows_app']);
        $this->getJson('/api/v1/configurations')->assertOk()->assertJsonCount(0);
        $this->patchJson('/api/v1/configurations/'.$configuration->id, ['name' => 'Changed'])->assertNotFound();
        $this->getJson('/api/v1/configurations/'.$configuration->id.'/qr')->assertNotFound();
        $this->getJson('/api/v1/agent/releases')->assertOk()->assertJsonCount(0);
        $this->postJson('/api/v1/agent/releases/'.$release->id.'/activate')->assertNotFound();
        $this->get('/api/v1/agent/releases/'.$release->id.'/download')->assertNotFound();
        $this->getJson('/api/v1/kiosk-assets')->assertOk()->assertJsonCount(0);
        $this->deleteJson('/api/v1/kiosk-assets/'.$asset->id)->assertNotFound();
        $this->assertDatabaseHas('configurations', ['id' => $configuration->id, 'deleted_at' => null]);
        $this->assertDatabaseHas('agent_releases', ['id' => $release->id]);
        $this->assertDatabaseHas('kiosk_assets', ['id' => $asset->id, 'deleted_at' => null]);
    }

    public function test_removed_desktop_protocols_and_downloads_return_not_found(): void
    {
        $this->actingAs(User::factory()->create());
        foreach (['/api/v1/agent/enroll', '/api/v1/agent/heartbeat', '/api/v1/agent/inventory', '/api/v1/osquery/enroll', '/api/v1/osquery/config', '/api/v1/osquery/distributed/read', '/api/v1/rmm/enrollments', '/api/v1/rmm/bootstrap/windows/artifact'] as $url) {
            $this->postJson($url, [])->assertNotFound();
        }
        foreach (['/api/v1/agent/commands', '/api/v1/rmm/enrollments', '/api/v1/osquery/enrollments', '/api/v1/rmm/download', '/api/v1/rmm/download/linux/amd64', '/api/v1/rmm/installer/windows/install', '/api/v1/rmm/bootstrap/windows/install-script'] as $url) {
            $this->getJson($url)->assertNotFound();
        }
        foreach (['windows', 'macos', 'linux'] as $platform) {
            $this->get('/guides/'.$platform)->assertNotFound();
        }
    }

    public function test_android_and_ios_guide_pages_remain_accessible(): void
    {
        $this->actingAs(User::factory()->create());
        $this->get('/guides/android')->assertOk()->assertInertia(fn ($page) => $page->component('PlatformGuide'));
        $this->get('/guides/ios')->assertOk()->assertInertia(fn ($page) => $page->component('PlatformGuide'));
        $this->get('/enrollments?platform=ios')->assertOk()->assertInertia(fn ($page) => $page->component('Enrollments'));
    }
}
