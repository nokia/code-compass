#!/bin/bash

# Copyright (C) 2019, Nokia
# Licensed under the BSD 3-Clause License


PYTHON=python3
PIP=pip
JUPYTER=jupyter

#enable sudo in case pip requires root privileges
SUDO=
#SUDO=sudo

####

command -v $PYTHON >/dev/null 2>&1 || { echo >&2 "Cannot find $PYTHON. Aborting." ; exit 1; }
command -v $PIP >/dev/null 2>&1 || { echo >&2 "Cannot find $PIP. Aborting." ; exit 1; }


$SUDO $PIP install pygithub tqdm pandas dis
echo

[ -f apikey.txt ] || { echo >&2 "Please provide your GitHub API key in file apikey.txt. Aborting. " ; exit 1; }

echo "Setup complete."
