from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


# -----------------------
# USER MODEL
# -----------------------
class User(db.Model):
    __tablename__ = "users"

    user_id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # relationship
    designs = db.relationship("Design", backref="user", lazy=True)

    # password hashing
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    # password verification
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


# -----------------------
# DESIGN MODEL
# -----------------------
class Design(db.Model):
    __tablename__ = "designs"

    design_id = db.Column(db.Integer, primary_key=True)

    user_id = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=False)

    image_path = db.Column(db.String(200))
    style_theme = db.Column(db.String(100))
    ai_output = db.Column(db.Text)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # relationship
    bookings = db.relationship("Booking", backref="design", lazy=True)


# -----------------------
# FURNITURE MODEL
# -----------------------
class Furniture(db.Model):
    __tablename__ = "furniture"

    furniture_id = db.Column(db.Integer, primary_key=True)

    name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(100))
    price = db.Column(db.Float)

    image_url = db.Column(db.String(200))


# -----------------------
# BOOKING MODEL
# -----------------------
class Booking(db.Model):
    __tablename__ = "bookings"

    booking_id = db.Column(db.Integer, primary_key=True)

    design_id = db.Column(db.Integer, db.ForeignKey("designs.design_id"))
    furniture_id = db.Column(db.Integer, db.ForeignKey("furniture.furniture_id"))

    status = db.Column(db.String(50), default="pending")
    booking_date = db.Column(db.DateTime, default=datetime.utcnow)