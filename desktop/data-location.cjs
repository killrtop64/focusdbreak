const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const PORTABLE_DATA_FOLDER = 'Focus Break Data';

class DataLocationError extends Error {
  constructor(code, directory, cause) {
    super(code,{ cause });
    this.name = 'DataLocationError'; this.code = code; this.directory = directory;
  }
}
function resolveDataLocation({ env = process.env, platform = process.platform, isPackaged = false, getDefaultDirectory }) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  function absolute(value, code) {
    if (typeof value !== 'string' || value.includes('\0') || !paths.isAbsolute(value) ||
      (platform === 'win32' && !/^(?:[a-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+)/i.test(paths.parse(value).root))) {
      throw new DataLocationError(code,typeof value === 'string' ? value : '');
    }
    return paths.normalize(value);
  }
  let mode, directory;
  if (env.FOCUS_BREAK_DATA_DIR !== undefined && env.FOCUS_BREAK_DATA_DIR !== '') {
    mode = 'custom'; directory = absolute(env.FOCUS_BREAK_DATA_DIR,'INVALID_DATA_PATH');
  } else if (platform === 'win32' && isPackaged && env.PORTABLE_EXECUTABLE_DIR !== undefined && env.PORTABLE_EXECUTABLE_DIR !== '') {
    mode = 'portable'; directory = paths.join(absolute(env.PORTABLE_EXECUTABLE_DIR,'INVALID_PORTABLE_PATH'),PORTABLE_DATA_FOLDER);
  } else {
    mode = 'profile'; directory = absolute(getDefaultDirectory(),'INVALID_DATA_PATH');
  }
  return { mode,directory,canAutoStart:platform === 'win32' && isPackaged && mode === 'profile' };
}
function prepareDataDirectory(directory, io = fs) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new DataLocationError('INVALID_DATA_PATH',directory);
  const probe = path.join(directory,'.focus-break-probe-' + randomUUID() + '.tmp');
  const renamed = probe + '.renamed';
  let descriptor, created = false, didRename = false;
  try {
    io.mkdirSync(directory,{ recursive:true });
    descriptor = io.openSync(probe,'wx',0o600); created = true;
    io.writeFileSync(descriptor,'Focus Break storage access check','utf8');
    io.fsyncSync(descriptor);
    io.closeSync(descriptor); descriptor = undefined;
    io.renameSync(probe,renamed); didRename = true;
    io.unlinkSync(renamed); didRename = false; created = false;
    for (const name of ['Chromium','logs','Crashpad']) io.mkdirSync(path.join(directory,name),{ recursive:true });
  } catch (error) {
    throw new DataLocationError('DATA_DIRECTORY_UNAVAILABLE',directory,error);
  } finally {
    if (descriptor !== undefined) try { io.closeSync(descriptor); } catch {}
    // Only our own exclusive probe files are eligible for cleanup.
    if (didRename) { try { io.unlinkSync(renamed); } catch {} }
    else if (created) { try { io.unlinkSync(probe); } catch {} }
  }
}
function configureDataLocation(app, options = {}) {
  const location = resolveDataLocation({
    ...options,isPackaged:app.isPackaged,getDefaultDirectory:()=>app.getPath('userData'),
  });
  // Preserve the existing installed/development profile and its cache layout.
  if (location.mode === 'profile') return location;
  prepareDataDirectory(location.directory,options.io);
  try {
    app.setPath('userData',location.directory);
    app.setPath('sessionData',path.join(location.directory,'Chromium'));
    app.setAppLogsPath(path.join(location.directory,'logs'));
    app.setPath('crashDumps',path.join(location.directory,'Crashpad'));
  } catch (error) { throw new DataLocationError('DATA_DIRECTORY_UNAVAILABLE',location.directory,error); }
  return location;
}
function dataLocationErrorMessage(error) {
  return [
    'Не удалось открыть выбранную папку данных. Приложение не переключалось на другой каталог.',
    'Для Portable перенесите EXE вместе с папкой «' + PORTABLE_DATA_FOLDER + '» в доступное для записи место и повторите запуск.',
    '',
    'The selected data folder could not be opened. No alternate storage was selected.',
    'For Portable, move the EXE together with its "' + PORTABLE_DATA_FOLDER + '" folder to a writable location and restart.',
    '',error.directory || '',error.cause?.code || error.code || 'STARTUP_ERROR',
  ].join('\n');
}
module.exports = { PORTABLE_DATA_FOLDER,DataLocationError,resolveDataLocation,prepareDataDirectory,configureDataLocation,dataLocationErrorMessage };
