#!/bin/env python3
from os import path;
from http import server;

basePath = path.dirname(path.abspath(__file__));

class _HTTPRequestHandler(server.SimpleHTTPRequestHandler):
	def __init__(self, *args, **kwargs):
		super().__init__(*args, **kwargs, directory=path.abspath(basePath + "/../static/") + "/");

	def end_headers(self):
		self.send_header("Referrer-Policy", "no-referrer");
		self.send_header("Permissions-Policy", "camera=(), gyroscope=(), microphone=(), geolocation=(), local-fonts=(), accelerometer=(), browsing-topics=(), display-capture=(), screen-wake-lock=()");
		self.send_header("Cross-Origin-Opener-Policy", "same-origin");
		self.send_header("Cross-Origin-Embedder-Policy", "require-corp");
		super().end_headers();

server.test(HandlerClass=_HTTPRequestHandler, protocol="HTTP/2.0", port=8000, bind="127.0.0.1");
