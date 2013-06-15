#!/bin/sh

if [ ! -f config.json ]; then
  cp config.json.template config.json
fi

if [ ! -f log4jsconfig.json ]; then
  cp log4jsconfig.json.template log4jsconfig.json
fi

if [ ! -d logs ]; then
  mkdir logs
fi

if [ ! -d node_modules ]; then
  ./setup.sh
fi

node src/server.js
