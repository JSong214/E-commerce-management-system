from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from .db import Db, record_json
from .domain import BooleanFlag
from .errors import ApiError
from .import_cleaning import money_or_none
from .seed import SALES_RULES

router = APIRouter(prefix="/sales-rules", tags=["Sales Rules"])


class RuleUpdate(BaseModel):
    enabled: BooleanFlag
    config_json: dict


def check_rule_config(key, config):
    defaults = next((values for name, _, _, values, _ in SALES_RULES if name == key), {})
    for field, value in config.items():
        default = defaults.get(field)
        if field in {"threshold", "low_amount_notice_threshold"} and default is not None:
            amount = money_or_none(value)
            valid = amount is not None and amount >= 0
        elif isinstance(default, bool):
            valid = isinstance(value, bool)
        elif isinstance(default, list):
            valid = isinstance(value, list) and all(isinstance(item, str) and len(item) <= 128 for item in value)
        elif isinstance(default, dict):
            valid = isinstance(value, dict) and all(
                isinstance(brand, str) and isinstance(alias, str) and 0 < len(alias) <= 64
                for brand, alias in value.items()
            )
        elif isinstance(default, str):
            valid = isinstance(value, str) and len(value) <= (64 if field == "exclude_reason" else 128)
            if field == "amount_field":
                valid = valid and value in {"payable_amount", "paid_amount"}
        else:
            continue
        if not valid:
            raise ApiError(422, "VALIDATION_ERROR", "销售规则的配置值无效", {"field": field})


def load_rules(conn, table):
    defaults = {
        key: {"enabled": True, "config_json": config}
        for key, _, _, config, _ in SALES_RULES
    }
    for row in conn.execute(select(table)).mappings():
        key = row["rule_key"]
        if key in defaults:
            defaults[key] = {
                "enabled": bool(row["enabled"]),
                "config_json": {**defaults[key]["config_json"], **row["config_json"]},
            }
    return defaults


def rule_json(row):
    result = record_json(row, flags=("enabled",))
    result.pop("id")
    return result


@router.get("")
def list_sales_rules(db: Db):
    table = db.tables["sales_rules"]
    with db.engine.connect() as conn:
        rows = conn.execute(select(table).order_by(table.c.id)).mappings()
        return {"items": [rule_json(row) for row in rows]}


@router.put("/{rule_key}")
def update_sales_rule(rule_key: str, body: RuleUpdate, db: Db):
    table = db.tables["sales_rules"]
    lookup = select(table).where(table.c.rule_key == rule_key)
    with db.engine.begin() as conn:
        row = conn.execute(lookup.with_for_update()).mappings().one_or_none()
        if row is None:
            raise ApiError(404, "RULE_NOT_FOUND", "销售规则不存在")
        check_rule_config(row["rule_key"], body.config_json)
        conn.execute(table.update().where(table.c.id == row["id"]).values(**body.model_dump()))
        return rule_json(conn.execute(lookup).mappings().one())
