"""
Nexus Web Automation - HTTP and Browser Control
Handles web requests and browser automation
"""

from typing import Optional, Dict, Any, List
from dataclasses import dataclass
import asyncio
import ipaddress
import logging
import socket
from urllib.parse import urlparse
import aiohttp

logger = logging.getLogger(__name__)


@dataclass
class WebResult:
    """Result from web operation"""
    success: bool
    output: Any
    error: Optional[str]
    status_code: int = 0
    headers: Dict[str, str] = None


def _ip_is_blocked(ip_str: str) -> bool:
    """True if an IP is loopback / link-local / private / reserved / multicast.

    169.254.169.254 (cloud metadata) is link-local and therefore blocked.
    """
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    return (
        ip.is_loopback or ip.is_link_local or ip.is_private
        or ip.is_reserved or ip.is_multicast or ip.is_unspecified
    )


class WebAutomation:
    """
    Web Automation - HTTP requests and browser control
    
    Features:
    - Async HTTP requests
    - Basic web scraping
    - Download management
    """
    
    def __init__(self, timeout: int = 30, firewall=None, allow_private: bool = False):
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self.default_headers = {
            "User-Agent": "Nexus-AIOS/1.0"
        }
        # Optional NetworkFirewall (exfil detection + explicit deny rules).
        self.firewall = firewall
        # SSRF guard: block requests to loopback/link-local/private/metadata
        # endpoints unless explicitly opted in (F-NEW-2). Default-secure.
        self.allow_private = allow_private

    async def _guard(self, url: str, method: str = "GET") -> Optional[WebResult]:
        """Pre-flight egress checks. Returns a blocking WebResult or None."""
        parsed = urlparse(url)
        host = parsed.hostname
        if not host:
            return WebResult(success=False, output=None, error=f"Invalid URL: {url}")

        # SSRF guard — resolve the host and refuse internal targets.
        if not self.allow_private:
            try:
                loop = asyncio.get_event_loop()
                infos = await loop.run_in_executor(
                    None, lambda: socket.getaddrinfo(host, parsed.port or None)
                )
                addresses = {info[4][0] for info in infos}
            except Exception:
                # If the literal host is itself an IP, check it directly.
                addresses = {host}
            for addr in addresses:
                if _ip_is_blocked(addr):
                    logger.warning("Blocked SSRF egress to %s (%s)", url, addr)
                    return WebResult(
                        success=False, output=None,
                        error=f"Blocked: request to internal/loopback/link-local address ({addr})",
                    )

        # NetworkFirewall — exfil patterns + explicit deny rules.
        if self.firewall is not None:
            try:
                verdict = await self.firewall.check(url, method=method)
                v = getattr(verdict, "value", str(verdict))
                # Treat the firewall as a deny-list for general browsing: block
                # exfil patterns and explicit DENY rules. The default-DENY
                # fallthrough ("denied") is NOT enforced here so legitimate web
                # research isn't broken; the SSRF guard above covers internal
                # targets regardless.
                if v in ("blocked_exfiltration", "blocked_by_rule"):
                    return WebResult(
                        success=False, output=None,
                        error=f"Blocked by network firewall: {v}",
                    )
            except Exception as e:
                logger.debug("Firewall check error (allowing): %s", e)
        return None
    
    async def request(
        self,
        url: str,
        method: str = "GET",
        headers: Optional[Dict[str, str]] = None,
        data: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None
    ) -> WebResult:
        """Make an HTTP request"""
        
        blocked = await self._guard(url, method)
        if blocked is not None:
            return blocked

        request_headers = {**self.default_headers, **(headers or {})}

        try:
            async with aiohttp.ClientSession(timeout=self.timeout) as session:
                async with session.request(
                    method=method.upper(),
                    url=url,
                    headers=request_headers,
                    data=data,
                    json=json_data
                ) as response:
                    content_type = response.headers.get("Content-Type", "")
                    
                    if "application/json" in content_type:
                        body = await response.json()
                    else:
                        body = await response.text()
                    
                    return WebResult(
                        success=response.status < 400,
                        output=body,
                        error=None if response.status < 400 else f"HTTP {response.status}",
                        status_code=response.status,
                        headers=dict(response.headers)
                    )
                    
        except aiohttp.ClientError as e:
            return WebResult(
                success=False,
                output=None,
                error=f"Request failed: {str(e)}",
                status_code=0
            )
        except Exception as e:
            return WebResult(
                success=False,
                output=None,
                error=str(e),
                status_code=0
            )
    
    async def get(self, url: str, **kwargs) -> WebResult:
        """Make a GET request"""
        return await self.request(url, "GET", **kwargs)
    
    async def post(self, url: str, **kwargs) -> WebResult:
        """Make a POST request"""
        return await self.request(url, "POST", **kwargs)
    
    async def download(
        self,
        url: str,
        save_path: str,
        headers: Optional[Dict[str, str]] = None
    ) -> WebResult:
        """Download a file"""
        
        blocked = await self._guard(url, "GET")
        if blocked is not None:
            return blocked

        request_headers = {**self.default_headers, **(headers or {})}

        try:
            async with aiohttp.ClientSession(timeout=self.timeout) as session:
                async with session.get(url, headers=request_headers) as response:
                    if response.status >= 400:
                        return WebResult(
                            success=False,
                            output=None,
                            error=f"HTTP {response.status}",
                            status_code=response.status
                        )
                    
                    with open(save_path, "wb") as f:
                        async for chunk in response.content.iter_chunked(8192):
                            f.write(chunk)
                    
                    return WebResult(
                        success=True,
                        output=save_path,
                        error=None,
                        status_code=response.status
                    )
                    
        except Exception as e:
            return WebResult(
                success=False,
                output=None,
                error=str(e),
                status_code=0
            )
    
    async def scrape_text(
        self,
        url: str,
        selector: Optional[str] = None
    ) -> WebResult:
        """Scrape text content from a web page"""
        
        result = await self.get(url)
        
        if not result.success:
            return result
        
        try:
            from bs4 import BeautifulSoup
            
            soup = BeautifulSoup(result.output, "html.parser")
            
            # Remove script and style elements
            for element in soup(["script", "style", "nav", "footer", "header"]):
                element.decompose()
            
            if selector:
                elements = soup.select(selector)
                text = "\n".join(el.get_text(strip=True) for el in elements)
            else:
                text = soup.get_text(separator="\n", strip=True)
            
            return WebResult(
                success=True,
                output=text,
                error=None,
                status_code=result.status_code
            )
            
        except ImportError:
            # BeautifulSoup not available, return raw HTML
            return WebResult(
                success=True,
                output=result.output,
                error="BeautifulSoup not available for parsing",
                status_code=result.status_code
            )
        except Exception as e:
            return WebResult(
                success=False,
                output=None,
                error=str(e),
                status_code=result.status_code
            )
