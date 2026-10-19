<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The initial schema may already be recorded under a previous migration name.
        $tables = ['users', 'sessions', 'enrollments', 'devices', 'device_policies', 'device_policy_status', 'audit_logs', 'agent_releases'];
        $existing = array_filter($tables, fn (string $table): bool => Schema::hasTable($table));
        if (count($existing) === count($tables)) {
            return;
        }
        if ($existing !== []) {
            throw new RuntimeException('The initial MyMDM schema is incomplete. Restore the missing tables before migrating.');
        }

        Schema::create('users', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('name')->default('Admin');
            $table->string('email')->unique();
            $table->timestampTz('email_verified_at')->nullable();
            $table->string('password');
            $table->rememberToken();
            $table->timestampsTz();
        });

        Schema::create('sessions', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->foreignUuid('user_id')->nullable()->index()->constrained()->nullOnDelete();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });

        Schema::create('enrollments', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('token_hash')->unique();
            $table->string('status')->index();
            $table->timestampTz('expires_at');
            $table->timestampTz('used_at')->nullable();
            $table->uuid('device_id')->nullable();
            $table->timestampTz('created_at')->useCurrent();
        });

        Schema::create('devices', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('name')->default('Android device');
            $table->string('manufacturer')->default('');
            $table->string('model')->default('');
            $table->string('android_version')->default('');
            $table->integer('sdk_version')->default(0);
            $table->string('agent_version')->default('');
            $table->string('credential_hash')->unique();
            $table->timestampTz('last_seen_at')->nullable();
            $table->timestampTz('enrolled_at')->useCurrent();
            $table->timestampTz('revoked_at')->nullable();
            $table->timestampsTz();
        });

        Schema::table('enrollments', function (Blueprint $table): void {
            $table->foreign('device_id')->references('id')->on('devices')->nullOnDelete();
        });

        Schema::create('device_policies', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('device_id')->unique()->constrained()->cascadeOnDelete();
            $table->integer('revision')->default(1);
            $table->boolean('kiosk_enabled')->default(false);
            $table->string('kiosk_type')->default('web');
            $table->text('url')->default('');
            $table->json('allowed_origins')->default('[]');
            $table->string('orientation')->default('auto');
            $table->boolean('keep_screen_on')->default(true);
            $table->string('admin_pin_hash')->nullable();
            $table->timestampsTz();
        });

        Schema::create('device_policy_status', function (Blueprint $table): void {
            $table->foreignUuid('device_id')->primary()->constrained()->cascadeOnDelete();
            $table->integer('revision');
            $table->string('status');
            $table->text('error_message')->nullable();
            $table->timestampTz('applied_at')->nullable();
        });

        Schema::create('audit_logs', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUuid('device_id')->nullable()->constrained()->nullOnDelete();
            $table->string('action');
            $table->json('payload')->default('{}');
            $table->timestampTz('created_at')->useCurrent()->index();
        });

        Schema::create('agent_releases', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('version');
            $table->integer('version_code');
            $table->string('apk_sha256');
            $table->unsignedBigInteger('apk_size');
            $table->string('apk_path')->nullable();
            $table->string('download_url');
            $table->boolean('active')->default(true);
            $table->timestampsTz();
        });
    }

    public function down(): void
    {
        if (DB::table('migrations')->where('migration', 'like', '2026_09_04_000000_%')->where('migration', '!=', '2026_09_04_000000_create_mymdm_tables')->exists()) {
            return;
        }

        Schema::dropIfExists('agent_releases');
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('device_policy_status');
        Schema::dropIfExists('device_policies');
        Schema::table('enrollments', fn (Blueprint $table) => $table->dropForeign(['device_id']));
        Schema::dropIfExists('devices');
        Schema::dropIfExists('enrollments');
        Schema::dropIfExists('sessions');
        Schema::dropIfExists('users');
    }
};
