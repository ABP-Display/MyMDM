<?php

namespace App\Http\Controllers;

use App\Models\Enrollment;
use App\Services\AgentReleaseManager;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class DownloadController extends Controller
{
    public function enrollmentApk(string $sha256): BinaryFileResponse
    {
        abort_unless(Enrollment::query()->where('apk_sha256', $sha256)->exists(), 404);
        $path = Storage::disk('local')->path('enrollment-apks/'.$sha256.'.apk');
        abort_unless(is_file($path), 404, 'APK not found');

        return response()->download($path, 'mymdm-agent.apk', [
            'Content-Type' => 'application/vnd.android.package-archive',
            'Cache-Control' => 'public, max-age=31536000, immutable',
        ]);
    }

    public function apk(AgentReleaseManager $releases)
    {
        $path = $releases->activeApkPath();
        if (! is_file($path)) {
            abort(404, 'APK not found');
        }

        return response()->download($path, 'mymdm-agent.apk', [
            'Content-Type' => 'application/vnd.android.package-archive',
        ]);
    }
}
