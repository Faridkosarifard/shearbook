from sqlalchemy.exc import SQLAlchemyError

from entity import Service, Setting
from utils.db import SessionLocal


def seed_services(db):
    if db.query(Service).count() == 0:
        print("📦 Seeding services...")
        services = [
            Service(id=5, name="Damen Waschen, föhnen", duration_min=30, order=5),
            Service(id=6, name="Damen Strähne/Balayag", duration_min=120, order=6),
            Service(id=7, name="Damen Ansatz Farbe", duration_min=60, order=7),
            Service(id=8, name="Damen komplette Farbe", duration_min=60, order=8),
            Service(id=9, name="Damen Blondierung", duration_min=60, order=9),
            Service(id=10, name="Herren Strähne", duration_min=90, order=10),
            Service(id=11, name="Herren Dauerwelle", duration_min=60, order=11),
            Service(id=12, name="Damen Dauerwelle", duration_min=90, order=12),
            Service(id=13, name="Damen Extenstion", duration_min=60, order=13),
            Service(id=1, name="Herren Haarschnitt", duration_min=30, order=2),
            Service(id=2, name="Herren Haare und Bart", duration_min=60, order=1),
            Service(
                id=3, name="Damen Waschen, Schneiden, föhnen", duration_min=60, order=4
            ),
            Service(id=4, name="Damen Waschen, Schneiden", duration_min=30, order=3),
        ]
        db.add_all(services)


def seed_settings(db):
    if db.query(Setting).count() == 0:
        print("📦 Seeding settings...")
        settings = [
            Setting(key="admin_phone", value="49123456789"),
            Setting(key="instagram_link", value="https://instagram.com/your_salon"),
            Setting(key="google_review_link", value="https://example.com/review"),
            Setting(key="default_greeting", value="Willkommen bei Your Salon 💈"),
            Setting(
                key="reminder_text",
                value="📅 Erinnerung: Sie haben morgen um {time} einen Termin für {service}.",
            ),
            Setting(
                key="booking_text",
                value="✅ Termin gebucht!\n🧾 {service}\n📅 {date} um {time}\n👤 {name}\n🔐 Reservierungsnummer: {code}",
            ),
            Setting(
                key="cancel_text", value="❌ Ihr Termin wurde erfolgreich storniert."
            ),
            Setting(key="welcome_text", value="👋 Schön, dass Sie da sind!"),
            Setting(key="admin_name", value="Farid"),
            Setting(key="business_hours_start", value="09:00"),
            Setting(key="business_hours_end", value="18:00"),
            Setting(key="days_off", value="Sunday"),
            Setting(key="whatsapp_support_link", value="https://wa.me/49123456789"),
            Setting(key="email_contact", value="salon@example.com"),
            Setting(
                key="location_address", value="Example Street 1, 12345 Example Town"
            ),
            Setting(key="enable_auto_reminder", value="true"),
            Setting(key="reminder_time", value="09:00"),
            Setting(key="reminder_lead_days", value="1"),
            Setting(key="theme_color", value="#1E40AF"),
            Setting(key="logo_url", value="https://deine-domain.de/logo.png"),
            Setting(key="send_address_enabled", value="true"),
            Setting(key="send_instagram_google_enabled", value="true"),
            Setting(key="select_friseur_enabled", value="true"),
        ]
        db.add_all(settings)


def main():
    db = SessionLocal()
    try:
        seed_services(db)
        seed_settings(db)
        db.commit()
        print("✅ Seeding abgeschlossen.")
    except SQLAlchemyError as e:
        db.rollback()
        print("❌ Fehler beim Seeding:", e)
    finally:
        db.close()


if __name__ == "__main__":
    main()
