import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
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

type Point = { x: number; y: number };
type HistoryItem = { uri: string; points: Point[]; brushSize: number };

export default function App() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [redo, setRedo] = useState<HistoryItem[]>([]);
  const [points, setPoints] = useState<Point[]>([]);
  const [brushSize, setBrushSize] = useState(18);
  const [candidate, setCandidate] = useState<HistoryItem | null>(null);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [angle, setAngle] = useState(0);
  const [notice, setNotice] = useState("Selecciona una imagen para comenzar.");

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        if (!imageUri) return;
        addPoint(event.nativeEvent.locationX, event.nativeEvent.locationY);
      },
      onPanResponderMove: (event) => {
        addPoint(event.nativeEvent.locationX, event.nativeEvent.locationY);
      },
    })
  ).current;

  function addPoint(x: number, y: number) {
    setPoints((items) => [...items, { x, y }]);
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
    setHistory([{ uri, points: [], brushSize }]);
    setRedo([]);
    setPoints([]);
    setNotice("Arrastra sobre el texto y pulsa Aplicar cambio.");
  }

  function undo() {
    if (candidate) {
      cancelChange();
      return;
    }
    if (history.length < 2) return;
    const current = history[history.length - 1];
    const previous = history[history.length - 2];
    setRedo((items) => [current, ...items]);
    setHistory((items) => items.slice(0, -1));
    setImageUri(previous.uri);
    setPoints([]);
  }

  function redoChange() {
    if (candidate) return;
    if (!redo.length) return;
    const next = redo[0];
    setHistory((items) => [...items, next]);
    setRedo((items) => items.slice(1));
    setImageUri(next.uri);
    setPoints(next.points);
  }

  function applyChange() {
    if (!imageUri || !points.length) {
      setNotice("Marca primero un área con el dedo.");
      return;
    }
    const item = { uri: imageUri, points: [...points], brushSize };
    setCandidate(item);
    setRedo([]);
    setNotice("Vista previa creada. Confirma o cancela el cambio.");
  }

  async function applyImageAdjustments() {
    if (!imageUri) {
      setNotice("Carga primero una imagen.");
      return;
    }

    const actions: ImageManipulator.Action[] = [];
    if (angle !== 0) actions.push({ rotate: angle });
    const result = await ImageManipulator.manipulateAsync(
      imageUri,
      actions,
      { compress: 1, format: ImageManipulator.SaveFormat.PNG }
    );
    const item = { uri: result.uri, points: [], brushSize };
    setCandidate(item);
    setNotice("Vista previa de ajustes creada.");
  }

  function confirmChange() {
    if (!candidate) return;
    setHistory((items) => [...items, candidate]);
    setImageUri(candidate.uri);
    setCandidate(null);
    setPoints([]);
    setNotice("Cambio confirmado.");
  }

  function cancelChange() {
    setCandidate(null);
    setPoints([]);
    setNotice("Vista previa cancelada.");
  }

  function reset() {
    if (!history.length) return;
    setImageUri(history[0].uri);
    setHistory([history[0]]);
    setRedo([]);
    setPoints([]);
    setNotice("Se volvió al archivo original.");
  }

  async function save() {
    if (!imageUri) return;
    const permission = await MediaLibrary.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permiso requerido", "Autoriza guardar en la galería.");
      return;
    }
    await MediaLibrary.saveToLibraryAsync(imageUri);
    setNotice("Imagen guardada en la galería.");
  }

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
          collapsable={false}
          style={styles.preview}
          {...(panResponder.panHandlers as object)}
        >
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
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
                  fill="rgba(255, 80, 80, 0.55)"
                />
              ))}
            </Svg>
          )}
        </View>

        <Text style={styles.notice}>{notice}</Text>

        {imageUri && (
          <View style={styles.adjustments}>
            <View style={styles.adjustmentRow}>
              <Text style={styles.adjustmentLabel}>Brillo {brightness}</Text>
              <Text style={styles.adjustmentLabel}>Contraste {contrast}</Text>
              <Text style={styles.adjustmentLabel}>Rotación {angle}°</Text>
            </View>
            <View style={styles.adjustmentButtons}>
              <Pressable style={styles.action} onPress={() => setBrightness((value) => value - 10)}>
                <Text style={styles.actionText}>Brillo -</Text>
              </Pressable>
              <Pressable style={styles.action} onPress={() => setBrightness((value) => value + 10)}>
                <Text style={styles.actionText}>Brillo +</Text>
              </Pressable>
              <Pressable style={styles.action} onPress={() => setContrast((value) => value - 10)}>
                <Text style={styles.actionText}>Contraste -</Text>
              </Pressable>
              <Pressable style={styles.action} onPress={() => setContrast((value) => value + 10)}>
                <Text style={styles.actionText}>Contraste +</Text>
              </Pressable>
              <Pressable style={styles.action} onPress={() => setAngle((value) => (value - 1 + 360) % 360)}>
                <Text style={styles.actionText}>Girar -</Text>
              </Pressable>
              <Pressable style={styles.action} onPress={() => setAngle((value) => (value + 1) % 360)}>
                <Text style={styles.actionText}>Girar +</Text>
              </Pressable>
              <Pressable style={[styles.action, styles.confirm]} onPress={applyImageAdjustments}>
                <Text style={[styles.actionText, styles.confirmText]}>Previsualizar ajustes</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.actions}>
          <Pressable
            style={[styles.action, styles.save]}
            onPress={applyChange}
            disabled={!imageUri || !points.length || !!candidate}
          >
            <Text style={[styles.actionText, styles.saveText]}>Aplicar cambio</Text>
          </Pressable>
          <Pressable
            style={[styles.action, styles.confirm]}
            onPress={confirmChange}
            disabled={!candidate}
          >
            <Text style={[styles.actionText, styles.confirmText]}>Confirmar</Text>
          </Pressable>
          <Pressable
            style={styles.action}
            onPress={cancelChange}
            disabled={!candidate}
          >
            <Text style={styles.actionText}>Cancelar</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={undo} disabled={history.length < 2}>
            <Text style={styles.actionText}>Deshacer</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={redoChange} disabled={!redo.length}>
            <Text style={styles.actionText}>Rehacer</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={reset} disabled={!imageUri}>
            <Text style={styles.actionText}>Inicio</Text>
          </Pressable>
          <Pressable style={[styles.action, styles.save]} onPress={save} disabled={!imageUri}>
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
  image: { width: "100%", height: 420 },
  placeholder: { color: "#7a8699" },
  notice: { minHeight: 40, color: "#65758b", textAlign: "center" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  adjustments: { gap: 8, borderRadius: 12, backgroundColor: "#fff", padding: 10 },
  adjustmentRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  adjustmentLabel: { flex: 1, color: "#65758b", textAlign: "center", fontSize: 12 },
  adjustmentButtons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
  },
  actionText: { color: "#172033", fontWeight: "700" },
  save: { backgroundColor: "#172033", borderColor: "#172033" },
  saveText: { color: "#fff" },
  confirm: { backgroundColor: "#16866a", borderColor: "#16866a" },
  confirmText: { color: "#fff" },
});
