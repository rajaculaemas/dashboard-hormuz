#!/usr/bin/env python3
import os
import sys
import json
import datetime
import mysql.connector
from mysql.connector import Error

DB_NAME = "copilot"

# ==== TUNING DEFAULT (ubah di sini kalau perlu) ====
CASE_LIMIT = 1           # berapa case terbaru yang ditarik
CHILD_LIMIT = 200          # limit per tabel child (history/event/comment/etc) per alert
ASSET_LIMIT = 200          # limit asset per alert
ASSET_CONTEXT_LIMIT = 200  # limit context per alert
CASE_ORDER_BY = "c.`case_creation_time` DESC"  # fallback kalau kolom ada
# ================================================


def connect():
    host = os.getenv("MYSQL_HOST", "100.100.12.41")
    port = int(os.getenv("MYSQL_PORT", "3306"))
    user = os.getenv("MYSQL_USER", "copilot")
    password = os.getenv("MYSQL_PASSWORD","POUTHBLJvhvcasgFDS98")

    if not password:
        print("ERROR: set MYSQL_PASSWORD dulu. Contoh: export MYSQL_PASSWORD='...'", file=sys.stderr)
        sys.exit(1)

    return mysql.connector.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=DB_NAME,
        connection_timeout=10,
    )


def sanitize_identifier(name: str) -> str:
    return f"`{name.replace('`', '``')}`"


def get_columns(cur, table: str):
    cur.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema=%s AND table_name=%s
        ORDER BY ordinal_position
        """,
        (DB_NAME, table),
    )
    return [r[0] for r in cur.fetchall()]


def has_table(cur, table: str) -> bool:
    cur.execute(
        """
        SELECT COUNT(*)
        FROM information_schema.tables
        WHERE table_schema=%s AND table_name=%s
        """,
        (DB_NAME, table),
    )
    return cur.fetchone()[0] > 0


def has_column(cur, table: str, column: str) -> bool:
    cur.execute(
        """
        SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_schema=%s AND table_name=%s AND column_name=%s
        """,
        (DB_NAME, table, column),
    )
    return cur.fetchone()[0] > 0


def rows_to_jsonable(rows, columns):
    out = []
    for row in rows:
        item = {}
        for i, col in enumerate(columns):
            v = row[i]
            if isinstance(v, (bytes, bytearray)):
                item[col] = v.hex()
            else:
                item[col] = v
        out.append(item)
    return out


def fetch_by_alert_id(cur, table: str, alert_id: int, limit: int, order_by: str | None):
    if not has_table(cur, table):
        return []

    cols = get_columns(cur, table)
    select_cols = ", ".join(sanitize_identifier(c) for c in cols)

    sql = f"SELECT {select_cols} FROM {sanitize_identifier(table)} WHERE `alert_id`=%s"
    params = [alert_id]

    if order_by:
        sql += f" ORDER BY {order_by}"
    else:
        for c in ["changed_at", "created_at", "timestamp", "id"]:
            if c in cols:
                sql += f" ORDER BY {sanitize_identifier(c)} DESC"
                break

    sql += " LIMIT %s"
    params.append(limit)

    cur.execute(sql, params)
    return rows_to_jsonable(cur.fetchall(), cols)


def fetch_tags_for_alert(cur, alert_id: int, limit: int):
    if not has_table(cur, "incident_management_alert_to_tag") or not has_table(cur, "incident_management_alerttag"):
        return {"mapping": [], "tags": []}

    mapping = fetch_by_alert_id(cur, "incident_management_alert_to_tag", alert_id, limit=limit, order_by=None)
    tag_ids = sorted({m.get("tag_id") for m in mapping if m.get("tag_id") is not None})

    tags = []
    if tag_ids and has_column(cur, "incident_management_alerttag", "id"):
        cols = get_columns(cur, "incident_management_alerttag")
        select_cols = ", ".join(sanitize_identifier(c) for c in cols)
        placeholders = ", ".join(["%s"] * len(tag_ids))
        cur.execute(
            f"SELECT {select_cols} FROM `incident_management_alerttag` WHERE `id` IN ({placeholders})",
            tag_ids,
        )
        tags = rows_to_jsonable(cur.fetchall(), cols)

    return {"mapping": mapping, "tags": tags}


def fetch_iocs_for_alert(cur, alert_id: int, limit: int):
    if not has_table(cur, "incident_management_alert_to_ioc") or not has_table(cur, "incident_management_ioc"):
        return {"mapping": [], "iocs": []}

    mapping = fetch_by_alert_id(cur, "incident_management_alert_to_ioc", alert_id, limit=limit, order_by=None)

    iocs = []
    if has_column(cur, "incident_management_ioc", "id"):
        ioc_ids = sorted({m.get("ioc_id") for m in mapping if m.get("ioc_id") is not None})
        if ioc_ids:
            cols = get_columns(cur, "incident_management_ioc")
            select_cols = ", ".join(sanitize_identifier(c) for c in cols)
            placeholders = ", ".join(["%s"] * len(ioc_ids))
            cur.execute(
                f"SELECT {select_cols} FROM `incident_management_ioc` WHERE `id` IN ({placeholders})",
                ioc_ids,
            )
            iocs = rows_to_jsonable(cur.fetchall(), cols)

    return {"mapping": mapping, "iocs": iocs}


def fetch_assets_for_alert(cur, alert_id: int):
    if not has_table(cur, "incident_management_asset"):
        return {"assets": [], "contexts": [], "notes": ["skip asset: table incident_management_asset not found"]}

    cols_a = get_columns(cur, "incident_management_asset")
    select_a = ", ".join(f"a.{sanitize_identifier(c)}" for c in cols_a)

    cur.execute(
        f"""
        SELECT {select_a}
        FROM `incident_management_asset` a
        WHERE a.`alert_linked`=%s
        ORDER BY a.`id` DESC
        LIMIT %s
        """,
        (alert_id, ASSET_LIMIT),
    )
    assets = rows_to_jsonable(cur.fetchall(), cols_a)

    contexts = []
    notes = []
    if assets and has_table(cur, "incident_management_alertcontext"):
        context_ids = sorted({a.get("alert_context_id") for a in assets if a.get("alert_context_id") is not None})
        if context_ids:
            cols_c = get_columns(cur, "incident_management_alertcontext")
            select_c = ", ".join(sanitize_identifier(c) for c in cols_c)
            placeholders = ", ".join(["%s"] * len(context_ids))

            cur.execute(
                f"""
                SELECT {select_c}
                FROM `incident_management_alertcontext`
                WHERE `id` IN ({placeholders})
                LIMIT %s
                """,
                (*context_ids, ASSET_CONTEXT_LIMIT),
            )
            contexts = rows_to_jsonable(cur.fetchall(), cols_c)
    else:
        if not has_table(cur, "incident_management_alertcontext"):
            notes.append("skip alertcontext: table not found")

    return {"assets": assets, "contexts": contexts, "notes": notes}


def fetch_root_alert(cur, alert_id: int):
    cols = get_columns(cur, "incident_management_alert")
    select_cols = ", ".join(sanitize_identifier(c) for c in cols)
    cur.execute(f"SELECT {select_cols} FROM `incident_management_alert` WHERE `id`=%s LIMIT 1", (alert_id,))
    row = cur.fetchone()
    if not row:
        return None
    return rows_to_jsonable([row], cols)[0]


def bundle_alert(cur, alert_id: int):
    root = fetch_root_alert(cur, alert_id)
    if not root:
        return None

    children = {
        "incident_management_alert_history": fetch_by_alert_id(cur, "incident_management_alert_history", alert_id, CHILD_LIMIT, "changed_at DESC"),
        "incident_management_alertevent": fetch_by_alert_id(cur, "incident_management_alertevent", alert_id, CHILD_LIMIT, "created_at DESC"),
        "incident_management_comment": fetch_by_alert_id(cur, "incident_management_comment", alert_id, CHILD_LIMIT, "created_at DESC"),
        "tags": fetch_tags_for_alert(cur, alert_id, CHILD_LIMIT),
        "iocs": fetch_iocs_for_alert(cur, alert_id, CHILD_LIMIT),
    }

    asset_bundle = fetch_assets_for_alert(cur, alert_id)

    return {
        "alert_id": alert_id,
        "root": root,
        "children": children,
        "assets": asset_bundle["assets"],
        "asset_contexts": asset_bundle["contexts"],
        "notes": asset_bundle["notes"],
    }


def fetch_cases(cur):
    cols = get_columns(cur, "incident_management_case")
    select_cols = ", ".join(f"c.{sanitize_identifier(c)}" for c in cols)

    order_by = CASE_ORDER_BY if has_column(cur, "incident_management_case", "case_creation_time") else "c.`id` DESC"

    cur.execute(
        f"""
        SELECT {select_cols}
        FROM `incident_management_case` c
        ORDER BY {order_by}
        LIMIT %s
        """,
        (CASE_LIMIT,),
    )
    return rows_to_jsonable(cur.fetchall(), cols)


def fetch_case_alert_links(cur, case_id: int):
    if not has_table(cur, "incident_management_casealertlink"):
        return []

    cols = get_columns(cur, "incident_management_casealertlink")
    select_cols = ", ".join(sanitize_identifier(c) for c in cols)

    cur.execute(
        f"""
        SELECT {select_cols}
        FROM `incident_management_casealertlink`
        WHERE `case_id`=%s
        """,
        (case_id,),
    )
    return rows_to_jsonable(cur.fetchall(), cols)


def fetch_case_history(cur, case_id: int, limit: int):
    if not has_table(cur, "incident_management_case_history"):
        return []

    cols = get_columns(cur, "incident_management_case_history")
    select_cols = ", ".join(sanitize_identifier(c) for c in cols)

    sql = f"SELECT {select_cols} FROM {sanitize_identifier('incident_management_case_history')} WHERE `case_id`=%s"
    params = [case_id]

    # Try to order by changed_at DESC, fallback to id DESC
    if has_column(cur, "incident_management_case_history", "changed_at"):
        sql += " ORDER BY `changed_at` DESC"
    else:
        sql += " ORDER BY `id` DESC"

    sql += " LIMIT %s"
    params.append(limit)

    cur.execute(sql, params)
    return rows_to_jsonable(cur.fetchall(), cols)


def main():
    try:
        # Terima Case ID dari command-line argument atau user input
        case_id = None
        
        if len(sys.argv) > 1:
            try:
                case_id = int(sys.argv[1])
            except ValueError:
                print(f"ERROR: Case ID harus berupa angka. Anda input: {sys.argv[1]}", file=sys.stderr)
                sys.exit(1)
        else:
            try:
                case_id = int(input("Masukkan Case ID: "))
            except ValueError:
                print("ERROR: Case ID harus berupa angka.", file=sys.stderr)
                sys.exit(1)
        
        conn = connect()
        cur = conn.cursor()

        if not has_table(cur, "incident_management_case") or not has_table(cur, "incident_management_casealertlink"):
            print("ERROR: butuh tabel incident_management_case dan incident_management_casealertlink", file=sys.stderr)
            sys.exit(2)

        # Fetch specific case by ID
        cols = get_columns(cur, "incident_management_case")
        select_cols = ", ".join(f"c.{sanitize_identifier(c)}" for c in cols)
        
        cur.execute(
            f"""
            SELECT {select_cols}
            FROM `incident_management_case` c
            WHERE c.`id`=%s
            LIMIT 1
            """,
            (case_id,),
        )
        case_row = cur.fetchone()
        
        if not case_row:
            print(f"ERROR: Case ID {case_id} tidak ditemukan di database.", file=sys.stderr)
            cur.close()
            conn.close()
            sys.exit(1)
        
        case = rows_to_jsonable([case_row], cols)[0]
        
        # Fetch case alert links
        links = fetch_case_alert_links(cur, case_id)
        
        # Fetch case history
        case_history = fetch_case_history(cur, case_id, CHILD_LIMIT)
        
        alert_ids = []
        for l in links:
            aid = l.get("alert_id")
            if aid is not None:
                alert_ids.append(aid)
        
        # Bundle alerts per case
        alerts = []
        for aid in alert_ids:
            b = bundle_alert(cur, aid)
            if b:
                alerts.append(b)
        
        payload = {
            "db": DB_NAME,
            "generated_at": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
            "mode": "case_by_id",
            "limits": {
                "case_limit": CASE_LIMIT,
                "child_limit": CHILD_LIMIT,
                "asset_limit": ASSET_LIMIT,
                "asset_context_limit": ASSET_CONTEXT_LIMIT,
            },
            "count": 1,
            "cases": [
                {
                    "case_id": case_id,
                    "case": case,
                    "case_history": case_history,
                    "case_alert_links": links,
                    "alerts": alerts,
                }
            ],
        }

        cur.close()
        conn.close()

        print(json.dumps(payload, ensure_ascii=False, default=str, indent=2))

    except Error as e:
        print(f"MySQL error: {e}", file=sys.stderr)
        sys.exit(10)


if __name__ == "__main__":
    main()
