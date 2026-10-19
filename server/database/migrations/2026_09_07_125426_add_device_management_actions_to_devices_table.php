<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('devices', function (Blueprint $table): void {
            $table->softDeletesTz();
            $table->uuid('reset_id')->nullable();
            $table->string('reset_status')->nullable();
            $table->text('reset_error')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('devices', function (Blueprint $table): void {
            $table->dropSoftDeletes();
            $table->dropColumn(['reset_id', 'reset_status', 'reset_error']);
        });
    }
};
