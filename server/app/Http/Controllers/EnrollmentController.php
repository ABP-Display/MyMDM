<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\Configuration;
use App\Models\Enrollment;
use App\Services\ProvisioningQr;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class EnrollmentController extends Controller
{
    public function index()
    {
        return Enrollment::query()
            ->with('configuration')
            ->latest('created_at')
            ->get()
            ->map(fn (Enrollment $enrollment) => [
                'id' => $enrollment->id,
                'status' => $enrollment->status,
                'expires_at' => optional($enrollment->expires_at)->toISOString(),
                'used_at' => optional($enrollment->used_at)->toISOString(),
                'device_id' => $enrollment->device_id,
                'created_at' => $enrollment->created_at->toISOString(),
                'configuration_id' => $enrollment->configuration_id,
                'configuration_name' => $enrollment->configuration?->name,
                'configuration_deleted' => $enrollment->configuration?->trashed() ?? false,
                'use_count' => $enrollment->use_count,
            ]);
    }

    public function store(Request $request, ProvisioningQr $qr)
    {
        if ($request->has('configuration_id')) {
            $request->validate(['configuration_id' => ['required', 'uuid', 'exists:configurations,id']]);

            return $this->configurationQr(Configuration::query()->findOrFail($request->input('configuration_id')));
        }

        $data = $request->validate([
            'wifi_ssid' => ['nullable', 'string', 'max:255'],
            'wifi_security_type' => ['nullable', 'string'],
            'wifi_password' => ['nullable', 'string'],
            'wifi_hidden' => ['nullable', 'boolean'],
        ]);

        $wifi = null;
        if (trim($data['wifi_ssid'] ?? '') !== '') {
            $securityType = strtoupper(trim($data['wifi_security_type'] ?? 'WPA'));
            if (! in_array($securityType, ['NONE', 'WPA', 'WEP', 'EAP'], true)) {
                abort(400, 'wifi_security_type must be NONE, WPA, WEP, or EAP');
            }
            if ($securityType !== 'NONE' && trim($data['wifi_password'] ?? '') === '') {
                abort(400, 'wifi_password is required unless wifi_security_type is NONE');
            }
            $wifi = [
                'ssid' => trim($data['wifi_ssid']),
                'security_type' => $securityType,
                'password' => $data['wifi_password'] ?? '',
                'hidden' => (bool) ($data['wifi_hidden'] ?? false),
            ];
        }

        $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $enrollment = Enrollment::query()->create([
            'token_hash' => hash('sha256', $token),
            'status' => 'active',
            'expires_at' => now()->addHours(config('mymdm.enrollment_ttl_hours')),
        ]);

        AuditLog::query()->create([
            'user_id' => $request->user()->id,
            'action' => 'ENROLLMENT_CREATED',
            'payload' => ['enrollment_id' => $enrollment->id],
        ]);

        return response()->json([
            'id' => $enrollment->id,
            'status' => 'active',
            'expires_at' => $enrollment->expires_at->toISOString(),
            'qr_text' => $qr->generate($token, $wifi),
        ], 201);
    }

    public function configurationQr(Configuration $configuration): JsonResponse
    {
        if ($configuration->platform !== 'android') {
            throw ValidationException::withMessages(['configuration' => 'This platform uses a different enrollment procedure. See its guide.']);
        }
        $enrollment = $configuration->activeEnrollment()->firstOrFail();

        return response()->json([
            'id' => $enrollment->id,
            'configuration_id' => $configuration->id,
            'configuration_name' => $configuration->name,
            'status' => $enrollment->status,
            'expires_at' => null,
            'qr_text' => $enrollment->qr_text,
            'created_at' => $enrollment->created_at->toISOString(),
            'use_count' => $enrollment->use_count,
        ])->header('Cache-Control', 'no-store, private');
    }
}
