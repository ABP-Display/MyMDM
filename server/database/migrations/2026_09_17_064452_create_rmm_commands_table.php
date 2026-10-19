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
        Schema::create('rmm_commands', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('rmm_agent_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type');
            $table->json('payload');
            $table->string('status')->default('pending')->index();
            $table->json('result')->nullable();
            $table->text('error')->nullable();
            $table->timestampTz('expires_at');
            $table->timestampTz('dispatched_at')->nullable();
            $table->timestampTz('finished_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('rmm_commands');
    }
};
