#!/usr/bin/env python

# Copyright (C) 2019, Nokia
# Licensed under the BSD 3-Clause License


import gzip
import json
import glob
from tqdm import tqdm
import re
import sys
import os

basedir = sys.argv[1] if len(sys.argv) > 1 else '../datasets/python'

os.makedirs(basedir+'/raw', exist_ok=True)

def dump_ds(projectfileimports, dsidx):
    with gzip.open(basedir+'/raw/raw-import-ds%02d.json.gz'%dsidx, 'w') as fd:
        fd.write(json.dumps(projectfileimports, sort_keys=True, indent=2).encode('utf-8'))


def load_ds(dsidx):
    projectfileimports = {}
    for p in tqdm(glob.iglob(basedir+'/dataset%02d/**/*.json'%dsidx, recursive=True)):
        projectname = p[:-5]
        try:
            with open(p, 'r') as fd:
                projectfileimports[projectname] = json.loads(fd.read())
        except:
            print('Problem with', p)
    return projectfileimports


dsidx = 1
while True:
    if not os.path.isdir(basedir+"/dataset%02d/"%dsidx):
        #print("Folder dataset%02d does not exist"%dsidx, file=sys.stderr)
        sys.exit(0)

    print("Loading ds",dsidx)
    projectfileimports = load_ds(dsidx)
    print("Dumping ds",dsidx)
    dump_ds(projectfileimports, dsidx)
    
    dsidx += 1

