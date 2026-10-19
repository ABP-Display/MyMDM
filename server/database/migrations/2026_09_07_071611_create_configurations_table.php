<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('configurations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->json('policy');
            $table->text('wifi')->nullable();
            $table->timestampsTz();
        });
        Schema::table('enrollments', function (Blueprint $table) {
            $table->foreignUuid('configuration_id')->nullable()->constrained()->restrictOnDelete();
            $table->timestampTz('expires_at')->nullable()->change();
            $table->text('qr_text')->nullable();
            $table->text('policy_snapshot')->nullable();
            $table->string('apk_sha256', 64)->nullable();
            $table->unsignedInteger('use_count')->default(0);
        });
        Schema::table('devices', function (Blueprint $table) {
            $table->foreignUuid('enrollment_id')->nullable()->constrained()->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('devices', fn (Blueprint $table) => $table->dropConstrainedForeignId('enrollment_id'));
        Schema::table('enrollments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('configuration_id');
            $table->dropColumn(['qr_text', 'policy_snapshot', 'apk_sha256', 'use_count']);
        });
        Schema::dropIfExists('configurations');
    }
};
