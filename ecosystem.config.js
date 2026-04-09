module.exports = {
  apps: [
    {
      name: "soc-dashboard",
      script: "server.js", // Use custom server with integrated polling
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
}
