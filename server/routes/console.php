<?php

use App\Models\User;
use Illuminate\Support\Facades\Artisan;

Artisan::command('mymdm:bootstrap-admin', function () {
    $email = config('mymdm.bootstrap_admin_email');
    $password = config('mymdm.bootstrap_admin_password');

    if (User::query()->exists()) {
        $this->info('Admin user already exists.');

        return self::SUCCESS;
    }

    if (! $email || ! $password) {
        $this->warn('No admin user exists and bootstrap credentials are missing.');

        return self::FAILURE;
    }

    User::query()->create([
        'name' => 'Admin',
        'is_admin' => true,
        'email' => strtolower($email),
        'password' => $password,
    ]);

    $this->info("Admin user created: {$email}");

    return self::SUCCESS;
})->purpose('Create the first MyMDM admin user from environment variables');
