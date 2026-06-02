"""
Nexus File Manager - File System Operations
Safe file handling with path validation
"""

import os
import shutil
import asyncio
from pathlib import Path
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
from datetime import datetime


@dataclass
class FileInfo:
    """Information about a file or directory"""
    path: str
    name: str
    is_dir: bool
    size: int
    modified: datetime
    created: datetime
    extension: Optional[str]


@dataclass
class FileResult:
    """Result from file operation"""
    success: bool
    output: Any
    error: Optional[str]
    exit_code: int = 0


class FileManager:
    """
    File Manager - Safe file system operations
    
    Features:
    - Path validation and sanitization
    - Async file operations
    - Directory management
    - Safe delete with recycle bin option
    """
    
    # Paths that should never be modified
    PROTECTED_PATHS = [
        "/",
        "/etc",
        "/usr",
        "/bin",
        "/sbin",
        "/var",
        "/boot",
        "C:\\Windows",
        "C:\\Program Files",
        "C:\\Program Files (x86)",
    ]
    
    def __init__(self, base_path: Optional[str] = None):
        self.base_path = Path(base_path) if base_path else Path.home()
    
    @staticmethod
    def _is_at_or_under(resolved: Path, protected: str) -> bool:
        """True if `resolved` IS the protected root or lives anywhere beneath it."""
        try:
            protected_path = Path(protected).resolve()
        except Exception:
            protected_path = Path(protected)
        try:
            # is_relative_to (py3.9+) covers both "equal to" and "under".
            return resolved == protected_path or resolved.is_relative_to(protected_path)
        except AttributeError:
            # Fallback for older interpreters: compare normalized string prefixes
            # on a path-separator boundary so that "/etc" does not match "/etcfoo".
            r = os.path.normcase(str(resolved))
            p = os.path.normcase(str(protected_path))
            return r == p or r.startswith(p.rstrip("\\/") + os.sep)

    def _validate_path(self, path: str, for_write: bool = False) -> Path:
        """Validate and resolve a path.

        Reads are permitted everywhere (only the bare protected root itself is
        refused). Mutating operations (write/delete/move/copy-dest/create_dir)
        are refused for the protected root AND anything beneath it, so that
        e.g. ``C:\\Windows\\System32\\x`` or ``/etc/hosts`` cannot be clobbered
        (F-NEW-1).
        """

        resolved = Path(path).resolve()

        for protected in self.PROTECTED_PATHS:
            if self._is_at_or_under(resolved, protected):
                if for_write:
                    raise PermissionError(
                        f"Cannot modify protected path: {resolved} (under {protected})"
                    )
                # Reads: only the bare protected root itself is refused.
                if os.path.normcase(str(resolved)) == os.path.normcase(
                    str(Path(protected).resolve() if os.path.exists(protected) else Path(protected))
                ):
                    raise PermissionError(f"Cannot operate on protected path: {protected}")

        return resolved
    
    async def read(
        self,
        path: str,
        encoding: str = "utf-8"
    ) -> FileResult:
        """Read file contents"""
        
        try:
            resolved = self._validate_path(path)
            
            if not resolved.exists():
                return FileResult(
                    success=False,
                    output=None,
                    error=f"File not found: {path}"
                )
            
            if resolved.is_dir():
                return FileResult(
                    success=False,
                    output=None,
                    error=f"Path is a directory: {path}"
                )
            
            # Read file asynchronously
            loop = asyncio.get_event_loop()
            content = await loop.run_in_executor(
                None,
                lambda: resolved.read_text(encoding=encoding)
            )
            
            return FileResult(
                success=True,
                output=content,
                error=None
            )
            
        except Exception as e:
            return FileResult(
                success=False,
                output=None,
                error=str(e)
            )
    
    async def write(
        self,
        path: str,
        content: str,
        encoding: str = "utf-8",
        create_parents: bool = True
    ) -> FileResult:
        """Write content to file"""
        
        try:
            resolved = self._validate_path(path, for_write=True)

            if create_parents:
                resolved.parent.mkdir(parents=True, exist_ok=True)
            
            # Write file asynchronously
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: resolved.write_text(content, encoding=encoding)
            )
            
            return FileResult(
                success=True,
                output=str(resolved),
                error=None
            )
            
        except Exception as e:
            return FileResult(
                success=False,
                output=None,
                error=str(e)
            )
    
    async def list_dir(
        self,
        path: str,
        recursive: bool = False,
        pattern: Optional[str] = None,
        max_depth: int = 10,
        max_results: int = 5000
    ) -> FileResult:
        """List directory contents with depth and result limits"""

        try:
            resolved = self._validate_path(path)

            if not resolved.exists():
                return FileResult(
                    success=False,
                    output=None,
                    error=f"Directory not found: {path}"
                )

            if not resolved.is_dir():
                return FileResult(
                    success=False,
                    output=None,
                    error=f"Path is not a directory: {path}"
                )

            items = []
            base_depth = len(resolved.parts)

            if recursive:
                iterator = resolved.rglob(pattern or "*")
            else:
                iterator = resolved.glob(pattern or "*")

            for item in iterator:
                # Enforce depth limit for recursive listings
                if recursive and (len(item.parts) - base_depth) > max_depth:
                    continue

                # Enforce max results to prevent hanging on huge directories
                if len(items) >= max_results:
                    break

                try:
                    stat = item.stat()
                    items.append(FileInfo(
                        path=str(item),
                        name=item.name,
                        is_dir=item.is_dir(),
                        size=stat.st_size,
                        modified=datetime.fromtimestamp(stat.st_mtime),
                        created=datetime.fromtimestamp(stat.st_ctime),
                        extension=item.suffix if item.is_file() else None
                    ))
                except Exception:
                    continue

            truncated = len(items) >= max_results

            return FileResult(
                success=True,
                output=[{
                    "path": f.path,
                    "name": f.name,
                    "is_dir": f.is_dir,
                    "size": f.size,
                    "modified": f.modified.isoformat(),
                    "extension": f.extension
                } for f in items] + ([{"_truncated": True, "_max_results": max_results}] if truncated else []),
                error=None
            )

        except Exception as e:
            return FileResult(
                success=False,
                output=None,
                error=str(e)
            )
    
    async def delete(
        self,
        path: str,
        use_trash: bool = True
    ) -> FileResult:
        """Delete a file or directory"""
        
        try:
            resolved = self._validate_path(path, for_write=True)

            if not resolved.exists():
                return FileResult(
                    success=False,
                    output=None,
                    error=f"Path not found: {path}"
                )

            if use_trash:
                # Try to use send2trash if available
                try:
                    from send2trash import send2trash
                    send2trash(str(resolved))
                except ImportError:
                    # Fall back to direct delete
                    if resolved.is_dir():
                        shutil.rmtree(resolved)
                    else:
                        resolved.unlink()
            else:
                if resolved.is_dir():
                    shutil.rmtree(resolved)
                else:
                    resolved.unlink()
            
            return FileResult(
                success=True,
                output=str(resolved),
                error=None
            )
            
        except Exception as e:
            return FileResult(
                success=False,
                output=None,
                error=str(e)
            )
    
    async def move(
        self,
        source: str,
        destination: str
    ) -> FileResult:
        """Move a file or directory"""
        
        try:
            # Moving mutates both source (removed) and destination (created).
            src = self._validate_path(source, for_write=True)
            dst = self._validate_path(destination, for_write=True)

            if not src.exists():
                return FileResult(
                    success=False,
                    output=None,
                    error=f"Source not found: {source}"
                )

            shutil.move(str(src), str(dst))
            
            return FileResult(
                success=True,
                output=str(dst),
                error=None
            )
            
        except Exception as e:
            return FileResult(
                success=False,
                output=None,
                error=str(e)
            )
    
    async def copy(
        self,
        source: str,
        destination: str
    ) -> FileResult:
        """Copy a file or directory"""
        
        try:
            # Copy reads from source but writes to destination.
            src = self._validate_path(source)
            dst = self._validate_path(destination, for_write=True)

            if not src.exists():
                return FileResult(
                    success=False,
                    output=None,
                    error=f"Source not found: {source}"
                )

            if src.is_dir():
                shutil.copytree(str(src), str(dst))
            else:
                shutil.copy2(str(src), str(dst))
            
            return FileResult(
                success=True,
                output=str(dst),
                error=None
            )
            
        except Exception as e:
            return FileResult(
                success=False,
                output=None,
                error=str(e)
            )
    
    async def create_dir(
        self,
        path: str,
        parents: bool = True
    ) -> FileResult:
        """Create a directory"""
        
        try:
            resolved = self._validate_path(path, for_write=True)
            resolved.mkdir(parents=parents, exist_ok=True)
            
            return FileResult(
                success=True,
                output=str(resolved),
                error=None
            )
            
        except Exception as e:
            return FileResult(
                success=False,
                output=None,
                error=str(e)
            )
