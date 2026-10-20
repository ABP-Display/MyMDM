<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MyMdmApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_create_enrollment_and_device_can_enroll(): void
    {
        config(['mymdm.apk_path' => sys_get_temp_dir().'/mymdm-agent-test.apk']);
        file_put_contents(config('mymdm.apk_path'), 'fake-apk');

        $user = User::query()->create([
            'name' => 'Admin',
            'is_admin' => true,
            'email' => 'admin@example.org',
            'password' => Hash::make('secret'),
        ]);

        $login = $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'secret',
        ]);
        $login->assertOk();

        $enrollment = $this->postJson('/api/v1/enrollments', [
            'wifi_ssid' => 'Office',
            'wifi_security_type' => 'WPA',
            'wifi_password' => 'password123',
        ]);
        $enrollment->assertCreated();

        $qr = json_decode($enrollment->json('qr_text'), true, 512, JSON_THROW_ON_ERROR);
        $token = $qr['android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE']['enrollment_token'];

        $device = $this->postJson('/api/v1/device/enroll', [
            'enrollment_token' => $token,
            'manufacturer' => 'Google',
            'model' => 'Pixel Tablet',
            'android_version' => '15',
            'sdk_version' => 35,
            'agent_version' => '0.1.0-dev',
        ]);
        $device->assertCreated()
            ->assertJsonPath('policy.revision', 1)
            ->assertJsonPath('policy.kiosk_enabled', false);

        $token = $device->json('device_token');
        $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/device/heartbeat', ['policy_revision' => 0])
            ->assertOk()
            ->assertJsonPath('policy_changed', true);

        $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/device/heartbeat', ['policy_revision' => 1])
            ->assertOk()
            ->assertJsonPath('policy_changed', false);
        $this->assertDatabaseHas('device_policy_status', [
            'device_id' => $device->json('device_id'),
            'revision' => 1,
            'status' => 'applied',
        ]);
    }

    public function test_admin_can_upload_agent_release_used_by_update_endpoint(): void
    {
        $user = User::query()->create([
            'name' => 'Admin',
            'is_admin' => true,
            'email' => 'admin@example.org',
            'password' => Hash::make('secret'),
        ]);

        $this->actingAs($user)
            ->post('/api/v1/agent/releases', [
                'version' => '0.1.1',
                'version_code' => 2,
                'apk' => UploadedFile::fake()->createWithContent('mymdm-agent.apk', 'apk-v2'),
            ])
            ->assertCreated()
            ->assertJsonPath('version_code', 2)
            ->assertJsonPath('active', true);

        $deviceToken = $this->enrollDevice();
        $device = Device::query()->sole();

        $this->withHeader('Authorization', "Bearer {$deviceToken}")
            ->getJson('/api/v1/device/agent/update?agent_version=0.1.0-dev&version_code=1')
            ->assertOk()
            ->assertExactJson(['available' => false]);

        $this->actingAs($user)
            ->postJson('/api/v1/devices/'.$device->id.'/commands', ['type' => 'agent_update'])
            ->assertOk();
        $this->assertSame(hash('sha256', 'apk-v2'), $device->commands()->sole()->payload['apk_sha256']);

        $this->withToken($deviceToken)
            ->getJson('/api/v1/device/agent/update?agent_version=0.1.0-dev&version_code=1')
            ->assertOk()
            ->assertJsonPath('available', true)
            ->assertJsonPath('version', '0.1.1')
            ->assertJsonPath('version_code', 2)
            ->assertJsonPath('apk_sha256', hash('sha256', 'apk-v2'));

        Device::query()->create([
            'name' => 'Appareil non ciblé',
            'agent_version_code' => 1,
            'credential_hash' => hash('sha256', 'other-device-secret'),
        ]);
        $this->withToken('other-device-secret')
            ->getJson('/api/v1/device/agent/update?agent_version=0.1.0-dev&version_code=1&force=1')
            ->assertOk()
            ->assertExactJson(['available' => false]);
    }

    private function enrollDevice(): string
    {
        config(['mymdm.apk_path' => sys_get_temp_dir().'/mymdm-agent-test.apk']);
        file_put_contents(config('mymdm.apk_path'), 'fake-apk');

        $enrollment = $this->actingAs(User::query()->first())
            ->postJson('/api/v1/enrollments');
        $qr = json_decode($enrollment->json('qr_text'), true, 512, JSON_THROW_ON_ERROR);
        $token = $qr['android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE']['enrollment_token'];

        return $this->postJson('/api/v1/device/enroll', [
            'enrollment_token' => $token,
            'manufacturer' => 'Google',
            'model' => 'Pixel Tablet',
            'android_version' => '15',
            'sdk_version' => 35,
            'agent_version' => '0.1.0-dev',
        ])->json('device_token');
    }
}
