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
            $table->unsignedSmallInteger('sync_interval_minutes')->default(5);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('device_policies', function (Blueprint $table): void {
            $table->dropColumn('sync_interval_minutes');
        });
    }
};
