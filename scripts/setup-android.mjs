import { mkdir, writeFile, readdir, access, readFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';

if (process.platform !== 'win32') throw new Error('This portable setup helper is for Windows; use Android Studio or setup-android in CI on other systems.');
const root = path.resolve('tools');
await mkdir(root, { recursive:true });
const exists = file => access(file).then(() => true, () => false);
async function download(url, file, sha256) {
  if (await exists(file)) return;
  console.log('Downloading ' + path.basename(file));
  const response = await fetch(url);
  if (!response.ok) throw new Error('Download failed: ' + response.status);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
  if (sha256) {
    const hash = createHash('sha256').update(await readFile(file)).digest('hex');
    if (hash !== sha256) throw new Error('Checksum did not match for ' + file);
  }
}
function run(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide:true, stdio:['pipe','inherit','inherit'], ...options });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(file + ' exited ' + code)));
    child.stdin.end('y\n'.repeat(100));
  });
}
const ps = value => "'" + value.replaceAll("'", "''") + "'";
async function unzip(file, destination) {
  await mkdir(destination, { recursive:true });
  await run('powershell.exe', ['-NoProfile','-NonInteractive','-Command',
    'Expand-Archive -LiteralPath ' + ps(file) + ' -DestinationPath ' + ps(destination) + ' -Force']);
}
const jdkRoot = path.join(root, 'jdk');
let folders = await readdir(jdkRoot).catch(() => []);
if (!folders.some(name => name.startsWith('jdk-'))) {
  const response = await fetch('https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows');
  if (!response.ok) throw new Error('JDK metadata request failed: ' + response.status);
  const metadata = await response.json();
  const binary = metadata[0].binary.package;
  const archive = path.join(root, 'jdk21.zip');
  await download(binary.link, archive, binary.checksum);
  await unzip(archive, jdkRoot);
  folders = await readdir(jdkRoot);
}
const javaHome = path.join(jdkRoot, folders.find(name => name.startsWith('jdk-')));
const sdk = path.join(root, 'android-sdk');
const sdkManager = path.join(sdk, 'cmdline-tools/latest/bin/sdkmanager.bat');
if (!await exists(sdkManager)) {
  const archive = path.join(root, 'android-command-tools.zip');
  await download('https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip', archive,
    '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a');
  await unzip(archive, path.join(sdk, 'cmdline-tools'));
  const { rename } = await import('node:fs/promises');
  await rename(path.join(sdk, 'cmdline-tools/cmdline-tools'), path.join(sdk, 'cmdline-tools/latest'));
}
const env = { ...process.env, JAVA_HOME:javaHome, ANDROID_HOME:sdk, ANDROID_SDK_ROOT:sdk };
const escapedManager = '"' + sdkManager + '"';
await run('cmd.exe', ['/d','/s','/c',escapedManager + ' --sdk_root="' + sdk + '" --licenses'], { env });
await run('cmd.exe', ['/d','/s','/c',escapedManager + ' --sdk_root="' + sdk + '" "platform-tools" "platforms;android-36" "build-tools;36.0.0"'], { env });
await writeFile(path.join(root, 'android-env.json'), JSON.stringify({ javaHome, sdk }, null, 2));
await writeFile('android/local.properties', 'sdk.dir=' + sdk.replaceAll('\\','/') + '\n');
console.log('Portable JDK 21 and Android SDK are ready inside tools/.');
