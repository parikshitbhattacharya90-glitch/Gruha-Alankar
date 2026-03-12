import os

# Base directory of the project
BASE_DIR = os.path.abspath(os.path.dirname(__file__))

class Config:

    # Secret key for session security
    SECRET_KEY = "gruha_alankara_secret_key"

    # SQLite database location
    SQLALCHEMY_DATABASE_URI = "sqlite:///" + os.path.join(BASE_DIR, "database/designs.db")

    # Disable modification tracking (improves performance)
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Upload folder location
    UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")

    # Maximum file size (16MB)
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024

    # Allowed image extensions
    ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg"}