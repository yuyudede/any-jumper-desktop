import { memo } from "react";
import type { ImageAttachment } from "../../types";

export const MessageImageGrid = memo(function MessageImageGrid({
  images,
}: {
  images: ImageAttachment[];
}) {
  if (images.length === 0) return null;
  return (
    <div className="message-image-grid">
      {images.map((image, idx) => (
        <img
          key={idx}
          className="message-image"
          src={`data:${image.mimeType};base64,${image.data}`}
          alt={image.name || `图片 ${idx + 1}`}
        />
      ))}
    </div>
  );
});
