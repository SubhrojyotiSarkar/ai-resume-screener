import { useState } from 'react';
import { useDropzone } from 'react-dropzone';

import { getErrorMessage } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { useUploadResumes } from '../hooks/useCandidates.js';
import { Button } from './Button.jsx';
import { ScoreBadge } from './ScoreBadge.jsx';
import { Spinner } from './Spinner.jsx';

const MAX_FILES = 20;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

const REJECTION_MESSAGES = {
  'file-invalid-type': 'Only PDF and DOCX files are supported',
  'file-too-large': 'Larger than the 5 MB limit',
  'too-many-files': `Too many files: at most ${MAX_FILES} per upload`,
};

let nextId = 0;
const makeItem = (file, status, error = null) => ({ id: nextId++, file, status, error, progress: 0, result: null });

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Drag-and-drop resume upload with per-file progress and results.
 * All queued files go up in one request (the server scores the batch together);
 * each file's progress is derived from how many bytes of the request have been sent,
 * since multipart bodies send files in order.
 */
export function UploadDropzone({ jobId }) {
  const toast = useToast();
  const upload = useUploadResumes(jobId);
  const [items, setItems] = useState([]);

  const queued = items.filter((i) => i.status === 'queued');
  const busy = upload.isPending;

  function onDrop(accepted, rejections) {
    const room = Math.max(0, MAX_FILES - queued.length);
    setItems((current) => [
      // Drop finished rows when a new batch starts.
      ...current.filter((i) => i.status === 'queued' || i.status === 'rejected'),
      ...accepted.slice(0, room).map((file) => makeItem(file, 'queued')),
      ...accepted.slice(room).map((file) => makeItem(file, 'rejected', REJECTION_MESSAGES['too-many-files'])),
      ...rejections.map(({ file, errors }) =>
        makeItem(file, 'rejected', REJECTION_MESSAGES[errors[0]?.code] ?? errors[0]?.message),
      ),
    ]);
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxSize: MAX_BYTES,
    disabled: busy,
  });

  function update(ids, changes) {
    setItems((current) => current.map((i) => (ids.has(i.id) ? { ...i, ...changes(i) } : i)));
  }

  async function startUpload() {
    const batch = queued;
    const ids = new Set(batch.map((i) => i.id));
    const sizes = batch.map((i) => i.file.size);
    const totalSize = sizes.reduce((a, b) => a + b, 0);
    const offsets = sizes.map((_, i) => sizes.slice(0, i).reduce((a, b) => a + b, 0));

    update(ids, () => ({ status: 'uploading', progress: 0 }));

    function onProgress(loaded, total) {
      // Scale out multipart overhead so byte offsets line up with file sizes.
      const sent = (loaded / total) * totalSize;
      setItems((current) =>
        current.map((item) => {
          const index = batch.findIndex((b) => b.id === item.id);
          if (index === -1) return item;
          const progress = Math.min(1, Math.max(0, (sent - offsets[index]) / sizes[index]));
          return { ...item, progress, status: progress >= 1 ? 'processing' : 'uploading' };
        }),
      );
    }

    try {
      const response = await upload.mutateAsync({ files: batch.map((i) => i.file), onProgress });
      // Results come back in the order the files were sent.
      setItems((current) =>
        current.map((item) => {
          const index = batch.findIndex((b) => b.id === item.id);
          if (index === -1) return item;
          const result = response.results[index];
          return result.ok
            ? { ...item, status: 'done', progress: 1, result }
            : { ...item, status: 'failed', error: result.error };
        }),
      );

      const { succeeded, failed } = response.summary;
      if (!response.scoring.ok) toast.error(response.scoring.error);
      else if (failed === 0) toast.success(`${succeeded} resume${succeeded === 1 ? '' : 's'} uploaded and scored`);
      else if (succeeded === 0) toast.error('None of the files could be processed');
      else toast.info(`${succeeded} uploaded, ${failed} failed. See the list for details.`);
    } catch (error) {
      const message = getErrorMessage(error, 'Upload failed');
      update(ids, () => ({ status: 'failed', error: message }));
      toast.error(message);
    }
  }

  return (
    <section className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Upload resumes</h2>
          <p className="text-sm text-slate-500">PDF or DOCX, up to 5 MB each, {MAX_FILES} at a time.</p>
        </div>
        {items.length > 0 && !busy && (
          <Button variant="ghost" size="sm" onClick={() => setItems([])}>
            Clear list
          </Button>
        )}
      </div>

      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
          isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
        } ${busy ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <input {...getInputProps()} aria-label="Choose resume files" />
        <div className="mb-2 text-2xl" aria-hidden="true">
          ⬆
        </div>
        <p className="text-sm font-medium text-slate-700">
          {isDragActive ? 'Drop the files here' : 'Drag and drop resumes here, or click to browse'}
        </p>
      </div>

      {items.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {items.map((item) => (
            <UploadRow key={item.id} item={item} onRemove={() => setItems((c) => c.filter((i) => i.id !== item.id))} />
          ))}
        </ul>
      )}

      {queued.length > 0 && (
        <div className="mt-4 flex justify-end">
          <Button onClick={startUpload} loading={busy}>
            Upload and score {queued.length} file{queued.length === 1 ? '' : 's'}
          </Button>
        </div>
      )}
    </section>
  );
}

function UploadRow({ item, onRemove }) {
  const { file, status, progress, error, result } = item;

  return (
    <li className="flex items-center gap-3 px-3 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-slate-800">{file.name}</span>
          <span className="shrink-0 text-xs text-slate-400">{formatSize(file.size)}</span>
        </div>
        {status === 'uploading' && (
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        {(status === 'failed' || status === 'rejected') && <p className="mt-0.5 text-xs text-red-600">{error}</p>}
        {status === 'done' && <p className="mt-0.5 text-xs text-slate-500">Parsed as {result.candidateName}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-2 text-xs">
        {status === 'queued' && (
          <>
            <span className="text-slate-500">Ready</span>
            <button type="button" onClick={onRemove} className="text-slate-400 hover:text-slate-700" aria-label={`Remove ${file.name}`}>
              ×
            </button>
          </>
        )}
        {status === 'uploading' && <span className="tabular-nums text-slate-500">{Math.round(progress * 100)}%</span>}
        {status === 'processing' && (
          <span className="flex items-center gap-1.5 text-indigo-600">
            <Spinner className="h-3.5 w-3.5" /> Processing
          </span>
        )}
        {status === 'done' && <ScoreBadge score={result.matchScore} />}
        {status === 'failed' && <span className="font-medium text-red-600">Failed</span>}
        {status === 'rejected' && (
          <>
            <span className="font-medium text-red-600">Not uploaded</span>
            <button type="button" onClick={onRemove} className="text-slate-400 hover:text-slate-700" aria-label={`Remove ${file.name}`}>
              ×
            </button>
          </>
        )}
      </div>
    </li>
  );
}
