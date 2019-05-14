#!/bin/bash

# Copyright (C) 2019, Nokia
# Licensed under the BSD 3-Clause License


language=${1:-python}
maxprojects=${2:-0}
minstars=${3:-2}
maxsize=${4:-0} #in kb
usecache=${5:-0}

basedir=../datasets/$language
mkdir -p $basedir

if [ $usecache -eq 0 ] ; then
	rm -rf $basedir/dataset*/
fi

#check for gitGrab file
if [ $usecache -eq 0 -o ! -f $basedir/gitGrab.json ] ; then
	./gitgrab.py $basedir $language fast $maxprojects $minstars $maxsize
fi

#check for download scripts
if [ $usecache -eq 0 -o ! -f $basedir/crawl_dataset01.sh ] ; then
	./create_crawl_scripts.py $basedir
fi

#download all
cd $basedir
for f in $(ls ./crawl_dataset*.sh) ; do
	$f
done
