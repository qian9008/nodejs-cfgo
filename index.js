// 注意：此文件应以 .mjs 结尾，或在 package.json 中设置 "type": "module"

// 1. 导入 (import) 模块，替换 require
import express from "express";
import axios from "axios";
import os from 'os';
import fs from "fs";
import path from "path";
// import { promisify } from 'util'; // 如果只需要 exec，可以单独导入
import { exec } from 'child_process';
import { execSync } from 'child_process'; // execSync 保持不变，但通常用 import
import { promisify } from 'util';

// 再次 promisify exec，因为我们现在使用 import from 'child_process'
const execAsync = promisify(exec);


const app = express();

// 环境变量和常量保持不变
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
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiMTZjZjVkMzQwODQ2YmU1MDNlYWQzNjY2NTI4MDczNTMiLCJ0IjoiZGI1NTBlMDAtZTE2Yy00OWQ0LTllM2UtYjNjYTM2MzkwMjY3IiwicyI6Ik5UZzFZMll6T0RBdE5XUmhNUzAwWldWa0xUazJNV1l0TWpKaVpESXlabUl6WVdRdyJ9';
const ARGO_PORT = process.env.ARGO_PORT || 8001;
const CFIP = process.env.CFIP || 'cdns.doon.eu.org';
const CFPORT = process.env.CFPORT || 443;
const NAME = process.env.NAME || '';

// *** 顶层 await 的第一处应用 ***
// 创建运行文件夹 (使用 fs/promises 的同步版本或顶层 await)
if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH);
  console.log(`${FILE_PATH} is created`);
} else {
  console.log(`${FILE_PATH} already exists`);
}

// ... (generateRandomName, 全局常量定义等函数和变量保持不变)
function generateRandomName() {
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// 全局常量
const npmName = generateRandomName();
const webName = generateRandomName();
const botName = generateRandomName();
const phpName = generateRandomName();
let npmPath = path.join(FILE_PATH, npmName);
let phpPath = path.join(FILE_PATH, phpName);
let webPath = path.join(FILE_PATH, webName);
let botPath = path.join(FILE_PATH, botName);
let subPath = path.join(FILE_PATH, 'sub.txt');
let listPath = path.join(FILE_PATH, 'list.txt');
let bootLogPath = path.join(FILE_PATH, 'boot.log');
let configPath = path.join(FILE_PATH, 'config.json');
// ... (deleteNodes, cleanupOldFiles, app.get, generateConfig, getSystemArchitecture, downloadFile, getFilesForArchitecture, argoType, killBotProcess, extractDomains, getMetaInfo, uploadNodes, killBotProcess 保持不变)

// ... (由于篇幅限制，中间的大部分函数保持不变，但请注意，如果您在这些函数内部使用了 promisify(require('child_process').exec)，您需要使用上面定义的 `execAsync` 变量来代替 `exec`)

// ----------------------------------------------------------------------------------------------------
// ⚠️ 重点修改区域：downloadFilesAndRun 函数内部，将原有的 `exec` 替换为 `execAsync`
// ----------------------------------------------------------------------------------------------------

// 下载并运行依赖文件
async function downloadFilesAndRun() {

  const architecture = getSystemArchitecture();
  const filesToDownload = getFilesForArchitecture(architecture);

  if (filesToDownload.length === 0) {
    console.log(`Can't find a file for the current architecture`);
    return;
  }

  const downloadPromises = filesToDownload.map(fileInfo => {
    return new Promise((resolve, reject) => {
      downloadFile(fileInfo.fileName, fileInfo.fileUrl, (err, filePath) => {
        if (err) {
          reject(err);
        } else {
          resolve(filePath);
        }
      });
    });
  });

  try {
    await Promise.all(downloadPromises);
  } catch (err) {
    console.error('Error downloading files:', err);
    return;
  }
  // 授权和运行
  function authorizeFiles(filePaths) {
    const newPermissions = 0o775;
    filePaths.forEach(absoluteFilePath => {
      if (fs.existsSync(absoluteFilePath)) {
        fs.chmod(absoluteFilePath, newPermissions, (err) => {
          if (err) {
            console.error(`Empowerment failed for ${absoluteFilePath}: ${err}`);
          } else {
            console.log(`Empowerment success for ${absoluteFilePath}: ${newPermissions.toString(8)}`);
          }
        });
      }
    });
  }
  const filesToAuthorize = NEZHA_PORT ? [npmPath, webPath, botPath] : [phpPath, webPath, botPath];
  authorizeFiles(filesToAuthorize);


  //运行xr-ay
  const command1 = `nohup ${webPath} -c ${FILE_PATH}/config.json >/dev/null 2>&1 &`;
  try {
    // 替换为 execAsync
    await execAsync(command1);
    console.log(`${webName} is running`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    console.error(`web running error: ${error}`);
  }

  // 运行cloud-fared
  if (fs.existsSync(botPath)) {
    let args;

    if (ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
    } else if (ARGO_AUTH.match(/TunnelSecret/)) {
      args = `tunnel --edge-ip-version auto --config ${FILE_PATH}/tunnel.yml run`;
    } else {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${FILE_PATH}/boot.log --loglevel info --url http://localhost:${ARGO_PORT}`;
    }

    try {
      // 替换为 execAsync
      await execAsync(`nohup ${botPath} ${args} >/dev/null 2>&1 &`);
      console.log(`${botName} is running`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Error executing command: ${error}`);
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
}

// ... (cleanFiles, AddVisitTask 等函数保持不变)

// ----------------------------------------------------------------------------------------------------
// 🚀 核心修改区域：移除 IIFE，并直接在顶层执行 startserver()
// ----------------------------------------------------------------------------------------------------

// 主运行逻辑
async function startserver() {
  try {
    argoType();
    deleteNodes();
    cleanupOldFiles();
    await generateConfig();
    await downloadFilesAndRun();
    await extractDomains();
    await AddVisitTask();
  } catch (error) {
    console.error('Error in startserver:', error);
  }
}

// 2. 顶层 await - 直接调用 async 函数
await startserver().catch(error => {
  console.error('Unhandled error in startserver:', error);
});

// 监听服务
app.listen(PORT, () => console.log(`http server is running on port:${PORT}!`));
