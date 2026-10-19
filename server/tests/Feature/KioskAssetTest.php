<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\KioskAsset;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class KioskAssetTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->actingAs(User::factory()->create());
    }

    public function test_admin_can_upload_list_and_remove_an_apk_without_deleting_its_immutable_file(): void
    {
        $contents = "PK\x03\x04fake-apk";
        $response = $this->post('/api/v1/kiosk-assets', [
            'type' => 'android_app',
            'name' => 'Navigateur métier',
            'package_name' => 'com.example.browser',
            'version_name' => '2.4.0',
            'version_code' => 24,
            'source_url' => 'https://www.apkmirror.com/apk/example/browser/',
            'file' => UploadedFile::fake()->createWithContent('browser.apk', $contents),
        ])->assertCreated()
            ->assertJsonPath('type', 'android_app')
            ->assertJsonPath('source', 'apkmirror')
            ->assertJsonPath('package_name', 'com.example.browser')
            ->assertJsonPath('sha256', hash('sha256', $contents));

        $asset = KioskAsset::query()->findOrFail($response->json('id'));
        Storage::disk('local')->assertExists($asset->storage_path);
        $this->getJson('/api/v1/kiosk-assets')->assertOk()->assertJsonCount(1);
        $this->deleteJson('/api/v1/kiosk-assets/'.$asset->id)->assertOk();
        $this->assertSoftDeleted('kiosk_assets', ['id' => $asset->id]);
        Storage::disk('local')->assertExists($asset->storage_path);
        $this->getJson('/api/v1/kiosk-assets')->assertOk()->assertJsonCount(0);
    }

    public function test_device_download_requires_a_valid_device_token_and_survives_library_removal(): void
    {
        $asset = KioskAsset::factory()->create();
        Storage::disk('local')->put($asset->storage_path, 'immutable-content');
        $device = Device::query()->create(['name' => 'Tablet', 'credential_hash' => hash('sha256', 'device-secret')]);
        $device->policy()->create(['revision' => 1]);
        $asset->delete();

        auth()->forgetGuards();
        $path = '/api/v1/device/library/'.$asset->sha256;
        $this->get($path)->assertUnauthorized();
        $download = $this->withToken('device-secret')->get($path)->assertOk();
        $this->assertSame('immutable-content', file_get_contents($download->baseResponse->getFile()->getPathname()));
    }

    public function test_android_upload_rejects_split_bundle_formats(): void
    {
        $base = [
            'type' => 'android_app',
            'name' => 'Application',
            'package_name' => 'com.example.application',
        ];

        $this->post('/api/v1/kiosk-assets', [...$base, 'file' => UploadedFile::fake()->createWithContent('application.xapk', "PK\x03\x04bundle")])
            ->assertUnprocessable()->assertJsonValidationErrors('file');
    }

    public function test_application_upload_limit_is_five_hundred_megabytes(): void
    {
        $accepted = UploadedFile::fake()->createWithContent('application.apk', "PK\x03\x04apk")->size(512000);
        $this->post('/api/v1/kiosk-assets', [
            'type' => 'android_app',
            'name' => 'Application volumineuse',
            'package_name' => 'com.example.large',
            'file' => $accepted,
        ])->assertCreated();

        $rejected = UploadedFile::fake()->createWithContent('too-large.apk', "PK\x03\x04apk")->size(512001);
        $this->post('/api/v1/kiosk-assets', [
            'type' => 'android_app',
            'name' => 'Application trop volumineuse',
            'package_name' => 'com.example.too.large',
            'file' => $rejected,
        ])->assertUnprocessable()->assertJsonValidationErrors('file');
    }

    public function test_catalog_accepts_android_apps_and_shared_files(): void
    {
        $items = [
            ['android_app', 'android', 'Android', 'com.example.android', 'android.apk', "PK\x03\x04android"],
            ['file', 'all', 'Document', null, 'document.pdf', '%PDF-document'],
        ];

        foreach ($items as [$type, $platform, $name, $identifier, $fileName, $contents]) {
            $this->post('/api/v1/kiosk-assets', array_filter([
                'type' => $type,
                'name' => $name,
                'package_name' => $identifier,
                'file' => UploadedFile::fake()->createWithContent($fileName, $contents),
            ], fn ($value) => $value !== null))->assertCreated()->assertJsonPath('type', $type)->assertJsonPath('platform', $platform);
        }

        $this->getJson('/api/v1/kiosk-assets')->assertOk()->assertJsonCount(2);
        $this->getJson('/api/v1/kiosk-assets?platform=android')->assertOk()->assertJsonCount(2);
    }

    public function test_application_type_must_match_the_selected_platform(): void
    {
        $this->post('/api/v1/kiosk-assets', [
            'type' => 'android_app',
            'platform' => 'windows',
            'name' => 'Mauvais paquet',
            'package_name' => 'com.example.application',
            'file' => UploadedFile::fake()->createWithContent('application.apk', "PK\x03\x04apk"),
        ])->assertUnprocessable()->assertJsonValidationErrors('platform');
    }

    public function test_library_endpoints_require_admin_authentication(): void
    {
        $asset = KioskAsset::factory()->create();
        auth()->forgetGuards();

        $this->getJson('/api/v1/kiosk-assets')->assertUnauthorized();
        $this->post('/api/v1/kiosk-assets')->assertUnauthorized();
        $this->deleteJson('/api/v1/kiosk-assets/'.$asset->id)->assertUnauthorized();
    }
}
