/**
 * Text input/textarea that holds a local draft and only commits on blur or
 * Enter, so store updates (and undo snapshots) happen once per edit, not per
 * keystroke. Escape restores the committed value.
 */

import { useEffect, useState } from "react";

export interface CommitInputProps {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  ariaLabel?: string;
  className?: string;
  /** Runs once Enter has committed a single-line field and left it, e.g. to pass the focus on. */
  afterEnter?: () => void;
}

export function CommitInput({
  value,
  onCommit,
  placeholder,
  multiline,
  ariaLabel,
  className = "tt-field__control",
  afterEnter,
}: CommitInputProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === "Escape" && draft !== value) {
      event.preventDefault();
      setDraft(value);
      return;
    }
    if (event.key === "Enter" && !multiline) {
      event.preventDefault();
      event.currentTarget.blur();
      afterEnter?.();
    }
  };

  const shared = {
    className,
    value: draft,
    placeholder,
    "aria-label": ariaLabel,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(event.target.value),
    onBlur: commit,
    onKeyDown,
  };

  if (multiline) {
    return <textarea {...shared} rows={3} />;
  }

  return <input {...shared} type="text" />;
}
