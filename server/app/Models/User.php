<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Models\Concerns\UsesUuid;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'email', 'password', 'is_admin', 'is_active'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    protected $attributes = ['is_admin' => false, 'is_active' => true];

    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable, UsesUuid;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_admin' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function organizations(): BelongsToMany
    {
        return $this->belongsToMany(Organization::class)->withPivot('permissions');
    }

    public function canAccessOrganization(?string $organizationId, string $permission = 'view'): bool
    {
        if (! $this->is_active) {
            return false;
        }
        if ($this->is_admin) {
            return true;
        }
        if (! $organizationId) {
            return false;
        }
        $membership = $this->organizations()->whereKey($organizationId)->first();
        $permissions = json_decode($membership?->pivot->permissions ?? '[]', true);

        return in_array($permission, $permissions, true);
    }
}
