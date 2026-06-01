"""
AETHER Browser Engine — Playwright-Based Web Automation

Full browser control for AETHER's perception layer.
Uses Playwright (with Chrome DevTools Protocol fallback).

Features:
- Headless and headed browser modes
- Page navigation, clicking, typing, scrolling
- Full-page and element screenshots
- DOM extraction and semantic text parsing
- JavaScript execution
- Cookie and session management
- Network interception and monitoring
- PDF generation
- Multi-tab management

Inspired by OpenClaw's browser-automation module.
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple

logger = logging.getLogger("aether.browser")


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class BrowserType(str, Enum):
    CHROMIUM = "chromium"
    FIREFOX = "firefox"
    WEBKIT = "webkit"


@dataclass
class PageInfo:
    """Information about a browser page."""
    url: str
    title: str
    tab_id: int
    is_active: bool = False


@dataclass
class ScreenshotResult:
    """Result of a screenshot operation."""
    path: str
    width: int
    height: int
    full_page: bool
    timestamp: float = field(default_factory=time.time)


@dataclass
class DOMElement:
    """A simplified DOM element."""
    tag: str
    text: str
    attributes: Dict[str, str] = field(default_factory=dict)
    selector: str = ""
    bounding_box: Optional[Dict[str, float]] = None


@dataclass
class BrowseResult:
    """Result from a browse operation."""
    success: bool
    url: str
    title: str = ""
    text_content: str = ""
    screenshot_path: Optional[str] = None
    error: Optional[str] = None
    links: List[Dict[str, str]] = field(default_factory=list)
    load_time_ms: float = 0.0


# ---------------------------------------------------------------------------
# Browser Engine
# ---------------------------------------------------------------------------

class BrowserEngine:
    """
    AETHER's Browser — full web automation via Playwright.

    Usage:
        browser = BrowserEngine()
        await browser.initialize()

        result = await browser.browse("https://example.com")
        print(result.title, result.text_content[:200])

        await browser.click("button#submit")
        await browser.type_text("input[name=query]", "AETHER AI")
        screenshot = await browser.screenshot()

        await browser.shutdown()
    """

    def __init__(
        self,
        browser_type: BrowserType = BrowserType.CHROMIUM,
        headless: bool = True,
        user_data_dir: Optional[str] = None,
        proxy: Optional[str] = None,
    ):
        self._browser_type = browser_type
        self._headless = headless
        self._user_data_dir = user_data_dir
        self._proxy = proxy

        # Playwright objects
        self._playwright = None
        self._browser = None
        self._context = None
        self._page = None
        self._pages: List[Any] = []

        self._initialized = False
        self._screenshot_dir = Path.home() / ".aether" / "screenshots"

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def initialize(self) -> bool:
        """Launch the browser."""
        try:
            from playwright.async_api import async_playwright

            self._playwright = await async_playwright().start()

            # Select browser type
            browser_launcher = {
                BrowserType.CHROMIUM: self._playwright.chromium,
                BrowserType.FIREFOX: self._playwright.firefox,
                BrowserType.WEBKIT: self._playwright.webkit,
            }[self._browser_type]

            # Launch options
            launch_args = {
                "headless": self._headless,
            }

            if self._proxy:
                launch_args["proxy"] = {"server": self._proxy}

            if self._user_data_dir:
                # Persistent context (keeps cookies/sessions)
                self._context = await browser_launcher.launch_persistent_context(
                    self._user_data_dir, **launch_args,
                )
                self._page = self._context.pages[0] if self._context.pages else await self._context.new_page()
            else:
                self._browser = await browser_launcher.launch(**launch_args)
                self._context = await self._browser.new_context(
                    viewport={"width": 1920, "height": 1080},
                    user_agent=(
                        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    ),
                )
                self._page = await self._context.new_page()

            self._pages = [self._page]
            self._screenshot_dir.mkdir(parents=True, exist_ok=True)
            self._initialized = True

            logger.info("Browser engine initialized (%s, headless=%s)",
                        self._browser_type.value, self._headless)
            return True

        except ImportError:
            logger.error("Playwright not installed. Run: pip install playwright && playwright install")
            return False
        except Exception as e:
            logger.error("Browser initialization failed: %s", e)
            return False

    async def shutdown(self) -> None:
        """Close browser and cleanup."""
        try:
            if self._context:
                await self._context.close()
            if self._browser:
                await self._browser.close()
            if self._playwright:
                await self._playwright.stop()
        except Exception as e:
            logger.warning("Browser shutdown error: %s", e)
        finally:
            self._initialized = False

    # ------------------------------------------------------------------
    # Navigation
    # ------------------------------------------------------------------

    async def browse(
        self,
        url: str,
        wait_until: str = "domcontentloaded",
        timeout_ms: int = 30_000,
        take_screenshot: bool = False,
    ) -> BrowseResult:
        """
        Navigate to a URL and extract page content.

        Args:
            url: URL to navigate to
            wait_until: "load", "domcontentloaded", "networkidle"
            timeout_ms: Navigation timeout
            take_screenshot: Capture screenshot after loading
        """
        if not self._initialized or not self._page:
            return BrowseResult(success=False, url=url, error="Browser not initialized")

        t0 = time.time()

        try:
            response = await self._page.goto(
                url, wait_until=wait_until, timeout=timeout_ms,
            )

            title = await self._page.title()
            load_time = (time.time() - t0) * 1000

            # Extract text content
            text = await self._page.evaluate("""
                () => {
                    const body = document.body;
                    if (!body) return '';
                    // Remove scripts and styles
                    const clone = body.cloneNode(true);
                    clone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
                    return clone.innerText || clone.textContent || '';
                }
            """)

            # Extract links
            links = await self._page.evaluate("""
                () => Array.from(document.querySelectorAll('a[href]')).slice(0, 50).map(a => ({
                    text: (a.innerText || '').trim().slice(0, 100),
                    href: a.href,
                }))
            """)

            screenshot_path = None
            if take_screenshot:
                ss = await self.screenshot()
                screenshot_path = ss.path

            return BrowseResult(
                success=True,
                url=self._page.url,
                title=title,
                text_content=text.strip()[:50_000],  # Cap at 50K chars
                screenshot_path=screenshot_path,
                links=links,
                load_time_ms=load_time,
            )

        except Exception as e:
            return BrowseResult(
                success=False,
                url=url,
                error=str(e),
                load_time_ms=(time.time() - t0) * 1000,
            )

    async def go_back(self) -> bool:
        """Navigate back."""
        try:
            await self._page.go_back()
            return True
        except Exception:
            return False

    async def go_forward(self) -> bool:
        """Navigate forward."""
        try:
            await self._page.go_forward()
            return True
        except Exception:
            return False

    async def reload(self) -> bool:
        """Reload page."""
        try:
            await self._page.reload()
            return True
        except Exception:
            return False

    # ------------------------------------------------------------------
    # Interaction
    # ------------------------------------------------------------------

    async def click(self, selector: str, timeout_ms: int = 5000) -> bool:
        """Click an element."""
        try:
            await self._page.click(selector, timeout=timeout_ms)
            return True
        except Exception as e:
            logger.warning("Click failed on '%s': %s", selector, e)
            return False

    async def type_text(
        self, selector: str, text: str, clear: bool = True,
    ) -> bool:
        """Type text into an input field."""
        try:
            if clear:
                await self._page.fill(selector, text)
            else:
                await self._page.type(selector, text)
            return True
        except Exception as e:
            logger.warning("Type failed on '%s': %s", selector, e)
            return False

    async def press_key(self, key: str) -> bool:
        """Press a keyboard key (e.g., 'Enter', 'Escape')."""
        try:
            await self._page.keyboard.press(key)
            return True
        except Exception:
            return False

    async def scroll(self, direction: str = "down", amount: int = 500) -> bool:
        """Scroll the page."""
        try:
            delta = amount if direction == "down" else -amount
            await self._page.mouse.wheel(0, delta)
            await asyncio.sleep(0.3)
            return True
        except Exception:
            return False

    async def select_option(self, selector: str, value: str) -> bool:
        """Select an option from a dropdown."""
        try:
            await self._page.select_option(selector, value)
            return True
        except Exception:
            return False

    # ------------------------------------------------------------------
    # Page inspection
    # ------------------------------------------------------------------

    async def screenshot(
        self,
        full_page: bool = False,
        selector: Optional[str] = None,
        filename: Optional[str] = None,
    ) -> ScreenshotResult:
        """Take a screenshot of the page or a specific element."""
        if not filename:
            filename = f"screenshot_{int(time.time())}.png"

        path = self._screenshot_dir / filename

        try:
            if selector:
                element = await self._page.query_selector(selector)
                if element:
                    await element.screenshot(path=str(path))
                    box = await element.bounding_box()
                    return ScreenshotResult(
                        path=str(path),
                        width=int(box["width"]) if box else 0,
                        height=int(box["height"]) if box else 0,
                        full_page=False,
                    )
            else:
                await self._page.screenshot(path=str(path), full_page=full_page)

            viewport = self._page.viewport_size or {"width": 1920, "height": 1080}
            return ScreenshotResult(
                path=str(path),
                width=viewport["width"],
                height=viewport["height"],
                full_page=full_page,
            )
        except Exception as e:
            logger.error("Screenshot failed: %s", e)
            return ScreenshotResult(path="", width=0, height=0, full_page=False)

    async def get_page_info(self) -> PageInfo:
        """Get current page info."""
        return PageInfo(
            url=self._page.url if self._page else "",
            title=await self._page.title() if self._page else "",
            tab_id=0,
            is_active=True,
        )

    async def query_elements(
        self, selector: str, limit: int = 20,
    ) -> List[DOMElement]:
        """Query DOM elements matching a CSS selector."""
        try:
            elements = await self._page.query_selector_all(selector)
            results = []
            for el in elements[:limit]:
                tag = await el.evaluate("el => el.tagName.toLowerCase()")
                text = (await el.inner_text()).strip()[:200]
                attrs = await el.evaluate("""
                    el => Object.fromEntries(
                        Array.from(el.attributes).map(a => [a.name, a.value])
                    )
                """)
                box = await el.bounding_box()
                results.append(DOMElement(
                    tag=tag,
                    text=text,
                    attributes=attrs,
                    bounding_box=box,
                ))
            return results
        except Exception as e:
            logger.warning("Query failed for '%s': %s", selector, e)
            return []

    async def execute_js(self, script: str) -> Any:
        """Execute JavaScript in the page context."""
        try:
            return await self._page.evaluate(script)
        except Exception as e:
            logger.warning("JS execution failed: %s", e)
            return None

    async def get_cookies(self) -> List[Dict[str, Any]]:
        """Get all cookies."""
        try:
            return await self._context.cookies()
        except Exception:
            return []

    async def to_pdf(self, path: Optional[str] = None) -> Optional[str]:
        """Save page as PDF (Chromium only)."""
        if not path:
            path = str(self._screenshot_dir / f"page_{int(time.time())}.pdf")
        try:
            await self._page.pdf(path=path)
            return path
        except Exception as e:
            logger.warning("PDF generation failed: %s", e)
            return None

    # ------------------------------------------------------------------
    # Tab management
    # ------------------------------------------------------------------

    async def new_tab(self, url: Optional[str] = None) -> int:
        """Open a new tab."""
        page = await self._context.new_page()
        if url:
            await page.goto(url)
        self._pages.append(page)
        self._page = page
        return len(self._pages) - 1

    async def switch_tab(self, index: int) -> bool:
        """Switch to a tab by index."""
        if 0 <= index < len(self._pages):
            self._page = self._pages[index]
            await self._page.bring_to_front()
            return True
        return False

    async def close_tab(self, index: Optional[int] = None) -> bool:
        """Close a tab."""
        idx = index if index is not None else len(self._pages) - 1
        if 0 <= idx < len(self._pages):
            page = self._pages.pop(idx)
            await page.close()
            if self._pages:
                self._page = self._pages[-1]
            return True
        return False

    async def list_tabs(self) -> List[PageInfo]:
        """List all open tabs."""
        tabs = []
        for i, page in enumerate(self._pages):
            try:
                tabs.append(PageInfo(
                    url=page.url,
                    title=await page.title(),
                    tab_id=i,
                    is_active=(page == self._page),
                ))
            except Exception:
                pass
        return tabs

    # ------------------------------------------------------------------
    # Network
    # ------------------------------------------------------------------

    async def intercept_requests(
        self,
        url_pattern: str,
        handler: Any,
    ) -> None:
        """Set up request interception."""
        await self._page.route(url_pattern, handler)

    async def wait_for_response(
        self, url_pattern: str, timeout_ms: int = 10_000,
    ) -> Optional[Dict[str, Any]]:
        """Wait for a network response matching a URL pattern."""
        try:
            response = await self._page.wait_for_response(
                lambda r: url_pattern in r.url, timeout=timeout_ms,
            )
            return {
                "url": response.url,
                "status": response.status,
                "headers": await response.all_headers(),
            }
        except Exception:
            return None

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    @property
    def is_initialized(self) -> bool:
        return self._initialized

    def get_status(self) -> Dict[str, Any]:
        return {
            "initialized": self._initialized,
            "browser_type": self._browser_type.value,
            "headless": self._headless,
            "tabs": len(self._pages),
            "current_url": self._page.url if self._page else None,
        }
