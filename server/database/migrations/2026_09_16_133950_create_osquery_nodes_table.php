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
        Schema::create('osquery_nodes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('device_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignUuid('osquery_enrollment_id')->nullable()->constrained()->nullOnDelete();
            $table->string('credential_hash', 64)->unique();
            $table->string('host_identifier');
            $table->string('host_uuid')->nullable()->index();
            $table->string('version')->nullable();
            $table->unsignedInteger('config_revision')->nullable();
            $table->timestampTz('last_seen_at')->nullable();
            $table->timestampTz('inventory_updated_at')->nullable();
            $table->json('metadata')->nullable();
            $table->timestampsTz();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('osquery_nodes');
    }
};
