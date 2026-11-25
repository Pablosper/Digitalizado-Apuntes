"use client";

import { ChangeEvent, PointerEvent, useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };
type Adjustments = {
  brightness: number;
  contrast: number;
  saturation: number;
  angle: number;
  crop: number;
  text: number;
  wrinkles: number;
};

const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  angle: 0,
  crop: 100,
  text: 0,
  wrinkles: 0,
};

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef(false);
  const originalImageRef = useRef<HTMLCanvasElement | null>(null);
  const previewRequestRef = useRef<number | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [candidateUrl, setCandidateUrl] = useState("");
  const [brushSize, setBrushSize] = useState(24);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustments>(DEFAULT_ADJUSTMENTS);
  const [message, setMessage] = useState("Carga una imagen o PDF para comenzar.");
  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    if (!imageUrl) return;
    const canvas = canvasRef.current;
    const mask = maskRef.current;
    if (!canvas || !mask) return;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      mask.width = image.naturalWidth;
      mask.height = image.naturalHeight;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      mask.getContext("2d")?.clearRect(0, 0, mask.width, mask.height);
      const original = document.createElement("canvas");
      original.width = canvas.width;
      original.height = canvas.height;
      original.getContext("2d")?.drawImage(canvas, 0, 0);
      originalImageRef.current = original;
      setAdjustments(DEFAULT_ADJUSTMENTS);
      setUndoStack([canvas.toDataURL("image/png")]);
      setRedoStack([]);
      setCandidateUrl("");
      setMessage(`Imagen cargada: ${image.naturalWidth} × ${image.naturalHeight}px`);
      setPages((existing) => {
        if (existing[currentPage]) {
          const copy = [...existing];
          copy[currentPage] = canvas.toDataURL("image/png");
          return copy;
        }
        return [...existing, canvas.toDataURL("image/png")];
      });
    };
    image.onerror = () => {
      setMessage("No se pudo decodificar la imagen. Prueba JPG, PNG o WEBP.");
    };
    image.src = imageUrl;
  }, [imageUrl]);

  function getPoint(event: PointerEvent<HTMLCanvasElement>): Point {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function paint(point: Point) {
    const mask = maskRef.current;
    if (!mask) return;
    const context = mask.getContext("2d");
    if (!context) return;
    context.fillStyle = "rgba(49, 94, 251, 0.28)";
    context.beginPath();
    context.arc(point.x, point.y, brushSize * 2, 0, Math.PI * 2);
    context.fill();
  }

  function startDrawing(event: PointerEvent<HTMLCanvasElement>) {
    if (candidateUrl) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    paint(getPoint(event));
  }

  function continueDrawing(event: PointerEvent<HTMLCanvasElement>) {
    if (drawingRef.current) paint(getPoint(event));
  }

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) {
      setMessage("No se seleccionó ningún archivo.");
      return;
    }
    const file = files[0];
    setMessage(`Archivo seleccionado: ${file.name} (${Math.round(file.size / 1024)} KB)`);
    const supportedImage = ["image/jpeg", "image/png", "image/webp"];
    const extension = file.name.toLowerCase().split(".").pop() || "";
    const supportedExtension = ["jpg", "jpeg", "png", "webp"].includes(extension);
    if (!file.type && !supportedExtension) {
      setMessage(`Formato no reconocido: ${file.name}`);
      event.target.value = "";
      return;
    }
    if (file.type && !supportedImage.includes(file.type) && file.type !== "application/pdf" && !supportedExtension) {
      setMessage(`Formato no compatible: ${file.type || file.name}`);
      event.target.value = "";
      return;
    }
    if (file.type === "application/pdf") {
      setMessage("Convirtiendo PDF...");
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const pdfPages: string[] = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.8 });
          const pdfCanvas = document.createElement("canvas");
          pdfCanvas.width = viewport.width;
          pdfCanvas.height = viewport.height;
          const context = pdfCanvas.getContext("2d");
          if (!context) throw new Error("No se pudo crear el lienzo del PDF");
          await page.render({ canvas: pdfCanvas, canvasContext: context, viewport }).promise;
          pdfPages.push(pdfCanvas.toDataURL("image/png"));
          setMessage(`Convirtiendo PDF: ${pageNumber}/${pdf.numPages}`);
        }
        setPages((existing) => {
          const merged = [...existing, ...pdfPages];
          setCurrentPage(existing.length);
          return merged;
        });
        setImageUrl(pdfPages[0]);
        setCandidateUrl("");
        setMessage(`PDF cargado: ${pdfPages.length} páginas.`);
      } catch (error) {
        setMessage(error instanceof Error ? `Error PDF: ${error.message}` : "Error al cargar el PDF");
      }
      return;
    }
    setMessage(`Cargando ${files.length} hoja(s)...`);
    const imagePages: string[] = [];
    for (const selectedFile of files) {
      const isSupportedImage = ["image/jpeg", "image/png", "image/webp"].includes(selectedFile.type) ||
        ["jpg", "jpeg", "png", "webp"].includes(selectedFile.name.toLowerCase().split(".").pop() || "");
      if (!isSupportedImage) continue;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => reject(new Error("No se pudo leer una hoja"));
        reader.readAsDataURL(selectedFile);
      });
      if (dataUrl) imagePages.push(dataUrl);
    }
    if (!imagePages.length) {
      setMessage("No se pudieron cargar las hojas seleccionadas.");
      return;
    }
    setPages((existing) => {
      const merged = [...existing, ...imagePages];
      setCurrentPage(existing.length);
      return merged;
    });
    setCandidateUrl("");
    setImageUrl(imagePages[0]);
    setMessage(`${imagePages.length} hoja(s) agregada(s).`);
  }

  function restore(url: string) {
    const canvas = canvasRef.current;
    const mask = maskRef.current;
    if (!canvas || !mask) return;
    const image = new Image();
    image.onload = () => {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      mask.width = image.naturalWidth;
      mask.height = image.naturalHeight;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      mask.getContext("2d")?.clearRect(0, 0, mask.width, mask.height);
      const original = document.createElement("canvas");
      original.width = canvas.width;
      original.height = canvas.height;
      original.getContext("2d")?.drawImage(canvas, 0, 0);
      originalImageRef.current = original;
    };
    image.src = url;
  }

  function clamp(value: number) {
    return Math.max(0, Math.min(255, value));
  }

  function createAdjustmentsCandidate() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const source = canvas.getContext("2d");
    if (!source) return;

    const sourceImage = source.getImageData(0, 0, canvas.width, canvas.height);
    const sourceData = sourceImage.data;
    const result = new Uint8ClampedArray(sourceData);

    const brightness = adjustments.brightness * 2.55;
    const contrastFactor = (259 * (adjustments.contrast * 2.55 + 255)) / (255 * (259 - adjustments.contrast * 2.55));
    const saturation = 1 + adjustments.saturation / 100;
    const textStrength = adjustments.text / 100;
    const wrinkleStrength = adjustments.wrinkles / 100;

    for (let i = 0; i < result.length; i += 4) {
      let r = clamp(contrastFactor * (sourceData[i] + brightness - 128) + 128);
      let g = clamp(contrastFactor * (sourceData[i + 1] + brightness - 128) + 128);
      let b = clamp(contrastFactor * (sourceData[i + 2] + brightness - 128) + 128);
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;

      r = clamp(gray + (r - gray) * saturation);
      g = clamp(gray + (g - gray) * saturation);
      b = clamp(gray + (b - gray) * saturation);

      if (textStrength > 0) {
        const enhanced = clamp((gray - 128) * (1 + textStrength * 1.8) + 128);
        r = clamp(r * (1 - textStrength) + enhanced * textStrength);
        g = clamp(g * (1 - textStrength) + enhanced * textStrength);
        b = clamp(b * (1 - textStrength) + enhanced * textStrength);
      }

      if (wrinkleStrength > 0) {
        const softened = clamp(gray + (gray - 128) * 0.18 * wrinkleStrength);
        r = clamp(r * (1 - wrinkleStrength * 0.12) + softened * wrinkleStrength * 0.12);
        g = clamp(g * (1 - wrinkleStrength * 0.12) + softened * wrinkleStrength * 0.12);
        b = clamp(b * (1 - wrinkleStrength * 0.12) + softened * wrinkleStrength * 0.12);
      }

      result[i] = r;
      result[i + 1] = g;
      result[i + 2] = b;
    }

    const adjusted = document.createElement("canvas");
    adjusted.width = canvas.width;
    adjusted.height = canvas.height;
    adjusted.getContext("2d")?.putImageData(new ImageData(result, canvas.width, canvas.height), 0, 0);

    const radians = adjustments.angle * Math.PI / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const transformed = document.createElement("canvas");
    transformed.width = Math.max(1, Math.round(canvas.width * cos + canvas.height * sin));
    transformed.height = Math.max(1, Math.round(canvas.width * sin + canvas.height * cos));
    const context = transformed.getContext("2d");
    if (!context) return;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, transformed.width, transformed.height);
    context.save();
    context.translate(transformed.width / 2, transformed.height / 2);
    context.rotate(radians);
    context.drawImage(adjusted, -canvas.width / 2, -canvas.height / 2);
    context.restore();

    const cropped = document.createElement("canvas");
    const cropScale = adjustments.crop / 100;
    cropped.width = Math.max(1, Math.round(transformed.width * cropScale));
    cropped.height = Math.max(1, Math.round(transformed.height * cropScale));
    const croppedContext = cropped.getContext("2d");
    croppedContext?.drawImage(
      transformed,
      (transformed.width - cropped.width) / 2,
      (transformed.height - cropped.height) / 2,
      cropped.width,
      cropped.height,
      0,
      0,
      cropped.width,
      cropped.height
    );
    setCandidateUrl(cropped.toDataURL("image/png"));
  }

  function applyFill() {
    const canvas = canvasRef.current;
    const mask = maskRef.current;
    if (!canvas || !mask) return;
    const context = canvas.getContext("2d");
    const maskContext = mask.getContext("2d");
    if (!context || !maskContext) return;
    const source = context.getImageData(0, 0, canvas.width, canvas.height);
    const maskData = maskContext.getImageData(0, 0, mask.width, mask.height);
    let selected = false;
    for (let index = 3; index < maskData.data.length; index += 4) {
      if (maskData.data[index] > 20) { selected = true; break; }
    }
    if (!selected) {
      setMessage("Marca primero el texto con la goma.");
      return;
    }
    setMessage("Aplicando borrado...");
    const maskPixels = maskData.data;
    const sourcePixels = source.data;
    const result = new Uint8ClampedArray(sourcePixels);
    const selectedMask = new Uint8Array(canvas.width * canvas.height);
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const index = (y * canvas.width + x) * 4;
        if (maskPixels[index + 3] > 20) selectedMask[y * canvas.width + x] = 1;
      }
    }

    // Use colors from the complete outer edge of the selected area.
    // This is the most reliable browser-only fallback for plain walls,
    // paper backgrounds and large uniform zones.
    const borderColors: number[][] = [];
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const pixel = y * canvas.width + x;
        if (selectedMask[pixel]) continue;
        let touchingSelection = false;
        for (let dy = -3; dy <= 3 && !touchingSelection; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const sx = x + dx;
            const sy = y + dy;
            if (sx < 0 || sy < 0 || sx >= canvas.width || sy >= canvas.height) continue;
            if (selectedMask[sy * canvas.width + sx]) {
              touchingSelection = true;
              break;
            }
          }
        }
        if (touchingSelection) {
          const index = pixel * 4;
          borderColors.push([sourcePixels[index], sourcePixels[index + 1], sourcePixels[index + 2]]);
        }
      }
    }

    if (borderColors.length) {
      const borderMedian = [0, 1, 2].map((channel) => {
        const values = borderColors
          .map((color) => color[channel])
          .sort((first, second) => first - second);
        return values[Math.floor(values.length / 2)];
      });
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const pixel = y * canvas.width + x;
          if (!selectedMask[pixel]) continue;
          const index = pixel * 4;
          result[index] = borderMedian[0];
          result[index + 1] = borderMedian[1];
          result[index + 2] = borderMedian[2];
        }
      }
    }
    const extendedMask = new Uint8Array(selectedMask);
    for (let y = 1; y < canvas.height - 1; y++) {
      for (let x = 1; x < canvas.width - 1; x++) {
        const pixel = y * canvas.width + x;
        if (selectedMask[pixel]) continue;
        let nearSelection = false;
        for (let dy = -2; dy <= 2 && !nearSelection; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (selectedMask[(y + dy) * canvas.width + x + dx]) {
              extendedMask[pixel] = 1;
              nearSelection = true;
              break;
            }
          }
        }
      }
    }

    if (borderColors.length) {
      const borderMedian = [0, 1, 2].map((channel) => {
        const values = borderColors
          .map((color) => color[channel])
          .sort((first, second) => first - second);
        return values[Math.floor(values.length / 2)];
      });
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const pixel = y * canvas.width + x;
          if (!extendedMask[pixel]) continue;
          const index = pixel * 4;
          result[index] = borderMedian[0];
          result[index + 1] = borderMedian[1];
          result[index + 2] = borderMedian[2];
        }
      }
    }

    context.putImageData(new ImageData(result, canvas.width, canvas.height), 0, 0);
    maskContext.clearRect(0, 0, mask.width, mask.height);
    const updatedOriginal = document.createElement("canvas");
    updatedOriginal.width = canvas.width;
    updatedOriginal.height = canvas.height;
    updatedOriginal.getContext("2d")?.drawImage(canvas, 0, 0);
    originalImageRef.current = updatedOriginal;
    setUndoStack((states) => [...states, canvas.toDataURL("image/png")]);
    setRedoStack([]);
    setCandidateUrl("");
    setMessage("Texto borrado. Puedes marcar otra zona.");
  }

  function confirmChange() {
    if (!candidateUrl) return;
    const canvas = canvasRef.current;
    const mask = maskRef.current;
    if (!canvas || !mask) return;
    const candidateImage = new Image();
    candidateImage.onload = () => {
      canvas.width = candidateImage.naturalWidth;
      canvas.height = candidateImage.naturalHeight;
      mask.width = candidateImage.naturalWidth;
      mask.height = candidateImage.naturalHeight;
      canvas.getContext("2d")?.drawImage(candidateImage, 0, 0);
      mask.getContext("2d")?.clearRect(0, 0, mask.width, mask.height);
      const original = document.createElement("canvas");
      original.width = canvas.width;
      original.height = canvas.height;
      original.getContext("2d")?.drawImage(canvas, 0, 0);
      originalImageRef.current = original;
      setAdjustments(DEFAULT_ADJUSTMENTS);
      setUndoStack((states) => [...states, canvas.toDataURL("image/png")]);
      setRedoStack([]);
      setCandidateUrl("");
      setMessage("Cambio confirmado.");
    };
    candidateImage.src = candidateUrl;
  }

  function cancelChange() {
    const mask = maskRef.current;
    if (mask) mask.getContext("2d")?.clearRect(0, 0, mask.width, mask.height);
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setCandidateUrl("");
    setMessage("Vista previa cancelada.");
  }

  function undo() {
    if (candidateUrl) {
      cancelChange();
      return;
    }
    if (undoStack.length < 2) return;
    const current = undoStack[undoStack.length - 1];
    const previous = undoStack[undoStack.length - 2];
    setRedoStack((states) => [current, ...states]);
    setUndoStack((states) => states.slice(0, -1));
    setCandidateUrl("");
    restore(previous);
  }

  function redo() {
    if (candidateUrl) return;
    if (!redoStack.length) return;
    const next = redoStack[0];
    setUndoStack((states) => [...states, next]);
    setRedoStack((states) => states.slice(1));
    setCandidateUrl("");
    restore(next);
  }

  function resetAll() {
    if (!undoStack.length) return;
    restore(undoStack[0]);
    setUndoStack([undoStack[0]]);
    setRedoStack([]);
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setCandidateUrl("");
    setMessage("Se volvió al archivo original.");
  }

  function guardarPaginaActual() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPages((existing) => {
      const copy = [...existing];
      copy[currentPage] = canvas.toDataURL("image/png");
      return copy;
    });
  }

  function cambiarPagina(index: number) {
    if (index < 0 || index >= pages.length) return;
    guardarPaginaActual();
    setCurrentPage(index);
    setImageUrl(pages[index]);
  }

  function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "apunte-editado.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function savePDF() {
    guardarPaginaActual();
    const { jsPDF } = await import("jspdf");
    const documentPdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    for (let index = 0; index < pages.length; index++) {
      if (index > 0) documentPdf.addPage();
      const image = index === currentPage
        ? canvasRef.current?.toDataURL("image/png")
        : pages[index];
      if (!image) continue;
      const pageWidth = documentPdf.internal.pageSize.getWidth();
      const pageHeight = documentPdf.internal.pageSize.getHeight();
      documentPdf.addImage(image, "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
    }
    documentPdf.save("apuntes-digitalizados.pdf");
  }

  function setAdjustment(key: keyof Adjustments, value: number) {
    setAdjustments((current) => {
      const next = { ...current, [key]: value };
      if (previewRequestRef.current !== null) {
        cancelAnimationFrame(previewRequestRef.current);
      }
      previewRequestRef.current = requestAnimationFrame(() => {
        renderLivePreview(next);
      });
      return next;
    });
  }

  function renderLivePreview(next: Adjustments) {
    const canvas = canvasRef.current;
    const original = originalImageRef.current;
    if (!canvas || !original) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = original.width;
    sourceCanvas.height = original.height;
    sourceCanvas.getContext("2d")?.drawImage(original, 0, 0);

    const imageData = sourceCanvas.getContext("2d")?.getImageData(
      0,
      0,
      sourceCanvas.width,
      sourceCanvas.height
    );
    if (!imageData) return;
    const data = imageData.data;
    const brightness = next.brightness * 2.55;
    const contrast = (259 * (next.contrast * 2.55 + 255)) / (255 * (259 - next.contrast * 2.55));
    const saturation = 1 + next.saturation / 100;
    const textStrength = next.text / 100;

    for (let i = 0; i < data.length; i += 4) {
      let r = clamp(contrast * (data[i] + brightness - 128) + 128);
      let g = clamp(contrast * (data[i + 1] + brightness - 128) + 128);
      let b = clamp(contrast * (data[i + 2] + brightness - 128) + 128);
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = clamp(gray + (r - gray) * saturation);
      g = clamp(gray + (g - gray) * saturation);
      b = clamp(gray + (b - gray) * saturation);
      if (textStrength > 0) {
        const enhanced = clamp((gray - 128) * (1 + textStrength * 1.8) + 128);
        r = clamp(r * (1 - textStrength) + enhanced * textStrength);
        g = clamp(g * (1 - textStrength) + enhanced * textStrength);
        b = clamp(b * (1 - textStrength) + enhanced * textStrength);
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }

    sourceCanvas.getContext("2d")?.putImageData(imageData, 0, 0);

    if (next.wrinkles > 0) {
      const wrinkleCanvas = document.createElement("canvas");
      wrinkleCanvas.width = sourceCanvas.width;
      wrinkleCanvas.height = sourceCanvas.height;
      const baseContext = sourceCanvas.getContext("2d");
      const wrinkleContext = wrinkleCanvas.getContext("2d");
      const baseData = baseContext?.getImageData(
        0,
        0,
        sourceCanvas.width,
        sourceCanvas.height
      );
      if (baseData && wrinkleContext) {
        const result = new Uint8ClampedArray(baseData.data);
        const width = sourceCanvas.width;
        const height = sourceCanvas.height;
        const strength = next.wrinkles / 100;
        const radius = strength > 0.65 ? 2 : 1;

        for (let y = radius; y < height - radius; y++) {
          for (let x = radius; x < width - radius; x++) {
            const index = (y * width + x) * 4;
            const gray = 0.299 * baseData.data[index] +
              0.587 * baseData.data[index + 1] +
              0.114 * baseData.data[index + 2];

            let sumR = 0;
            let sumG = 0;
            let sumB = 0;
            let count = 0;
            for (let dy = -radius; dy <= radius; dy++) {
              for (let dx = -radius; dx <= radius; dx++) {
                const neighbor = ((y + dy) * width + x + dx) * 4;
                const neighborGray = 0.299 * baseData.data[neighbor] +
                  0.587 * baseData.data[neighbor + 1] +
                  0.114 * baseData.data[neighbor + 2];
                if (Math.abs(neighborGray - gray) < 42) {
                  sumR += baseData.data[neighbor];
                  sumG += baseData.data[neighbor + 1];
                  sumB += baseData.data[neighbor + 2];
                  count++;
                }
              }
            }

            if (count > 0) {
              const edgeProtection = gray < 90 ? 0.12 : 0.55;
              const blend = strength * edgeProtection;
              result[index] = clamp(baseData.data[index] * (1 - blend) + (sumR / count) * blend);
              result[index + 1] = clamp(baseData.data[index + 1] * (1 - blend) + (sumG / count) * blend);
              result[index + 2] = clamp(baseData.data[index + 2] * (1 - blend) + (sumB / count) * blend);
            }
          }
        }
        const resultData = new ImageData(result, width, height);
        wrinkleContext.putImageData(resultData, 0, 0);
        sourceCanvas = wrinkleCanvas;
      }
    }

    const radians = next.angle * Math.PI / 180;
    const cosine = Math.abs(Math.cos(radians));
    const sine = Math.abs(Math.sin(radians));
    let outputWidth = Math.max(
      1,
      Math.round(sourceCanvas.width * cosine + sourceCanvas.height * sine)
    );
    let outputHeight = Math.max(
      1,
      Math.round(sourceCanvas.width * sine + sourceCanvas.height * cosine)
    );

    const rotated = document.createElement("canvas");
    rotated.width = outputWidth;
    rotated.height = outputHeight;
    const rotatedContext = rotated.getContext("2d");
    if (rotatedContext) {
      rotatedContext.fillStyle = "#ffffff";
      rotatedContext.fillRect(0, 0, outputWidth, outputHeight);
      rotatedContext.save();
      rotatedContext.translate(outputWidth / 2, outputHeight / 2);
      rotatedContext.rotate(radians);
      rotatedContext.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);
      rotatedContext.restore();
    }

    const cropScale = next.crop / 100;
    const croppedWidth = Math.max(1, Math.round(rotated.width * cropScale));
    const croppedHeight = Math.max(1, Math.round(rotated.height * cropScale));
    canvas.width = croppedWidth;
    canvas.height = croppedHeight;
    context.drawImage(
      rotated,
      (rotated.width - croppedWidth) / 2,
      (rotated.height - croppedHeight) / 2,
      croppedWidth,
      croppedHeight,
      0,
      0,
      croppedWidth,
      croppedHeight
    );

    const mask = document.querySelector<HTMLCanvasElement>(".mask-canvas");
    if (mask) {
      mask.width = croppedWidth;
      mask.height = croppedHeight;
      mask.getContext("2d")?.clearRect(0, 0, mask.width, mask.height);
    }
  }

  function autoEnhance() {
    const next = {
      ...adjustments,
      brightness: 4,
      contrast: 18,
      saturation: -8,
      text: 24,
      wrinkles: 12,
    };
    setAdjustments(next);
    renderLivePreview(next);
  }

  return (
    <main className="editor">
      <header>
        <div>
          <p className="eyebrow">Digitalizador</p>
          <h1>Restaurar apuntes</h1>
        </div>
        {pages.length > 0 && (
          <div className="page-controls">
            <button
              type="button"
              onClick={() => cambiarPagina(currentPage - 1)}
              disabled={currentPage === 0}
            >
              Anterior
            </button>
            <span>Hoja {currentPage + 1} / {pages.length}</span>
            <button
              type="button"
              onClick={() => cambiarPagina(currentPage + 1)}
              disabled={currentPage >= pages.length - 1}
            >
              Siguiente
            </button>
            <button type="button" onClick={savePDF}>
              Exportar PDF
            </button>
          </div>
        )}
        <label className="primary file-button" htmlFor="archivo-apunte">
          Agregar hoja
        </label>
        <input
          id="archivo-apunte"
          ref={fileRef}
          className="native-file-input"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={loadFile}
        />
      </header>

      <section className="workspace">
        <aside className="tools left-tools">
          <h2>Herramientas</h2>

          <label>
            Brillo
            <input
              type="range"
              min="-50"
              max="50"
              value={adjustments.brightness}
              onChange={(event) => setAdjustment("brightness", Number(event.target.value))}
            />
            <span>{adjustments.brightness}</span>
          </label>

          <label>
            Contraste
            <input
              type="range"
              min="-50"
              max="50"
              value={adjustments.contrast}
              onChange={(event) => setAdjustment("contrast", Number(event.target.value))}
            />
            <span>{adjustments.contrast}</span>
          </label>

          <label>
            Saturacion / color
            <input
              type="range"
              min="-100"
              max="100"
              value={adjustments.saturation}
              onChange={(event) => setAdjustment("saturation", Number(event.target.value))}
            />
            <span>{adjustments.saturation}</span>
          </label>

          <label>
            Texto / nitidez
            <input
              type="range"
              min="0"
              max="100"
              value={adjustments.text}
              onChange={(event) => setAdjustment("text", Number(event.target.value))}
            />
            <span>{adjustments.text}</span>
          </label>

          <label>
            Suavizar arrugas
            <input
              type="range"
              min="0"
              max="100"
              value={adjustments.wrinkles}
              onChange={(event) => setAdjustment("wrinkles", Number(event.target.value))}
            />
            <span>{adjustments.wrinkles}</span>
          </label>

          <label>
            Rotacion
            <input
              type="range"
              min="-45"
              max="45"
              value={adjustments.angle}
              onChange={(event) => setAdjustment("angle", Number(event.target.value))}
            />
            <span>{adjustments.angle}°</span>
          </label>

          <label>
            Encuadre
            <input
              type="range"
              min="20"
              max="100"
              value={adjustments.crop}
              onChange={(event) => setAdjustment("crop", Number(event.target.value))}
            />
            <span>{adjustments.crop}%</span>
          </label>

          <button onClick={autoEnhance} disabled={!imageUrl || !!candidateUrl}>
            Mejorar automaticamente
          </button>
        </aside>

        <div className="canvas-area">
          <p className="status">{message}</p>
          {pages.length > 0 && (
            <div className="page-controls">
              <button type="button" onClick={() => cambiarPagina(currentPage - 1)} disabled={currentPage === 0}>
                Anterior
              </button>
              <span>Hoja {currentPage + 1} / {pages.length}</span>
              <button type="button" onClick={() => cambiarPagina(currentPage + 1)} disabled={currentPage >= pages.length - 1}>
                Siguiente
              </button>
            </div>
          )}
          <div className="canvas-wrap">
              <canvas
                ref={canvasRef}
                className={imageUrl ? "canvas" : "canvas empty"}
                onPointerDown={startDrawing}
                onPointerMove={continueDrawing}
                onPointerUp={() => drawingRef.current = false}
                onPointerCancel={() => drawingRef.current = false}
                onPointerLeave={() => drawingRef.current = false}
              />
              <canvas ref={maskRef} className="mask-canvas" />
          </div>
        </div>

        <aside className="tools right-tools">
          <h2>Retocar</h2>
          <label>
            Tamaño goma
            <input
              type="range"
              min="4"
              max="80"
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.target.value))}
            />
            <span>{brushSize}px</span>
          </label>
          <button onClick={applyFill} disabled={!imageUrl}>
            Aplicar borrado
          </button>
          <button onClick={undo} disabled={undoStack.length < 2 || !!candidateUrl}>
            Deshacer
          </button>
          <button onClick={redo} disabled={!redoStack.length || !!candidateUrl}>
            Rehacer
          </button>
          <button onClick={resetAll} disabled={!imageUrl || !!candidateUrl}>
            Volver al inicio
          </button>
          <button className="save" onClick={save} disabled={!imageUrl || !!candidateUrl}>
            Guardar PNG
          </button>
          <button onClick={savePDF} disabled={!pages.length}>
            Guardar PDF
          </button>
        </aside>
      </section>
    </main>
  );
}
