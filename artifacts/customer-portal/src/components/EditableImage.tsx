import { useRef } from "react";
import { useEditMode } from "@/contexts/EditModeContext";
import { ImagePlus, Loader2 } from "lucide-react";
import { useState } from "react";
import { resolveImageUrl } from "@/lib/utils";

interface EditableImageProps {
  contentKey: string;
  defaultSrc: string;
  alt: string;
  className?: string;
}

export function EditableImage({ contentKey, defaultSrc, alt, className = "" }: EditableImageProps) {
  const { editMode, content, updateField, uploadImage } = useEditMode();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const src = content[contentKey] ?? defaultSrc;
  const resolved = src.startsWith("/") ? (resolveImageUrl(src) ?? src) : src;

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const path = await uploadImage(file);
      updateField(contentKey, path);
    } catch {
      alert("Gagal upload gambar");
    } finally {
      setUploading(false);
    }
  };

  if (!editMode) {
    return <img src={resolved} alt={alt} className={className} />;
  }

  return (
    <div className={`relative group ${className.includes("absolute") ? className : `relative ${className}`}`}>
      <img src={resolved} alt={alt} className={`${className.includes("absolute") ? "" : "w-full h-full"} object-cover`} />
      <button
        onClick={() => fileRef.current?.click()}
        className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
      >
        {uploading ? (
          <Loader2 className="h-8 w-8 text-white animate-spin" />
        ) : (
          <>
            <ImagePlus className="h-8 w-8 text-white mb-2" />
            <span className="text-white text-sm font-medium">Ganti Gambar</span>
          </>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
