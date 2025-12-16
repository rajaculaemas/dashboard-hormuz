"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface AgentInstructionsProps {
  agentKey: string
  agentSecret: string
}

export function AgentInstructions({ agentKey, agentSecret }: AgentInstructionsProps) {
  const [copied, setCopied] = useState(false)
  const API_ENDPOINT = "https://your-soc-dashboard.com/api/logs"

  const linuxScript = `#!/bin/bash
# SOC Dashboard Agent Installation Script
# Run with sudo privileges

# Set variables
AGENT_KEY="${agentKey}"
AGENT_SECRET="${agentSecret}"
API_ENDPOINT="${API_ENDPOINT}"

# Create agent directory
mkdir -p /opt/soc-agent

# Download agent binary
curl -sSL "https://your-soc-dashboard.com/downloads/agent" -o /opt/soc-agent/soc-agent

# Make agent executable
chmod +x /opt/soc-agent/soc-agent

# Create configuration file
cat > /opt/soc-agent/config.yaml << EOF
agent:
  key: ${agentKey}
  secret: ${agentSecret}
  endpoint: ${API_ENDPOINT}
  interval: 60
  log_level: info

sources:
  - type: syslog
    path: /var/log/syslog
  - type: auth
    path: /var/log/auth.log
  - type: application
    path: /var/log/application.log
EOF

# Create systemd service
cat > /etc/systemd/system/soc-agent.service << EOF
[Unit]
Description=SOC Dashboard Agent
After=network.target

[Service]
Type=simple
User=root
ExecStart=/opt/soc-agent/soc-agent --config /opt/soc-agent/config.yaml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
systemctl daemon-reload
systemctl enable soc-agent
systemctl start soc-agent

echo "SOC Dashboard Agent installed successfully!"
echo "Check status with: systemctl status soc-agent"
`

  const windowsScript = `# SOC Dashboard Agent Installation Script (PowerShell)
# Run as Administrator

# Set variables
$AGENT_KEY = "${agentKey}"
$AGENT_SECRET = "${agentSecret}"
$API_ENDPOINT = "https://your-soc-dashboard.com/api/logs"

# Create agent directory
New-Item -ItemType Directory -Force -Path "C:\\Program Files\\SOC-Agent"

# Download agent binary
Invoke-WebRequest -Uri "https://your-soc-dashboard.com/downloads/agent.exe" -OutFile "C:\\Program Files\\SOC-Agent\\soc-agent.exe"

# Create configuration file
@"
agent:
  key: ${agentKey}
  secret: ${agentSecret}
  endpoint: ${API_ENDPOINT}
  interval: 60
  log_level: info

sources:
  - type: eventlog
    name: System
  - type: eventlog
    name: Application
  - type: eventlog
    name: Security
"@ | Out-File -FilePath "C:\\Program Files\\SOC-Agent\\config.yaml" -Encoding utf8

# Create Windows service
New-Service -Name "SOCAgent" -BinaryPathName "C:\\Program Files\\SOC-Agent\\soc-agent.exe --config C:\\Program Files\\SOC-Agent\\config.yaml" -DisplayName "SOC Dashboard Agent" -StartupType Automatic -Description "Collects and forwards logs to SOC Dashboard"

# Start service
Start-Service -Name "SOCAgent"

Write-Host "SOC Dashboard Agent installed successfully!"
Write-Host "Check status with: Get-Service -Name SOCAgent"
`

  const dockerScript = `# SOC Dashboard Agent Docker Installation

# Create a directory for the agent
mkdir -p ~/soc-agent

# Create configuration file
cat > ~/soc-agent/config.yaml << EOF
agent:
  key: ${agentKey}
  secret: ${agentSecret}
  endpoint: https://your-soc-dashboard.com/api/logs
  interval: 60
  log_level: info

sources:
  - type: docker
    include_containers: all
EOF

# Run the agent container
docker run -d \\
  --name soc-agent \\
  --restart always \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  -v ~/soc-agent/config.yaml:/config.yaml \\
  -v /var/log:/host/var/log:ro \\
  your-registry/soc-agent:latest \\
  --config /config.yaml
`

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Agent Installation Instructions</h2>
      <p className="text-sm text-muted-foreground">
        Install the agent on your systems to collect and forward logs to your SOC Dashboard. Choose the appropriate
        installation method for your environment.
      </p>

      <Tabs defaultValue="linux">
        <TabsList className="grid grid-cols-3">
          <TabsTrigger value="linux">Linux</TabsTrigger>
          <TabsTrigger value="windows">Windows</TabsTrigger>
          <TabsTrigger value="docker">Docker</TabsTrigger>
        </TabsList>
        <TabsContent value="linux" className="space-y-4 pt-4">
          <div className="relative">
            <pre className="bg-background p-4 rounded-md text-xs overflow-x-auto max-h-96">
              <code>{linuxScript}</code>
            </pre>
            <Button
              variant="outline"
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => copyToClipboard(linuxScript)}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="ml-2">{copied ? "Copied" : "Copy"}</span>
            </Button>
          </div>
          <p className="text-sm">
            Save this script as <code>install-agent.sh</code> and run it with <code>sudo bash install-agent.sh</code>
          </p>
        </TabsContent>
        <TabsContent value="windows" className="space-y-4 pt-4">
          <div className="relative">
            <pre className="bg-background p-4 rounded-md text-xs overflow-x-auto max-h-96">
              <code>{windowsScript}</code>
            </pre>
            <Button
              variant="outline"
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => copyToClipboard(windowsScript)}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="ml-2">{copied ? "Copied" : "Copy"}</span>
            </Button>
          </div>
          <p className="text-sm">
            Save this script as <code>install-agent.ps1</code> and run it in PowerShell with administrator privileges
          </p>
        </TabsContent>
        <TabsContent value="docker" className="space-y-4 pt-4">
          <div className="relative">
            <pre className="bg-background p-4 rounded-md text-xs overflow-x-auto max-h-96">
              <code>{dockerScript}</code>
            </pre>
            <Button
              variant="outline"
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => copyToClipboard(dockerScript)}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="ml-2">{copied ? "Copied" : "Copy"}</span>
            </Button>
          </div>
          <p className="text-sm">Run this script to deploy the agent as a Docker container</p>
        </TabsContent>
      </Tabs>

      <div className="bg-muted/50 p-4 rounded-md">
        <h3 className="font-medium mb-2">Agent Configuration</h3>
        <p className="text-sm text-muted-foreground mb-4">
          The agent will automatically collect and forward logs from common sources. You can customize the configuration
          file to include additional log sources or change settings.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium mb-1">Agent Key</p>
            <code className="text-xs bg-background p-1 rounded">{agentKey}</code>
          </div>
          <div>
            <p className="text-xs font-medium mb-1">Agent Secret</p>
            <code className="text-xs bg-background p-1 rounded">••••••••••••••••</code>
          </div>
        </div>
      </div>
    </div>
  )
}
