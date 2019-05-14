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
import hashlib


# minimum # imports per source file
minsrcfileimports = 1
# minimum # remaining source files per project
minsrcfiles = 1
#filter import-duplicates?
filterduplicates = True

##########

basedir = sys.argv[1] if len(sys.argv) > 1 else '../datasets/python'

os.makedirs(basedir+'/processed', exist_ok=True)


def load_json_gz(filename):
    with gzip.open(filename, 'r') as fd:
        return json.loads(fd.read())
        
def store_json_gz(filename, data, sort=False):
    with gzip.open(filename, 'w') as fd:
        fd.write(json.dumps(data, sort_keys=sort, indent=2).encode('utf-8'))

def create_hash(fileimports):
    fileimportstring = "|".join(sorted(["|".join(sorted(imports)) for imports in fileimports.values()]))
    m = hashlib.md5()
    m.update(fileimportstring.encode())
    return m.hexdigest()

def dedup_projects(dedupprojectfileimports, projectfileimports):
    newprojectfileimports = {}
    refhashes = set(dedupprojectfileimports.values())
        
    for project, fileimports in projectfileimports.items():
        projecthash = create_hash(fileimports)
        if projecthash not in refhashes:
            dedupprojectfileimports[project] = projecthash
            refhashes.update(projecthash)
            newprojectfileimports[project] = fileimports
              
    return newprojectfileimports
    


dedupprojectfileimports = {}
nrawprojects = 0
ndedupprojects = 0



for rawfname in tqdm(glob.glob(basedir+'/raw/raw-import-ds*.json.gz')):
    projectfileimports = load_json_gz(rawfname)
    #print(len(projectfileimports), "projects in raw dataset", rawfname.split(' /')[-1])

    #filter out srcfiles with too few imports
    projectfileimports = {projectname:{filename:imports for filename, imports in fileimports.items() if len(imports) >= minsrcfileimports} for projectname, fileimports in projectfileimports.items()}

    #filter out empty projects
    projectfileimports = {projectname:fileimports for projectname, fileimports in projectfileimports.items() if len(fileimports) >= minsrcfiles}

    nrawprojects += len(projectfileimports)
    #filter import-duplicate projects
    if filterduplicates:
        projectfileimports = dedup_projects(dedupprojectfileimports, projectfileimports)
    ndedupprojects += len(projectfileimports)

    #print(len(projectfileimports), "projects after filtering")
    store_json_gz(basedir+'/processed/projectfileimports.'+rawfname.split('-')[-1][2:], projectfileimports)

print("Import deduplication:", nrawprojects, "->", ndedupprojects, "projects")
