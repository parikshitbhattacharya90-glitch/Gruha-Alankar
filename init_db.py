import os
from app import create_app
from models import db, User, Design, Furniture, Booking
from config import Config

def init_and_test_db():
    print("Starting database initialization and tests...")
    app = create_app()
    
    with app.app_context():
        # Re-create tables
        print("Dropping and recreating all tables...")
        db.drop_all()
        db.create_all()
        
        print("Tables created successfully.")
        
        # Test 1: Create a User
        print("\n--- Testing User CRUD ---")
        test_user = User(username="test_designer", email="test@gruhaalankara.local")
        test_user.set_password("securepassword123")
        
        db.session.add(test_user)
        db.session.commit()
        print(f"Created User: {test_user}")
        
        # Read the user back
        fetched_user = User.query.filter_by(username="test_designer").first()
        print(f"Fetched User: {fetched_user.username}")
        print(f"Password Check: {fetched_user.check_password('securepassword123')}")
        
        # Test 2: Create Furniture Items
        print("\n--- Seeding Furniture Items ---")
        furniture_data = [
            {"name": "Modern Velvet Sofa", "category": "Seating", "price": 1299.99, "image_url": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=400&q=80"},
            {"name": "Eames Lounge Chair", "category": "Seating", "price": 849.00, "image_url": "https://images.unsplash.com/photo-1592078615290-033ee584e267?auto=format&fit=crop&w=400&q=80"},
            {"name": "Minimalist Oak Table", "category": "Tables", "price": 599.50, "image_url": "https://images.unsplash.com/photo-1530018607912-eff23149f116?auto=format&fit=crop&w=400&q=80"},
            {"name": "Industrial Floor Lamp", "category": "Lighting", "price": 149.99, "image_url": "https://images.unsplash.com/photo-1507473885765-e6ed657f99ad?auto=format&fit=crop&w=400&q=80"},
            {"name": "Bohemian Area Rug", "category": "Decor", "price": 299.00, "image_url": "https://images.unsplash.com/photo-1531835551805-16d864c8d311?auto=format&fit=crop&w=400&q=80"},
            {"name": "Walnut Bookshelf", "category": "Storage", "price": 450.00, "image_url": "https://images.unsplash.com/photo-1594620302200-9a762244a156?auto=format&fit=crop&w=400&q=80"}
        ]
        
        for item in furniture_data:
            f = Furniture(name=item['name'], category=item['category'], price=item['price'], image_url=item['image_url'])
            db.session.add(f)
        db.session.commit()
        print(f"Seeded {len(furniture_data)} furniture items.")
        
        # Test 3: Create a Design
        print("\n--- Testing Design CRUD ---")
        test_design = Design(
            title="Spacious Living Room",
            room_type="Living Room",
            style="Modern Minimalist",
            budget=1500.00,
            image_path="/static/images/hero-bg.jpg", # Placeholder if exists or just a path
            author=fetched_user
        )
        db.session.add(test_design)
        db.session.commit()
        print(f"Created Design: {test_design} by {test_design.author.username}")
        
        # Test 4: Create a Booking
        print("\n--- Testing Booking CRUD ---")
        test_booking = Booking(
            user_id=fetched_user.id,
            furniture_id=Furniture.query.first().id,
            status="Confirmed"
        )
        db.session.add(test_booking)
        db.session.commit()
        print(f"Created Booking: {test_booking} | Status: {test_booking.status}")
        
        # Test 5: Update the Booking Status
        print("\n--- Testing Update ---")
        test_booking.status = "Confirmed"
        db.session.commit()
        
        updated_booking = Booking.query.get(test_booking.id)
        print(f"Updated Booking Status: {updated_booking.status}")
        
        # Test 6: Delete the Booking
        print("\n--- Testing Delete ---")
        db.session.delete(updated_booking)
        db.session.commit()
        
        deleted_booking = Booking.query.get(test_booking.id)
        print(f"Booking exists after delete? {'Yes' if deleted_booking else 'No'}")
        
        print("\nAll database connectivity and CRUD operations completed successfully.")

if __name__ == '__main__':
    # Ensure uploads directory exists
    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
    init_and_test_db()
