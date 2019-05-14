#!/usr/bin/env python

# Copyright (C) 2019, Nokia
# Licensed under the BSD 3-Clause License


import dis
import sys
from pprint import pprint
import glob
import json
from tqdm import tqdm
import re


folder = sys.argv[1] if len(sys.argv) > 1 else '.'
language = sys.argv[2] if len(sys.argv) > 2 else 'python'

###################

# Note: method to remove comments in lightweight fashion was copied from:
# ChunMinChang/remove_c_style_comments.py See https://gist.github.com/ChunMinChang/88bfa5842396c1fbbc5b
def commentRemover(text):
    def replacer(match):
        s = match.group(0)
        if s.startswith('/'):
            return " " # note: a space and not an empty string
        else:
            return s
    pattern = re.compile(
        r'//.*?$|/\*.*?\*/|\'(?:\\.|[^\\\'])*\'|"(?:\\.|[^\\"])*"',
        re.DOTALL | re.MULTILINE
    )
    return re.sub(pattern, replacer, text)


##############

#generator helper function
def read_uncomment_lines(folder, ext, split=True, removecomments = True):
    comment_remover = commentRemover if removecomments else (lambda x:x)
    for fname in glob.iglob(folder+'/**/'+ext, recursive=True):
        try:
            with open(fname, 'r', errors='ignore') as fd:
                if split:
                    lines = comment_remover(fd.read()).splitlines()
                else:
                    lines = [comment_remover(fd.read())]
                yield (fname, lines)
        except:
            #print("Skipping problematic file", fname, file=sys.stderr)
            continue


# TODO: remove imports that are very unlikely actual imports
def filter_pretty_imports(imports):
    return imports


def get_elems_idx(tuplelist, idx):
    return list(map(lambda t: t[idx], tuplelist))


def strip_path_prefix(fname, strip=4):
    return "/".join(fname.split("/")[strip:])


##############


def extract_python_imports(folder):
    fileimports = {}

    for fname in glob.iglob(folder+'/**/*.py', recursive=True):
        #print(fname, file=sys.stderr)
        try:
            with open(fname, 'r', errors='ignore') as fd:
                statements = fd.read()
            instructions = dis.get_instructions(statements)
        except:
            #print("Skipping problematic file", fname, file=sys.stderr)
            continue
        importinstrs = [__ for __ in instructions if 'IMPORT' in __.opname]
    
        imports = []
        lastimp = None
        popped = False #remove IMPORT_NAME if followed by IMPORT_STAR or IMPORT_FROM
        for instr in importinstrs:
            if instr.opname == 'IMPORT_NAME': 
                lastimp = instr.argval
                impname = lastimp
                popped = False
            elif instr.opname == 'IMPORT_STAR':
                if not popped:
                    imports.pop()
                    popped = True
                impname = lastimp + ':*'
            else:
                if not popped:
                    imports.pop()
                    popped = True
                impname = lastimp + ':'+instr.argval
        
            imports.append(impname)
    
        fileimports[strip_path_prefix(fname)] = imports
    return fileimports
    


###################


regex_js_require = re.compile(r'require\(["\']([^"\']+)["\']\)')
regex_js_import = re.compile(r'import\s+{?((?!\s+from).)+}?\s+from\s+["\']([^"\']+)["\']')

def extract_javascript_imports(folder):
    fileimports = {}
    for fname, lines in read_uncomment_lines(folder, '*.[jt]s'):
        #print(fname, file=sys.stderr)

        #skip dependent module listings
        if '/node_modules/' in fname:
            continue

        imports = []

        for line in lines:
            if 'require' in line:
                newimports = regex_js_require.findall(line)
                #print(fname, newimports, file=sys.stderr)
                imports.extend(newimports)
            #for the imports, we currently only capture the modules, not the individual from-items    
            if 'import' in line:
                newimports = get_elems_idx(regex_js_import.findall(line), 1)
                #print(fname, newimports, file=sys.stderr)
                imports.extend(newimports)


        fileimports[strip_path_prefix(fname)] = filter_pretty_imports(imports)

    return fileimports




###################

regex_java_import = re.compile(r'(?:^|;)\s*import\s+([^;\s]+)\s*(?=;)')

def extract_java_imports(folder):
    fileimports = {}
    for fname, lines in read_uncomment_lines(folder, '*.java'):
        #print(fname, file=sys.stderr)

        imports = []

        for line in lines:
            if 'import' in line:
                newimports = regex_java_import.findall(line)
                #print(fname, newimports, file=sys.stderr)
                imports.extend(newimports)


        fileimports[strip_path_prefix(fname)] = filter_pretty_imports(imports)

    return fileimports



###################


regex_csharp_using = re.compile(r'(?:^|;)\s*using\s+(?!static\s+)([^;\s]+)\s*(?=;)')
regex_csharp_using_static = re.compile(r'(?:^|;)\s*using\s+static\s+([^;\s]+)\s*(?=;)')

def extract_csharp_imports(folder):
    fileimports = {}
    for fname, lines in read_uncomment_lines(folder, '*.cs'):
        #print(fname, file=sys.stderr)

        imports = []

        for line in lines:
            if 'using' in line:
                newimports = regex_csharp_using.findall(line)
                imports.extend(newimports)
                newimports = regex_csharp_using_static.findall(line)
                imports.extend(newimports)


        fileimports[strip_path_prefix(fname)] = filter_pretty_imports(imports)

    return fileimports


regex_php_simplelist = re.compile(r'([^;\s,]+)\s*(?:as\s+[^\s,;]+)?')
regex_php_complexlist = re.compile(r'(?:^|,)\s*(const\s+|function\s+|)([^;\s,]+)\s*(?:as\s+[^\s,;]+)?\s*(?=,|$)')
regex_php_use_func = re.compile(r'(?:^|;)\s*use\s+function\s+([^;]+)(?=;)')
regex_php_use_const = re.compile(r'(?:^|;)\s*use\s+const\s+([^;]+)(?=;)')
regex_php_use = re.compile(r'(?:^|;)\s*use\s+(?!const|function)([^;]+)(?=;)')

regex_php_use_group_split = re.compile(r'^([^{\s]+)\s*{([^}]+)}')



def extract_php_imports_line(regexfunc, line, appendix):
    impnamelists = regexfunc.findall(line)
    imports = []
    for impnamelist in impnamelists:
        if '{' in impnamelist:
            for groupsplit in regex_php_use_group_split.findall(impnamelist):
               useprefix = groupsplit[0]
               impnames2 = regex_php_complexlist.findall(groupsplit[1])
               #print(impnames2)
               for imptype, impname in impnames2:
                   realappendix = ':'+imptype.rstrip().upper() if imptype != '' else appendix
                   imports.append((useprefix+impname).replace('\\', '/')+realappendix) 
        else:
            impnames = regex_php_simplelist.findall(impnamelist)
            for impname in impnames:
                imports.append(impname.replace('\\', '/')+appendix)
    return imports

def extract_php_imports(folder):
    fileimports = {}
    for fname, lines in read_uncomment_lines(folder, '*.php', split=False):
        #print(fname, file=sys.stderr)

        imports = []

        for line in lines:
            if 'use' in line:
                imports.extend(extract_php_imports_line(regex_php_use_func, line, ':FUNCTION'))
                imports.extend(extract_php_imports_line(regex_php_use_const, line, ':CONST'))
                imports.extend(extract_php_imports_line(regex_php_use, line, ''))


        fileimports[strip_path_prefix(fname)] = filter_pretty_imports(imports)

    return fileimports



###################


regex_ruby_require = re.compile(r'require\s+["\']([^"\']+)["\']')
regex_ruby_require_relative = re.compile(r'require_relative\s+["\']([^"\']+)["\']')

def extract_ruby_imports(folder):
    fileimports = {}
    for fname, lines in read_uncomment_lines(folder, '*.rb', removecomments=False):
        #print(fname, file=sys.stderr)

        imports = []

        commented = False
        for line in lines:
            if commented and line == "=end":
                commented = False
                continue
            if line == "=begin":
                commented = True
                continue
            if 'require' in line:
                impnames = regex_ruby_require.findall(line)
                if len(impnames) > 0:
                    imports.extend(impnames)
            if 'require_relative' in line:
                impnames = regex_ruby_require_relative.findall(line)
                if len(impnames) > 0:
                    imports.extend(list(map(lambda x: "./"+x, impnames)))


        fileimports[strip_path_prefix(fname)] = filter_pretty_imports(imports)

    return fileimports


###################

extraction_functions = {
        'python':       extract_python_imports,
        'javascript':   extract_javascript_imports,
        'java':         extract_java_imports,
        'csharp':       extract_csharp_imports,
        'php':          extract_php_imports,
        'ruby':         extract_ruby_imports,
}


fileimports = extraction_functions.get(language, lambda f:[])(folder)




if len(fileimports) > 0:
    #print(json.dumps(imports, sort_keys=False, indent=2).encode('utf-8')))
    print(json.dumps(fileimports))
