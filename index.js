const express = require("express");
const path = require("path");
const os = require("os");
const si = require("systeminformation");
const WebSocket = require("ws");
const cors = require("cors");
const app = express();
const port = 7667;

// Cache setup
const cache = {
  ramTotal: os.totalmem(),
  diskUsage: null,
  diskCacheTime: 0,
  diskCacheTTL: 3 * 60 * 1000,
  networkStatsCache: {},
  clients: new Set(),
};

// Express settings
app.set("views", path.join(__dirname, "views"));
app.use("/public", express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(cors());

// Endpoints
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

app.get("/network-interfaces", async (req, res) => {
  try {
    const interfaces = Object.keys(os.networkInterfaces());
    res.json(interfaces);
  } catch (error) {
    console.error("Error fetching network interfaces:", error);
    res.status(500).json({ error: "Failed to fetch network interfaces" });
  }
});

// WebSocket server
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  cache.clients.add(ws);

  ws.on("close", () => {
    cache.clients.delete(ws);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    cache.clients.delete(ws);
  });
});

// Broadcast stats to all connected clients
async function broadcastStats() {
  if (cache.clients.size === 0) return;

  try {
    const stats = await getAllStats();
    const message = JSON.stringify(stats);

    cache.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  } catch (error) {
    console.error("Error broadcasting stats:", error);
  }
}

// Get all server stats
async function getAllStats() {
  const [cpuStats, ramStats, diskStats, networkStats, systemStats] = await Promise.all([getCpuStats(), getRamStats(), getDiskStats(), getNetworkStats(), getSystemStats()]);

  return {
    cpu: cpuStats,
    ram: ramStats,
    disk: diskStats,
    network: networkStats,
    system: systemStats,
    timestamp: Date.now(),
  };
}

// CPU stats
async function getCpuStats() {
  try {
    const [cpuLoad, cpuTemp] = await Promise.all([si.currentLoad(), si.cpuTemperature()]);

    return {
      usage: {
        total: cpuLoad.currentLoad,
        cores: cpuLoad.cpus.map((cpu) => cpu.load),
      },
      temperature: cpuTemp.main !== null && !isNaN(cpuTemp.main) ? cpuTemp.main.toFixed(2) : null,
    };
  } catch (error) {
    console.error("Error fetching CPU stats:", error);
    return { error: "Failed to fetch CPU stats" };
  }
}

// RAM stats
async function getRamStats() {
  try {
    const memInfo = await si.mem();
    const ramTotal = cache.ramTotal;
    const ramFree = os.freemem();
    const ramUsed = ramTotal - ramFree;

    return {
      ram: {
        used: ramUsed,
        free: ramFree,
        total: ramTotal,
        percent: (ramUsed / ramTotal) * 100,
      },
      cache: {
        used: memInfo.buffcache || 0,
        percent: (memInfo.buffcache / ramTotal) * 100 || 0,
      },
      swap: {
        used: memInfo.swapused || 0,
        total: memInfo.swaptotal || 0,
        percent: memInfo.swaptotal > 0 ? (memInfo.swapused / memInfo.swaptotal) * 100 : 0,
      },
    };
  } catch (error) {
    console.error("Error fetching RAM stats:", error);
    return { error: "Failed to fetch RAM stats" };
  }
}

// Disk stats
async function getDiskStats() {
  try {
    const now = Date.now();
    if (cache.diskUsage && now - cache.diskCacheTime < cache.diskCacheTTL) {
      return cache.diskUsage;
    }
    const disks = await si.fsSize();
    //disk directory
    const mainDisk = disks.find((disk) => disk.mount === "/") || disks[0];
    if (!mainDisk) return null;
    const diskStats = {
      used: mainDisk.used,
      total: mainDisk.size,
      percent: (mainDisk.used / mainDisk.size) * 100,
    };

    cache.diskUsage = diskStats;
    cache.diskCacheTime = now;

    return diskStats;
  } catch (error) {
    console.error("Error fetching disk stats:", error);
    return { error: "Failed to fetch disk stats" };
  }
}

// Network stats
async function getNetworkStats() {
  try {
    const interfaces = Object.keys(os.networkInterfaces());
    const statsPromises = interfaces.map((iface) => getInterfaceStats(iface));
    const stats = await Promise.all(statsPromises);

    return stats.reduce((acc, stat, index) => {
      acc[interfaces[index]] = stat;
      return acc;
    }, {});
  } catch (error) {
    console.error("Error fetching network stats:", error);
    return { error: "Failed to fetch network stats" };
  }
}

// Interface stats
async function getInterfaceStats(interfaceName) {
  try {
    const stats = await si.networkStats(interfaceName);
    const currentStats = stats[0];
    const now = Date.now();

    if (!cache.networkStatsCache[interfaceName]) {
      cache.networkStatsCache[interfaceName] = {
        lastRx: currentStats.rx_bytes,
        lastTx: currentStats.tx_bytes,
        lastTime: now,
      };
      return { downloadSpeed: 0, uploadSpeed: 0 };
    }

    const { lastRx, lastTx, lastTime } = cache.networkStatsCache[interfaceName];
    const timeDiff = (now - lastTime) / 1000;

    const downloadSpeed = (currentStats.rx_bytes - lastRx) / timeDiff / (1024 * 1024);
    const uploadSpeed = (currentStats.tx_bytes - lastTx) / timeDiff / (1024 * 1024);

    cache.networkStatsCache[interfaceName] = {
      lastRx: currentStats.rx_bytes,
      lastTx: currentStats.tx_bytes,
      lastTime: now,
    };

    return {
      downloadSpeed,
      uploadSpeed,
      rx_bytes: currentStats.rx_bytes,
      tx_bytes: currentStats.tx_bytes,
    };
  } catch (error) {
    console.error(`Error fetching stats for interface ${interfaceName}:`, error);
    return { error: `Failed to fetch stats for interface ${interfaceName}` };
  }
}

// System stats
function getSystemStats() {
  const uptime = os.uptime();
  const uptimeDays = Math.floor(uptime / (3600 * 24));
  const uptimeHours = Math.floor((uptime % (3600 * 24)) / 3600);
  const uptimeMinutes = Math.floor((uptime % 3600) / 60);
  const uptimeSeconds = Math.round(uptime % 60);

  return {
    uptime: {
      seconds: uptime,
      formatted: `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m ${uptimeSeconds}s`,
    },
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    loadavg: os.loadavg(),
  };
}

// Broadcast stats in interval
setInterval(broadcastStats, 1000);

broadcastStats();
