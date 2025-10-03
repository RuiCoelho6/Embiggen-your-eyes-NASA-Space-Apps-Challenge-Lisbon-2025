from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os
import shutil
import time 
import imageLoader 
import uvicorn
# Import is needed for the custom StaticFiles class
from starlette.responses import Response 

# --- Custom CORSEnabledStaticFiles Class (The FIX) ---
class CORSEnabledStaticFiles(StaticFiles):
    """
    A custom StaticFiles class that forces the CORS header 
    (Access-Control-Allow-Origin: *) onto every file response.
    This is REQUIRED to prevent the "Tainted Canvas" error 
    when html2canvas tries to save the OpenSeadragon canvas.
    """
    async def get_response(self, path, scope):
        # 1. Get the original response from the parent StaticFiles
        response = await super().get_response(path, scope)
        
        # 2. Add the CORS header only if a file was successfully found (status code 200)
        if response.status_code == 200:
            # This is the single, crucial line needed to fix the Tainted Canvas error
            response.headers["Access-Control-Allow-Origin"] = "*" 
            response.headers["Access-Control-Allow-Credentials"] = "true"
        
        return response
# ---------------------------------------------------

app = FastAPI()

# --- Configuration ---
OUTPUT_DIR = "image_data" 
# ---------------------

# Add CORS middleware (Needed for API endpoints like /upload_image/)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- NEW ENDPOINT: Handles file upload and processing ---
@app.post("/upload_image/")
async def upload_image_endpoint(file: UploadFile = File(...)):
    # 1. Basic validation and unique naming
    file_extension = os.path.splitext(file.filename)[1].lower()
    if file_extension not in ['.jpg', '.jpeg', '.png', '.tiff']:
        raise HTTPException(status_code=400, detail="Unsupported file type. Must be JPG, PNG, or TIFF.")

    output_name = "user_upload_" + str(int(time.time()))
    temp_file_path = f"temp_{output_name}{file_extension}"
    
    # 2. Save the temporary file locally
    try:
        file_content = await file.read() 
        with open(temp_file_path, "wb") as buffer:
            buffer.write(file_content)
            
        # 3. Process the image into DZI tiles
        dzi_url = imageLoader.process_image(temp_file_path, output_name)
        
        # 4. Return the URL to the DZI file
        return JSONResponse(content={"dzi_url": dzi_url})

    except Exception as e:
        print(f"SERVER ERROR during processing: {e}")
        raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")
    finally:
         # Clean up the original file after processing the DZI tiles
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)


# --- ENDPOINT: Serves DZI files (e.g., http://127.0.0.1:8000/nasa_zoom.dzi) ---
@app.get("/{dzi_name}.dzi")
def get_dzi_file(dzi_name: str):
    dzi_path = os.path.join(imageLoader.OUTPUT_DIR, f"{dzi_name}.dzi")
    if not os.path.exists(dzi_path):
        # Clean up any potential leftover files directory if the DZI is gone
        tiles_dir = os.path.join(imageLoader.OUTPUT_DIR, f"{dzi_name}_files")
        if os.path.exists(tiles_dir):
            shutil.rmtree(tiles_dir)
        raise HTTPException(status_code=404, detail=f"DZI file '{dzi_name}.dzi' not found in {imageLoader.OUTPUT_DIR}.")
    return FileResponse(dzi_path)

# --- Mount 1: Image Tile Files (USES CORS-ENABLED STATIC FILES) ---
# This is the critical mount for serving image tiles (e.g., nasa_zoom_files/0/0_0.jpg).
# It uses the custom class to ensure the CORS header is present for every tile image.
app.mount(
    "/", 
    CORSEnabledStaticFiles(directory=imageLoader.OUTPUT_DIR), 
    name="image_data_tiles"
)

# --- Initial Setup on Startup (Ensure default files exist) ---
@app.on_event("startup")
def initial_setup():
    """Ensures the default image is processed when the server first starts up."""
    input_files = [imageLoader.DEFAULT_INPUT, "nasa_big.jpeg", "nasa_big.png", "nasa_big.tiff"]
    input_file = next((file for file in input_files if os.path.exists(file)), None)
    
    # Only process if the default DZI doesn't exist AND a source file exists
    default_dzi_path = os.path.join(imageLoader.OUTPUT_DIR, f"{imageLoader.DEFAULT_OUTPUT}.dzi")
    
    if not os.path.exists(default_dzi_path) and input_file:
        print(f"🔄 Running initial setup for {imageLoader.DEFAULT_OUTPUT}...")
        try:
            imageLoader.process_image(input_file, imageLoader.DEFAULT_OUTPUT)
        except Exception as e:
            print(f"SERVER: ❌ Initial image processing failed: {e}")
            
# --- Mount 2: Web-facing Files (index.html, script.js, styles.css) ---
# This mount must be last to act as the final fallback for root files.
# We also use the CORS-enabled class here for consistency.
app.mount("/", CORSEnabledStaticFiles(directory="."), name="static_files_root")