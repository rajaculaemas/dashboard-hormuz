// Debug script to emulate wazuh-alert-detail-dialog hash extraction
const alert = {
  "id": "1766480575.1303456123",
  "true": 1766480575.205737,
  "sha256": "B6BBF660ED13327CD9CBBF4176079ED8D6070B184A1B229235841EE04736DAD6",
  "source": "100.100.12.31",
  "message": "{}",
  "rule_id": "92151",
  "streams": [
    "69293716f2ef3b64a9bc1791"
  ],
  "agent_id": "147",
  "agent_ip": "192.168.104.208",
  "location": "EventChannel",
  "rule_mail": true,
  "timestamp": "2025-12-23 11:23:04.780",
  "agent_name": "LAPTOP-LBJV3ANB",
  "process_id": "38368",
  "rule_level": 12,
  "hash_sha256": "SHA256=B6BBF660ED13327CD9CBBF4176079ED8D6070B184A1B229235841EE04736DAD6",
  "rule_group1": "sysmon",
  "rule_group2": "sysmon_eid7_detections",
  "rule_group3": "windows",
  "rule_groups": "sysmon, sysmon_eid7_detections, windows",
  "syslog_type": "wazuh",
  "cluster_name": "dc01-cakra-wdpmc.pss.net",
  "decoder_name": "windows_eventchannel",
  "manager_name": "wazuh.worker.POS_Indonesia",
  "sacti_search": "B6BBF660ED13327CD9CBBF4176079ED8D6070B184A1B229235841EE04736DAD6",
  "syslog_description": "Binary loaded PowerShell automation library - Possible unmanaged Powershell execution by suspicious process",
  "data_win_eventdata_hashes": "SHA1=FC962AB0CEB91CB2AD477482F49E8D6D7EA37D9D,MD5=4D0A8DA04495EEFA9BDDDDC5D893E6B7,SHA256=B6BBF660ED13327CD9CBBF4176079ED8D6070B184A1B229235841EE04736DAD6,IMPHASH=00000000000000000000000000000000",
  "msg_timestamp": "2025-12-23T09:02:55.203Z",
  "gl2_message_id": "01KD5F5K6C3APYFCP71S96JW3C",
  "gl2_remote_ip": "100.100.12.31"
}

// Emulate component extraction logic
const metadata = alert.metadata || {}
let parsedData = {}
if (metadata.message && typeof metadata.message === 'string') {
  try { parsedData = JSON.parse(metadata.message) } catch (e) { parsedData = {} }
}
// Note: in this alert sample the top-level "message" exists but component parses metadata.message only

const syscheck = parsedData.syscheck || metadata.syscheck || {}

const md5Hash = String(syscheck.md5_after || "").trim()
const sha1Hash = String(syscheck.sha1_after || "").trim()
const sha256Hash = String(syscheck.sha256_after || "").trim()

const winEventHashesRaw =
  parsedData.data?.win?.eventdata?.hashes ||
  parsedData.data?.win?.eventdata?.hash ||
  metadata.data_win_eventdata_hashes ||
  metadata.hashes ||
  metadata.hash_sha256 ||
  metadata.sacti_search ||
  alert.data_win_eventdata_hashes ||
  alert.hashes ||
  alert.hash_sha256 ||
  alert.sacti_search ||
  alert.sha256 ||
  ""

function parseHashesFromString(s) {
  if (!s || typeof s !== 'string') return {}
  const out = {}
  const parts = s.split(/[,;|\s]+/)
  for (const part of parts) {
    const mSha256 = part.match(/SHA256=([A-Fa-f0-9]{32,})/)
    const mSha1 = part.match(/SHA1=([A-Fa-f0-9]{32,})/)
    const mMd5 = part.match(/MD5=([A-Fa-f0-9]{16,})/)
    if (mSha256) out.sha256 = mSha256[1]
    if (mSha1) out.sha1 = mSha1[1]
    if (mMd5) out.md5 = mMd5[1]
    const hex = part.replace(/[^A-Fa-f0-9]/g, '')
    if (!out.sha256 && hex.length === 64) out.sha256 = hex
    if (!out.sha1 && hex.length === 40) out.sha1 = hex
    if (!out.md5 && hex.length === 32) out.md5 = hex
  }
  return out
}

const winHashes = parseHashesFromString(String(winEventHashesRaw))

const finalMd5 = md5Hash || winHashes.md5 || metadata.hash_md5 || alert.hash_md5 || alert.md5 || ""
const finalSha1 = sha1Hash || winHashes.sha1 || metadata.hash_sha1 || alert.hash_sha1 || alert.sha1 || ""
const finalSha256 =
  sha256Hash ||
  winHashes.sha256 ||
  (metadata.hash_sha256 && String(metadata.hash_sha256).replace(/^SHA256=/i, '')) ||
  (alert.hash_sha256 && String(alert.hash_sha256).replace(/^SHA256=/i, '')) ||
  (alert.sha256 && String(alert.sha256)) ||
  (alert.sacti_search && String(alert.sacti_search)) ||
  ""

console.log('Computed values:')
console.log('winEventHashesRaw =>', winEventHashesRaw)
console.log('winHashes =>', winHashes)
console.log('finalMd5 =>', finalMd5)
console.log('finalSha1 =>', finalSha1)
console.log('finalSha256 =>', finalSha256)

// Also show whether component's File Monitoring condition would be true
const hasFileMonitoring = (Object.keys(syscheck).length > 0 || finalMd5 || finalSha1 || finalSha256 || parsedData.data?.win?.eventdata?.image || parsedData.data?.win?.eventdata?.imageLoaded)
console.log('Would File Monitoring render?', !!hasFileMonitoring)
