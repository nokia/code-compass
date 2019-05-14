# Documentation

This folder contains the necessary scripts to crawl and process the raw import datasets.

## Prerequisites

Before starting, you should create a GitHub API key, and put it into apikey.txt.

## Running the scripts

The scripts can be executed both locally, or in a Docker container. Note that in the latter case, the crawled and processed datasets will be stored locally in this folder.

To run it in a container, you first need to locally build the container, by running `./docker-build.sh`. Note that 

To run the scripts locally, you need to execute `./run.sh`; to run it as a container, you need to execute `./docker-run.sh`.

The usage of the run-scripts is as follows. You currently need to provide at least the programming language. Other positional options include the maximum number of projects to crawl (default = all projects), the minimum number of github stars (default = 2), the maximum size of the projects in kb (default=0), and whether to reuse the cached files (default = 0).

```
Usage: ./run.sh <language> [<maxprojects>] [<minstars>] [<maxsize>] [<usecache>]

  <language>      Programming language. Supported languages:
                  python, java, javascript, csharp, php, ruby
  <maxprojects>   Maximum GitHub projects (default = 0: all)
  <minstars>      Min GitHub stars (default = 2)
  <maxsize>       Max project size (in kb) (default = 0)
  <usecache>      Cache intermediate files/scripts (default = 0)
```
