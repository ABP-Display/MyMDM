<?php

namespace App\Http\Middleware;

use App\Models\Device;
use App\Models\DeviceGroup;
use App\Models\Organization;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ConsoleAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        abort_unless($user?->is_active, 401, 'This account is disabled.');
        if ($user->is_admin || $request->is('api/v1/auth/me')) {
            return $next($request);
        }
        if ($request->is('api/v1/organizations') && $request->isMethod('GET')) {
            return $next($request);
        }
        if ($request->isMethod('GET') && $request->is('api/v1/kiosk-assets', 'api/v1/agent/*')) {
            abort_unless($user->organizations()->exists(), 403, 'You do not have access to an organization.');

            return $next($request);
        }
        $organizationRoute = $request->is('api/v1/organizations/*');
        abort_unless($organizationRoute || $request->is('api/v1/dashboard', 'api/v1/devices', 'api/v1/devices/*', 'api/v1/device-groups', 'api/v1/device-groups/*'), 403, 'Only administrators can manage users and shared resources.');

        $permission = match (true) {
            $request->is('*/commands', '*/factory-reset', '*/revoke') => 'commands',
            $request->isMethod('GET') => 'view',
            $request->isMethod('DELETE') => 'delete',
            $request->isMethod('POST') && $request->is('api/v1/device-groups') => 'create',
            default => 'update',
        };
        if ($request->is('*/factory-reset', '*/revoke')) {
            $permission = 'delete';
        }
        $organizationId = $request->header('X-Organization-Id');
        if (! $organizationId) {
            $organizationId = $user->organizations()->orderBy('name')->value('organizations.id');
            if ($organizationId) {
                $request->headers->set('X-Organization-Id', $organizationId);
            }
        }
        abort_unless($organizationId && $user->canAccessOrganization($organizationId, 'view'), 403, 'You do not have access to this organization.');
        $resource = $request->route('device') ?? $request->route('group') ?? $request->route('organization');
        if ($resource instanceof Device || $resource instanceof DeviceGroup || $resource instanceof Organization) {
            $resourceOrganizationId = $resource instanceof Organization ? $resource->id : $resource->organization_id;
            abort_unless($resourceOrganizationId && $user->canAccessOrganization($resourceOrganizationId, $permission), 403, 'You do not have permission for this resource.');
        } else {
            abort_unless($user->canAccessOrganization($organizationId, $permission), 403, 'You do not have permission for this action.');
        }
        if ($request->filled('organization_id')) {
            abort_unless($user->canAccessOrganization($request->string('organization_id')->toString(), 'update'), 403, 'You cannot move devices to this organization.');
        }
        if ($request->is('*/configuration')) {
            abort(403, 'Only administrators can assign shared profiles.');
        }

        return $next($request);
    }
}
