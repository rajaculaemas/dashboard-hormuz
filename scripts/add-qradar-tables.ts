import { getSql } from "@/lib/db"

async function main() {
  try {
    let sql
    try {
      sql = getSql()
    } catch (err) {
      console.error("Database not configured:", err instanceof Error ? err.message : err)
      process.exit(1)
    }
    console.log("Adding QRadar tables...")

    // Create qradar_offenses table
    await sql`
      CREATE TABLE IF NOT EXISTS qradar_offenses (
        id TEXT PRIMARY KEY,
        external_id INTEGER NOT NULL,
        description TEXT,
        severity INTEGER,
        magnitude INTEGER,
        credibility INTEGER,
        relevance INTEGER,
        status TEXT NOT NULL,
        assigned_to TEXT,
        source_ip TEXT,
        offense_source TEXT,
        categories JSONB,
        rules JSONB,
        log_sources JSONB,
        device_count INTEGER,
        event_count INTEGER,
        flow_count INTEGER,
        source_count INTEGER,
        local_destination_count INTEGER,
        remote_destination_count INTEGER,
        username_count INTEGER,
        security_category_count INTEGER,
        policy_category_count INTEGER,
        category_count INTEGER,
        close_time BIGINT,
        closing_reason_id INTEGER,
        closing_user TEXT,
        start_time BIGINT NOT NULL,
        last_updated_time BIGINT,
        last_persisted_time BIGINT,
        follow_up BOOLEAN DEFAULT FALSE,
        protected BOOLEAN DEFAULT FALSE,
        inactive BOOLEAN DEFAULT FALSE,
        offense_type INTEGER,
        domain_id INTEGER,
        source_network TEXT,
        destination_networks JSONB,
        source_address_ids JSONB,
        local_destination_address_ids JSONB,
        metadata JSONB,
        integration_id TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
      )
    `

    // Create qradar_events table
    await sql`
      CREATE TABLE IF NOT EXISTS qradar_events (
        id TEXT PRIMARY KEY,
        offense_id TEXT NOT NULL,
        qid INTEGER,
        starttime BIGINT NOT NULL,
        endtime BIGINT,
        sourceip TEXT,
        destinationip TEXT,
        sourceport INTEGER,
        destinationport INTEGER,
        protocolid INTEGER,
        eventcount INTEGER,
        magnitude INTEGER,
        identityip TEXT,
        username TEXT,
        logsourceid INTEGER,
        category INTEGER,
        severity INTEGER,
        credibility INTEGER,
        relevance INTEGER,
        domainid INTEGER,
        eventdirection TEXT,
        postnatdestinationip TEXT,
        postnatsourceip TEXT,
        prenatdestinationip TEXT,
        prenatsourceip TEXT,
        payload TEXT,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (offense_id) REFERENCES qradar_offenses(id) ON DELETE CASCADE
      )
    `

    // Create qradar_tickets table (untuk FOLLOW_UP offenses yang dijadikan tickets)
    await sql`
      CREATE TABLE IF NOT EXISTS qradar_tickets (
        id TEXT PRIMARY KEY,
        offense_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        severity INTEGER,
        status TEXT NOT NULL,
        assigned_to TEXT,
        closing_reason_id INTEGER,
        closing_reason_text TEXT,
        integration_id TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (offense_id) REFERENCES qradar_offenses(id) ON DELETE CASCADE,
        FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
      )
    `

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_qradar_offenses_integration_id ON qradar_offenses(integration_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_qradar_offenses_external_id ON qradar_offenses(external_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_qradar_offenses_status ON qradar_offenses(status)`
    await sql`CREATE INDEX IF NOT EXISTS idx_qradar_offenses_start_time ON qradar_offenses(start_time)`
    await sql`CREATE INDEX IF NOT EXISTS idx_qradar_events_offense_id ON qradar_events(offense_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_qradar_events_starttime ON qradar_events(starttime)`
    await sql`CREATE INDEX IF NOT EXISTS idx_qradar_tickets_offense_id ON qradar_tickets(offense_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_qradar_tickets_status ON qradar_tickets(status)`

    console.log("? QRadar tables created successfully!")
  } catch (error) {
    console.error("Error creating QRadar tables:", error)
    process.exit(1)
  }
}

main()
