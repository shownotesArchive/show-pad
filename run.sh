#!/bin/sh

if [ ! -f config.json ]; then
  cp config.json.template config.json
fi

if [ ! -d node_modules ]; then
  ./setup.sh
fi

node src/server.js
