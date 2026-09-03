import { cp, lstat, mkdir, readlink, rm, symlink, unlink } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

export async function linkOrCopy(source, target, isDir = false, useSymlink = false) {
  const absSource = resolve(source);
  const absTarget = resolve(target);

  // Safeguard: Never delete or overwrite the source file/directory onto itself
  if (absSource === absTarget) {
    return "skipped (self)";
  }

  await mkdir(dirname(target), { recursive: true });

  let isExistingSymlink = false;
  try {
    const stat = await lstat(target);
    isExistingSymlink = stat.isSymbolicLink();
    if (useSymlink && isExistingSymlink) {
      try {
        const currentLink = await readlink(target);
        if (resolve(dirname(target), currentLink) === absSource) {
          return "symlinked (up-to-date)";
        }
      } catch (_) {}
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  // Remove existing destination cleanly
  try {
    if (isExistingSymlink) {
      try {
        await unlink(target);
      } catch (_) {
        await rm(target, { recursive: true, force: true });
      }
    } else {
      await rm(target, { recursive: true, force: true });
    }
  } catch (_) {}

  if (useSymlink) {
    try {
      const isWindows = process.platform === "win32";
      const symlinkType = isDir ? (isWindows ? "junction" : "dir") : "file";
      let linkSource = absSource;

      if (!isWindows && isDir) {
        // Use relative symlinks where practical for portability
        linkSource = relative(dirname(absTarget), absSource);
      }

      await symlink(linkSource, target, symlinkType);
      return "symlinked";
    } catch {
      // Fallback to copy if symlinking fails
    }
  }

  await cp(source, target, { recursive: isDir, force: true, dereference: true });
  return "copied";
}
