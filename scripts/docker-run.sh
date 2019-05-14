#!/bin/bash

# Copyright (C) 2019, Nokia
# Licensed under the BSD 3-Clause License


[ -f apikey.txt ] || { echo >&2 "Please provide your GitHub API key in file apikey.txt. Aborting. " ; exit 1; }

mkdir -p ../datasets
docker run --rm -it -u $UID:$(id -g $UID)  --env http_proxy=$http_proxy --env https_proxy=$https_proxy -v $PWD/apikey.txt:/app/apikey.txt -v $PWD/../datasets:/datasets codecompass_crawler $*
