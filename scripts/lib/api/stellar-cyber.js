"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccessToken = getAccessToken;
exports.getAlerts = getAlerts;
exports.updateAlertStatus = updateAlertStatus;
const node_fetch_1 = __importDefault(require("node-fetch"));
const https_1 = __importDefault(require("https"));
const url_1 = require("@/lib/utils/url");
const prisma_1 = __importDefault(require("@/lib/prisma"));
const httpsAgent = new https_1.default.Agent({
    rejectUnauthorized: false,
});
// Fungsi untuk mendapatkan kredensial dari database
const pick = (...values) => values.find((v) => v !== undefined && v !== null && `${v}`.length > 0) || "";
function getStellarCyberCredentials(integrationId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Jika integrationId disediakan, gunakan itu
            if (integrationId) {
                const integration = yield prisma_1.default.integration.findUnique({
                    where: { id: integrationId },
                });
                if (!integration || integration.source !== "stellar-cyber") {
                    throw new Error("Stellar Cyber integration not found");
                }
                let credentials = {};
                if (Array.isArray(integration.credentials)) {
                    const credentialsArray = integration.credentials;
                    credentialsArray.forEach((cred) => {
                        if (cred && typeof cred === "object" && "key" in cred && "value" in cred) {
                            credentials[cred.key] = cred.value;
                        }
                    });
                }
                else {
                    credentials = integration.credentials;
                }
                const HOST = pick(credentials.host, credentials.HOST, credentials.STELLAR_CYBER_HOST, credentials.stellar_cyber_host, credentials.stellar_host, credentials.api_host, credentials.base_url, credentials.url);
                const USER_ID = pick(credentials.user_id, credentials.USER_ID, credentials.username, credentials.user, credentials.email, credentials.login, credentials.account);
                const REFRESH_TOKEN = pick(credentials.refresh_token, credentials.refreshToken, credentials.REFRESH_TOKEN, credentials.password, credentials.token, credentials.apiToken);
                const TENANT_ID = pick(credentials.tenant_id, credentials.TENANT_ID, credentials.tenant, credentials.customer_id, credentials.cust_id);
                const API_KEY = pick(credentials.api_key, credentials.API_KEY, credentials.apiKey, credentials.apiToken, credentials.api_token, credentials.token, credentials.key, credentials.secret, credentials.APIKEY, credentials.apikey, credentials["api-key"]);
                return {
                    HOST,
                    USER_ID,
                    REFRESH_TOKEN,
                    TENANT_ID,
                    API_KEY,
                };
            }
            // Jika tidak ada integrationId, cari integrasi Stellar Cyber yang aktif
            const integration = yield prisma_1.default.integration.findFirst({
                where: {
                    source: "stellar-cyber",
                    status: "connected",
                },
            });
            if (!integration) {
                // Fallback ke environment variables
                return {
                    HOST: process.env.STELLAR_CYBER_HOST || "localhost",
                    USER_ID: process.env.STELLAR_CYBER_USER_ID || "demo@example.com",
                    REFRESH_TOKEN: process.env.STELLAR_CYBER_REFRESH_TOKEN || "demo-token",
                    TENANT_ID: process.env.STELLAR_CYBER_TENANT_ID || "demo-tenant",
                };
            }
            let credentials = {};
            if (Array.isArray(integration.credentials)) {
                const credentialsArray = integration.credentials;
                credentialsArray.forEach((cred) => {
                    if (cred && typeof cred === "object" && "key" in cred && "value" in cred) {
                        credentials[cred.key] = cred.value;
                    }
                });
            }
            else {
                credentials = integration.credentials;
            }
            const HOST = pick(credentials.host, credentials.HOST, credentials.STELLAR_CYBER_HOST, credentials.stellar_cyber_host, credentials.stellar_host, credentials.api_host, credentials.base_url, credentials.url);
            const USER_ID = pick(credentials.user_id, credentials.USER_ID, credentials.username, credentials.user, credentials.email, credentials.login, credentials.account);
            const REFRESH_TOKEN = pick(credentials.refresh_token, credentials.refreshToken, credentials.REFRESH_TOKEN, credentials.password, credentials.token, credentials.apiToken);
            const TENANT_ID = pick(credentials.tenant_id, credentials.TENANT_ID, credentials.tenant, credentials.customer_id, credentials.cust_id);
            const API_KEY = pick(credentials.api_key, credentials.API_KEY, credentials.apiKey, credentials.apiToken, credentials.api_token, credentials.token, credentials.key, credentials.secret, credentials.APIKEY, credentials.apikey, credentials["api-key"]);
            return {
                HOST,
                USER_ID,
                REFRESH_TOKEN,
                TENANT_ID,
                API_KEY,
            };
        }
        catch (error) {
            console.error("Error getting Stellar Cyber credentials:", error);
            // Fallback ke environment variables
            return {
                HOST: process.env.STELLAR_CYBER_HOST || "localhost",
                USER_ID: process.env.STELLAR_CYBER_USER_ID || "demo@example.com",
                REFRESH_TOKEN: process.env.STELLAR_CYBER_REFRESH_TOKEN || "demo-token",
                TENANT_ID: process.env.STELLAR_CYBER_TENANT_ID || "demo-tenant",
                API_KEY: process.env.STELLAR_CYBER_API_KEY || "",
            };
        }
    });
}
// Fungsi untuk mendapatkan access token
function getAccessToken(integrationId) {
    return __awaiter(this, void 0, void 0, function* () {
        const { HOST, USER_ID, REFRESH_TOKEN, TENANT_ID } = yield getStellarCyberCredentials(integrationId);
        console.log("Checking credentials:", {
            HOST: HOST === "localhost" ? "localhost (default)" : "configured",
            USER_ID: USER_ID === "demo@example.com" ? "demo (default)" : "configured",
            REFRESH_TOKEN: REFRESH_TOKEN === "demo-token" ? "demo (default)" : "configured",
            TENANT_ID: TENANT_ID === "demo-tenant" ? "demo (default)" : "configured",
        });
        // Jika environment variables tidak tersedia, kembalikan token dummy untuk development
        if (!HOST || HOST === "localhost" || !USER_ID || !REFRESH_TOKEN || !TENANT_ID) {
            console.warn("Stellar Cyber credentials not properly configured. Using dummy token for development.");
            return "dummy-access-token-for-development";
        }
        const auth = Buffer.from(`${USER_ID}:${REFRESH_TOKEN}:${TENANT_ID}`).toString("base64");
        const headers = {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
        };
        const url = (0, url_1.urlunparse)({
            protocol: "https",
            hostname: HOST,
            pathname: "/connect/api/v1/access_token",
        });
        try {
            console.log("Requesting access token from:", url);
            // Allow self-signed certs for on-prem deployments (temporary, per-request)
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
            try {
                const response = yield (0, node_fetch_1.default)(url, {
                    method: "POST",
                    headers,
                });
                console.log("Access Token Request Status:", response.status);
                if (!response.ok) {
                    console.error(`Failed to get access token: ${response.status} ${response.statusText}`);
                    return "error-token-for-fallback";
                }
                const data = yield response.json();
                return data.access_token;
            }
            finally {
                delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
            }
        }
        catch (error) {
            console.error("Error getting access token:", error);
            return "error-token-for-fallback";
        }
    });
}
// Fungsi untuk mendapatkan daftar alert
function getAlerts(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const { minScore = 0, status, sort = "timestamp", order = "desc", limit = 100, page = 1, integrationId, daysBack = 7, startTime, endTime } = params;
        const { HOST, TENANT_ID } = yield getStellarCyberCredentials(integrationId);
        if (!HOST || !TENANT_ID) {
            console.warn("Stellar Cyber credentials not properly configured. Using mock data.");
            return generateMockAlerts();
        }
        try {
            const token = yield getAccessToken(integrationId);
            if (!token || token === "dummy-access-token-for-development" || token === "error-token-for-fallback") {
                console.warn("Fallback token used. Returning mock data.");
                return generateMockAlerts();
            }
            // Build query parameters
            const queryParams = {
                size: limit.toString(),
            };
            // Add filters
            const mustClauses = [`tenantid:${TENANT_ID}`];
            if (status) {
                mustClauses.push(`event_status:${status}`);
            }
            if (minScore > 0) {
                mustClauses.push(`score:>=${minScore}`);
            }
            // Date range filter. Prefer explicit `startTime`/`endTime` (ISO strings)
            // so callers can request hour-granular ranges. If not provided, fallback
            // to `daysBack` behavior (default 7 days) using UTC+7 local window for
            // compatibility with previous behavior.
            let startDate;
            let endDate;
            if (startTime || endTime) {
                endDate = endTime ? new Date(endTime) : new Date();
                startDate = startTime ? new Date(startTime) : new Date(endDate.getTime() - daysBack * 24 * 60 * 60 * 1000);
            }
            else {
                const now = new Date();
                const tzOffset = 7 * 60 * 60 * 1000; // UTC+7
                const localTime = new Date(now.getTime() + tzOffset);
                startDate = new Date(localTime.getTime() - daysBack * 24 * 60 * 60 * 1000);
                endDate = localTime;
            }
            mustClauses.push(`timestamp:[${startDate.toISOString()} TO ${endDate.toISOString()}]`);
            queryParams.q = mustClauses.join(" AND ");
            if (sort) {
                queryParams.sort = `${sort}:${order}`;
            }
            const url = (0, url_1.urlunparse)({
                protocol: "https",
                hostname: HOST,
                pathname: "/connect/api/data/aella-ser-*/_search",
                search: new URLSearchParams(queryParams).toString(),
            });
            const headers = {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            };
            console.log("Final request URL:", url);
            // Allow self-signed certs for on-prem Stellar Cyber
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
            let data = null;
            try {
                const response = yield (0, node_fetch_1.default)(url, {
                    method: "GET",
                    headers,
                });
                console.log("Response status:", response.status);
                if (!response.ok) {
                    const errorText = yield response.text();
                    console.error(`Failed to get alerts: ${response.status} ${response.statusText}`, errorText);
                    return generateMockAlerts();
                }
                data = yield response.json();
                if (!data.hits || !data.hits.hits) {
                    console.warn("No hits in response.");
                    return [];
                }
            }
            finally {
                delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
            }
            // Process response data dengan field tambahan dari JSON yang diberikan
            // Helper function to map numeric severity to string
            const mapSeverityToString = (severity) => {
                if (typeof severity === "string") {
                    const lower = severity.toLowerCase();
                    if (["critical", "high", "medium", "low"].includes(lower)) {
                        return severity.charAt(0).toUpperCase() + severity.slice(1);
                    }
                }
                const numSeverity = Number(severity) || 0;
                if (numSeverity >= 80)
                    return "Critical";
                if (numSeverity >= 60)
                    return "High";
                if (numSeverity >= 40)
                    return "Medium";
                return "Low";
            };
            const alerts = data.hits.hits.map((hit) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23, _24, _25, _26, _27, _28, _29, _30, _31, _32, _33, _34, _35, _36, _37, _38;
                const source = hit._source || {};
                const stellar = source.stellar || {};
                const user_action = source.user_action || {};
                const xdr_event = source.xdr_event || {};
                // Log alerts without MTTD data for debugging
                if (!(user_action === null || user_action === void 0 ? void 0 : user_action.alert_to_first) && ((_a = user_action === null || user_action === void 0 ? void 0 : user_action.history) === null || _a === void 0 ? void 0 : _a.length) > 0) {
                    console.log('[Stellar Cyber] Alert without MTTD despite history:', {
                        alertId: hit._id,
                        title: ((_b = source.xdr_event) === null || _b === void 0 ? void 0 : _b.display_name) || source.event_name,
                        hasUserAction: !!source.user_action,
                        userActionKeys: Object.keys(user_action),
                        historyCount: (_c = user_action === null || user_action === void 0 ? void 0 : user_action.history) === null || _c === void 0 ? void 0 : _c.length,
                        alert_to_first: user_action === null || user_action === void 0 ? void 0 : user_action.alert_to_first,
                    });
                }
                // Helper function to handle timestamp conversion
                const convertTimestamp = (ts) => {
                    if (!ts)
                        return "";
                    if (typeof ts === "string" && ts.includes("T"))
                        return ts;
                    const timestamp = typeof ts === "number" ? ts : Number.parseInt(ts);
                    return new Date(timestamp).toISOString();
                };
                return {
                    _id: hit._id || stellar.uuid || "",
                    _index: hit._index || "",
                    index: hit._index || "",
                    cust_id: source.cust_id || source.customer_id || "",
                    title: ((_d = source.xdr_event) === null || _d === void 0 ? void 0 : _d.display_name) || source.event_name || "Unknown Alert",
                    description: xdr_event.description || ((_e = source.xdr_event) === null || _e === void 0 ? void 0 : _e.description) || "",
                    severity: mapSeverityToString(source.severity),
                    status: source.event_status || stellar.status || "New",
                    created_at: convertTimestamp(source.timestamp),
                    updated_at: convertTimestamp(source.write_time),
                    timestamp: convertTimestamp(source.timestamp),
                    source: ((_f = source.msg_origin) === null || _f === void 0 ? void 0 : _f.source) || "Stellar Cyber",
                    score: source.event_score || source.score || 0,
                    metadata: Object.assign(Object.assign({ 
                        // Basic alert info
                        alert_id: hit._id, alert_index: hit._index, cust_id: source.cust_id || source.customer_id || "", alert_time: convertTimestamp(stellar.alert_time), severity: mapSeverityToString(source.severity), event_status: source.event_status, alert_type: source.event_type, closed_time: convertTimestamp(user_action.last_timestamp), assignee: source.assignee, tenant_name: source.tenant_name, timestamp: convertTimestamp(source.timestamp), 
                        // Application info
                        appid_family: source.appid_family, appid_name: source.appid_name, appid_stdport: source.appid_stdport, repeat_count: source.repeat_count || 1, 
                        // Network info - Source IP
                        srcip: source.srcip, srcip_reputation: source.srcip_reputation, srcip_type: source.srcip_type, srcip_version: source.srcip_version, srcip_host: source.srcip_host, srcip_username: source.srcip_username, srcip_reputation_source: source.srcip_reputation_source, srcmac: source.srcmac, srcport: source.srcport, 
                        // Source IP Geo - Breakdown
                        srcip_geo_city: (_g = source.srcip_geo) === null || _g === void 0 ? void 0 : _g.city, srcip_geo_country_code: (_h = source.srcip_geo) === null || _h === void 0 ? void 0 : _h.countryCode, srcip_geo_country_name: (_j = source.srcip_geo) === null || _j === void 0 ? void 0 : _j.countryName, srcip_geo_region: (_k = source.srcip_geo) === null || _k === void 0 ? void 0 : _k.region, srcip_geo_latitude: (_l = source.srcip_geo) === null || _l === void 0 ? void 0 : _l.latitude, srcip_geo_longitude: (_m = source.srcip_geo) === null || _m === void 0 ? void 0 : _m.longitude, srcip_geo_point: source.srcip_geo_point, srcip_geo_source: source.srcip_geo_source, 
                        // Network info - Destination IP
                        dstip: source.dstip, dstip_reputation: source.dstip_reputation, dstip_type: source.dstip_type, dstip_version: source.dstip_version, dstip_host: source.dstip_host, dstmac: source.dstmac, dstport: source.dstport, 
                        // Destination IP Geo - Breakdown
                        dstip_geo_city: (_o = source.dstip_geo) === null || _o === void 0 ? void 0 : _o.city, dstip_geo_country_code: (_p = source.dstip_geo) === null || _p === void 0 ? void 0 : _p.countryCode, dstip_geo_country_name: (_q = source.dstip_geo) === null || _q === void 0 ? void 0 : _q.countryName, dstip_geo_region: (_r = source.dstip_geo) === null || _r === void 0 ? void 0 : _r.region, dstip_geo_latitude: (_s = source.dstip_geo) === null || _s === void 0 ? void 0 : _s.latitude, dstip_geo_longitude: (_t = source.dstip_geo) === null || _t === void 0 ? void 0 : _t.longitude, dstip_geo_point: source.dstip_geo_point, 
                        // Protocol & Traffic info
                        proto: source.proto, proto_name: source.proto_name, msg_class: source.msg_class, event_category: source.event_category, duration: source.duration, inbytes_total: source.inbytes_total, outbytes_total: source.outbytes_total, inpkts_delta: source.inpkts_delta, outpkts_delta: source.outpkts_delta, totalpackets: source.totalpackets, totalbytes: source.totalbytes, 
                        // Flow & Connection info
                        state: source.state, tcp_rtt: source.tcp_rtt, end_reason: source.end_reason, 
                        // Message Origin - Breakdown
                        msg_origin_source: (_u = source.msg_origin) === null || _u === void 0 ? void 0 : _u.source, msg_origin_category: (_v = source.msg_origin) === null || _v === void 0 ? void 0 : _v.category, msg_origin_processor_type: (_x = (_w = source.msg_origin) === null || _w === void 0 ? void 0 : _w.processor) === null || _x === void 0 ? void 0 : _x.type, event_source: source.event_source, 
                        // Engine & Deployment info
                        engid: source.engid, engid_name: source.engid_name, engid_gateway: source.engid_gateway, port_name: source.port_name, netid: source.netid, netid_name: source.netid_name, locid: source.locid, 
                        // Organization & Tenant info
                        org_id: source.org_id, org_name: source.org_name, tenantid: source.tenantid, 
                        // Detection & Deduplication info
                        detection_id: source._detection_id, detected_fields: source.detected_fields, detected_values: source.detected_values, 
                        // ATH Deduplication - Breakdown
                        ath_dedup_first_time_utc: (_y = source.ath_deduplication) === null || _y === void 0 ? void 0 : _y.first_time_utc, ath_dedup_first_timestamp: (_z = source.ath_deduplication) === null || _z === void 0 ? void 0 : _z.first_timestamp, ath_dedup_last_time_utc: (_0 = source.ath_deduplication) === null || _0 === void 0 ? void 0 : _0.last_time_utc, ath_dedup_last_timestamp: (_1 = source.ath_deduplication) === null || _1 === void 0 ? void 0 : _1.last_timestamp, ath_dedup_repeat_count: (_2 = source.ath_deduplication) === null || _2 === void 0 ? void 0 : _2.repeat_count, 
                        // ATH Info - Breakdown
                        ath_rule_name: (_3 = source.ath_info) === null || _3 === void 0 ? void 0 : _3.rule_name, ath_scheduled_time_utc: (_4 = source.ath_info) === null || _4 === void 0 ? void 0 : _4.scheduled_time_utc, ath_scheduled_timestamp: (_5 = source.ath_info) === null || _5 === void 0 ? void 0 : _5.scheduled_timestamp, 
                        // Scoring info
                        event_score: source.event_score, threat_score: source.threat_score, fidelity: source.fidelity, flow_score: source.flow_score, 
                        // XDR & Killchain info
                        xdr_display_name: (_6 = source.xdr_event) === null || _6 === void 0 ? void 0 : _6.display_name, xdr_name: (_7 = source.xdr_event) === null || _7 === void 0 ? void 0 : _7.name, xdr_description: (_8 = source.xdr_event) === null || _8 === void 0 ? void 0 : _8.description, xdr_framework_version: (_9 = source.xdr_event) === null || _9 === void 0 ? void 0 : _9.framework_version, xdr_killchain_stage: (_10 = source.xdr_event) === null || _10 === void 0 ? void 0 : _10.xdr_killchain_stage, xdr_killchain_version: (_11 = source.xdr_event) === null || _11 === void 0 ? void 0 : _11.xdr_killchain_version, xdr_scope: (_12 = source.xdr_event) === null || _12 === void 0 ? void 0 : _12.scope, xdr_tags: (_13 = source.xdr_event) === null || _13 === void 0 ? void 0 : _13.tags, 
                        // XDR Tactic - Breakdown
                        xdr_tactic_id: (_15 = (_14 = source.xdr_event) === null || _14 === void 0 ? void 0 : _14.tactic) === null || _15 === void 0 ? void 0 : _15.id, xdr_tactic_name: (_17 = (_16 = source.xdr_event) === null || _16 === void 0 ? void 0 : _16.tactic) === null || _17 === void 0 ? void 0 : _17.name, 
                        // XDR Technique - Breakdown
                        xdr_technique_id: (_19 = (_18 = source.xdr_event) === null || _18 === void 0 ? void 0 : _18.technique) === null || _19 === void 0 ? void 0 : _19.id, xdr_technique_name: (_21 = (_20 = source.xdr_event) === null || _20 === void 0 ? void 0 : _20.technique) === null || _21 === void 0 ? void 0 : _21.name, 
                        // User Action & Timeline - Breakdown
                        user_action_last_user: (_22 = source.user_action) === null || _22 === void 0 ? void 0 : _22.last_user, user_action_last_action: (_23 = source.user_action) === null || _23 === void 0 ? void 0 : _23.last_action, user_action_last_modified: convertTimestamp((_24 = source.user_action) === null || _24 === void 0 ? void 0 : _24.last_modified), 
                        // MTTD: Time from alert creation to first assignee change (in milliseconds)
                        user_action_alert_to_first: (_25 = source.user_action) === null || _25 === void 0 ? void 0 : _25.alert_to_first, user_action_alert_to_last: (_26 = source.user_action) === null || _26 === void 0 ? void 0 : _26.alert_to_last, user_action_first_to_last: (_27 = source.user_action) === null || _27 === void 0 ? void 0 : _27.first_to_last, user_action_first_timestamp: convertTimestamp((_28 = source.user_action) === null || _28 === void 0 ? void 0 : _28.first_timestamp), user_action_last_timestamp: convertTimestamp((_29 = source.user_action) === null || _29 === void 0 ? void 0 : _29.last_timestamp), user_action_history_count: ((_31 = (_30 = source.user_action) === null || _30 === void 0 ? void 0 : _30.history) === null || _31 === void 0 ? void 0 : _31.length) || 0, 
                        // Comments - Breakdown (array of comments)
                        comment_count: ((_32 = source.comments) === null || _32 === void 0 ? void 0 : _32.length) || 0, 
                        // First comment details (most recent)
                        comment_latest_text: (_34 = (_33 = source.comments) === null || _33 === void 0 ? void 0 : _33[0]) === null || _34 === void 0 ? void 0 : _34.comment, comment_latest_time: convertTimestamp((_36 = (_35 = source.comments) === null || _35 === void 0 ? void 0 : _35[0]) === null || _36 === void 0 ? void 0 : _36.comment_time), comment_latest_user: (_38 = (_37 = source.comments) === null || _37 === void 0 ? void 0 : _37[0]) === null || _38 === void 0 ? void 0 : _38.comment_user, 
                        // Event Summary info
                        event_name: source.event_name, event_type: source.event_type, event_summary: source.event_summary, msgtype: source.msgtype, msgtype_name: source.msgtype_name }, source.metadata), { 
                        // IMPORTANT: Store full user_action object so SLA Dashboard can calculate MTTD from history
                        user_action: source.user_action, index: source.stellar_index ||
                            source.stellar_index_id ||
                            source.orig_index ||
                            source.index ||
                            source._index ||
                            (source.metadata && source.metadata.index) }),
                };
            });
            console.log(`✅ Total alerts fetched: ${alerts.length}`);
            return alerts;
        }
        catch (error) {
            console.error("Error getting alerts:", error);
            return generateMockAlerts();
        }
    });
}
// Fungsi untuk menghasilkan data dummy
function generateMockAlerts() {
    // Disable mock alerts - return empty array if connection fails
    return [];
}
// Fungsi untuk mengupdate status alert
function updateAlertStatus(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const { index, alertId, status, comments = "", assignee, integrationId } = params;
        const { HOST, USER_ID, REFRESH_TOKEN, API_KEY } = yield getStellarCyberCredentials(integrationId);
        // Prefer API key auth (documented for update_ser). Fallback to bearer token if only refresh token exists.
        const hasBasicAuth = !!(USER_ID && API_KEY);
        const canFetchToken = !!(USER_ID && REFRESH_TOKEN);
        if (!HOST || HOST === "localhost" || (!hasBasicAuth && !canFetchToken)) {
            console.warn("Stellar Cyber credentials not properly configured. Using mock response.");
            return { success: true, message: "Status updated (mock)" };
        }
        try {
            const url = (0, url_1.urlunparse)({
                protocol: "https",
                hostname: HOST,
                pathname: "/connect/api/update_ser",
            });
            const headers = {
                "Content-Type": "application/json",
            };
            if (hasBasicAuth) {
                headers.Authorization = "Basic " + Buffer.from(`${USER_ID}:${API_KEY}`).toString("base64");
            }
            else {
                const token = yield getAccessToken(integrationId);
                if (token === "dummy-access-token-for-development" || token === "error-token-for-fallback") {
                    return { success: true, message: "Status updated (mock)" };
                }
                headers.Authorization = `Bearer ${token}`;
            }
            const payload = Object.assign(Object.assign({ index, _id: alertId, status }, (comments && { comments })), (assignee && { assignee }));
            console.log("Updating alert status with payload:", payload);
            // Allow self-signed certs for this request
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
            try {
                const response = yield (0, node_fetch_1.default)(url, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(payload),
                });
                const responseText = yield response.text();
                console.log("Update status response:", response.status, responseText);
                if (!response.ok) {
                    console.error(`Failed to update alert status: ${response.status} ${response.statusText}`);
                    return { success: false, message: responseText || "Failed to update status" };
                }
                try {
                    return JSON.parse(responseText);
                }
                catch (_a) {
                    return { success: true, message: responseText || "Status updated" };
                }
            }
            finally {
                delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
            }
        }
        catch (error) {
            console.error("Error updating alert status:", error);
            return { success: false, message: "Error updating status" };
        }
    });
}
