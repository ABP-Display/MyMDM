<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Inertia\Inertia;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $publicUrl = config('mymdm.base_url') ?: config('app.url');
        if (parse_url($publicUrl, PHP_URL_SCHEME) === 'https') {
            URL::forceScheme('https');
        }

        if (app()->runningInConsole()) {
            return;
        }

        Inertia::share('auth_user', fn () => request()->user()?->only(['id', 'name', 'email', 'is_admin', 'is_active']));
        Inertia::share('organization_name', fn () => config('mymdm.organization_name'));

        if (User::query()->exists()) {
            return;
        }

        $email = config('mymdm.bootstrap_admin_email');
        $password = config('mymdm.bootstrap_admin_password');

        if ($email && $password) {
            User::query()->create([
                'name' => 'Admin',
                'is_admin' => true,
                'email' => strtolower($email),
                'password' => $password,
            ]);
        }
    }
}
