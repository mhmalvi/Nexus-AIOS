"""
Nexus Web Automation - HTTP and Browser Control
Handles web requests and browser automation
"""

from typing import Optional, Dict, Any, List
from dataclasses import dataclass
import aiohttp


@dataclass
class WebResult:
    """Result from web operation"""
    success: bool
    output: Any
    error: Optional[str]
    status_code: int = 0
    headers: Dict[str, str] = None


class WebAutomation:
    """
    Web Automation - HTTP requests and browser control
    
    Features:
    - Async HTTP requests
    - Basic web scraping
    - Download management
    """
    
    def __init__(self, timeout: int = 30):
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self.default_headers = {
            "User-Agent": "Nexus-AIOS/1.0"
        }
    
    async def request(
        self,
        url: str,
        method: str = "GET",
        headers: Optional[Dict[str, str]] = None,
        data: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None
    ) -> WebResult:
        """Make an HTTP request"""
        
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
