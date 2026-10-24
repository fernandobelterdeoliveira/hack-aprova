from pathlib import Path
import sys
from dotenv import load_dotenv
import uvicorn
root = Path(__file__).resolve().parent
load_dotenv(root / "frontend" / ".env.local")
sys.path.insert(0, str(root / "AI"))
if __name__ == "__main__":
    uvicorn.run("api_server:app", host="127.0.0.1", port=8000)
