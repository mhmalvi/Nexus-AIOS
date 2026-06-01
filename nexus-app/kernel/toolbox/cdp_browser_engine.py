"""
CDP Browser Engine — Pure Chrome DevTools Protocol Fallback

Direct CDP connection to Chrome/Chromium when Playwright is not available.
Uses the websockets library (already a project dependency) to communicate
with Chrome's DevTools Protocol over WebSocket.

This is a lightweight fallback; it supports core operations:
- Page navigation
- Screenshot capture
- DOM extraction / text content
- JavaScript evaluation
- Click / type interactions via CDP Input domain
- Cookie management

Usage:
    engine = CDPBrowserEngine()
    if await engine.initialize():
        result = await engine.browse("https://example.com")
        print(result["title"])
    await engine.shutdown()
"""

import asyncio
import base64
import json
import logging
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional, Dict, Any, List

logger = logging.getLogger("aether.browser.cdp")


class CDPBrowserEngine:
    """
    Lightweight browser engine using raw Chrome DevTools Protocol.

    Falls back to this when Playwright is not installed.
    Launches Chrome with --remote-debugging-port and connects via WS.
    """

    def __init__(
        self,
        chrome_path: Optional[str] = None,
        port: int = 9222,
        headless: bool = True,
        user_data_dir: Optional[str] = None,
    ):
        self._chrome_path = chrome_path or self._find_chrome()
        self._port = port
        self._headless = headless
        self._user_data_dir = user_data_dir or str(
            Path.home() / ".aether" / "cdp_profile"
        )

        self._process: Optional[subprocess.Popen] = None
        self._ws = None
        self._ws_url: Optional[str] = None
        self._msg_id = 0
        self._initialized = False
        self._screenshot_dir = Path.home() / ".aether" / "screenshots"
        self._pending: Dict[int, asyncio.Future] = {}
        self._reader_task: Optional[asyncio.Task] = None

        # Page state
        self._current_url = ""
        self._current_title = ""

    # ------------------------------------------------------------------
    # Chrome Discovery
    # ------------------------------------------------------------------

    @staticmethod
    def _find_chrome() -> str:
        """Find Chrome/Chromium executable on the system."""
        if sys.platform == "win32":
            candidates = [
                os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
                os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
                os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
                os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
            ]
        elif sys.platform == "darwin":
            candidates = [
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                "/Applications/Chromium.app/Contents/MacOS/Chromium",
                "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            ]
        else:
            candidates = [
                "/usr/bin/google-chrome",
                "/usr/bin/google-chrome-stable",
                "/usr/bin/chromium",
                "/usr/bin/chromium-browser",
                "/snap/bin/chromium",
            ]

        for path in candidates:
            if os.path.isfile(path):
                return path

        # Try PATH
        import shutil
        for name in ["google-chrome", "chrome", "chromium", "chromium-browser", "msedge"]:
            found = shutil.which(name)
            if found:
                return found

        return "chrome"  # Hope for the best

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def initialize(self) -> bool:
        """Launch Chrome and connect via CDP."""
        try:
            # Ensure dirs
            self._screenshot_dir.mkdir(parents=True, exist_ok=True)
            Path(self._user_data_dir).mkdir(parents=True, exist_ok=True)

            # Launch Chrome with debugging
            args = [
                self._chrome_path,
                f"--remote-debugging-port={self._port}",
                f"--user-data-dir={self._user_data_dir}",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-background-networking",
                "--disable-sync",
                "--disable-extensions",
            ]

            if self._headless:
                args.append("--headless=new")

            self._process = subprocess.Popen(
                args,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

            # Wait for Chrome to start and expose debugging endpoint
            ws_url = await self._wait_for_debugger(timeout=10)
            if not ws_url:
                logger.error("Chrome did not expose debugger in time")
                await self.shutdown()
                return False

            self._ws_url = ws_url

            # Connect WebSocket
            import websockets
            self._ws = await websockets.connect(ws_url, max_size=50 * 1024 * 1024)

            # Start reader loop
            self._reader_task = asyncio.create_task(self._ws_reader())

            # Enable required CDP domains
            await self._send("Page.enable")
            await self._send("Runtime.enable")
            await self._send("DOM.enable")
            await self._send("Network.enable")

            self._initialized = True
            logger.info(f"✅ CDP Browser Engine initialized (port {self._port})")
            return True

        except ImportError:
            logger.error("❌ 'websockets' library required for CDP engine")
            return False
        except FileNotFoundError:
            logger.error(f"❌ Chrome not found at: {self._chrome_path}")
            return False
        except Exception as e:
            logger.error(f"❌ CDP init failed: {e}")
            await self.shutdown()
            return False

    async def _wait_for_debugger(self, timeout: int = 10) -> Optional[str]:
        """Wait for Chrome to expose the WebSocket debugger URL."""
        import aiohttp

        deadline = time.time() + timeout
        url = f"http://localhost:{self._port}/json/version"

        while time.time() < deadline:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, timeout=aiohttp.ClientTimeout(total=2)) as resp:
                        data = await resp.json()
                        ws_url = data.get("webSocketDebuggerUrl")
                        if ws_url:
                            return ws_url
            except Exception:
                pass
            await asyncio.sleep(0.5)

        # Fallback: try /json endpoint for page targets
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"http://localhost:{self._port}/json", timeout=aiohttp.ClientTimeout(total=2)
                ) as resp:
                    targets = await resp.json()
                    for t in targets:
                        if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
                            return t["webSocketDebuggerUrl"]
        except Exception:
            pass

        return None

    async def shutdown(self):
        """Close CDP connection and terminate Chrome."""
        self._initialized = False

        if self._reader_task and not self._reader_task.done():
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass

        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None

        if self._process:
            try:
                self._process.terminate()
                self._process.wait(timeout=5)
            except Exception:
                try:
                    self._process.kill()
                except Exception:
                    pass
            self._process = None

        logger.info("🔌 CDP Browser Engine shut down")

    # ------------------------------------------------------------------
    # CDP Transport
    # ------------------------------------------------------------------

    async def _send(self, method: str, params: Optional[Dict] = None, timeout: float = 30) -> Dict:
        """Send a CDP command and wait for its response."""
        if not self._ws:
            raise RuntimeError("CDP not connected")

        self._msg_id += 1
        msg_id = self._msg_id
        msg = {"id": msg_id, "method": method}
        if params:
            msg["params"] = params

        future = asyncio.get_event_loop().create_future()
        self._pending[msg_id] = future

        await self._ws.send(json.dumps(msg))

        try:
            result = await asyncio.wait_for(future, timeout=timeout)
            return result
        except asyncio.TimeoutError:
            self._pending.pop(msg_id, None)
            raise TimeoutError(f"CDP command timed out: {method}")

    async def _ws_reader(self):
        """Background task reading CDP responses and events."""
        try:
            async for raw in self._ws:
                data = json.loads(raw)
                msg_id = data.get("id")

                if msg_id and msg_id in self._pending:
                    future = self._pending.pop(msg_id)
                    if "error" in data:
                        future.set_exception(
                            RuntimeError(f"CDP error: {data['error'].get('message', 'Unknown')}")
                        )
                    else:
                        future.set_result(data.get("result", {}))

                # Handle CDP events (e.g., page navigation)
                method = data.get("method", "")
                if method == "Page.frameNavigated":
                    frame = data.get("params", {}).get("frame", {})
                    if not frame.get("parentId"):  # Main frame
                        self._current_url = frame.get("url", "")

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"CDP reader error: {e}")

    # ------------------------------------------------------------------
    # Navigation
    # ------------------------------------------------------------------

    async def browse(self, url: str, take_screenshot: bool = False) -> Dict[str, Any]:
        """Navigate to a URL and extract page content."""
        if not self._initialized:
            return {"success": False, "error": "CDP not initialized", "url": url}

        t0 = time.time()
        try:
            # Navigate
            result = await self._send("Page.navigate", {"url": url})
            frame_id = result.get("frameId")

            # Wait for load
            await self._send("Page.setLifecycleEventsEnabled", {"enabled": True})
            await asyncio.sleep(1.5)  # Simple wait (events-based is more complex)

            # Get title
            title_result = await self._send("Runtime.evaluate", {
                "expression": "document.title",
                "returnByValue": True
            })
            title = title_result.get("result", {}).get("value", "")
            self._current_title = title
            self._current_url = url

            # Get text content
            text_result = await self._send("Runtime.evaluate", {
                "expression": """
                    (() => {
                        const clone = document.body.cloneNode(true);
                        clone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
                        return (clone.innerText || clone.textContent || '').trim().slice(0, 50000);
                    })()
                """,
                "returnByValue": True
            })
            text = text_result.get("result", {}).get("value", "")

            # Screenshot
            screenshot_path = None
            screenshot_b64 = ""
            if take_screenshot:
                ss = await self.screenshot()
                screenshot_path = ss.get("path")
                screenshot_b64 = ss.get("data_b64", "")

            load_time = (time.time() - t0) * 1000

            return {
                "success": True,
                "url": url,
                "title": title,
                "text_content": text,
                "screenshot_path": screenshot_path,
                "screenshot": screenshot_b64,
                "load_time_ms": load_time,
            }

        except Exception as e:
            return {
                "success": False,
                "url": url,
                "error": str(e),
                "load_time_ms": (time.time() - t0) * 1000,
            }

    async def go_back(self) -> bool:
        """Navigate back in history."""
        try:
            history = await self._send("Page.getNavigationHistory")
            idx = history.get("currentIndex", 0)
            entries = history.get("entries", [])
            if idx > 0:
                await self._send("Page.navigateToHistoryEntry", {"entryId": entries[idx - 1]["id"]})
                return True
            return False
        except Exception:
            return False

    async def go_forward(self) -> bool:
        """Navigate forward in history."""
        try:
            history = await self._send("Page.getNavigationHistory")
            idx = history.get("currentIndex", 0)
            entries = history.get("entries", [])
            if idx < len(entries) - 1:
                await self._send("Page.navigateToHistoryEntry", {"entryId": entries[idx + 1]["id"]})
                return True
            return False
        except Exception:
            return False

    async def reload(self) -> bool:
        """Reload the current page."""
        try:
            await self._send("Page.reload")
            return True
        except Exception:
            return False

    # ------------------------------------------------------------------
    # Screenshot
    # ------------------------------------------------------------------

    async def screenshot(self, full_page: bool = False, filename: Optional[str] = None) -> Dict[str, Any]:
        """Capture a screenshot via CDP."""
        if not filename:
            filename = f"cdp_screenshot_{int(time.time())}.png"

        path = str(self._screenshot_dir / filename)

        try:
            params = {"format": "png", "quality": 90}

            if full_page:
                # Get page metrics for full-page capture
                metrics = await self._send("Page.getLayoutMetrics")
                content_size = metrics.get("contentSize", {})
                width = content_size.get("width", 1920)
                height = content_size.get("height", 1080)

                # Set viewport to full page
                await self._send("Emulation.setDeviceMetricsOverride", {
                    "mobile": False,
                    "width": int(width),
                    "height": int(height),
                    "deviceScaleFactor": 1,
                })

                params["clip"] = {
                    "x": 0, "y": 0,
                    "width": width, "height": height,
                    "scale": 1,
                }

            result = await self._send("Page.captureScreenshot", params)
            data_b64 = result.get("data", "")

            if data_b64:
                with open(path, "wb") as f:
                    f.write(base64.b64decode(data_b64))

            if full_page:
                # Reset viewport
                await self._send("Emulation.clearDeviceMetricsOverride")

            return {
                "path": path,
                "data_b64": data_b64,
                "width": 1920,
                "height": 1080,
                "full_page": full_page,
            }

        except Exception as e:
            logger.error(f"CDP screenshot failed: {e}")
            return {"path": "", "data_b64": "", "width": 0, "height": 0, "full_page": full_page}

    # ------------------------------------------------------------------
    # Interaction
    # ------------------------------------------------------------------

    async def click(self, selector: str) -> bool:
        """Click an element by CSS selector."""
        try:
            # Get element coordinates
            result = await self._send("Runtime.evaluate", {
                "expression": f"""
                    (() => {{
                        const el = document.querySelector('{selector}');
                        if (!el) return null;
                        const rect = el.getBoundingClientRect();
                        return {{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }};
                    }})()
                """,
                "returnByValue": True
            })
            coords = result.get("result", {}).get("value")
            if not coords:
                return False

            x, y = coords["x"], coords["y"]

            # Dispatch mouse events
            for event_type in ["mousePressed", "mouseReleased"]:
                await self._send("Input.dispatchMouseEvent", {
                    "type": event_type,
                    "x": x, "y": y,
                    "button": "left",
                    "clickCount": 1,
                })

            return True
        except Exception as e:
            logger.warning(f"CDP click failed on '{selector}': {e}")
            return False

    async def type_text(self, selector: str, text: str) -> bool:
        """Type text into an element."""
        try:
            # Focus the element
            await self._send("Runtime.evaluate", {
                "expression": f"document.querySelector('{selector}')?.focus()"
            })

            # Clear existing content
            await self._send("Runtime.evaluate", {
                "expression": f"document.querySelector('{selector}').value = ''"
            })

            # Type each character
            for char in text:
                await self._send("Input.dispatchKeyEvent", {
                    "type": "keyDown",
                    "text": char,
                })
                await self._send("Input.dispatchKeyEvent", {
                    "type": "keyUp",
                    "text": char,
                })

            return True
        except Exception as e:
            logger.warning(f"CDP type failed: {e}")
            return False

    async def press_key(self, key: str) -> bool:
        """Press a key (e.g., 'Enter', 'Escape')."""
        key_map = {
            "Enter": "\r", "Tab": "\t", "Escape": "\x1b",
            "Backspace": "\b", "Delete": "\x7f",
        }
        try:
            await self._send("Input.dispatchKeyEvent", {
                "type": "keyDown",
                "key": key,
                "text": key_map.get(key, ""),
            })
            await self._send("Input.dispatchKeyEvent", {
                "type": "keyUp",
                "key": key,
            })
            return True
        except Exception:
            return False

    async def scroll(self, direction: str = "down", amount: int = 500) -> bool:
        """Scroll the page."""
        try:
            delta = amount if direction == "down" else -amount
            await self._send("Input.dispatchMouseEvent", {
                "type": "mouseWheel",
                "x": 960, "y": 540,
                "deltaX": 0, "deltaY": delta,
            })
            await asyncio.sleep(0.3)
            return True
        except Exception:
            return False

    # ------------------------------------------------------------------
    # JavaScript & DOM
    # ------------------------------------------------------------------

    async def execute_js(self, script: str) -> Any:
        """Execute JavaScript in the page context."""
        try:
            result = await self._send("Runtime.evaluate", {
                "expression": script,
                "returnByValue": True,
                "awaitPromise": True,
            })
            return result.get("result", {}).get("value")
        except Exception as e:
            logger.warning(f"CDP JS execution failed: {e}")
            return None

    async def get_page_info(self) -> Dict[str, Any]:
        """Get current page info."""
        try:
            title_result = await self._send("Runtime.evaluate", {
                "expression": "document.title",
                "returnByValue": True,
            })
            url_result = await self._send("Runtime.evaluate", {
                "expression": "window.location.href",
                "returnByValue": True,
            })
            return {
                "url": url_result.get("result", {}).get("value", ""),
                "title": title_result.get("result", {}).get("value", ""),
                "tab_id": 0,
                "is_active": True,
            }
        except Exception:
            return {"url": self._current_url, "title": self._current_title, "tab_id": 0, "is_active": True}

    async def get_cookies(self) -> List[Dict[str, Any]]:
        """Get all cookies via CDP."""
        try:
            result = await self._send("Network.getAllCookies")
            return result.get("cookies", [])
        except Exception:
            return []

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    @property
    def is_initialized(self) -> bool:
        return self._initialized

    def get_status(self) -> Dict[str, Any]:
        return {
            "initialized": self._initialized,
            "engine": "cdp",
            "headless": self._headless,
            "port": self._port,
            "current_url": self._current_url,
            "chrome_path": self._chrome_path,
        }
