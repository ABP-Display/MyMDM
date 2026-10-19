<?php

namespace App\Services;

use App\Models\Configuration;
use App\Models\Enrollment;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class ConfigurationEnrollment
{
    public function __construct(private AgentReleaseManager $releases, private ProvisioningQr $qr) {}

    public function generate(Configuration $configuration): Enrollment
    {
        return DB::transaction(function () use ($configuration): Enrollment {
            $configuration = Configuration::query()->lockForUpdate()->findOrFail($configuration->id);
            $source = $this->agentPath($configuration);
            if (! is_file($source) || ! is_readable($source)) {
                throw ValidationException::withMessages(['apk' => 'Publiez un APK agent avant de générer le QR code.']);
            }
            $contents = file_get_contents($source);
            if ($contents === false) {
                throw ValidationException::withMessages(['apk' => 'Impossible de lire l’APK agent.']);
            }
            $sha256 = hash('sha256', $contents);
            $path = 'enrollment-apks/'.$sha256.'.apk';
            $disk = Storage::disk('local');
            if (! $disk->exists($path) && ! $disk->put($path, $contents)) {
                throw ValidationException::withMessages(['apk' => 'Impossible de conserver l’APK du QR code.']);
            }
            if (hash_file('sha256', $disk->path($path)) !== $sha256) {
                throw ValidationException::withMessages(['apk' => 'La copie conservée de l’APK est endommagée.']);
            }
            $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
            $payload = $this->qr->generate(
                $token, $configuration->wifi, $disk->path($path),
                rtrim(config('mymdm.base_url'), '/').'/downloads/enrollment-apks/'.$sha256.'.apk',
            );
            $configuration->activeEnrollment()->update(['status' => 'revoked']);

            return Enrollment::query()->create([
                'configuration_id' => $configuration->id,
                'token_hash' => hash('sha256', $token),
                'status' => 'active',
                'expires_at' => null,
                'qr_text' => $payload,
                'policy_snapshot' => $configuration->policy,
                'apk_sha256' => $sha256,
            ]);
        });
    }

    public function agentPath(Configuration $configuration): string
    {
        $source = $configuration->enrollment_agent_source ?? 'active';
        if ($source === 'release') {
            $release = $configuration->enrollmentAgentRelease;
            if ($release === null || $release->platform !== $configuration->platform || ! $this->releases->isDownloadable($release)) {
                throw ValidationException::withMessages(['enrollment_agent_release_id' => 'L’agent sélectionné est introuvable ou incompatible.']);
            }

            return $this->releases->storedApkPath($release);
        }

        return $source === 'android' ? $this->releases->fallbackApkPath() : $this->releases->activeApkPath();
    }
}
