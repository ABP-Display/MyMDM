<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('agent_releases', 'apk_path')) {
            Schema::table('agent_releases', function (Blueprint $table): void {
                $table->string('apk_path')->nullable()->after('apk_size');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('agent_releases', 'apk_path')) {
            Schema::table('agent_releases', function (Blueprint $table): void {
                $table->dropColumn('apk_path');
            });
        }
    }
};
