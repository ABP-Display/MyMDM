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
        Schema::table('rmm_enrollments', function (Blueprint $table) {
            $table->string('platform')->default('windows')->after('configuration_id');
            $table->string('architecture')->nullable()->after('platform');
            $table->index(['organization_id', 'platform']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('rmm_enrollments', function (Blueprint $table) {
            $table->dropIndex(['organization_id', 'platform']);
            $table->dropColumn(['platform', 'architecture']);
        });
    }
};
