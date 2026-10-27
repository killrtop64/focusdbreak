import os from 'node:os';
// Some restricted Windows sessions cannot resolve account metadata. The CLI
// only needs a shell; retain normal behavior whenever the OS provides it.
try { os.userInfo(); } catch (error) {
  if (process.platform !== 'win32') throw error;
  os.userInfo = () => ({
    username:process.env.USERNAME || 'developer',
    homedir:process.env.USERPROFILE || process.cwd(),
    shell:process.env.ComSpec || 'cmd.exe', uid:-1, gid:-1,
  });
}
await import('../node_modules/@capacitor/cli/bin/capacitor');
