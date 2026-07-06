#!/bin/bash

MAX_RUNS=22

for ((i=1; i<=MAX_RUNS; i++)); do
    echo "$(date) - Run ke-$i dari $MAX_RUNS"
    echo "$(date) - Mulai menjalankan script"

    python3 fetch_qradar_events_notes.py

    EXIT_CODE=$?

    echo "$(date) - Script selesai dengan exit code $EXIT_CODE"

    # Jangan sleep setelah run terakhir
    if [ "$i" -lt "$MAX_RUNS" ]; then
        echo "$(date) - Istirahat 5 menit sebelum run berikutnya"
        sleep 300
    fi
done

echo "$(date) - Selesai. Script telah dijalankan $MAX_RUNS kali."
