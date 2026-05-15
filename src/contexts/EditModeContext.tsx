import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { getAuthHeaders, isPortalAdmin } from "@/lib/auth";

interface EditModeContextValue {
  editMode: boolean;
  toggleEditMode: () => void;
  content: Record<string, string>;
  pendingContent: Record<string, string>;
  updateField: (key: string, value: string) => void;
  saveContent: () => Promise<void>;
  discardChanges: () => void;
  isSaving: boolean;
  isDirty: boolean;
  uploadImage: (file: File) => Promise<string>;
  isAdmin: boolean;
}

const EditModeContext = createContext<EditModeContextValue | null>(null);

export function EditModeProvider({ children }: { children: ReactNode }) {
  const isAdmin = isPortalAdmin();
  const [editMode, setEditMode] = useState(false);
  const [content, setContent] = useState<Record<string, string>>({});
  const [pendingContent, setPendingContent] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetch("/api/portal/content")
      .then((r) => r.json())
      .then((data) => {
        setContent(data as Record<string, string>);
        setPendingContent(data as Record<string, string>);
      })
      .catch(() => {});
  }, []);

  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => {
      if (prev) setPendingContent(content);
      return !prev;
    });
  }, [content]);

  const updateField = useCallback((key: string, value: string) => {
    setPendingContent((prev) => ({ ...prev, [key]: value }));
  }, []);

  const isDirty = Object.keys(pendingContent).some(
    (k) => pendingContent[k] !== content[k]
  );

  const saveContent = useCallback(async () => {
    setIsSaving(true);
    try {
      const diff: Record<string, string> = {};
      for (const k of Object.keys(pendingContent)) {
        if (pendingContent[k] !== content[k]) diff[k] = pendingContent[k];
      }
      if (Object.keys(diff).length === 0) return;
      const headers = getAuthHeaders() as Record<string, string>;
      await fetch("/api/portal/admin/content", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(diff),
      });
      setContent((prev) => ({ ...prev, ...diff }));
    } finally {
      setIsSaving(false);
    }
  }, [content, pendingContent]);

  const discardChanges = useCallback(() => {
    setPendingContent(content);
  }, [content]);

  const uploadImage = useCallback(async (file: File): Promise<string> => {
    const headers = getAuthHeaders() as Record<string, string>;
    const resp = await fetch("/api/portal/admin/upload-url", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: file.type }),
    });
    if (!resp.ok) throw new Error("Gagal mendapatkan upload URL");
    const { uploadURL, objectPath } = await resp.json() as { uploadURL: string; objectPath: string };
    await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    return objectPath;
  }, []);

  return (
    <EditModeContext.Provider value={{
      editMode: editMode && isAdmin,
      toggleEditMode,
      content: pendingContent,
      pendingContent,
      updateField,
      saveContent,
      discardChanges,
      isSaving,
      isDirty,
      uploadImage,
      isAdmin,
    }}>
      {children}
    </EditModeContext.Provider>
  );
}

export function useEditMode() {
  const ctx = useContext(EditModeContext);
  if (!ctx) throw new Error("useEditMode must be used inside EditModeProvider");
  return ctx;
}
