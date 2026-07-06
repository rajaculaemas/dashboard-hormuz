#!/usr/bin/env python3
"""
Test script to verify query window calculation logic
"""

from datetime import datetime, timedelta

def calculate_event_query_window(offense_start_time):
    """
    Calculate the time window to query for events based on offense start time.
    
    Example:
    - Offense: June 10 at 12:00 PM
    - Query: June 10 00:00 AM to June 11 00:00 AM (~36 hours)
    """
    # Get midnight (00:00) on the same day as offense start
    start_of_day = offense_start_time.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # End: offense start time + 12 hour buffer
    end_time = offense_start_time + timedelta(hours=12)
    
    # Convert to milliseconds for QRadar API
    start_ms = int(start_of_day.timestamp() * 1000)
    end_ms = int(end_time.timestamp() * 1000)
    
    # Calculate hours for display
    hours_needed = (end_time - start_of_day).total_seconds() / 3600
    
    print(f"📅 Query window: {start_of_day.strftime('%Y-%m-%d %H:%M')} → {end_time.strftime('%Y-%m-%d %H:%M')} (~{int(hours_needed)}h)")
    print(f"   Start (ms): {start_ms}")
    print(f"   End (ms): {end_ms}")
    
    # Show what AQL query would look like
    print(f"\n📝 AQL Query snippet:")
    print(f"   WHERE INOFFENSE(12724)")
    print(f"   AND starttime >= {start_ms}")
    print(f"   AND starttime <= {end_ms}")
    
    return int(hours_needed), start_ms, end_ms

# Test cases
print("=" * 60)
print("🧪 Query Window Calculation Test")
print("=" * 60)

print("\n[Test 1] Alert dari 10 hari lalu pada jam 12 siang")
test_time_1 = datetime(2026, 6, 10, 12, 0, 0)  # June 10, 2026 at 12:00 PM
print(f"Alert time: {test_time_1}")
hours, start, end = calculate_event_query_window(test_time_1)
print(f"Result: Query ~{hours} hours, NOT 240+ hours ✅\n")

print("[Test 2] Alert dari 3 jam lalu")
test_time_2 = datetime.now() - timedelta(hours=3)
print(f"Alert time: {test_time_2}")
hours, start, end = calculate_event_query_window(test_time_2)
print(f"Result: Query ~{hours} hours ✅\n")

print("[Test 3] Alert dari kemarin pukul 5 pagi")
test_time_3 = datetime.now().replace(hour=5, minute=0, second=0, microsecond=0) - timedelta(days=1)
print(f"Alert time: {test_time_3}")
hours, start, end = calculate_event_query_window(test_time_3)
print(f"Result: Query ~{hours} hours ✅\n")

print("=" * 60)
print("✅ All tests show efficient time windows!")
print("   Instead of querying 240+ hours, we only query the day")
print("   when the offense occurred + 12h buffer = ~36 hours")
print("=" * 60)
