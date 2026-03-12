from flask import Flask
from config import Config
from models import db

app = Flask(__name__)
app.config.from_object(Config)

db.init_app(app)

# Create database tables
with app.app_context():
    db.create_all()

@app.route("/")
def home():
    return "Gruha Alankara Database Initialized!"

if __name__ == "__main__":
    app.run(debug=True)