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
        Schema::table('devices', function (Blueprint $table): void {
            $table->string('platform', 32)->default('android')->after('name')->index();
            $table->string('os_version')->default('')->after('android_version');
        });
        Schema::table('configurations', function (Blueprint $table): void {
            $table->string('platform', 32)->default('android')->after('name')->index();
        });
        Schema::table('agent_releases', function (Blueprint $table): void {
            $table->string('platform', 32)->default('android')->after('id')->index();
            $table->string('original_name')->nullable()->after('version_code');
        });

        DB::table('devices')->where('os_version', '')->update(['os_version' => DB::raw('android_version')]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('agent_releases', function (Blueprint $table): void {
            $table->dropColumn(['platform', 'original_name']);
        });
        Schema::table('configurations', function (Blueprint $table): void {
            $table->dropColumn('platform');
        });
        Schema::table('devices', function (Blueprint $table): void {
            $table->dropColumn(['platform', 'os_version']);
        });
    }
};
