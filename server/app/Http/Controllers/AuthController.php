<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::query()->where('email', strtolower($credentials['email']))->first();
        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            AuditLog::query()->create([
                'action' => 'LOGIN_FAILED',
                'payload' => ['email' => strtolower($credentials['email'])],
            ]);

            abort(401, 'invalid credentials');
        }

        Auth::login($user);
        $request->session()->regenerate();

        AuditLog::query()->create([
            'user_id' => $user->id,
            'action' => 'LOGIN_SUCCESS',
            'payload' => [],
        ]);

        return ['id' => $user->id, 'email' => $user->email];
    }

    public function logout(Request $request)
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return ['ok' => true];
    }

    public function me(Request $request)
    {
        return [
            'id' => $request->user()->id,
            'email' => $request->user()->email,
            'version' => config('mymdm.version'),
        ];
    }
}
