#!/bin/sh
set -e

# credentials from the compose file
if [ -z "$POCKETBASE_SUPERUSER_EMAIL" ] || [ -z "$POCKETBASE_SUPERUSER_PASSWORD" ]; then
    echo "POCKETBASE_SUPERUSER_EMAIL and POCKETBASE_SUPERUSER_PASSWORD must be set" >&2
    exit 1
fi

# creates account on fresh install, resets its password on every subsequent start
# the if keeps set -e from killing the script before the error below can be shown
if result=$(/pb/pocketbase superuser upsert "$POCKETBASE_SUPERUSER_EMAIL" "$POCKETBASE_SUPERUSER_PASSWORD" 2>&1); then
    echo "$result"
else
    echo "$result" >&2
    echo "superuser setup failed, check POCKETBASE_SUPERUSER_EMAIL and POCKETBASE_SUPERUSER_PASSWORD in your compose file" >&2
    exit 1
fi

exec /pb/pocketbase serve --http=0.0.0.0:8080
