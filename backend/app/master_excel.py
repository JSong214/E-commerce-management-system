from pathlib import PureWindowsPath
from typing import Annotated

from fastapi import APIRouter, File, UploadFile
from pydantic import ValidationError
from sqlalchemy import select

from .db import Db
from .errors import ApiError
from .import_parser import header_key, parse_upload
from .products import (
    CATEGORY_FIELDS, MAPPING_KEY, CategoryInput, ChannelMappingInput, ComponentInput,
    ModelInput, mapping_conflicts, sync_model_categories,
)
from .shops import ShopInput

router = APIRouter(prefix="/master-data", tags=["Master Data"])

OPERATORS = {"自运营": "self_operated", "代运营": "agency_operated"}
PLATFORMS = {
    "淘宝": "taobao", "天猫": "tmall", "抖音": "douyin", "京东": "jd",
    "拼多多": "pdd", "焕新生活": "huanxin", "其他": "other",
}
SALES_MODES = {"经销": "dealer", "分销": "distribution", "混合": "hybrid", "未启用": None, "": None}
SHOP_STATUSES = {"启用": "active", "休眠": "dormant", "未启用": "inactive"}
UNIT_TYPES = {"内机": "indoor", "外机": "outdoor"}
CHANNELS = (
    "jst_i_id", "jst_sku_id", "pdd_sku_id", "tb_sku_id", "tm_sku_id", "dy_sku_id", "jd_sku_id",
)


def read_master(file):
    try:
        name = PureWindowsPath(file.filename or "").name
        if PureWindowsPath(name).suffix.lower() not in {".xlsx", ".xls"}:
            raise ApiError(422, "INVALID_MASTER_EXCEL", "请上传 Excel 工作簿")
        try:
            _, sheets = parse_upload(file.file, name, ())
        except ApiError as exc:
            raise ApiError(422, "INVALID_MASTER_EXCEL", str(exc)) from exc
        return sheets
    finally:
        file.file.close()


def master_rows(sheets, name, fields, *, optional=()):
    if name not in sheets:
        raise ApiError(422, "INVALID_MASTER_EXCEL", f"缺少工作表「{name}」")
    sheet = sheets[name]
    headers = {header_key(header): header for header in sheet["headers"]}
    chosen = {}
    missing = []
    for names in fields:
        labels = (names,) if isinstance(names, str) else names
        key = labels[0]
        header = next((headers[header_key(label)] for label in labels if header_key(label) in headers), None)
        if header:
            chosen[key] = header
        elif key not in optional:
            missing.append(key)
    if missing:
        raise ApiError(422, "INVALID_MASTER_EXCEL", f"工作表「{name}」缺少列", {"missing_headers": missing})
    return [
        (row["row_number"], {field: row["values"][header] for field, header in chosen.items()})
        for row in sheet["rows"]
    ]


def dictionary_values(sheets, name, fields):
    if name not in sheets:
        return None
    return {tuple(row.values()) for _, row in master_rows(sheets, name, fields)}


def lookup(conn, table, key):
    return conn.execute(
        select(table).where(*(table.c[name] == value for name, value in key.items()))
        .with_for_update()
    ).mappings().one_or_none()


def upsert_master(conn, table, values, key_fields):
    row = lookup(conn, table, {key: values[key] for key in key_fields})
    if row is None:
        id = conn.execute(table.insert().values(**values)).lastrowid
        return "inserted", id
    changes = {key: value for key, value in values.items() if key not in key_fields and row[key] != value}
    if changes:
        conn.execute(table.update().where(table.c.id == row["id"]).values(**changes))
        return "updated", row["id"]
    return "skipped", row["id"]


def enum_value(labels, value):
    return labels[header_key(value)]


@router.post("/shops/import-excel")
def import_shops(file: Annotated[UploadFile, File()], db: Db):
    sheets = read_master(file)
    rows = master_rows(sheets, "店铺信息", (
        ("店铺名称", "店铺"), ("运营", "运营方"), "平台", ("主体", "经营主体"),
        "销售模式", ("状态", "店铺状态"),
    ))
    operator_platform = dictionary_values(sheets, "运营方与平台", (("运营方", "运营"), "平台"))
    entities = dictionary_values(sheets, "主体", (("主体", "经营主体"),))
    modes = dictionary_values(sheets, "销售模式", ("销售模式",))
    statuses = dictionary_values(sheets, "店铺状态", (("状态", "店铺状态"),))
    result = {"total_rows": len(rows), "inserted": 0, "updated": 0, "skipped": 0, "warnings": []}
    with db.engine.begin() as conn:
        for number, row in rows:
            try:
                shop = ShopInput(
                    shop_name=row["店铺名称"],
                    operator_type=enum_value(OPERATORS, row["运营"]),
                    platform=enum_value(PLATFORMS, row["平台"]),
                    entity_name=row["主体"] or None,
                    sales_mode=enum_value(SALES_MODES, row["销售模式"]),
                    shop_status=enum_value(SHOP_STATUSES, row["状态"]),
                )
                if any(
                    dictionary is not None and all(values) and values not in dictionary
                    for dictionary, values in (
                        (operator_platform, (row["运营"], row["平台"])),
                        (entities, (row["主体"],)), (modes, (row["销售模式"] if shop.sales_mode else "",)),
                        (statuses, (row["状态"],)),
                    )
                ):
                    raise ValueError("运营方、平台、主体、销售模式或状态不在字典工作表中")
            except (KeyError, ValueError) as exc:
                result["skipped"] += 1
                result["warnings"].append(f"店铺信息第 {number} 行的店铺属性无效：{exc}")
                continue
            action, _ = upsert_master(
                conn, db.tables["shops"], shop.values(updating=True), ("shop_name",)
            )
            result[action] += 1
    return result


def import_categories(conn, tables, rows, counts, warnings):
    table = tables["product_categories"]
    for number, row in rows:
        try:
            category = CategoryInput(
                business_segment=row["业务板块"], category=row["品类"], brand=row["品牌"],
                report_brand=row.get("报表品牌") or None,
            )
        except ValidationError:
            warnings.append(f"产品分类第 {number} 行的业务板块、品类或品牌无效")
            continue
        values = category.model_dump(exclude={"report_brand"} if "报表品牌" not in row else set())
        action, id = upsert_master(conn, table, values, ("category", "brand"))
        if action != "skipped":
            counts[action] += 1
            sync_model_categories(conn, tables["product_models"], {**values, "id": id})


def import_models(conn, tables, rows, counts, warnings):
    for number, row in rows:
        category = lookup(conn, tables["product_categories"], {"category": row["品类"], "brand": row["品牌"]})
        if category is None:
            warnings.append(f"产品型号第 {number} 行找不到对应的产品分类")
            continue
        try:
            model = ModelInput(
                standard_model=row["型号"],
                is_3c_full_name=category["business_segment"].casefold() == "3c",
                **{field: category[field] for field in CATEGORY_FIELDS},
            )
        except ValidationError:
            warnings.append(f"产品型号第 {number} 行的型号无效")
            continue
        values = {**model.model_dump(exclude_unset=True), "category_id": category["id"]}
        action, _ = upsert_master(conn, tables["product_models"], values, ("standard_model",))
        if action != "skipped":
            counts[action] += 1


def import_components(conn, tables, rows, counts, warnings):
    for number, row in rows:
        model = lookup(conn, tables["product_models"], {"standard_model": row["型号"]})
        if model is None:
            warnings.append(f"产品内外机第 {number} 行找不到对应的标准型号")
            continue
        try:
            component = ComponentInput(
                component_model=row["内外机型号"], unit_type=enum_value(UNIT_TYPES, row["内外机分类"]),
                mapping_value=row.get("映射值") or None,
            )
        except (KeyError, ValidationError):
            warnings.append(f"产品内外机第 {number} 行的内外机型号、分类或映射值无效")
            continue
        values = {**component.model_dump(), "model_id": model["id"]}
        action, _ = upsert_master(
            conn, tables["product_unit_components"], values, ("component_model",)
        )
        if action != "skipped":
            counts[action] += 1


def import_channel_mappings(conn, tables, rows, counts, warnings):
    table = tables["product_channel_mappings"]
    for number, row in rows:
        model = lookup(conn, tables["product_models"], {"standard_model": row["型号"]})
        if model is None:
            warnings.append(f"产品ID匹配第 {number} 行找不到对应的标准型号")
            continue
        for channel in CHANNELS:
            if not row[channel]:
                continue
            try:
                mapping = ChannelMappingInput(
                    model_id=model["id"], channel_type=channel, external_id=row[channel].removeprefix("'"),
                    match_source="excel_import",
                )
            except ValidationError:
                warnings.append(f"产品ID匹配第 {number} 行的 {channel} 无效")
                continue
            values = mapping.model_dump(exclude={"is_active"})
            key = {field: values[field] for field in MAPPING_KEY}
            if lookup(conn, table, key) is None:
                conn.execute(table.insert().values(**values))
                counts["inserted"] += 1


@router.post("/products/import-excel")
def import_products(file: Annotated[UploadFile, File()], db: Db):
    sheets = read_master(file)
    channel_headers = [
        ("tm_sku_id", "tm_sku-id") if channel == "tm_sku_id" else channel
        for channel in CHANNELS
    ]
    rows = (
        master_rows(sheets, "产品分类", ("业务板块", "品类", "品牌", "报表品牌"), optional=("报表品牌",)),
        master_rows(sheets, "产品型号", ("品类", "品牌", ("型号", "标准型号"))),
        master_rows(sheets, "产品内外机", (
            ("型号", "标准型号"), "内外机型号", ("内外机分类", "内外机类型"), "映射值",
        )),
        master_rows(sheets, "产品ID匹配", (
            ("型号", "标准型号"), *channel_headers,
        )),
    )
    warnings = []
    result = {}
    with db.engine.begin() as conn:
        for key, importer, values in zip(
            ("categories", "models", "components", "channel_mappings"),
            (import_categories, import_models, import_components, import_channel_mappings),
            rows,
        ):
            counts = {"inserted": 0, "updated": 0}
            importer(conn, db.tables, values, counts, warnings)
            result[key] = counts
        groups, _ = mapping_conflicts(conn, db.tables)
    return {
        **result,
        "ambiguous_conflicts": [
            {
                "channel_type": channel, "external_id": external,
                "models": [model["standard_model"] for model in models],
            }
            for (channel, external), models in groups.items()
        ],
        "warnings": warnings,
    }
