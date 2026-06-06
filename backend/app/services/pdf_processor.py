"""
PDF text extraction using PyMuPDF with PaddleOCR fallback
for scanned/image-based pages.
"""
import io
from pathlib import Path


def extract_text_from_pdf(pdf_bytes: bytes) -> tuple[str, bool]:
    """
    Extract text from a PDF.
    Returns (extracted_text, used_ocr).
    Raises RuntimeError if zero characters extracted after all attempts.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise RuntimeError("PyMuPDF (fitz) is not installed")

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages_text: list[str] = []
    used_ocr = False

    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text("text").strip()

        if text:
            pages_text.append(text)
        else:
            # Fallback to OCR for image-based pages
            ocr_text = _ocr_page(page)
            if ocr_text:
                pages_text.append(ocr_text)
                used_ocr = True

    doc.close()
    full_text = "\n\n".join(pages_text).strip()
    return full_text, used_ocr


def _ocr_page(page) -> str:
    """Run PaddleOCR on a single page rendered as an image."""
    try:
        from paddleocr import PaddleOCR
        import numpy as np
        from PIL import Image

        # Render page to image
        mat = page.get_pixmap(dpi=200)
        img_bytes = mat.tobytes("png")
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        img_array = np.array(img)

        ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
        result = ocr.ocr(img_array, cls=True)

        if not result or not result[0]:
            return ""

        lines = []
        for line in result[0]:
            if line and len(line) >= 2:
                text_info = line[1]
                if text_info and len(text_info) >= 1:
                    lines.append(text_info[0])

        return "\n".join(lines)
    except Exception as e:
        print(f"[OCR Warning] OCR failed for page: {e}")
        return ""
