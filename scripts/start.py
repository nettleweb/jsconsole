#!/bin/env python3
from os import path;
from http import server;

basePath = path.dirname(path.abspath(__file__));

class _HTTPRequestHandler(server.SimpleHTTPRequestHandler):
	def __init__(self, *args, **kwargs):
		super().__init__(*args, **kwargs, directory=path.abspath(basePath + "/../static/") + "/");

	def end_headers(self):
		self.send_header("Referrer-Policy", "no-referrer");
		self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), accelerometer=(), display-capture=(), browsing-topics=(), screen-wake-lock=()");
		self.send_header("X-Content-Type-Options", "nosniff");
		# self.send_header("Content-Security-Policy", "");
		# self.send_header("Cross-Origin-Embedder-Policy", "require-corp");
		# self.send_header("Cross-Origin-Opener-Policy", "same-origin");
		super().end_headers();

server.test(HandlerClass=_HTTPRequestHandler, protocol="HTTP/2.0", port=8000, bind="127.0.0.1");
