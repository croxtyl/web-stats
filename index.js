const express = require('express');
const path = require('path');
const app = express();
const os = require('os');
const si = require('systeminformation');
const cpuStat = require('cpu-stat');
const port = 7667;
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(
    "/public",
    express.static(path.join(__dirname, 'public'))
  );
app.use(express.urlencoded({ extended: true }));

app.get('/', async (req, res) => {
    try {
        res.render('index');
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Error');
    }
});
app.get('/stats', async (req, res) => {
    try {
        const stats = await getServerStats();
        res.json(stats);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Error' });
    }
});
async function getServerStats() {
    try {
        const cpuUsage = await getCpuUsage();

        const ramTotal = os.totalmem();
        const ramFree = os.freemem();
        const ramUsed = ramTotal - ramFree;
        const ramUsagePercent = (ramUsed / ramTotal) * 100;
        const ramUsedGB = ramUsed / (1024 * 1024 * 1024);

        const disks = await si.fsSize();
        const diskTotal = disks.reduce((total, disk) => total + disk.size, 0);
        const diskUsed = disks.reduce((total, disk) => total + disk.used, 0);
        const diskUsagePercent = (diskUsed / diskTotal) * 100;

        const uptime = os.uptime();
        const uptimeDays = Math.floor(uptime / (3600 * 24));
        const uptimeHours = Math.floor((uptime % (3600 * 24)) / 3600);
        const uptimeMinutes = Math.floor((uptime % 3600) / 60);
        const uptimeSeconds = Math.floor(uptime % 60);

        const stats = {
            cpuUsage: cpuUsage.toFixed(2),
            ramUsage: `${(ramUsedGB).toFixed(2)}GB / ${(ramTotal / (1024 * 1024 * 1024)).toFixed(2)}GB - ${ramUsagePercent.toFixed(2)}%`,
            diskUsage: `${(diskUsed / (1024 * 1024 * 1024)).toFixed(2)}GB / ${(diskTotal / (1024 * 1024 * 1024)).toFixed(2)}GB - ${diskUsagePercent.toFixed(2)}%`,
            uptime: `${uptimeDays} days ${uptimeHours} hours ${uptimeMinutes} minutes ${uptimeSeconds} secound`,
            ramUsedGB: ramUsedGB.toFixed(2)
        };

        return stats;
    } catch (error) {
        console.error("Error:", error);
        return {
            cpuUsage: 'N/A',
            ramUsage: 'N/A',
            diskUsage: 'N/A',
            uptime: 'N/A',
            ramUsedGB: 'N/A'
        };
    }
}

function getCpuUsage() {
    return new Promise((resolve, reject) => {
        cpuStat.usagePercent((err, percent) => {
            if (err) {
                reject(err);
            } else {
                resolve(percent);
            }
        });
    });
}

module.exports = getServerStats;
app.get('*', (req, res) => {
    res.redirect('/');
});
app.listen(port, () => {
    console.log(`Server listening at ${port}`);
});