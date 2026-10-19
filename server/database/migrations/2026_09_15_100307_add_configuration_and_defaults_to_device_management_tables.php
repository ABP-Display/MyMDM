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
        Schema::table('devices', function (Blueprint $table): void {
            $table->foreignUuid('configuration_id')->nullable()->after('group_id')->constrained()->nullOnDelete();
        });

        Schema::table('device_policies', function (Blueprint $table): void {
            $table->unsignedTinyInteger('default_volume')->nullable()->after('sync_interval_minutes');
            $table->unsignedTinyInteger('default_brightness')->nullable()->after('default_volume');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('device_policies', function (Blueprint $table): void {
            $table->dropColumn(['default_volume', 'default_brightness']);
        });

        Schema::table('devices', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('configuration_id');
        });
    }
};
