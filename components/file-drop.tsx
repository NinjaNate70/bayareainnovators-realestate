"use client";
import { useId, useRef, useState, type ReactNode } from "react";
import { FileUp } from "lucide-react";

// The one file picker for the whole app. The native "Choose files / No file
// chosen" input stays in the page for keyboard and screen-reader users but is
// hidden visually; the whole zone is the click and drop target.
export function FileDrop({
  label,
  accept,
  multiple = false,
  capture,
  prompt = "Drop files here or browse",
  description,
  hint,
  note,
  disabled = false,
  onFiles,
  children,
}: {
  label: string;
  accept: string;
  multiple?: boolean;
  capture?: "environment" | "user";
  prompt?: string;
  // An optional line under the label saying what belongs here.
  description?: string;
  // What may be chosen, such as "JPG or PNG · up to 10MB each".
  hint: string;
  // An optional line under the zone, such as where the files are stored.
  note?: string;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  children?: ReactNode;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length && !disabled) onFiles(multiple ? files : files.slice(0, 1));
  };
  return (
    <div className="upload-group">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {description && (
        <p id={`${id}-description`} className="small muted">
          {description}
        </p>
      )}
      <div
        className="upload-zone"
        data-over={over || undefined}
        data-disabled={disabled || undefined}
        onClick={(e) => {
          if (e.target !== input.current && !disabled) input.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
      >
        <FileUp size={27} aria-hidden="true" />
        <span className="button button-outline upload-prompt" aria-hidden="true">
          {prompt}
        </span>
        <span className="small muted">{hint}</span>
        <input
          ref={input}
          id={id}
          className="sr-only"
          type="file"
          multiple={multiple}
          accept={accept}
          capture={capture}
          disabled={disabled}
          aria-describedby={
            description ? `${id}-description ${id}-hint` : `${id}-hint`
          }
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <p id={`${id}-hint`} className="small muted">
        {note ?? hint}
      </p>
      {children}
    </div>
  );
}
