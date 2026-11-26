import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { useRef, useState } from "react";
import {
  Alert,
  Image,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { captureRef } from "react-native-view-shot";

type Point = { x: number; y: number };
type HistoryItem = {
  uri: string;
  brightness: number;
  contrast: number;
  angle: number;
};

export default function App() {
  const previewRef = useRef<any>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [redo, setRedo] = useState<HistoryItem[]>([]);
  const [points, setPoints] = useState<Point[]>([]);
  const [brushSize, setBrushSize] = useState(18);
  const [eraseMode, setEraseMode] = useState(false);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [angle, setAngle] = useState(0);
  const [notice, setNotice] = useState("Selecciona una imagen para comenzar.");

  const hasImageRef = useRef(false);
  hasImageRef.current = Boolean(imageUri);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        if (!hasImageRef.current) return;
        setEraseMode(false);
        addPoint(event.nativeEvent.locationX, event.nativeEvent.locationY);
      },
      onPanResponderMove: (event) => {
        if (!hasImageRef.current) return;
        addPoint(event.nativeEvent.locationX, event.nativeEvent.locationY);
      },
    })
  ).current;

  function addPoint(x: number, y: number) {
    setPoints((items) => [...items, { x, y }]);
  }

  function pushHistory(uri: string, b = brightness, c = contrast, a = angle) {
    setHistory((items) => [...items, { uri, brightness: b, contrast: c, angle: a }]);
    setRedo([]);
  }

  async function openImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permiso requerido", "Autoriza el acceso a fotos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setImageUri(uri);
    setBrightness(0);
    setContrast(0);
    setAngle(0);
    setPoints([]);
    setEraseMode(false);
    setHistory([{ uri, brightness: 0, contrast: 0, angle: 0 }]);
    setRedo([]);
    setNotice("Imagen cargada. Ajusta parámetros o marca con el dedo para borrar.");
  }

  async function bakeCurrentView(nextNotice?: string) {
    if (!previewRef.current || !imageUri) return null;
    try {
      const capturedUri = await captureRef(previewRef, {
        format: "png",
        quality: 1,
      });
      setImageUri(capturedUri);
      setBrightness(0);
      setContrast(0);
      setAngle(0);
      setPoints([]);
      setEraseMode(false);
      pushHistory(capturedUri, 0, 0, 0);
      if (nextNotice) setNotice(nextNotice);
      return capturedUri;
    } catch {
      setNotice("No se pudo procesar la vista previa.");
      return null;
    }
  }

  function waitFrames(count = 3) {
    return new Promise<void>((resolve) => {
      let remaining = count;
      function step() {
        remaining -= 1;
        if (remaining <= 0) {
          resolve();
        } else {
          requestAnimationFrame(step);
        }
      }
      requestAnimationFrame(step);
    });
  }

  async function applyErase() {
    if (!imageUri || !points.length) {
      setNotice("Marca primero con el dedo el texto que quieres borrar.");
      return;
    }
    setEraseMode(true);
    setNotice("Aplicando borrado...");
    await waitFrames(3);
    await bakeCurrentView("Zona borrada y aplicada a la hoja.");
  }

  async function rotate90(delta: number) {
    if (!imageUri) return;
    const baseUri =
      brightness !== 0 || contrast !== 0 || angle !== 0 || points.length > 0
        ? (await bakeCurrentView()) ?? imageUri
        : imageUri;

    const result = await ImageManipulator.manipulateAsync(
      baseUri,
      [{ rotate: delta }],
      { compress: 1, format: ImageManipulator.SaveFormat.PNG }
    );
    setImageUri(result.uri);
    pushHistory(result.uri, 0, 0, 0);
    setNotice(`Rotación aplicada (${delta > 0 ? "+90°" : "-90°"}).`);
  }

  function autoEnhance() {
    if (!imageUri) return;
    setBrightness(15);
    setContrast(30);
    setNotice("Mejora automática aplicada (brillo y contraste).");
  }

  function undo() {
    if (points.length > 0) {
      setPoints([]);
      setEraseMode(false);
      setNotice("Selección descartada.");
      return;
    }
    if (history.length < 2) return;
    const current = history[history.length - 1];
    const previous = history[history.length - 2];
    setRedo((items) => [current, ...items]);
    setHistory((items) => items.slice(0, -1));
    setImageUri(previous.uri);
    setBrightness(previous.brightness);
    setContrast(previous.contrast);
    setAngle(previous.angle);
    setPoints([]);
    setNotice("Paso deshecho.");
  }

  function redoChange() {
    if (!redo.length) return;
    const next = redo[0];
    setHistory((items) => [...items, next]);
    setRedo((items) => items.slice(1));
    setImageUri(next.uri);
    setBrightness(next.brightness);
    setContrast(next.contrast);
    setAngle(next.angle);
    setPoints([]);
    setNotice("Paso rehecho.");
  }

  function reset() {
    if (!history.length) return;
    const initial = history[0];
    setImageUri(initial.uri);
    setBrightness(0);
    setContrast(0);
    setAngle(0);
    setPoints([]);
    setEraseMode(false);
    setHistory([initial]);
    setRedo([]);
    setNotice("Se volvió al archivo original.");
  }

  async function save() {
    if (!imageUri) {
      setNotice("Imagen no cargada.");
      return;
    }

    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        Alert.alert("Permiso requerido", "Autoriza guardar en la galería.");
        return;
      }

      let uriToSave = imageUri;
      if (brightness !== 0 || contrast !== 0 || angle !== 0 || points.length > 0) {
        const baked = await bakeCurrentView();
        if (baked) uriToSave = baked;
      }

      await MediaLibrary.saveToLibraryAsync(uriToSave);
      setNotice("Imagen guardada en la galería.");
    } catch (error: any) {
      console.error("Error al guardar:", error);
      setNotice(`No se pudo guardar: ${error?.message ?? String(error)}`);
    }
  }

  // Cálculo visual inmediato de brillo y contraste sobre el lienzo
  const brightnessOverlayColor =
    brightness > 0
      ? `rgba(255, 255, 255, ${Math.min(0.65, brightness / 120)})`
      : brightness < 0
      ? `rgba(0, 0, 0, ${Math.min(0.65, Math.abs(brightness) / 120)})`
      : "transparent";

  const contrastOverlayColor =
    contrast > 0
      ? `rgba(255, 255, 255, ${Math.min(0.35, contrast / 220)})`
      : contrast < 0
      ? `rgba(128, 128, 128, ${Math.min(0.55, Math.abs(contrast) / 140)})`
      : "transparent";

  const scaleForRotation = angle !== 0 ? 0.92 : 1;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>DIGITALIZADOR</Text>
          <Text style={styles.title}>Restaurar apuntes</Text>
        </View>

        <Pressable style={styles.primary} onPress={openImage}>
          <Text style={styles.primaryText}>Abrir imagen</Text>
        </Pressable>

        <View
          ref={previewRef}
          collapsable={false}
          style={styles.preview}
          {...(panResponder.panHandlers as object)}
        >
          {imageUri ? (
            <View
              style={[
                styles.canvasStage,
                {
                  transform: [
                    { rotate: `${angle}deg` },
                    { scale: scaleForRotation },
                  ],
                },
              ]}
            >
              <Image
                source={{ uri: imageUri }}
                style={styles.image}
                resizeMode="contain"
              />
              {brightness !== 0 && (
                <View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: brightnessOverlayColor },
                  ]}
                />
              )}
              {contrast !== 0 && (
                <View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: contrastOverlayColor },
                  ]}
                />
              )}
            </View>
          ) : (
            <Text style={styles.placeholder}>Vista previa</Text>
          )}

          {points.length > 0 && (
            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
              {points.map((point, index) => (
                <Circle
                  key={`${point.x}-${point.y}-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={brushSize}
                  fill={eraseMode ? "#ffffff" : "rgba(49, 94, 251, 0.35)"}
                />
              ))}
            </Svg>
          )}
        </View>

        <Text style={styles.notice}>{notice}</Text>

        {imageUri && (
          <View style={styles.adjustments}>
            <View style={styles.adjustmentRow}>
              <Text style={styles.adjustmentLabel}>Brillo: {brightness}</Text>
              <Text style={styles.adjustmentLabel}>Contraste: {contrast}</Text>
              <Text style={styles.adjustmentLabel}>Giro: {angle}°</Text>
            </View>

            <View style={styles.adjustmentButtons}>
              <Pressable
                style={styles.action}
                onPress={() => setBrightness((v) => Math.max(-60, v - 10))}
              >
                <Text style={styles.actionText}>Brillo -</Text>
              </Pressable>
              <Pressable
                style={styles.action}
                onPress={() => setBrightness((v) => Math.min(60, v + 10))}
              >
                <Text style={styles.actionText}>Brillo +</Text>
              </Pressable>
              <Pressable
                style={styles.action}
                onPress={() => setContrast((v) => Math.max(-60, v - 10))}
              >
                <Text style={styles.actionText}>Contraste -</Text>
              </Pressable>
              <Pressable
                style={styles.action}
                onPress={() => setContrast((v) => Math.min(60, v + 10))}
              >
                <Text style={styles.actionText}>Contraste +</Text>
              </Pressable>
              <Pressable
                style={styles.action}
                onPress={() => setAngle((v) => v - 2)}
              >
                <Text style={styles.actionText}>Enderezar -</Text>
              </Pressable>
              <Pressable
                style={styles.action}
                onPress={() => setAngle((v) => v + 2)}
              >
                <Text style={styles.actionText}>Enderezar +</Text>
              </Pressable>
              <Pressable style={styles.action} onPress={() => rotate90(-90)}>
                <Text style={styles.actionText}>Girar -90°</Text>
              </Pressable>
              <Pressable style={styles.action} onPress={() => rotate90(90)}>
                <Text style={styles.actionText}>Girar +90°</Text>
              </Pressable>
              <Pressable
                style={[styles.action, styles.confirm]}
                onPress={autoEnhance}
              >
                <Text style={[styles.actionText, styles.confirmText]}>
                  Mejorar auto
                </Text>
              </Pressable>
              <Pressable
                style={styles.action}
                onPress={() =>
                  bakeCurrentView("Ajustes aplicados permanentemente a la hoja.")
                }
              >
                <Text style={styles.actionText}>Fijar ajustes</Text>
              </Pressable>
            </View>

            <View style={styles.adjustmentRow}>
              <Text style={styles.adjustmentLabel}>Goma: {brushSize}px</Text>
              <Pressable
                style={styles.smallBtn}
                onPress={() => setBrushSize((s) => Math.max(8, s - 6))}
              >
                <Text style={styles.actionText}>Goma -</Text>
              </Pressable>
              <Pressable
                style={styles.smallBtn}
                onPress={() => setBrushSize((s) => Math.min(48, s + 6))}
              >
                <Text style={styles.actionText}>Goma +</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.actions}>
          <Pressable
            style={[styles.action, styles.confirm]}
            onPress={applyErase}
            disabled={!imageUri || !points.length}
          >
            <Text style={[styles.actionText, styles.confirmText]}>
              Aplicar borrado
            </Text>
          </Pressable>
          <Pressable
            style={styles.action}
            onPress={undo}
            disabled={history.length < 2 && points.length === 0}
          >
            <Text style={styles.actionText}>Deshacer</Text>
          </Pressable>
          <Pressable
            style={styles.action}
            onPress={redoChange}
            disabled={!redo.length}
          >
            <Text style={styles.actionText}>Rehacer</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={reset} disabled={!imageUri}>
            <Text style={styles.actionText}>Inicio</Text>
          </Pressable>
          <Pressable
            style={[styles.action, styles.save]}
            onPress={save}
            disabled={!imageUri}
          >
            <Text style={[styles.actionText, styles.saveText]}>Guardar</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f4f7fb" },
  container: { minHeight: "100%", padding: 16, gap: 12 },
  header: { marginBottom: 4 },
  eyebrow: { color: "#65758b", fontSize: 12, letterSpacing: 1.5 },
  title: { color: "#172033", fontSize: 28, fontWeight: "800" },
  primary: {
    height: 48,
    borderRadius: 12,
    backgroundColor: "#315efb",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  preview: {
    minHeight: 420,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  canvasStage: {
    width: "100%",
    height: 420,
    alignItems: "center",
    justifyContent: "center",
  },
  image: { width: "100%", height: 420 },
  placeholder: { color: "#7a8699" },
  notice: { minHeight: 32, color: "#65758b", textAlign: "center" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  adjustments: {
    gap: 10,
    borderRadius: 12,
    backgroundColor: "#fff",
    padding: 10,
  },
  adjustmentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  adjustmentLabel: {
    flex: 1,
    color: "#65758b",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
  },
  adjustmentButtons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  smallBtn: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d3dae6",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  action: {
    flexGrow: 1,
    minWidth: 92,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d3dae6",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  actionText: { color: "#172033", fontWeight: "700", fontSize: 13 },
  save: { backgroundColor: "#172033", borderColor: "#172033" },
  saveText: { color: "#fff" },
  confirm: { backgroundColor: "#16866a", borderColor: "#16866a" },
  confirmText: { color: "#fff" },
});