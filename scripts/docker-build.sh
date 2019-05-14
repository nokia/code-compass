#!/bin/bash

# Copyright (C) 2019, Nokia
# Licensed under the BSD 3-Clause License


docker build -t codecompass_crawler --build-arg http_proxy=$http_proxy --build-arg https_proxy=$https_proxy .
