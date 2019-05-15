# code-compass README

Code Compass analyzes your workspace in order to provide software library suggestions based on your current context. Just tell Code Compass what you are looking for (intent) and it will suggest libraries that are compatible with your current development context.

## Features

Here is a screenshot of Code Compass in action:

![Screenshot](https://www.code-compass.com/images/code-compass-screenshot.png "Code-Compass in action")

Simply open a source file (.java, .py, .js) or a requirements file (pom.xml, requirements.txt, package.json), then launch Code-Compass by entering 'code-compass' in the command palette.

Code-Compass will keep track of your active file editor and continuously analyse its current dependencies. You can then search for libraries that are a good fit with your current development context, by entering a keyword (tag, intent) in the searchbox on the left of the screen.

## Requirements

The extension supports Java, JavaScript and Python projects.

This extension contributes the following settings:

* `code-compass.url`: URL of the backend server (default: www.code-compass.com).
  
## Known Issues

When upgrading to a new release, sometimes you can get into a strange behaviour. To resolve this, please uninstall the extension, reload vscode and then remove the directory ~/.vscode/extension/nokia-bell-labs.code-compass-x.x.x . Finally, re-install the extension from VSIX.

## Release Notes

### 0.0.1
Initial release of code-compass 
### 0.1.2
Internal Trial version
### 0.1.3
User preference changes are dynamically taken into account. This allows for example to point to a different server.
### 0.2.0
Support for python and javascript added.
### 0.2.1

 - Anonymous user identification (to detect return-users only)
 - Dynamic intent quick-picks, relevant to your project context
 - Automatic loading of nearest libs to your context when no intent specified
 - Defense against unknown libs (show them as not recognized)
 - Turn off visualization-related messages by default (causing too much unnecessary load)
 - Convert package level java libs to module level java
 - Disabled experimental test-drive and snippet insertion features

### 0.2.2
 - Allow default ecosystem exploration when no active editor contains a supported file type.

### 0.2.3
 - Bug fix - duplicate requests sent to server
 - Bug fix - negative and error token detection

### 1.0.0
 - First public release

### 1.0.1
 - Fixed rendering issue

### 1.0.2
 - Added interactive elements to suggested items (feedback, documentation, add/remove to/from context)

