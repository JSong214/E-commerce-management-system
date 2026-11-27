import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from typing import NamedTuple

from sqlalchemy import select

from .import_cleaning import NULL_PLACEHOLDERS
from .import_parser import cell_text

ERP_SOURCES = {"jushuitan", "manual"}
PLATFORM_CHANNEL = {
    "jd": "jd_sku_id", "tmall": "tm_sku_id", "pdd": "pdd_sku_id",
    "douyin": "dy_sku_id", "taobao": "tb_sku_id",
}
SKU_FALLBACKS = {
    "jd": ("jst_sku_id", "merchant_code"),
    "tmall": ("jst_sku_id",),
    "douyin": ("jst_i_id", "merchant_code"),
    "pdd": ("jst_sku_id", "jst_i_id"),
    "taobao": ("merchant_code",),
}
EXCEL_ESCAPE = re.compile(r"_x([0-9a-f]{4})_", re.IGNORECASE)
KFR_TOKEN = re.compile(r"KFR-[A-Z0-9][A-Z0-9/+._()-]*", re.IGNORECASE)
CHINESE_SPACE = re.compile(r"[\s\u3400-\u9fff]+")
PENDING_MODEL_STATUSES = ("ambiguous", "unmatched")


def text_key(value):
    folded = unicodedata.normalize("NFKD", (value or "").strip()).casefold()
    return "".join(character for character in folded if not unicodedata.combining(character))


def decode_model_text(value):
    decoded = EXCEL_ESCAPE.sub(lambda match: chr(int(match[1], 16)), value or "")
    return unicodedata.normalize("NFKC", decoded).strip()


def model_key(value):
    return text_key(CHINESE_SPACE.sub("", decode_model_text(value)))


class ChannelKey(NamedTuple):
    channel_type: str
    external_id: str
    secondary_external_id: str = ""


def raw_id(raw, field):
    value = cell_text(raw.get(field)).removeprefix("'").strip()
    return "" if value.casefold() in NULL_PLACEHOLDERS else value


def channel_keys(line, *, full_name=False):
    product = line.get("product_id")
    sku = line.get("sku_code")
    spec = line.get("sku_spec") or ""
    raw = line.get("raw_extra") or {}
    title = line.get("product_name") or ""
    source = line["data_source"]
    platform = line["platform"]
    candidates = []
    if not full_name and source in ERP_SOURCES:
        style = raw_id(raw, "款号")
        skus = [raw_id(raw, "商品编码"), raw_id(raw, "原始商品编码"), sku]
        if style and (paired_sku := next((value for value in skus if value), None)):
            candidates.append(ChannelKey("jst_i_id", style, paired_sku))
        candidates.extend(ChannelKey("jst_sku_id", value, style or spec) for value in skus)
        candidates.extend((
            ChannelKey("jst_i_id", style),
            ChannelKey(PLATFORM_CHANNEL.get(platform), raw_id(raw, "店铺款式编码") or product, spec),
        ))
    elif not full_name:
        source = source if source in PLATFORM_CHANNEL else platform
        external = (sku or product) if source == "tmall" else product
        candidates.append(ChannelKey(PLATFORM_CHANNEL.get(source), external, spec))
        candidates.extend(ChannelKey(channel, sku, spec) for channel in SKU_FALLBACKS.get(source, ()))
    candidates.append(ChannelKey("custom_title", title))
    candidates = [
        key._replace(secondary_external_id="") if len(key.secondary_external_id) > 191 else key
        for key in candidates
    ]
    return [
        key for key in dict.fromkeys(candidates)
        if key.channel_type and key.external_id and len(key.external_id) <= 191
    ]


def candidate_json(model):
    return {
        "model_id": model["id"],
        **{name: model[name] for name in ("standard_model", "brand", "category")},
    }


@dataclass(frozen=True)
class ModelMatch:
    status: str = "unmatched"
    method: str | None = None
    model_id: int | None = None
    candidates: list | None = None
    channel_key: ChannelKey | None = None

    def line_values(self):
        return {
            "resolved_model_id": self.model_id,
            "model_match_status": self.status,
            "model_match_method": self.method,
            "model_match_candidates": self.candidates,
        }


class ProductMatcher:
    def __init__(self, conn, tables):
        models = tables["product_models"]
        self.models = {row["id"]: row for row in conn.execute(select(models)).mappings()}
        active = {id: row for id, row in self.models.items() if row["is_active"]}
        self.full_names = defaultdict(set)
        self.standard_models = defaultdict(set)
        self.components = defaultdict(set)
        self.mappings = defaultdict(set)

        for id, row in active.items():
            self.full_names[text_key(row["standard_model"])].add(id)
            key = model_key(row["standard_model"])
            if key:
                self.standard_models[key].add(id)

        for row in conn.execute(select(tables["product_unit_components"])).mappings():
            if row["model_id"] in active:
                for value in (row["component_model"], row["mapping_value"]):
                    if key := model_key(value):
                        self.components[key].add(row["model_id"])

        mappings = tables["product_channel_mappings"]
        for row in conn.execute(select(mappings).where(mappings.c.is_active == 1)).mappings():
            if row["model_id"] in active:
                key = (
                    row["channel_type"], text_key(row["external_id"]),
                    text_key(row["secondary_external_id"]), row["shop_scope_id"],
                )
                self.mappings[key].add(row["model_id"])

    def lookup(self, key, shop_id, *, skip_plain_global=False):
        channel, external, secondary = key
        lookup = (channel, text_key(external))
        secondary = text_key(secondary)
        tiers = [(secondary, shop_id), ("", shop_id), (secondary, 0)]
        if not skip_plain_global:
            tiers.append(("", 0))
        for tier in dict.fromkeys(tiers):
            if hits := self.mappings.get((*lookup, *tier)):
                return hits
        return set()

    def result(self, ids, method, channel_key=None):
        if len(ids) == 1:
            return ModelMatch("matched", method, next(iter(ids)), channel_key=channel_key)
        return ModelMatch(
            "ambiguous", method, candidates=[
                candidate_json(self.models[id]) for id in sorted(ids)
            ], channel_key=channel_key,
        )

    def match(self, line, shop):
        if line.get("model_match_status") == "manual_confirmed" and (
            line.get("resolved_model_id") in self.models
        ):
            return ModelMatch("manual_confirmed", line["model_match_method"], line["resolved_model_id"])

        full_name = bool(shop["preserve_full_product_name"])
        if full_name:
            if ids := self.full_names.get(text_key(line["product_name"])):
                return self.result(ids, "3c_full_name")
        keys = channel_keys(line, full_name=full_name)
        for key in keys:
            paired = line["data_source"] in ERP_SOURCES and (
                key.channel_type == "jst_i_id" and bool(key.secondary_external_id)
            )
            ids = self.lookup(key, shop["id"], skip_plain_global=paired)
            if paired and not ids:
                channel, style, sku = map(text_key, key)
                ids = self.mappings.get((channel, style, "", 0), set()) & self.mappings.get(
                    ("jst_sku_id", sku, "", 0), set()
                )
            if ids:
                return self.result(ids, key.channel_type, key)
        if full_name:
            return ModelMatch(channel_key=next(iter(keys), None))

        hints = [line.get(field) for field in ("raw_model_hint", "sku_code", "sku_spec")]
        if line["data_source"] in ERP_SOURCES:
            hints.extend(raw_id(line["raw_extra"], field) for field in ("标准商品名", "款号"))
        exact = [model_key(value) for value in hints]
        tokens = [
            model_key(token)
            for value in [*hints, line.get("product_name")]
            for token in KFR_TOKEN.findall(decode_model_text(value))
        ]
        for values, index, method in (
            (exact + tokens, self.components, "component_model"),
            (exact, self.standard_models, "standard_model_exact"),
            (tokens, self.standard_models, "kfr_extract"),
        ):
            ids = set().union(*(index.get(key, set()) for key in values))
            if ids:
                return self.result(ids, method)
        return ModelMatch(channel_key=next(iter(keys), None))
