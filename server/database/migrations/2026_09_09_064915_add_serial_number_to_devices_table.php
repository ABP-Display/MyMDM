<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('devices', function (Blueprint $table): void {
            $table->string('serial_number')->nullable()->after('id');
        });

        $knownSerials = [];
        DB::table('devices')->orderByDesc('enrolled_at')->get(['id', 'metrics'])->each(function (object $device) use (&$knownSerials): void {
            $metrics = is_string($device->metrics) ? json_decode($device->metrics, true) : $device->metrics;
            $serial = strtoupper(trim((string) ($metrics['serial'] ?? '')));
            if ($serial === '' || $serial === 'UNKNOWN' || isset($knownSerials[$serial])) {
                return;
            }
            DB::table('devices')->where('id', $device->id)->update(['serial_number' => $serial]);
            $knownSerials[$serial] = true;
        });

        Schema::table('devices', function (Blueprint $table): void {
            $table->unique('serial_number');
        });
    }

    public function down(): void
    {
        Schema::table('devices', function (Blueprint $table): void {
            $table->dropUnique(['serial_number']);
            $table->dropColumn('serial_number');
        });
    }
};
