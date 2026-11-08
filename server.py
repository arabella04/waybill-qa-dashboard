import http.server
import socketserver
import os
import json
import urllib.parse
from sync_data import sync

PORT = 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path

        if path == "/api/data":
            json_path = os.path.join(BASE_DIR, "data.json")
            if os.path.exists(json_path):
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                with open(json_path, "rb") as f:
                    self.wfile.write(f.read())
            else:
                self.send_error(404, "data.json not found")
            return

        elif path == "/api/sync":
            try:
                count = sync()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                res = json.dumps({"success": True, "count": count, "message": "Synchronized successfully"})
                self.wfile.write(res.encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                res = json.dumps({"success": False, "error": str(e)})
                self.wfile.write(res.encode("utf-8"))
            return

        elif path == "/download/excel":
            excel_path = os.path.join(BASE_DIR, "Waybill_QA_Dispatch_Progress_Report.xlsx")
            if os.path.exists(excel_path):
                self.send_response(200)
                self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                self.send_header("Content-Disposition", 'attachment; filename="Waybill_QA_Dispatch_Progress_Report.xlsx"')
                self.end_headers()
                with open(excel_path, "rb") as f:
                    self.wfile.write(f.read())
            else:
                self.send_error(404, "Excel report not found")
            return

        elif path == "/download/rth-excel":
            query = urllib.parse.parse_qs(parsed_path.query)
            period = query.get('period', [None])[0]
            try:
                from generate_rth_report import generate_report
                if period and period != 'ALL':
                    generated_file = generate_report(period_filter=period)
                else:
                    generated_file = os.path.join(BASE_DIR, "Waybill_RTH_Invalid_Documents_Report.xlsx")
                    if not os.path.exists(generated_file):
                        generate_report()
                if os.path.exists(generated_file):
                    self.send_response(200)
                    self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                    filename = os.path.basename(generated_file)
                    self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
                    self.end_headers()
                    with open(generated_file, "rb") as f:
                        self.wfile.write(f.read())
                    return
            except Exception as e:
                print("Error serving RTH excel:", e)
                self.send_error(500, f"Error generating Excel: {str(e)}")
                return

        elif path in ("/ws", "/api/info", "/sockjs-node"):
            # Acknowledge browser dev/hot-reload polling quietly
            self.send_response(204)
            self.end_headers()
            return

        # Default fallback to serve files
        super().do_GET()

    def log_message(self, format, *args):
        # Silence repeated websocket and dev polling from cluttering terminal logs
        if len(args) > 0 and isinstance(args[0], str):
            if any(k in args[0] for k in ("/ws", "/api/info", "/sockjs-node", "favicon.ico")):
                return
        super().log_message(format, *args)

def run_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), DashboardHandler) as httpd:
        print(f"Waybill QA Dashboard server running at http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")

if __name__ == "__main__":
    run_server()
