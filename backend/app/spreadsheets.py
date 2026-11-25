import csv
import json
from datetime import date, datetime
from decimal import Decimal
from io import TextIOWrapper
from tempfile import SpooledTemporaryFile

from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
from openpyxl.styles import Font, PatternFill

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def append_sheet(book, title, columns, rows, *, text_columns=(), money_columns=()):
    sheet = book.create_sheet(title)
    sheet.freeze_panes = "A2"
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="1F4E78")
    headers = []
    for column in columns:
        cell = WriteOnlyCell(sheet, value=column)
        cell.data_type = "s"
        cell.font = header_font
        cell.fill = header_fill
        headers.append(cell)
    sheet.append(headers)

    for row in rows:
        cells = []
        for name, value in zip(columns, row):
            if isinstance(value, dict):
                value = json.dumps(value, ensure_ascii=False)
            if name in money_columns and value is not None:
                value = Decimal(value)
            cell = WriteOnlyCell(sheet, value=value)
            if isinstance(value, str):
                cell.data_type = "s"
            if name in text_columns:
                cell.number_format = "@"
            elif name in money_columns:
                cell.number_format = "0.00"
            cells.append(cell)
        sheet.append(cells)


def binary_download(output, filename, media_type):
    output.seek(0)

    def read():
        with output:
            while chunk := output.read(64 * 1024):
                yield chunk

    return StreamingResponse(
        read(),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def xlsx_download(book, filename):
    # The response iterator closes the file once the download finishes.
    output = SpooledTemporaryFile(max_size=8 * 1024 * 1024)  # noqa: SIM115
    try:
        book.save(output)
    except BaseException:
        output.close()
        raise
    return binary_download(output, filename, XLSX_MEDIA_TYPE)


def csv_value(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, str) and (
        value.lstrip().startswith(("=", "+", "-", "@"))
        or value.startswith(("\t", "\r", "\n"))
    ):
        return "'" + value
    return value


def csv_download(columns, rows, filename):
    output = SpooledTemporaryFile(max_size=8 * 1024 * 1024)  # noqa: SIM115
    try:
        text_file = TextIOWrapper(output, encoding="utf-8-sig", newline="")
        writer = csv.writer(text_file)
        writer.writerow(columns)
        writer.writerows(tuple(csv_value(cell) for cell in row) for row in rows)
        output = text_file.detach()
    except BaseException:
        output.close()
        raise
    return binary_download(output, filename, "text/csv; charset=utf-8")


def error_workbook(errors):
    headers = {}
    grouped = {}
    for error in errors:
        raw = error["raw_row_sanitized"]
        headers.update(dict.fromkeys(raw))
        row = grouped.setdefault(error["row_number"], (raw, [], []))
        row[1].append(error["field_name"])
        row[2].append(error["error_message"])

    columns = [*headers, "错误行号", "错误字段", "错误原因"]
    rows = (
        [
            *(raw.get(header) for header in headers),
            number,
            "、".join(names),
            "\n".join(messages),
        ]
        for number, (raw, names, messages) in grouped.items()
    )
    book = Workbook(write_only=True)
    append_sheet(book, "错误行", columns, rows)
    return xlsx_download(book, "import-errors.xlsx")
