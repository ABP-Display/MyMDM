<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('devices', function (Blueprint $table): void {
            $table->unsignedInteger('agent_version_code')->default(0);
            $table->unsignedTinyInteger('battery_level')->nullable();
            $table->boolean('battery_charging')->nullable();
            $table->unsignedTinyInteger('volume_level')->nullable();
            $table->unsignedTinyInteger('brightness_level')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('devices', function (Blueprint $table): void {
            $table->dropColumn([
                'agent_version_code',
                'battery_level',
                'battery_charging',
                'volume_level',
                'brightness_level',
            ]);
        });
    }
};
