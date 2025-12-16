const express = require("express");
const app = express();
const axios = require("axios");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync } = require('child_process');

const UPLOAD_URL = process.env.UPLOAD_URL || '';
const PROJECT_URL = process.env.PROJECT_URL || '';
const AUTO_ACCESS = process.env.AUTO_ACCESS || false;
const FILE_PATH = process.env.FILE_PATH || './tmp';
const SUB_PATH = process.env.SUB_PATH || 'xujq';
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const UUID = process.env.UUID || '8fa31c3b-c549-44de-bf0e-17bb3006365d';
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';
const NEZHA_PORT = process.env.NEZHA_PORT || '';
const NEZHA_KEY = process.env.NEZHA_KEY || '';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'xray1.900809.xyz';
const ARGO_AUTH = process.env.ARGO_AUTH || '';
const ARGO_PORT = process.env.ARGO_PORT || 8001;
const CFIP = process.env.CFIP || 'cdns.doon.eu.org';
const CFPORT = process.env.CFPORT || 443;
const NAME = process.env.NAME || '';

// 创建运行目录
if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH);

// 随机 6 位字符文件名
function generateRandomName() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

// 文件路径
const npmName = generateRandomName();
const webName = generateRandomName();
const botName = generateRandomName();
const phpName = generateRandomName();
let npmPath = path.join(FILE_PATH, npmName);
let webPath = path.join(FILE_PATH, webName);
let botPath = path.join(FILE_PATH, botName);
let phpPath = path.join(FILE_PATH, phpName);
let subPath = path.join(FILE_PATH, 'sub.txt');
let bootLogPath = path.join(FILE_PATH, 'boot.log');
let configPath = path.join(FILE_PATH, 'config.json');

// 根路由
app.get("/", (req, res) => res.send("Hello world!"));

// 删除历史节点
function deleteNodes() {
  if (!UPLOAD_URL || !fs.existsSync(subPath)) return;
  try {
    const fileContent = fs.readFileSync(subPath, 'utf-8');
    const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
    const nodes = decoded.split('\n').filter(line => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line));
    if (nodes.length > 0) {
      axios.post(`${UPLOAD_URL}/api/delete-nodes`, JSON.stringify({ nodes }), { headers: { 'Content-Type': 'application/json' } }).catch(() => null);
    }
  } catch {}
}

// 清理历史文件
function cleanupOldFiles() {
  try {
    const files = fs.readdirSync(FILE_PATH);
    files.forEach(file => {
      const fp = path.join(FILE_PATH, file);
      if (fs.existsSync(fp) && fs.statSync(fp).isFile()) fs.unlinkSync(fp);
    });
  } catch {}
}

// 生成 xr-ay 配置
async function generateConfig() {
  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: [
      { port: ARGO_PORT, protocol: 'vless', settings: { clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], decryption: 'none', fallbacks: [{ dest: 3001 }, { path: "/vless-argo", dest: 3002 }, { path: "/vmess-argo", dest: 3003 }, { path: "/trojan-argo", dest: 3004 }] }, streamSettings: { network: 'tcp' } },
      { port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp", security: "none" } },
      { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
    ],
    dns: { servers: ["https+local://8.8.8.8/dns-query"] },
    outbounds: [{ protocol: "freedom", tag: "direct" }, { protocol: "blackhole", tag: "block" }]
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// 系统架构
function getSystemArchitecture() {
  const arch = os.arch();
  return ['arm', 'arm64', 'aarch64'].includes(arch) ? 'arm' : 'amd';
}

// 下载文件
function downloadFile(fileName, fileUrl) {
  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(fileName);
    axios({ method: 'get', url: fileUrl, responseType: 'stream' })
      .then(response => {
        response.data.pipe(writer);
        writer.on('finish', () => { writer.close(); resolve(fileName); });
        writer.on('error', err => { fs.unlink(fileName, () => {}); reject(err); });
      }).catch(err => reject(err));
  });
}

// 根据架构返回文件列表
function getFilesForArchitecture(architecture) {
  if (architecture === 'arm') return [{ fileName: webPath, fileUrl: "https://arm64.ssss.nyc.mn/web" }, { fileName: botPath, fileUrl: "https://arm64.ssss.nyc.mn/bot" }];
  return [{ fileName: webPath, fileUrl: "https://amd64.ssss.nyc.mn/web" }, { fileName: botPath, fileUrl: "https://amd64.ssss.nyc.mn/bot" }];
}

// 下载并运行
async function downloadFilesAndRun() {
  const arch = getSystemArchitecture();
  const files = getFilesForArchitecture(arch);
  for (const f of files) {
    try { await downloadFile(f.fileName, f.fileUrl); } catch (err) { console.error('download error', err); }
  }
  const filesToAuthorize = NEZHA_PORT ? [npmPath, webPath, botPath] : [phpPath, webPath, botPath];
  filesToAuthorize.forEach(f => { if (fs.existsSync(f)) fs.chmodSync(f, 0o775); });
  try { await exec(`nohup ${webPath} -c ${configPath} >/dev/null 2>&1 &`); } catch (err) { console.error(err); }
  if (fs.existsSync(botPath)) {
    const args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${bootLogPath} --loglevel info --url http://localhost:${ARGO_PORT}`;
    try { await exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`); } catch (err) { console.error(err); }
  }
}

// 默认实现：killBotProcess
function killBotProcess() {
  try { execSync(`pkill -f ${botPath}`); } catch {}
}

// 默认实现：extractDomains
async function extractDomains() {
  console.log('extractDomains called (default implementation)');
}

// 自动访问任务
async function AddVisitTask() {
  if (!AUTO_ACCESS || !PROJECT_URL) return;
  try { await axios.post('https://oooo.serv00.net/add-url', { url: PROJECT_URL }, { headers: { 'Content-Type': 'application/json' } }); } catch (error) { console.error(error.message); }
}

// 关键修复：原本裸露的 await 收拢
async function restartBotAndExtract() {
  try {
    killBotProcess();
    await new Promise(r => setTimeout(r, 3000));
    const args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${bootLogPath} --loglevel info --url http://localhost:${ARGO_PORT}`;
    await exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`);
    await new Promise(r => setTimeout(r, 3000));
    await extractDomains();
  } catch (error) { console.error(error); }
}

// 启动主函数
async function startserver() {
  try {
    deleteNodes();
    cleanupOldFiles();
    await generateConfig();
    await downloadFilesAndRun();
    await restartBotAndExtract();
    await AddVisitTask();
  } catch (error) { console.error('startserver error', error); }
}

startserver().catch(err => console.error(err));
app.listen(PORT, () => console.log(`http server running on port: ${PORT}`));
