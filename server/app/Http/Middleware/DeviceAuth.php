<?php

namespace App\Http\Middleware;

use App\Models\Device;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class DeviceAuth
{
    public function handle(Request $request, Closure $next): Response
    {
        $header = $request->header('Authorization', '');
        if (! str_starts_with($header, 'Bearer ')) {
            abort(401, 'unauthorized');
        }

        $hash = hash('sha256', substr($header, 7));
        $device = Device::query()
            ->where('credential_hash', $hash)
            ->whereNull('revoked_at')
            ->first();

        if (! $device) {
            abort(401, 'unauthorized');
        }

        $request->attributes->set('device', $device);

        return $next($request);
    }
}
