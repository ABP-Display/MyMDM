<?php

namespace Database\Factories;

use App\Models\DeviceGroup;
use App\Models\Organization;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<DeviceGroup>
 */
class DeviceGroupFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'organization_id' => Organization::default()->id,
            'name' => fake()->unique()->words(2, true),
        ];
    }
}
