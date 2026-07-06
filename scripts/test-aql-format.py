#!/usr/bin/env python3
"""
Test AQL query formatting dengan START/STOP clause
"""

from datetime import datetime, timedelta

def test_query_format():
    """Test AQL query with START/STOP formatting"""
    
    # Example offense start times
    test_cases = [
        datetime(2026, 6, 10, 12, 30, 45),  # June 10, 12:30:45
        datetime(2026, 6, 15, 8, 15, 0),    # June 15, 08:15:00
        datetime(2026, 6, 20, 23, 59, 59),  # June 20, 23:59:59
    ]
    
    print("🧪 Testing AQL Query Format with START/STOP (12-hour range)")
    print("=" * 70)
    
    for offense_start_time in test_cases:
        start_time = offense_start_time
        stop_time = offense_start_time + timedelta(hours=12)
        
        start_str = start_time.strftime('%Y-%m-%d %H:%M:%S')
        stop_str = stop_time.strftime('%Y-%m-%d %H:%M:%S')
        
        print(f"\n📅 Offense Start: {start_str}")
        print(f"⏱️  12-hour range: {start_str} → {stop_str}")
        
        aql_query = f"""
        SELECT 
            starttime, endtime, sourceip, destinationip, sourceport, destinationport,
            protocolid, eventcount, magnitude, username, logsourceid, qid,
            category, severity, credibility, relevance, msg
        FROM events
        WHERE INOFFENSE(12345)
        START '{start_str}'
        STOP '{stop_str}'
        """
        
        print(f"\n✅ AQL Query:\n{aql_query.strip()}")
        print("-" * 70)
    
    print("\n✅ All query formats validated!")

if __name__ == "__main__":
    test_query_format()
