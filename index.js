const express = require('express');
const path = require('path');
const app = express();
const os = require('os');
const si = require('systeminformation');
const port = 7667;
const NoCrash = require('nocrasher');
const noCrashing = new NoCrash({
  enableNoCrasher: true,
  enableWebhook: false,
});
app.set('views', path.join(__dirname, 'views'));
app.use("/public", express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
const cache = {
    ramTotal: os.totalmem(),
    diskUsage: null,
    diskCacheTime: 0,
    diskCacheTTL: 3 * 60 * 1000
};
app.get('/', async (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});
app.get('/stats', async (req, res) => {
    const cpuType = req.query.cpuType || 'total';
    const ramType = req.query.ramType || 'ram';
    const interfaceName = req.query.interface || 'eth0';
    const stats = await getServerStats(cpuType, ramType);
    const networkStats = await getNetworkStats(interfaceName);
    res.json({
        ...stats,
        downloadSpeed: networkStats.downloadSpeed.toFixed(2),
        uploadSpeed: networkStats.uploadSpeed.toFixed(2),
    });
});
async function getServerStats(cpuType = 'total', ramType = 'ram') {
    const cpuUsage = cpuType === 'per-core'
        ? await getPerCoreUsage()
        : await getCpuUsage();
    const ramTotal = cache.ramTotal;
    const ramFree = os.freemem();
    const memInfo = await si.mem();
    const cacheUsed = memInfo.buffcache || 0;
    const swapTotal = memInfo.swaptotal || 0;
    const swapUsed = memInfo.swapused || 0;
    const ramUsed = ramTotal - ramFree;
    let ramUsedGB, ramTotalGB;
    if (ramType === 'ram') {
        ramUsedGB = ramUsed / (1024 * 1024 * 1024);
        ramTotalGB = ramTotal / (1024 * 1024 * 1024);
    } else if (ramType === 'cache') {
        ramUsedGB = cacheUsed / (1024 * 1024 * 1024);
        ramTotalGB = ramTotal / (1024 * 1024 * 1024);
    } else if (ramType === 'swap') {
        ramUsedGB = swapUsed / (1024 * 1024 * 1024);
        ramTotalGB = swapTotal / (1024 * 1024 * 1024);
    }
    const ramUsagePercent = ramType === 'swap'
        ? (swapUsed / swapTotal) * 100
        : (ramUsed / ramTotal) * 100;
    let diskUsage = cache.diskUsage;
    const now = Date.now();
    if (!diskUsage || now - cache.diskCacheTime > cache.diskCacheTTL) {
        const disks = await si.fsSize();
        const mainDisk = disks.find(disk => disk.mount === '/');
        diskUsage = mainDisk
            ? `${(mainDisk.used / (1024 * 1024 * 1024)).toFixed(2)} GB / ${(mainDisk.size / (1024 * 1024 * 1024)).toFixed(2)} GB`
            : 'N/A';
        cache.diskUsage = diskUsage;
        cache.diskCacheTime = now;
    }
    const uptime = os.uptime();
    const uptimeDays = Math.floor(uptime / (3600 * 24));
    const uptimeHours = Math.floor((uptime % (3600 * 24)) / 3600);
    const uptimeMinutes = Math.floor((uptime % 3600) / 60);
    const uptimeSeconds = Math.round(uptime % 60);
    const cpuTemp = await si.cpuTemperature();
    const cpuTempAvg = cpuTemp.main || 'N/A';
    return {
        cpuUsage: Array.isArray(cpuUsage) ? cpuUsage : [parseFloat(cpuUsage.toFixed(2))],
        cpuTemp: `${cpuTempAvg.toFixed(2)} °C`,
        ramUsage: `${ramUsedGB.toFixed(2)} GB / ${ramTotalGB.toFixed(2)} GB (${ramUsagePercent.toFixed(2)}%)`,
        diskUsage,
        uptime: `${uptimeDays} days ${uptimeHours} hours ${uptimeMinutes} minutes ${uptimeSeconds} seconds`
    };
}
async function getPerCoreUsage() {
    const cpuLoad = await si.currentLoad();
    return cpuLoad.cpus.map(cpu => cpu.load);
}
async function getCpuUsage() {
    try {
        const cpuLoad = await si.currentLoad();
        return cpuLoad.currentLoad;
    } catch (error) {
        console.error('Error fetching CPU usage:', error);
        return 0;
    }
}
const networkStatsCache = {};
async function getNetworkStats(interfaceName) {
    const stats = await si.networkStats(interfaceName);
    const currentStats = stats[0];
    const now = Date.now();
    if (!networkStatsCache[interfaceName]) {
        networkStatsCache[interfaceName] = { lastRx: currentStats.rx_bytes, lastTx: currentStats.tx_bytes, lastTime: now };
        return { downloadSpeed: 0, uploadSpeed: 0 };
    }
    const { lastRx, lastTx, lastTime } = networkStatsCache[interfaceName];
    const timeDiff = (now - lastTime) / 1000;
    const downloadSpeed = ((currentStats.rx_bytes - lastRx) / timeDiff) / (1024 * 1024);
    const uploadSpeed = ((currentStats.tx_bytes - lastTx) / timeDiff) / (1024 * 1024);
    networkStatsCache[interfaceName] = { lastRx: currentStats.rx_bytes, lastTx: currentStats.tx_bytes, lastTime: now };
    return { downloadSpeed, uploadSpeed };
}
app.get('/network-interfaces', async (req, res) => {
    const interfaces = Object.keys(os.networkInterfaces());
    res.json(interfaces);
});
app.get('*', (req, res) => {
    res.redirect('/');
});
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});