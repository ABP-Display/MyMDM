FROM composer:2 AS vendor
WORKDIR /app
COPY server/composer.json server/composer.lock ./
RUN composer install --no-dev --prefer-dist --no-interaction --no-progress --no-scripts

FROM node:24-alpine AS assets
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/resources ./resources
COPY server/vite.config.js ./
RUN npm run build

FROM php:8.3-cli-alpine AS server
WORKDIR /app

RUN apk add --no-cache postgresql-libs bash \
    && apk add --no-cache --virtual .build-deps postgresql-dev \
    && docker-php-ext-install pdo_pgsql \
    && apk del .build-deps \
    && { echo "upload_max_filesize=500M"; echo "post_max_size=525M"; echo "display_errors=Off"; echo "log_errors=On"; } > /usr/local/etc/php/conf.d/mymdm-uploads.ini

COPY server ./
COPY --from=vendor /app/vendor ./vendor
COPY --from=assets /app/public/build ./public/build
COPY server/docker/entrypoint.sh /usr/local/bin/mymdm-entrypoint
RUN chmod +x /usr/local/bin/mymdm-entrypoint \
    && mkdir -p storage/app/private/apks storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 8080
ENTRYPOINT ["mymdm-entrypoint"]

