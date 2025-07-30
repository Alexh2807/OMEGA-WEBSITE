import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Plus } from 'lucide-react';

interface ImageUploaderProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  maxImages?: number;
  className?: string;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({
  images,
  onImagesChange,
  maxImages = 5,
  className = '',
}) => {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const newImages: string[] = [];
    const remainingSlots = maxImages - images.length;
    const filesToProcess = Math.min(files.length, remainingSlots);

    for (let i = 0; i < filesToProcess; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = e => {
          const result = e.target?.result as string;
          newImages.push(result);

          if (newImages.length === filesToProcess) {
            onImagesChange([...images, ...newImages]);
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);
  };

  const moveImage = (fromIndex: number, toIndex: number) => {
    const newImages = [...images];
    const [movedImage] = newImages.splice(fromIndex, 1);
    newImages.splice(toIndex, 0, movedImage);
    onImagesChange(newImages);
  };

  return (
    <div className={className}>
      {/* Images existantes */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          {images.map((image, index) => (
            <div key={index} className="relative group">
              <img
                src={image}
                alt={`Image ${index + 1}`}
                className="w-full h-32 object-cover rounded-lg border border-white/20"
              />
              {index === 0 && (
                <div className="absolute top-2 left-2 bg-green-500 text-white px-2 py-1 rounded text-xs font-bold">
                  Principale
                </div>
              )}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              {/* Drag handles pour réorganiser */}
              <div className="absolute bottom-2 left-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => moveImage(index, index - 1)}
                    className="bg-blue-500 text-white px-2 py-1 rounded text-xs hover:bg-blue-600 transition-colors"
                  >
                    ←
                  </button>
                )}
                {index < images.length - 1 && (
                  <button
                    type="button"
                    onClick={() => moveImage(index, index + 1)}
                    className="bg-blue-500 text-white px-2 py-1 rounded text-xs hover:bg-blue-600 transition-colors"
                  >
                    →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Zone de drop pour ajouter des images */}
      {images.length < maxImages && (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            dragOver
              ? 'border-green-400 bg-green-400/10'
              : 'border-white/20 hover:border-green-400 hover:bg-green-400/5'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={e => handleFileSelect(e.target.files)}
            className="hidden"
          />

          <div className="flex flex-col items-center gap-4">
            <div className="bg-white/10 rounded-full p-4">
              <Upload className="text-gray-400" size={32} />
            </div>
            <div>
              <p className="text-white font-semibold mb-2">
                Glissez-déposez vos images ici
              </p>
              <p className="text-gray-400 text-sm">
                ou cliquez pour sélectionner ({images.length}/{maxImages})
              </p>
            </div>
          </div>
        </div>
      )}

      {images.length > 0 && (
        <p className="text-xs text-gray-400 mt-2">
          La première image sera utilisée comme image principale. Utilisez les
          flèches pour réorganiser.
        </p>
      )}
    </div>
  );
};

export default ImageUploader;
