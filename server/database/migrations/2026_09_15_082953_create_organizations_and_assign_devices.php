<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organizations', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->timestampsTz();
        });

        $organizationId = (string) Str::uuid();
        DB::table('organizations')->insert([
            'id' => $organizationId,
            'name' => config('mymdm.organization_name'),
            'slug' => 'default',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Schema::table('device_groups', function (Blueprint $table): void {
            $table->foreignUuid('organization_id')->nullable()->after('id')->constrained()->nullOnDelete();
        });
        Schema::table('devices', function (Blueprint $table): void {
            $table->foreignUuid('organization_id')->nullable()->after('id')->constrained()->nullOnDelete();
        });

        DB::table('device_groups')->update(['organization_id' => $organizationId]);
        DB::table('devices')->update(['organization_id' => $organizationId]);

        Schema::table('device_groups', function (Blueprint $table): void {
            $table->dropUnique('device_groups_name_unique');
            $table->unique(['organization_id', 'name']);
        });
    }

    public function down(): void
    {
        Schema::table('device_groups', function (Blueprint $table): void {
            $table->dropUnique(['organization_id', 'name']);
            $table->unique('name');
        });
        Schema::table('devices', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('organization_id');
        });
        Schema::table('device_groups', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('organization_id');
        });
        Schema::dropIfExists('organizations');
    }
};
