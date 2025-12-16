const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync } = require('child_process');

// --------------------------- 环境变量定义 (保持不变) ----------------------------
const UPLOAD_URL = process.env.UPLOAD_URL || '';
const PROJECT_URL = process.env.PROJECT_URL || '';
const AUTO_ACCESS = process.env.AUTO_ACCESS || false;
const FILE_PATH = process.env.FILE_PATH || './tmp'; // 运行目录,sub节点文件保存目录
const SUB_PATH = process.env.SUB_PATH || 'sub';
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const UUID = process.env.UUID || '9afd1229-b893-40c1-84dd-51e7ce204913';
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';
const NEZHA_PORT = process.env.NEZHA_PORT || '';
const NEZHA_KEY = process.env.NEZHA_KEY || '';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || '';
const ARGO_AUTH = process.env.ARGO_AUTH || '';
const ARGO_PORT = process.env.ARGO_PORT || 8001;
const CFIP = process.env.CFIP || 'cdns.doon.eu.org';
const CFPORT = process.env.CFPORT || 443;
const NAME = process.env.NAME || '';

// --------------------------- 优化后的文件路径 (使用固定名称) ----------------------------
// 假设这些二进制文件已在 Dockerfile 中下载并命名
const WEB_NAME = 'xray'; // 对应 Xray 核心
const BOT_NAME = 'cloudflared'; // 对应 Cloudflare Argo Tunnel
const NEZHA_V1_NAME = 'nezha-agent-v1'; // 对应 哪吒v1
const NEZHA_V0_NAME = 'nezha-agent-v0'; // 对应 哪吒v0

let webPath = path.join(FILE_PATH, WEB_NAME);
let botPath = path.join(FILE_PATH, BOT_NAME);
let nezhaPath = NEZHA_PORT ? path.join(FILE_PATH, NEZHA_V0_NAME) : path.join(FILE_PATH, NEZHA_V1_NAME);

let subPath = path.join(FILE_PATH, 'sub.txt');
let listPath = path.join(FILE_PATH, 'list.txt');
let bootLogPath = path.join(FILE_PATH, 'boot.log');
let configPath = path.join(FILE_PATH, 'config.json');

// 创建运行文件夹 (在容器中，如果 FILE_PATH 是 ./tmp，需要确保存在)
if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH, { recursive: true });
  console.log(`${FILE_PATH} is created`);
} else {
  console.log(`${FILE_PATH} already exists`);
}

// --------------------------- 核心函数 (调整为依赖本地文件) ----------------------------

// 如果订阅器上存在历史运行节点则先删除 (保持不变)
function deleteNodes() {
  try {
    if (!UPLOAD_URL) return;
    if (!fs.existsSync(subPath)) return;
    let fileContent;
    try {
      fileContent = fs.readFileSync(subPath, 'utf-8');
    } catch {
      return null;
    }
    const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
    const nodes = decoded.split('\n').filter(line =>
      /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line)
    );
    if (nodes.length === 0) return;
    axios.post(`${UPLOAD_URL}/api/delete-nodes`,
      JSON.stringify({ nodes }),
      { headers: { 'Content-Type': 'application/json' } }
    ).catch(() => null);
    return null;
  } catch (err) {
    return null;
  }
}

// 清理历史文件 (简化，只清理临时目录下的旧文件)
function cleanupOldFiles() {
  try {
    const filesToKeep = new Set([WEB_NAME, BOT_NAME, NEZHA_V1_NAME, NEZHA_V0_NAME]);
    const files = fs.readdirSync(FILE_PATH);
    files.forEach(file => {
      if (filesToKeep.has(file)) return; // 跳过二进制文件
      const filePath = path.join(FILE_PATH, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          fs.unlinkSync(filePath);
        } else if (stat.isDirectory()) {
          // 容器环境中通常不需要清理子目录
        }
      } catch (err) {
        // 忽略所有错误
      }
    });
  } catch (err) {
    // 忽略所有错误
  }
}

// 根路由 (保持不变)
app.get("/", function(req, res) {
  res.send("Hello world!");
});

// 生成 Xray 配置文件 (保持不变)
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
  fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));
}

// 运行依赖文件 (假设文件已存在且可执行)
async function runDependencies() {

  // 1. 授权（在 Dockerfile 中已设置，这里是保险措施）
  try {
    const filesToAuthorize = [webPath, botPath];
    if (NEZHA_SERVER && NEZHA_KEY) filesToAuthorize.push(nezhaPath);
    await exec(`chmod +x ${filesToAuthorize.join(' ')} >/dev/null 2>&1`);
  } catch (e) {
    console.warn(`Warning: Failed to ensure permissions. Assuming already executable. ${e.message}`);
  }

  // 2. 运行哪吒
  if (NEZHA_SERVER && NEZHA_KEY) {
    if (!fs.existsSync(nezhaPath)) {
        console.error(`Error: Nezha binary not found at ${nezhaPath}. Skipping.`);
    } else if (!NEZHA_PORT) {
      // 哪吒 v1
      const port = NEZHA_SERVER.includes(':') ? NEZHA_SERVER.split(':').pop() : '';
      const tlsPorts = new Set(['443', '8443', '2096', '2087', '2083', '2053']);
      const nezhatls = tlsPorts.has(port) ? 'true' : 'false';
      const configYaml = `
client_secret: ${NEZHA_KEY}
debug: false
disable_auto_update: true
disable_command_execute: false
disable_force_update: true
disable_nat: false
disable_send_query: false
gpu: false
insecure_tls: true
ip_report_period: 1800
report_delay: 4
server: ${NEZHA_SERVER}
skip_connection_count: true
skip_procs_count: true
temperature: false
tls: ${nezhatls}
use_gitee_to_upgrade: false
use_ipv6_country_code: false
uuid: ${UUID}`;

      fs.writeFileSync(path.join(FILE_PATH, 'config.yaml'), configYaml);
      const command = `nohup ${nezhaPath} -c "${FILE_PATH}/config.yaml" >/dev/null 2>&1 &`;
      try {
        await exec(command);
        console.log(`Nezha v1 is running`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Nezha v1 running error: ${error.message}`);
      }
    } else {
      // 哪吒 v0
      let NEZHA_TLS = '';
      const tlsPorts = ['443', '8443', '2096', '2087', '2083', '2053'];
      if (tlsPorts.includes(NEZHA_PORT)) {
        NEZHA_TLS = '--tls';
      }
      const command = `nohup ${nezhaPath} -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${NEZHA_TLS} --disable-auto-update --report-delay 4 --skip-conn --skip-procs >/dev/null 2>&1 &`;
      try {
        await exec(command);
        console.log(`Nezha v0 is running`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Nezha v0 running error: ${error.message}`);
      }
    }
  } else {
    console.log('NEZHA variable is empty, skip running Nezha');
  }

  // 3. 运行 Xray
  if (!fs.existsSync(webPath)) {
      console.error(`Error: Xray binary not found at ${webPath}. Skipping.`);
  } else {
      const command1 = `nohup ${webPath} -c ${FILE_PATH}/config.json >/dev/null 2>&1 &`;
      try {
          await exec(command1);
          console.log(`Xray is running`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
          console.error(`Xray running error: ${error.message}`);
      }
  }

  // 4. 运行 Cloudflared
  if (!fs.existsSync(botPath)) {
    console.error(`Error: Cloudflared binary not found at ${botPath}. Skipping Argo Tunnel.`);
  } else {
    let args;
    if (ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
    } else if (ARGO_AUTH.match(/TunnelSecret/)) {
      args = `tunnel --edge-ip-version auto --config ${FILE_PATH}/tunnel.yml run`;
    } else {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${FILE_PATH}/boot.log --loglevel info --url http://localhost:${ARGO_PORT}`;
    }

    try {
      await exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`);
      console.log(`Cloudflared is running`);
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 等待 5s 获取临时域名
    } catch (error) {
      console.error(`Error executing Cloudflared command: ${error.message}`);
    }
  }
}

// 获取固定隧道 json (保持不变)
function argoType() {
  if (!ARGO_AUTH || !ARGO_DOMAIN) {
    console.log("ARGO_DOMAIN or ARGO_AUTH variable is empty, use quick tunnels");
    return;
  }
  if (ARGO_AUTH.includes('TunnelSecret')) {
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), ARGO_AUTH);
    const tunnelYaml = `
tunnel: ${ARGO_AUTH.split('"')[11]}
credentials-file: ${path.join(FILE_PATH, 'tunnel.json')}
protocol: http2
ingress:
  - hostname: ${ARGO_DOMAIN}
    service: http://localhost:${ARGO_PORT}
    originRequest:
      noTLSVerify: true
  - service: http_status:404
`;
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), tunnelYaml);
  } else {
    console.log("ARGO_AUTH mismatch TunnelSecret, use token connect to tunnel");
  }
}

// 获取临时隧道 domain (保持不变)
async function extractDomains() {
  let argoDomain;

  if (ARGO_AUTH && ARGO_DOMAIN) {
    argoDomain = ARGO_DOMAIN;
    console.log('ARGO_DOMAIN:', argoDomain);
    await generateLinks(argoDomain);
  } else if (fs.existsSync(path.join(FILE_PATH, 'boot.log'))) {
    try {
      const fileContent = fs.readFileSync(path.join(FILE_PATH, 'boot.log'), 'utf-8');
      const lines = fileContent.split('\n');
      const argoDomains = [];
      lines.forEach((line) => {
        const domainMatch = line.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
        if (domainMatch) {
          const domain = domainMatch[1];
          argoDomains.push(domain);
        }
      });

      if (argoDomains.length > 0) {
        argoDomain = argoDomains[0];
        console.log('ArgoDomain:', argoDomain);
        await generateLinks(argoDomain);
      } else {
        // 如果提取失败，不再尝试重启进程，避免死循环。
        console.error('ArgoDomain not found in boot.log. Subscription links cannot be generated.');
      }
    } catch (error) {
      console.error('Error reading boot.log:', error.message);
    }
  } else {
      console.error('boot.log not found. Cloudflared might not be running or failed. Cannot extract domain.');
  }
}

// 获取 isp 信息 (保持不变)
async function getMetaInfo() {
  try {
    const response1 = await axios.get('https://ipapi.co/json/', { timeout: 3000 });
    if (response1.data && response1.data.country_code && response1.data.org) {
      return `${response1.data.country_code}_${response1.data.org}`;
    }
  } catch (error) {
    try {
      const response2 = await axios.get('http://ip-api.com/json/', { timeout: 3000 });
      if (response2.data && response2.data.status === 'success' && response2.data.countryCode && response2.data.org) {
        return `${response2.data.countryCode}_${response2.data.org}`;
      }
    } catch (error) {
    }
  }
  return 'Unknown';
}

// 生成 list 和 sub 信息 (保持不变)
async function generateLinks(argoDomain) {
  const ISP = await getMetaInfo();
  const nodeName = NAME ? `${NAME}-${ISP}` : ISP;
  return new Promise((resolve) => {
    setTimeout(() => {
      const VMESS = { v: '2', ps: `${nodeName}`, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'none', net: 'ws', type: 'none', host: argoDomain, path: '/vmess-argo?ed=2560', tls: 'tls', sni: argoDomain, alpn: '', fp: 'firefox'};
      const subTxt = `
vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Fvless-argo%3Fed%3D2560#${nodeName}-VLESS

vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}

trojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Ftrojan-argo%3Fed%3D2560#${nodeName}-TROJAN
      `;
      // 打印 base64 编码的订阅内容到控制台，以便调试
      const encodedSubContent = Buffer.from(subTxt.trim()).toString('base64');
      console.log('--- Base64 Subscription Content ---');
      console.log(encodedSubContent);
      console.log('-----------------------------------');
      fs.writeFileSync(subPath, encodedSubContent);
      console.log(`${FILE_PATH}/sub.txt saved successfully`);

      // 写入 list.txt (用于 uploadNodes)
      fs.writeFileSync(listPath, subTxt.trim());

      uploadNodes();

      // 将内容进行 base64 编码并写入 SUB_PATH 路由
      app.get(`/${SUB_PATH}`, (req, res) => {
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(encodedSubContent);
      });
      resolve(subTxt);
    }, 2000);
  });
}

// 自动上传节点或订阅 (保持不变)
async function uploadNodes() {
  if (UPLOAD_URL && PROJECT_URL) {
    const subscriptionUrl = `${PROJECT_URL}/${SUB_PATH}`;
    const jsonData = { subscription: [subscriptionUrl] };
    try {
      const response = await axios.post(`${UPLOAD_URL}/api/add-subscriptions`, jsonData, {
        headers: { 'Content-Type': 'application/json' }
      });
      if (response && response.status === 200) {
        console.log('Subscription uploaded successfully');
      }
    } catch (error) {
      if (error.response && error.response.status !== 400) { // 忽略 400 (已存在)
        console.error('Subscription upload failed:', error.message);
      }
    }
  } else if (UPLOAD_URL) {
    if (!fs.existsSync(listPath)) return;
    const content = fs.readFileSync(listPath, 'utf-8');
    const nodes = content.split('\n').filter(line => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line));
    if (nodes.length === 0) return;
    const jsonData = JSON.stringify({ nodes });
    try {
      const response = await axios.post(`${UPLOAD_URL}/api/add-nodes`, jsonData, {
        headers: { 'Content-Type': 'application/json' }
      });
      if (response && response.status === 200) {
        console.log('Nodes uploaded successfully');
      }
    } catch (error) {
      console.error('Nodes upload failed:', error.message);
    }
  } else {
    return;
  }
}

// 自动访问项目URL (保持不变)
async function AddVisitTask() {
  if (!AUTO_ACCESS || !PROJECT_URL) {
    console.log("Skipping adding automatic access task");
    return;
  }
  try {
    const response = await axios.post('https://oooo.serv00.net/add-url', {
      url: PROJECT_URL
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log(`Automatic access task added successfully`);
    return response;
  } catch (error) {
    console.error(`Add automatic access task failed: ${error.message}`);
    return null;
  }
}

// 移除 cleanFiles 函数 (容器化后不再需要)

// 主运行逻辑
async function startserver() {
  try {
    // 1. 设置固定隧道配置 (如果使用)
    argoType();

    // 2. 清理和生成配置
    deleteNodes();
    cleanupOldFiles();
    await generateConfig();

    // 3. 运行核心依赖 (假设文件已存在)
    await runDependencies();

    // 4. 提取域名并生成链接
    await extractDomains();

    // 5. 添加保活任务
    await AddVisitTask();

    console.log('Setup complete. App is fully operational.');

  } catch (error) {
    console.error('Fatal error during startup:', error);
  }
}

startserver().catch(error => {
  console.error('Unhandled error in startserver:', error);
});

app.listen(PORT, () => console.log(`http server is running on port:${PORT}!`));
