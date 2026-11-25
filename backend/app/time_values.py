from datetime import datetime, timedelta, timezone

LOCAL_TIMEZONE = timezone(timedelta(hours=8))


def local_datetime(value: datetime) -> datetime:
    if value.tzinfo is not None:
        value = value.astimezone(LOCAL_TIMEZONE).replace(tzinfo=None)
    if value.year < 1000:
        raise ValueError("Date is out of range for MySQL DATETIME")
    return value
