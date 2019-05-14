#!/bin/bash

# Copyright (C) 2019, Nokia
# Licensed under the BSD 3-Clause License

SCRIPTPATH=$(cd "$(dirname "${BASH_SOURCE[0]}" )" && pwd -P)
cd $SCRIPTPATH

if [ $# -eq 0 -o "$1" = "-h" -o "$1" = "--help" ] ; then
	echo "Usage: $0 <language> [<maxprojects>] [<minstars>] [<maxsize>] [<usecache>]"
	echo
	echo "  <language>      Programming language. Supported languages:"
	echo "                  python, java, javascript, csharp, php, ruby"
	echo "  <maxprojects>   Maximum GitHub projects (default = 0: all)"
	echo "  <minstars>      Min GitHub stars (default = 2)"
	echo "  <maxsize>       Max project size (in kb) (default = 0)"
	echo "  <usecache>      Cache intermediate files/scripts (default = 0)"
	exit 1
fi

language=${1:-python}
maxprojects=${2:-0}
minstars=${3:-2}
maxsize=${4:-0}
usecache=${5:-0}

if [ -z "$SKIP_SETUP" ] ; then 
	echo "[RUNNING SETUP]"
	./setup.sh || exit 1
	echo ; echo
fi

echo "[RUNNING CRAWL]"
./crawl.sh $language $maxprojects $minstars $maxsize $usecache || exit 1
echo ; echo

echo "[RUNNING PREPROCESS]"
./preprocess.sh $language || exit 1
echo ; echo

echo "DONE!"
