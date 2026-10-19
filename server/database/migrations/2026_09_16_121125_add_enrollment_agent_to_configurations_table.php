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
        Schema::table('configurations', function (Blueprint $table) {
            $table->string('enrollment_agent_source')->default('active');
            $table->foreignUuid('enrollment_agent_release_id')->nullable()->constrained('agent_releases')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('configurations', function (Blueprint $table) {
            $table->dropConstrainedForeignId('enrollment_agent_release_id');
            $table->dropColumn('enrollment_agent_source');
        });
    }
};
