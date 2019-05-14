#!/bin/bash

# Copyright (C) 2019, Nokia
# Licensed under the BSD 3-Clause License


language=${1:-python}

basedir=../datasets/$language


echo "[PREPROCESS: EXTRACTING IMPORTS]"
./extract_imports.sh $basedir $language || exit 1
echo ; echo


echo "[PREPROCESS: CREATING RAW IMPORT DATASET]"
./create_import_dataset.py $basedir || exit 1
echo ; echo

echo "[PREPROCESS: CREATING PROCESSED PROJECTFILEIMPORT DATASET]"
./filter_import_dataset.py $basedir || exit 1
echo ; echo
