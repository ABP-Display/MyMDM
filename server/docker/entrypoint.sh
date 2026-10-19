#!/usr/bin/env sh
set -eu

# Clear generated manifests before Laravel can load development-only providers.
rm -f /app/bootstrap/cache/packages.php /app/bootstrap/cache/services.php /app/bootstrap/cache/config.php

if [ -z "${APP_KEY:-}" ]; then
  APP_KEY="$(php /app/docker/app-key.php)"
  export APP_KEY
fi

php artisan migrate --force --no-interaction
php artisan mymdm:bootstrap-admin --no-interaction
php artisan config:clear --no-interaction
php artisan view:clear --no-interaction

exec php artisan serve --host=0.0.0.0 --port="${PORT:-8080}"
