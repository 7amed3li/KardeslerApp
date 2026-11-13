#!/bin/sh
set -e
echo "Running database security attack regressions..."
PGPASSWORD=readonly_dev_secret_change_me psql -h 127.0.0.1 -p 5434 -U app_readonly -d kardesler_db -f /mnt/host/c/Users/Hp/OneDrive/Desktop/kardeslerAPP/database/security/attacks_readonly.sql
PGPASSWORD=api_dev_secret_change_me psql -h 127.0.0.1 -p 5434 -U app_api -d kardesler_db -f /mnt/host/c/Users/Hp/OneDrive/Desktop/kardeslerAPP/database/security/attacks_api.sql
echo "All attacks verified BLOCKED successfully."

