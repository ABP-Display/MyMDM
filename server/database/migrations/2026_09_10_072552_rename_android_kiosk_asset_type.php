<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        DB::table('kiosk_assets')->where('type', 'app')->update(['type' => 'android_app']);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('kiosk_assets')->where('type', 'android_app')->update(['type' => 'app']);
    }
};
