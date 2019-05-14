#!/bin/bash

# Copyright (C) 2019, Nokia
# Licensed under the BSD 3-Clause License


basedir=${1:-../datasets/python} 
language=${2:-python}
shift 2

uname=$(uname)

cwd=$PWD

cd $basedir

# Note: you can also run this in parallel per dataset to speed up

dslist=$*
if [ -z "$dslist" ] ; then
	dslist=$(ls -d dataset*/|sed "s|dataset\([0-9]*\)/|\1|")
fi

case $language in
	python) fileextensions="*.py" ;;
	java) fileextensions="*.java" ;;
	javascript) fileextensions="*.js *.ts" ;;
	csharp) fileextensions="*.cs" ;;
	php) fileextensions="*.php" ;;
	ruby) fileextensions="*.rb" ;;
	*) echo "Unsupported language $language" ; exit 1 ;;
esac

for d in $dslist ; do
	ds=$(printf "%02d" $d)
	echo "[Dataset $ds]"

	find dataset$ds -name "*.tgz" | while read f ; do
		if echo $f|grep -q ".src.tgz" ; then continue ; fi
		srctar=${f%.tgz}.src.tgz
		jsonfile=${f%.tgz}.json
		if [ -f $jsonfile ] ; then echo "Skipping $f" >&2 ; continue ; fi
		echo $f
		tmpdir=$(mktemp -d /tmp/extractsources_XXXXX)
		if [ $uname = "Darwin" ] ; then 
			tar -C $tmpdir -xzf $f $(eval echo "$fileextensions") 2>/dev/null
		else
			tar --wildcards --ignore-case -C $tmpdir -xzf $f $(eval echo "$fileextensions") 2>/dev/null
		fi
		$cwd/extract_imports.py $tmpdir $language >$jsonfile
		if [ ! -s $jsonfile ] ; then
			rm -f $jsonfile
		fi		
		tar -C $tmpdir -czf $srctar .
		rm -rf $tmpdir
	done | tqdm >/dev/null
done
