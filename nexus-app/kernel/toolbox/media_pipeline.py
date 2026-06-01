"""
AETHER Media Pipeline — Screen Capture, Image Analysis & Vision

Handles visual perception for AETHER:
- Desktop screenshot capture (cross-platform)
- Camera/webcam capture
- Image analysis via multimodal LLMs
- OCR text extraction
- Image comparison / change detection
- Media file metadata extraction

Part of Phase 4: The Eyes.
"""

import asyncio
import base64
import io
import json
import logging
import os
import platform
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple

logger = logging.getLogger("aether.media")


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class CaptureSource(str, Enum):
    SCREEN = "screen"          # Full desktop screenshot
    WINDOW = "window"          # Specific window
    REGION = "region"          # Screen region (x, y, w, h)
    CAMERA = "camera"          # Webcam
    FILE = "file"              # From file path


@dataclass
class CaptureResult:
    """Result of a media capture operation."""
    success: bool
    source: CaptureSource
    path: Optional[str] = None
    width: int = 0
    height: int = 0
    base64_data: Optional[str] = None
    error: Optional[str] = None
    timestamp: float = field(default_factory=time.time)

    @property
    def size_bytes(self) -> int:
        if self.path and os.path.exists(self.path):
            return os.path.getsize(self.path)
        if self.base64_data:
            return len(self.base64_data) * 3 // 4
        return 0


@dataclass
class VisionAnalysis:
    """Result of AI vision analysis on an image."""
    description: str
    objects: List[str] = field(default_factory=list)
    text_content: str = ""           # OCR-extracted text
    confidence: float = 0.0
    provider: str = ""
    analysis_time_ms: float = 0.0


@dataclass
class MediaMetadata:
    """Metadata extracted from a media file."""
    path: str
    file_type: str
    size_bytes: int
    width: int = 0
    height: int = 0
    duration_seconds: float = 0.0    # For video/audio
    format_info: Dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Media Pipeline
# ---------------------------------------------------------------------------

class MediaPipeline:
    """
    AETHER's visual perception system.

    Usage:
        media = MediaPipeline(brain=brain)
        await media.initialize()

        # Capture desktop screenshot
        capture = await media.capture_screen()

        # Analyze what's on screen
        analysis = await media.analyze_image(capture.path)
        print(analysis.description)

        # OCR text from screenshot
        text = await media.extract_text(capture.path)
    """

    def __init__(
        self,
        brain=None,
        output_dir: Optional[str] = None,
    ):
        self._brain = brain
        self._output_dir = Path(output_dir or (Path.home() / ".aether" / "media"))
        self._initialized = False
        self._system = platform.system().lower()

        # Stats
        self.total_captures = 0
        self.total_analyses = 0

    async def initialize(self) -> bool:
        """Initialize the media pipeline."""
        self._output_dir.mkdir(parents=True, exist_ok=True)
        self._initialized = True
        logger.info("Media pipeline initialized (output: %s)", self._output_dir)
        return True

    # ------------------------------------------------------------------
    # Screen Capture
    # ------------------------------------------------------------------

    async def capture_screen(
        self,
        region: Optional[Tuple[int, int, int, int]] = None,
        filename: Optional[str] = None,
    ) -> CaptureResult:
        """
        Capture a screenshot of the desktop.

        Args:
            region: Optional (x, y, width, height) to capture a region
            filename: Optional output filename
        """
        if not filename:
            filename = f"screen_{int(time.time())}.png"

        path = self._output_dir / filename

        try:
            # Try PIL/Pillow first
            from PIL import ImageGrab

            if region:
                x, y, w, h = region
                img = ImageGrab.grab(bbox=(x, y, x + w, y + h))
                source = CaptureSource.REGION
            else:
                img = ImageGrab.grab()
                source = CaptureSource.SCREEN

            img.save(str(path))
            self.total_captures += 1

            return CaptureResult(
                success=True,
                source=source,
                path=str(path),
                width=img.width,
                height=img.height,
            )

        except ImportError:
            logger.warning("Pillow not installed for screen capture")
            # Fallback: use platform-specific tools
            return await self._capture_fallback(path, region)
        except Exception as e:
            return CaptureResult(
                success=False,
                source=CaptureSource.SCREEN,
                error=str(e),
            )

    async def _capture_fallback(
        self, path: Path, region: Optional[Tuple] = None,
    ) -> CaptureResult:
        """Platform-specific screenshot fallback."""
        try:
            if self._system == "linux":
                cmd = f"scrot {path}"
            elif self._system == "darwin":
                cmd = f"screencapture -x {path}"
            elif self._system == "windows":
                # PowerShell screenshot
                cmd = (
                    f'powershell -command "'
                    f"Add-Type -AssemblyName System.Windows.Forms; "
                    f"[System.Windows.Forms.Screen]::PrimaryScreen | ForEach-Object {{ "
                    f"$bitmap = New-Object System.Drawing.Bitmap($_.Bounds.Width, $_.Bounds.Height); "
                    f"$graphics = [System.Drawing.Graphics]::FromImage($bitmap); "
                    f"$graphics.CopyFromScreen($_.Bounds.Location, [System.Drawing.Point]::Empty, $_.Bounds.Size); "
                    f"$bitmap.Save('{path}') }}"
                    f'"'
                )
            else:
                return CaptureResult(
                    success=False, source=CaptureSource.SCREEN,
                    error=f"Unsupported platform: {self._system}",
                )

            proc = await asyncio.create_subprocess_shell(
                cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            await proc.wait()

            if path.exists():
                self.total_captures += 1
                return CaptureResult(
                    success=True, source=CaptureSource.SCREEN, path=str(path),
                )

            return CaptureResult(
                success=False, source=CaptureSource.SCREEN,
                error="Screenshot command failed",
            )
        except Exception as e:
            return CaptureResult(
                success=False, source=CaptureSource.SCREEN, error=str(e),
            )

    # ------------------------------------------------------------------
    # Camera Capture
    # ------------------------------------------------------------------

    async def capture_camera(
        self,
        device_index: int = 0,
        filename: Optional[str] = None,
    ) -> CaptureResult:
        """Capture a frame from the webcam."""
        if not filename:
            filename = f"camera_{int(time.time())}.png"

        path = self._output_dir / filename

        try:
            import cv2

            cap = cv2.VideoCapture(device_index)
            if not cap.isOpened():
                return CaptureResult(
                    success=False, source=CaptureSource.CAMERA,
                    error="Could not open camera",
                )

            ret, frame = cap.read()
            cap.release()

            if not ret:
                return CaptureResult(
                    success=False, source=CaptureSource.CAMERA,
                    error="Failed to capture frame",
                )

            cv2.imwrite(str(path), frame)
            h, w = frame.shape[:2]
            self.total_captures += 1

            return CaptureResult(
                success=True, source=CaptureSource.CAMERA,
                path=str(path), width=w, height=h,
            )

        except ImportError:
            return CaptureResult(
                success=False, source=CaptureSource.CAMERA,
                error="OpenCV not installed (pip install opencv-python)",
            )
        except Exception as e:
            return CaptureResult(
                success=False, source=CaptureSource.CAMERA, error=str(e),
            )

    # ------------------------------------------------------------------
    # Image Analysis (Vision LLM)
    # ------------------------------------------------------------------

    async def analyze_image(
        self,
        image_path: str,
        prompt: str = "Describe what you see in this image in detail.",
        provider: Optional[str] = None,
    ) -> VisionAnalysis:
        """
        Analyze an image using a multimodal LLM.

        Args:
            image_path: Path to the image file
            prompt: Analysis prompt
            provider: Override AI provider (gemini recommended for vision)
        """
        t0 = time.time()

        try:
            # Read and encode image
            img_path = Path(image_path)
            if not img_path.exists():
                return VisionAnalysis(
                    description=f"Image not found: {image_path}",
                )

            with open(img_path, "rb") as f:
                image_data = f.read()

            base64_image = base64.b64encode(image_data).decode("utf-8")

            # Determine MIME type
            suffix = img_path.suffix.lower()
            mime_types = {
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".gif": "image/gif",
                ".webp": "image/webp",
                ".bmp": "image/bmp",
            }
            mime_type = mime_types.get(suffix, "image/png")

            # Send to vision-capable LLM
            if self._brain:
                # Build multimodal message
                messages = [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{base64_image}",
                            },
                        },
                    ],
                }]

                response = await self._brain.generate(
                    prompt=prompt,
                    messages=messages,
                    system_prompt=(
                        "You are AETHER's vision system. Describe images accurately "
                        "and in detail. If there's text visible, include it. "
                        "If there are UI elements, describe their state."
                    ),
                )

                elapsed = (time.time() - t0) * 1000
                self.total_analyses += 1

                return VisionAnalysis(
                    description=response,
                    confidence=0.85,
                    provider=provider or "auto",
                    analysis_time_ms=elapsed,
                )

            return VisionAnalysis(
                description="No AI brain available for vision analysis",
            )

        except Exception as e:
            return VisionAnalysis(description=f"Analysis failed: {e}")

    # ------------------------------------------------------------------
    # OCR
    # ------------------------------------------------------------------

    async def extract_text(self, image_path: str) -> str:
        """Extract text from an image using OCR."""
        try:
            # Try Tesseract first
            from PIL import Image
            import pytesseract

            img = Image.open(image_path)
            text = pytesseract.image_to_string(img)
            return text.strip()

        except ImportError:
            # Fallback: use vision LLM for OCR
            result = await self.analyze_image(
                image_path,
                prompt="Extract ALL text visible in this image. Return only the text content, preserving layout.",
            )
            return result.description

        except Exception as e:
            logger.warning("OCR failed: %s", e)
            return ""

    # ------------------------------------------------------------------
    # Image utilities
    # ------------------------------------------------------------------

    async def image_to_base64(self, image_path: str) -> Optional[str]:
        """Convert an image file to base64."""
        try:
            with open(image_path, "rb") as f:
                return base64.b64encode(f.read()).decode("utf-8")
        except Exception:
            return None

    async def compare_images(
        self, path_a: str, path_b: str, threshold: float = 0.05,
    ) -> Dict[str, Any]:
        """
        Compare two images for changes.

        Returns dict with:
        - different: bool
        - similarity: float (0-1)
        - changed_regions: list of bounding boxes
        """
        try:
            from PIL import Image
            import numpy as np

            img_a = np.array(Image.open(path_a).convert("RGB"))
            img_b = np.array(Image.open(path_b).convert("RGB"))

            if img_a.shape != img_b.shape:
                return {
                    "different": True,
                    "similarity": 0.0,
                    "reason": "Different dimensions",
                }

            # Pixel-wise difference
            diff = np.abs(img_a.astype(float) - img_b.astype(float))
            mean_diff = diff.mean() / 255.0
            similarity = 1.0 - mean_diff

            return {
                "different": mean_diff > threshold,
                "similarity": round(similarity, 4),
                "mean_diff": round(mean_diff, 4),
            }

        except ImportError:
            return {"different": None, "error": "Pillow/numpy required"}
        except Exception as e:
            return {"different": None, "error": str(e)}

    async def get_media_metadata(self, path: str) -> MediaMetadata:
        """Extract metadata from a media file."""
        p = Path(path)
        size = p.stat().st_size if p.exists() else 0
        suffix = p.suffix.lower()

        meta = MediaMetadata(
            path=str(p),
            file_type=suffix.lstrip("."),
            size_bytes=size,
        )

        # Try to get dimensions for images
        try:
            from PIL import Image
            if suffix in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"):
                img = Image.open(path)
                meta.width, meta.height = img.size
        except Exception:
            pass

        return meta

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def get_status(self) -> Dict[str, Any]:
        return {
            "initialized": self._initialized,
            "platform": self._system,
            "output_dir": str(self._output_dir),
            "total_captures": self.total_captures,
            "total_analyses": self.total_analyses,
        }
