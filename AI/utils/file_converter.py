import os
import tempfile
import requests
from pathlib import Path
from typing import Dict, Any, Optional
import PyPDF2
import pytesseract
import cv2
import speech_recognition as sr
from pydub import AudioSegment
from urllib.parse import urlparse
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class FileConverter:
    def __init__(self, temp_dir: Optional[str] = None):
        self.temp_dir = temp_dir or tempfile.gettempdir()
        Path(self.temp_dir).mkdir(parents=True, exist_ok=True)
    
    def convert_to_text(self, source: str) -> Dict[str, Any]:
        logger.info(f"Converting: {source}")
        
        # Determine if source is URL or local path
        if self._is_url(source):
            result = self._convert_from_url(source)
        else:
            result = self._convert_from_path(source)
        
        return result
    
    def _is_url(self, source: str) -> bool:
        parsed = urlparse(source)
        return parsed.scheme in ('http', 'https', 's3')
    
    def _convert_from_url(self, url: str) -> Dict[str, Any]:
        try:
            logger.info(f"Downloading from URL: {url}")
            
            # Download file
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            
            # Determine file extension from URL
            parsed = urlparse(url)
            filename = os.path.basename(parsed.path)
            extension = Path(filename).suffix.lower()
            
            # Save to temp file
            temp_file = os.path.join(self.temp_dir, filename)
            with open(temp_file, 'wb') as f:
                f.write(response.content)
            
            logger.info(f"Downloaded to: {temp_file}")
            
            # Convert the downloaded file
            result = self._convert_from_path(temp_file)
            result['source_url'] = url
            result['downloaded_to'] = temp_file
            result['filename'] = filename
            
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Download error: {str(e)}")
            parsed = urlparse(url)
            filename = os.path.basename(parsed.path)
            return {
                "success": False,
                "error": f"Failed to download file: {str(e)}",
                "source_url": url,
                "filename": filename,
                "file_type": "error",
                "text": ""
            }
        except Exception as e:
            logger.error(f"Conversion error: {str(e)}")
            parsed = urlparse(url)
            filename = os.path.basename(parsed.path)
            return {
                "success": False,
                "error": f"Failed to process file: {str(e)}",
                "source_url": url,
                "filename": filename,
                "file_type": "error",
                "text": ""
            }
    
    def _convert_from_path(self, file_path: str) -> Dict[str, Any]:
        if not os.path.exists(file_path):
            return {
                "success": False,
                "error": f"File not found: {file_path}",
                "text": ""
            }
        
        file_ext = Path(file_path).suffix.lower()
        
        # Route to appropriate converter based on extension
        if file_ext == '.pdf':
            return self._convert_pdf(file_path)
        elif file_ext in ['.jpg', '.jpeg', '.png', '.tiff', '.bmp']:
            return self._convert_image(file_path)
        elif file_ext in ['.m4a', '.mp3', '.wav', '.flac']:
            return self._convert_audio(file_path)
        elif file_ext in ['.txt', '.csv', '.log', '.docx']:
            return self._convert_text(file_path)
        else:
            return {
                "success": False,
                "error": f"Unsupported file type: {file_ext}",
                "file_type": "unsupported",
                "text": ""
            }
    
    def _convert_pdf(self, file_path: str) -> Dict[str, Any]:
        try:
            text = ""
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                num_pages = len(pdf_reader.pages)
                
                for page_num in range(num_pages):
                    page = pdf_reader.pages[page_num]
                    text += page.extract_text() + "\n"
            
            return {
                "success": True,
                "text": text,
                "file_type": "pdf",
                "file_path": file_path,
                "filename": os.path.basename(file_path),
                "num_pages": num_pages,
                "word_count": len(text.split())
            }
        except Exception as e:
            logger.error(f"PDF conversion error: {str(e)}")
            return {
                "success": False,
                "error": f"Failed to extract text from PDF: {str(e)}",
                "file_type": "pdf",
                "filename": os.path.basename(file_path),
                "text": ""
            }
    
    def _convert_image(self, file_path: str) -> Dict[str, Any]:
        try:
            image = cv2.imread(file_path)
            if image is None:
                return {
                    "success": False,
                    "error": f"Failed to read image: {file_path}",
                    "filename": os.path.basename(file_path),
                    "file_type": "image",
                    "text": ""
                }
            
            # Convert to grayscale
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # Apply thresholding
            _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            
            # Extract text using Tesseract
            text = pytesseract.image_to_string(thresh)
            
            return {
                "success": True,
                "text": text,
                "file_type": "image",
                "file_path": file_path,
                "filename": os.path.basename(file_path),
                "confidence": "high" if len(text) > 50 else "low",
                "preprocessed": True
            }
        except Exception as e:
            logger.error(f"Image conversion error: {str(e)}")
            return {
                "success": False,
                "error": f"Failed to extract text from image: {str(e)}",
                "file_type": "image",
                "filename": os.path.basename(file_path),
                "text": ""
            }
    
    def _convert_audio(self, file_path: str) -> Dict[str, Any]:
        try:
            recognizer = sr.Recognizer()
            
            # Load audio file
            audio = AudioSegment.from_file(file_path)
            
            # Convert to WAV if not already
            temp_wav = os.path.join(self.temp_dir, 'temp_audio.wav')
            audio.export(temp_wav, format='wav')
            
            # Recognize speech
            with sr.AudioFile(temp_wav) as source:
                audio_data = recognizer.record(source)
                text = recognizer.recognize_google(audio_data)
            
            # Clean up temp WAV
            if os.path.exists(temp_wav):
                os.remove(temp_wav)
            
            return {
                "success": True,
                "text": text,
                "file_type": "audio",
                "file_path": file_path,
                "filename": os.path.basename(file_path),
                "duration_seconds": len(audio) / 1000.0,
                "transcription_method": "Google Speech Recognition"
            }
        except sr.UnknownValueError:
            logger.warning("Speech recognition could not understand audio")
            return {
                "success": False,
                "error": "Speech recognition could not understand audio",
                "file_type": "audio",
                "filename": os.path.basename(file_path),
                "text": ""
            }
        except sr.RequestError as e:
            logger.error(f"Speech recognition error: {str(e)}")
            return {
                "success": False,
                "error": f"Speech recognition service error: {str(e)}",
                "file_type": "audio",
                "filename": os.path.basename(file_path),
                "text": ""
            }
        except Exception as e:
            logger.error(f"Audio conversion error: {str(e)}")
            return {
                "success": False,
                "error": f"Failed to process audio: {str(e)}",
                "file_type": "audio",
                "filename": os.path.basename(file_path),
                "text": ""
            }
    
    def _convert_text(self, file_path: str) -> Dict[str, Any]:
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as file:
                text = file.read()
            
            return {
                "success": True,
                "text": text,
                "file_type": "text",
                "file_path": file_path,
                "filename": os.path.basename(file_path),
                "word_count": len(text.split()),
                "line_count": len(text.split('\n'))
            }
        except Exception as e:
            logger.error(f"Text file read error: {str(e)}")
            return {
                "success": False,
                "error": f"Failed to read text file: {str(e)}",
                "file_type": "text",
                "filename": os.path.basename(file_path),
                "text": ""
            }
    
    def convert_batch(self, sources: list) -> Dict[str, Any]:
        results = {
            "total_files": len(sources),
            "successful": 0,
            "failed": 0,
            "files": []
        }
        
        for source in sources:
            result = self.convert_to_text(source)
            
            if result.get('success'):
                results['successful'] += 1
            else:
                results['failed'] += 1
            
            results['files'].append({
                "source": source,
                "result": result
            })
        
        return results


# Test the file converter
if __name__ == "__main__":
    print("=" * 80)
    print("FILE CONVERTER TEST")
    print("=" * 80)
    
    converter = FileConverter()
    
    # Test with a few URLs from file_urls.txt
    test_urls = [
        "https://simplylaw.s3.us-east-1.amazonaws.com/File+Notes.docx",
        "https://simplylaw.s3.us-east-1.amazonaws.com/Insurance+Basics.docx",
    ]
    
    print(f"\n📥 Testing batch conversion of {len(test_urls)} files...\n")
    
    results = converter.convert_batch(test_urls)
    
    print(f"✅ Successful: {results['successful']}/{results['total_files']}")
    print(f"❌ Failed: {results['failed']}/{results['total_files']}")
    
    for file_result in results['files']:
        print(f"\n{'='*60}")
        print(f"Source: {file_result['source']}")
        result = file_result['result']
        
        if result.get('success'):
            print(f"✅ Success - {result.get('file_type', 'unknown')}")
            print(f"   Text length: {len(result['text'])} characters")
            print(f"   Preview: {result['text'][:200]}...")
        else:
            print(f"❌ Failed: {result.get('error')}")
    
    print(f"\n{'='*80}")
    print("TEST COMPLETE")
    print("=" * 80)
