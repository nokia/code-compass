#!/usr/bin/env python

# Copyright (C) 2019, Nokia
# Licensed under the BSD 3-Clause License


import json
from github import Github
from tqdm import tqdm
from datetime import date
import pandas as pd
import time
#import traceback
import sys


basedir = sys.argv[1] if len(sys.argv) > 1 else '.'
language = sys.argv[2] if len(sys.argv) > 2 else 'python'
full = True if len(sys.argv) > 3 and sys.argv[3].lower() == 'full' else False
maxprojects = int(sys.argv[4]) if len(sys.argv) > 4 else 0
minstars = int(sys.argv[5]) if len(sys.argv) > 5 else 2
# maxsize (in kb)
maxsize = int(sys.argv[6]) if len(sys.argv) > 6 else 0
maxstars = 1000000


basequery = 'language:'+language 

if language == 'all':
    basequery = ''
elif language == 'javascript':
    basequery = basequery + ' language:typescript'

gitgrab = []

daterange = pd.date_range(date(2008, 1,1), date.today())

outfilename = basedir+('/gitGrabFull.json' if full else '/gitGrab.json')

###################
    


with open('apikey.txt', 'r') as fd:
    APIKEY = fd.read().rstrip()


if not APIKEY:
    print("Please first paste your API key in file apikey.txt!")
    sys.exit(1)

#print("APIKEY =", APIKEY)
# Access by token
g = Github(APIKEY, per_page=100)

###################


def cooldown(g):
    first = True
    remainingthreshold = 100 if full else 50
    while True:
        try:
            core = g.get_rate_limit().core
            search = g.get_rate_limit().search
            if core.remaining >= remainingthreshold and search.remaining >= 5: return
            #TODO: check with resettime
            if first:
                print("Cooling down until:", core.reset.isoformat(), 'UTC', core, search)
            first = False
            time.sleep(60)
        except:
            #traceback.print_exc()
            time.sleep(5)

def search_repos(g, query):
    repos = None
    cooldown(g)
    while repos == None:
        try:
            repos = g.search_repositories(query=query)
        except:
            print("RETRYING REPOS")
            time.sleep(30)
    return repos

def count_repos(g, query):
    repos = search_repos(g, query)
    count = None
    while count == None:
        try:
            count = repos.totalCount
        except:
            print("COUNT ISSUE")
            time.sleep(30)
    return count

def fetch_repos(g, gitgrab, query):
    repos = search_repos(g, query)

    #cut off
    maxnewprojects = maxprojects - len(gitgrab) if maxprojects else 0
    if maxnewprojects < 0:
        return 0

    newgitgrab = None
    while newgitgrab == None:
        try:
            newgitgrab = []
            for idx, repo in tqdm(enumerate(repos)):
                cooldown(g)

                if maxsize and repo.size > maxsize:
                    print("Skipping oversized project", repo.full_name, ":", repo.size, "kb")
                    continue

                license = ""
                try:
                    if full: license = repo.get_license().license.key
                except: 
                    pass
                topics = []
                try:
                    if full: topics = repo.get_topics()
                except:
                    pass
                languages = [repo.language]
                try:
                    if full: languages = repo.get_languages()
                except:
                    pass
        
                newgitgrab.append({
                    'full_name':repo.full_name,
                    'description': repo.description,
                    'topics': topics,
                    'git_url': repo.git_url,
                    'stars': repo.stargazers_count,
                    'watchers': repo.watchers_count,
                    'forks': repo.forks,
                    'created': repo.created_at.isoformat()+'Z',
                    'size': repo.size,
                    'license': license,
                    'language': repo.language,
                    'languages': languages,
                    'last_updated': repo.updated_at.isoformat()+'Z',
                })
                if maxnewprojects and len(newgitgrab) >= maxnewprojects:
                    break;
            gitgrab.extend(newgitgrab)
        except:
            print("Retrying BLOCK")
            newgitgrab = None
            time.sleep(30)
    return len(newgitgrab)

def print_rate_limit(g, d, count):
    try:
        print(d, count, "repos", g.get_rate_limit())
    except:
        print(d, count, "repos")


for idx, d in enumerate(reversed(daterange)):
    query = '%s stars:%d..%d created:%s' % (basequery, minstars, maxstars, d.strftime("%Y-%m-%d"))
    count = count_repos(g, query)
    newcount = 0
    if count < 1000:
        print_rate_limit(g, d, count)
        newcount += fetch_repos(g, gitgrab, query)
    else:
        curminstars = minstars
        curmaxstars = 4
        while curminstars < maxstars:
            query = '%s stars:%d..%d created:%s' % (basequery, curminstars, curmaxstars, d.strftime("%Y-%m-%d"))
            count = count_repos(g, query)
            print("Splitting [%d..%d]: %d"%(curminstars, curmaxstars, count))
            if count >= 1000 and curmaxstars > curminstars:
                curmaxstars -= max(1, (curmaxstars - curminstars)//2)
                continue
            print_rate_limit(g, d, count)
            newcount += fetch_repos(g, gitgrab, query)
            curminstars = curmaxstars + 1
            curmaxstars = maxstars 
 
    #cut off
    if maxprojects and len(gitgrab) >= maxprojects:
        gitgrab = gitgrab[:maxprojects]
        break

    # dump every 7 days 
    if idx % 7 == 6:            
        print(f"DUMPING {len(gitgrab)}, {newcount} NEW")
        with open(outfilename, 'wt') as fd:
            fd.write(json.dumps(gitgrab))

        
# Write final results        
with open(outfilename, 'wt') as fd:
    fd.write(json.dumps(gitgrab))


