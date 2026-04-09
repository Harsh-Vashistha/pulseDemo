#!/bin/bash
# Start MongoDB if not already running
if pgrep -x "mongod" > /dev/null; then
  echo "MongoDB is already running."
else
  ~/mongodb/bin/mongod \
    --dbpath ~/mongodb/data/db \
    --logpath ~/mongodb/logs/mongod.log \
    --fork \
    --bind_ip 127.0.0.1
  echo "MongoDB started."
fi
