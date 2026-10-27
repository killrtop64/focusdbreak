const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

async function createFileStateStore(directory) {
  const { createStateJournal } = await import('../shared/state-journal.js');
  const names = {
    primary:'focus-break.json',
    backup:'focus-break.last-good.json',
    pending:'focus-break.pending.json',
    draft:'focus-break.draft.json',
  };
  const filename = key => {
    if (!Object.hasOwn(names,key)) throw new Error('Invalid storage key');
    return path.join(directory,names[key]);
  };
  async function atomicWrite(target, raw) {
    await fs.mkdir(path.dirname(target),{ recursive:true });
    const temporary = target + '.' + randomUUID() + '.tmp';
    let handle;
    try {
      handle = await fs.open(temporary,'wx',0o600);
      await handle.writeFile(raw,'utf8');
      await handle.sync();
      await handle.close(); handle = null;
      await fs.rename(temporary,target);
    } finally {
      if (handle) await handle.close().catch(()=>{});
      await fs.unlink(temporary).catch(()=>{});
    }
  }
  return createStateJournal({
    async read(key) {
      try { return await fs.readFile(filename(key),'utf8'); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    write:(key,raw) => atomicWrite(filename(key),raw),
    remove:key => fs.unlink(filename(key)).catch(error=>{ if (error.code !== 'ENOENT') throw error; }),
    async archive(key,raw,reason) {
      const backups = path.join(directory,'backups');
      await fs.mkdir(backups,{ recursive:true });
      const safeReason = ['import','reset','recovery','migration'].includes(reason) ? reason : 'checkpoint';
      const target = path.join(backups,safeReason + '-' + Date.now() + '-' + randomUUID() + '.json');
      // Copy exact bytes, including an invalid UTF-8 original, before recovery.
      await fs.copyFile(filename(key),target,require('node:fs').constants.COPYFILE_EXCL);
    },
  });
}
module.exports = { createFileStateStore };
