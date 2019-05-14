#!/usr/bin/env python

# Copyright (C) 2019, Nokia
# Licensed under the BSD 3-Clause License


import json
import os
import sys

basedir = sys.argv[1] if len(sys.argv) > 1 else '../datasets/python'


maxprojects=10000
gitclone = False

with open('apikey.txt', 'r') as fd:
    APIKEY = fd.read().rstrip()


if not APIKEY:
    print("Please first paste your API key in file apikey.txt!")
    sys.exit(1)

print("APIKEY =", APIKEY)



print('Loading gitGrab.json...')
with open(basedir+'/gitGrab.json', 'rt') as fd:
    gitgrabs = sorted(json.loads(fd.read()), key=lambda x:-x['stars'])
    ngrabs = len(gitgrabs)
    lastds = 0
    downfd = None
    for  i, gitgrab in enumerate(gitgrabs):
            ds = 1 + i//maxprojects
            if ds != lastds:
                print('Creating ds', ds)
                if downfd != None: downfd.close()
                lastds = ds
                fname = basedir+'/crawl_dataset%02d.sh'%ds
                downfd = open(fname, 'w')
                os.chmod(fname, 0o755)
                downfd.write('#!/bin/bash\n\n')
                #downfd.write('[ -f apikey.txt ] || { echo >&2 "Please provide your GitHub API key in file apikey.txt. Aborting. " ; exit 1; }\n\n')
                downfd.write('APIKEY='+APIKEY+'\n')
                downfd.write('echo APIKEY=$APIKEY\n\n')
                downfd.write('function download_git_project\n')
                downfd.write('{\n')
                downfd.write('\tlocal ds=$1\n')
                downfd.write('\tlocal projdir=$2\n')
                downfd.write('\tlocal projname=$3\n')
                downfd.write('\tmkdir -p dataset$ds/$projdir\n')
                if gitclone:
                    downfd.write('\tmkdir -p /tmp/dataset$ds/$projdir\n')
                    downfd.write('\tlocal currdir=$(pwd)\n')
                    downfd.write('\tcd /tmp/dataset$ds/$projdir\n')
                    downfd.write('\tgit clone git://github.com/$projdir/$projname.git &>> $currdir/dataset$ds/git-download.log\n')
                    downfd.write('\ttar -czf $currdir/dataset$ds/$projdir/$projname.tar.gz $projname/\n')
                    downfd.write('\tcd $currdir\n')
                    downfd.write('\trm -rf /tmp/dataset$ds/$projdir\n')
                    downfd.write('\tsleep 1\n')
                else:
                    downfd.write('\t\tfname=dataset$ds/$projdir/$projname.tgz\n')
                    downfd.write('\twhile [ ! -f $fname -a ! -f $fname.error ] ; do\n')
                    downfd.write('\t\tcurl -L "https://api.github.com/repos/$projdir/$projname/tarball?access_token=$APIKEY" 2>/dev/null > $fname\n')
                    downfd.write('\t\tif ! gzip -t $fname 2>/dev/null ; then\n')
                    downfd.write('\t\t\tif grep -q "API Rate Limit Exceeded" $fname ; then\n')
                    downfd.write('\t\t\t\trm $fname\n')
                    downfd.write('\t\t\t\techo "COOLING OFF"\n')
                    downfd.write('\t\t\t\tsleep 60 #cool off\n')
                    downfd.write('\t\t\telse\n')
                    downfd.write('\t\t\t\tmv $fname $fname.error\n')
                    downfd.write('\t\t\t\techo "Skipping project $projdir/$projname"\n')
                    downfd.write('\t\t\t\tbreak\n')
                    downfd.write('\t\t\tfi\n')
                    downfd.write('\t\tfi\n')
                    downfd.write('\t\tsleep 1\n')
                    downfd.write('\tdone\n')
                downfd.write('}\n\n')
            fullprojectname = gitgrab['full_name']
            projectdir = fullprojectname.split('/')[0]
            projectname = "/".join(fullprojectname.split('/')[1:])
            downfd.write('echo "#%d [%d stars] - %s" ; download_git_project %02d %s %s\n' % (i % maxprojects, gitgrab['stars'], projectname,ds,projectdir,projectname))
    downfd.close()
