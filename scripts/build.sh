#!/bin/bash
baseDir=$(dirname $(realpath -s $0))/..

cd $baseDir
rm -rf out
set -e

if ! [ -e node_modules ]; then
	npm update -g
	npm install
fi

rm -rf "./node_modules/@types/node"
cd $baseDir/src/ && webpack; cd $baseDir
cat "config/pre.js" out/out.js > out/out.min.js

# google-closure-compiler \
# 	--js out/out.js \
# 	--js_output_file out/out.min.js \
# 	--language_in ECMASCRIPT_2021 \
# 	--language_out ECMASCRIPT_2017 \
# 	--warning_level QUIET \
# 	--env BROWSER \
# 	--compilation_level ADVANCED

cp -fl out/out.min.js static/main.js
