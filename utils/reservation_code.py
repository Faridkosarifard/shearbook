import datetime
import random


def generate_reservation_code():
    today = datetime.date.today().strftime("%m%d")
    rand = random.randint(1000, 9999)
    return f"KR-{today}-{rand}"
