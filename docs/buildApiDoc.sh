# Copyright (C) 2019, Nokia
# Licensed under the BSD 3-Clause License


# Builds the Swagger/OpenAPI/API Blueprint API documentation

# Requirements:
#     npm install -g aglio


aglio --theme-full-width  -i code-compass.apib -o index.html
#aglio --theme-full-width --theme-variables slate -i code-compass.apib -o index.html
#aglio --theme-variables slate -i code-compass.apib --theme-template triple -o index.html 
open index.html
