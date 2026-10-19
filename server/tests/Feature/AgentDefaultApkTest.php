<?php

namespace Tests\Feature;

use App\Models\AgentRelease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AgentDefaultApkTest extends TestCase
{
    use RefreshDatabase;

    public function test_default_output_metadata_and_manual_override(): void
    {
        Storage::fake('local');
        $disk = Storage::disk('local');
        $disk->put('output/app-debug.apk', 'compiled-android');
        $disk->put('output/output-metadata.json', json_encode(['elements' => [['outputFile' => 'app-debug.apk', 'versionName' => '0.1.3-dev', 'versionCode' => 4]]]));
        config(['mymdm.apk_path' => $disk->path('missing.apk'), 'mymdm.android_apk_path' => $disk->path('output/app-debug.apk')]);
        $this->actingAs(User::factory()->create());
        $this->getJson('/api/v1/agent/source')->assertOk()->assertJsonPath('source', 'android')->assertJsonPath('version_code', 4)->assertJsonPath('version', '0.1.3-dev');
        $download = $this->get('/downloads/mymdm-agent.apk')->assertOk();
        $this->assertSame('compiled-android', file_get_contents($download->baseResponse->getFile()->getPathname()));
        $this->post('/api/v1/agent/releases', ['version' => '0.1.4-dev', 'version_code' => 5, 'apk' => UploadedFile::fake()->createWithContent('agent.apk', 'manual-upload')])->assertCreated();
        $this->getJson('/api/v1/agent/source')->assertOk()->assertJsonPath('source', 'upload')->assertJsonPath('version_code', 5);
        $download = $this->get('/downloads/mymdm-agent.apk')->assertOk();
        $this->assertSame('manual-upload', file_get_contents($download->baseResponse->getFile()->getPathname()));
        $this->postJson('/api/v1/agent/use-default')->assertOk()->assertJsonPath('source', 'android')->assertJsonPath('version_code', 4);
        $disk->delete('output/app-debug.apk');
        $this->getJson('/api/v1/agent/source')->assertOk()->assertJsonPath('available', false);
        $this->postJson('/api/v1/agent/use-default')->assertUnprocessable();
        $this->get('/downloads/mymdm-agent.apk')->assertNotFound();
        auth()->forgetGuards();
        $this->postJson('/api/v1/agent/use-default')->assertUnauthorized();
    }

    public function test_uploaded_releases_can_be_reactivated_and_deleted(): void
    {
        Storage::fake('local');
        config(['mymdm.apk_path' => '/missing.apk', 'mymdm.android_apk_path' => '/missing-android.apk']);
        $this->actingAs(User::factory()->create());
        $firstId = $this->post('/api/v1/agent/releases', [
            'version' => 'V6', 'version_code' => 3,
            'apk' => UploadedFile::fake()->createWithContent('v6.apk', 'version-six'),
        ])->assertCreated()->json('id');
        $secondId = $this->post('/api/v1/agent/releases', [
            'version' => 'V8', 'version_code' => 4,
            'apk' => UploadedFile::fake()->createWithContent('v8.apk', 'version-eight'),
        ])->assertCreated()->json('id');

        $this->assertTrue(AgentRelease::findOrFail($secondId)->active);
        $this->postJson("/api/v1/agent/releases/{$firstId}/activate")->assertOk()->assertJsonPath('version', 'V6');
        $this->assertTrue(AgentRelease::findOrFail($firstId)->active);
        $this->assertFalse(AgentRelease::findOrFail($secondId)->active);
        $this->deleteJson("/api/v1/agent/releases/{$secondId}")->assertOk();
        $this->assertDatabaseMissing('agent_releases', ['id' => $secondId]);
        $this->deleteJson("/api/v1/agent/releases/{$firstId}")->assertUnprocessable();
    }

    public function test_same_apk_cannot_be_relabelled_as_a_new_version(): void
    {
        Storage::fake('local');
        config(['mymdm.apk_path' => '/missing.apk', 'mymdm.android_apk_path' => '/missing-android.apk']);
        $this->actingAs(User::factory()->create());
        $apk = static fn () => UploadedFile::fake()->createWithContent('agent.apk', 'same-binary');

        $this->post('/api/v1/agent/releases', [
            'version' => 'V6', 'version_code' => 3, 'apk' => $apk(),
        ])->assertCreated();

        $this->post('/api/v1/agent/releases', [
            'version' => 'V8', 'version_code' => 4, 'apk' => $apk(),
        ])->assertUnprocessable()->assertJsonValidationErrors('apk');
    }
}
