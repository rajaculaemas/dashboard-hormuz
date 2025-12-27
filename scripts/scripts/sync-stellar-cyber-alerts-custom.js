#!/usr/bin/env ts-node
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
const prisma_1 = __importDefault(require("../lib/prisma"));
const stellar_cyber_1 = require("../lib/api/stellar-cyber");
/**
 * Custom Stellar Cyber sync script
 *
 * Usage:
 *  - Edit the `DEFAULT_FROM` / `DEFAULT_TO` constants below to change the default time range,
 *    or pass `--from <ISO>` and `--to <ISO>` to override at runtime.
 *  - Optionally pass `--integration <id>` to target a specific integration.
 *  - Use `--dry-run` to see counts without writing to DB.
 *
 * Examples:
 *  pnpm ts-node scripts/sync-stellar-cyber-alerts-custom.ts --days 30
 *  pnpm ts-node scripts/sync-stellar-cyber-alerts-custom.ts --integration <id>
 */
// By default this script will sync the last 30 days. You can change the
// constants below, or prefer to pass `--from`/`--to` on the CLI.
const DEFAULT_DAYS_BACK = 30; // used only when one side of range omitted
// DEFAULT_FROM / DEFAULT_TO should be ISO timestamps or empty string to use relative
const DEFAULT_FROM = ""; // e.g. "2025-12-01T00:00:00Z" or empty
const DEFAULT_TO = ""; // e.g. "2025-12-24T23:59:59Z" or empty
function sync() {
    return __awaiter(this, arguments, void 0, function* (options = {}) {
        const { integrationId, from, to, daysBack = DEFAULT_DAYS_BACK, dryRun = false, batchSize = 100 } = options;
        console.log("Starting Stellar Cyber sync (custom)");
        console.log(`Options: integrationId=${integrationId || "(any)"} daysBack=${daysBack} dryRun=${dryRun} batchSize=${batchSize}`);
        try {
            // Find integration (or first connected Stellar Cyber)
            let integration;
            if (integrationId) {
                integration = yield prisma_1.default.integration.findUnique({ where: { id: integrationId } });
            }
            else {
                integration = yield prisma_1.default.integration.findFirst({ where: { source: "stellar-cyber", status: "connected" } });
            }
            if (!integration) {
                console.error("Stellar Cyber integration not found. Configure an integration in DB or pass --integration <id>.");
                process.exit(1);
            }
            console.log(`Using integration: ${integration.name} (${integration.id})`);
            if (from || to) {
                console.log(`Fetching alerts from Stellar Cyber (range: ${from || "(from omitted)"} -> ${to || "(to omitted)"})`);
            }
            else if (DEFAULT_FROM || DEFAULT_TO) {
                console.log(`Fetching alerts using defaults from file: ${DEFAULT_FROM || "(from omitted)"} -> ${DEFAULT_TO || "(to omitted)"}`);
            }
            else {
                console.log(`Fetching alerts from Stellar Cyber (last ${daysBack} days)...`);
            }
            const alerts = yield (0, stellar_cyber_1.getAlerts)({ integrationId: integration.id, limit: 10000, startTime: from || DEFAULT_FROM || undefined, endTime: to || DEFAULT_TO || undefined, daysBack });
            console.log(`Fetched ${alerts.length} alerts`);
            if (!alerts || alerts.length === 0) {
                console.log("No alerts to sync");
                process.exit(0);
            }
            let synced = 0;
            let updated = 0;
            let failed = 0;
            for (let i = 0; i < alerts.length; i += batchSize) {
                const batch = alerts.slice(i, i + batchSize);
                for (const a of batch) {
                    try {
                        const externalId = a._id;
                        if (!externalId) {
                            failed++;
                            continue;
                        }
                        const mapped = {
                            externalId,
                            title: a.title || "Unknown Alert",
                            description: a.description || "",
                            severity: String(a.severity || "0"),
                            status: a.status || "New",
                            timestamp: a.timestamp ? new Date(a.timestamp) : new Date(),
                            integrationId: integration.id,
                            metadata: a.metadata || {},
                        };
                        if (!dryRun) {
                            const existing = yield prisma_1.default.alert.findUnique({ where: { externalId } });
                            if (existing) {
                                yield prisma_1.default.alert.update({ where: { externalId }, data: Object.assign(Object.assign({}, mapped), { updatedAt: new Date() }) });
                                updated++;
                            }
                            else {
                                yield prisma_1.default.alert.create({ data: mapped });
                                synced++;
                            }
                        }
                        else {
                            // Dry run: just count as synced
                            synced++;
                        }
                    }
                    catch (err) {
                        failed++;
                        console.error("Error syncing alert:", err instanceof Error ? err.message : String(err));
                    }
                }
            }
            console.log("Sync complete");
            console.log(`New: ${synced}, Updated: ${updated}, Failed: ${failed}`);
            // update integration lastSync
            if (!dryRun) {
                try {
                    yield prisma_1.default.integration.update({ where: { id: integration.id }, data: { lastSync: new Date() } });
                }
                catch (e) {
                    console.warn("Failed to update integration.lastSync:", e instanceof Error ? e.message : String(e));
                }
            }
            return { synced, updated, failed };
        }
        finally {
            yield prisma_1.default.$disconnect();
        }
    });
}
// CLI parsing
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const args = process.argv.slice(2);
        const opts = { daysBack: DEFAULT_DAYS_BACK, batchSize: 100 };
        for (let i = 0; i < args.length; i++) {
            const a = args[i];
            if (a === "--days" && args[i + 1]) {
                opts.daysBack = parseInt(args[i + 1], 10);
                i++;
            }
            else if (a === "--integration" && args[i + 1]) {
                opts.integrationId = args[i + 1];
                i++;
            }
            else if (a === "--dry-run") {
                opts.dryRun = true;
            }
            else if (a === "--batch-size" && args[i + 1]) {
                opts.batchSize = parseInt(args[i + 1], 10);
                i++;
            }
            else if (a === "--help" || a === "-h") {
                console.log(`Usage: pnpm ts-node scripts/sync-stellar-cyber-alerts-custom.ts [--days N] [--integration ID] [--dry-run] [--batch-size N]\n\nDEFAULT_DAYS_BACK = ${DEFAULT_DAYS_BACK} (edit file to change default)`);
                process.exit(0);
            }
        }
        yield sync(opts);
    });
}
main().catch((err) => {
    console.error("Fatal error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
});
