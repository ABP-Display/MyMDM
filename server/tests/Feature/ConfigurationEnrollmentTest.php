<?php

namespace Tests\Feature;

use App\Models\AgentRelease;
use App\Models\Device;
use App\Models\Enrollment;
use App\Models\KioskAsset;
use App\Models\User;
use App\Services\AgentReleaseManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ConfigurationEnrollmentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.key' => 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=']);
        Storage::fake('local');
        Storage::disk('local')->put('source.apk', 'agent-version-one');
        config(['mymdm.apk_path' => Storage::disk('local')->path('source.apk'), 'mymdm.android_apk_path' => Storage::disk('local')->path('source.apk'), 'mymdm.base_url' => 'https://mdm.example.org']);
        $this->actingAs(User::factory()->create());
    }

    private function data(array $overrides = []): array
    {
        return array_replace([
            'name' => 'Accueil', 'kiosk_enabled' => false, 'url' => 'https://example.org',
            'allowed_origins' => ['https://example.org'], 'orientation' => 'landscape',
            'keep_screen_on' => true, 'sync_interval_minutes' => 60, 'wifi_ssid' => 'Office', 'wifi_security_type' => 'WPA',
            'wifi_password' => 'test-password', 'wifi_hidden' => true,
        ], $overrides);
    }

    private function createConfiguration(array $overrides = []): string
    {
        return $this->postJson('/api/v1/configurations', $this->data($overrides))->assertCreated()->json('id');
    }

    private function qr(string $id): array
    {
        return $this->getJson("/api/v1/configurations/{$id}/qr")->assertOk()->json();
    }

    public function test_empty_allowed_origins_means_no_restriction(): void
    {
        $this->postJson('/api/v1/configurations', $this->data(['allowed_origins' => []]))
            ->assertCreated()
            ->assertJsonPath('policy.allowed_origins', []);
    }

    private function token(array $qr): string
    {
        return json_decode($qr['qr_text'], true)['android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE']['enrollment_token'];
    }

    public function test_qr_is_permanent_reusable_and_applies_the_configuration(): void
    {
        $id = $this->createConfiguration(['kiosk_enabled' => true, 'admin_pin' => '123456']);
        $qr = $this->qr($id);
        $this->assertNull($qr['expires_at']);
        $this->travel(10)->years();
        $first = $this->postJson('/api/v1/device/enroll', ['enrollment_token' => $this->token($qr), 'manufacturer' => 'Samsung']);
        $first->assertCreated()->assertJsonPath('policy.kiosk_enabled', true)
            ->assertJsonPath('policy.url', 'https://example.org')
            ->assertJsonPath('policy.orientation', 'landscape')
            ->assertJsonPath('policy.sync_interval_minutes', 60)
            ->assertJsonPath('policy.admin_pin_enabled', true);
        $second = $this->postJson('/api/v1/device/enroll', ['enrollment_token' => $this->token($qr), 'manufacturer' => 'Lenovo']);
        $second->assertCreated();
        $this->assertNotSame($first->json('device_token'), $second->json('device_token'));
        $this->assertDatabaseCount('devices', 2);
        $this->assertDatabaseHas('devices', ['id' => $first->json('device_id'), 'configuration_id' => $id]);
        $this->assertDatabaseHas('devices', ['id' => $second->json('device_id'), 'configuration_id' => $id]);
        $this->assertDatabaseHas('enrollments', ['id' => $qr['id'], 'status' => 'active', 'use_count' => 2]);
        $this->assertSame($qr['qr_text'], $this->qr($id)['qr_text']);
        $encoded = $first->json('policy.admin_pin_hash');
        [$algorithm, $iterations, $salt, $hash] = explode(':', $encoded);
        $this->assertSame('pbkdf2-sha256', $algorithm);
        $this->assertSame(base64_decode($hash), hash_pbkdf2('sha256', '123456', base64_decode($salt), (int) $iterations, 32, true));
    }

    public function test_launcher_configuration_snapshots_selected_apps_and_files(): void
    {
        $application = KioskAsset::factory()->create(['name' => 'Navigateur', 'package_name' => 'com.example.browser']);
        $document = KioskAsset::factory()->file()->create(['name' => 'Guide']);
        $background = KioskAsset::factory()->image()->create(['name' => 'Fond Organisation']);
        $id = $this->createConfiguration([
            'kiosk_enabled' => true,
            'kiosk_type' => 'launcher',
            'admin_pin' => '123456',
            'library_item_ids' => [$application->id, $document->id],
            'launcher_background_color' => '#123abc',
            'launcher_background_image_id' => $background->id,
            'launcher_auto_grant_permissions' => false,
            'allowed_apps' => [],
            'url' => '',
        ]);

        $configuration = $this->getJson('/api/v1/configurations')->assertOk()->json('0');
        $this->assertSame([$application->id, $document->id], array_column($configuration['policy']['library_items'], 'id'));
        $this->assertSame(['com.example.browser'], $configuration['policy']['allowed_apps']);
        $this->assertSame('#123ABC', $configuration['policy']['launcher_background_color']);
        $this->assertSame($background->id, $configuration['policy']['launcher_background']['id']);
        $this->assertFalse($configuration['policy']['launcher_auto_grant_permissions']);

        $application->delete();
        $enrolled = $this->postJson('/api/v1/device/enroll', ['enrollment_token' => $this->token($this->qr($id))])
            ->assertCreated()
            ->assertJsonPath('policy.kiosk_type', 'launcher')
            ->assertJsonPath('policy.launcher_background_color', '#123ABC')
            ->assertJsonPath('policy.launcher_background.id', $background->id)
            ->assertJsonPath('policy.launcher_auto_grant_permissions', false)
            ->assertJsonCount(2, 'policy.library_items');
        $this->assertSame($application->sha256, $enrolled->json('policy.library_items.0.sha256'));

        $replacement = KioskAsset::factory()->image()->create(['name' => 'Nouveau fond']);
        $this->deleteJson('/api/v1/devices/'.$enrolled->json('device_id').'/configuration')
            ->assertOk()
            ->assertJsonPath('device.configuration_id', null);
        $this->patchJson('/api/v1/devices/'.$enrolled->json('device_id'), [
            'kiosk_enabled' => true,
            'kiosk_type' => 'launcher',
            'url' => '',
            'allowed_origins' => [],
            'keep_screen_on' => true,
            'launcher_background_color' => '#445566',
            'launcher_background_image_id' => $replacement->id,
            'launcher_auto_grant_permissions' => true,
        ])->assertOk()
            ->assertJsonPath('policy.launcher_background_color', '#445566')
            ->assertJsonPath('policy.launcher_background.id', $replacement->id)
            ->assertJsonPath('policy.launcher_auto_grant_permissions', true);

        $this->postJson('/api/v1/configurations', $this->data([
            'kiosk_type' => 'launcher',
            'allowed_apps' => ['com.example.browser'],
            'url' => '',
            'launcher_background_image_id' => $document->id,
        ]))->assertUnprocessable()->assertJsonValidationErrors('launcher_background_image_id');
    }

    public function test_android_configuration_rejects_a_library_with_only_ios_or_windows_apps(): void
    {
        $ios = KioskAsset::factory()->create(['type' => 'ios_app', 'package_name' => 'com.example.ios', 'original_name' => 'application.ipa']);
        $windows = KioskAsset::factory()->create(['type' => 'windows_app', 'package_name' => 'Example.Windows', 'original_name' => 'application.msix']);

        $this->postJson('/api/v1/configurations', $this->data([
            'kiosk_enabled' => true,
            'kiosk_type' => 'launcher',
            'admin_pin' => '123456',
            'library_item_ids' => [$ios->id, $windows->id],
            'allowed_apps' => [],
            'url' => '',
        ]))->assertUnprocessable()->assertJsonValidationErrors('library_item_ids');
    }

    public function test_reenrollment_reuses_the_device_identified_by_its_serial_number(): void
    {
        $firstConfiguration = $this->createConfiguration();
        $secondConfiguration = $this->createConfiguration(['name' => 'Nouvelle politique', 'url' => 'https://new.example.org']);

        $first = $this->postJson('/api/v1/device/enroll', [
            'enrollment_token' => $this->token($this->qr($firstConfiguration)),
            'serial_number' => ' r52t123abc ',
            'manufacturer' => 'Samsung',
            'model' => 'SM-X210',
            'agent_version' => '0.2.3-dev',
            'version_code' => 11,
        ])->assertCreated()->assertJsonPath('reused', false);

        $oldToken = $first->json('device_token');
        $deviceId = $first->json('device_id');
        $second = $this->postJson('/api/v1/device/enroll', [
            'enrollment_token' => $this->token($this->qr($secondConfiguration)),
            'serial_number' => 'R52T123ABC',
            'manufacturer' => 'Samsung Electronics',
            'model' => 'SM-X210',
            'android_version' => '15',
            'agent_version' => '0.2.4-dev',
            'version_code' => 12,
        ])->assertCreated()
            ->assertJsonPath('device_id', $deviceId)
            ->assertJsonPath('reused', true)
            ->assertJsonPath('policy.url', 'https://new.example.org');

        $this->assertDatabaseCount('devices', 1);
        $this->assertDatabaseHas('devices', [
            'id' => $deviceId,
            'serial_number' => 'R52T123ABC',
            'manufacturer' => 'Samsung Electronics',
            'android_version' => '15',
            'agent_version_code' => 12,
        ]);
        $this->assertDatabaseHas('audit_logs', ['device_id' => $deviceId, 'action' => 'DEVICE_REENROLLED']);
        $this->withToken($oldToken)->getJson('/api/v1/device/policy')->assertUnauthorized();
        $this->withToken($second->json('device_token'))->getJson('/api/v1/device/policy')
            ->assertOk()->assertJsonPath('url', 'https://new.example.org');
    }

    public function test_edits_do_not_change_existing_qr_but_enrollment_uses_the_live_configuration(): void
    {
        $id = $this->createConfiguration();
        $original = $this->qr($id);
        $this->patchJson("/api/v1/configurations/{$id}", $this->data(['url' => 'https://new.example.org', 'wifi_password' => 'new-password']))
            ->assertOk()->assertJsonPath('has_pending_changes', true);
        Storage::disk('local')->put('source.apk', 'agent-version-two');
        config(['mymdm.base_url' => 'https://changed.example.org']);
        $this->assertSame($original['qr_text'], $this->qr($id)['qr_text']);
        $this->postJson('/api/v1/enrollments', ['configuration_id' => $id])->assertOk()->assertJsonPath('qr_text', $original['qr_text']);
        $payload = json_decode($original['qr_text'], true);
        $download = $this->get(parse_url($payload['android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION'], PHP_URL_PATH));
        $download->assertOk();
        $this->assertSame('agent-version-one', file_get_contents($download->baseResponse->getFile()->getPathname()));
        $this->assertSame(rtrim(strtr(base64_encode(hash('sha256', 'agent-version-one', true)), '+/', '-_'), '='), $payload['android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM']);
        $this->postJson('/api/v1/device/enroll', ['enrollment_token' => $this->token($original)])
            ->assertCreated()->assertJsonPath('policy.url', 'https://new.example.org');
    }

    public function test_configuration_changes_update_linked_devices_and_qr_regeneration_replaces_the_token(): void
    {
        $id = $this->createConfiguration();
        $old = $this->qr($id);
        $deviceId = $this->postJson('/api/v1/device/enroll', ['enrollment_token' => $this->token($old)])->assertCreated()->json('device_id');
        $this->patchJson("/api/v1/configurations/{$id}", $this->data(['url' => 'https://new.example.org']))->assertOk();
        $this->assertSame('https://new.example.org', Device::query()->findOrFail($deviceId)->policy->url);
        $this->assertSame(2, Device::query()->findOrFail($deviceId)->policy->revision);
        Storage::disk('local')->put('source.apk', 'agent-version-two');
        $this->postJson("/api/v1/configurations/{$id}/qr/regenerate")->assertOk()->assertJsonPath('has_pending_changes', false);
        $new = $this->qr($id);
        $this->assertNotSame($old['qr_text'], $new['qr_text']);
        $this->assertDatabaseHas('enrollments', ['id' => $old['id'], 'status' => 'revoked']);
        $this->postJson('/api/v1/device/enroll', ['enrollment_token' => $this->token($old)])->assertUnauthorized();
        $this->postJson('/api/v1/device/enroll', ['enrollment_token' => $this->token($new)])
            ->assertCreated()->assertJsonPath('policy.url', 'https://new.example.org');
        $this->assertSame('https://new.example.org', Device::query()->findOrFail($deviceId)->policy->url);
        $this->assertSame(hash('sha256', 'agent-version-two'), Enrollment::query()->findOrFail($new['id'])->apk_sha256);
    }

    public function test_separate_configurations_keep_distinct_tokens_and_policies(): void
    {
        $first = $this->createConfiguration();
        $second = $this->createConfiguration(['name' => 'Atelier', 'url' => 'https://workshop.example.org']);
        $this->assertNotSame($this->token($this->qr($first)), $this->token($this->qr($second)));
        $this->postJson('/api/v1/device/enroll', ['enrollment_token' => $this->token($this->qr($second))])
            ->assertCreated()->assertJsonPath('policy.url', 'https://workshop.example.org');
    }

    public function test_missing_apk_does_not_create_configuration_or_revoke_working_qr(): void
    {
        $id = $this->createConfiguration();
        $old = $this->qr($id);
        Storage::disk('local')->delete('source.apk');
        $this->postJson('/api/v1/configurations', $this->data())->assertUnprocessable();
        $this->postJson("/api/v1/configurations/{$id}/qr/regenerate")->assertUnprocessable();
        $this->assertDatabaseCount('configurations', 1);
        $this->assertDatabaseCount('enrollments', 1);
        $this->assertSame($old['qr_text'], $this->qr($id)['qr_text']);
    }

    public function test_secrets_are_encrypted_and_blank_password_keeps_existing_value(): void
    {
        $id = $this->createConfiguration();
        $old = $this->qr($id);
        $stored = DB::table('enrollments')->first();
        $this->assertStringNotContainsString($this->token($old), $stored->qr_text);
        $this->assertStringNotContainsString('test-password', DB::table('configurations')->first()->wifi);
        $this->patchJson("/api/v1/configurations/{$id}", $this->data(['wifi_password' => '']))
            ->assertOk()->assertJsonPath('has_pending_changes', false);
        $this->getJson('/api/v1/configurations')->assertOk()->assertJsonMissingPath('0.policy.admin_pin_hash')
            ->assertJsonMissingPath('0.wifi_password')->assertJsonMissingPath('0.qr_text');
    }

    public function test_configuration_endpoints_require_authentication(): void
    {
        $id = $this->createConfiguration();
        auth()->forgetGuards();
        $this->getJson('/api/v1/configurations')->assertUnauthorized();
        $this->getJson("/api/v1/configurations/{$id}/qr")->assertUnauthorized();
        $this->postJson('/api/v1/configurations', $this->data())->assertUnauthorized();
        $this->patchJson("/api/v1/configurations/{$id}", $this->data())->assertUnauthorized();
        $this->postJson("/api/v1/configurations/{$id}/qr/regenerate")->assertUnauthorized();
        $this->deleteJson("/api/v1/configurations/{$id}")->assertUnauthorized();
    }

    public function test_deleting_configuration_invalidates_its_qrs_and_preserves_enrolled_devices(): void
    {
        $id = $this->createConfiguration();
        $old = $this->qr($id);
        $this->postJson("/api/v1/configurations/{$id}/qr/regenerate")->assertOk();
        $current = $this->qr($id);
        $device = $this->postJson('/api/v1/device/enroll', ['enrollment_token' => $this->token($current)])->assertCreated()->json();
        $otherId = $this->createConfiguration(['name' => 'Autre configuration']);
        $otherQr = $this->qr($otherId);

        $this->deleteJson("/api/v1/configurations/{$id}")->assertOk()->assertJsonPath('ok', true);

        $this->assertSoftDeleted('configurations', ['id' => $id]);
        $this->getJson('/api/v1/configurations')->assertOk()->assertJsonCount(1)->assertJsonPath('0.id', $otherId);
        $this->getJson("/api/v1/configurations/{$id}/qr")->assertNotFound();
        $this->postJson('/api/v1/enrollments', ['configuration_id' => $id])->assertNotFound();
        $this->patchJson("/api/v1/configurations/{$id}", $this->data())->assertNotFound();
        $this->postJson("/api/v1/configurations/{$id}/qr/regenerate")->assertNotFound();
        $this->deleteJson("/api/v1/configurations/{$id}")->assertNotFound();
        foreach ([$old, $current] as $qr) {
            $this->postJson('/api/v1/device/enroll', ['enrollment_token' => $this->token($qr)])->assertUnauthorized();
        }
        $this->assertSame($device['policy']['url'], Device::query()->findOrFail($device['device_id'])->policy->url);
        $this->assertNull(Device::query()->findOrFail($device['device_id'])->configuration_id);
        $this->withHeader('Authorization', 'Bearer '.$device['device_token'])
            ->getJson('/api/v1/device/policy')->assertOk()->assertExactJson($device['policy']);
        $this->assertSame($otherQr['qr_text'], $this->qr($otherId)['qr_text']);
        $this->postJson('/api/v1/device/enroll', ['enrollment_token' => $this->token($otherQr)])->assertCreated();
        $history = collect($this->getJson('/api/v1/enrollments')->assertOk()->json())->firstWhere('id', $current['id']);
        $this->assertSame('Accueil', $history['configuration_name']);
        $this->assertTrue($history['configuration_deleted']);
        $this->assertSame('revoked', $history['status']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'CONFIGURATION_DELETED']);
    }

    public function test_kiosk_accepts_local_http_but_requires_a_url_and_numeric_pin(): void
    {
        $this->postJson('/api/v1/configurations', $this->data(['kiosk_enabled' => true]))->assertUnprocessable();
        $this->postJson('/api/v1/configurations', $this->data(['url' => 'http://192.168.10.121:8081']))
            ->assertCreated()
            ->assertJsonPath('policy.url', 'http://192.168.10.121:8081');
        $this->postJson('/api/v1/configurations', $this->data(['admin_pin' => 'abcd']))->assertUnprocessable();
        $this->assertDatabaseCount('configurations', 1);
    }

    public function test_linked_policy_must_be_detached_before_it_can_be_changed_per_device(): void
    {
        $id = $this->createConfiguration(['sync_interval_minutes' => 60]);
        $device = $this->postJson('/api/v1/device/enroll', [
            'enrollment_token' => $this->token($this->qr($id)),
        ])->assertCreated()->assertJsonPath('policy.sync_interval_minutes', 60);

        $this->patchJson('/api/v1/devices/'.$device->json('device_id'), [
            'kiosk_enabled' => false,
            'url' => '',
            'allowed_origins' => [],
            'keep_screen_on' => true,
            'sync_interval_minutes' => 180,
        ])->assertUnprocessable()->assertJsonValidationErrors('configuration');

        $this->deleteJson('/api/v1/devices/'.$device->json('device_id').'/configuration')
            ->assertOk()
            ->assertJsonPath('device.configuration_id', null)
            ->assertJsonPath('policy.sync_interval_minutes', 60);

        $this->patchJson('/api/v1/devices/'.$device->json('device_id'), [
            'kiosk_enabled' => false,
            'url' => '',
            'allowed_origins' => [],
            'keep_screen_on' => true,
            'sync_interval_minutes' => 180,
        ])->assertOk()->assertJsonPath('policy.sync_interval_minutes', 180);

        $this->patchJson("/api/v1/configurations/{$id}", $this->data(['sync_interval_minutes' => 15]))
            ->assertOk()
            ->assertJsonPath('managed_devices_count', 0);
        $this->assertSame(180, Device::query()->findOrFail($device->json('device_id'))->policy->sync_interval_minutes);
        $this->assertDatabaseHas('audit_logs', [
            'device_id' => $device->json('device_id'),
            'action' => 'DEVICE_CONFIGURATION_DETACHED',
        ]);

        $this->postJson('/api/v1/configurations', $this->data(['sync_interval_minutes' => 0]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('sync_interval_minutes');
    }

    public function test_a_complete_configuration_can_be_assigned_to_an_existing_device(): void
    {
        $initialId = $this->createConfiguration();
        $device = $this->postJson('/api/v1/device/enroll', [
            'enrollment_token' => $this->token($this->qr($initialId)),
        ])->assertCreated();
        $targetId = $this->createConfiguration([
            'name' => 'Profil salle de réunion',
            'url' => 'https://meeting.example.org',
            'allowed_origins' => [],
            'orientation' => 'portrait',
            'sync_interval_minutes' => 15,
            'default_volume' => 35,
            'default_brightness' => 65,
        ]);

        $this->postJson('/api/v1/devices/'.$device->json('device_id').'/configuration', [
            'configuration_id' => $targetId,
        ])->assertOk()
            ->assertJsonPath('device.configuration_id', $targetId)
            ->assertJsonPath('device.configuration_name', 'Profil salle de réunion')
            ->assertJsonPath('policy.revision', 2)
            ->assertJsonPath('policy.url', 'https://meeting.example.org')
            ->assertJsonPath('policy.allowed_origins', [])
            ->assertJsonPath('policy.orientation', 'portrait')
            ->assertJsonPath('policy.sync_interval_minutes', 15)
            ->assertJsonPath('policy.default_volume', 35)
            ->assertJsonPath('policy.default_brightness', 65);

        $this->assertDatabaseHas('audit_logs', [
            'device_id' => $device->json('device_id'),
            'action' => 'DEVICE_CONFIGURATION_ASSIGNED',
        ]);

        $this->patchJson("/api/v1/configurations/{$targetId}", $this->data([
            'name' => 'Profil salle de réunion',
            'url' => 'https://updated.example.org',
            'allowed_origins' => [],
            'orientation' => 'landscape',
            'sync_interval_minutes' => 30,
            'default_volume' => 45,
            'default_brightness' => 55,
        ]))->assertOk()->assertJsonPath('managed_devices_count', 1);

        $this->getJson('/api/v1/devices/'.$device->json('device_id'))
            ->assertOk()
            ->assertJsonPath('policy.revision', 3)
            ->assertJsonPath('policy.url', 'https://updated.example.org')
            ->assertJsonPath('policy.orientation', 'landscape')
            ->assertJsonPath('policy.sync_interval_minutes', 30)
            ->assertJsonPath('policy.default_volume', 45)
            ->assertJsonPath('policy.default_brightness', 55);
        $this->withToken($device->json('device_token'))
            ->postJson('/api/v1/device/heartbeat', ['policy_revision' => 2])
            ->assertOk()
            ->assertJsonPath('current_policy_revision', 3)
            ->assertJsonPath('policy_changed', true);
        $this->withToken($device->json('device_token'))
            ->getJson('/api/v1/device/policy')
            ->assertOk()
            ->assertJsonPath('revision', 3)
            ->assertJsonPath('url', 'https://updated.example.org');
    }

    public function test_new_modes_and_app_library_are_copied_to_enrollment_policy(): void
    {
        foreach (['web_single', 'web_open', 'app', 'launcher'] as $type) {
            $apps = $type === 'app' ? ['com.android.chrome'] : ($type === 'launcher' ? ['com.android.chrome', 'com.example.reader'] : []);
            $id = $this->createConfiguration(['kiosk_type' => $type, 'allowed_apps' => $apps, 'url' => $apps ? '' : 'https://example.org']);
            $qr = $this->qr($id);
            $device = $this->postJson('/api/v1/device/enroll', ['enrollment_token' => $this->token($qr)])->assertCreated();
            $device->assertJsonPath('policy.kiosk_type', $type)->assertJsonPath('policy.allowed_apps', $apps);
            $this->deleteJson('/api/v1/devices/'.$device->json('device_id').'/configuration')->assertOk();
            $this->patchJson('/api/v1/devices/'.$device->json('device_id'), [
                'kiosk_enabled' => true, 'kiosk_type' => 'launcher', 'allowed_apps' => ['com.example.reader'],
                'url' => '', 'allowed_origins' => [], 'keep_screen_on' => true,
            ])->assertOk()->assertJsonPath('policy.allowed_apps', ['com.example.reader'])->assertJsonPath('policy.kiosk_type', 'launcher');
        }
    }

    public function test_invalid_app_libraries_are_rejected(): void
    {
        foreach ([['app', []], ['app', ['com.one.app', 'com.two.app']], ['launcher', []], ['launcher', ['bad package']], ['launcher', ['org.mymdm.agent']]] as [$type, $apps]) {
            $this->postJson('/api/v1/configurations', $this->data(['kiosk_type' => $type, 'allowed_apps' => $apps]))->assertUnprocessable();
        }
        $this->assertDatabaseCount('configurations', 0);
    }

    public function test_enrollment_uses_the_selected_agent_and_preserves_the_qr_until_regeneration(): void
    {
        $releases = app(AgentReleaseManager::class);
        $chosen = $releases->store(UploadedFile::fake()->createWithContent('chosen.apk', 'chosen-agent'), '0.4.1-dev', 41);
        $active = $releases->store(UploadedFile::fake()->createWithContent('active.apk', 'active-agent'), '0.4.4-dev', 44);
        $id = $this->createConfiguration(['enrollment_agent_source' => 'release', 'enrollment_agent_release_id' => $chosen->id]);
        $original = $this->qr($id);
        $saved = Enrollment::query()->findOrFail($original['id']);
        $this->assertSame(hash('sha256', 'chosen-agent'), $saved->apk_sha256);
        $this->assertSame($active->id, $releases->active()->id);
        $this->deleteJson('/api/v1/agent/releases/'.$chosen->id)->assertUnprocessable();
        $deviceId = $this->postJson('/api/v1/device/enroll', ['enrollment_token' => $this->token($original)])
            ->assertCreated()->json('device_id');
        $device = Device::query()->findOrFail($deviceId);
        $originalPolicy = $device->policy->getAttributes();

        $this->patchJson('/api/v1/configurations/'.$id, $this->data([
            'enrollment_agent_source' => 'release',
            'enrollment_agent_release_id' => $active->id,
        ]))->assertOk()->assertJsonPath('has_pending_changes', true);
        $this->assertSame($original['qr_text'], $this->qr($id)['qr_text']);
        $this->assertSame(hash('sha256', 'chosen-agent'), $saved->refresh()->apk_sha256);
        $this->assertSame($originalPolicy, $device->refresh()->policy->getAttributes());
        $this->assertDatabaseCount('device_commands', 0);

        $this->postJson('/api/v1/configurations/'.$id.'/qr/regenerate')->assertOk()->assertJsonPath('has_pending_changes', false);
        $this->assertSame(hash('sha256', 'active-agent'), Enrollment::query()->findOrFail($this->qr($id)['id'])->apk_sha256);
    }

    public function test_compiled_android_agent_can_be_selected_instead_of_the_active_upload(): void
    {
        app(AgentReleaseManager::class)->store(UploadedFile::fake()->createWithContent('active.apk', 'uploaded-agent'), '0.4.4-dev', 44);
        $id = $this->createConfiguration(['enrollment_agent_source' => 'android']);
        $this->assertSame(hash('sha256', 'agent-version-one'), Enrollment::query()->findOrFail($this->qr($id)['id'])->apk_sha256);
    }

    public function test_enrollment_agent_must_exist_and_match_the_configuration_platform(): void
    {
        $ios = AgentRelease::query()->create(['platform' => 'ios', 'version' => '1.0', 'version_code' => 1, 'apk_sha256' => hash('sha256', 'old-ios-agent'), 'apk_size' => 13, 'download_url' => '', 'active' => false]);
        $this->postJson('/api/v1/configurations', $this->data([
            'enrollment_agent_source' => 'release', 'enrollment_agent_release_id' => $ios->id,
        ]))->assertUnprocessable()->assertJsonValidationErrors('enrollment_agent_release_id');
        $this->postJson('/api/v1/configurations', $this->data(['enrollment_agent_source' => 'release']))
            ->assertUnprocessable()->assertJsonValidationErrors('enrollment_agent_release_id');
        $this->assertDatabaseCount('configurations', 0);
    }

    public function test_sound_and_brightness_commands_are_reserved_for_independent_devices(): void
    {
        $id = $this->createConfiguration();
        $deviceId = $this->postJson('/api/v1/device/enroll', ['enrollment_token' => $this->token($this->qr($id))])->assertCreated()->json('device_id');
        foreach (['set_volume', 'set_brightness'] as $type) {
            $this->postJson('/api/v1/devices/'.$deviceId.'/commands', ['type' => $type, 'value' => 50])
                ->assertUnprocessable()->assertJsonValidationErrors('type');
        }
        $this->assertDatabaseCount('device_commands', 0);
        $this->deleteJson('/api/v1/devices/'.$deviceId.'/configuration')->assertOk();
        $this->postJson('/api/v1/devices/'.$deviceId.'/commands', ['type' => 'set_volume', 'value' => 50])->assertOk();
    }
}
