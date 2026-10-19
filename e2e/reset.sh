#!/bin/bash
cd /srv/vm-e2e
ps aux | grep -E "node server.mjs|/postgrest" | grep -v grep | awk '{print $2}' | xargs -r kill
sleep 1
node apply.mjs /home/claude/vizinhomarket >/dev/null
nohup node server.mjs /srv/vm-e2e/postgrest > server.log 2>&1 &
sleep 4
rm -f shots/*.png
