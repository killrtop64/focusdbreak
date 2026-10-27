import { checksum, decodeDocument, encodeDocument, StateError } from './state-codec.js';

export function createStateJournal(adapter) {
  let tail = Promise.resolve();
  let loaded = false, locked = true, knownRaw = null, sequence = 0;
  let lastFailure = null;
  const enqueue = operation => {
    const result = tail.catch(()=>{}).then(operation);
    tail = result;
    result.then(()=>{ lastFailure = null; },error=>{ lastFailure = error; });
    return result;
  };
  async function optional(key) {
    const raw = await adapter.read(key);
    return raw === undefined ? null : raw;
  }
  function parse(raw) {
    if (raw === null) return null;
    return decodeDocument(raw);
  }
  async function loadNow({ ignorePending = false } = {}) {
    loaded = true; locked = true;
    let primary, backup, pending, draft;
    try {
      [primary,backup,pending,draft] = await Promise.all(['primary','backup','pending','draft'].map(optional));
    } catch (error) {
      return { kind:'recovery', reason:'READ_ERROR', rawOriginal:null, backupAvailable:false };
    }
    knownRaw = primary;
    let current, candidate, reason;
    try { current = parse(primary); } catch (error) { reason = error.code || 'INVALID_DATA'; }
    try { candidate = parse(backup); } catch {}
    let pendingValue, draftValue;
    try { pendingValue = parse(pending); } catch {}
    try { draftValue = parse(draft); } catch {}
    if (!ignorePending && draftValue && (!current || checksum(JSON.stringify(draftValue.state)) !== checksum(JSON.stringify(current.state)))) {
      return { kind:'recovery', reason:reason || 'UNSAVED_CHANGES', rawOriginal:primary, backupAvailable:true, candidate:'draft' };
    }
    if (!ignorePending && pendingValue && (!current || checksum(JSON.stringify(pendingValue.state)) !== checksum(JSON.stringify(current.state)))) {
      return { kind:'recovery', reason:reason || 'UNSAVED_CHANGES', rawOriginal:primary, backupAvailable:true, candidate:'pending' };
    }
    if (!current && (primary !== null || backup !== null || pending !== null || draft !== null)) {
      return { kind:'recovery', reason:reason || 'MISSING_PRIMARY', rawOriginal:primary, backupAvailable:Boolean(candidate), candidate:'backup' };
    }
    locked = false; sequence = current?.sequence || 0;
    return current ? { kind:'ready', state:current.state, legacy:current.legacy } : { kind:'empty', state:null };
  }
  async function verifyUnchanged() {
    const actual = await optional('primary');
    if (actual !== knownRaw) {
      locked = true;
      throw new StateError('CONFLICT');
    }
    return actual;
  }
  async function preserve(key, raw, reason) {
    if (raw !== null) await adapter.archive(key,raw,reason);
  }
  async function commit(state, { replace = false, reason = 'normal' } = {}) {
    if (!loaded) throw new StateError('NOT_LOADED');
    if (locked && !replace) throw new StateError('READ_ONLY');
    // Validate and encode before touching any previous snapshot.
    const next = encodeDocument(state, sequence + 1);
    const previous = await verifyUnchanged();
    let replacedDraft = null;
    if (replace) {
      await preserve('primary',previous,reason);
      const backup = await optional('backup');
      if (backup !== null) await preserve('backup',backup,reason);
      for (const key of ['draft','pending']) {
        const raw = await optional(key);
        await preserve(key,raw,reason);
        if (key === 'draft') replacedDraft = raw;
      }
    } else if (previous !== null && decodeDocument(previous).legacy) {
      await preserve('primary',previous,'migration');
    }
    await adapter.write('pending',next);
    if (previous !== null) {
      let valid = false;
      try { decodeDocument(previous); valid = true; } catch {}
      if (valid) await adapter.write('backup',previous);
    }
    await adapter.write('primary',next);
    knownRaw = next; sequence++; locked = false;
    // A leftover pending snapshot equal to primary is safe and ignored on load.
    try {
      if (await optional('pending') === next) await adapter.remove('pending');
      const draft = await optional('draft');
      if (draft !== null && ((replace && draft === replacedDraft) || checksum(JSON.stringify(decodeDocument(draft).state)) === checksum(JSON.stringify(state)))) await adapter.remove('draft');
    } catch {}
    return { kind:'ready', state, legacy:false };
  }
  return {
    load:options => enqueue(() => loadNow(options)),
    save:raw => enqueue(() => commit(decodeDocument(raw).state)),
    replace:(raw,reason = 'import') => enqueue(() => commit(decodeDocument(raw).state,{ replace:true,reason })),
    recover:() => enqueue(async () => {
      const report = await loadNow();
      if (report.kind !== 'recovery' || !report.backupAvailable) throw new StateError('NO_BACKUP');
      const key = report.candidate || 'backup';
      const candidateRaw = await optional(key);
      const candidate = decodeDocument(candidateRaw);
      await preserve('primary',knownRaw,'recovery');
      for (const item of ['draft','pending']) {
        const raw = await optional(item);
        if (raw !== null && raw !== candidateRaw) await preserve(item,raw,'recovery');
      }
      await adapter.write('primary',candidateRaw);
      knownRaw = candidateRaw; sequence = candidate.sequence; locked = false;
      for (const item of ['draft','pending']) {
        try { await adapter.remove(item); } catch {}
      }
      return { kind:'ready', state:candidate.state, legacy:candidate.legacy };
    }),
    flush:async () => { await tail; if (lastFailure) throw lastFailure; },
    get locked() { return locked; },
  };
}
