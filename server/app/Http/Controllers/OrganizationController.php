<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\Organization;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class OrganizationController extends Controller
{
    public function index()
    {
        return Organization::query()
            ->withCount(['devices' => fn ($query) => $query->whereNull('revoked_at')])
            ->orderBy('name')
            ->get()
            ->map(fn (Organization $organization) => [
                'id' => $organization->id,
                'name' => $organization->name,
                'slug' => $organization->slug,
                'description' => $organization->description,
                'non_sync_threshold_hours' => $organization->non_sync_threshold_hours,
                'is_default' => $organization->slug === 'default',
                'devices_count' => $organization->devices_count,
            ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:organizations,name'],
            'description' => ['nullable', 'string', 'max:500'],
        ]);
        $baseSlug = Str::slug($data['name']) ?: 'organisation';
        $slug = $baseSlug;
        $suffix = 2;
        while (Organization::query()->where('slug', $slug)->exists()) {
            $slug = $baseSlug.'-'.$suffix++;
        }

        $organization = Organization::query()->create([
            'name' => trim($data['name']),
            'slug' => $slug,
            'description' => filled($data['description'] ?? null) ? trim($data['description']) : null,
        ]);
        $organization->refresh();
        AuditLog::query()->create([
            'user_id' => $request->user()->id,
            'action' => 'ORGANIZATION_CREATED',
            'payload' => ['organization_id' => $organization->id, 'name' => $organization->name],
        ]);

        return response()->json([
            'id' => $organization->id,
            'name' => $organization->name,
            'slug' => $organization->slug,
            'description' => $organization->description,
            'non_sync_threshold_hours' => $organization->non_sync_threshold_hours,
            'is_default' => $organization->slug === 'default',
            'devices_count' => 0,
        ], 201);
    }

    public function update(Request $request, Organization $organization)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('organizations', 'name')->ignore($organization->id)],
            'description' => ['nullable', 'string', 'max:500'],
            'non_sync_threshold_hours' => ['required', 'integer', 'min:1', 'max:720'],
        ]);
        $organization->update([
            'name' => trim($data['name']),
            'description' => filled($data['description'] ?? null) ? trim($data['description']) : null,
            'non_sync_threshold_hours' => $data['non_sync_threshold_hours'],
        ]);
        AuditLog::query()->create([
            'user_id' => $request->user()->id,
            'action' => 'ORGANIZATION_UPDATED',
            'payload' => ['organization_id' => $organization->id, 'name' => $organization->name, 'non_sync_threshold_hours' => $organization->non_sync_threshold_hours],
        ]);

        return $this->organizationData($organization->loadCount(['devices' => fn ($query) => $query->whereNull('revoked_at')]));
    }

    public function destroy(Request $request, Organization $organization)
    {
        abort_if($organization->slug === 'default', 409, 'L’organisation principale ne peut pas être supprimée.');
        abort_if($organization->devices()->exists(), 409, 'Réaffectez les appareils de cette organisation avant de la supprimer.');

        $payload = ['organization_id' => $organization->id, 'name' => $organization->name];
        DB::transaction(function () use ($organization): void {
            $organization->groups()->delete();
            $organization->delete();
        });
        AuditLog::query()->create([
            'user_id' => $request->user()->id,
            'action' => 'ORGANIZATION_DELETED',
            'payload' => $payload,
        ]);

        return ['ok' => true];
    }

    private function organizationData(Organization $organization): array
    {
        return [
            'id' => $organization->id,
            'name' => $organization->name,
            'slug' => $organization->slug,
            'description' => $organization->description,
            'non_sync_threshold_hours' => $organization->non_sync_threshold_hours,
            'is_default' => $organization->slug === 'default',
            'devices_count' => $organization->devices_count ?? $organization->devices()->whereNull('revoked_at')->count(),
        ];
    }
}
