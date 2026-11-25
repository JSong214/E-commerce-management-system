from datetime import date, datetime, time
from typing import Annotated

from pydantic import (
    BaseModel,
    BeforeValidator,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from .domain import DataSource, NormalizedStatus, Platform, RecordId, TimeBasis
from .time_values import local_datetime


def parse_filter_date(value):
    if isinstance(value, str):
        try:
            if len(value) == 10 and value[4] == value[7] == "-":
                result = date.fromisoformat(value)
                if result.year >= 1000:
                    return result
            if len(value) > 10 and value[10] in ("T", " "):
                return local_datetime(datetime.fromisoformat(value))
        except (OverflowError, ValueError):
            pass
    raise ValueError("Use YYYY-MM-DD or an ISO datetime")


DateInput = Annotated[date | datetime, BeforeValidator(parse_filter_date)]
PageNumber = Annotated[int, Field(ge=1, le=2**31 - 1)]
PageSize = Annotated[int, Field(ge=1, le=200)]


def as_boundary(value, time_of_day):
    if value is None or isinstance(value, datetime):
        return value
    return datetime.combine(value, time_of_day)


class OrderScope(BaseModel):
    time_basis: TimeBasis = "order_time"
    date_from: DateInput | None = None
    date_to: DateInput | None = None
    platform: list[Platform] = Field(default_factory=list)
    shop_id: RecordId | None = None
    normalized_status: NormalizedStatus | None = None

    @field_validator("platform", mode="before")
    @classmethod
    def split_platforms(cls, value):
        values = [value] if isinstance(value, str) else value
        if not isinstance(values, list) or not all(
            isinstance(item, str) for item in values
        ):
            raise ValueError("Platform should be a string or a list of strings")
        return [
            part.strip() for item in values for part in item.split(",") if part.strip()
        ]

    @property
    def date_bounds(self):
        return as_boundary(self.date_from, time.min), as_boundary(
            self.date_to, time.max
        )

    @model_validator(mode="after")
    def validate_date_range(self):
        start, end = self.date_bounds
        if start is not None and end is not None and start > end:
            raise ValueError("date_from must be on or before date_to")
        return self


class OrderFilters(OrderScope):
    data_source: DataSource | None = None
    batch_id: RecordId | None = None
    keyword: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=512)] | None
    ) = None
    page: PageNumber = 1
    page_size: PageSize = 50


def scope_conditions(table, filters):
    timestamp = table.c[filters.time_basis]
    conditions = []
    if filters.time_basis == "pay_time":
        conditions.append(timestamp.is_not(None))
    start, end = filters.date_bounds
    if start is not None:
        conditions.append(timestamp >= start)
    if end is not None:
        conditions.append(timestamp <= end)
    if filters.platform:
        conditions.append(table.c.platform.in_(filters.platform))
    if filters.shop_id is not None:
        conditions.append(table.c.shop_id == filters.shop_id)
    if filters.normalized_status is not None:
        conditions.append(table.c.normalized_status == filters.normalized_status)
    return conditions
