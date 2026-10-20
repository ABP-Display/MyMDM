<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(User::query()->with('organizations')->orderBy('name')->get()->map($this->present(...)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $user = DB::transaction(function () use ($data, $request): User {
            $user = User::query()->create(collect($data)->except('organizations')->all());
            $this->syncAccess($user, $data);
            $this->audit($request, $user, 'USER_CREATED');

            return $user;
        });

        return response()->json($this->present($user->load('organizations')), 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $data = $this->validated($request, $user);
        DB::transaction(function () use ($request, $user, $data): void {
            $admins = User::query()->where('is_admin', true)->where('is_active', true)->lockForUpdate()->get();
            abort_if($request->user()->id === $user->id && (! $data['is_admin'] || ! $data['is_active']), 409, 'You cannot disable or demote your own account.');
            abort_if($admins->contains('id', $user->id) && $admins->count() === 1 && (! $data['is_admin'] || ! $data['is_active']), 409, 'At least one active administrator is required.');
            $attributes = collect($data)->except('organizations')->all();
            if (empty($attributes['password'])) {
                unset($attributes['password']);
            }
            $user->update($attributes);
            $this->syncAccess($user, $data);
            $this->audit($request, $user, 'USER_UPDATED');
        });

        return response()->json($this->present($user->refresh()->load('organizations')));
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        DB::transaction(function () use ($request, $user): void {
            $admins = User::query()->where('is_admin', true)->where('is_active', true)->lockForUpdate()->get();
            abort_if($request->user()->id === $user->id, 409, 'You cannot delete your own account.');
            abort_if($admins->contains('id', $user->id) && $admins->count() === 1, 409, 'At least one active administrator is required.');
            $this->audit($request, $user, 'USER_DELETED');
            $user->delete();
        });

        return response()->json(['ok' => true]);
    }

    private function validated(Request $request, ?User $user = null): array
    {
        $request->merge(['email' => strtolower(trim((string) $request->input('email')))]);

        return $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users')->ignore($user?->id)],
            'password' => [$user ? 'nullable' : 'required', 'string', 'min:12', 'max:128'],
            'is_admin' => ['required', 'boolean'],
            'is_active' => ['required', 'boolean'],
            'organizations' => ['present', 'array'],
            'organizations.*.id' => ['required', 'uuid', 'distinct', 'exists:organizations,id'],
            'organizations.*.permissions' => ['required', 'array', 'min:1'],
            'organizations.*.permissions.*' => ['required', Rule::in(['view', 'create', 'update', 'delete', 'commands'])],
        ]);
    }

    private function syncAccess(User $user, array $data): void
    {
        $memberships = collect($data['organizations'])->mapWithKeys(fn (array $item) => [
            $item['id'] => ['permissions' => json_encode(array_values(array_unique(['view', ...$item['permissions']])))],
        ])->all();
        $user->organizations()->sync($user->is_admin ? [] : $memberships);
    }

    private function present(User $user): array
    {
        return [
            'id' => $user->id, 'name' => $user->name, 'email' => $user->email,
            'is_admin' => $user->is_admin, 'is_active' => $user->is_active,
            'organizations' => $user->organizations->map(fn ($organization) => [
                'id' => $organization->id, 'name' => $organization->name,
                'permissions' => json_decode($organization->pivot->permissions, true),
            ])->values(),
        ];
    }

    private function audit(Request $request, User $user, string $action): void
    {
        AuditLog::query()->create(['user_id' => $request->user()->id, 'action' => $action, 'payload' => ['target_user_id' => $user->id]]);
    }
}
