<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('kiosk_assets', function (Blueprint $table) {
            $table->string('platform', 32)->default('android')->after('type')->index();
        });

        DB::table('kiosk_assets')->where('type', 'ios_app')->update(['platform' => 'ios']);
        DB::table('kiosk_assets')->where('type', 'windows_app')->update(['platform' => 'windows']);
        DB::table('kiosk_assets')->where('type', 'file')->update(['platform' => 'all']);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('kiosk_assets', function (Blueprint $table) {
            $table->dropColumn('platform');
        });
    }
};
