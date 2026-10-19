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
        Schema::create('kiosk_assets', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('type', 16)->index();
            $table->string('name');
            $table->string('package_name')->nullable()->index();
            $table->string('version_name')->nullable();
            $table->unsignedBigInteger('version_code')->nullable();
            $table->string('source', 32)->default('upload');
            $table->text('source_url')->nullable();
            $table->string('original_name');
            $table->string('mime_type');
            $table->char('sha256', 64)->unique();
            $table->unsignedBigInteger('size_bytes');
            $table->string('storage_path');
            $table->timestampsTz();
            $table->softDeletesTz();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('kiosk_assets');
    }
};
