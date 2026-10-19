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
        Schema::table('device_policies', function (Blueprint $table): void {
            $table->string('launcher_background_color', 7)->default('#7E7F7B');
            $table->json('launcher_background')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('device_policies', function (Blueprint $table): void {
            $table->dropColumn(['launcher_background_color', 'launcher_background']);
        });
    }
};
