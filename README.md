## web-stats

**web-stats** project is a real-time monitoring tool that displays server metrics with **linux** OS including CPU, RAM, disk, and network usage.

Available stats:

- CPU usage (total or per-core)
- Memory usage (RAM, cache, or swap)
- Disk space utilization
- Network traffic by interface

## Setup

1. Download or clone this github repo
2. Install packages using command: `npm install`
3. Start server using one of following commands:

- `node .`
- `node index.js`

#### For ease of use, I recommend running with pm2:

- `npm install -g pm2`
- `pm2 start index.js --name web-stats`
