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
        Schema::create('osquery_queries', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('osquery_node_id')->constrained()->cascadeOnDelete();
            $table->string('catalogue_key');
            $table->text('sql');
            $table->string('status')->default('pending')->index();
            $table->json('result')->nullable();
            $table->text('error')->nullable();
            $table->timestampTz('expires_at');
            $table->timestampTz('sent_at')->nullable();
            $table->timestampTz('finished_at')->nullable();
            $table->timestampsTz();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('osquery_queries');
    }
};
