<?php

namespace App\Http\Controllers;

use App\Models\AgentRelease;
use App\Models\AuditLog;
use App\Services\AgentReleaseManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class AgentReleaseController extends Controller
{
    public function source(Request $request, AgentReleaseManager $releases): JsonResponse
    {
        $platform = $this->platform($request);

        return response()->json($releases->source($platform));
    }

    public function useDefault(Request $request, AgentReleaseManager $releases): JsonResponse
    {
        $platform = $this->platform($request);
        if (! is_file($releases->fallbackApkPath())) {
            throw ValidationException::withMessages(['apk' => 'Build the platform agent and make its file accessible to the server.']);
        }
        $releases->useDefault($platform);
        AuditLog::query()->create(['user_id' => $request->user()->id, 'action' => 'AGENT_DEFAULT_SELECTED', 'payload' => ['platform' => $platform]]);

        return response()->json($releases->source($platform));
    }

    public function index(Request $request, AgentReleaseManager $releases)
    {
        $platform = $this->platform($request);

        return AgentRelease::query()
            ->where('platform', $platform)
            ->latest('version_code')
            ->latest()
            ->get()
            ->map(fn (AgentRelease $release) => [
                'id' => $release->id,
                'platform' => $release->platform,
                'version' => $release->version,
                'version_code' => $release->version_code,
                'artifact_name' => $release->original_name,
                'artifact_sha256' => $release->apk_sha256,
                'artifact_size' => $release->apk_size,
                'apk_sha256' => $release->apk_sha256,
                'apk_size' => $release->apk_size,
                'download_url' => $release->download_url,
                'active' => $release->active,
                'downloadable' => $releases->isDownloadable($release),
                'created_at' => $release->created_at->toISOString(),
            ]);
    }

    public function store(Request $request, AgentReleaseManager $releases)
    {
        $data = $request->validate([
            'platform' => ['nullable', Rule::in(AgentReleaseManager::PLATFORMS)],
            'artifact' => ['nullable', 'file', 'max:512000', 'required_without:apk'],
            'apk' => ['nullable', 'file', 'max:512000', 'required_without:artifact'],
            'version' => ['required', 'string', 'max:64'],
            'version_code' => ['required', 'integer', 'min:1'],
        ]);
        $platform = $data['platform'] ?? 'android';
        $artifact = $data['artifact'] ?? $data['apk'];

        try {
            $release = $releases->store($artifact, $data['version'], (int) $data['version_code'], $platform);
        } catch (\RuntimeException $exception) {
            $field = $request->hasFile('artifact') ? 'artifact' : 'apk';
            throw ValidationException::withMessages([$field => $exception->getMessage()]);
        }

        AuditLog::query()->create([
            'user_id' => $request->user()->id,
            'action' => 'AGENT_RELEASE_UPLOADED',
            'payload' => [
                'agent_release_id' => $release->id,
                'platform' => $release->platform,
                'version' => $release->version,
                'version_code' => $release->version_code,
            ],
        ]);

        return response()->json([
            'id' => $release->id,
            'platform' => $release->platform,
            'version' => $release->version,
            'version_code' => $release->version_code,
            'artifact_name' => $release->original_name,
            'artifact_sha256' => $release->apk_sha256,
            'artifact_size' => $release->apk_size,
            'apk_sha256' => $release->apk_sha256,
            'apk_size' => $release->apk_size,
            'download_url' => $release->download_url,
            'active' => $release->active,
            'created_at' => $release->created_at->toISOString(),
        ], 201);
    }

    public function activate(Request $request, AgentRelease $release, AgentReleaseManager $releases): JsonResponse
    {
        try {
            $releases->activate($release);
        } catch (\RuntimeException $exception) {
            throw ValidationException::withMessages(['release' => $exception->getMessage()]);
        }
        AuditLog::query()->create(['user_id' => $request->user()->id, 'action' => 'AGENT_RELEASE_ACTIVATED', 'payload' => ['agent_release_id' => $release->id]]);

        return response()->json($releases->source($release->platform));
    }

    public function destroy(Request $request, AgentRelease $release, AgentReleaseManager $releases): JsonResponse
    {
        try {
            $releases->delete($release);
        } catch (\RuntimeException $exception) {
            throw ValidationException::withMessages(['release' => $exception->getMessage()]);
        }
        AuditLog::query()->create(['user_id' => $request->user()->id, 'action' => 'AGENT_RELEASE_DELETED', 'payload' => ['agent_release_id' => $release->id, 'version' => $release->version]]);

        return response()->json(['ok' => true]);
    }

    public function download(AgentRelease $release, AgentReleaseManager $releases): BinaryFileResponse
    {
        abort_unless($releases->isDownloadable($release), 404, 'Agent not found.');

        return response()->download(
            $releases->storedApkPath($release),
            $release->original_name ?: basename($release->apk_path),
            ['Content-Type' => 'application/octet-stream'],
        );
    }

    private function platform(Request $request): string
    {
        return $request->validate([
            'platform' => ['nullable', Rule::in(AgentReleaseManager::PLATFORMS)],
        ])['platform'] ?? 'android';
    }
}
