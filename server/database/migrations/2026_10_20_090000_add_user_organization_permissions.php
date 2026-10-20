<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('is_admin')->default(false);
            $table->boolean('is_active')->default(true);
        });
        DB::table('users')->update(['is_admin' => true]);
        Schema::create('organization_user', function (Blueprint $table): void {
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('organization_id')->constrained()->cascadeOnDelete();
            $table->json('permissions');
            $table->primary(['user_id', 'organization_id']);
        });
        DB::table('organizations')->where('slug', 'default')->update(['name' => 'Default']);
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_user');
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn(['is_admin', 'is_active']);
        });
    }
};
