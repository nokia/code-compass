/**
 * VSCode plugin for Code-Compass (https://www.bell-labs.com/code-compass).
 * Powered by import2vec (https://arxiv.org/abs/1904.03990).
 *
 * Copyright (C) 2019, Nokia
 * Licensed under the BSD 3-Clause License 
 * 
 * Author: Bart Theeten (bart.theeten@nokia-bell-labs.com)
 * Date: May 2019
 **/
'use strict';

import * as vscode from 'vscode';
import { URL } from 'url';
const fs = require('fs');
const uuid = require('uuid/v4');
const xml2js = require('xml2js');

const HttpsProxyAgent = require('https-proxy-agent');

let SUPPORTED_FILE_TYPES : Array<string> = ['.java', '.js', '.py', '.xml', '.json', '.txt'];

var proxyConfig;
var config;
var USER_KEY:string;           // anonymous identification of the user
var PROXY:string;

var PROTOCOL = '';
var HOSTNAME = '';
var PORT = 0;
var serverURL;
var VERSION = vscode.extensions.getExtension('NokiaBellLabs.code-compass').packageJSON.version;

var protocol;
var agent;

// Track currently webview panel
let currentPanel: vscode.WebviewPanel | undefined = undefined;

var extensionPath : string;
var editor : any = vscode.window.activeTextEditor;  // the editor from which codeCompass was launched
var language : string = 'java';
var ctx : string[] = [];

var suggestCache = {};    // map from suggested module to list of raw modules (used for highlighting)

var snippets: {};
    
let error = null;    


// Initialize all parameters. Must be re-loaded when the configuration has changed.
function init() {
    proxyConfig = vscode.workspace.getConfiguration('http');
    config = vscode.workspace.getConfiguration('code-compass');
    
    console.log("Proxy: " + JSON.stringify(proxyConfig));
    console.log("Configuration: " + JSON.stringify(config));
    
    PROXY = proxyConfig.proxy;
    
    if (config.url !== "") {  // specifying a URL overrides DEPLOYMENT settings
        var u = new URL(config.url);
        PROTOCOL = u.protocol;
        HOSTNAME = u.hostname;
        console.log("PROTOCOL:", PROTOCOL);
        console.log("PORT", u.port);
        PORT = parseInt(u.port) || (PROTOCOL === 'http:' ? 80 : 443);
    }
    else {
        PROTOCOL = 'https:';
        HOSTNAME = 'www.code-compass.com';
        PORT = 443;
    }
    
    serverURL = `${PROTOCOL}//${HOSTNAME}:${PORT}`;
        
    console.log("SETTINGS:");
    console.log("  - backend URL: " + serverURL);
    console.log("  - proxy:       " + PROXY ? PROXY : "no proxy");
    console.log("  - version:     " + VERSION);
    
    protocol = (PROTOCOL === 'https:') ? require('https') : require('http');
    agent = (PROXY && PROXY!=="") ? new HttpsProxyAgent(PROXY) : undefined;    
}
init();

// register for configuration changes
vscode.workspace.onDidChangeConfiguration(() => {
    console.log("\n\n*** CONFIGURATION CHANGED => RELOADING ***\n\n");
    init();
    // since serverURL is passed in the webview content HTML, we must reload it
    if (currentPanel) {
        currentPanel.webview.html = getWebViewContent();
    }
});

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    console.log("\n\n=========");
    console.log(" ACTIVATE ");
    console.log("=========\n\n");

    if (context.globalState.get("userKey")) {
        console.log("USER = " + context.globalState.get("userKey"));
    } else {
        context.globalState.update("userKey", uuid());
        console.log("GENERATING USER KEY:", context.globalState.get("userKey"));
    }
    USER_KEY = context.globalState.get("userKey");
    extensionPath = context.extensionPath;

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Extension "codeCompass-plugin" is now active!');

    vscode.window.onDidChangeActiveTextEditor(edit => {
        console.log("DID CHANGE ACTIVE TEXT EDITOR: " + edit.document.fileName);
        editor = edit;
        onGetContext();
    });

    // get snippets from server
    getRequest('/getSnippets/java', (err, data) => {
        if (err) {
            console.error("Could not load snippets from server");
            let errMsg = `Failed to communicate with server. Please verify that you can reach ${serverURL}. You may need to configure a proxy in Code > Preferences > Settings, key = http.proxy`;
            error = errMsg;
        } else {
            console.log("Got " + Object.keys(data).length + " snippets from server");
            snippets = data;
            console.log("SNIPPETS = " + JSON.stringify(snippets, null, 2));
        }
    });

    let disposable = vscode.commands.registerCommand('extension.showCodeCompass', () => {

        const columnToShowIn = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
        if (currentPanel) {
            // If we already have a panel, show it in the target column
            currentPanel.reveal(columnToShowIn);
        } else {
            // Create and show a new webview
            currentPanel = vscode.window.createWebviewPanel(
                'codeCompass', // Identifies the type of the webview. Used internally
                "Code Compass", // Title
                -2, // View Column Beside
                { 
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            // Reset when the current panel is closed
            currentPanel.onDidDispose(() => {
                currentPanel = undefined;
            }, null, context.subscriptions);

            if (error) {
                console.log("showing error page");
                currentPanel.webview.html = getErrorView(error);
            } else {
                console.log("loading regular page");
                currentPanel.webview.html = getWebViewContent();
            }

            // Handle messages from the webview
            currentPanel.webview.onDidReceiveMessage(message => {
                console.log("Received message from webView: " + JSON.stringify(message));
                switch (message.command) {
                    case 'alert':
                        vscode.window.showErrorMessage(message.text);
                        return;
                    case 'feedback':
                        postRequest(`/feedback?userKey=${USER_KEY}`, message.data);        
                        return;
                    case 'getContext':
                        // Send a message to our webview.
                        onGetContext();
                        return;
                    case 'setLanguage':
                        language = message.language;
                        return;
                    case 'getSuggestions':
                        getModulesForIntent(message.intent);
                        return;
                    case 'getModulesForFilter':
                        getModulesForFilter(message.context, message.intent, message.filter);
                        return;
                    case 'getNearestCategories':
                        getNearestCategories(message.context, message.num);
                        return;
                    case 'getFilteredNearestCategories':
                        getFilteredNearestCategories(message.context, message.filter, message.num);
                        return;
                    case 'getIntents':
                        getRequest(`/intents/${message.language}`, (err, intents) => {
                            if (err) {
                                console.error("Couldn't download intent list: " + JSON.stringify(err));
                            } else {
                                console.log("Downloaded intents: " + JSON.stringify(intents));
                                currentPanel.webview.postMessage({ command: 'setIntentsForLanguage', intents: intents, language: message.language });
                            }
                        });
                        return;
                    case 'getLibs':
                        getRequest(`/libs/${message.language}`, (err, libs) => {
                            if (err) {
                                console.error(`Couldn't download library list for ${message.language}: ${JSON.stringify(err)}`);
                            } else {
                                console.log(`${libs.total} libs downloaded`);
                                currentPanel.webview.postMessage({ command: 'setLibsForLanguage', libs: libs.libs, language: message.language });
                            }
                        });
                        return;
                    case 'openURL':
                        console.log("Opening URL in default browser: " + message.url);
                        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(message.url));
                        return;
                    case 'showMainView':
                        console.log("Showing main view");
                        currentPanel.webview.html = getWebViewContent();
                        return;
                    case 'tryAgain':
                        console.log("Trying to connect to server...");
                        getRequest('/getSnippets/java', (err, data) => {
                            if (err) {
                                console.log("Still failed to connect...");
                                currentPanel.webview.postMessage({ msg: 'disconnected' });
                            } else {
                                error = null;
                                snippets = data;
                                console.log("Connection ok");
                                currentPanel.webview.postMessage({ msg: 'connected' });            
                            }
                        });
                        return;
                    default:
                        console.error("Unsupported command:", message.command);
                }
            }, undefined, context.subscriptions);
        }
    });

    context.subscriptions.push(disposable);
}

function onGetContext() {
    getActiveContext((c, l) => {
        ctx = c;
        language = l;
        console.log("context, language =", ctx, language);
        if (!currentPanel) {
            console.error("NO CURRENT PANEL");
            return;
        }
        if (l === 'unsupported') {
            console.log("No context: unsupported file extension.");
            currentPanel.webview.postMessage({ command: 'setStatus', error: true, msg: "Please select a supported file type (.java, .js, .py or pom.xml, package.json or requirements.txt) in another editor pane.<p><p>You can also browse the supported ecosytems by clicking one of the supported language icons."});
            return;
        } else if (l === 'no_editor') {
            currentPanel.webview.postMessage({ command: 'setStatus', error: true, msg: "Code-Compass works best when it sits alongside an active editor pane containing a supported source file (.java, .js, .py or pom.xml, package.json or requirements.txt). So please use split-screen and select a supported file type in the other pane.<p><p>You can also browse the supported ecosytems by clicking one of the supported language icons."});
            return;
        }
        let fileName = editor.document.fileName;
        if (fileName.includes('/')) {
            fileName = fileName.substr(fileName.lastIndexOf('/')+1);
        } else if (fileName.includes('\\')) {
            fileName = fileName.substr(fileName.lastIndexOf('\\')+1);
        }
        let msg = `Scanned ${ctx.length} ${language.toUpperCase()} project dependencies in ${fileName}. `;
        currentPanel.webview.postMessage({ command: 'setStatus', msg: msg });
        console.log("Setting context:", ctx);
        currentPanel.webview.postMessage({ command: 'setContext', context: ctx, language: l });
    });
}

function getNearestCategories(ctx, num) {
    postRequest(`/nearestCategories/${language}/${num}`, ctx, (err, result) => {
        console.log("CONTEXT:", ctx);
        if (err) {
            console.log("ERROR - getNearestCategories: " + JSON.stringify(err));
            currentPanel.webview.postMessage({ 
                command: 'setNearestCategories', 
                categories: [], 
                nearestSuggestions: []
            }).then(() => console.log("getNearestCategories ERROR sent"), (err) => console.error(JSON.stringify(err)));
        } else {
            console.log(`nearest categories are: ${JSON.stringify(result.cats)}`);
            console.log(`nearest libraries are: ${JSON.stringify(result.nearestLibs)}`);
            currentPanel.webview.postMessage({ 
                command: 'setNearestCategories', 
                categories: result.cats, 
                nearestSuggestions: result.nearestLibs,
            }).then(() => console.log("getNearestCategories sent"), (err) => console.error(JSON.stringify(err)));
        }
    });
}

function getFilteredNearestCategories(ctx, filter, num) {
    postRequest(`/filteredNearestCategories/${language}/${num}`, {context: ctx, filter: filter}, (err, result) => {
        console.log("CONTEXT:", ctx);
        if (err) {
            console.log("ERROR - getNearestCategories: " + JSON.stringify(err));
            currentPanel.webview.postMessage({ 
                command: 'setNearestCategories', 
                categories: [], 
                nearestSuggestions: []
            }).then(() => console.log("getNearestCategories ERROR sent"), (err) => console.error(JSON.stringify(err)));
        } else {
            console.log(`nearest categories are: ${JSON.stringify(result.cats)}`);
            console.log(`nearest libraries are: ${JSON.stringify(result.nearestLibs)}`);
            currentPanel.webview.postMessage({ 
                command: 'setNearestCategories', 
                categories: result.cats, 
                nearestSuggestions: result.nearestLibs,
            }).then(() => console.log("getNearestCategories sent"), (err) => console.error(JSON.stringify(err)));
        }
    });
}

function getModulesForIntent(intent) {
    intent = intent.toLowerCase().replace(/ /g, '_');
    console.log('intent = ' + intent);
    postRequest(`/searchByIntent/${language}`, {context: ctx, intent: intent}, (err, mods) => {
        if (err) {
            console.log("ERROR - getModulesForIntent:", err);
            currentPanel.webview.postMessage({
                command: 'setSuggestions', 
                suggestions: mods.filtered, 
                rawSuggestions: mods.raw
            }).then(() => console.log("setSuggestions ERROR sent"), (err) => console.error(JSON.stringify(err)));
        } else {
            console.log(`closest modules for intent ${intent}`);
            suggestCache = {};
            mods.filtered.forEach(mod => suggestCache[mod.module] = mods.raw.filter(m => (m.startsWith(mod.module + ':') || m === mod.module)));
            mods.filtered = mods.filtered.map(mod => {
                mod.snippet = snippets[mod.module];
                return mod;
            });
            console.log("sending setSuggestions:", mods.filtered);
            currentPanel.webview.postMessage({ 
                command: 'setSuggestions', 
                suggestions: mods.filtered, 
                rawSuggestions: mods.raw
            }).then(() => console.log("setSuggestions sent"), (err) => console.error(JSON.stringify(err)));
        }
    });
}

function getModulesForFilter(ctx, intent, filter) {
    intent = intent.toLowerCase().replace(/ /g, '_');
    console.log('intent = ' + intent);
    postRequest(`/searchByIntent/${language}`, {context: ctx, intent: intent, filter:filter}, (err, mods) => {
        if (err) {
            console.log("ERROR - getModulesForIntent:", err);
            currentPanel.webview.postMessage({
                command: 'setSuggestions', 
                suggestions: mods.filtered, 
                rawSuggestions: mods.raw
            }).then(() => console.log("setSuggestions ERROR sent"), (err) => console.error(JSON.stringify(err)));
        } else {
            console.log(`closest modules for intent ${intent}`);
            suggestCache = {};
            mods.filtered.forEach(mod => suggestCache[mod.module] = mods.raw.filter(m => (m.startsWith(mod.module + ':') || m === mod.module)));
            mods.filtered = mods.filtered.map(mod => {
                mod.snippet = snippets[mod.module];
                return mod;
            });
            console.log("sending setSuggestions:", mods.filtered);
            currentPanel.webview.postMessage({ 
                command: 'setSuggestions', 
                suggestions: mods.filtered, 
                rawSuggestions: mods.raw
            }).then(() => console.log("setSuggestions sent"), (err) => console.error(JSON.stringify(err)));
        }
    });
}

function getModulesForPackages(packages, callback) {
    postRequest(`/mapping/${language}/modulesForPackages`, packages, (err, mods) => {
        console.log(`modules for packages ${JSON.stringify(packages)} are: ${JSON.stringify(mods)}`);
        if (err) {
            console.log("ERROR - getModulesForPackages: " + JSON.stringify(err));
            callback(err, null);
        } else {
            callback(null, mods);
        }
    });
}

function setLanguage(lang) {
    language = lang;
    console.log("Language set to " + language);
}

function getFileExtension(filename) {
    return filename.toLowerCase().substring(filename.lastIndexOf('.'));
}

function isSupportedFileExtension(ext) {
    console.log("File extension: " + ext);
    return SUPPORTED_FILE_TYPES.indexOf(ext) !== -1;
}

// calculates the package-level context libraries in the active editor
function getActiveContext(callback) {
    console.log("Getting context...");
    if (vscode.window.visibleTextEditors.length === 0) {
        console.log("No editor");
        callback([], 'no_editor'); // No open text editor
        return;
    }
    if (!editor) {
        editor = vscode.window.activeTextEditor || vscode.window.visibleTextEditors[0];
    }
    let ext = getFileExtension(editor.document.fileName);
    console.log("Active editor extension: " + ext);
    if (!isSupportedFileExtension(ext)) {
        console.log("Extension " + ext + " not supported");
        // fallback to first visible editor
        editor = vscode.window.visibleTextEditors[0];
    }
    let doc = editor.document;
    console.log("Getting active context from " + doc.fileName);
    ext = getFileExtension(doc.fileName);
    if (!isSupportedFileExtension(ext)) {
        console.log("Extension " + ext + " not supported");
        callback([], 'unsupported');
        return;
    }
    let str = doc.getText();
    let imps : string[] = [];

    switch(ext) {
        case ".java": 
            imps = parseJava(str);
            getModulesForPackages(imps, (err, mods) => {
                if (err) {
                    console.error("ERROR mapping packages to modules:", err);
                    callback([], language);
                } else {
                    console.log("Got modules for packages:", mods);
                    callback(mods, language);
                }
            }); 
            return;
        case ".js" : imps = parseJavaScript(str); break;
        case ".py" : imps = parsePython(str); break;
        case ".xml" : imps = parsePomXml(str); break;
        case ".json": imps = parsePackageJson(str); break;
        case ".txt": imps = parseRequirementsTxt(str); break;
        default:
            console.error("No parser for filetype " + ext);
    }
    callback(imps, language);
}

function parseJava(str) {
    setLanguage('java');
    var regex = /^\s*import ([^;\s]+)\s*;/gm;
    let lines = str.split(/[\n\r]/);
    let m: any;
    var imps : string[] = [];
    let pos = -1;
    while ((m = regex.exec(str)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (m.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        m.forEach((match: string, groupIndex: number) => {
            if (groupIndex > 0) {
                let packageImp = match.substring(0, match.lastIndexOf('.'));
                if (imps.indexOf(packageImp) === -1) {
                    imps.push(packageImp);
                }
            } else {
                pos = m.index;
            }
        });
    }
    if (imps.length === 0) {
        vscode.window.showWarningMessage("No import statements found in active editor");
        return [];
    } else {
        return imps;
    }
}

function parseJavaScript(str) {
    setLanguage('js');
    var regexs = [/require\(["']([^"']+)["']\)/gm, /import\s+{?((?!\s+from).)+}?\s+from\s+["']([^"']+)["']/gm];
    const acceptedFirstCharacter = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@";
    let m: any;
    var imps : string[] = [];
    for (var i in regexs) {
        let regex = regexs[i];
        while ((m = regex.exec(str)) !== null) {
            if (m.index === regex.lastIndex) {
                regex.lastIndex++;
            }
            m.forEach((match, groupIndex) => {
                if (groupIndex > 0) {
                    if (acceptedFirstCharacter.includes(match[0]) && imps.indexOf(match) === -1) {
                        imps.push(match);
                    }
                }
            });
        }
    }
    return imps;
}

function parsePython(str) {
    setLanguage('python');
    var regex = /^\s*import\s+(.+)$/gm;
    let m: any;
    var imps : string[] = [];
    while ((m = regex.exec(str)) !== null) {
        if (m.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        m.forEach((match, groupIndex) => {
            if (groupIndex > 0) {
                let parts = match.split(' as ');
                let impps = parts[0].split(',');
                impps.forEach(imp => {
                    imp = imp.trim();
                    imp = imp.split('.')[0];
                    if (imps.indexOf(imp) === -1) {
                        imps.push(imp);
                    }
                });
            }
        });
    }
    regex = /^\s*from\s+([\w\.]+)\simport\s(.+)$/gm;
    let from : string;
    while ((m = regex.exec(str)) !== null) {
        if (m.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        m.forEach((match, groupIndex) => {
            if (groupIndex === 1) {
                from = match;
            } else if (groupIndex === 2) {
                let parts = match.split(' as ');
                let impps = parts[0].split(',');
                impps.forEach(imp => {
                    imp = from;
                    imp = imp.split('.')[0];
                    if (imps.indexOf(imp) === -1) {
                        imps.push(imp);
                    }
                });
            }
        });
    }
    return imps;
}

function parsePomXml(str) {
    console.log("here2");
    setLanguage('java');
    let imps : string[] = [];
    let json : string = xml2js.parseString(str, (err, result) => {
        if (err) {
            console.error(err);
        } else {
            let deps = result.project.dependencies[0].dependency;
            deps.forEach(dep => {
                let imp = dep.groupId[0] + ":" + dep.artifactId[0];
                console.log("POM dependency: " + imp);
                imps.push(imp);
            });
        }
    });
    return imps;
}

function parsePackageJson(str) {  // parses a package.json file
    let imps : string[] = [];
    try {
        let obj = JSON.parse(str);
        let deps = obj.dependencies;
        if (deps) {
            imps = Object.keys(deps);
        }
        console.log("parseJson: dependencies = " + JSON.stringify(imps));
        setLanguage('js');
    } catch (e) {
        console.log("ERROR parsing JSON file: " + JSON.stringify(e));
    }
    return imps;
}

function parseRequirementsTxt(str) {  // parses a package.json file
    var imps : string[] = [];
    try {
        const regex = /^(\w+)[=<>]?/gm;
        let m : any;
        while ((m = regex.exec(str)) !== null) {
            if (m.index === regex.lastIndex) {
                regex.lastIndex++;
            }
            m.forEach((match, groupIndex) => {
                if (groupIndex > 0) {
                    console.log(`Found match, group ${groupIndex}: ${match}`);
                    imps.push(match);
                }
            });
        }
        console.log("parseRequirementsTxt: dependencies = " + JSON.stringify(imps));
        setLanguage('python');
    } catch (e) {
        console.log("ERROR parsing TXT file: " + JSON.stringify(e));
    }
    return imps;
}


function getWebViewContent() {
    let htmlContent = '' + fs.readFileSync(extensionPath + '/codeCompass.html');
    htmlContent = htmlContent.replace(/\$\$\{serverURL\}/g, serverURL);
    let cssContent = '' + fs.readFileSync(extensionPath + '/codeCompass.css');
    let pos = htmlContent.indexOf('</head>');
    htmlContent = htmlContent.substring(0,pos-1) + '<style>' + cssContent + '</style>' + htmlContent.substring(pos);
    return htmlContent;
}

function getErrorView(msg) {
    let htmlContent = '' + fs.readFileSync(extensionPath + '/errorPage.html');
    htmlContent = htmlContent.replace(/\$\$\{serverURL\}/g, serverURL);
    return htmlContent;
}

// this method is called when your extension is deactivated
export function deactivate() {
}

function getHttpOptions(method:string, event:string) {
    let options:any = {
        host: HOSTNAME,
        port: PORT,
        path: `${event}`,
        method: method,
        headers: {
            vscode_plugin_key: `VSCode-version-${VERSION}`,
            user_key: USER_KEY
        },
        timeout: 10000,
        followRedirect: true,
        maxRedirects: 10
    };
    if (agent) {
        options.agent = agent;
    }
    if (method === 'POST') {
        options.headers['Content-Type'] = 'application/json';
    }
    return options;
}

function getRequest(path: string, callback?) {
    let options = getHttpOptions('GET', path);
    console.log("OPTIONS: " + JSON.stringify(options));
    const req = protocol.request(options, (res: any) => {
        let r = "";
        console.log(`GET status: ${res.statusCode}`);
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
            error = null;
            r += chunk;
        });
        res.on('end', () => {
            error = null;
            console.log('GET response: -- end --');
            if (callback) {
                try {
                    callback(null, JSON.parse(r));
                } catch(e) {
                    // fallback to non-JSON response
                    callback(null, r);
                }
            }
        });
    });
    req.on('error', (err: any) => {
        error = err;
        console.log(`ERROR in GET request: ${err.message}`);
        let errMsg = `Failed to communicate with server. ERROR: ${err.message}`;
        vscode.window.showErrorMessage(errMsg);
        currentPanel.webview.html = getErrorView(error);
        if (callback) {
            callback(err, null);
        }
    });
    req.end();
}

// sends a simple message to the visualization server using an HTTP GET request with query string
function postRequest(path: string, data: any, callback?) {
    let options = getHttpOptions('POST', path);
    console.log("OPTIONS: " + JSON.stringify(options));
    const req = protocol.request(options, (res: any) => {
        let result = "";
        console.log(`GET status: ${res.statusCode}`);
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
            error = null;
            console.log(`GET response: ${chunk}`);
            result += chunk;
        });
        res.on('end', () => {
            error = null;
            console.log('GET response: -- end --');
            if (callback && result) {
                callback(null, JSON.parse(result));
            }
        });
    });
    req.on('error', (err: any) => {
        console.log(`ERROR in POST request: ${err.message}`);
        let errMsg = `Failed to communicate with server. ERROR: ${err.message}`;
        error = err;
        vscode.window.showErrorMessage(errMsg);
        console.log("showing error page");
        currentPanel.webview.html = getErrorView(error);
        if (callback) {
            callback(err, null);
        }
    });
    if (data) {
        req.write(JSON.stringify(data));
    }
    req.end();
}

