import multer from 'multer';

import { config } from '../config.js';

// Files stay in memory: they're streamed to storage and the matcher, never written to disk.
// File type is checked per file later (by content), so one bad file doesn't reject the batch.
const receiveFiles = multer({
  storage: multer.memoryStorage(),
  // Multer decodes filenames as latin1 by default, which garbles names like "Résumé.pdf".
  defParamCharset: 'utf8',
  limits: {
    files: config.upload.maxFiles,
    fileSize: config.upload.maxFileBytes,
    fields: 0, // only files are expected
  },
}).array('files', config.upload.maxFiles);

/** Receive resume files, keeping client-supplied names to a sane length. */
export function uploadResumes(req, res, next) {
  receiveFiles(req, res, (err) => {
    if (err) return next(err);
    for (const file of req.files ?? []) file.originalname = file.originalname.slice(-255);
    next();
  });
}
