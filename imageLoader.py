import pyvips
import os
import sys
import shutil

# --- Configuration ---
OUTPUT_DIR = "image_data" # Central directory for all DZI output
DEFAULT_INPUT = "nasa_big.jpg"
DEFAULT_OUTPUT = "nasa_zoom"
DEFAULT_QUALITY = 90
# ---------------------

def process_image(input_file, output_name, quality=DEFAULT_QUALITY):
    """
    Processes a large image into Deep Zoom tiles inside the OUTPUT_DIR.
    This function is now designed to be called by the FastAPI server after a file upload.
    It supports JPG, PNG, and TIFF.
    """
    
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"Input file '{input_file}' not found.")
    
    # Ensure the main output directory exists
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        print(f"SERVER: Created output directory: {OUTPUT_DIR}")
        
    # Define the full path for the output files
    base_output_path = os.path.join(OUTPUT_DIR, output_name)
    dzi_file = f"{base_output_path}.dzi"
    
    # Check file extension to decide on processing method
    file_extension = os.path.splitext(input_file)[1].lower()

    if file_extension in ['.jpg', '.jpeg', '.tiff']:
        try:
            print(f"SERVER: Loading and processing JPG/TIFF image: {input_file} -> {dzi_file}")
            
            image = pyvips.Image.new_from_file(input_file, access="sequential")
            
            # Auto-rotate based on EXIF orientation
            if image.get_typeof("exif-orientation") > 0:
                image = image.autorot()

            # Generate DZI with JPEG tiles
            image.dzsave(base_output_path, tile_size=512, overlap=2, suffix=".jpg", depth="onepixel", centre=True, Q=quality)
            print(f"SERVER: ✅ Successfully generated JPG tiles inside {OUTPUT_DIR}!")
            
        except Exception as e:
            print(f"Error processing JPG/TIFF image: {e}")
            raise

    elif file_extension == '.png':
        try:
            print(f"SERVER: Loading and processing PNG image: {input_file} -> {dzi_file}")
            
            image = pyvips.Image.new_from_file(input_file, access="sequential")
            
            # Auto-rotate based on EXIF orientation (PNG can sometimes have it too)
            if image.get_typeof("exif-orientation") > 0:
                image = image.autorot()
                
            # Generate DZI with PNG tiles for transparency/quality
            image.dzsave(base_output_path, tile_size=512, overlap=2, suffix=".png", depth="onepixel", centre=True)
            print(f"SERVER: ✅ Successfully generated PNG tiles inside {OUTPUT_DIR}!")
            
        except Exception as e:
            print(f"Error processing PNG image: {e}")
            raise
    else:
        raise ValueError(f"Unsupported image file type: {file_extension}")
        
    # After successful processing, clean up the temporary source file
    if os.path.exists(input_file):
        os.remove(input_file)
        print(f"SERVER: Removed temporary source file: {input_file}")

    # Return the URL for the DZI file
    return f"http://127.0.0.1:8000/{output_name}.dzi"

# --- Initial Processing Block (Removed or kept minimal for first run) ---
# NOTE: To ensure the server starts with *something* to display, you should
# call this logic from run.py instead, and ONLY call it once, not inside imageLoader.py
# when it's imported by server.py. For now, we leave this file as a module.