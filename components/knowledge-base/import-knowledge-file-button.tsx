"use client";

import { useRef } from "react";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { importFileAccept } from "@/modules/knowledge-base/hooks";

type ImportKnowledgeFileButtonProps = {
  disabled: boolean;
  importing: boolean;
  onSelect: (file: File) => void;
};

// Opens the file picker; the chosen file's text becomes a new Text section.
export function ImportKnowledgeFileButton({
  disabled,
  importing,
  onSelect,
}: ImportKnowledgeFileButtonProps) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={importFileAccept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so choosing the same file again starts a new import.
          event.target.value = "";
          if (file) onSelect(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {importing ? (
          <>
            <Spinner data-icon="inline-start" aria-hidden="true" />
            Importando…
          </>
        ) : (
          <>
            <UploadIcon data-icon="inline-start" />
            Importar arquivo
          </>
        )}
      </Button>
    </>
  );
}
