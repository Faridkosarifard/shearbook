import bcrypt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from entity import User
from entity.base import Base

engine = create_engine("postgresql://postgres:postgres@localhost:5432/postgres")
SessionLocal = sessionmaker(bind=engine)
session = SessionLocal()


username = input("👤 Benutzername für Admin: ").strip()
password = input("🔐 Passwort: ").strip()


existing = session.query(User).filter_by(username=username).first()
if existing:
    print(f"⚠️ Benutzer '{username}' existiert bereits.")
else:
    hashed_pw = bcrypt.hashpw(password.encode(), bcrypt.gensalt())
    admin = User(username=username, password=hashed_pw.decode())
    session.add(admin)
    session.commit()
    print(f"✅ Admin '{username}' wurde erfolgreich erstellt.")
