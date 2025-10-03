Project Setup and Usage

This project requires Python 3.10.6. Follow the steps below to set up your environment and run the project.

1. Verify Python Installation

Check if Python 3.10.6 is installed:
py --version

If not installed, download it from:
Python.org


2. Install pip (Python Package Manager)

Ensure pip is available:
py -m ensurepip --default-pip

Upgrade pip to the latest version:
py -m pip install --upgrade pip

Verify pip installation:
py -m pip --version


3. Install Required Python Packages

Install dependencies:
py -m pip install pyvips
py -m pip install fastapi uvicorn


4. Install libvips

pyvips requires libvips to be installed separately.
Download the latest release for your operating system:
https://github.com/libvips/libvips/releases

Extract the archive.
Add the extracted folder’s bin path to your system Path environment variable.
Example (Windows):
C:\path\to\libvips\bin


5. Running the Project

Launch the Full Project
py -3.10 run.py

Run Image Loader Independently
py -3.10 imageLoader.py

Start the Server Independently
py -3.10 server.py



6. Additional Notes

Make sure Python 3.10.6 is the default version used in all commands.
If multiple Python versions are installed, use py -3.10 explicitly.