import { useEffect } from "react";

export default function PdfModalViewer({ pdfDoc, onClose }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!pdfDoc) return null;

  const { fileName, page, url } = pdfDoc;
  const pdfUrlWithPage = page ? `${url}#page=${page}` : url;

  return (
    <div className="pdf-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="pdf-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="pdf-modal-header">
          <div className="pdf-modal-info">
            <span className="pdf-modal-badge">PDF</span>
            <div className="pdf-modal-title-group">
              <h3 className="pdf-modal-title">{fileName}</h3>
              {page && (
                <span className="pdf-modal-page-badge">
                  Navigated to Page {page}
                </span>
              )}
            </div>
          </div>
          <div className="pdf-modal-actions">
            <a
              href={pdfUrlWithPage}
              target="_blank"
              rel="noopener noreferrer"
              className="pdf-modal-btn external-btn"
              title="Open in new browser tab"
            >
              ↗ Open in New Tab
            </a>
            <button
              type="button"
              className="pdf-modal-close-btn"
              onClick={onClose}
              title="Close viewer (Esc)"
              aria-label="Close PDF Viewer"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="pdf-modal-frame-wrapper">
          <iframe
            key={pdfUrlWithPage}
            src={pdfUrlWithPage}
            title={`PDF Document - ${fileName}`}
            className="pdf-modal-iframe"
          />
        </div>
      </div>
    </div>
  );
}
