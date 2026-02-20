"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, X, Loader2, ImageIcon } from "lucide-react";

interface Props {
  /** Current logo URL (e.g. /api/events/{id}/logo) */
  value: string | null;
  /** Event ID — if set, upload goes directly to the API */
  eventId?: string;
  /** Called when the logo URL changes (after upload or delete) */
  onChange: (url: string | null) => void;
  /** Called when a file is ready but not yet uploaded (for new events without an id) */
  onFileReady?: (file: File | null) => void;
}

const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";
const MAX_SIZE = 2 * 1024 * 1024;

export default function ImageUpload({
  value,
  eventId,
  onChange,
  onFileReady,
}: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value && !preview) {
      setPreview(value);
    }
  }, [value, preview]);

  const displayUrl = preview || value;

  const validateFile = useCallback((file: File): string | null => {
    if (!file.type.match(/^image\/(png|jpeg|webp|svg\+xml)$/)) {
      return "Format non supporté. Utilisez PNG, JPEG, WebP ou SVG.";
    }
    if (file.size > MAX_SIZE) {
      return "Fichier trop volumineux (max 2 Mo).";
    }
    return null;
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setError("");

      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      const localUrl = URL.createObjectURL(file);
      setPreview(localUrl);

      if (eventId) {
        setUploading(true);
        try {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch(`/api/events/${eventId}/logo`, {
            method: "POST",
            body: fd,
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Erreur lors de l'upload");
          }
          const { url } = await res.json();
          onChange(url);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Erreur upload");
          setPreview(value);
        } finally {
          setUploading(false);
        }
      } else {
        onFileReady?.(file);
      }
    },
    [eventId, onChange, onFileReady, validateFile, value]
  );

  const handleRemove = useCallback(async () => {
    setError("");
    if (eventId && value) {
      setUploading(true);
      try {
        await fetch(`/api/events/${eventId}/logo`, { method: "DELETE" });
      } catch {
        // ignore
      } finally {
        setUploading(false);
      }
    }
    setPreview(null);
    onChange(null);
    onFileReady?.(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [eventId, value, onChange, onFileReady]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="space-y-2">
      {displayUrl ? (
        <div className="relative inline-block group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt="Logo"
            className="h-20 w-auto max-w-[200px] rounded-lg border border-gray-200 object-contain bg-white p-1 shadow-sm"
          />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-lg">
              <Loader2 size={20} className="animate-spin text-gray-500" />
            </div>
          )}
          {!uploading && (
            <button
              type="button"
              onClick={handleRemove}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
            dragOver
              ? "border-[#3DAAA4] bg-[#3DAAA4]/5"
              : "border-gray-300 hover:border-gray-400 bg-gray-50/50"
          }`}
        >
          {uploading ? (
            <Loader2 size={24} className="animate-spin text-gray-400" />
          ) : (
            <>
              <div className="flex items-center gap-2 text-gray-400">
                <ImageIcon size={20} />
                <Upload size={18} />
              </div>
              <p className="text-xs text-gray-500 text-center">
                Glissez une image ici ou{" "}
                <span className="text-[#3DAAA4] font-medium">
                  cliquez pour choisir
                </span>
              </p>
              <p className="text-[10px] text-gray-400">
                PNG, JPEG, WebP ou SVG — max 2 Mo
              </p>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={onInputChange}
        className="hidden"
      />

      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">
          {error}
        </p>
      )}
    </div>
  );
}
