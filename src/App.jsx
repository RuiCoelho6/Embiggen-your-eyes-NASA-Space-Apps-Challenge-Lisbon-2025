import { useEffect, useRef, useState } from "react";
import OpenSeadragon from "openseadragon";

const MIN_LEVEL = 1;

// Calcula o maxLevel baseado nas dimensões da imagem
function calculateMaxLevel(width, height, tileSize) {
  const maxDim = Math.max(width, height);
  // ceil(log2(maxDim / tileSize)) + 1 para ajustar ao start_level=1
  const maxLevel = Math.ceil(Math.log2(maxDim / tileSize)) + MIN_LEVEL;
  return maxLevel+8;
}

async function loadDzi(dataset) {
  const res = await fetch(`/assets/${dataset}/${dataset}.dzi`, { cache: "no-store" });
  if (!res.ok) throw new Error(`DZI não encontrado: ${dataset}`);

  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const image = doc.querySelector("Image");
  const size = doc.querySelector("Size");

  if (!image || !size) throw new Error("DZI inválido");

  const tileSize = parseInt(image.getAttribute("TileSize") || "256", 10);
  const overlap = parseInt(image.getAttribute("Overlap") || "0", 10);
  let format = (image.getAttribute("Format") || "jpg").toLowerCase();
  if (format === "jpeg") format = "jpg";

  const width = parseInt(size.getAttribute("Width"), 10);
  const height = parseInt(size.getAttribute("Height"), 10);

  // Calcula o maxLevel baseado nas dimensões reais
  const maxLevel = calculateMaxLevel(width, height, tileSize);

  return { width, height, tileSize, overlap, format, maxLevel };
}

export default function App() {
  const [dataset, setDataset] = useState("super-venus");
  const viewerEl = useRef(null);
  const osdRef = useRef(null);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      setErr("");
      setInfo("");

      try {
        const { width, height, tileSize, overlap, format, maxLevel } = await loadDzi(dataset);

        if (!alive) return;

        setInfo(`${width}×${height} | Níveis: ${MIN_LEVEL}-${maxLevel}`);

        // Destruir instância anterior
        if (osdRef.current) {
          try {
            osdRef.current.destroy();
          } catch {}
          osdRef.current = null;
        }

        // Tile source custom com maxLevel dinâmico
        const tileSource = {
          width,
          height,
          tileWidth: tileSize,
          tileHeight: tileSize,
          tileOverlap: overlap,
          minLevel: MIN_LEVEL,
          maxLevel: maxLevel, // Agora é calculado dinamicamente!
          getTileUrl(level, x, y) {
            return `/assets/${dataset}/tiles/${level}/${x}_${y}.${format}`;
          },
        };

        const viewer = OpenSeadragon({
          element: viewerEl.current,
          prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.1/images/",
          showNavigator: true,
          navigatorPosition: "BOTTOM_RIGHT",
          showZoomControl: true,
          showHomeControl: true,
          maxZoomPixelRatio: 2,
          minZoomLevel: 0.5,
          visibilityRatio: 1,
          tileSources: [tileSource],
        });

        viewer.addHandler("open-failed", (e) => {
          if (alive) setErr(`open-failed: ${e?.message || ""}`);
        });

        viewer.addHandler("tile-load-failed", (e) => {
          console.warn("tile-load-failed:", e.tile?.url);
        });

        if (alive) osdRef.current = viewer;

      } catch (e) {
        if (alive) setErr(String(e));
      }
    })();

    return () => {
      alive = false;
    };
  }, [dataset]);

  return (
    <div style={{ height: "100vh", width: "100vw", background: "#000" }}>
      <div style={hudStyle}>
        <label>
          Dataset:&nbsp;
          <select value={dataset} onChange={(e) => setDataset(e.target.value)}>
            <option value="super-venus">super-venus</option>
            <option value="galaxy">Galaxy</option>
            <option value="asteroid-psyche">asteroid-psyche</option>
          </select>
        </label>
        {info && <span style={{ color: "#8f8", marginLeft: 12, fontSize: 12 }}>{info}</span>}
        {err && <span style={{ color: "#f55", marginLeft: 12 }}>{err}</span>}
      </div>
      <div ref={viewerEl} id="osd" style={{ height: "100%", width: "100%" }} />
    </div>
  );
}

const hudStyle = {
  position: "absolute",
  zIndex: 10,
  top: 12,
  left: 12,
  background: "rgba(20,20,20,.85)",
  padding: "8px 12px",
  borderRadius: 8,
  color: "#fff",
  border: "1px solid rgba(255,255,255,.15)",
  backdropFilter: "blur(8px)",
};
