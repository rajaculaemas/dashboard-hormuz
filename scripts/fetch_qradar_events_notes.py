#!/usr/bin/env python3
"""
Script untuk menarik related events dan notes dari QRadar untuk alerts yang belum punya data
Menggunakan START/STOP clause dengan 12-hour timeframe
"""

import os
import sys
import json
import psycopg2
import requests
import time
import uuid
import random
import string
from datetime import datetime, timedelta
from urllib.parse import quote
import urllib3
from dotenv import load_dotenv

# Disable SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def generate_cuid():
    """Generate CUID-like unique identifier"""
    # Format: c + timestamp + random chars
    # This mimics CUID but simpler
    timestamp = hex(int(time.time() * 1000))[2:]
    random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=16))
    return f"c{timestamp}{random_suffix}"

# Load environment variables
load_dotenv()

# Database configuration
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME", "socdashboard")
DB_USER = os.getenv("DB_USER", "soc")
DB_PASSWORD = os.getenv("DB_PASSWORD", "punggawa")

# QRadar configuration (from .env.local)
QRADAR_HOST = os.getenv("QRADAR_HOST", "https://100.100.11.101")
QRADAR_USERNAME = os.getenv("QRADAR_USERNAME", "soc_pci")
QRADAR_PASSWORD = os.getenv("QRADAR_PASSWORD", "j8i>pSt,wQ98")

# Normalize QRadar host
QRADAR_HOST = QRADAR_HOST.replace("https://", "").replace("http://", "").rstrip("/")
QRADAR_BASE_URL = f"https://{QRADAR_HOST}/api"

class QRadarClient:
    def __init__(self, host, api_key):
        self.host = host
        self.api_key = api_key
        self.base_url = f"https://{host}/api"
        self.session = requests.Session()
        self.session.verify = False
        
    def _make_request(self, method, endpoint, params=None, headers_override=None):
        """Make request to QRadar API"""
        url = f"{self.base_url}{endpoint}"
        
        headers = {
            "SEC": self.api_key,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        
        if headers_override:
            headers.update(headers_override)
        
        try:
            response = self.session.request(
                method=method,
                url=url,
                params=params,
                headers=headers,
                timeout=30
            )
            
            if response.status_code >= 400:
                print(f"❌ QRadar API error: {response.status_code} {response.text[:200]}")
                return None
            
            try:
                return response.json()
            except:
                return response.text
        except Exception as e:
            print(f"❌ Request failed: {e}")
            return None
    
    def execute_aql(self, aql_query, max_results=15, max_wait_minutes=8):
        """Execute AQL query on QRadar"""
        print(f"🔍 Submitting AQL query (max {max_wait_minutes} min wait)...")
        
        # Submit search
        response = self._make_request("POST", "/ariel/searches", 
                                     params={"query_expression": aql_query})
        
        if not response or "search_id" not in response:
            print(f"❌ Failed to submit AQL query")
            return []
        
        search_id = response.get("search_id")
        print(f"📋 Search submitted: {search_id}")
        
        # Poll for completion
        max_attempts = (max_wait_minutes * 60) // 5
        attempts = 0
        
        while attempts < max_attempts:
            time.sleep(5)
            
            status_response = self._make_request("GET", f"/ariel/searches/{search_id}")
            
            if not status_response:
                print(f"❌ Failed to check search status")
                return []
            
            status = status_response.get("status")
            progress = status_response.get("progress", 0)
            
            # Calculate progress bar
            progress_pct = int(progress)
            bar_length = 20
            filled = int(bar_length * progress_pct / 100)
            bar = "█" * filled + "░" * (bar_length - filled)
            
            print(f"⏳ [{bar}] {progress_pct}% - {status}", end="\r")
            
            if status == "COMPLETED":
                print(f"✅ [{bar}] 100% - COMPLETED        ")
                break
            elif status in ["ERROR", "CANCELED"]:
                print(f"❌ AQL search failed: {status}")
                return []
            
            attempts += 1
        
        if attempts >= max_attempts:
            print(f"⏱️  AQL search timeout after {max_wait_minutes} minutes")
            return []
        
        # Get results
        results_response = self._make_request(
            "GET", 
            f"/ariel/searches/{search_id}/results",
            params={"range": f"items=0-{max_results-1}"}
        )
        
        if not results_response:
            print(f"❌ Failed to get AQL results")
            return []
        
        events = results_response.get("events", [])
        print(f"✅ AQL returned {len(events)} events")
        
        return events
    
    def get_related_events(self, offense_id, offense_start_time):
        """
        Get related events for an offense using START/STOP with 12-hour range.
        Limits to 5 events max per alert.
        
        Args:
            offense_id: QRadar offense ID
            offense_start_time: Offense start datetime (will add 12 hours for STOP)
        """
        # Calculate START and STOP times
        # START = offense start time
        # STOP = offense start time + 12 hours
        start_time = offense_start_time
        stop_time = offense_start_time + timedelta(hours=12)
        
        # Format to 'yyyy-MM-dd HH:mm:ss' for QRadar
        start_str = start_time.strftime('%Y-%m-%d %H:%M:%S')
        stop_str = stop_time.strftime('%Y-%m-%d %H:%M:%S')
        
        print(f"📡 Fetching related events for offense {offense_id}")
        print(f"   ⏱️  Time range: {start_str} to {stop_str} (12h window)")
        
        aql_query = f"""
        SELECT 
            starttime, endtime, sourceip, destinationip, sourceport, destinationport,
            protocolid, eventcount, magnitude, username, logsourceid, qid,
            category, severity, credibility, relevance, msg
        FROM events
        WHERE INOFFENSE({offense_id})
        START '{start_str}'
        STOP '{stop_str}'
        """
        
        result = self.execute_aql(aql_query.strip(), max_results=5)
        
        if result:
            print(f"   ✅ Found {len(result)} events")
            return result
        else:
            print(f"   ⚠️  No events found")
            return []
    
    def get_offense_notes(self, offense_id):
        """Get notes for an offense"""
        print(f"📝 Fetching notes for offense {offense_id}...")
        
        response = self._make_request("GET", f"/siem/offenses/{offense_id}/notes")
        
        if not response:
            return []
        
        notes = response if isinstance(response, list) else []
        print(f"✅ Found {len(notes)} notes")
        
        return notes

class DatabaseManager:
    def __init__(self, host, port, database, user, password):
        self.host = host
        self.port = port
        self.database = database
        self.user = user
        self.password = password
        self.conn = None
    
    def connect(self):
        """Connect to database"""
        try:
            self.conn = psycopg2.connect(
                host=self.host,
                port=self.port,
                database=self.database,
                user=self.user,
                password=self.password
            )
            print(f"✅ Connected to database: {self.database}")
            return True
        except Exception as e:
            print(f"❌ Database connection failed: {e}")
            return False
    
    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            print("🔌 Database connection closed")
    
    def get_qradar_integration(self):
        """Get QRadar integration from database"""
        try:
            cursor = self.conn.cursor()
            cursor.execute(
                """SELECT id, credentials, config FROM integrations 
                   WHERE source ILIKE '%qradar%' LIMIT 1"""
            )
            result = cursor.fetchone()
            cursor.close()
            
            if result:
                integration_id, credentials, config = result
                print(f"✅ Found QRadar integration: {integration_id}")
                return {
                    "id": integration_id,
                    "credentials": json.loads(credentials) if isinstance(credentials, str) else credentials,
                    "config": json.loads(config) if isinstance(config, str) else config
                }
            
            print("❌ No QRadar integration found")
            return None
        except Exception as e:
            print(f"❌ Failed to get QRadar integration: {e}")
            return None
    
    def get_offenses_without_events_or_notes(self):
        """Get QRadar offenses that don't have related events or notes"""
        try:
            cursor = self.conn.cursor()
            cursor.execute("""
                SELECT 
                    qo.id, qo.external_id, qo.start_time, qo.created_at, qo."integrationId",
                    (SELECT COUNT(*) FROM qradar_events WHERE qradar_offense_id = qo.id) as event_count,
                    qo.metadata
                FROM qradar_offenses qo
                WHERE 
                    (SELECT COUNT(*) FROM qradar_events WHERE qradar_offense_id = qo.id) = 0
                    OR (qo.metadata->>'notes' IS NULL OR qo.metadata->>'notes' = '')
                ORDER BY qo.start_time DESC
                LIMIT 100
            """)
            
            results = cursor.fetchall()
            cursor.close()
            
            offenses = []
            for row in results:
                offenses.append({
                    "id": row[0],
                    "external_id": row[1],
                    "start_time": row[2],
                    "created_at": row[3],
                    "integration_id": row[4],
                    "event_count": row[5],
                    "metadata": json.loads(row[6]) if isinstance(row[6], str) else row[6]
                })
            
            print(f"📊 Found {len(offenses)} offenses without events/notes")
            return offenses
        except Exception as e:
            print(f"❌ Failed to get offenses: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def get_offense_statistics(self):
        """Get breakdown statistics for offenses"""
        try:
            cursor = self.conn.cursor()
            
            # Total offenses
            cursor.execute("SELECT COUNT(*) FROM qradar_offenses")
            total_offenses = cursor.fetchone()[0]
            
            # Offenses without events
            cursor.execute("""
                SELECT COUNT(DISTINCT qo.id)
                FROM qradar_offenses qo
                LEFT JOIN qradar_events qe ON qo.id = qe.qradar_offense_id
                WHERE qe.id IS NULL
            """)
            offenses_no_events = cursor.fetchone()[0]
            
            # Offenses without notes
            cursor.execute("""
                SELECT COUNT(*)
                FROM qradar_offenses
                WHERE metadata->>'notes' IS NULL OR metadata->>'notes' = ''
            """)
            offenses_no_notes = cursor.fetchone()[0]
            
            # Offenses without both
            cursor.execute("""
                SELECT COUNT(DISTINCT qo.id)
                FROM qradar_offenses qo
                LEFT JOIN qradar_events qe ON qo.id = qe.qradar_offense_id
                WHERE qe.id IS NULL
                AND (qo.metadata->>'notes' IS NULL OR qo.metadata->>'notes' = '')
            """)
            offenses_no_both = cursor.fetchone()[0]
            
            cursor.close()
            
            return {
                "total": total_offenses,
                "without_events": offenses_no_events,
                "without_notes": offenses_no_notes,
                "without_both": offenses_no_both
            }
        except Exception as e:
            print(f"❌ Failed to get statistics: {e}")
            return None
    
    def save_related_events(self, qradar_offense_id, offense_external_id, events):
        """Save related events to database"""
        if not events:
            print(f"⏭️  No events to save")
            return 0
        
        try:
            cursor = self.conn.cursor()
            saved_count = 0
            total = len(events[:50])
            
            print(f"   💾 Saving events to database (0/{total})...", end="", flush=True)
            
            for idx, event in enumerate(events[:5]):  # Max 5 events
                event_id = generate_cuid()  # Generate unique ID
                external_id = f"qradar-event-{offense_external_id}-{idx}-{int(time.time())}"
                event_timestamp = datetime.fromtimestamp(event.get("starttime", 0) / 1000)
                
                try:
                    cursor.execute("""
                        INSERT INTO qradar_events (
                            id, external_id, offense_id, event_type, source_ip, destination_ip,
                            protocol, event_timestamp, payload, qradar_offense_id,
                            created_at, event_name, severity, source_port, destination_port
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (external_id) DO NOTHING
                    """, (
                        event_id,
                        external_id,
                        offense_external_id,
                        event.get("eventtype"),
                        event.get("sourceip"),
                        event.get("destinationip"),
                        event.get("protocolid"),
                        event_timestamp,
                        json.dumps(event),
                        qradar_offense_id,
                        datetime.now(),
                        event.get("msg"),
                        event.get("severity"),
                        event.get("sourceport"),
                        event.get("destinationport")
                    ))
                    saved_count += 1
                    
                    # Show progress
                    progress_pct = int((saved_count / total) * 100)
                    print(f"\r   💾 Saving events to database ({saved_count}/{total}) [{progress_pct}%]", end="", flush=True)
                    
                except Exception as e:
                    print(f"\n⚠️  Failed to insert event {external_id}: {e}")
            
            self.conn.commit()
            cursor.close()
            print(f"\r   💾 Saving events to database ({saved_count}/{total}) [100%]")
            return saved_count
        except Exception as e:
            print(f"\n❌ Failed to save events: {e}")
            return 0
    
    def save_notes(self, qradar_offense_id, offense_external_id, notes):
        """Save notes to offense metadata"""
        if not notes:
            print(f"⏭️  No notes to save")
            return
        
        try:
            cursor = self.conn.cursor()
            
            # Get current metadata
            cursor.execute(
                "SELECT metadata FROM qradar_offenses WHERE id = %s",
                (qradar_offense_id,)
            )
            result = cursor.fetchone()
            
            metadata = {}
            if result:
                metadata = json.loads(result[0]) if isinstance(result[0], str) else result[0] or {}
            
            # Add/update notes in metadata
            metadata["notes"] = notes
            
            cursor.execute(
                "UPDATE qradar_offenses SET metadata = %s, updated_at = NOW() WHERE id = %s",
                (json.dumps(metadata), qradar_offense_id)
            )
            
            self.conn.commit()
            cursor.close()
            print(f"💾 Saved {len(notes)} notes to metadata")
        except Exception as e:
            print(f"❌ Failed to save notes: {e}")

def main():
    print("=" * 60)
    print("🚀 QRadar Related Events & Notes Fetcher")
    print("=" * 60)
    
    # Connect to database
    db = DatabaseManager(DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)
    if not db.connect():
        sys.exit(1)
    
    # Get QRadar integration
    integration = db.get_qradar_integration()
    if not integration:
        db.close()
        sys.exit(1)
    
    # Get QRadar credentials from env or integration config
    qradar_creds = integration["credentials"]
    qradar_host = qradar_creds.get("host") or QRADAR_HOST
    qradar_api_key = qradar_creds.get("api_key") or qradar_creds.get("apiKey")
    
    if not qradar_api_key:
        print("❌ Missing QRadar API key in integration credentials")
        db.close()
        sys.exit(1)
    
    # Normalize host
    qradar_host = qradar_host.replace("https://", "").replace("http://", "").rstrip("/")
    
    print(f"🔗 QRadar Host: {qradar_host}")
    
    # Get offense statistics
    print("\n📊 Fetching offense statistics...")
    stats = db.get_offense_statistics()
    if stats:
        print(f"\n{'=' * 60}")
        print(f"📈 OFFENSE STATISTICS")
        print(f"{'=' * 60}")
        print(f"  Total offenses:           {stats['total']}")
        print(f"  Without events:           {stats['without_events']}")
        print(f"  Without notes:            {stats['without_notes']}")
        print(f"  Without both:             {stats['without_both']}")
        print(f"  With at least one item:   {stats['total'] - stats['without_both']}")
        print(f"{'=' * 60}")
    
    # Initialize QRadar client
    qradar = QRadarClient(qradar_host, qradar_api_key)
    
    # Get offenses without events/notes
    offenses = db.get_offenses_without_events_or_notes()
    
    if not offenses:
        print("✅ All offenses have events/notes")
        db.close()
        sys.exit(0)
    
    # Process each offense
    total_events_saved = 0
    for idx, offense in enumerate(offenses, 1):
        progress_pct = int((idx / len(offenses)) * 100)
        
        print(f"\n{'=' * 60}")
        print(f"[{idx}/{len(offenses)}] ({progress_pct}%) Processing Offense #{offense['external_id']}")
        print(f"{'=' * 60}")
        
        offense_id = offense["external_id"]
        
        # Fetch related events
        print(f"\n📥 [Step 1/2] Fetching related events...")
        events = qradar.get_related_events(offense_id, offense["start_time"])
        if events:
            saved = db.save_related_events(
                offense["id"], 
                offense_id, 
                events
            )
            total_events_saved += saved
            print(f"   ✅ Saved {saved}/{len(events)} events ({int(saved/len(events)*100)}%)" if len(events) > 0 else "   ✅ No events to save")
        
        # Fetch notes
        print(f"\n📥 [Step 2/2] Fetching notes...")
        notes = qradar.get_offense_notes(offense_id)
        db.save_notes(offense["id"], offense_id, notes)
        
        # Overall progress
        remaining = len(offenses) - idx
        print(f"\n⏳ Progress: {idx} completed, {remaining} remaining")
        
        # Small delay between requests
        time.sleep(2)
    
    # Summary
    print(f"\n{'=' * 60}")
    print(f"✅ COMPLETED")
    print(f"{'=' * 60}")
    print(f"📊 Total events saved: {total_events_saved}")
    print(f"📊 Total offenses processed: {len(offenses)}")
    print(f"📊 Completion rate: 100%")
    
    # Get updated statistics
    print(f"\n📈 FINAL STATISTICS (After Processing)")
    print(f"{'=' * 60}")
    final_stats = db.get_offense_statistics()
    if final_stats:
        print(f"  Total offenses:           {final_stats['total']}")
        print(f"  Without events:           {final_stats['without_events']}")
        print(f"  Without notes:            {final_stats['without_notes']}")
        print(f"  Without both:             {final_stats['without_both']}")
        print(f"  With at least one item:   {final_stats['total'] - final_stats['without_both']}")
    print(f"{'=' * 60}")
    
    db.close()

if __name__ == "__main__":
    main()
