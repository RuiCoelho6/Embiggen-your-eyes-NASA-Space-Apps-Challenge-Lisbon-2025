import subprocess
import webbrowser
import time
import os

# 1. Run image loader (generates .dzi + tiles)
print("🔄 Generating high-quality image tiles...")
# This now calls the simplified/non-interactive block in the updated imageLoader.py
subprocess.run(["py", "-3.10", "imageLoader.py"], check=True)

# 2. Start server (non-blocking, keep it alive)
print("🚀 Starting server...")
server = subprocess.Popen([
    "py", "-3.10", "-m", "uvicorn", "server:app", "--reload", "--port", "8000"
])

# 3. Give the server a moment to start
time.sleep(3) 

# 4. Check if files were generated successfully
# FIX: Use os.path.join() to construct cross-platform file paths.
DZI_PATH = os.path.join("image_data", "nasa_zoom.dzi")
FILES_PATH = os.path.join("image_data", "nasa_zoom_files")

if os.path.exists(DZI_PATH) and os.path.exists(FILES_PATH):
    print("✅ Tiles generated successfully!")
    
    # 5. Open the viewer in browser
    webbrowser.open("index.html")
    print("🌟 Enhanced NASA Image Viewer opened in your browser.")
    print("📋 Keyboard shortcuts: R=Reset, F=Fullscreen, S=Toggle Smoothing")
else:
    print("❌ Warning: Tile files not found. Check imageLoader.py output. The expected paths were:")
    print(f"   DZI: {DZI_PATH}")
    print(f"   Tiles: {FILES_PATH}")

# Keep script running so server doesn't exit immediately
try:
    server.wait()
except KeyboardInterrupt:
    print("\n🛑 Stopping server...")
    server.terminate()