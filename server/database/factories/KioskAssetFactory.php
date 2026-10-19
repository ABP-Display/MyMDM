<?php

namespace Database\Factories;

use App\Models\KioskAsset;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<KioskAsset>
 */
class KioskAssetFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $sha256 = hash('sha256', fake()->uuid());

        return [
            'type' => 'android_app',
            'name' => fake()->words(2, true),
            'package_name' => 'com.example.'.fake()->unique()->lexify('app????'),
            'version_name' => '1.0.0',
            'version_code' => 1,
            'source' => 'upload',
            'source_url' => null,
            'original_name' => 'application.apk',
            'mime_type' => 'application/vnd.android.package-archive',
            'sha256' => $sha256,
            'size_bytes' => 128,
            'storage_path' => 'kiosk-assets/'.$sha256.'/application.apk',
        ];
    }

    public function file(): static
    {
        return $this->state(fn () => [
            'type' => 'file',
            'package_name' => null,
            'version_name' => null,
            'version_code' => null,
            'original_name' => 'document.pdf',
            'mime_type' => 'application/pdf',
        ]);
    }

    public function image(): static
    {
        return $this->file()->state(fn () => [
            'original_name' => 'wallpaper.png',
            'mime_type' => 'image/png',
        ]);
    }
}
