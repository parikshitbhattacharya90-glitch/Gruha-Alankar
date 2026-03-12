from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, session
from config import Config
from models import db, User, Design, Furniture, Booking
from werkzeug.utils import secure_filename
import os
import json

from services.ai_generator import ai_generator

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in Config.ALLOWED_EXTENSIONS

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)

    @app.route('/')
    def index():
        return render_template('index.html')

    @app.route('/register', methods=['GET', 'POST'])
    def register():
        if 'user_id' in session:
            return redirect(url_for('index'))
            
        if request.method == 'POST':
            username = request.form.get('username')
            email = request.form.get('email')
            password = request.form.get('password')
            
            if User.query.filter_by(username=username).first() or User.query.filter_by(email=email).first():
                flash('Username or email already exists.', 'error')
                return redirect(url_for('register'))
                
            user = User(username=username, email=email)
            user.set_password(password)
            db.session.add(user)
            db.session.commit()
            
            flash('Registration successful! Please login.', 'success')
            return redirect(url_for('login'))
            
        return render_template('register.html')

    @app.route('/login', methods=['GET', 'POST'])
    def login():
        if 'user_id' in session:
            return redirect(url_for('index'))
            
        if request.method == 'POST':
            email = request.form.get('email')
            password = request.form.get('password')
            
            user = User.query.filter_by(email=email).first()
            if user and user.check_password(password):
                session['user_id'] = user.id
                session['username'] = user.username
                flash('Logged in successfully.', 'success')
                return redirect(url_for('studio'))
            else:
                flash('Invalid email or password.', 'error')
                
        return render_template('login.html')

    @app.route('/logout')
    def logout():
        session.clear()
        flash('You have been logged out.', 'info')
        return redirect(url_for('index'))

    @app.route('/studio')
    def studio():
        if 'user_id' not in session:
            flash('Please log in to access the Design Studio.', 'warning')
            return redirect(url_for('login'))
        return render_template('studio.html')

    @app.route('/catalog')
    def catalog():
        furniture_items = Furniture.query.all()
        return render_template('catalog.html', items=furniture_items)

    @app.route('/dashboard')
    def dashboard():
        if 'user_id' not in session:
            flash('Please log in to view your dashboard.', 'warning')
            return redirect(url_for('login'))
        user_designs = Design.query.filter_by(user_id=session['user_id']).all()
        user_bookings = Booking.query.filter_by(user_id=session['user_id']).all()
        return render_template('dashboard.html', designs=user_designs, bookings=user_bookings)

    @app.route('/api/book', methods=['POST'])
    def book_furniture():
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        
        furniture_id = request.json.get('furniture_id')
        if not furniture_id:
            return jsonify({'error': 'No furniture ID provided'}), 400
            
        booking = Booking(user_id=session['user_id'], furniture_id=furniture_id)
        db.session.add(booking)
        db.session.commit()
        
        return jsonify({'success': True, 'message': 'Booking request submitted via voice assistant.'}), 200

    @app.route('/api/upload-design', methods=['POST'])
    def upload_design():
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
            
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400
            
        file = request.files['image']
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400
            
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            
            style = request.form.get('style', 'Modern Minimalist')
            room_type = request.form.get('room_type', 'Living Room')
            
            # --- AI Design Generation Trigger ---
            ai_result = ai_generator.generate_design(filepath, style, room_type)
            
            if ai_result.get('status') == 'failed':
                return jsonify({'error': ai_result.get('error')}), 500
                
            # Create a DB Design record linking the AI generated JSON
            new_design = Design(
                user_id=session['user_id'],
                title=f"{style} {room_type} Design",
                room_type=room_type,
                style=style,
                image_path=filepath,
                ai_output=json.dumps(ai_result)  # Storing the structured JSON in the DB
            )
            db.session.add(new_design)
            db.session.commit()
            
            return jsonify({
                'success': True, 
                'message': 'Image processed successfully',
                'filepath': filepath,
                'design_id': new_design.id,
                'ai_analysis': ai_result
            }), 200
            
        return jsonify({'error': 'Invalid file type'}), 400

    return app

if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        # Create database tables if they do not exist
        db.create_all()
    app.run(host='0.0.0.0', debug=True)
