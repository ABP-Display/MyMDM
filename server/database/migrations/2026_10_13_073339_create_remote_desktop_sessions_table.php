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
        Schema::create('remote_desktop_sessions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('rmm_agent_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('technician_name');
            $table->string('desktop_session');
            $table->string('session_user');
            $table->string('status')->default('requested')->index();
            $table->string('token_hash', 64)->nullable();
            $table->timestampTz('request_expires_at');
            $table->timestampTz('expires_at');
            $table->timestampTz('approved_at')->nullable();
            $table->timestampTz('connected_at')->nullable();
            $table->timestampTz('ended_at')->nullable();
            $table->string('error', 500)->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('remote_desktop_sessions');
    }
};
