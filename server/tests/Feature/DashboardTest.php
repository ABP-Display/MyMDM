<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_dashboard_reports_operational_and_daily_sync_counts(): void
    {
        Carbon::setTestNow('2026-09-11 12:00:00');

        $this->device('Online', now()->subMinutes(3));
        $this->device('Offline today', now()->subHours(2));
        $this->device('Stale', now()->subDays(2));
        $this->device('Never', null);
        $this->device('Revoked', now(), now());

        $this->actingAs(User::factory()->create())
            ->getJson('/api/v1/dashboard')
            ->assertOk()
            ->assertJsonPath('devices', 4)
            ->assertJsonPath('online', 1)
            ->assertJsonPath('offline', 3)
            ->assertJsonPath('synced_today', 2)
            ->assertJsonPath('not_synced', 2)
            ->assertJsonPath('revoked', 1);

        Carbon::setTestNow();
    }

    private function device(string $name, ?Carbon $lastSeenAt, ?Carbon $revokedAt = null): Device
    {
        return Device::query()->create([
            'name' => $name,
            'credential_hash' => hash('sha256', $name),
            'last_seen_at' => $lastSeenAt,
            'revoked_at' => $revokedAt,
        ]);
    }
}
