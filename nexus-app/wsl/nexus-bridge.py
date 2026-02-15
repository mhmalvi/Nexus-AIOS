#!/usr/bin/env python3
"""
Nexus WSL Bridge Daemon
Handles communication between Windows host and WSL environment
"""

import sys
import os
import json
import socket
import threading
import time
import subprocess

BRIDGE_PORT = 15000
HOST_IP = "127.0.0.1"  # In WSL2, localhost often works if mapped, or use `hostname.exe -I`

class NexusBridge:
    def __init__(self):
        self.running = True
        self.server = None
        
    def start(self):
        print(f"🌉 Nexus Bridge starting on port {BRIDGE_PORT}")
        self.server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server.bind(("0.0.0.0", BRIDGE_PORT))
        self.server.listen(5)
        
        while self.running:
            try:
                client, addr = self.server.accept()
                threading.Thread(target=self.handle_client, args=(client, addr)).start()
            except Exception as e:
                print(f"Error accepting connection: {e}")
                
    def handle_client(self, client, addr):
        print(f"Connection from {addr}")
        with client:
            while True:
                data = client.recv(4096)
                if not data:
                    break
                
                try:
                    request = json.loads(data.decode('utf-8'))
                    response = self.process_request(request)
                    client.sendall(json.dumps(response).encode('utf-8'))
                except Exception as e:
                    error_response = {"success": False, "error": str(e)}
                    client.sendall(json.dumps(error_response).encode('utf-8'))
                    
    def process_request(self, req):
        """Process incoming bridge requests"""
        command = req.get("command")
        
        if command == "exec":
            # Execute command in WSL
            cmd = req.get("cmd")
            try:
                result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
                return {
                    "success": True,
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "exit_code": result.returncode
                }
            except Exception as e:
                return {"success": False, "error": str(e)}
                
        elif command == "read_file":
             # Read file from WSL filesystem
            path = req.get("path")
            try:
                with open(path, 'r') as f:
                    content = f.read()
                return {"success": True, "content": content}
            except Exception as e:
                return {"success": False, "error": str(e)}
                
        elif command == "ping":
            return {"success": True, "message": "pong"}
            
        else:
            return {"success": False, "error": "Unknown command"}

if __name__ == "__main__":
    bridge = NexusBridge()
    try:
        bridge.start()
    except KeyboardInterrupt:
        print("\nStopping bridge...")
