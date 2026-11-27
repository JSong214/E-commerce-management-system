import csv
import re
import unicodedata
from io import StringIO
from pathlib import Path
from xml.etree.ElementTree import ParseError
from zipfile import BadZipFile

import xlrd
from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException

from .errors import ApiError

MAX_ROWS = 100_000
PII_HEADERS = (
    "收件人",
    "收货人",
    "收货人姓名",
    "收件人手机号",
    "手机",
    "电话",
    "联系电话",
    "联系方式备注",
    "收货人地址",
    "详细地址",
    "地址(包含省市区)",
    "区",
    "区县",
    "街道",
    "买家昵称",
    "下单帐号",
    "邮箱地址",
    "纳税人识别号",
    "名称（个人）",
    "单位地址",
    "单位电话",
    "开户银行",
    "银行账号",
    "门店联系人",
    "门店联系电话",
    "门店地址",
)


def header_key(header):
    return unicodedata.normalize("NFKC", header).strip().casefold()


PII_KEYS = {header_key(header) for header in PII_HEADERS}
TEXT_FORMULA = re.compile(r'^="((?:[^"]|"")*)"$')


def cell_text(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    text = str(value).strip()
    match = TEXT_FORMULA.fullmatch(text)
    return match[1].replace('""', '"').strip() if match else text


def match_template(headers, templates):
    header_keys = {header_key(header) for header in headers}
    highest_score = (0, 0)
    best = None
    for template in templates:
        fingerprint = {header_key(header) for header in template["header_fingerprint"]}
        common = len(fingerprint & header_keys)
        if common:
            if template["code"] == "tmall_erp_a":
                if common != len(fingerprint):
                    continue
                score = (2, common)
            else:
                score = (common / len(fingerprint), common)
            if score > highest_score:
                highest_score = score
                best = template
    if best is None:
        return None, None
    match = {key: best[key] for key in ("id", "code", "name", "data_source")}
    match["match_score"] = min(1.0, round(highest_score[0], 4))
    return best, match


def read_sheet(rows, templates):
    stream = iter(rows)
    raw_headers = next(
        (row for row in stream if any(cell_text(cell) for cell in row)), ()
    )
    headers = [cell_text(cell) for cell in raw_headers]
    template, matched = match_template(headers, templates)
    extra_pii = template["rules"].get("pii_columns", []) if template else []
    pii_keys = PII_KEYS | {header_key(header) for header in extra_pii}
    keep = []
    detected = []
    for index, header in enumerate(headers):
        if header_key(header) in pii_keys:
            detected.append(header)
        elif header:
            keep.append((index, header))
    clean_headers = [header for _, header in keep]
    if len(clean_headers) != len(set(clean_headers)):
        raise ApiError(422, "DUPLICATE_HEADERS", "表格中有重名的列，请重命名后重新上传")

    sanitized = []
    for row_number, row in enumerate(stream, start=1):
        values = {
            header: cell_text(row[index]) if index < len(row) else ""
            for index, header in keep
        }
        if not any(values.values()):
            continue
        sanitized.append({"row_number": row_number, "values": values})
        if len(sanitized) > MAX_ROWS:
            raise ApiError(
                422, "TOO_MANY_ROWS", f"每个工作表最多支持 {MAX_ROWS} 行数据"
            )
    if matched is not None:
        shop_headers = template["column_mapping"].get("shop_name", [])
        if isinstance(shop_headers, str):
            shop_headers = [shop_headers]
        present_shop_headers = [
            header for header in shop_headers if header in clean_headers
        ]
        if not present_shop_headers:
            matched["needs_default_shop"] = True
        elif not sanitized:
            matched["needs_default_shop"] = False
        else:
            matched["needs_default_shop"] = not any(
                row["values"].get(header)
                for row in sanitized
                for header in present_shop_headers
            )
    return {
        "headers": clean_headers,
        "rows": sanitized,
        "pii_columns_detected": list(dict.fromkeys(detected)),
        "matched_template": matched,
    }


def read_csv(file, templates):
    data = file.read()
    for encoding in (
        ("utf-8-sig",) if data.startswith(b"\xef\xbb\xbf") else ("utf-8", "gb18030")
    ):
        try:
            decoded = data.decode(encoding)
        except UnicodeDecodeError:
            continue
        rows = csv.reader(StringIO(decoded, newline=""), strict=True)
        return encoding, {"Sheet1": read_sheet(rows, templates)}
    raise ApiError(
        422, "UNSUPPORTED_ENCODING", "CSV 文件须使用 UTF-8 或 GB18030/GBK 编码"
    )


def legacy_rows(book, sheet):
    for row in sheet.get_rows():
        yield [
            xlrd.xldate_as_datetime(cell.value, book.datemode)
            if cell.ctype == xlrd.XL_CELL_DATE
            else cell.value
            for cell in row
        ]


def parse_upload(file, file_name, templates):
    extension = Path(file_name).suffix.lower()
    try:
        if extension == ".csv":
            return read_csv(file, templates)
        if extension == ".xlsx":
            book = load_workbook(file, read_only=True)
            try:
                return "binary", {
                    sheet.title: read_sheet(sheet.values, templates)
                    for sheet in book.worksheets
                }
            finally:
                book.close()
        if extension == ".xls":
            book = xlrd.open_workbook(file_contents=file.read())
            try:
                return "binary", {
                    sheet.name: read_sheet(legacy_rows(book, sheet), templates)
                    for sheet in book.sheets()
                }
            finally:
                book.release_resources()
    except (
        BadZipFile,
        InvalidFileException,
        xlrd.XLRDError,
        ParseError,
        KeyError,
        ValueError,
        csv.Error,
    ) as exc:
        raise ApiError(
            422, "INVALID_FILE", "无法读取文件，请检查文件格式和内容"
        ) from exc
    raise ApiError(422, "UNSUPPORTED_FILE_TYPE", "请上传 .csv、.xlsx 或 .xls 文件")
