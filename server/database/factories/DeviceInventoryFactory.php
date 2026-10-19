<?php

namespace Database\Factories;

use App\Models\DeviceInventory;
use App\Models\OsqueryNode;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<DeviceInventory>
 */
class DeviceInventoryFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'device_id' => fn () => OsqueryNode::factory()->create()->device_id,
            'category' => 'system',
            'payload' => [['hostname' => fake()->hostname()]],
            'collected_at' => now(),
        ];
    }
}
