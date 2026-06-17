import http.server
import os
import sys

class SpaHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Translate URL path to local file path
        path = self.translate_path(self.path)
        # If the physical file doesn't exist, fallback to serve index.html
        if not os.path.exists(path) or os.path.isdir(path):
            # Check if there is an index.html in the fallback path
            self.path = '/index.html'
        return super().do_GET()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8081
    directory = sys.argv[2] if len(sys.argv) > 2 else '.'
    os.chdir(directory)
    
    server_address = ('', port)
    httpd = http.server.HTTPServer(server_address, SpaHandler)
    print(f"Serving SPA on port {port} from {directory}...")
    httpd.serve_forever()
