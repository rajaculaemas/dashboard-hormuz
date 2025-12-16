// Test parsing Wazuh alert yang diberikan user
const wazuhAlertRaw = {
  "_index": "wazuh-posindonesia_17",
  "_id": "60202807-d995-11f0-996b-005056120016",
  "_source": {
    "source_reserved_ip": true,
    "agent_id": "101",
    "agent_name": "AWS-API-JKT",
    "gl2_remote_ip": "100.100.12.31",
    "agent_labels_customer": "posindonesia",
    "source": "100.100.12.31",
    "rule_level": 14,
    "timestamp_utc": "2025-12-15T09:06:39.308Z",
    "syslog_type": "wazuh",
    "rule_description": "Command Injection Attempt",
    "id": "1765789599.1242847065",
    "agent_ip": "10.24.2.14",
    "rule_id": "32003",
    "syslog_level": "ALERT",
    "timestamp": "2025-12-15 09:06:43.456",
    "cluster_name": "dc01-cakra-wdpmc.pss.net",
    "message": "{\"rule\":{\"level\":14,\"description\":\"Command Injection Attempt\",\"id\":\"32003\"}}",
    "data_protocol": "POST",
    "rule_groups": "local, web_attack, overrideweb_attack, command_injection",
    "data_srcip": "108.136.180.37",
    "manager_name": "wazuh.worker.POS_Indonesia",
    "predecoder_hostname": "ip-10-24-2-14",
    "cluster_node": "wazuh.worker.POS_Indonesia",
    "syslog_description": "Command Injection Attempt",
    "location": "/var/log/syslog",
    "data_url": "/stagging-giroku-api/giro/transfer/notif",
  }
};

const source = wazuhAlertRaw._source;

console.log("=== Wazuh Alert Parsing Test ===\n");

// Check required fields for ES query
console.log("1. Query Filter Check:");
console.log("   syslog_level:", source.syslog_level);
console.log("   ✓ Will match ES query" + (source.syslog_level === "ALERT" ? "" : " - FAIL!"));

// Parse alert like the client does
console.log("\n2. Alert Parsing:");

let parsedMessage = {};
if (typeof source.message === "string") {
  try {
    parsedMessage = JSON.parse(source.message);
    console.log("   ✓ Message parsed");
  } catch {
    console.log("   ⚠ Message parsing failed, using empty object");
    parsedMessage = {};
  }
} else if (typeof source.message === "object" && source.message !== null) {
  parsedMessage = source.message;
}

const agentId = source.agent_id || "";
const agentName = source.agent_name || "";
const agentIp = source.agent_ip || "";
const ruleId = source.rule_id || "";
const ruleLevel = source.rule_level || 1;
const ruleDescription = source.rule_description || "";
const ruleGroups = source.rule_groups || "";

const timestamp = source.timestamp_utc || source.timestamp || new Date().toISOString();
console.log("   timestamp:", timestamp);

const title = (ruleDescription && ruleDescription.trim()) || (source.syslog_description && source.syslog_description.trim()) || "[Unknown] Alert";
console.log("   title:", title);

const externalId = source.id || wazuhAlertRaw._id;
console.log("   externalId:", externalId);

console.log("\n3. Timestamp Field Check:");
try {
  const ts = new Date(timestamp);
  console.log("   Parsed as:", ts.toISOString());
  console.log("   ✓ Valid timestamp");
} catch (e) {
  console.log("   ✗ INVALID TIMESTAMP:", e.message);
}

console.log("\n4. Final Alert Object:");
const alert = {
  id: source.id || wazuhAlertRaw._id,
  externalId: source.id || wazuhAlertRaw._id,
  timestamp: new Date(timestamp),
  agent: {
    id: agentId,
    name: agentName,
    ip: agentIp,
  },
  rule: {
    level: ruleLevel,
    description: ruleDescription,
    id: ruleId,
  },
  title,
  severity: null,
  message: source.syslog_description || ruleDescription || "No details available",
  srcIp: source.data_srcip || source.source || "",
  dstIp: source.destination || "",
  protocol: source.data_protocol || "",
  manager: {
    name: source.manager_name || "",
  },
  cluster: source.cluster_name ? {
    name: source.cluster_name,
    node: source.cluster_node || "",
  } : undefined,
};

console.log("   ✓ Alert object created successfully");
console.log("\nAlert Summary:");
console.log(`   Title: ${alert.title}`);
console.log(`   Agent: ${alert.agent.name} (${alert.agent.ip})`);
console.log(`   Rule: ${alert.rule.description} [${alert.rule.id}]`);
console.log(`   Timestamp: ${alert.timestamp.toISOString()}`);
console.log(`   Source IP: ${alert.srcIp}`);

console.log("\n5. Database Insert Simulation:");
console.log("   Would create Alert with:");
console.log(`     - externalId: ${alert.externalId}`);
console.log(`     - title: ${alert.title}`);
console.log(`     - description: Agent: ${alert.agent.name} (${alert.agent.ip})\\nRule: ${alert.rule.description}...`);
console.log(`     - timestamp: ${alert.timestamp.toISOString()}`);
console.log("   ✓ Ready for database insert");

console.log("\n=== CONCLUSION ===");
console.log("Alert appears to be valid and should be ingested successfully.");
console.log("\nPossible reasons if not ingested:");
console.log("1. Wazuh integration not configured/connected in dashboard");
console.log("2. Sync job not running or not processing Wazuh data");
console.log("3. Different field naming in actual ES (check actual field names)");
console.log("4. Elasticsearch index not matching 'wazuh-*' pattern");
