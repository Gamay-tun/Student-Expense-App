from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask import request, jsonify
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
import os

# Load .env variables
load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "defaultsecretkey")

# SQLite DB config
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///students.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize DB and Login
db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# User model
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)

# Expense model
class Expense(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    date = db.Column(db.String(20))
    amount = db.Column(db.Float)
    category = db.Column(db.String(50))
    description = db.Column(db.String(200))

# User loader
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Routes
@app.route('/')
def index():
    return redirect(url_for('login'))

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        password = generate_password_hash(request.form['password'], method="pbkdf2:sha256")
        if User.query.filter_by(username=username).first():
            return "User already exists"
        new_user = User(username=username, password=password)
        db.session.add(new_user)
        db.session.commit()
        return redirect(url_for('login'))
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        user = User.query.filter_by(username=request.form['username']).first()
        if user and check_password_hash(user.password, request.form['password']):
            login_user(user)
            return redirect(url_for('dashboard'))
        return "Invalid credentials"
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/dashboard')
@login_required
def dashboard():
    expenses = Expense.query.filter_by(user_id=current_user.id).order_by(Expense.date.desc()).all()
    return render_template('dashboard.html', username=current_user.username, expenses=expenses)


@app.route('/add_expense', methods=['POST'])
@login_required
def add_expense():
    date = request.form['date']
    amount = float(request.form['amount'])
    category = request.form['category']
    description = request.form['description']

    new_expense = Expense(
        user_id=current_user.id,
        date=date,
        amount=amount,
        category=category,
        description=description
    )
    db.session.add(new_expense)
    db.session.commit()

    return redirect(url_for('dashboard'))

@app.route('/sync', methods=['POST'])
@login_required
def sync():
    expenses = request.get_json()

    for exp in expenses:
        # Check if already exists (optional, based on _id)
        new_exp = Expense(
            user_id=current_user.id,
            date=exp.get('date'),
            amount=exp.get('amount'),
            category=exp.get('category'),
            description=exp.get('description')
        )
        db.session.add(new_exp)

    db.session.commit()
    return jsonify({"status": "success"}), 200

@app.route('/api/expenses')
@login_required
def api_expenses():
    expenses = Expense.query.filter_by(user_id=current_user.id).order_by(Expense.date.desc()).all()
    return jsonify([
        {
            'id': exp.id, 
            'date': exp.date,
            'amount': exp.amount,
            'category': exp.category,
            'description': exp.description
        } for exp in expenses
    ])


@app.route('/delete-expense/<int:expense_id>', methods=['DELETE'])
@login_required
def delete_expense(expense_id):
    exp = Expense.query.get_or_404(expense_id)
    if exp.user_id != current_user.id:
        return "Unauthorized", 403
    db.session.delete(exp)
    db.session.commit()
    return '', 204

@app.route('/edit-expense/<int:expense_id>', methods=['PUT'])
@login_required
def edit_expense(expense_id):
    exp = Expense.query.get_or_404(expense_id)
    if exp.user_id != current_user.id:
        return "Unauthorized", 403
    data = request.get_json()
    exp.date = data['date']
    exp.amount = data['amount']
    exp.category = data['category']
    exp.description = data['description']
    db.session.commit()
    return '', 204


# Create DB if not exists
with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(debug=True)
