import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { checkIpReputation } from "@/lib/threat-intel/virustotal"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { tool, parameters } = body

    switch (tool) {
      case "get_alerts":
        return await getAlerts(parameters)
      case "get_alert_stats":
        return await getAlertStats(parameters)
      case "search_alerts":
        return await searchAlerts(parameters)
      case "check_ip_threat":
        return await checkIpThreat(parameters);
      default:
        return NextResponse.json({ error: "Unknown tool" }, { status: 400 })
    }
  } catch (error) {
    console.error("Error in chat tools:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function checkIpThreat(parameters: any) {
  const { ip } = parameters;

  if (!ip) {
    return NextResponse.json(
      { error: "IP address parameter is missing" },
      { status: 400 }
    );
  }

  const result = await checkIpReputation(ip);

  const responseTemplate = result
    ? `??? Hasil analisis dari layanan threat intelligence terhadap IP \`${ip}\`:\n\n${result}`
    : `?? Tidak ditemukan informasi signifikan terkait IP \`${ip}\`. Disarankan untuk tetap memantau aktivitas yang berkaitan.`;

  return NextResponse.json({
    summary: responseTemplate,
    raw: result,
    ip,
  });
}

async function getAlerts(parameters: any) {
  const { timeRange = "1h", status, severity, limit = 10 } = parameters

  // Calculate time range
  const hours =
    {
      "1h": 1,
      "12h": 12,
      "24h": 24,
      "7d": 168,
      "30d": 720,
    }[timeRange] || 1

  const fromTime = new Date(Date.now() - hours * 60 * 60 * 1000)

  const where: any = {
    timestamp: {
      gte: fromTime,
    },
  }

  if (status) {
    where.status = status
  }

  if (severity) {
    where.severity = severity
  }

  const alerts = await prisma.alert.findMany({
    where,
    include: {
      integration: {
        select: {
          name: true,
          source: true,
        },
      },
    },
    orderBy: {
      timestamp: "desc",
    },
    take: limit,
  })

  return NextResponse.json({
    alerts: alerts.map((alert) => ({
      id: alert.id,
      title: alert.title,
      description: alert.description,
      severity: alert.severity,
      status: alert.status,
      source: alert.source,
      externalId: alert.externalId,
      timestamp: alert.timestamp.toISOString(),
      score: alert.score,
      metadata: alert.metadata,
      integration: alert.integration,
    })),
  })
}

async function getAlertStats(parameters: any) {
  const { timeRange = "24h" } = parameters

  const hours =
    {
      "1h": 1,
      "12h": 12,
      "24h": 24,
      "7d": 168,
      "30d": 720,
    }[timeRange] || 24

  const fromTime = new Date(Date.now() - hours * 60 * 60 * 1000)

  const [totalAlerts, statusCounts, severityCounts] = await Promise.all([
    prisma.alert.count({
      where: {
        timestamp: {
          gte: fromTime,
        },
      },
    }),
    prisma.alert.groupBy({
      by: ["status"],
      where: {
        timestamp: {
          gte: fromTime,
        },
      },
      _count: {
        status: true,
      },
    }),
    prisma.alert.groupBy({
      by: ["severity"],
      where: {
        timestamp: {
          gte: fromTime,
        },
      },
      _count: {
        severity: true,
      },
    }),
  ])

  return NextResponse.json({
    totalAlerts,
    statusCounts: statusCounts.reduce(
      (acc, item) => {
        acc[item.status] = item._count.status
        return acc
      },
      {} as Record<string, number>,
    ),
    severityCounts: severityCounts.reduce(
      (acc, item) => {
        acc[item.severity] = item._count.severity
        return acc
      },
      {} as Record<string, number>,
    ),
    timeRange,
  })
}

async function searchAlerts(parameters: any) {
  const { 
    query,
    timeRange = "30d", // Default diubah ke 30 hari
    limit = 20,
    severity,
    status,
    externalId,
    metadataField,
    metadataValue
  } = parameters;

  // Konversi rentang waktu
  const hours =
    {
      "1h": 1,
      "12h": 12,
      "24h": 24,
      "7d": 168,
      "30d": 720,
    }[timeRange] || 720; // Default 30 hari

  const fromTime = new Date(Date.now() - hours * 60 * 60 * 1000);

  // Build where clause
  const where: any = {
    timestamp: {
      gte: fromTime,
    }
  };

  // Handle severity filter (untuk prompt "alert Critical")
  if (severity) {
    where.severity = severity;
  }

  // Handle status filter
  if (status) {
    where.status = status;
  }

  // Handle externalId exact match
  if (externalId) {
    where.externalId = externalId;
  }

  // Handle metadata filter
  if (metadataField && metadataValue) {
    where.metadata = {
      path: [metadataField],
      equals: metadataValue
    };
  }

  // Handle text query search
  if (query) {
    where.OR = [
      {
        title: {
          contains: query,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: query,
          mode: "insensitive",
        },
      },
      {
        source: {
          contains: query,
          mode: "insensitive",
        },
      },
      {
        externalId: {
          contains: query,
          mode: "insensitive",
        },
      },
      {
        metadata: {
          path: ["assignee"],
          string_contains: query,
          mode: "insensitive",
        },
      },
      {
        metadata: {
          path: ["event_name"],
          string_contains: query,
          mode: "insensitive",
        },
      }
    ];
  }

  const alerts = await prisma.alert.findMany({
    where,
    include: {
      integration: {
        select: {
          name: true,
          source: true,
        },
      },
    },
    orderBy: {
      timestamp: "desc",
    },
    take: limit,
  });

  return NextResponse.json({
    alerts: alerts.map((alert) => ({
      id: alert.id,
      title: alert.title,
      description: alert.description,
      severity: alert.severity,
      status: alert.status,
      source: alert.source,
      externalId: alert.externalId,
      timestamp: alert.timestamp.toISOString(),
      score: alert.score,
      metadata: alert.metadata,
      integration: alert.integration,
    })),
    query,
    count: alerts.length,
    timeRange,
  });
}